const newsFeeds = [
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'DW', url: 'https://rss.dw.com/rdf/rss-en-all' },
  { name: 'Politico Europe', url: 'https://www.politico.eu/feed/' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
  { name: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml' },
  { name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/' },
  { name: 'Guardian Business', url: 'https://www.theguardian.com/uk/business/rss' },
];

function decodeXmlText(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (match, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
    .trim();
}

function readTag(block, tagName) {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`);
  const match = block.match(pattern);
  if (!match) {
    return '';
  }
  return decodeXmlText(match[1]);
}

function readLink(block) {
  const linkText = readTag(block, 'link');
  if (linkText) {
    return linkText;
  }

  const linkTags = block.match(/<link[^>]*>/g) || [];
  for (const linkTag of linkTags) {
    const isAlternate = !linkTag.includes('rel=') || linkTag.includes('rel="alternate"');
    const hrefMatch = linkTag.match(/href="([^"]+)"/);
    if (isAlternate && hrefMatch) {
      return decodeXmlText(hrefMatch[1]);
    }
  }
  return '';
}

function parseFeed(xmlText, feedName, maxItems) {
  let blocks = xmlText.match(/<item[\s>][\s\S]*?<\/item>/g);
  if (!blocks) {
    blocks = xmlText.match(/<entry[\s>][\s\S]*?<\/entry>/g) || [];
  }

  const items = [];
  for (const block of blocks.slice(0, maxItems)) {
    const title = readTag(block, 'title');
    if (!title) {
      continue;
    }
    items.push({ source: feedName, title: title, url: readLink(block) });
  }
  return items;
}

module.exports = { newsFeeds, parseFeed };
