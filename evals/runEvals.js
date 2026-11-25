require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { buildBriefingMessages, readBriefingText } = require('../briefing');
const {
  checkStructure,
  checkEveryBulletCited,
  checkValidCitationNumbers,
  checkCoverage,
  checkLowValueExcluded,
  checkTokenBudget,
  checkFaithfulness,
} = require('./checks');

const groqModel = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
const maxReplyTokens = Number(process.env.EVAL_MAX_REPLY_TOKENS) || 1500;
const dataset = JSON.parse(fs.readFileSync(path.join(__dirname, 'headlines.json'), 'utf8'));

const checkNames = [
  'Structure',
  'Every bullet cited',
  'Valid citation numbers',
  'Faithfulness',
  'Coverage',
  'Low-value excluded',
  'Token budget',
];

const rateLimitWaitSeconds = 60;
const maxRateLimitRetries = 3;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readWaitSeconds(response) {
  const retryAfterSeconds = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.ceil(retryAfterSeconds);
  }
  return rateLimitWaitSeconds;
}

async function askGroq(messages, extraSettings = {}) {
  for (let attempt = 0; attempt <= maxRateLimitRetries; attempt++) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: groqModel,
        messages: messages,
        reasoning_effort: 'none',
        ...extraSettings,
      }),
    });

    const isRateLimited = response.status === 429;
    const hasRetriesLeft = attempt < maxRateLimitRetries;
    if (isRateLimited && hasRetriesLeft) {
      const waitSeconds = readWaitSeconds(response);
      console.log(`  Rate limited, waiting ${waitSeconds}s before retrying...`);
      await wait(waitSeconds * 1000);
      continue;
    }

    if (!response.ok) {
      throw new Error(`Groq request failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
    }
    return response.json();
  }
}

async function evaluateDay(day) {
  const sources = day.headlines.map((headline) => ({ source: headline.source, title: headline.title }));

  const briefingReply = await askGroq(buildBriefingMessages(sources), { temperature: 0.3, max_tokens: 3000 });
  const briefing = readBriefingText(briefingReply) || '';

  return [
    checkStructure(briefing),
    checkEveryBulletCited(briefing),
    checkValidCitationNumbers(briefing, day.headlines.length),
    checkFaithfulness(briefing, day.headlines),
    checkCoverage(briefing, day.headlines),
    checkLowValueExcluded(briefing, day.headlines),
    checkTokenBudget(briefingReply.usage, maxReplyTokens),
  ];
}

function failedDayResults(error) {
  return checkNames.map(() => ({ passed: false, detail: error.message }));
}

async function main() {
  console.log(`Model: ${groqModel} | ${dataset.days.length} days | ${dataset.days.reduce((sum, day) => sum + day.headlines.length, 0)} headlines\n`);

  const passCounts = checkNames.map(() => 0);

  for (const day of dataset.days) {
    let results;
    try {
      results = await evaluateDay(day);
    } catch (error) {
      results = failedDayResults(error);
    }

    console.log(day.name);
    results.forEach((result, position) => {
      if (result.passed) {
        passCounts[position]++;
      }
      console.log(`  [${result.passed ? 'PASS' : 'FAIL'}] ${checkNames[position]}: ${result.detail}`);
    });
    console.log('');
  }

  console.log('Summary');
  checkNames.forEach((name, position) => {
    console.log(`  ${name}: ${passCounts[position]}/${dataset.days.length} days`);
  });

  const totalPassed = passCounts.reduce((sum, count) => sum + count, 0);
  const totalChecks = checkNames.length * dataset.days.length;
  console.log(`\n${totalPassed}/${totalChecks} checks passed`);
  process.exit(totalPassed === totalChecks ? 0 : 1);
}

main();
