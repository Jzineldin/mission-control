const express = require('express');
const fs = require('fs');
const path = require('path');
const util = require('util');
const os = require('os');
const { execSync, exec, execFile } = require('child_process');
const { createRuntimeSnapshotStore } = require('./server/services/runtimeSnapshots');
const { createOpenclawExec } = require('./server/services/openclawClient');
const { createCronService, parseFirstJson } = require('./server/services/cronData');
const { createStatusService } = require('./server/services/statusData');
const { readJsonFileSafe, writeJsonFileAtomic } = require('./server/services/jsonFiles');
const { createSettingsService } = require('./server/services/settingsData');
const { buildAgentsRouter } = require('./server/routes/agents');
const { buildAwsRouter } = require('./server/routes/aws');
const { buildCalendarRouter } = require('./server/routes/calendar');
const { buildChatRouter } = require('./server/routes/chat');
const { buildCostsRouter } = require('./server/routes/costs');
const { buildCouncilsRouter } = require('./server/routes/councils');
const { buildCronRouter } = require('./server/routes/cron');
const { buildDocsRouter } = require('./server/routes/docs');
const { buildGBrainRouter } = require('./server/routes/gbrain');
const { buildHermesKanbanRouter } = require('./server/routes/hermesKanban');
const { buildMemoryRouter } = require('./server/routes/memory');
const { buildModelsRouter } = require('./server/routes/models');
const { buildOllamaRouter } = require('./server/routes/ollama');
const { buildOpsRouter } = require('./server/routes/ops');
const { buildQuickRouter } = require('./server/routes/quick');
const { buildScoutRouter } = require('./server/routes/scout');
const { buildSessionsRouter } = require('./server/routes/sessions');
const { buildSettingsRouter } = require('./server/routes/settings');
const { buildSkillsRouter } = require('./server/routes/skills');
const { buildStatusRouter } = require('./server/routes/status');
const { buildTasksRouter, recoverTasksOnStartup } = require('./server/routes/tasks');

function resolveEnvPlaceholders(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, name) => process.env[name] || '');
}

const MC_CONFIG_PATH = path.join(__dirname, 'mc-config.json');
const MC_DEFAULT_CONFIG_PATH = path.join(__dirname, 'mc-config.default.json');

let mcConfig;
try {
  mcConfig = JSON.parse(fs.readFileSync(MC_CONFIG_PATH, 'utf8'));
} catch {
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
}

const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw/openclaw.json');
const GATEWAY_PORT = mcConfig.gateway?.port || 18789;

let detectedGatewayToken = '';
try {
  const ocConfig = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
  detectedGatewayToken = ocConfig.gateway?.auth?.token || ocConfig.gateway?.http?.auth?.token || '';
} catch {}
if (!detectedGatewayToken) {
  detectedGatewayToken = resolveEnvPlaceholders(mcConfig.gateway?.token || '');
}
const GATEWAY_TOKEN = detectedGatewayToken;
const NOTION_DB_ID = mcConfig.notion?.dbId || '';
const NOTION_TOKEN = resolveEnvPlaceholders(mcConfig.notion?.token || '');
let detectedWorkspace = mcConfig.workspace || '';
if (!detectedWorkspace) {
  try {
    const ocConfig = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
    detectedWorkspace = ocConfig.agents?.defaults?.workspace || '';
  } catch {}
}
const WORKSPACE_PATH = detectedWorkspace || path.join(os.homedir(), 'clawd');
const SKILLS_PATH = mcConfig.skillsPath || path.join(WORKSPACE_PATH, 'skills');
const MEMORY_PATH = mcConfig.memoryPath || path.join(WORKSPACE_PATH, 'memory');
const S3_BUCKET = mcConfig.aws?.bucket || '';
const S3_REGION = resolveEnvPlaceholders(mcConfig.aws?.region || process.env.AWS_REGION || 'us-east-1');
const AWS_ACCESS_KEY_ID = resolveEnvPlaceholders(mcConfig.aws?.accessKeyId || process.env.AWS_ACCESS_KEY_ID || '');
const AWS_SECRET_ACCESS_KEY = resolveEnvPlaceholders(mcConfig.aws?.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY || '');
const OPENCLAW_BIN = ['/opt/homebrew/bin/openclaw', '/usr/local/bin/openclaw', 'openclaw'].find((candidate) => {
  try {
    return candidate === 'openclaw' || fs.existsSync(candidate);
  } catch {
    return candidate === 'openclaw';
  }
});

