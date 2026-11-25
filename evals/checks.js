const allowedSections = [
  'Geopolitics & Conflict',
  'Economy & Markets',
  'AI & Technology',
  'Science',
  'Policy & Regulation',
];

const minCoverage = 0.9;
const minFaithfulness = 0.9;

function findCitations(text) {
  const matches = [...text.matchAll(/\[(\d+(?:,\s*\d+)*)\]/g)];
  return matches.flatMap((match) => match[1].split(/,\s*/).map(Number));
}

function findBullets(briefing) {
  return briefing
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*] /.test(line));
}

function findSectionHeadings(briefing) {
  const matches = [...briefing.matchAll(/^## (.+)$/gm)];
  return matches.map((match) => match[1].trim());
}

function percent(part, whole) {
  if (whole === 0) {
    return '0%';
  }
  return `${Math.round((part / whole) * 100)}%`;
}

function checkStructure(briefing) {
  const headings = findSectionHeadings(briefing);
  const unknownHeadings = headings.filter((heading) => !allowedSections.includes(heading));

  if (headings.length === 0) {
    return { passed: false, detail: 'no ## section headings' };
  }
  if (unknownHeadings.length > 0) {
    return { passed: false, detail: `unexpected sections: ${unknownHeadings.join(', ')}` };
  }
  return { passed: true, detail: `${headings.length} sections` };
}

function checkEveryBulletCited(briefing) {
  const bullets = findBullets(briefing);
  const uncited = bullets.filter((bullet) => findCitations(bullet).length === 0);

  if (bullets.length === 0) {
    return { passed: false, detail: 'no bullets found' };
  }
  if (uncited.length > 0) {
    return { passed: false, detail: `${uncited.length} of ${bullets.length} bullets uncited, e.g. "${uncited[0]}"` };
  }
  return { passed: true, detail: `${bullets.length} bullets, all cited` };
}

function checkValidCitationNumbers(briefing, headlineCount) {
  const invalid = findCitations(briefing).filter((number) => number < 1 || number > headlineCount);

  if (invalid.length > 0) {
    return { passed: false, detail: `invented numbers: ${[...new Set(invalid)].join(', ')}` };
  }
  return { passed: true, detail: `all within 1-${headlineCount}` };
}

function citedHeadlines(briefing, headlines) {
  const cited = new Set(findCitations(briefing));
  return headlines.filter((headline, position) => cited.has(position + 1));
}

function checkCoverage(briefing, headlines) {
  const mustInclude = headlines.filter((headline) => headline.label === 'mustInclude');
  const cited = citedHeadlines(briefing, headlines);
  const missed = mustInclude.filter((headline) => !cited.includes(headline));
  const coveredCount = mustInclude.length - missed.length;
  const coverage = coveredCount / mustInclude.length;

  let detail = `${coveredCount}/${mustInclude.length} major stories (${percent(coveredCount, mustInclude.length)})`;
  if (missed.length > 0) {
    detail += `, missed: "${missed[0].title}"`;
    if (missed.length > 1) {
      detail += ` and ${missed.length - 1} more`;
    }
  }
  return { passed: coverage >= minCoverage, detail: detail };
}

function checkLowValueExcluded(briefing, headlines) {
  const wronglyCited = citedHeadlines(briefing, headlines).filter((headline) => headline.label === 'mustExclude');

  if (wronglyCited.length > 0) {
    return { passed: false, detail: `cited ${wronglyCited.length} low-value: "${wronglyCited[0].title}"` };
  }
  return { passed: true, detail: 'none cited' };
}

function checkTokenBudget(usage, maxReplyTokens) {
  if (!usage) {
    return { passed: false, detail: 'no usage data returned' };
  }
  const replyTokens = usage.completion_tokens;
  return { passed: replyTokens <= maxReplyTokens, detail: `${replyTokens} reply tokens (limit ${maxReplyTokens})` };
}

const minWordOverlap = 0.5;

const stopWords = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'over', 'after', 'amid', 'are', 'was', 'were',
  'has', 'have', 'had', 'its', 'their', 'his', 'her', 'will', 'would', 'can', 'could', 'new', 'says', 'said',
  'than', 'more', 'about', 'against', 'across', 'under', 'while', 'also', 'but', 'not', 'all', 'out', 'off',
]);

function contentWords(text) {
  const words = text.toLowerCase().replace(/\[[\d,\s]+\]/g, ' ').match(/[a-z]+/g) || [];
  return words.filter((word) => word.length >= 3 && !stopWords.has(word));
}

function numbersIn(text) {
  const withoutCitations = text.replace(/\[[\d,\s]+\]/g, ' ');
  return withoutCitations.match(/\d+(?:[.,]\d+)?/g) || [];
}

function wordAppearsIn(word, sourceWords) {
  const stem = word.slice(0, 5);
  return sourceWords.some((sourceWord) => sourceWord === word || (stem.length === 5 && sourceWord.startsWith(stem)));
}

function isBulletSupported(bullet, citedTitles) {
  const sourceText = citedTitles.join(' ');
  const sourceWords = contentWords(sourceText);
  const sourceNumbers = numbersIn(sourceText);

  const inventedNumbers = numbersIn(bullet).filter((number) => !sourceNumbers.includes(number));
  if (inventedNumbers.length > 0) {
    return { supported: false, reason: `number not in sources: ${inventedNumbers[0]}` };
  }

  const bulletWords = contentWords(bullet);
  if (bulletWords.length === 0) {
    return { supported: true, reason: 'no content words' };
  }

  const matchedCount = bulletWords.filter((word) => wordAppearsIn(word, sourceWords)).length;
  const overlap = matchedCount / bulletWords.length;
  if (overlap < minWordOverlap) {
    return { supported: false, reason: `only ${percent(matchedCount, bulletWords.length)} of words found in sources` };
  }
  return { supported: true, reason: `${percent(matchedCount, bulletWords.length)} word overlap` };
}

function checkFaithfulness(briefing, headlines) {
  const bullets = findBullets(briefing);
  if (bullets.length === 0) {
    return { passed: false, detail: 'no bullets to check' };
  }

  const unsupported = [];
  for (const bullet of bullets) {
    const citedTitles = findCitations(bullet)
      .map((number) => headlines[number - 1])
      .filter(Boolean)
      .map((headline) => headline.title);
    const verdict = isBulletSupported(bullet, citedTitles);
    if (!verdict.supported) {
      unsupported.push({ bullet: bullet, reason: verdict.reason });
    }
  }

  const supportedCount = bullets.length - unsupported.length;
  let detail = `${supportedCount}/${bullets.length} bullets supported (${percent(supportedCount, bullets.length)})`;
  if (unsupported.length > 0) {
    detail += `, e.g. "${unsupported[0].bullet}" (${unsupported[0].reason})`;
  }
  return { passed: supportedCount / bullets.length >= minFaithfulness, detail: detail };
}

module.exports = {
  allowedSections,
  findCitations,
  findBullets,
  checkStructure,
  checkEveryBulletCited,
  checkValidCitationNumbers,
  checkCoverage,
  checkLowValueExcluded,
  checkTokenBudget,
  isBulletSupported,
  checkFaithfulness,
};
