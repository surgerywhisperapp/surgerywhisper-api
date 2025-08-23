const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Compose a concise, professional, neutral medical answer strictly from context
async function draftAnswer(question, contexts) {
  const system = `You are a concise medical assistant. Answer strictly using the provided CONTEXT from private documents. Avoid speculation. Be clear and structured with short paragraphs or bullet points when helpful. Do not mention sources or document names.`;
  const contextText = contexts.map((c, i) => `#${i+1}\n${c}`).join('\n\n');

  const prompt = `CONTEXT:\n${contextText}\n\nQUESTION: ${question}\n\nWrite the best possible answer using only the CONTEXT.`;

  const chat = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 600 // preview/full split will handle long outputs
  });

  return chat.choices[0].message.content.trim();
}

module.exports = { draftAnswer };
