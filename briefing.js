const fs = require('fs');
const path = require('path');

const briefingInstructions = fs.readFileSync(path.join(__dirname, 'prompts', 'briefing.txt'), 'utf8').trim();

const maxSources = 150;
const maxTitleLength = 300;
const maxSourceNameLength = 60;

function cleanSources(rawSources) {
  if (!Array.isArray(rawSources) || rawSources.length === 0 || rawSources.length > maxSources) {
    return null;
  }

  const sources = [];
  for (const item of rawSources) {
    const safeItem = item || {};
    sources.push({
      source: String(safeItem.source).slice(0, maxSourceNameLength),
      title: String(safeItem.title).slice(0, maxTitleLength),
    });
  }
  return sources;
}

function buildBriefingMessages(sources) {
  const numberedLines = sources.map((item, position) => `[${position + 1}] (${item.source}) ${item.title}`);
  const numberedSources = numberedLines.join('\n');

  const userPrompt = `Generate today's briefing. When referencing a specific source, cite its number like [1] or [2,3].\n\n=== NUMBERED SOURCES ===\n${numberedSources || 'No data.'}\n\nMarkdown now.`;

  return [
    { role: 'system', content: briefingInstructions },
    { role: 'user', content: userPrompt },
  ];
}

function readBriefingText(groqReply) {
  const content = groqReply?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    return null;
  }
  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

module.exports = { cleanSources, buildBriefingMessages, readBriefingText, maxSources };
