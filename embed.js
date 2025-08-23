const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMB_MODEL = 'text-embedding-3-small'; // 1536 dims, cheap & good

async function embedOne(text) {
  const res = await client.embeddings.create({
    model: EMB_MODEL,
    input: text
  });
  return res.data[0].embedding;
}

// batch with simple concurrency
async function embedMany(texts, concurrency = 1) {
  const out = new Array(texts.length);
  let i = 0;
  async function worker() {
    while (i < texts.length) {
      const idx = i++;
      out[idx] = await embedOne(texts[idx]);
    }
  }
  await Promise.all(new Array(concurrency).fill(0).map(worker));
  return out;
}

module.exports = { embedOne, embedMany };
