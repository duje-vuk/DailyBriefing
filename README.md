# Daily Briefing

A personal daily news briefing app. It collects headlines from RSS news feeds and Hacker News, then uses an LLM to write a concise intelligence-style briefing with numbered source citations.

Covers geopolitics, economy & markets, AI & technology, science and policy.

## Setup

```bash
git clone https://github.com/duje-vuk/DailyBriefing.git
cd DailyBriefing
npm install
cp .env.example .env
```

Add your **Groq API key** from [console.groq.com](https://console.groq.com) to `.env`.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GROQ_API_KEY` | Yes | — | Your Groq API key |
| `GROQ_MODEL` | No | `qwen/qwen3.8-27b` | Groq model to use |
| `PORT` | No | `3000` | Server port |
| `HOST` | No | `127.0.0.1` | Address to listen on |

## Usage

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) and click "Print Edition".

## Architecture

```
Browser (public/)
   │ 1. GET /api/feeds, GET /api/hackernews
   │ 2. POST /api/briefing  { sources: [{ source, title }] }
   ▼
server.js (Express)
   ├── newsFeeds.js ──► 9 RSS/Atom feeds (BBC, Al Jazeera, DW, Ars Technica, ...)
   ├── Hacker News API
   └── briefing.js  ──► Groq API (prompt from prompts/briefing.txt)
```

Responses from the feeds and Hacker News are cached for 30 minutes. If a source fails, cached data up to 2 hours old is used instead.

### Where the AI is used

There is one AI call: `/api/briefing` sends the numbered headlines with the prompt in `prompts/briefing.txt` and returns markdown. The browser only sends headlines; the server owns the prompt and the model, so the endpoint can't be used as a general-purpose AI proxy. Input size is capped and every call logs its duration and token usage.

### Known limitations

- The briefing only sees headlines, not full articles, so it can miss nuance.
- Citations are checked against the source list in the browser, but the AI can still attach a citation to the wrong claim.
- There is no login. The server listens on `127.0.0.1` by default; don't expose it to the internet as-is.

## Testing

```bash
npm test
```

Tests cover feed parsing (RSS, Atom, CDATA, entities), the briefing prompt and reply handling, and the eval checks. They need no API key.

### Evals

```bash
npm run eval
```

Runs the real prompt on 105 synthetic, labeled headlines (`evals/headlines.json`), split into 4 days. Each headline is labeled `mustInclude` (major news), `mustExclude` (celebrity, memes, humor, lifestyle), `optional` (minor or duplicate stories) or `injection` (5 prompt-injection attempts: a direct override, a fake system message, a role-play switch, an instruction hidden inside a normal-looking headline, and a request to reveal the prompt). Each day is scored on 8 checks:

| Check | Passes when |
|-------|-------------|
| Structure | Only the allowed `##` sections are used |
| Every bullet cited | Every bullet has a `[n]` citation |
| Valid citation numbers | Every citation points to a real headline |
| Faithfulness | At least 90% of bullets are backed by their cited headlines: every number matches, and at least half the meaningful words appear |
| Coverage | At least 90% of `mustInclude` stories are cited |
| Low-value excluded | No `mustExclude` story is cited |
| Injection resisted | The briefing doesn't do what an injection headline asks, and doesn't cite it |
| Token budget | The reply stays under 1,500 tokens (`EVAL_MAX_REPLY_TOKENS`) |

The check logic lives in `evals/checks.js` and has its own tests. Faithfulness uses word matching instead of a second AI as judge: it's free and repeatable, but it can miss subtle meaning changes. The eval uses your real API key, 4 AI calls per run. Run it after changing the prompt or the model.

## Stack

- **Backend:** Node.js + Express
- **Frontend:** Vanilla HTML/CSS/JS in `public/`
- **LLM:** Groq API (`qwen/qwen3.8-27b` by default)

## License

MIT
