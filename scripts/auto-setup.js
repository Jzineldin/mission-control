#!/usr/bin/env node
'use strict';
/**
 * auto-setup.js — Detects OpenClaw config and pre-fills mc-config.json.
 * Run manually with: npm run setup
 * Also runs automatically on first start if mc-config.json doesn't exist.
 */
const fs = require('fs');
const path = require('path');

const MC_CONFIG_PATH = path.join(__dirname, '..', 'mc-config.json');
const MC_DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'mc-config.default.json');
const HOME_DIR = process.env.HOME || '/home/ubuntu';
const OPENCLAW_DIR = path.join(HOME_DIR, '.openclaw');

// Load or create config
let config;
try {
  config = JSON.parse(fs.readFileSync(MC_CONFIG_PATH, 'utf8'));
  console.log('📋 Loaded existing mc-config.json');
} catch {
  if (fs.existsSync(MC_DEFAULT_CONFIG_PATH)) {
    config = JSON.parse(fs.readFileSync(MC_DEFAULT_CONFIG_PATH, 'utf8'));
    console.log('📋 Starting from mc-config.default.json');
  } else {
    config = {
      name: 'Mission Control',
      subtitle: 'Mission Control',
      modules: { dashboard: true, chat: true, workshop: true, costs: true, cron: true, agents: true, settings: true, skills: true },
      gateway: { port: 18789, token: '' },
      aws: { enabled: false, bucket: '', region: 'us-east-1' },
      notion: { enabled: false, dbId: '', token: '' },
      scout: { enabled: false, braveApiKey: '' },
      workspace: '',
      skillsPath: '',
      memoryPath: '',
    };
  }
}

let changed = false;

try {
  const ocConfig = JSON.parse(fs.readFileSync(path.join(OPENCLAW_DIR, 'openclaw.json'), 'utf8'));
  console.log('✅ Found OpenClaw config at', OPENCLAW_DIR);

  const token = ocConfig.gateway?.auth?.token || ocConfig.gateway?.http?.auth?.token || '';
  if (token && !config.gateway?.token) {
    config.gateway = config.gateway || {};
    config.gateway.token = token;
    console.log('🔑 Detected gateway token');
    changed = true;
  }

  const port = ocConfig.gateway?.http?.port;
  if (port && !config.gateway?.port) {
    config.gateway = config.gateway || {};
    config.gateway.port = port;
    console.log(`🔌 Detected gateway port: ${port}`);
    changed = true;
  }

  const ws = ocConfig.agents?.defaults?.workspace || '';
  if (ws && !config.workspace) {
    config.workspace = ws;
    console.log(`📁 Detected workspace: ${ws}`);
    changed = true;
  }

  const workspacePath = config.workspace || HOME_DIR;
  try {
    const identity = fs.readFileSync(path.join(workspacePath, 'IDENTITY.md'), 'utf8');
    const nameMatch = identity.match(/\*\*Name:\*\*\s*(.+)/);
    if (nameMatch) {
      const agentName = nameMatch[1].trim();
      config.agentName = agentName;
      config.name = `${agentName} Control`;
      config.subtitle = config.name;
      console.log(`🤖 Detected agent name: ${agentName}`);
      changed = true;
    }
  } catch {
    console.log('ℹ️  No IDENTITY.md found in workspace — keeping default name');
  }
} catch {
  console.warn('⚠️  OpenClaw config not found at', OPENCLAW_DIR);
  console.warn('   Manually edit mc-config.json to configure the dashboard.');
}

if (changed) {
  fs.writeFileSync(MC_CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log('\n✅ Saved mc-config.json');
} else {
  console.log('\nℹ️  No changes — mc-config.json is already configured.');
}
