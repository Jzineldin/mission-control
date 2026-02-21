'use strict';
const fs = require('fs');
const path = require('path');

const MC_CONFIG_PATH = path.join(__dirname, '..', 'mc-config.json');
const MC_DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'mc-config.default.json');
const HOME_DIR = process.env.HOME || '/home/ubuntu';
const OPENCLAW_DIR = path.join(HOME_DIR, '.openclaw');

// Auto-detect values from an OpenClaw installation and patch config in-place.
// Called on first run (when mc-config.json didn't exist yet).
function autoDetectFromOpenClaw(config) {
  let changed = false;
  try {
    const ocConfig = JSON.parse(fs.readFileSync(path.join(OPENCLAW_DIR, 'openclaw.json'), 'utf8'));

    const token = ocConfig.gateway?.auth?.token || ocConfig.gateway?.http?.auth?.token || '';
    if (token && !config.gateway?.token) {
      config.gateway = config.gateway || {};
      config.gateway.token = token;
      changed = true;
    }

    const port = ocConfig.gateway?.http?.port;
    if (port && !config.gateway?.port) {
      config.gateway = config.gateway || {};
      config.gateway.port = port;
      changed = true;
    }

    const ws = ocConfig.agents?.defaults?.workspace || '';
    if (ws && !config.workspace) {
      config.workspace = ws;
      changed = true;
    }

    // Read agent name from IDENTITY.md inside workspace
    const workspacePath = config.workspace || HOME_DIR;
    try {
      const identity = fs.readFileSync(path.join(workspacePath, 'IDENTITY.md'), 'utf8');
      const nameMatch = identity.match(/\*\*Name:\*\*\s*(.+)/);
      if (nameMatch) {
        const agentName = nameMatch[1].trim();
        config.agentName = agentName;
        config.name = `${agentName} Control`;
        config.subtitle = config.name;
        changed = true;
      }
    } catch { /* IDENTITY.md not found — keep defaults */ }

    if (changed) {
      fs.writeFileSync(MC_CONFIG_PATH, JSON.stringify(config, null, 2));
      console.log('[Config] Auto-detected values from OpenClaw and saved mc-config.json');
    }
  } catch { /* OpenClaw not installed — skip silently */ }
  return config;
}

let mcConfig;
try {
  mcConfig = JSON.parse(fs.readFileSync(MC_CONFIG_PATH, 'utf8'));
} catch {
  // First run — copy default then try to auto-detect
  if (fs.existsSync(MC_DEFAULT_CONFIG_PATH)) {
    fs.copyFileSync(MC_DEFAULT_CONFIG_PATH, MC_CONFIG_PATH);
    mcConfig = JSON.parse(fs.readFileSync(MC_CONFIG_PATH, 'utf8'));
  } else {
    mcConfig = {
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
  mcConfig = autoDetectFromOpenClaw(mcConfig);
}

const GATEWAY_PORT = mcConfig.gateway?.port || 18789;
const GATEWAY_TOKEN = mcConfig.gateway?.token || '';
const GATEWAY_URL = `http://127.0.0.1:${GATEWAY_PORT}`;

const NOTION_DB_ID = mcConfig.notion?.dbId || '';
const NOTION_TOKEN = mcConfig.notion?.token || '';

// Workspace path: mc-config.json takes precedence (auto-detect already ran on first run)
let detectedWorkspace = mcConfig.workspace || '';
if (!detectedWorkspace) {
  try {
    const ocConfig = JSON.parse(fs.readFileSync(path.join(OPENCLAW_DIR, 'openclaw.json'), 'utf8'));
    detectedWorkspace = ocConfig.agents?.defaults?.workspace || '';
  } catch { /* silent */ }
}

const WORKSPACE_PATH = detectedWorkspace || path.join(HOME_DIR, 'clawd');
const SKILLS_PATH = mcConfig.skillsPath || path.join(WORKSPACE_PATH, 'skills');
const MEMORY_PATH = mcConfig.memoryPath || path.join(WORKSPACE_PATH, 'memory');
const S3_BUCKET = mcConfig.aws?.bucket || '';
const S3_REGION = mcConfig.aws?.region || 'us-east-1';
const S3_PREFIX = 'images/mc-generated';

// Sub-agent model used when spawning workshop tasks
const SUB_AGENT_MODEL = 'sonnet';

// Agent display name — from config field, dashboard name, or default
const agentName = mcConfig.agentName || mcConfig.name || 'Agent';

// Data file paths
const TASKS_FILE = path.join(__dirname, '..', 'tasks.json');
const SCOUT_FILE = path.join(__dirname, '..', 'scout-results.json');
const AGENTS_FILE = path.join(__dirname, '..', 'agents-custom.json');
const HIDDEN_SESSIONS_FILE = path.join(__dirname, '..', 'hidden-sessions.json');
const DOCS_DIR = path.join(__dirname, '..', 'documents');

module.exports = {
  MC_CONFIG_PATH,
  MC_DEFAULT_CONFIG_PATH,
  mcConfig,
  GATEWAY_PORT,
  GATEWAY_TOKEN,
  GATEWAY_URL,
  NOTION_DB_ID,
  NOTION_TOKEN,
  HOME_DIR,
  OPENCLAW_DIR,
  WORKSPACE_PATH,
  SKILLS_PATH,
  MEMORY_PATH,
  S3_BUCKET,
  S3_REGION,
  S3_PREFIX,
  SUB_AGENT_MODEL,
  agentName,
  TASKS_FILE,
  SCOUT_FILE,
  AGENTS_FILE,
  HIDDEN_SESSIONS_FILE,
  DOCS_DIR,
};
