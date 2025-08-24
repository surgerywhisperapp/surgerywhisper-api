// index.js
const express = require('express');
const cors = require('cors');

// Handlers you already have
const { ask, getAnswer } = require('./qa');            // from qa.js (I sent full file)
const { ingestHandler } = require('./ingest');         // ensure ingest.js exports { ingestHandler }

const app = express();

// --- Core middleware ---
app.use(cors());
app.use(express.json({ limit: '180mb' }));
app.use(express.urlencoded({ extended: true, limit: '180mb' }));

// --- Health check ---
app.get('/', (_req, res) => {
  res.send('SurgeryWhisper API OK');
});

// --- Admin guard for /ingest ---
function adminOnly(req, res, next) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    return res.status(500).json({ error: 'ADMIN_TOKEN not configured' });
  }
  const provided = req.header('x-admin-token') || req.query.admin_token || '';
  if (provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// --- Routes ---
// Q&A
app.post('/qa/ask', ask);
app.get('/qa/answers/:id', getAnswer);

// Ingestion (admin only)
app.post('/ingest', adminOnly, ingestHandler);

// --- 404 fallback ---
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// --- Error handler (last) ---
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Server error' });
});

// --- Start server ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