function validateGatewayTokenConfig() {
  try {
    const ocConfig = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
    const authMode = ocConfig?.gateway?.auth?.mode || ocConfig?.gateway?.http?.auth?.mode || '';
    const authToken = ocConfig?.gateway?.auth?.token || ocConfig?.gateway?.http?.auth?.token || '';
    const remoteToken = ocConfig?.gateway?.remote?.token || '';
    const mcToken = mcConfig?.gateway?.token || '';

    if (authMode === 'none') return;
    if (authToken && remoteToken && authToken !== remoteToken) {
      throw new Error('Gateway token mismatch: openclaw gateway.auth.token != gateway.remote.token');
    }
    if (authToken && mcToken && authToken !== mcToken) {
      throw new Error('Mission Control token drift: mc-config gateway.token does not match openclaw gateway auth token');
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.warn('[startup] OpenClaw config not found; skipping gateway token validation until setup completes');
      return;
    }
    console.error('[startup] gateway token validation failed:', error.message);
    throw error;
  }
}

validateGatewayTokenConfig();

function prettyModelName(modelKey) {
  if (!modelKey) return '—';
  if (modelKey.includes('gpt-5.3-codex')) return 'GPT-5.3 Codex';
  if (modelKey.includes('gpt-5.2-codex')) return 'GPT-5.2 Codex';
  return modelKey
    .replace(/^openai-codex\//, '')
    .replace(/^openai\//, '')
    .replace(/^anthropic\//, '')
    .replace(/^ollama\//, '')
    .replace(/_/g, '-');
}

function getOpenclawDefaultModelKey() {
  try {
    const ocConfig = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
    return ocConfig?.agents?.defaults?.model?.primary
      || ocConfig?.agents?.defaults?.model?.default
      || ocConfig?.model?.default
      || '';
  } catch {
    return '';
  }
}

function persistMcConfig() {
  fs.writeFileSync(MC_CONFIG_PATH, JSON.stringify(mcConfig, null, 2), 'utf8');
}

const execPromise = util.promisify(exec);
const execFilePromise = util.promisify(execFile);
const openclawExec = createOpenclawExec({
  execFilePromise,
  bin: OPENCLAW_BIN,
  configPath: OPENCLAW_CONFIG_PATH,
});

async function fetchSessions(limit = 50) {
  const normalizeSessionPayload = (payload) => {
    const sessions = Array.isArray(payload?.sessions) ? payload.sessions : [];
    if (!sessions.length) return null;
    return {
      ...payload,
      count: Math.min(Number(payload?.count || sessions.length), limit),
      sessions: sessions.slice(0, limit),
    };
  };

  try {
    const { stdout } = await openclawExec(['sessions', '--json'], 15000);
    const normalized = normalizeSessionPayload(parseFirstJson(stdout, {}));
    if (normalized) return normalized;
  } catch (error) {
    const normalized = normalizeSessionPayload(parseFirstJson(error?.stdout || '', {}));
    if (normalized) return normalized;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const response = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/tools/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GATEWAY_TOKEN}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        tool: 'sessions_list',
        args: { limit, messageLimit: 1 },
      }),
    });
    clearTimeout(timer);
    const data = await response.json();
    const detailPayload = normalizeSessionPayload(data?.result?.details || {});
    if (detailPayload) return detailPayload;
    const textResult = data?.result?.content?.[0]?.text;
    if (textResult) {
      const normalized = normalizeSessionPayload(JSON.parse(textResult));
      if (normalized) return normalized;
    }
    return { count: 0, sessions: [] };
  } catch (error) {
    console.error('[fetchSessions]', error.message);
    return { count: 0, sessions: [] };
  }
}

