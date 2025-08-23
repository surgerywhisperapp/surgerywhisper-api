// db.js
const { Pool } = require('pg');
const { parse } = require('pg-connection-string');
const dns = require('dns');
const { embedOne } = require('./embed'); // used by vectorSearch

// --- Parse connection string from env ---
const cfg = parse(process.env.SUPABASE_DB_URL || '');

// --- Create Pool (force IPv4 lookups to avoid ENETUNREACH) ---
const pool = new Pool({
  ...cfg,
  ssl: { rejectUnauthorized: false },
  lookup: (hostname, options, cb) => dns.lookup(hostname, { ...options, family: 4 }, cb),
  keepAlive: true,
  allowExitOnIdle: true,
});

// --- Tiny tagged template helper: builds $1, $2 placeholders safely ---
async function sql(strings, ...values) {
  const text = strings.reduce(
    (acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ''),
    ''
  );
  const res = await pool.query(text, values);
  return res.rows;
}

// --- pgvector literal formatter: [0.1,-0.2,...] ---
function toVectorLiteral(arr) {
  // ensure numeric and join with commas (no spaces)
  return '[' + arr.map((x) => (typeof x === 'number' ? x : Number(x))).join(',') + ']';
}

/**
 * Insert a document record.
 * @param {string} title
 * @param {number|null} pages
 * @returns {Promise<string>} document id (uuid)
 */
async function insertDocument(title, pages = null) {
  const rows = await sql/*sql*/`
    INSERT INTO documents (title, pages)
    VALUES (${title}, ${pages})
    RETURNING id
  `;
  return rows[0].id;
}

/**
 * Insert chunk rows with embeddings.
 * rows: [{ content, snippet, page_from, page_to, embedding:number[] }, ...]
 */
async function insertChunks(documentId, rows) {
  for (const r of rows) {
    const vec = toVectorLiteral(r.embedding);
    await sql/*sql*/`
      INSERT INTO chunks (document_id, content, snippet, page_from, page_to, embedding)
      VALUES (
        ${documentId},
        ${r.content},
        ${r.snippet},
        ${r.page_from},
        ${r.page_to},
        ${vec}::vector(1536)
      )
    `;
  }
}

/**
 * Vector search topK chunks for a natural-language query.
 * Returns rows with: doc_id, title, page_from, page_to, snippet, content
 */
async function vectorSearch(query, topK = 6) {
  const qEmb = await embedOne(query);        // number[]
  const qVec = toVectorLiteral(qEmb);        // "[...]"
  const rows = await sql/*sql*/`
    SELECT d.id AS doc_id,
           d.title,
           c.page_from,
           c.page_to,
           c.snippet,
           c.content
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    ORDER BY c.embedding <-> ${qVec}::vector(1536)
    LIMIT ${topK}
  `;
  return rows;
}

/**
 * Cache full answer text for "Show more"
 * @param {string} id
 * @param {string} fullText
 * @param {number} ttlMinutes
 */
async function saveFullAnswer(id, fullText, ttlMinutes = 60) {
  await sql/*sql*/`
    INSERT INTO answers (id, full_answer, expires_at)
    VALUES (${id}, ${fullText}, now() + (${ttlMinutes} || ' minutes')::interval)
    ON CONFLICT (id) DO UPDATE
    SET full_answer = EXCLUDED.full_answer,
        expires_at  = EXCLUDED.expires_at
  `;
}

/**
 * Load full answer if not expired
 * @param {string} id
 * @returns {Promise<string|null>}
 */
async function loadFullAnswer(id) {
  const rows = await sql/*sql*/`
    SELECT full_answer
    FROM answers
    WHERE id = ${id} AND expires_at > now()
    LIMIT 1
  `;
  return rows.length ? rows[0].full_answer : null;
}

module.exports = {
  sql,
  insertDocument,
  insertChunks,
  vectorSearch,
  saveFullAnswer,
  loadFullAnswer,
  toVectorLiteral,
};
