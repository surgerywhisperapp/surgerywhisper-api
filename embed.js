// embed.js
const OpenAI = require('openai');

const API_KEY = process.env.OPENAI_API_KEY || '';
const client = API_KEY ? new OpenAI({ apiKey: API_KEY }) : null;

// 1536 dims for text-embedding-3-small
const EMB_MODEL = 'text-embedding-3-small';
const DIM = 1536;

// Normalize text, ensure it's a string, trim and cap length
function sanitize(text) {
  if (text === undefined || text === null) return '';
  if (typeof text !== 'string') text = String(text);
  text = text.trim();
  // keep it reasonable; embeddings allow long inputs but trimming avoids surprises
  if (text.length > 8000) text = text.slice(0, 8000);
  return text;
}

function zeroVec() {
  const v = new Array(DIM).fill(0);
  return v;
}

async function embedOne(text, attempt = 0) {
  const t = sanitize(text);
  if (!t) {
    // Return zeros instead of hitting OpenAI with invalid input
    return zeroVec();
  }
  if (!client) {
    const v = zeroVec();
    v[0] = 1; // non-zero so searches don't crash
    return v;
  }

  const maxAttempts = 6;
  try {
    const res = await client.embeddings.create({
      model: EMB_MODEL,
      input: t, // must be a plain string
    });
    return res.data[0].embedding;
  } catch (err) {
    const status = err?.status || err?.code;
    // Retry on 429/5xx with exponential backoff + jitter
    if ((status === 429 || (status >= 500 && status < 600)) && attempt < maxAttempts) {
      const delay = Math.min(32000, 1000 * Math.pow(2, attempt)) + Math.floor(Math.random() * 500);
      await new Promise(r => setTimeout(r, delay));
      return embedOne(t, attempt + 1);
    }
    throw err;
  }
}

async function embedMany(texts, concurrency = 1) {
  const arr = Array.isArray(texts) ? texts.map(sanitize) : [];
  const out = new Array(arr.length);
  let i = 0;
  async function worker() {
    while (i < arr.length) {
      const idx = i++;
      out[idx] = await embedOne(arr[idx]);
    }
  }
  await Promise.all(new Array(Math.max(1, concurrency)).fill(0).map(worker));
  return out;
}

module.exports = { embedOne, embedMany, DIM };
