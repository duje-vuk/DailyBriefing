require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;
const GROQ_KEY = process.env.GROQ_API_KEY;
const NEWS_KEY = process.env.NEWS_API_KEY;

if (!GROQ_KEY) console.warn('  ! GROQ_API_KEY missing — /api/llm will fail');
if (!NEWS_KEY) console.warn('  ! NEWS_API_KEY missing — /api/news will fail');

// Optional gzip compression (run `npm install` to enable)
try { app.use(require('compression')()); } catch { /* compression not installed — skipping */ }

// ── CACHE (TTL + bounded size + stale fallback) ──
const cache = new Map();
const CACHE_TTL = 30 * 60 * 1000;      // fresh window
const CACHE_STALE = 2 * 60 * 60 * 1000; // stale entries kept as fallback for upstream failures
const CACHE_MAX = 200;                  // hard cap — subreddit names are user-controlled

function getCached(key, { allowStale = false } = {}) {
  const entry = cache.get(key);
  if (!entry) return null;
  const age = Date.now() - entry.ts;
  if (age <= CACHE_TTL) return entry.data;
  if (allowStale && age <= CACHE_STALE) return entry.data;
  return null;
}

function setCache(key, data) {
  if (cache.size >= CACHE_MAX && !cache.has(key)) {
    // Map iterates in insertion order — evict oldest inserted
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, { data, ts: Date.now() });
}

// Periodic sweep so expired entries don't linger forever
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of cache) if (now - e.ts > CACHE_STALE) cache.delete(k);
}, 10 * 60 * 1000).unref();

// ── IN-FLIGHT COALESCING (prevents cache stampede) ──
const inflight = new Map();
function coalesce(key, fn) {
  if (inflight.has(key)) return inflight.get(key);
  const p = Promise.resolve().then(fn).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── RETRY (429 + 5xx, exponential backoff, per-attempt timeout) ──
async function fetchWithRetry(url, options = {}, { maxRetries = 3, baseDelay = 1000, timeout = 10000 } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const r = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });
      if ((r.status === 429 || r.status >= 500) && attempt < maxRetries) {
        const ra = Number(r.headers.get('retry-after')); // NaN if absent or an HTTP-date
        const delay = Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : baseDelay * 2 ** attempt, 15000);
        await sleep(delay);
        continue;
      }
      return r;
    } catch (e) {
      if (attempt === maxRetries) throw e;
      await sleep(baseDelay * 2 ** attempt);
    }
  }
}

// Shared handler: fresh cache → coalesced upstream fetch → stale fallback on failure
async function cachedJson(res, key, producer) {
  const fresh = getCached(key);
  if (fresh) return res.json(fresh);
  try {
    const data = await coalesce(key, producer);
    setCache(key, data);
    res.json(data);
  } catch (e) {
    const stale = getCached(key, { allowStale: true });
    if (stale) return res.json(stale);
    res.status(e.status || 500).json({ error: e.message || 'Upstream error' });
  }
}

function upstreamError(msg, status) {
  const e = new Error(msg);
  e.status = status >= 400 && status < 600 ? status : 502;
  return e;
}

app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── PROXY: Reddit ──
app.get('/api/reddit/:subreddit', async (req, res) => {
  const { subreddit } = req.params;
  if (!/^[A-Za-z0-9_]{1,50}$/.test(subreddit)) {
    return res.status(400).json({ error: 'Invalid subreddit name' });
  }
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const key = `reddit:${subreddit.toLowerCase()}:${limit}`;
  await cachedJson(res, key, async () => {
    const r = await fetchWithRetry(`https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}`, {
      headers: { 'User-Agent': 'DailyBriefing/1.0' }
    });
    if (!r.ok) throw upstreamError('Reddit error', r.status);
    return r.json();
  });
});

// ── PROXY: NewsAPI ──
app.get('/api/news', async (req, res) => {
  const country = /^[a-z]{2}$/i.test(req.query.country || '') ? req.query.country.toLowerCase() : '';
  const language = /^[a-z]{2}$/i.test(req.query.language || '') ? req.query.language.toLowerCase() : '';
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 1), 100);
  const key = `news:${language}:${country}:${pageSize}`;
  await cachedJson(res, key, async () => {
    let url = `https://newsapi.org/v2/top-headlines?pageSize=${pageSize}&apiKey=${NEWS_KEY}`;
    if (country) url += `&country=${country}`;
    if (language) url += `&language=${language}`;
    const r = await fetchWithRetry(url);
    if (!r.ok) throw upstreamError('NewsAPI error', r.status);
    return r.json();
  });
});

// ── PROXY: Hacker News ──
app.get('/api/hackernews', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 30);
  const key = `hn:top:${limit}`;
  await cachedJson(res, key, async () => {
    const idsRes = await fetchWithRetry('https://hacker-news.firebaseio.com/v0/topstories.json');
    if (!idsRes.ok) throw upstreamError('HN error', idsRes.status);
    const ids = await idsRes.json();
    // allSettled: one dead item no longer kills the whole endpoint
    const settled = await Promise.allSettled(
      ids.slice(0, limit).map(id =>
        fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { signal: AbortSignal.timeout(8000) })
          .then(r => (r.ok ? r.json() : null))
      )
    );
    return settled
      .filter(s => s.status === 'fulfilled' && s.value)
      .map(({ value: i }) => ({
        id: i.id,
        title: i.title,
        url: i.url || `https://news.ycombinator.com/item?id=${i.id}`,
        score: i.score,
        by: i.by,
        descendants: i.descendants || 0,
      }));
  });
});

// ── PROXY: Groq ──
app.post('/api/llm', async (req, res) => {
  const { messages, model } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }
  try {
    const r = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`
      },
      body: JSON.stringify({
        model: typeof model === 'string' ? model : 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.3,
        max_tokens: 3000
      })
    }, { maxRetries: 2, timeout: 60000 });
    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).send(err);
    }
    res.json(await r.json());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n  ✓ Daily Briefing running at http://localhost:${PORT}\n`);
});
