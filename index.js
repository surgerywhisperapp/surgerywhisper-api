const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// In-memory answer store (with TTL)
const answers = new Map(); // id -> {full, expiresAt}
const TTL_MS = 1000 * 60 * 60 * 24; // 24h

function saveAnswer(full) {
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  answers.set(id, { full, expiresAt: Date.now() + TTL_MS });
  return id;
}
setInterval(() => {
  const now = Date.now();
  for (const [id, obj] of answers.entries()) {
    if (obj.expiresAt < now) answers.delete(id);
  }
}, 60_000);

// Helpers
function makePreview(full, maxChars = 900) {
  if (full.length <= maxChars) return { preview: full, truncated: false };
  let cut = full.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > 200) cut = cut.slice(0, lastSpace);
  return { preview: cut + '…', truncated: true };
}

// Health
app.get('/', (req, res) => res.send('SurgeryWhisper API OK'));

// Main: ask endpoint
app.post('/qa/ask', (req, res) => {
  const question = (req.body?.question || '').trim();
  if (!question) return res.status(400).json({ error: 'Missing question' });

  // TODO: later replace with real vector search + LLM using your PDFs.
  let full = 'Demo answer: once we plug in your private PDFs, answers will come from your documents.';
  if (question.toLowerCase().includes('eversion')) {
    full =
      'Eversion endarterectomy is a surgical technique for carotid artery disease in which the internal carotid artery is ' +
      'transected at its origin from the common carotid, then everted (turned inside out) to allow circumferential ' +
      'removal of atherosclerotic plaque. After plaque removal and intimal inspection, the artery is reimplanted onto the ' +
      'common carotid to restore laminar flow. Advantages include a shorter clamp time and direct visualization of the distal ' +
      'endpoint; contraindications can include significant distal disease or unfavorable anatomy. Perioperative management ' +
      'focuses on blood pressure control, neurologic monitoring, and antiplatelet therapy.';
  }

  const { preview, truncated } = makePreview(full);
  const id = saveAnswer(full);

  res.json({
    answer_preview: preview,
    answer_id: id,
    is_truncated: truncated
  });
});

// Full answer endpoint
app.get('/qa/answers/:id', (req, res) => {
  const rec = answers.get(req.params.id);
  if (!rec) return res.status(404).json({ error: 'Not found or expired' });
  res.json({ full_answer: rec.full });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('API running on port', port));