async function fetchNotionActivity(pageSize = 5) {
  try {
    if (!NOTION_DB_ID || !NOTION_TOKEN) return null;
    const response = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        page_size: pageSize,
        sorts: [{ property: 'Date', direction: 'descending' }],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data.results) || data.results.length === 0) return null;

    return data.results.map((page) => {
      const props = page.properties || {};
      const name = (props.Name?.title || []).map((token) => token.plain_text).join('') || 'Activity';
      const dateStr = props.Date?.date?.start || page.created_time || new Date().toISOString();
      const category = props.Category?.select?.name || 'general';
      const status = props.Status?.select?.name || props.Status?.status?.name || 'done';
      const details = (props.Details?.rich_text || []).map((token) => token.plain_text).join('') || '';
      const typeMap = {
        Development: 'development',
        Business: 'business',
        Meeting: 'meeting',
        Planning: 'planning',
        'Bug Fix': 'development',
        Personal: 'personal',
      };
      return {
        time: dateStr,
        action: name,
        detail: details || `${category} — ${status}`,
        type: typeMap[category] || 'general',
      };
    });
  } catch (error) {
    console.error('[Notion API]', error.message);
    return null;
  }
}

function detectSessionType(session) {
  const key = String(session?.key || '');
  if (key === 'agent:main:main') return 'main';
  if (key.includes(':subagent:')) return 'sub-agent';
  if (key.includes('discord') || key.includes('#')) return 'discord';
  if (key.includes('web') || key.includes('mission-control')) return 'web';
  return 'other';
}

