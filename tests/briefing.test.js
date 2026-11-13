const test = require('node:test');
const assert = require('node:assert');
const { cleanSources, buildBriefingMessages, readBriefingText, maxSources } = require('../briefing');

test('cleanSources rejects empty or oversized lists', () => {
  assert.strictEqual(cleanSources([]), null);
  assert.strictEqual(cleanSources('nope'), null);
  const tooMany = Array.from({ length: maxSources + 1 }, () => ({ source: 'x', title: 'y' }));
  assert.strictEqual(cleanSources(tooMany), null);
});

test('cleanSources trims long text and keeps numbering stable', () => {
  const sources = cleanSources([{ source: 'BBC', title: 'a'.repeat(1000) }, { source: 'HN' }]);
  assert.strictEqual(sources.length, 2);
  assert.strictEqual(sources[0].title.length, 300);
  assert.strictEqual(sources[1].title, 'undefined');
});

test('buildBriefingMessages numbers every source', () => {
  const messages = buildBriefingMessages([{ source: 'BBC', title: 'One' }, { source: 'DW', title: 'Two' }]);
  assert.strictEqual(messages[0].role, 'system');
  assert.match(messages[1].content, /\[1\] \(BBC\) One\n\[2\] \(DW\) Two/);
});

test('readBriefingText strips thinking and rejects empty replies', () => {
  const reply = { choices: [{ message: { content: '<think>hmm</think>\n## World\n- item' } }] };
  assert.strictEqual(readBriefingText(reply), '## World\n- item');
  assert.strictEqual(readBriefingText({ choices: [] }), null);
  assert.strictEqual(readBriefingText({ choices: [{ message: { content: '  ' } }] }), null);
});
