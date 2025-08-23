const express = require('express');
const cors = require('cors');
const { askHandler } = require('./qa');
const { ingestHandler } = require('./ingest');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/', (_req, res) => res.send('SurgeryWhisper API OK'));

app.post('/qa/ask', askHandler);
app.get('/qa/answers/:id', require('./qa').getFullHandler);

// Admin-only: provide x-admin-token: <ADMIN_TOKEN>
app.post('/ingest', (req, res, next) => {
  const tok = req.headers['x-admin-token'];
  if (!tok || tok !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return ingestHandler(req, res, next);
});

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => console.log('API running on port', port));