function createSessionsService() {
  const hiddenSessionsPath = path.join(__dirname, 'hidden-sessions.json');
  let hiddenSessions = readJsonFileSafe(hiddenSessionsPath, []);
  let visibleSessionsCache = null;
  let visibleSessionsCacheTime = 0;
  let visibleSessionsRefresh = null;
  const visibleSessionsCacheTtl = 30000;

  const readHiddenSessions = () => {
    hiddenSessions = Array.isArray(readJsonFileSafe(hiddenSessionsPath, hiddenSessions))
      ? readJsonFileSafe(hiddenSessionsPath, hiddenSessions)
      : hiddenSessions;
    return hiddenSessions;
  };

  function normalizeVisibleSessionsPayload(payload, limit = 25) {
      const hidden = new Set(readHiddenSessions().map((item) => String(item)));
      const sessions = (Array.isArray(payload?.sessions) ? payload.sessions : [])
        .filter((session) => !hidden.has(String(session?.key || '')))
        .map((session) => {
          const updatedAt = session.updatedAt || session.lastActive || session.createdAt || null;
          const updatedMs = updatedAt ? new Date(updatedAt).getTime() : 0;
          return {
            ...session,
            displayName: session.displayName || session.label || session.key,
            type: detectSessionType(session),
            isActive: updatedMs > 0 ? (Date.now() - updatedMs) < (30 * 60 * 1000) : false,
          };
        })
        .sort((left, right) => new Date(right.updatedAt || right.lastActive || 0).getTime() - new Date(left.updatedAt || left.lastActive || 0).getTime())
        .slice(0, limit);
      return { count: sessions.length, sessions };
  }

  function readSessionsFileFallback(limit = 25) {
    try {
      const sessionsFile = path.join(os.homedir(), '.openclaw/agents/main/sessions/sessions.json');
      const raw = readJsonFileSafe(sessionsFile, {});
      const sessions = Array.isArray(raw)
        ? raw
        : Object.entries(raw || {}).map(([key, value]) => ({ key, ...(value && typeof value === 'object' ? value : {}) }));
      return normalizeVisibleSessionsPayload({ sessions }, limit);
    } catch {
      return { count: 0, sessions: [] };
    }
  }

  function refreshVisibleSessions(limit = 25) {
    if (visibleSessionsRefresh) return visibleSessionsRefresh;
    visibleSessionsRefresh = new Promise((resolve) => {
      setImmediate(async () => {
        try {
          const payload = await fetchSessions(Math.max(limit * 4, 100));
          visibleSessionsCache = normalizeVisibleSessionsPayload(payload, limit);
          visibleSessionsCacheTime = Date.now();
        } catch {
          visibleSessionsCache = readSessionsFileFallback(limit);
          visibleSessionsCacheTime = Date.now();
        } finally {
          visibleSessionsRefresh = null;
          resolve(visibleSessionsCache);
        }
      });
    });
    return visibleSessionsRefresh;
  }

  return {
    fetchSessionsRaw: fetchSessions,
    async listVisibleSessions(limit = 25) {
      if (visibleSessionsCache && Date.now() - visibleSessionsCacheTime < visibleSessionsCacheTtl) {
        return visibleSessionsCache;
      }

      refreshVisibleSessions(limit);
      return visibleSessionsCache || readSessionsFileFallback(limit);
    },
    async getSessionHistory(sessionKey) {
      const decoded = decodeURIComponent(sessionKey);
      const payload = await fetchSessions(200);
      const session = (payload.sessions || []).find((entry) => entry.key === decoded);
      if (!session?.transcriptPath) return { messages: [], info: 'No transcript found' };

      const transcriptFile = path.join(os.homedir(), '.openclaw/agents/main/sessions', session.transcriptPath);
      if (!fs.existsSync(transcriptFile)) return { messages: [], info: 'Transcript file missing' };

      const lines = fs.readFileSync(transcriptFile, 'utf8').split('\n').filter(Boolean);
      const messages = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.type !== 'message' || !entry.message) continue;
          const role = entry.message.role;
          if (!role || role === 'toolResult' || role === 'toolUse') continue;
          let text = '';
          if (typeof entry.message.content === 'string') {
            text = entry.message.content;
          } else if (Array.isArray(entry.message.content)) {
            text = entry.message.content.filter((chunk) => chunk.type === 'text').map((chunk) => chunk.text || '').join('\n');
          }
          if (text.trim()) {
            messages.push({ role, content: text.substring(0, 3000), ts: entry.timestamp });
          }
        } catch {}
      }
      return { messages: messages.slice(-50), total: messages.length, sessionKey: decoded };
    },
    async sendSessionMessage(sessionKey, message) {
      const decoded = decodeURIComponent(sessionKey);
      const cfg = fs.existsSync(OPENCLAW_CONFIG_PATH) ? JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8')) : {};
      const gatewayToken = cfg.gateway?.auth?.token || process.env.MC_GATEWAY_TOKEN || GATEWAY_TOKEN || '';
      const gatewayPort = cfg.gateway?.port || GATEWAY_PORT;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);

      try {
        const response = await fetch(`http://127.0.0.1:${gatewayPort}/tools/invoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${gatewayToken}` },
          signal: controller.signal,
          body: JSON.stringify({
            tool: 'sessions_send',
            args: { sessionKey: decoded, message, timeoutSeconds: 90 },
          }),
        });
        clearTimeout(timeout);
        const data = await response.json();
        let resultText = data?.result?.content?.[0]?.text || '';
        try {
          const parsed = JSON.parse(resultText);
          if (parsed.reply) resultText = parsed.reply;
        } catch {}
        return { ok: !!resultText, result: resultText };
      } catch {
        clearTimeout(timeout);
        let resultText = '';
        try {
          const sessionsFile = path.join(os.homedir(), '.openclaw/agents/main/sessions/sessions.json');
          const sessions = JSON.parse(fs.readFileSync(sessionsFile, 'utf8'));
          const sessionInfo = sessions[decoded] || {};
          const sessionId = sessionInfo.sessionId || '';
          if (sessionId) {
            const transcriptPath = path.join(os.homedir(), '.openclaw/agents/main/sessions', `${sessionId}.jsonl`);
            if (fs.existsSync(transcriptPath)) {
              const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
              for (let index = lines.length - 1; index >= 0; index -= 1) {
                try {
                  const entry = JSON.parse(lines[index]);
                  if (entry.type === 'message' && entry.message?.role === 'assistant') {
                    const content = entry.message.content;
                    resultText = Array.isArray(content)
                      ? content.filter((chunk) => chunk.type === 'text').map((chunk) => chunk.text).join('\n')
                      : typeof content === 'string' ? content : '';
                    if (resultText) break;
                  }
                } catch {}
              }
            }
          }
        } catch {}
        return resultText
          ? { ok: true, result: resultText }
          : { ok: false, result: 'Response is taking longer than expected. The agent is still working — check back in a moment.' };
      }
    },
    hideSession(sessionKey) {
      const decoded = decodeURIComponent(sessionKey);
      const next = new Set(readHiddenSessions().map((item) => String(item)));
      next.add(decoded);
      hiddenSessions = Array.from(next);
      writeJsonFileAtomic(hiddenSessionsPath, hiddenSessions);
      return { status: 'hidden', message: `Session "${decoded}" hidden from view` };
    },
  };
}

