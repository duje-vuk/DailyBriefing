require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();

const port = process.env.PORT || 3000;
const groqApiKey = process.env.GROQ_API_KEY;
const newsApiKey = process.env.NEWS_API_KEY;

if (!groqApiKey) {
  console.warn('  ! GROQ_API_KEY missing — /api/llm will fail');
}
if (!newsApiKey) {
  console.warn('  ! NEWS_API_KEY missing — /api/news will fail');
}

try {
  const compression = require('compression');
  app.use(compression());
} catch {
}

const oneMinute = 60 * 1000;
const cacheFreshTime = 30 * oneMinute;
const cacheStaleTime = 120 * oneMinute;
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
  if (allowStale && age <= cacheStaleTime) {
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
    if (now - entry.savedAt > cacheStaleTime) {
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

function readTwoLetterCode(value) {
  if (/^[a-z]{2}$/i.test(value || '')) {
    return value.toLowerCase();
  }
  return '';
}

app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/reddit/:subreddit', async (req, res) => {
  const subreddit = req.params.subreddit;

  const isValidName = /^[A-Za-z0-9_]{1,50}$/.test(subreddit);
  if (!isValidName) {
    return res.status(400).json({ error: 'Invalid subreddit name' });
  }

  const limit = keepBetween(readInteger(req.query.limit, 20), 1, 100);
  const cacheKey = `reddit:${subreddit.toLowerCase()}:${limit}`;

  await sendCachedJson(res, cacheKey, async () => {
    const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}`;
    const response = await fetchWithRetry(url, {
      headers: { 'User-Agent': 'DailyBriefing/1.0' },
    });

    if (!response.ok) {
      throw makeUpstreamError('Reddit error', response.status);
    }
    return response.json();
  });
});

app.get('/api/news', async (req, res) => {
  const country = readTwoLetterCode(req.query.country);
  const language = readTwoLetterCode(req.query.language);
  const pageSize = keepBetween(readInteger(req.query.pageSize, 20), 1, 100);
  const cacheKey = `news:${language}:${country}:${pageSize}`;

  await sendCachedJson(res, cacheKey, async () => {
    let url = `https://newsapi.org/v2/top-headlines?pageSize=${pageSize}&apiKey=${newsApiKey}`;
    if (country) {
      url += `&country=${country}`;
    }
    if (language) {
      url += `&language=${language}`;
    }

    const response = await fetchWithRetry(url);
    if (!response.ok) {
      throw makeUpstreamError('NewsAPI error', response.status);
    }
    return response.json();
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
        id: story.id,
        title: story.title,
        url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
        score: story.score,
        by: story.by,
        descendants: story.descendants || 0,
      });
    }
    return stories;
  });
});

app.post('/api/llm', async (req, res) => {
  const body = req.body || {};
  const messages = body.messages;
  const model = body.model;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  let chosenModel = 'qwen/qwen3.6-27b';
  if (typeof model === 'string') {
    chosenModel = model;
  }

  try {
    const response = await fetchWithRetry(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model: chosenModel,
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
      return res.status(response.status).send(errorText);
    }

    res.json(await response.json());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`\n  ✓ Daily Briefing running at http://localhost:${port}\n`);
});
