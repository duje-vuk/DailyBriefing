# Daily Briefing

A personal daily news briefing app that aggregates Reddit posts and news headlines, then uses an LLM to generate a concise intelligence-style briefing.

Features a global briefing plus country-specific sections for the Netherlands and Croatia.

## Stack

- **Backend:** Node.js + Express (proxy for Reddit, NewsAPI, Groq)
- **Frontend:** Single-page HTML/CSS/JS
- **LLM:** Groq API (Llama 3.3 70B)

## Setup

```bash
git clone <repo-url>
cd daily-briefing
npm install
```

Copy the example env file and fill in your API keys:

```bash
cp .env.example .env
```

You'll need:
- **Groq API key** from [console.groq.com](https://console.groq.com)
- **NewsAPI key** from [newsapi.org](https://newsapi.org)

## Usage

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) and click "Generate Briefing".

## License

MIT
