// llm.js
const OpenAI = require('openai');

const API_KEY = process.env.OPENAI_API_KEY || '';
const client = API_KEY ? new OpenAI({ apiKey: API_KEY }) : null;

// Normalize context: accept string or string[]
function normalizeContext(contexts) {
  if (!contexts) return '';
  if (Array.isArray(contexts)) {
    return contexts
      .filter(Boolean)
      .map((s) => String(s))
      .join('\n\n---\n\n');
  }
  return String(contexts);
}

// Simple fallback if no API key or call fails
function naiveCompose(question, ctx) {
  const snippet = (ctx || '').split('\n').slice(0, 8).join('\n').trim();
  if (!snippet) {
    return 'Insufficient information in the provided documents.';
  }
  return `Based on the provided context, here is a concise answer to your question:

${snippet}

(If more detail is required, please refine the question.)`;
}

async function callWithRetry(messages, attempt = 0) {
  if (!client) {
    // No API key: fall back immediately
    return { content: null };
  }
  const maxAttempts = 6;
  try {
    const resp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages,
    });
    const content = resp?.choices?.[0]?.message?.content || '';
    return { content };
  } catch (err) {
    const status = err?.status || err?.code;
    if ((status === 429 || (status >= 500 && status < 600)) && attempt < maxAttempts) {
      const delay =
        Math.min(32000, 1000 * Math.pow(2, attempt)) + Math.floor(Math.random() * 500);
      await new Promise((r) => setTimeout(r, delay));
      return callWithRetry(messages, attempt + 1);
    }
    throw err;
  }
}

/**
 * Draft a concise answer from retrieved context.
 * @param {string} question
 * @param {string|string[]} contexts
 * @returns {Promise<string>}
 */
async function draftAnswer(question, contexts) {
  const ctx = normalizeContext(contexts).trim();
  const userContent = `QUESTION:
${String(question || '').trim()}

CONTEXT (from private documents):
${ctx || '(none)'}

Write a concise, clinically neutral answer in 3–8 sentences. 
Answer strictly from the CONTEXT. 
If the context is insufficient, say: "Insufficient information in the provided documents." 
Do not mention file names or any internal metadata.`;

  // If no API key, or no context, use naive compose
  if (!client || !ctx) {
    return naiveCompose(question, ctx);
  }

  const messages = [
    {
      role: 'system',
      content:
        'You are a precise medical summarizer. Use only the provided CONTEXT. Be concise, neutral, and avoid speculation.',
    },
    { role: 'user', content: userContent },
  ];

  const { content } = await callWithRetry(messages);
  return (content && content.trim()) || naiveCompose(question, ctx);
}

module.exports = { draftAnswer };
