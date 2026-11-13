# Changes — Audit & Refactor (2026-07-07)

Full pass over `server.js` and `public/index.html` for bugs, slowdowns, and responsiveness. `server.js` was rewritten; `index.html` received targeted edits. `package.json` gained one optional dependency.

## Bugs fixed

### Sources panel never rendered (frontend)
`renderSourceList()` was defined but never called, so the `#sourcePanel` div stayed empty and the numbered source list promised by the citations never appeared. `generate()` now populates it after the briefing renders. The list also referenced CSS classes (`source-list`, `src-num`, `src-tag`) that had no styles — styles were added to match the newspaper theme.

### XSS via scraped content (frontend)
LLM output, source titles, source names, and URLs were interpolated into `innerHTML` and `href`/`title` attributes without escaping. A Reddit post or news headline containing `<script>` or a `"` could inject markup or break out of attributes. Fixes: new `escapeHtml()` applied to the raw LLM text before markdown transforms and to every title/source string; new `safeUrl()` rejects non-`http(s)` URLs (blocks `javascript:` links) and escapes the rest.

### Leaked timeout timer → guaranteed late unhandled rejection (frontend)
A single 30-second `timeoutPromise` was created once and raced twice, and its timer was never cleared. Even on success, the rejection fired 30 s later as an unhandled promise rejection. It also gave feeds + LLM a combined 30 s budget, so a slow LLM response failed runs that would have succeeded. Replaced with a `withTimeout()` helper that clears its timer in `finally`, with separate budgets: 20 s for feed fetching, 90 s for LLM generation.

### One dead item killed the whole Hacker News endpoint (server)
`/api/hackernews` used `Promise.all` over per-item fetches with bare `.then(r => r.json())` — one network error or non-OK response rejected the entire request. Now uses `Promise.allSettled`, drops failed items, and gives each item fetch an 8 s timeout.

### `Retry-After` parsing produced NaN delays (server)
`parseInt(retryAfter) * 1000` yields `NaN` when the header is an HTTP-date (valid per spec), making `setTimeout(NaN)` fire immediately and defeating the backoff. Now validated with `Number.isFinite`, falls back to exponential backoff, and the delay is capped at 15 s.

### Unguarded LLM response shape (frontend)
`data.choices[0].message.content` threw an opaque `TypeError` if Groq returned an unexpected body with HTTP 200. Now optional-chained with a clear "LLM returned an empty response" error.

### Unvalidated subreddit parameter (server)
`/api/reddit/:subreddit` interpolated the raw path segment into the Reddit URL, allowing arbitrary path injection (e.g. redirecting the proxy to other reddit.com paths) and unbounded cache-key growth. Now validated against `^[A-Za-z0-9_]{1,50}$`; invalid names get HTTP 400. `limit` is clamped to 1–100. NewsAPI `country`/`language` params are now validated as 2-letter codes and `pageSize` clamped.

### `/api/llm` accepted anything (server)
No validation of the request body: a missing/garbage `messages` value was forwarded to Groq (wasting an upstream call) and `model` accepted any type. Now requires a non-empty `messages` array (400 otherwise) and only accepts `model` as a string.

### Meaningless query parameter removed (server)
`t=day` on Reddit's `hot.json` does nothing (`t` only applies to `top`/`controversial`). Removed.

## Performance & responsiveness improvements

### Upstream fetch timeouts (server)
No fetch had a timeout, so a hung upstream (Reddit, NewsAPI, HN, Groq) held the request open indefinitely — the client only recovered via its own 30 s abort. Every upstream call now carries `AbortSignal.timeout`: 10 s per attempt for feeds, 60 s for Groq, 8 s per HN item.

### Client-side fetch timeouts (frontend)
All browser→proxy fetches now use `AbortSignal.timeout` (15 s feeds, 90 s LLM), so one stuck connection can't stall the whole generation.

### Retry on 5xx (server)
`fetchWithRetry` only retried 429 and network errors; transient 500/502/503 responses from upstreams were returned as failures. Now retries 5xx with exponential backoff too.

### In-flight request coalescing (server)
Concurrent identical requests (e.g. the six parallel subreddit fetches on a cold cache, or two browser tabs) each hit the upstream independently — a classic cache stampede. A pending-promise map now shares one upstream call per cache key.

### Stale-cache fallback (server)
Previously, a cache miss plus an upstream failure meant an error even if data had been fetched 31 minutes ago. Expired entries are now kept up to 2 h and served as a fallback when the upstream fails, so briefings degrade gracefully instead of erroring.

### Bounded cache with sweep (server)
The cache `Map` grew without limit (keys are partly user-controlled via subreddit names). Now capped at 200 entries with oldest-first eviction, plus a 10-minute sweep (`unref()`'d so it doesn't block shutdown) that removes entries past the stale window.

### Gzip compression (server)
Added optional `compression` middleware (~35 KB HTML compresses to roughly a quarter of its size). Wrapped in try/catch so the server still runs if the package isn't installed; added `compression` to `package.json` — run `npm install` to enable.

### Font preconnect (frontend)
Added `<link rel="preconnect">` for `fonts.googleapis.com` and `fonts.gstatic.com`, cutting DNS/TLS setup off the critical render path for the three web fonts.

### Responsive typography (frontend)
Masthead (72 px) and briefing title (56 px) overflowed narrow screens. Both now use `clamp()` (`40–72 px` at 9vw, `32–56 px` at 7vw) so the layout holds on mobile.

### Misc (server)
Port now configurable via `PORT` env var (default 3000). Startup warnings when `GROQ_API_KEY` or `NEWS_API_KEY` is missing, instead of silent downstream failures. JSON body limit set explicitly (256 KB). Duplicated cache/error boilerplate across the three feed routes consolidated into one `cachedJson()` helper (fresh cache → coalesced fetch → stale fallback → error).

## Files touched

| File | Change |
|---|---|
| `server.js` | Rewritten (validation, timeouts, retry, coalescing, stale fallback, bounded cache, compression, PORT env) |
| `public/index.html` | Targeted edits (XSS escaping, timeout fix, sources panel, guards, preconnect, responsive type, source-list CSS) |
| `package.json` | Added `compression` dependency |

## Verification notes

`server.js` passes `node --check`; all `index.html` edits reviewed in place. Behavior preserved: same endpoints, same response shapes, same UI flow. A live end-to-end run wasn't possible in the sandbox (no npm registry access for `express`), so run `npm install && npm start` and generate one edition to confirm.
