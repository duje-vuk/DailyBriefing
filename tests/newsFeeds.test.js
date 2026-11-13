const test = require('node:test');
const assert = require('node:assert');
const { parseFeed, newsFeeds } = require('../newsFeeds');

const rssFeed = `<rss><channel><title>BBC</title>
<item><title><![CDATA[Leaders meet & talk <b>today</b>]]></title><link>https://bbc.test/1</link></item>
<item><title>Prices &amp; rates rise</title><link>https://bbc.test/2</link></item>
</channel></rss>`;

const atomFeed = `<feed><title>Blog</title><link href="https://blog.test/" rel="alternate"/>
<entry><title type="html">New &lt;API&gt;</title><link href="https://blog.test/edit" rel="edit"/><link href="https://blog.test/1" rel="alternate"/></entry>
</feed>`;

test('parses RSS items with CDATA and entities', () => {
  assert.deepStrictEqual(parseFeed(rssFeed, 'BBC', 5), [
    { source: 'BBC', title: 'Leaders meet & talk today', url: 'https://bbc.test/1' },
    { source: 'BBC', title: 'Prices & rates rise', url: 'https://bbc.test/2' },
  ]);
});

test('parses Atom entries and picks the alternate link', () => {
  assert.deepStrictEqual(parseFeed(atomFeed, 'Blog', 5), [
    { source: 'Blog', title: 'New <API>', url: 'https://blog.test/1' },
  ]);
});

test('respects the item limit', () => {
  assert.strictEqual(parseFeed(rssFeed, 'BBC', 1).length, 1);
});

test('every feed has a name and an https url', () => {
  for (const feed of newsFeeds) {
    assert.ok(feed.name);
    assert.match(feed.url, /^https:\/\//);
  }
});
