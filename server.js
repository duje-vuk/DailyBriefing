require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

const GROQ_KEY = process.env.GROQ_API_KEY;
const NEWS_KEY = process.env.NEWS_API_KEY;

// ── CACHE ──
const cache = new Map();
const CACHE_TTL = 30 * 60 * 1000;

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

// ── RETRY ──
async function fetchWithRetry(url, options = {}, { maxRetries = 3, baseDelay = 1000 } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const r = await fetch(url, options);
      if (r.status === 429 && attempt < maxRetries) {
        const retryAfter = r.headers.get('retry-after');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      return r;
    } catch (e) {
      if (attempt === maxRetries) throw e;
      await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, attempt)));
    }
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── PROXY: Reddit ──
app.get('/api/reddit/:subreddit', async (req, res) => {
  const { subreddit } = req.params;
  const limit = req.query.limit || 20;
  const key = `reddit:${subreddit}:${limit}`;
  const cached = getCached(key);
  if (cached) return res.json(cached);
  try {
    const r = await fetchWithRetry(`https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}&t=day`, {
      headers: { 'User-Agent': 'DailyBriefing/1.0' }
    });
    if (!r.ok) return res.status(r.status).json({ error: 'Reddit error' });
    const data = await r.json();
    setCache(key, data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PROXY: NewsAPI ──
app.get('/api/news', async (req, res) => {
  const { country, language, pageSize } = req.query;
  const key = `news:${language || ''}:${country || ''}:${pageSize || 20}`;
  const cached = getCached(key);
  if (cached) return res.json(cached);
  let url = `https://newsapi.org/v2/top-headlines?pageSize=${pageSize || 20}&apiKey=${NEWS_KEY}`;
  if (country) url += `&country=${country}`;
  if (language) url += `&language=${language}`;
  try {
    const r = await fetchWithRetry(url);
    if (!r.ok) return res.status(r.status).json({ error: 'NewsAPI error' });
    const data = await r.json();
    setCache(key, data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PROXY: Hacker News ──
app.get('/api/hackernews', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 30);
  const key = `hn:top:${limit}`;
  const cached = getCached(key);
  if (cached) return res.json(cached);
  try {
    const idsRes = await fetchWithRetry('https://hacker-news.firebaseio.com/v0/topstories.json');
    if (!idsRes.ok) return res.status(idsRes.status).json({ error: 'HN error' });
    const ids = await idsRes.json();
    const items = await Promise.all(
      ids.slice(0, limit).map(id =>
        fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(r => r.json())
      )
    );
    const data = items.filter(Boolean).map(i => ({
      id: i.id,
      title: i.title,
      url: i.url || `https://news.ycombinator.com/item?id=${i.id}`,
      score: i.score,
      by: i.by,
      descendants: i.descendants || 0,
    }));
    setCache(key, data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PROXY: Groq ──
app.post('/api/llm', async (req, res) => {
  try {
    const r = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`
      },
      body: JSON.stringify({
        model: req.body.model || 'llama-3.3-70b-versatile',
        messages: req.body.messages,
        temperature: 0.3,
        max_tokens: 3000
      })
    });
    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).send(err);
    }
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(3000, () => {
  console.log('\n  ✓ Daily Briefing running at http://localhost:3000\n');
});
