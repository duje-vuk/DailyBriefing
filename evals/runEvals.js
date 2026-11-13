require('dotenv').config();
const { buildBriefingMessages, readBriefingText } = require('../briefing');

const sampleSources = [
  { source: 'BBC World', title: 'EU leaders agree new sanctions package against Russia' },
  { source: 'Al Jazeera', title: 'Ceasefire talks resume in Cairo as aid convoys stall' },
  { source: 'Guardian Business', title: 'Bank of England holds interest rates at 4%' },
  { source: 'Ars Technica', title: 'Open-weight model beats GPT-class rivals on coding benchmark' },
  { source: 'The Verge', title: 'Celebrity couple announce surprise wedding in Malibu' },
  { source: 'DW', title: 'Germany passes law to speed up renewable energy permits' },
  { source: 'Hacker News', title: 'Show HN: I built a tiny Lisp in a weekend' },
  { source: 'Hugging Face', title: 'New multilingual speech model released under Apache 2.0' },
];

const results = [];

function check(name, passed, detail = '') {
  results.push(passed);
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name} ${detail}`);
}

async function main() {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'qwen/qwen3.6-27b',
      messages: buildBriefingMessages(sampleSources),
      temperature: 0.3,
      reasoning_effort: 'none',
      max_tokens: 3000,
    }),
  });

  if (!response.ok) {
    console.log(`Groq request failed (${response.status}): ${await response.text()}`);
    process.exit(1);
  }

  const briefing = readBriefingText(await response.json()) || '';
  const citedNumbers = [...briefing.matchAll(/\[(\d+(?:,\s*\d+)*)\]/g)]
    .flatMap((match) => match[1].split(/,\s*/).map(Number));

  check('has markdown sections', /^## /m.test(briefing));
  check('contains no thinking text', !briefing.includes('<think>'));
  check('cites at least 4 sources', new Set(citedNumbers).size >= 4, `(cited ${new Set(citedNumbers).size})`);
  check('only cites sources that exist', citedNumbers.every((number) => number >= 1 && number <= sampleSources.length));
  check('skips celebrity gossip', !citedNumbers.includes(5) && !/wedding/i.test(briefing));

  const passedCount = results.filter(Boolean).length;
  console.log(`\n${passedCount}/${results.length} checks passed`);
  process.exit(passedCount === results.length ? 0 : 1);
}

main();
