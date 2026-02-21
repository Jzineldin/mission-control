'use strict';
const path = require('path');
const { promisify } = require('util');
const { exec } = require('child_process');
const express = require('express');
const { OPENCLAW_DIR } = require('../lib/config');
const { readJSON, writeJSON } = require('../lib/helpers');

const execPromise = promisify(exec);
const router = express.Router();

// ── GET /api/models ───────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  res.json([
    { id: 'us.anthropic.claude-opus-4-6-v1', name: 'Claude Opus 4.6' },
    { id: 'us.anthropic.claude-sonnet-4-20250514-v1:0', name: 'Claude Sonnet 4' },
    { id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Claude Haiku 4.5' },
  ]);
});

// ── POST /api/model ───────────────────────────────────────────────────────────
// Update the default model in openclaw.json and signal the gateway to reload.

router.post('/', async (req, res) => {
  try {
    const { model } = req.body;
    if (!model) return res.status(400).json({ error: 'model required' });

    const configPath = path.join(OPENCLAW_DIR, 'openclaw.json');
    const config = await readJSON(configPath, {});

    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    if (!config.agents.defaults.model) config.agents.defaults.model = {};
    config.agents.defaults.model.default = model;

    await writeJSON(configPath, config);

    try {
      await execPromise('kill -USR1 $(pgrep -f openclaw-gateway)', { timeout: 5000 });
    } catch {
      // Gateway might not be running — non-fatal
    }

    res.json({ ok: true, model, message: `Model switched to ${model}` });
  } catch (error) {
    console.error('[Model switch]', error.message);
    res.status(500).json({ error: 'Failed to switch model' });
  }
});

module.exports = router;
