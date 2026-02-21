'use strict';
const path = require('path');
const express = require('express');
const multer = require('multer');
const {
  mcConfig, MC_CONFIG_PATH, GATEWAY_PORT,
  MEMORY_PATH, SKILLS_PATH, S3_REGION, OPENCLAW_DIR, DOCS_DIR,
} = require('../lib/config');
const { readJSON, writeJSON } = require('../lib/helpers');

const router = express.Router();
const upload = multer({ dest: path.join(DOCS_DIR, '.tmp'), limits: { fileSize: 10 * 1024 * 1024 } });

// ── GET /api/settings ─────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const configData = await readJSON(path.join(OPENCLAW_DIR, 'openclaw.json'), {});
    res.json({
      model: configData.model || 'anthropic.claude-3-opus-20240229-v1:0',
      gateway_port: GATEWAY_PORT,
      memory_path: MEMORY_PATH,
      skills_path: SKILLS_PATH,
      bedrock_region: S3_REGION,
    });
  } catch (error) {
    console.error('[Settings GET]', error.message);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// ── POST /api/settings/budget ─────────────────────────────────────────────────

router.post('/budget', async (req, res) => {
  try {
    mcConfig.budget = { monthly: req.body.monthly || 0 };
    await writeJSON(MC_CONFIG_PATH, mcConfig);
    res.json({ status: 'saved', budget: mcConfig.budget });
  } catch (e) {
    console.error('[Budget API]', e.message);
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// ── POST /api/settings/model-routing ─────────────────────────────────────────

router.post('/model-routing', async (req, res) => {
  try {
    const { main, subagent, heartbeat } = req.body;
    mcConfig.modelRouting = { main, subagent, heartbeat };
    await writeJSON(MC_CONFIG_PATH, mcConfig);
    res.json({ status: 'saved' });
  } catch (e) {
    console.error('[Model routing]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/settings/heartbeat ─────────────────────────────────────────────

router.post('/heartbeat', async (req, res) => {
  try {
    const { interval } = req.body;
    mcConfig.heartbeat = { interval };
    await writeJSON(MC_CONFIG_PATH, mcConfig);
    res.json({ status: 'saved' });
  } catch (e) {
    console.error('[Heartbeat settings]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/settings/export ──────────────────────────────────────────────────

router.get('/export', (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename=mc-config.json');
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(MC_CONFIG_PATH);
});

// ── POST /api/settings/import ─────────────────────────────────────────────────

router.post('/import', upload.single('config'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No config file uploaded' });

    const { promises: fsp } = require('fs');
    const configContent = await fsp.readFile(req.file.path, 'utf8');
    JSON.parse(configContent); // validate JSON — throws if invalid

    // Backup current config
    await fsp.copyFile(MC_CONFIG_PATH, `${MC_CONFIG_PATH}.backup.${Date.now()}`);
    await fsp.writeFile(MC_CONFIG_PATH, configContent, 'utf8');
    await fsp.unlink(req.file.path);

    res.json({ status: 'imported', message: 'Configuration imported successfully. Restart required.' });
  } catch (e) {
    console.error('[Settings import]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
