const crypto = require('crypto');
const { embedOne } = require('./embed');
const { vectorSearch, saveFullAnswer, loadFullAnswer } = require('./db');
const { draftAnswer } = require('./llm');

function makeId() {
  return crypto.randomBytes(12).toString('hex');
}

function makePreview(full, maxChars = 900) {
  if (full.length <= maxChars) return { preview: full, truncated: false };
  let cut = full.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > 200) cut = cut.slice(0, lastSpace);
  return { preview: cut + '…', truncated: true };
}

async function askHandler(req, res) {
  try {
    const question = (req.body?.question || '').trim();
    if (!question) return res.status(400).json({ error: 'Missing question' });

    // 1) embed question
    const qVec = await embedOne(question);

    // 2) vector search topK
    const hits = await vectorSearch(qVec, 8);

    // 3) build contexts (keep them reasonably sized)
    const contexts = hits.map(h => h.content).slice(0, 8);

    if (contexts.length === 0) {
      const full = 'No relevant information found in the current document set.';
      const id = makeId();
      await saveFullAnswer(id, full, 24);
      const { preview, truncated } = makePreview(full);
      return res.json({ answer_preview: preview, answer_id: id, is_truncated: truncated });
    }

    // 4) draft answer with LLM
    const full = await draftAnswer(question, contexts);

    // 5) save full & return preview
    const id = makeId();
    await saveFullAnswer(id, full, 48); // keep 48h
    const { preview, truncated } = makePreview(full);
    return res.json({ answer_preview: preview, answer_id: id, is_truncated: truncated });
  } catch (e) {
    console.error('ask error', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getFullHandler(req, res) {
  try {
    const id = req.params.id;
    const full = await loadFullAnswer(id);
    if (!full) return res.status(404).json({ error: 'Not found or expired' });
    return res.json({ full_answer: full });
  } catch (e) {
    console.error('getFull error', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { askHandler, getFullHandler };
