const OpenAI = require('openai');
const API_KEY = process.env.OPENAI_API_KEY || '';
const client = API_KEY ? new OpenAI({ apiKey: API_KEY }) : null;
const EMB_MODEL = 'text-embedding-3-small'; // 1536 dims

async function embedOne(text, attempt = 0) {
  if (!client) {
    const v = new Array(1536).fill(0); v[0] = 1; return v; // safe fallback
  }
  const maxAttempts = 6; // ~ up to ~1+2+4+8+16+32s = 63s worst-case
  try {
    const res = await client.embeddings.create({ model: EMB_MODEL, input: text });
    return res.data[0].embedding;
  } catch (err) {
    const status = err?.status || err?.code;
    // Retry on 429/5xx with exponential backoff + jitter
    if ((status === 429 || (status >= 500 && status < 600)) && attempt < maxAttempts) {
      const delay = Math.min(32000, 1000 * Math.pow(2, attempt)) + Math.floor(Math.random() * 500);
      await new Promise(r => setTimeout(r, delay));
      return embedOne(text, attempt + 1);
    }
    throw err;
  }
}

async function embedMany(texts, concurrency = 1) {
  const out = new Array(texts.length);
  let i = 0;
  async function worker() {
    while (i < texts.length) {
      const idx = i++;
      out[idx] = await embedOne(texts[idx]);
    }
  }
  const workers = Array.from({ length: Math.max(1, concurrency) }, worker);
  await Promise.all(workers);
  return out;
}

module.exports = { embedOne, embedMany };
