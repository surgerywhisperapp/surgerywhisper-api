const AdmZip = require('adm-zip');
const { embedMany } = require('./embed');
const { extractPdf, chunkText } = require('./text');
const { insertDocument, insertChunks } = require('./db');

async function fetchAsBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to download: ' + res.status);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function ingestZipBuffer(buf) {
  const zip = new AdmZip(buf);
  const entries = zip.getEntries().filter(e => !e.isDirectory && e.entryName.toLowerCase().endsWith('.pdf'));
  const results = [];

  for (const e of entries) {
    const pdfBuf = e.getData();
    const { text, pages } = await extractPdf(pdfBuf);
    const chunks = chunkText(text, 800, 80);

    // embed chunks in batches
    const vectors = await embedMany(chunks);

    // snippets are first ~240 chars
    const rows = chunks.map((content, i) => ({
      content,
      snippet: (content || '').slice(0, 240),
      page_from: null,
      page_to: null,
      embedding: vectors[i]
    }));

    const docId = await insertDocument({ title: e.entryName, pages });
    await insertChunks(docId, rows);
    results.push({ title: e.entryName, pages, chunks: rows.length });
  }
  return results;
}

async function ingestHandler(req, res) {
  try {
    const { name, fileUrl, base64File } = req.body || {};
    if (!fileUrl && !base64File) return res.status(400).json({ error: 'Provide fileUrl or base64File (ZIP of PDFs)' });

    const buf = fileUrl ? await fetchAsBuffer(fileUrl) : Buffer.from(base64File, 'base64');
    const out = await ingestZipBuffer(buf);
    res.json({ batch: name || 'unnamed', documents: out.length, details: out });
  } catch (e) {
    console.error('ingest error', e);
    res.status(500).json({ error: 'Ingest failed' });
  }
}

module.exports = { ingestHandler };
