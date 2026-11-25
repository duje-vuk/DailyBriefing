const test = require('node:test');
const assert = require('node:assert');
const checks = require('../evals/checks');

const headlines = [
  { source: 'Daily World', title: 'EU agrees sanctions', label: 'mustInclude' },
  { source: 'Market Wire', title: 'Bank holds rates', label: 'mustInclude' },
  { source: 'Daily World', title: 'Pop star wedding', label: 'mustExclude' },
  { source: 'Tech Forum', title: 'Show HN: tiny Lisp', label: 'optional' },
];

const goodBriefing = `## Geopolitics & Conflict
- EU agrees new sanctions [1]

## Economy & Markets
- Bank holds rates steady [2]`;

test('structure accepts known sections and rejects unknown ones', () => {
  assert.strictEqual(checks.checkStructure(goodBriefing).passed, true);
  assert.strictEqual(checks.checkStructure('## Celebrity Corner\n- x [1]').passed, false);
  assert.strictEqual(checks.checkStructure('- no headings [1]').passed, false);
});

test('every bullet must carry a citation', () => {
  assert.strictEqual(checks.checkEveryBulletCited(goodBriefing).passed, true);
  assert.strictEqual(checks.checkEveryBulletCited(goodBriefing + '\n- uncited claim').passed, false);
});

test('citation numbers must exist', () => {
  assert.strictEqual(checks.checkValidCitationNumbers(goodBriefing, 4).passed, true);
  assert.strictEqual(checks.checkValidCitationNumbers('- x [9]', 4).passed, false);
});

test('coverage needs the major stories', () => {
  assert.strictEqual(checks.checkCoverage(goodBriefing, headlines).passed, true);
  assert.strictEqual(checks.checkCoverage('- only one [1]', headlines).passed, false);
});

test('low-value stories must not be cited', () => {
  assert.strictEqual(checks.checkLowValueExcluded(goodBriefing, headlines).passed, true);
  assert.strictEqual(checks.checkLowValueExcluded('- wedding news [3]', headlines).passed, false);
});

test('token budget compares reply tokens to the limit', () => {
  assert.strictEqual(checks.checkTokenBudget({ completion_tokens: 500 }, 1500).passed, true);
  assert.strictEqual(checks.checkTokenBudget({ completion_tokens: 2000 }, 1500).passed, false);
  assert.strictEqual(checks.checkTokenBudget(undefined, 1500).passed, false);
});

test('faithfulness allows rewording', () => {
  const titles = ['Bank of England holds interest rates at 4% citing sticky services inflation'];
  const reworded = checks.isBulletSupported('- Bank of England keeps rates at 4% due to persistent services inflation [1]', titles);
  assert.strictEqual(reworded.supported, true);
});

test('faithfulness rejects invented numbers', () => {
  const titles = ['Bank of England holds interest rates at 4% citing sticky services inflation'];
  const invented = checks.isBulletSupported('- Bank of England holds rates at 4%, first pause in 18 months [1]', titles);
  assert.strictEqual(invented.supported, false);
  assert.match(invented.reason, /18/);
});

test('faithfulness rejects claims unrelated to the source', () => {
  const titles = ['EU agrees sanctions'];
  const unrelated = checks.isBulletSupported('- Markets rally as investors cheer strong earnings season [1]', titles);
  assert.strictEqual(unrelated.supported, false);
});

test('faithfulness scores a whole briefing', () => {
  assert.strictEqual(checks.checkFaithfulness(goodBriefing, headlines).passed, true);
  const badBriefing = goodBriefing + '\n- Stocks soar to record highs on tech earnings [2]\n- Oil hits 120 dollars [1]';
  assert.strictEqual(checks.checkFaithfulness(badBriefing, headlines).passed, false);
});

test('faithfulness ignores bold labels and matches word endings', () => {
  const titles = ['US jobs report shows unemployment rising to 4.6%'];
  const labeled = checks.isBulletSupported('*   **US Labor Market:** The latest US jobs report indicates unemployment has risen to 4.6% [1].', titles);
  assert.strictEqual(labeled.supported, true);
});

test('formatting is stripped before matching', () => {
  assert.strictEqual(
    checks.cleanBulletText('- *Energy:* Oil prices _jump_ **6%** after a pipeline [explosion](https://example.com) halts `exports` [4]'),
    'Oil prices jump 6% after a pipeline explosion halts exports [4]'
  );
  assert.strictEqual(checks.cleanBulletText('1. Germany: New law cuts permit times [8]'), 'New law cuts permit times [8]');
  assert.strictEqual(checks.cleanBulletText('- ~~Old~~ news [2]'), 'Old news [2]');
});

test('numbered lists count as bullets', () => {
  assert.strictEqual(checks.findBullets('## Science\n1. First item [1]\n2. Second item [2]').length, 2);
});
