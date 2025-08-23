// qa.js
const crypto = require('crypto');
const { vectorSearch, saveFullAnswer, loadFullAnswer } = require('./db');
const { draftAnswer } = require('./llm');

/** Make a short, URL-safe id for cached answers */
function makeAnswerId() {
  return crypto.randomBytes(12).toString('hex'); // 24 chars
}

/** Trim to preview length with ellipsis if needed */
function toPreview(text, max = 700) {
  if (!text) return '';
  const t = String(text).trim();
  if (t.length <= max) return t;
  // cut on a word boundary if possible
  const slice = t.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > 400 ? slice.slice(0, lastSpace) : slice) + '…';
}

/** Build LLM context from search hits (hide source details to users) */
function buildContext(hits, maxChars = 6000) {
  const parts = [];
  let total = 0;
  for (const h of hits) {
    // Use content/snippet only; do not expose file names to the model output
    const block = (h.content || h.snippet || '').toString();
    if (!block) continue;
    if (total + block.length > maxChars) break;
    parts.push(block);
    total += block.length;
  }
  return parts.join('\n\n---\n\n');
}

/** POST /qa/ask */
async function askHandler(req, res) {
  try {
    const raw = req.body?.question;
    const question = (raw === undefined || raw === null) ? '' : String(raw).trim();
    if (!question) {
      return res.status(400).json({ error: 'Missing "question" in body.' });
    }

    const topK = Number(req.body?.topK) > 0 ? Number(req.body.topK) : 6;

    // 1) Semantic retrieval
    const hits = await vectorSearch(question, topK);

    if (!hits || hits.length === 0) {
      const msg = 'No relevant information found in the current document set.';
      const id = makeAnswerId();
      await saveFullAnswer(id, msg, 30); // cache even negative result briefly
      return res.json({ answer_preview: msg, answer_id: id, is_truncated: false });
    }

    // 2) Build context & draft answer with LLM
    const context = buildContext(hits);
    let full = '';
    try {
      full = await draftAnswer(question, context);
    } catch (err) {
      console.error('llm draft error', err);
      // Fallback: stitch top snippets into a concise paragraph
      full =
        'Based on the retrieved guidance:\n\n' +
        hits
          .slice(0, 3)
          .map((h) => (h.snippet || h.content || '').toString().trim())
          .filter(Boolean)
          .join('\n\n');
    }

    // 3) Save full answer for "Show more"
    const answerId = makeAnswerId();
    await saveFullAnswer(answerId, full, 120); // keep for 2 hours

    // 4) Return preview
    const preview = toPreview(full, 700);
    const isTruncated = preview.length < full.length;

    res.json({
      answer_preview: preview,
      answer_id: answerId,
      is_truncated: isTruncated,
    });
  } catch (err) {
    console.error('ask error', err);
    res.status(500).json({ error: 'Server error' });
  }
}

/** GET /qa/answers/:id */
async function getAnswerHandler(req, res) {
  try {
    const id = String(req.params?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Missing answer id.' });

    const full = await loadFullAnswer(id);
    if (!full) return res.status(404).json({ error: 'Answer expired or not found.' });

    res.type('text/plain').send(full);
  } catch (err) {
    console.error('get answer error', err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  ask: askHandler,
  getAnswer: getAnswerHandler,
};
