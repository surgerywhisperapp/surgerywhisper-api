const pdf = require('pdf-parse');

function chunkText(text, maxTokens = 800, overlap = 80) {
  // naive token estimate: ~4 chars per token
  const maxChars = maxTokens * 4;
  const ovChars = overlap * 4;

  const out = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(text.length, i + maxChars);
    let chunk = text.slice(i, end);

    // try to cut on sentence boundary
    const lastDot = chunk.lastIndexOf('. ');
    if (end < text.length && lastDot > maxChars * 0.6) {
      chunk = chunk.slice(0, lastDot + 1);
    }
    out.push(chunk.trim());
    if (end >= text.length) break;
    i += Math.max(1, chunk.length - ovChars);
  }
  return out;
}

async function extractPdf(buffer) {
  const data = await pdf(buffer);
  // data.numpages is available; data.text is entire text (no per-page map)
  return { text: data.text || '', pages: data.numpages || null };
}

module.exports = { chunkText, extractPdf };
