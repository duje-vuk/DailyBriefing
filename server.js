require('dotenv').config();
const express = require('express');
const path = require('path');
const { newsFeeds, parseFeed } = require('./newsFeeds');
const { cleanSources, buildBriefingMessages, readBriefingText, maxSources } = require('./briefing');

const app = express();

const port = process.env.PORT || 3000;
const host = process.env.HOST || '127.0.0.1';
const groqApiKey = process.env.GROQ_API_KEY;
const groqModel = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';

if (!groqApiKey) {
  console.warn('  ! GROQ_API_KEY missing — briefings will fail');
}

app.use(require('compression')());

const oneMinute = 60 * 1000;
const cacheFreshTime = 30 * oneMinute;
const cacheMaxAge = 120 * oneMinute;
const cacheMaxEntries = 200;

const cache = new Map();

function getFromCache(key, allowStale = false) {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  const age = Date.now() - entry.savedAt;
  if (age <= cacheFreshTime) {
    return entry.data;
  }
  if (allowStale && age <= cacheMaxAge) {
    return entry.data;
  }
  return null;
}

function saveToCache(key, data) {
  const cacheIsFull = cache.size >= cacheMaxEntries;
  if (cacheIsFull && !cache.has(key)) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  cache.set(key, { data: data, savedAt: Date.now() });
}

function removeOldCacheEntries() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.savedAt > cacheMaxAge) {
      cache.delete(key);
    }
  }
}

setInterval(removeOldCacheEntries, 10 * oneMinute).unref();

const requestsInProgress = new Map();

function runOnce(key, getData) {
  if (requestsInProgress.has(key)) {
    return requestsInProgress.get(key);
  }

  const promise = Promise.resolve()
    .then(getData)
    .finally(() => requestsInProgress.delete(key));

  requestsInProgress.set(key, promise);
  return promise;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getRetryDelay(response, attempt, baseDelay) {
  const retryAfterSeconds = Number(response.headers.get('retry-after'));

  let delay;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    delay = retryAfterSeconds * 1000;
  } else {
    delay = baseDelay * 2 ** attempt;
  }

  return Math.min(delay, 15000);
}

async function fetchWithRetry(url, options = {}, retrySettings = {}) {
  const maxRetries = retrySettings.maxRetries ?? 3;
  const baseDelay = retrySettings.baseDelay ?? 1000;
  const timeout = retrySettings.timeout ?? 10000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });

      const shouldRetry = response.status === 429 || response.status >= 500;
      const hasRetriesLeft = attempt < maxRetries;

      if (shouldRetry && hasRetriesLeft) {
        await wait(getRetryDelay(response, attempt, baseDelay));
        continue;
      }

      return response;
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      await wait(baseDelay * 2 ** attempt);
    }
  }
}

async function sendCachedJson(res, key, getData) {
  const freshData = getFromCache(key);
  if (freshData) {
    return res.json(freshData);
  }

  try {
    const data = await runOnce(key, getData);
    saveToCache(key, data);
    res.json(data);
  } catch (error) {
    const staleData = getFromCache(key, true);
    if (staleData) {
      return res.json(staleData);
    }
    res.status(error.status || 500).json({ error: error.message || 'Upstream error' });
  }
}

function makeUpstreamError(message, status) {
  const error = new Error(message);
  if (status >= 400 && status < 600) {
    error.status = status;
  } else {
    error.status = 502;
  }
  return error;
}

function readInteger(value, defaultValue) {
  return parseInt(value, 10) || defaultValue;
}

function keepBetween(number, smallest, largest) {
  return Math.min(Math.max(number, smallest), largest);
}

app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function fetchOneFeed(feed, itemsPerFeed) {
  const response = await fetchWithRetry(
    feed.url,
    { headers: { 'User-Agent': 'DailyBriefing/1.0' } },
    { maxRetries: 1, timeout: 6000 }
  );
  if (!response.ok) {
    throw makeUpstreamError(`${feed.name} feed error`, response.status);
  }
  const xmlText = await response.text();
  return parseFeed(xmlText, feed.name, itemsPerFeed);
}

app.get('/api/feeds', async (req, res) => {
  const itemsPerFeed = keepBetween(readInteger(req.query.limit, 6), 1, 20);
  const cacheKey = `feeds:${itemsPerFeed}`;

  await sendCachedJson(res, cacheKey, async () => {
    const results = await Promise.allSettled(
      newsFeeds.map((feed) => fetchOneFeed(feed, itemsPerFeed))
    );

    const allItems = [];
    results.forEach((result, position) => {
      if (result.status === 'fulfilled') {
        allItems.push(...result.value);
      } else {
        console.warn(`${newsFeeds[position].name} feed failed:`, result.reason.message);
      }
    });

    if (allItems.length === 0) {
      throw makeUpstreamError('All news feeds failed', 502);
    }
    return allItems;
  });
});

async function fetchHackerNewsStory(storyId) {
  const url = `https://hacker-news.firebaseio.com/v0/item/${storyId}.json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    return null;
  }
  return response.json();
}

app.get('/api/hackernews', async (req, res) => {
  const limit = Math.min(readInteger(req.query.limit, 20), 30);
  const cacheKey = `hn:top:${limit}`;

  await sendCachedJson(res, cacheKey, async () => {
    const idsResponse = await fetchWithRetry('https://hacker-news.firebaseio.com/v0/topstories.json');
    if (!idsResponse.ok) {
      throw makeUpstreamError('HN error', idsResponse.status);
    }

    const allStoryIds = await idsResponse.json();
    const storyIds = allStoryIds.slice(0, limit);

    const results = await Promise.allSettled(storyIds.map(fetchHackerNewsStory));

    const stories = [];
    for (const result of results) {
      if (result.status !== 'fulfilled' || !result.value) {
        continue;
      }

      const story = result.value;
      stories.push({
        source: 'Hacker News',
        title: story.title,
        url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
      });
    }
    return stories;
  });
});

async function askGroqForBriefing(messages) {
  const startTime = Date.now();
  const response = await fetchWithRetry(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: groqModel,
        messages: messages,
        temperature: 0.3,
        reasoning_effort: 'none',
        max_tokens: 3000,
      }),
    },
    { maxRetries: 2, timeout: 60000 }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.warn(`AI call 'briefing' failed (${response.status}): ${errorText.slice(0, 200)}`);
    throw makeUpstreamError(`AI service error (${response.status})`, response.status);
  }

  const groqReply = await response.json();
  const secondsTaken = ((Date.now() - startTime) / 1000).toFixed(1);
  const usage = groqReply.usage;
  if (usage) {
    console.log(`AI call 'briefing': ${secondsTaken}s, ${usage.prompt_tokens} prompt tokens, ${usage.completion_tokens} reply tokens`);
  }

  return groqReply;
}

app.post('/api/briefing', async (req, res) => {
  const body = req.body || {};
  const sources = cleanSources(body.sources);
  if (!sources) {
    return res.status(400).json({ error: `sources must be a list of 1-${maxSources} items` });
  }

  try {
    const groqReply = await askGroqForBriefing(buildBriefingMessages(sources));
    const briefing = readBriefingText(groqReply);
    if (!briefing) {
      return res.status(502).json({ error: 'The AI returned an empty briefing.' });
    }
    res.json({ briefing: briefing });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.listen(port, host, () => {
  console.log(`\n  ✓ Daily Briefing running at http://${host}:${port}\n`);
});
