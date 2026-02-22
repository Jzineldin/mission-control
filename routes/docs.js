'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { DOCS_DIR } = require('../lib/config');

// Ensure docs directory exists
if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });

const router = express.Router();
const upload = multer({ dest: path.join(DOCS_DIR, '.tmp'), limits: { fileSize: 10 * 1024 * 1024 } });

// ── GET /api/docs ─────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const files = fs.readdirSync(DOCS_DIR).filter(f => !f.startsWith('.'));
    const documents = files.map(f => {
      const stat = fs.statSync(path.join(DOCS_DIR, f));
      const ext = path.extname(f).replace('.', '');
      const sizeBytes = stat.size;
      const size = sizeBytes > 1024 * 1024
        ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
        : sizeBytes > 1024 ? `${(sizeBytes / 1024).toFixed(1)} KB`
        : `${sizeBytes} B`;
      return { id: f, name: f, type: ext, size, sizeBytes, chunks: Math.max(1, Math.round(sizeBytes / 500)), modified: stat.mtime.toISOString() };
    });
    res.json({ documents, total: documents.length });
  } catch (err) {
    console.error('[Docs GET]', err.message);
    res.json({ documents: [], total: 0 });
  }
});

// ── POST /api/docs/upload ─────────────────────────────────────────────────────

router.post('/upload', upload.array('files', 20), async (req, res) => {
  try {
    const uploaded = [];
    for (const file of (req.files || [])) {
      const safeName = path.basename(file.originalname);
      if (!safeName || safeName.startsWith('.')) {
        await fs.promises.unlink(file.path).catch(() => {});
        continue;
      }
      const dest = path.join(DOCS_DIR, safeName);
      await fs.promises.rename(file.path, dest);
      uploaded.push(safeName);
    }
    res.json({ ok: true, uploaded });
  } catch (err) {
    console.error('[Docs upload]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/docs/:filename ────────────────────────────────────────────────

router.delete('/:filename', async (req, res) => {
  try {
    const safeName = path.basename(req.params.filename);
    if (!safeName || safeName.startsWith('.')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    await fs.promises.unlink(path.join(DOCS_DIR, safeName));
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'File not found' });
    console.error('[Docs delete]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
