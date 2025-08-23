const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});

async function sql(strings, ...values) {
  const text = strings.reduce((a, s, i) => a + s + (values[i] !== undefined ? `$${i+1}` : ''), '');
  const res = await pool.query(text, values);
  return res.rows;
}

async function insertDocument({ title, pages }) {
  const { rows } = await pool.query(
    'insert into documents(title, pages) values ($1,$2) returning id',
    [title, pages || null]
  );
  return rows[0].id;
}

async function insertChunks(docId, rows) {
  // rows: [{ content, snippet, page_from, page_to, embedding }]
  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const r of rows) {
      await client.query(
        'insert into chunks(document_id, content, snippet, page_from, page_to, embedding) values ($1,$2,$3,$4,$5,$6)',
        [docId, r.content, r.snippet || null, r.page_from || null, r.page_to || null, r.embedding]
      );
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

async function vectorSearch(qVec, topK = 6) {
  const { rows } = await pool.query(
    `select document_id, content, snippet, page_from, page_to
     from chunks
     order by embedding <-> $1
     limit $2`,
    [qVec, topK]
  );
  return rows;
}

async function saveFullAnswer(id, full, ttlHours = 24) {
  await pool.query(
    `insert into answers(id, full_answer, expires_at)
     values ($1,$2, now() + make_interval(hours => $3))
     on conflict (id) do update set full_answer=$2, expires_at=now()+make_interval(hours=>$3)`,
    [id, full, ttlHours]
  );
}

async function loadFullAnswer(id) {
  const { rows } = await pool.query(
    `select full_answer from answers where id=$1 and expires_at > now()`,
    [id]
  );
  return rows[0]?.full_answer || null;
}

module.exports = { sql, insertDocument, insertChunks, vectorSearch, saveFullAnswer, loadFullAnswer };
