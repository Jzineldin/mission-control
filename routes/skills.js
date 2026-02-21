'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const { SKILLS_PATH, GATEWAY_PORT, GATEWAY_TOKEN, OPENCLAW_DIR } = require('../lib/config');
const { readJSON, writeJSON, gatewayFetch } = require('../lib/helpers');

const router = express.Router();

const SYSTEM_SKILLS_PATH = '/usr/lib/node_modules/openclaw/skills';

// ── GET /api/skills ───────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const configPath = path.join(OPENCLAW_DIR, 'openclaw.json');
    const config = await readJSON(configPath, {});

    const installed = [];
    if (config.skills?.entries) {
      for (const [name, skillConfig] of Object.entries(config.skills.entries)) {
        installed.push({
          name,
          description: skillConfig.description || 'No description',
          status: skillConfig.enabled !== false ? 'active' : 'inactive',
          installed: true,
          path: skillConfig.path,
          type: skillConfig.path?.includes('/usr/lib') ? 'system' : 'workspace',
        });
      }
    }

    const available = [];

    // Workspace skills
    if (fs.existsSync(SKILLS_PATH)) {
      const dirs = fs.readdirSync(SKILLS_PATH, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const dir of dirs) {
        if (installed.some(s => s.name === dir)) continue;
        const skillPath = path.join(SKILLS_PATH, dir);
        let skillInfo = { name: dir, description: 'Workspace skill' };

        const pkg = await readJSON(path.join(skillPath, 'package.json'), null);
        const skillJson = await readJSON(path.join(skillPath, 'skill.json'), null);

        if (pkg) {
          skillInfo.description = pkg.description || skillInfo.description;
          skillInfo.version = pkg.version;
          skillInfo.author = pkg.author;
        } else if (skillJson) {
          skillInfo.description = skillJson.description || skillInfo.description;
          skillInfo.version = skillJson.version;
        }

        available.push({ ...skillInfo, status: 'available', installed: false, path: skillPath, type: 'workspace' });
      }
    }

    // System skills
    if (fs.existsSync(SYSTEM_SKILLS_PATH)) {
      const dirs = fs.readdirSync(SYSTEM_SKILLS_PATH, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const dir of dirs) {
        if (installed.some(s => s.name === dir)) continue;
        available.push({
          name: dir,
          description: 'System skill',
          status: 'available',
          installed: false,
          path: path.join(SYSTEM_SKILLS_PATH, dir),
          type: 'system',
        });
      }
    }

    res.json({ installed, available });
  } catch (error) {
    console.error('[Skills GET]', error.message);
    res.status(500).json({ error: 'Failed to load skills' });
  }
});

// ── POST /api/skills/:name/toggle ─────────────────────────────────────────────

router.post('/:name/toggle', async (req, res) => {
  try {
    const { name } = req.params;
    const configPath = path.join(OPENCLAW_DIR, 'openclaw.json');
    const config = await readJSON(configPath, { skills: { entries: {} } });

    if (!config.skills?.entries?.[name]) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    config.skills.entries[name].enabled = !config.skills.entries[name].enabled;
    await writeJSON(configPath, config);

    // Notify gateway to reload config
    try {
      await gatewayFetch(GATEWAY_PORT, GATEWAY_TOKEN, '/config/reload', { method: 'POST' });
    } catch (e) {
      console.warn('[Skills toggle] Gateway reload failed (non-fatal):', e.message);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Skills toggle]', error.message);
    res.status(500).json({ error: 'Failed to toggle skill' });
  }
});

// ── POST /api/skills/:name/install ────────────────────────────────────────────

router.post('/:name/install', (req, res) => {
  res.json({ success: true, message: 'Skill installation not implemented' });
});

// ── POST /api/skills/:name/uninstall ─────────────────────────────────────────

router.post('/:name/uninstall', (req, res) => {
  res.json({ success: true, message: 'Skill uninstall not implemented' });
});

module.exports = router;
