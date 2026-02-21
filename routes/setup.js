'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const express = require('express');
const { mcConfig, MC_CONFIG_PATH, MC_DEFAULT_CONFIG_PATH, GATEWAY_PORT, GATEWAY_URL, OPENCLAW_DIR, SCOUT_FILE } = require('../lib/config');
const { readJSON, writeJSON } = require('../lib/helpers');

const router = express.Router();

// ── GET /api/config (public, secrets stripped) — used as standalone handler ───

function getPublicConfig(req, res) {
  const safe = JSON.parse(JSON.stringify(mcConfig));
  if (safe.gateway) safe.gateway = { port: safe.gateway.port };
  if (safe.notion) delete safe.notion.token;
  if (safe.scout) delete safe.scout.braveApiKey;
  res.json(safe);
}

// ── GET /api/setup ────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    let gatewayRunning = false;
    let gatewayVersion = '';
    try {
      const response = await fetch(`${GATEWAY_URL}/status`, { method: 'GET', signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        gatewayRunning = true;
        const status = await response.json();
        gatewayVersion = status.version || '';
      }
    } catch {
      gatewayRunning = false;
    }

    let needsSetup = !fs.existsSync(MC_CONFIG_PATH);
    if (!needsSetup && fs.existsSync(MC_DEFAULT_CONFIG_PATH)) {
      const currentConfig = fs.readFileSync(MC_CONFIG_PATH, 'utf8');
      const defaultConfig = fs.readFileSync(MC_DEFAULT_CONFIG_PATH, 'utf8');
      needsSetup = currentConfig === defaultConfig;
    }

    let detectedConfig = { model: '', channels: [], agentName: '', workspacePath: '' };
    try {
      const openclawConfig = await readJSON(path.join(OPENCLAW_DIR, 'openclaw.json'), null);
      if (openclawConfig) {
        detectedConfig.model = openclawConfig.agents?.defaults?.model?.primary || '';
        detectedConfig.workspacePath = openclawConfig.agents?.defaults?.workspace || '';
        detectedConfig.gatewayToken = openclawConfig.gateway?.auth?.token || openclawConfig.gateway?.http?.auth?.token || '';

        if (openclawConfig.channels) {
          detectedConfig.channels = Object.keys(openclawConfig.channels).filter(
            ch => openclawConfig.channels[ch]?.enabled !== false
          );
        }

        const ws = detectedConfig.workspacePath || process.env.HOME;
        try {
          const identity = fs.readFileSync(path.join(ws, 'IDENTITY.md'), 'utf8');
          const nameMatch = identity.match(/\*\*Name:\*\*\s*(.+)/);
          detectedConfig.agentName = nameMatch ? nameMatch[1].trim() : 'OpenClaw Agent';
        } catch {
          detectedConfig.agentName = 'OpenClaw Agent';
        }
      }
    } catch (e) {
      console.warn('[Setup] Could not read OpenClaw config:', e.message);
    }

    res.json({ needsSetup, gatewayRunning, gatewayPort: GATEWAY_PORT, gatewayVersion, detectedConfig });
  } catch (e) {
    console.error('[Setup GET]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/setup ───────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const { dashboardName, gateway, modules, scout } = req.body;

    if (dashboardName) {
      mcConfig.name = dashboardName;
      mcConfig.subtitle = dashboardName;
    }
    if (gateway && typeof gateway === 'object') {
      if (gateway.port) mcConfig.gateway.port = gateway.port;
      if (gateway.token) mcConfig.gateway.token = gateway.token;
    }
    if (modules && typeof modules === 'object') {
      mcConfig.modules = { ...mcConfig.modules, ...modules };
    }
    if (scout && typeof scout === 'object') {
      mcConfig.scout = { ...mcConfig.scout, ...scout };
    }

    await writeJSON(MC_CONFIG_PATH, mcConfig);

    // Clear old scout results so fresh scan uses new queries
    if (fs.existsSync(SCOUT_FILE)) {
      await writeJSON(SCOUT_FILE, { results: [], lastScan: null, queries: scout?.queries?.length || 0 });
      console.log('[Setup] Cleared scout results for fresh scan');
    }

    // Auto-trigger first scout scan if configured
    if (scout?.enabled && scout?.queries?.length) {
      setTimeout(() => {
        execFile('node', [path.join(__dirname, '..', 'scout-engine.js')], { timeout: 60000 }, (err) => {
          if (err) console.error('[Setup] Scout scan failed:', err.message);
          else console.log('[Setup] First scout scan completed');
        });
      }, 1000);
    }

    const safe = JSON.parse(JSON.stringify(mcConfig));
    if (safe.gateway) safe.gateway = { port: safe.gateway.port };
    if (safe.notion) delete safe.notion.token;
    if (safe.scout) delete safe.scout.braveApiKey;

    res.json({ success: true, config: safe });
  } catch (e) {
    console.error('[Setup POST]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.getPublicConfig = getPublicConfig;
