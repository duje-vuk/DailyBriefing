require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

const GROQ_KEY = process.env.GROQ_API_KEY;
const NEWS_KEY = process.env.NEWS_API_KEY;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── PROXY: Reddit ──
app.get('/api/reddit/:subreddit', async (req, res) => {
  const { subreddit } = req.params;
  const limit = req.query.limit || 20;
  try {
    const r = await fetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}&t=day`, {
      headers: { 'User-Agent': 'DailyBriefing/1.0' }
    });
    if (!r.ok) return res.status(r.status).json({ error: 'Reddit error' });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PROXY: NewsAPI ──
app.get('/api/news', async (req, res) => {
  const { country, language, pageSize } = req.query;
  let url = `https://newsapi.org/v2/top-headlines?pageSize=${pageSize || 20}&apiKey=${NEWS_KEY}`;
  if (country) url += `&country=${country}`;
  if (language) url += `&language=${language}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return res.status(r.status).json({ error: 'NewsAPI error' });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PROXY: Groq ──
app.post('/api/llm', async (req, res) => {
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