const app = express();
const PORT = 3333;
const HOST = process.env.MISSION_CONTROL_HOST || '127.0.0.1';

app.disable('x-powered-by');
app.use(express.json());

const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, 'localhost', '127.0.0.1']);
app.use((req, res, next) => {
  try {
    const host = String(req.headers.host || '');
    if (host && !ALLOWED_HOSTS.has(host)) {
      return res.status(403).json({ error: 'Forbidden host' });
    }

    const method = String(req.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const origin = req.headers.origin ? String(req.headers.origin) : '';
      if (origin) {
        const allowed = origin.startsWith(`http://localhost:${PORT}`)
          || origin.startsWith(`http://127.0.0.1:${PORT}`)
          || origin.startsWith(`https://localhost:${PORT}`)
          || origin.startsWith(`https://127.0.0.1:${PORT}`);
        if (!allowed) return res.status(403).json({ error: 'Forbidden origin' });
      }
    }
  } catch {}
  return next();
});

app.use(express.static(path.join(__dirname, 'frontend/dist')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/data', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

function healthPayload() {
  return {
    ok: true,
    status: 'ok',
    service: 'mission-control',
    generatedAt: new Date().toISOString(),
  };
}

app.get('/api/health', (req, res) => res.json(healthPayload()));
app.get('/healthz', (req, res) => res.json(healthPayload()));
app.use(buildGBrainRouter({ projectRoot: __dirname, mcConfig }));
app.use(buildHermesKanbanRouter({ mcConfig }));

const settingsService = createSettingsService({
  mcConfig,
  missionControlConfigPath: MC_CONFIG_PATH,
  missionControlDefaultConfigPath: MC_DEFAULT_CONFIG_PATH,
  missionControlPackagePath: path.join(__dirname, 'package.json'),
  missionControlRoot: __dirname,
  gatewayPort: GATEWAY_PORT,
  gatewayToken: GATEWAY_TOKEN,
  memoryPath: MEMORY_PATH,
  skillsPath: SKILLS_PATH,
  bedrockRegion: S3_REGION,
  openclawExec,
});

const STATUS_CACHE_TTL = 60000;
const RUNTIME_SNAPSHOT_TTL = {
  status: STATUS_CACHE_TTL,
  cron: 60000,
  councilsSummary: 15000,
  governanceScorecard: 15000,
};
const { readRuntimeSnapshot, writeRuntimeSnapshot } = createRuntimeSnapshotStore({
  baseDir: path.join(__dirname, 'data/runtime'),
});

const statusService = createStatusService({
  mcConfig,
  memoryPath: MEMORY_PATH,
  prettyModelName,
  getOpenclawDefaultModelKey,
  fetchNotionActivity,
  fetchSessions,
  readRuntimeSnapshot,
  writeRuntimeSnapshot,
  runtimeSnapshotTtl: RUNTIME_SNAPSHOT_TTL,
  gatewayPort: GATEWAY_PORT,
  execSync,
  fs,
  path,
});

const CRON_CACHE_TTL = 30000;
const cronService = createCronService({
  openclawExec: (...args) => openclawExec(...args),
  gatewayPort: GATEWAY_PORT,
  gatewayToken: GATEWAY_TOKEN,
  getOpenclawDefaultModelKey,
  calendarFile: path.join(__dirname, 'data', 'calendar-entries.json'),
});

const sessionsService = createSessionsService();
const TASKS_FILE = path.join(__dirname, 'tasks.json');
const DECISION_LOG_PATH = path.join(__dirname, 'data/decision-log.json');
const OPS_EVENTS_PATH = path.join(__dirname, 'data/ops-events.json');
const AGENT_REGISTRY_PATH = path.join(__dirname, 'data/agent-registry.json');

app.use(buildChatRouter({ gatewayPort: GATEWAY_PORT, gatewayToken: GATEWAY_TOKEN, openclawBin: OPENCLAW_BIN }));
app.use(buildStatusRouter({ statusService }));
app.use(buildCronRouter({
  readRuntimeSnapshot,
  writeRuntimeSnapshot,
  runtimeSnapshotTtl: RUNTIME_SNAPSHOT_TTL,
  cronService,
  openclawExec: (...args) => openclawExec(...args),
}));
app.use(buildCalendarRouter({ calendarService: cronService, cronCacheTtl: CRON_CACHE_TTL }));
app.use(buildTasksRouter({
  projectRoot: __dirname,
  cronService,
  openclawExec,
  openclawBin: OPENCLAW_BIN,
  workspacePath: WORKSPACE_PATH,
  gatewayToken: GATEWAY_TOKEN,
}));
app.use(buildScoutRouter({ projectRoot: __dirname }));
app.use(buildAgentsRouter({
  openclawExec,
  fetchSessions,
  readJsonFileSafe,
  writeJsonFileAtomic,
  TASKS_FILE,
  mcConfig,
  workspacePath: WORKSPACE_PATH,
  persistMcConfig,
  missionControlConfigPath: MC_CONFIG_PATH,
}));
app.use(buildSkillsRouter({ openclawExec, parseFirstJson, settingsService }));
app.use(buildAwsRouter({
  execSync,
  exec: execPromise,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_REGION: S3_REGION,
  mcConfig,
  s3Bucket: S3_BUCKET,
}));
app.use(buildModelsRouter({ openclawExec, parseFirstJson, prettyModelName, settingsService }));
app.use(buildCostsRouter({ mcConfig, projectRoot: __dirname, sessionsService }));
app.use(buildSessionsRouter({ sessionsService }));
app.use(buildSettingsRouter({ settingsService, projectRoot: __dirname }));
app.use(buildDocsRouter({ projectRoot: __dirname }));
app.use(buildMemoryRouter({ memoryPath: MEMORY_PATH, workspacePath: WORKSPACE_PATH }));
app.use(buildQuickRouter({ gatewayPort: GATEWAY_PORT, gatewayToken: GATEWAY_TOKEN }));
app.use(buildOllamaRouter({
  exec: execPromise,
  openclawExec,
  mcConfig,
  missionControlConfigPath: MC_CONFIG_PATH,
}));
app.use(buildCouncilsRouter({
  readRuntimeSnapshot,
  writeRuntimeSnapshot,
  runtimeSnapshotTtl: RUNTIME_SNAPSHOT_TTL,
  decisionLogPath: DECISION_LOG_PATH,
  opsEventsPath: OPS_EVENTS_PATH,
  agentRegistryPath: AGENT_REGISTRY_PATH,
  readJsonFileSafe,
  writeJsonFileAtomic,
}));
app.use(buildOpsRouter({
  readJsonFileSafe,
  writeJsonFileAtomic,
  opsEventsPath: OPS_EVENTS_PATH,
  gatewayPort: GATEWAY_PORT,
}));

setTimeout(() => statusService.refreshStatusCache(), 50);
setTimeout(async () => {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/api/activity`);
    if (response.ok) console.log('[Startup] Pre-warmed activity cache');
  } catch {}
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/api/costs`);
    if (response.ok) console.log('[Startup] Pre-warmed costs cache');
  } catch {}
}, 3000);

// SPA catch-all: serve index.html for all non-API routes.
// Express 5 uses path-to-regexp v8 and no longer accepts bare `*`.
app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
});

app.listen(PORT, HOST, async () => {
  console.log(`🚀 Mission Control running at http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT}`);
  try {
    await recoverTasksOnStartup({
      projectRoot: __dirname,
      cronService,
      openclawExec,
      openclawBin: OPENCLAW_BIN,
      workspacePath: WORKSPACE_PATH,
      gatewayToken: GATEWAY_TOKEN,
    });
  } catch (error) {
    console.error('[Startup recovery]', error.message);
  }
});
