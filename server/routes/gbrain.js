const express = require('express');
const util = require('util');
const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { execFile } = require('child_process');
const { createGBrainTimelineService } = require('../services/gbrainTimeline');

const AUDIT_REPORT_PATH = '~/hermes-workspace/reports/gbrain-full-audit-20260524.md';
const DESIGN_HANDOFF_PATH = 'docs/gbrain-hybrid-brain-view-handoff-20260524.md';
const AUDIT_VERIFIED_AT = '2026-05-24T00:00:00.000Z';
const DEFAULT_COMMAND_TIMEOUT_MS = 7000;
const DEFAULT_SOURCE_FRESHNESS_HOURS = 24;
const SOURCE_FRESHNESS_THRESHOLDS_HOURS = {
  missioncontrol: 12,
  missionControl: 12,
  clawd: 24,
  hermes: 24,
  hermesagent: 24,
  openclaw: 24,
  codex: 48,
  codexmemories: 48,
  default: DEFAULT_SOURCE_FRESHNESS_HOURS,
};
const REQUIRED_GBRAIN_TOOLS = [
  { id: 'get_page', label: 'get_page', mode: 'read', purpose: 'Read shared memory pages by slug.' },
  { id: 'put_page', label: 'put_page', mode: 'write', purpose: 'Write curated shared-memory pages, never raw transcripts.' },
  { id: 'query', label: 'query', mode: 'read', purpose: 'Use hybrid search as the default shared recall surface.' },
  { id: 'recall', label: 'recall', mode: 'read', purpose: 'Read hot facts for cross-system memory recall.' },
  { id: 'think', label: 'think', mode: 'read', purpose: 'Run multi-hop synthesis across pages, takes, and graph evidence.' },
  { id: 'sources_list', label: 'sources', mode: 'read', purpose: 'Inspect registered shared-brain sources and freshness.' },
  { id: 'get_health', label: 'health', mode: 'read', purpose: 'Verify GBrain health before relying on shared context.' },
];
const GBRAIN_BASE_TOOL_IDS = new Set(['get_page', 'put_page', 'query', 'recall', 'sources_list', 'get_health']);
const GBRAIN_RUNTIME_CONTRACT_MARKER = 'mission-control-gbrain-contract';
const GBRAIN_INTEGRATION_CONTRACT = {
  role: 'shared-brain',
  label: 'Shared brain contract',
  summary: 'GBrain is the shared machine brain. Hermes and OpenClaw keep their own local memory systems, and only curated cross-system knowledge is promoted into GBrain.',
  localMemoryBoundary: 'Hermes profile memory and OpenClaw native memory remain local/private runtime memory.',
  writePolicy: 'Curated decisions, playbooks, handoffs, and verified task outcomes may be exported; raw transcripts, secrets, credentials, and untagged private memory stay out.',
  systems: [
    {
      id: 'hermes',
      label: 'Hermes hmudur',
      localMemory: 'Hermes profile memories remain the local conversational memory.',
      gbrainUse: 'Uses GBrain for MCP recall/search plus curated memory bridge exports.',
      proof: 'gbrain MCP server and hermes_hmudur_memory_bridge.py',
    },
    {
      id: 'openclaw',
      label: 'OpenClaw',
      localMemory: 'OpenClaw native memory, sessions, and runtime state remain local to OpenClaw.',
      gbrainUse: 'Uses GBrain as the shared recall/search/tool surface plus tagged main-memory bridge for cross-agent knowledge.',
      proof: 'openclaw MCP gbrain server, main_memory_to_gbrain_bridge.py, and shared-memory source sync',
    },
  ],
};
const GBrainActionDefinitions = {
  'doctor-fast': {
    label: 'Run fast doctor',
    description: 'Check resolver, schema, embeddings, and local runtime health without repair flags.',
    kind: 'diagnostic',
    args: ['doctor', '--json', '--fast'],
    timeoutMs: 30000,
    refreshAfter: true,
  },
  'preview-sync': {
    label: 'Preview source sync',
    description: 'Dry-run every registered local source without pulling from remotes.',
    kind: 'preview',
    args: ['sync', '--all', '--no-pull', '--parallel', '1', '--dry-run', '--json', '--yes'],
    timeoutMs: 60000,
    refreshAfter: false,
  },
  'sync-sources': {
    label: 'Sync local sources',
    description: 'Incrementally sync every registered local source without remote pulls, then embed stale chunks.',
    kind: 'maintenance',
    args: ['sync', '--all', '--no-pull', '--parallel', '1', '--timeout', '105', '--json', '--yes'],
    afterSuccessArgs: ['embed', '--stale'],
    softTimeoutMs: 120000,
    hardKillDelayMs: 30000,
    timeoutMs: 120000,
    refreshAfter: true,
  },
  'retry-failed-sync': {
    label: 'Retry failed syncs',
    description: 'Re-attempt previously failed source files, embed stale chunks, then refresh live proof.',
    kind: 'repair',
    args: ['sync', '--all', '--retry-failed', '--serial', '--timeout', '105', '--no-pull', '--json', '--yes'],
    afterSuccessArgs: ['embed', '--stale'],
    softTimeoutMs: 120000,
    hardKillDelayMs: 30000,
    timeoutMs: 120000,
    refreshAfter: true,
  },
  'embed-stale': {
    label: 'Embed stale chunks',
    description: 'Refresh embeddings for chunks marked stale by GBrain.',
    kind: 'maintenance',
    args: ['embed', '--stale'],
    timeoutMs: 120000,
    refreshAfter: true,
  },
  'embed-missing': {
    label: 'Backfill missing embeddings',
    description: 'Backfill missing embedding vectors using the stale-chunk fast path, then refresh live proof.',
    kind: 'repair',
    args: ['embed', '--stale', '--priority', 'recent', '--batch-size', '1000'],
    softTimeoutMs: 1800000,
    hardKillDelayMs: 30000,
    timeoutMs: 1800000,
    refreshAfter: true,
  },
  'check-resolvable': {
    label: 'Check skill routing',
    description: 'Validate skill-tree reachability, overlap, duplication, and gaps without fixes.',
    kind: 'diagnostic',
    args: ['check-resolvable', '--json'],
    timeoutMs: 60000,
    refreshAfter: false,
  },
  'storage-status': {
    label: 'Check storage status',
    description: 'Inspect GBrain storage tier status for the current local repo.',
    kind: 'diagnostic',
    args: ['storage', 'status', '--json'],
    timeoutMs: 30000,
    refreshAfter: false,
  },
};
const activeGBrainActions = new Set();

const defaultExecFilePromise = util.promisify(execFile);

function createGBrainExecOptions(timeoutMs) {
  const pathEntries = [
    `${os.homedir()}/.bun/bin`,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    process.env.PATH || '',
  ].filter(Boolean);
  const execOptions = {
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      PATH: pathEntries.join(':'),
    },
  };
  if (timeoutMs > 0) execOptions.timeout = timeoutMs;
  return execOptions;
}

function sanitizeMessage(value) {
  return String(value || 'Unknown error')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-[redacted]')
    .replace(/\/(?:Users|home)\/[^/\s]+/g, '~')
    .slice(0, 220);
}

function parseJsonFromOutput(output) {
  const text = String(output || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {}

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {}
  }

  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    try {
      return JSON.parse(text.slice(firstBracket, lastBracket + 1));
    } catch {}
  }

  return null;
}

async function runGBrain(execFilePromise, args, options = {}) {
  if (options.softTimeoutMs > 0 && execFilePromise === defaultExecFilePromise) {
    return runGBrainWithSoftTimeout(args, options);
  }

  try {
    const timeoutMs = options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
    const result = await execFilePromise('gbrain', args, createGBrainExecOptions(timeoutMs));
    return { ok: true, stdout: result.stdout || '', stderr: result.stderr || '' };
  } catch (error) {
    return {
      ok: false,
      stdout: error?.stdout || '',
      stderr: error?.stderr || '',
      error: sanitizeMessage(error?.stderr || error?.stdout || error?.message),
    };
  }
}

function runGBrainWithSoftTimeout(args, options = {}) {
  const timeoutMs = options.softTimeoutMs;
  const child = execFile('gbrain', args, createGBrainExecOptions(0));
  let stdout = '';
  let stderr = '';
  let settled = false;
  let exited = false;
  let hardKillTimer = null;

  if (child.stdout) child.stdout.on('data', (chunk) => { stdout += chunk; });
  if (child.stderr) child.stderr.on('data', (chunk) => { stderr += chunk; });

  const cleanup = new Promise((resolve) => {
    const finish = () => {
      exited = true;
      if (hardKillTimer) clearTimeout(hardKillTimer);
      resolve();
    };
    child.once('exit', finish);
    child.once('error', finish);
  });

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGINT');
      hardKillTimer = setTimeout(() => {
        if (!exited) child.kill('SIGKILL');
      }, options.hardKillDelayMs || 30000);
      resolve({
        ok: false,
        stdout,
        stderr,
        pending: true,
        cleanup,
        error: `gbrain ${args.slice(0, 2).join(' ')} exceeded ${Math.round(timeoutMs / 1000)}s and was asked to stop`,
      });
    }, timeoutMs);

    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        stdout,
        stderr,
        error: sanitizeMessage(error?.stderr || error?.stdout || error?.message),
      });
    });

    child.once('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ ok: true, stdout, stderr });
      } else {
        resolve({
          ok: false,
          stdout,
          stderr,
          error: sanitizeMessage(stderr || stdout || `gbrain exited with ${signal || `code ${code}`}`),
        });
      }
    });
  });
}

function summarizeCommandOutput(stdout, stderr) {
  const combined = [stdout, stderr].filter(Boolean).join('\n').trim();
  return sanitizeMessage(combined || 'Command completed without output');
}

function sanitizePayload(value) {
  if (typeof value === 'string') return sanitizeMessage(value);
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => sanitizePayload(item));

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [sanitizeMessage(key), sanitizePayload(item)])
  );
}

function listGBrainActions() {
  return Object.entries(GBrainActionDefinitions).map(([id, definition]) => ({
    id,
    label: definition.label,
    description: definition.description,
    kind: definition.kind,
    timeoutMs: definition.timeoutMs,
    refreshAfter: definition.refreshAfter,
    command: [`gbrain ${definition.args.join(' ')}`, definition.afterSuccessArgs ? `gbrain ${definition.afterSuccessArgs.join(' ')}` : '']
      .filter(Boolean)
      .join(' && '),
  }));
}

function resolveHomePath(homeDir, suffix) {
  return path.join(homeDir || os.homedir(), suffix);
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function readTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function parseJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function resolveClawdRoot(options = {}, homeDir = os.homedir()) {
  if (options.clawdRoot) return options.clawdRoot;
  if (options.workspaceRoot) return options.workspaceRoot;
  const configuredWorkspace = options.mcConfig?.workspace || options.workspacePath;
  if (configuredWorkspace) return configuredWorkspace;
  const openclawConfig = parseJsonFile(resolveHomePath(homeDir, '.openclaw/openclaw.json'));
  const openclawWorkspace = openclawConfig?.agents?.defaults?.workspace;
  if (openclawWorkspace) return openclawWorkspace;
  if (options.projectRoot) return path.resolve(options.projectRoot, '..');
  return resolveHomePath(homeDir, 'clawd');
}

function detectHermesGBrainConfig(homeDir = os.homedir()) {
  const configPath = resolveHomePath(homeDir, '.hermes/profiles/hmudur/config.yaml');
  const text = readTextFile(configPath);
  const configured = Boolean(text && /mcp_servers:\s*[\s\S]*?\bgbrain:\s*[\s\S]*?\bserve\b/i.test(text));
  return {
    configured,
    source: configured ? 'Hermes profile mcp_servers.gbrain' : 'Hermes profile mcp_servers.gbrain missing',
  };
}

function detectOpenClawGBrainConfig(homeDir = os.homedir()) {
  const configPath = resolveHomePath(homeDir, '.openclaw/openclaw.json');
  const config = parseJsonFile(configPath);
  const server = config?.mcp?.servers?.gbrain || null;
  const command = String(server?.command || '');
  const args = Array.isArray(server?.args) ? server.args.map(String) : [];
  const configured = Boolean(server && /gbrain(?:$|[\\/])?/i.test(command) && args.includes('serve'));
  return {
    configured,
    source: configured ? 'OpenClaw mcp.servers.gbrain' : 'OpenClaw mcp.servers.gbrain missing',
  };
}

function detectGBrainThinkConfig(homeDir = os.homedir(), processEnv = process.env) {
  const configPath = resolveHomePath(homeDir, '.gbrain/config.json');
  const config = parseJsonFile(configPath) || {};
  const activeModel = config?.chat_model || config?.models?.think || config?.models?.default || processEnv.GBRAIN_MODEL || null;
  const proxyBaseUrl = config?.provider_base_urls?.litellm || config?.provider_base_urls?.openrouter || processEnv.LITELLM_BASE_URL || processEnv.OPENROUTER_BASE_URL || null;
  const configured = Boolean(activeModel || proxyBaseUrl);
  return {
    configured,
    modelConfigured: Boolean(activeModel),
    proxyConfigured: Boolean(proxyBaseUrl),
    proof: configured
      ? [
          activeModel ? 'GBrain chat model configured' : '',
          proxyBaseUrl ? 'provider proxy base URL configured' : '',
        ].filter(Boolean).join(' + ')
      : 'No GBrain chat_model, models.think, GBRAIN_MODEL, or provider proxy base URL configured',
  };
}

function buildLocalGBrainIntegrationRuntime(options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const clawdRoot = resolveClawdRoot(options, homeDir);
  const hermesConfig = detectHermesGBrainConfig(homeDir);
  const openclawConfig = detectOpenClawGBrainConfig(homeDir);
  const thinkConfig = detectGBrainThinkConfig(homeDir, options.processEnv || process.env);
  const hermesBridgeScript = resolveHomePath(homeDir, '.hermes/profiles/hmudur/scripts/hermes_hmudur_memory_bridge.py');
  const hermesBridgeState = path.join(clawdRoot, 'shared-memory/state/hermes-hmudur-memory-bridge.json');
  const sharedMemorySyncScript = path.join(clawdRoot, 'scripts/gbrain_sync_and_embed.sh');
  const openclawBridgeScript = path.join(clawdRoot, 'scripts/main_memory_to_gbrain_bridge.py');
  const sharedMemoryHandoffs = path.join(clawdRoot, 'shared-memory/handoffs.md');
  const clawdSharedMemory = path.join(clawdRoot, 'shared-memory');
  const openclawAgents = path.join(clawdRoot, 'AGENTS.md');
  const hermesMemory = resolveHomePath(homeDir, '.hermes/profiles/hmudur/memories/MEMORY.md');
  const syncWrapper = readTextFile(sharedMemorySyncScript);
  const handoffsText = readTextFile(sharedMemoryHandoffs);
  const openclawAgentsText = readTextFile(openclawAgents);
  const hermesMemoryText = readTextFile(hermesMemory);
  const openclawBridgeLinked = syncWrapper.includes('main_memory_to_gbrain_bridge.py');
  const openclawBridgeBlockPresent = handoffsText.includes('main-memory-gbrain-bridge:start');
  const openclawContractInstalled = openclawAgentsText.includes(`${GBRAIN_RUNTIME_CONTRACT_MARKER}:start`);
  const hermesContractInstalled = hermesMemoryText.includes(`${GBRAIN_RUNTIME_CONTRACT_MARKER}:start`);
  const openclawBridgeReady = fileExists(openclawBridgeScript) && openclawBridgeLinked && openclawBridgeBlockPresent;

  return {
    checkedAt: new Date().toISOString(),
    think: thinkConfig,
    systems: {
      hermes: {
        mcpConfigured: hermesConfig.configured,
        mcpProof: hermesConfig.source,
        runtimeContract: {
          status: hermesContractInstalled ? 'healthy' : 'warning',
          label: hermesContractInstalled ? 'GBrain shared-brain contract installed' : 'GBrain shared-brain contract missing',
          proof: hermesContractInstalled ? 'Hermes hmudur MEMORY.md managed block' : 'Hermes hmudur MEMORY.md has no managed GBrain contract block',
        },
        durablePipeline: {
          status: fileExists(hermesBridgeScript) && fileExists(sharedMemorySyncScript) ? 'healthy' : 'warning',
          label: fileExists(hermesBridgeScript) ? 'Curated bridge script present' : 'Curated bridge script missing',
          proof: fileExists(hermesBridgeState) ? 'Hermes bridge state file present' : hermesConfig.source,
        },
      },
      openclaw: {
        mcpConfigured: openclawConfig.configured,
        mcpProof: openclawConfig.source,
        runtimeContract: {
          status: openclawContractInstalled ? 'healthy' : 'warning',
          label: openclawContractInstalled ? 'GBrain shared-brain contract installed' : 'GBrain shared-brain contract missing',
          proof: openclawContractInstalled ? 'OpenClaw AGENTS.md managed block' : 'OpenClaw AGENTS.md has no managed GBrain contract block',
        },
        durablePipeline: {
          status: openclawBridgeReady ? 'healthy' : fileExists(clawdSharedMemory) ? 'warning' : 'critical',
          label: openclawBridgeReady
            ? 'Tagged OpenClaw main-memory bridge linked into GBrain sync'
            : fileExists(openclawBridgeScript)
            ? 'OpenClaw bridge script present; latest managed block or sync linkage not verified'
            : 'Tagged OpenClaw bridge script missing',
          proof: openclawBridgeReady
            ? 'main_memory_to_gbrain_bridge.py + gbrain_sync_and_embed.sh + shared-memory/handoffs.md managed block'
            : 'OpenClaw uses GBrain through MCP; curated exporter proof is incomplete',
        },
      },
    },
  };
}

function normalizeToolsPayload(payload, checkedAt) {
  const rawToolsSource = Array.isArray(payload) ? payload : payload?.tools || payload?.data || payload?.items || [];
  const rawTools = Array.isArray(rawToolsSource)
    ? rawToolsSource
    : rawToolsSource && typeof rawToolsSource === 'object'
    ? Object.entries(rawToolsSource).map(([id, value]) => (value && typeof value === 'object' ? { id, ...value } : id))
    : [];
  const toolNames = rawTools
    .map((tool) => String(typeof tool === 'string' ? tool : tool?.name || tool?.id || '').trim())
    .filter(Boolean);
  const toolSet = new Set(toolNames);
  const requiredTools = REQUIRED_GBRAIN_TOOLS.map((tool) => ({
    ...tool,
    present: toolSet.has(tool.id),
  }));
  const presentCount = requiredTools.filter((tool) => tool.present).length;

  return {
    ok: toolNames.length > 0,
    mode: 'live-read-only',
    checkedAt,
    count: toolNames.length,
    presentCount,
    requiredCount: requiredTools.length,
    missingCount: requiredTools.length - presentCount,
    requiredTools,
  };
}

function normalizeFeaturesPayload(payload, checkedAt) {
  const recommendations = Array.isArray(payload?.recommendations) ? payload.recommendations : [];
  return {
    ok: true,
    mode: 'live-read-only',
    checkedAt,
    version: sanitizeMessage(payload?.version || ''),
    brainScore: Number.isFinite(Number(payload?.brain_score)) ? Number(payload.brain_score) : null,
    recommendations: recommendations.map((item) => ({
      id: sanitizeMessage(item?.id || 'feature-gap'),
      priority: Number.isFinite(Number(item?.priority)) ? Number(item.priority) : null,
      title: sanitizeMessage(item?.title || 'Feature recommendation'),
      pitch: sanitizeMessage(item?.pitch || ''),
      command: sanitizeMessage(item?.command || ''),
      severity: item?.id === 'no-integrations' ? 'optional' : 'warning',
    })),
  };
}

function normalizeProvidersPayload(payload, checkedAt) {
  const options = Array.isArray(payload?.options) ? payload.options : [];
  const chatOptions = options
    .filter((item) => item?.touchpoint === 'chat')
    .map((item) => ({
      id: sanitizeMessage(item?.id || ''),
      envReady: item?.env_ready === true,
      tier: sanitizeMessage(item?.tier || ''),
    }))
    .filter((item) => item.id);
  const readyChatOptions = chatOptions.filter((item) => item.envReady);
  return {
    ok: true,
    mode: 'live-read-only',
    checkedAt,
    chatOptions,
    readyChatCount: readyChatOptions.length,
    readyChatProviders: readyChatOptions.map((item) => item.id),
  };
}


function defaultHermesProxyBaseUrl(processEnv = process.env) {
  return processEnv.HERMES_PROXY_BASE_URL || processEnv.HERMES_PROXY_URL || 'http://127.0.0.1:8645';
}

function probeJsonEndpoint(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      resolve({ ok: false, error: 'invalid URL' });
      return;
    }
    const client = parsed.protocol === 'https:' ? https : http;
    const request = client.get(parsed, { timeout: timeoutMs }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
        if (body.length > 4096) request.destroy();
      });
      response.on('end', () => {
        let payload = null;
        try { payload = body ? JSON.parse(body) : null; } catch (_) { payload = null; }
        resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, statusCode: response.statusCode, payload });
      });
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', (error) => resolve({ ok: false, error: error.message }));
  });
}

async function buildLiveHermesProxyStatus(options = {}) {
  const processEnv = options.processEnv || process.env;
  const checkedAt = new Date().toISOString();
  const baseUrl = String(options.hermesProxyBaseUrl || defaultHermesProxyBaseUrl(processEnv)).replace(/\/v1\/?$/, '').replace(/\/$/, '');
  const result = await probeJsonEndpoint(`${baseUrl}/health`, options.hermesProxyTimeoutMs || 2000);
  const authenticated = result.payload?.authenticated === true;
  const upstream = sanitizeMessage(result.payload?.upstream || 'Hermes proxy');
  return {
    ok: result.ok && authenticated,
    mode: 'live-read-only',
    checkedAt,
    status: result.ok && authenticated ? 'healthy' : 'warning',
    label: result.ok && authenticated ? 'Hermes proxy ready' : 'Hermes proxy unavailable',
    detail: result.ok && authenticated
      ? `${upstream} local proxy authenticated`
      : `Hermes proxy health probe failed${result.error ? `: ${sanitizeMessage(result.error)}` : ''}`,
  };
}

async function buildLiveGBrainTools(options = {}) {
  const execFilePromise = options.execFilePromise || defaultExecFilePromise;
  const checkedAt = new Date().toISOString();
  const result = await runGBrain(execFilePromise, ['--tools-json']);
  const payload = parseJsonFromOutput(result.stdout);
  if (result.ok && payload) return normalizeToolsPayload(payload, checkedAt);
  return {
    ok: false,
    mode: 'live-read-only',
    checkedAt,
    status: 'unavailable',
    error: result.error || 'gbrain --tools-json did not return parseable output',
    requiredTools: REQUIRED_GBRAIN_TOOLS.map((tool) => ({ ...tool, present: false })),
  };
}

async function buildLiveGBrainFeatures(options = {}) {
  const execFilePromise = options.execFilePromise || defaultExecFilePromise;
  const checkedAt = new Date().toISOString();
  const result = await runGBrain(execFilePromise, ['features', '--json']);
  const payload = parseJsonFromOutput(result.stdout);
  if (result.ok && payload) return normalizeFeaturesPayload(payload, checkedAt);
  return {
    ok: false,
    mode: 'live-read-only',
    checkedAt,
    status: 'unavailable',
    error: result.error || 'gbrain features --json did not return parseable output',
    recommendations: [],
  };
}

async function buildLiveGBrainProviders(options = {}) {
  const execFilePromise = options.execFilePromise || defaultExecFilePromise;
  const checkedAt = new Date().toISOString();
  const result = await runGBrain(execFilePromise, ['providers', 'explain', '--json']);
  const payload = parseJsonFromOutput(result.stdout);
  if (result.ok && payload) return normalizeProvidersPayload(payload, checkedAt);
  return {
    ok: false,
    mode: 'live-read-only',
    checkedAt,
    status: 'unavailable',
    error: result.error || 'gbrain providers explain --json did not return parseable output',
    chatOptions: [],
    readyChatCount: 0,
    readyChatProviders: [],
  };
}

function findNumber(payload, keys) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const seen = new Set();
  const stack = [payload];

  while (stack.length) {
    const item = stack.pop();
    if (!item || typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);

    if (Array.isArray(item)) {
      for (const child of item) stack.push(child);
      continue;
    }

    for (const [key, value] of Object.entries(item)) {
      if (wanted.has(key.toLowerCase())) {
        const number = Number(value);
        if (Number.isFinite(number)) return number;
      }
      if (value && typeof value === 'object') stack.push(value);
    }
  }

  return null;
}

function findString(payload, keys) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const seen = new Set();
  const stack = [payload];

  while (stack.length) {
    const item = stack.pop();
    if (!item || typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);

    if (Array.isArray(item)) {
      for (const child of item) stack.push(child);
      continue;
    }

    for (const [key, value] of Object.entries(item)) {
      if (wanted.has(key.toLowerCase()) && typeof value === 'string') return value;
      if (value && typeof value === 'object') stack.push(value);
    }
  }

  return '';
}

function formatCount(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat('en-US').format(value) : '—';
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '—';
  const percent = value <= 1 ? value * 100 : value;
  return `${Math.round(percent)}%`;
}

function parseVersionOutput(output) {
  const text = String(output || '').trim();
  const match = text.match(/(?:gbrain\s+)?v?(\d+\.\d+\.\d+(?:\.\d+)?(?:[-+][A-Za-z0-9._-]+)?)/i);
  return match ? match[1] : '';
}

function normalizeSourceKey(value) {
  return String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function freshnessThresholdHours(sourceId, thresholds = SOURCE_FRESHNESS_THRESHOLDS_HOURS) {
  const key = normalizeSourceKey(sourceId);
  const foundKey = Object.keys(thresholds).find((candidate) => normalizeSourceKey(candidate) === key);
  const value = Number(thresholds[foundKey] ?? thresholds.default ?? DEFAULT_SOURCE_FRESHNESS_HOURS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_SOURCE_FRESHNESS_HOURS;
}

function parseTimestamp(value) {
  if (!value) return null;
  const ms = Date.parse(String(value));
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function isSyncTrackedSource(source) {
  const id = normalizeSourceKey(source?.id || source?.name || source?.source);
  const localPath = source?.local_path || source?.localPath || source?.path || source?.repoPath || source?.repo_path || null;
  if (id === 'default' && !localPath) return false;
  if (source?.federated === false && !localPath) return false;
  return true;
}

function sourceFreshnessStatus(source, lastSyncAt, checkedAt, thresholds = SOURCE_FRESHNESS_THRESHOLDS_HOURS) {
  const sourceId = source?.id || source?.name || source?.source;
  const thresholdHours = freshnessThresholdHours(sourceId, thresholds);
  const parsedLastSyncAt = parseTimestamp(lastSyncAt);
  const checkedMs = Date.parse(checkedAt);
  const lastSyncMs = parsedLastSyncAt ? Date.parse(parsedLastSyncAt) : NaN;
  if (!isSyncTrackedSource(source)) {
    return {
      status: 'inactive',
      label: 'Sync timestamp not applicable',
      ageHours: null,
      thresholdHours,
      lastSyncAt: parsedLastSyncAt,
      syncTracked: false,
    };
  }
  if (!Number.isFinite(checkedMs) || !Number.isFinite(lastSyncMs)) {
    return {
      status: 'warning',
      label: 'No sync timestamp',
      ageHours: null,
      thresholdHours,
      lastSyncAt: parsedLastSyncAt,
      syncTracked: true,
    };
  }

  const ageHours = Math.max(0, (checkedMs - lastSyncMs) / (60 * 60 * 1000));
  const stale = ageHours > thresholdHours;
  return {
    status: stale ? 'warning' : 'healthy',
    label: stale ? `Stale over ${thresholdHours}h` : `Fresh under ${thresholdHours}h`,
    ageHours: Number(ageHours.toFixed(1)),
    thresholdHours,
    lastSyncAt: parsedLastSyncAt,
    syncTracked: true,
  };
}

function summarizeSourceFreshness(sources, checkedAt) {
  const items = Array.isArray(sources) ? sources : [];
  const trackedItems = items.filter((source) => source.freshness?.syncTracked !== false);
  const stale = trackedItems.filter((source) => source.freshness?.status === 'warning');
  const fresh = trackedItems.filter((source) => source.freshness?.status === 'healthy');
  const untracked = items.filter((source) => source.freshness?.syncTracked === false);
  const oldest = trackedItems
    .filter((source) => Number.isFinite(source.freshness?.ageHours))
    .sort((a, b) => b.freshness.ageHours - a.freshness.ageHours)[0] || null;

  return {
    status: stale.length > 0 ? 'warning' : trackedItems.length > 0 ? 'healthy' : 'inactive',
    checkedAt,
    defaultThresholdHours: DEFAULT_SOURCE_FRESHNESS_HOURS,
    staleCount: stale.length,
    freshCount: fresh.length,
    unknownCount: trackedItems.length - stale.length - fresh.length,
    untrackedCount: untracked.length,
    oldestSourceId: oldest?.id || null,
    oldestAgeHours: Number.isFinite(oldest?.freshness?.ageHours) ? oldest.freshness.ageHours : null,
    staleSources: stale.map((source) => ({
      id: source.id,
      status: source.status,
      lastSyncAt: source.freshness.lastSyncAt,
      ageHours: source.freshness.ageHours,
      thresholdHours: source.freshness.thresholdHours,
      label: source.freshness.label,
    })),
  };
}

function liveHealthStatus(liveHealth, healthUnavailable = false) {
  if (healthUnavailable) return 'warning';
  if (!liveHealth) return 'warning';
  const rawStatus = String(liveHealth.status || '').toLowerCase();
  const score = Number(liveHealth.score);
  const stalePages = Number(liveHealth.metrics?.stalePages);
  const missingEmbeddings = Number(liveHealth.metrics?.missingEmbeddings);
  if (/critical|fail|error|unavailable/.test(rawStatus)) return 'critical';
  if (Number.isFinite(score) && score < 90) return 'warning';
  if (Number.isFinite(stalePages) && stalePages > 0) return 'warning';
  if (Number.isFinite(missingEmbeddings) && missingEmbeddings > 0) return 'warning';
  if (/warn|degrad|unknown/.test(rawStatus)) return 'warning';
  return 'healthy';
}

function liveSourceStatus(liveSources, sourcesUnavailable = false) {
  if (sourcesUnavailable) return 'warning';
  if (!liveSources) return 'warning';
  if (liveSources.freshness?.status === 'warning') return 'warning';
  if (liveSources.count > 0 && liveSources.healthyCount === liveSources.count && liveSources.warningCount === 0) return 'healthy';
  return 'warning';
}

function isHealthySourceStatus(status) {
  const lower = String(status || '').toLowerCase();
  if (/never[-_\s]?synced/.test(lower)) return false;
  return /\b(ok|clean|healthy|synced|isolated)\b/.test(lower);
}

function isWarningSourceStatus(status) {
  const lower = String(status || '').toLowerCase();
  if (!lower) return true;
  if (/warn|corrupt|dirty|missing|error|fail|never[-_\s]?synced/i.test(lower)) return true;
  return !isHealthySourceStatus(lower);
}

function numberFromText(text, pattern) {
  const match = String(text || '').match(pattern);
  if (!match) return null;
  const value = Number(String(match[1]).replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

function normalizeHealthScore(score) {
  if (score === null || score === undefined) return null;
  const value = Number(score);
  if (!Number.isFinite(value)) return null;
  return value > 0 && value <= 10 ? value * 10 : value;
}

function normalizeHealthPayload(healthPayload, jobsPayload, checkedAt) {
  const score = normalizeHealthScore(findNumber(healthPayload, ['brain_score', 'brainScore', 'health_score', 'healthScore', 'score']));
  const pages = findNumber(healthPayload, ['pages', 'page_count', 'total_pages']);
  const chunks = findNumber(healthPayload, ['chunks', 'chunk_count', 'total_chunks']);
  const embedded = findNumber(healthPayload, ['embedded', 'embedded_chunks', 'embedded_count']);
  const missing = findNumber(healthPayload, ['missing_embeddings', 'missingEmbeddings', 'missing']);
  const stalePages = findNumber(healthPayload, ['stale_pages', 'stalePages', 'stale']);
  const coverage = findNumber(healthPayload, ['embed_coverage', 'embedding_coverage', 'coverage']);
  const waiting = findNumber(jobsPayload, ['waiting', 'queued', 'pending']);
  const active = findNumber(jobsPayload, ['active', 'running', 'processing']);
  const stalled = findNumber(jobsPayload, ['stalled', 'dead']);
  const rawStatus = findString(healthPayload, ['status', 'health_status']);
  const status = rawStatus || (stalePages > 0 ? 'stale' : score !== null && score >= 90 ? 'healthy' : 'unknown');

  return {
    ok: true,
    mode: 'live-read-only',
    checkedAt,
    status,
    score,
    metrics: {
      pages,
      chunks,
      embedded,
      missingEmbeddings: missing,
      stalePages,
      embeddingCoverage: coverage,
      queue: { waiting, active, stalled },
    },
  };
}

function normalizeHealthText(healthOutput, jobsOutput, checkedAt) {
  const healthText = String(healthOutput || '');
  const jobsText = String(jobsOutput || '');
  const score = numberFromText(healthText, /Health score:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
  const coveragePercent = numberFromText(healthText, /Embed coverage:\s*(\d+(?:\.\d+)?)%/i);
  const missing = numberFromText(healthText, /Missing embeddings:\s*(\d+)/i);
  const stalePages = numberFromText(healthText, /Stale pages:\s*(\d+)/i);
  const waiting = numberFromText(jobsText, /Queue health:\s*(\d+)\s+waiting/i);
  const active = numberFromText(jobsText, /Queue health:\s*\d+\s+waiting,\s*(\d+)\s+active/i);
  const stalled = numberFromText(jobsText, /Queue health:\s*\d+\s+waiting,\s*\d+\s+active,\s*(\d+)\s+stalled/i);

  if (score === null && coveragePercent === null && missing === null && stalePages === null) return null;

  return {
    ok: true,
    mode: 'live-read-only',
    checkedAt,
    status: stalePages > 0 ? 'stale' : score !== null && score >= 7 ? 'healthy' : 'warning',
    score: score !== null ? score * 10 : null,
    metrics: {
      pages: null,
      chunks: null,
      embedded: null,
      missingEmbeddings: missing,
      stalePages,
      embeddingCoverage: coveragePercent !== null ? coveragePercent : null,
      queue: { waiting, active, stalled },
    },
  };
}

function normalizeStatsPayload(statsPayload) {
  if (!statsPayload) return null;
  return {
    pages: findNumber(statsPayload, ['pages', 'page_count', 'pageCount', 'total_pages', 'totalPages']),
    chunks: findNumber(statsPayload, ['chunks', 'chunk_count', 'chunkCount', 'total_chunks', 'totalChunks']),
    embedded: findNumber(statsPayload, ['embedded', 'embedded_chunks', 'embeddedChunks', 'embedded_count', 'embeddedCount']),
  };
}

function normalizeStatsText(statsOutput) {
  const text = String(statsOutput || '');
  const stats = {
    pages: numberFromText(text, /Pages:\s*([\d,]+)/i),
    chunks: numberFromText(text, /Chunks:\s*([\d,]+)/i),
    embedded: numberFromText(text, /Embedded:\s*([\d,]+)/i),
  };
  return Object.values(stats).some((value) => value !== null) ? stats : null;
}

function mergeStatsIntoHealth(health, stats) {
  if (!health?.ok || !stats) return health;
  return {
    ...health,
    metrics: {
      ...health.metrics,
      pages: stats.pages ?? health.metrics?.pages ?? null,
      chunks: stats.chunks ?? health.metrics?.chunks ?? null,
      embedded: stats.embedded ?? health.metrics?.embedded ?? null,
    },
  };
}

function needsStatsBackfill(health) {
  if (!health?.ok) return false;
  return health.metrics?.pages === null || health.metrics?.chunks === null || health.metrics?.embedded === null;
}

async function buildLiveGBrainStats(options = {}) {
  const execFilePromise = options.execFilePromise || defaultExecFilePromise;
  const result = await runGBrain(execFilePromise, ['stats', '--json']);
  const payload = parseJsonFromOutput(result.stdout);
  if (result.ok && payload) return normalizeStatsPayload(payload);
  const textStats = normalizeStatsText(result.stdout);
  if (result.ok && textStats) return textStats;
  const fallbackResult = await runGBrain(execFilePromise, ['stats']);
  const fallbackPayload = parseJsonFromOutput(fallbackResult.stdout);
  if (fallbackResult.ok && fallbackPayload) return normalizeStatsPayload(fallbackPayload);
  return fallbackResult.ok ? normalizeStatsText(fallbackResult.stdout) : null;
}

function normalizeSourcesPayload(payload, checkedAt) {
  const rawSources = Array.isArray(payload)
    ? payload
    : payload?.sources || payload?.data || payload?.items || [];
  const sources = rawSources
    .filter((source) => source && typeof source === 'object')
    .map((source) => {
      const pages = Number.isFinite(Number(source.pages || source.page_count)) ? Number(source.pages || source.page_count) : null;
      const status = source.status
        || source.clone_state
        || source.cloneState
        || (source.last_sync_at ? 'synced' : source.federated === false ? 'isolated' : 'unknown');
      const lastSyncAt = parseTimestamp(
        source.last_sync_at
        || source.lastSyncAt
        || source.last_synced_at
        || source.lastSyncedAt
        || source.synced_at
        || source.syncedAt
        || source.updated_at
        || source.updatedAt,
      );
      const freshness = sourceFreshnessStatus(source, lastSyncAt, checkedAt);
      return {
        id: String(source.id || source.name || source.source || 'unknown'),
        status: String(status),
        pages,
        chunks: Number.isFinite(Number(source.chunks || source.chunk_count)) ? Number(source.chunks || source.chunk_count) : null,
        lastSyncAt,
        freshness,
      };
    })
    .filter((source) => source.id && source.id !== 'unknown');
  const totalPages = sources.reduce((sum, source) => sum + (source.pages || 0), 0);
  const freshness = summarizeSourceFreshness(sources, checkedAt);
  const statusWarningCount = sources.filter((source) => isWarningSourceStatus(source.status)).length;

  return {
    ok: true,
    mode: 'live-read-only',
    checkedAt,
    count: sources.length,
    totalPages,
    healthyCount: sources.filter((source) => isHealthySourceStatus(source.status)).length,
    warningCount: statusWarningCount,
    freshness,
    sources,
  };
}

function normalizeSourcesText(output, checkedAt) {
  const sources = String(output || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^id\b|^-+|SOURCES/i.test(line))
    .map((line) => {
      const columns = line.split(/\s+/);
      const id = columns[0] || '';
      if (!id || id.includes('/') || id === 'sources' || id.startsWith('─')) return null;
      const pageMatch = line.match(/\s(\d[\d,]*)\s+pages\b/i);
      const syncMatch = line.match(/last sync\s+([^\s]+)/i);
      const synced = Boolean(syncMatch);
      const neverSynced = /never synced/i.test(line);
      const statusColumn = columns.find((column) => /ok|clean|healthy|synced|warn|corrupt|dirty|missing|error|fail/i.test(column));
      const kind = columns.find((column, index) => index > 0 && !column.includes('/')) || 'unknown';
      const status = neverSynced ? 'never-synced' : synced ? 'synced' : statusColumn || kind;
      const lastSyncAt = synced ? parseTimestamp(syncMatch[1]) : null;
      const freshness = sourceFreshnessStatus({ id }, lastSyncAt, checkedAt);
      return {
        id,
        status,
        pages: pageMatch ? Number(pageMatch[1].replace(/,/g, '')) : null,
        chunks: null,
        lastSyncAt,
        freshness,
      };
    })
    .filter(Boolean);
  const totalPages = sources.reduce((sum, source) => sum + (source.pages || 0), 0);
  const freshness = summarizeSourceFreshness(sources, checkedAt);
  const statusWarningCount = sources.filter((source) => isWarningSourceStatus(source.status)).length;

  return {
    ok: sources.length > 0,
    mode: 'live-read-only',
    checkedAt,
    count: sources.length,
    totalPages,
    healthyCount: sources.filter((source) => isHealthySourceStatus(source.status)).length,
    warningCount: statusWarningCount,
    freshness,
    sources,
  };
}

async function buildLiveGBrainHealth(options = {}) {
  const execFilePromise = options.execFilePromise || defaultExecFilePromise;
  const checkedAt = new Date().toISOString();
  const [healthResult, jobsResult] = await Promise.all([
    runGBrain(execFilePromise, ['call', 'get_health']),
    runGBrain(execFilePromise, ['jobs', 'stats', '--json']),
  ]);
  const healthPayload = parseJsonFromOutput(healthResult.stdout);
  const jobsPayload = parseJsonFromOutput(jobsResult.stdout) || {
    waiting: numberFromText(jobsResult.stdout, /Queue health:\s*(\d+)\s+waiting/i),
    active: numberFromText(jobsResult.stdout, /Queue health:\s*\d+\s+waiting,\s*(\d+)\s+active/i),
    stalled: numberFromText(jobsResult.stdout, /Queue health:\s*\d+\s+waiting,\s*\d+\s+active,\s*(\d+)\s+stalled/i),
  };

  if (healthResult.ok && healthPayload) {
    const health = normalizeHealthPayload(healthPayload, jobsPayload, checkedAt);
    return needsStatsBackfill(health) ? mergeStatsIntoHealth(health, await buildLiveGBrainStats(options)) : health;
  }

  const fallbackHealthResult = await runGBrain(execFilePromise, ['health', '--json']);
  const fallbackPayload = parseJsonFromOutput(fallbackHealthResult.stdout);
  if (fallbackHealthResult.ok && fallbackPayload) {
    const health = normalizeHealthPayload(fallbackPayload, jobsPayload, checkedAt);
    return needsStatsBackfill(health) ? mergeStatsIntoHealth(health, await buildLiveGBrainStats(options)) : health;
  }

  const textHealth = fallbackHealthResult.ok ? normalizeHealthText(fallbackHealthResult.stdout, jobsResult.stdout, checkedAt) : null;
  if (!textHealth?.ok) {
    return {
      ok: false,
      mode: 'live-read-only',
      checkedAt,
      status: 'unavailable',
      error: healthResult.error || fallbackHealthResult.error || 'gbrain health did not return JSON',
    };
  }

  return needsStatsBackfill(textHealth) ? mergeStatsIntoHealth(textHealth, await buildLiveGBrainStats(options)) : textHealth;
}

async function buildLiveGBrainSources(options = {}) {
  const execFilePromise = options.execFilePromise || defaultExecFilePromise;
  const checkedAt = new Date().toISOString();
  const result = await runGBrain(execFilePromise, ['sources', 'list', '--json']);
  const payload = parseJsonFromOutput(result.stdout);

  if (result.ok && payload) {
    return normalizeSourcesPayload(payload, checkedAt);
  }

  const fallbackResult = await runGBrain(execFilePromise, ['sources', 'list']);
  const textSources = fallbackResult.ok ? normalizeSourcesText(fallbackResult.stdout, checkedAt) : null;
  if (!textSources?.ok) {
    return {
      ok: false,
      mode: 'live-read-only',
      checkedAt,
      status: 'unavailable',
      error: result.error || fallbackResult?.error || 'gbrain sources list did not return parseable output',
      sources: [],
    };
  }

  return textSources;
}

async function buildLiveGBrainVersion(options = {}) {
  const execFilePromise = options.execFilePromise || defaultExecFilePromise;
  const checkedAt = new Date().toISOString();
  const result = await runGBrain(execFilePromise, ['--version']);
  const version = parseVersionOutput(result.stdout || result.stderr);

  if (result.ok && version) {
    return {
      ok: true,
      mode: 'live-read-only',
      checkedAt,
      version,
      source: 'gbrain --version',
    };
  }

  return {
    ok: false,
    mode: 'live-read-only',
    checkedAt,
    status: 'unavailable',
    error: result.error || 'gbrain --version did not return a parseable version',
  };
}

async function runGBrainAction(action, options = {}) {
  const definition = GBrainActionDefinitions[action];
  const checkedAt = new Date().toISOString();

  if (!definition) {
    return {
      ok: false,
      status: 'rejected',
      checkedAt,
      error: `Unsupported GBrain action: ${sanitizeMessage(action)}`,
    };
  }

  if (activeGBrainActions.size > 0) {
    return {
      ok: false,
      status: 'busy',
      checkedAt,
      error: 'Another GBrain action is already running.',
    };
  }

  activeGBrainActions.add(action);
  const pendingCleanups = [];
  try {
    const execFilePromise = options.execFilePromise || defaultExecFilePromise;
    const result = await runGBrain(execFilePromise, definition.args, {
      softTimeoutMs: definition.softTimeoutMs,
      hardKillDelayMs: definition.hardKillDelayMs,
      timeoutMs: definition.timeoutMs,
    });
    if (result.cleanup) pendingCleanups.push(result.cleanup);
    const followUpResult = result.ok && definition.afterSuccessArgs
      ? await runGBrain(execFilePromise, definition.afterSuccessArgs, { timeoutMs: definition.timeoutMs })
      : null;
    if (followUpResult?.cleanup) pendingCleanups.push(followUpResult.cleanup);
    const actionOk = result.ok && (!followUpResult || followUpResult.ok);
    const payload = parseJsonFromOutput(result.stdout);
    const followUpPayload = followUpResult ? parseJsonFromOutput(followUpResult.stdout) : null;
    const responsePayload = followUpResult ? { result: payload, afterSuccess: followUpPayload } : payload;
    const summary = [result, followUpResult]
      .filter(Boolean)
      .map((item) => summarizeCommandOutput(item.stdout, item.stderr))
      .join('\n');
    const pending = Boolean(result.pending || followUpResult?.pending);

    return {
      ok: actionOk,
      mode: 'live-write',
      action,
      label: definition.label,
      args: definition.args,
      afterSuccessArgs: definition.afterSuccessArgs,
      checkedAt,
      status: actionOk ? 'completed' : pending ? 'timed-out' : 'failed',
      pending,
      refreshAfter: definition.refreshAfter,
      summary,
      payload: responsePayload ? sanitizePayload(responsePayload) : null,
      error: actionOk ? '' : followUpResult?.error || result.error || summary,
    };
  } finally {
    if (pendingCleanups.length) {
      Promise.allSettled(pendingCleanups).finally(() => activeGBrainActions.delete(action));
    } else {
      activeGBrainActions.delete(action);
    }
  }
}

function sourceById(liveSources, ids) {
  const wanted = new Set(ids.map((id) => normalizeSourceKey(id)));
  return (liveSources?.sources || []).find((source) => wanted.has(normalizeSourceKey(source.id))) || null;
}

function sourceStatusFor(source, sourcesUnavailable) {
  if (sourcesUnavailable) return 'warning';
  if (!source) return 'warning';
  if (source.freshness?.status === 'warning') return 'warning';
  return isWarningSourceStatus(source.status) ? 'warning' : 'healthy';
}

function buildGBrainIntegrationHealth(live = {}, runtime = {}) {
  const liveHealth = live.health?.ok ? live.health : null;
  const liveSources = live.sources?.ok ? live.sources : null;
  const liveTools = live.tools?.ok ? live.tools : null;
  const liveFeatures = live.features?.ok ? live.features : null;
  const liveProviders = live.providers?.ok ? live.providers : null;
  const liveHermesProxy = live.hermesProxy?.ok ? live.hermesProxy : null;
  const toolsUnavailable = Boolean(live.tools && !live.tools.ok);
  const sourcesUnavailable = Boolean(live.sources && !live.sources.ok);
  const requiredTools = liveTools?.requiredTools || REQUIRED_GBRAIN_TOOLS.map((tool) => ({ ...tool, present: false }));
  const presentTools = requiredTools.filter((tool) => tool.present);
  const missingTools = requiredTools.filter((tool) => !tool.present);
  const hermesSource = sourceById(liveSources, ['hermes-agent', 'hermes']);
  const openclawSource = sourceById(liveSources, ['clawd', 'openclaw']);
  const runtimeSystems = runtime?.systems || {};
  const featureGaps = liveFeatures?.recommendations || [];
  const blockingFeatureGaps = featureGaps.filter((item) => item.severity !== 'optional');
  const optionalFeatureGaps = featureGaps.filter((item) => item.severity === 'optional');
  const baseTools = requiredTools.filter((tool) => GBRAIN_BASE_TOOL_IDS.has(tool.id));
  const presentBaseTools = baseTools.filter((tool) => tool.present);
  const missingBaseTools = baseTools.filter((tool) => !tool.present);
  const readSmokeStatus = liveHealth && missingBaseTools.length === 0 ? 'healthy' : 'warning';
  const thinkTool = requiredTools.find((tool) => tool.id === 'think');
  const thinkConfig = runtime?.think || {};
  const thinkProbeAttempted = Boolean(live.tools || live.providers);
  const hasHermesProxyThinkPath = Boolean(liveHermesProxy);
  const thinkRuntimeStatus = !thinkProbeAttempted
    ? 'inactive'
    : !thinkTool?.present
    ? 'critical'
    : (!thinkConfig.configured && !hasHermesProxyThinkPath) || !liveHealth
    ? 'warning'
    : 'healthy';
  const thinkRuntime = {
    status: thinkRuntimeStatus,
    label: thinkRuntimeStatus === 'healthy'
      ? 'think runtime configured'
      : thinkRuntimeStatus === 'critical'
      ? 'think tool missing'
      : thinkRuntimeStatus === 'warning'
      ? 'think exposed but not runtime-ready'
      : 'think runtime not probed',
    detail: !thinkProbeAttempted
      ? 'Live tool/provider probes have not run yet.'
      : !thinkTool?.present
      ? 'GBrain tool discovery did not advertise think.'
      : !thinkConfig.configured && !hasHermesProxyThinkPath
      ? 'Tool discovery advertises think, but no active chat model, provider proxy, or healthy Hermes proxy path is configured for the brain.'
      : !liveHealth
      ? 'A provider path is configured, but live GBrain health proof is unavailable; do not rely on think synthesis yet.'
      : hasHermesProxyThinkPath && !thinkConfig.configured
      ? liveHermesProxy.detail
      : 'Tool discovery, provider configuration, and live health proof are present.',
    proof: [
      'gbrain --tools-json',
      live.providers ? 'gbrain providers explain --json' : '',
      liveHermesProxy ? 'Hermes proxy /health' : '',
      thinkConfig.proof || 'think runtime config not checked',
    ].filter(Boolean).join(' + '),
    checkedAt: liveProviders?.checkedAt || live.providers?.checkedAt || liveTools?.checkedAt || runtime?.checkedAt || null,
    toolPresent: Boolean(thinkTool?.present),
    activeModelConfigured: thinkConfig.modelConfigured === true,
    proxyConfigured: thinkConfig.proxyConfigured === true || hasHermesProxyThinkPath,
    readyChatProviderCount: liveProviders?.readyChatCount ?? 0,
    readyChatProviders: liveProviders?.readyChatProviders || [],
  };

  const systems = GBRAIN_INTEGRATION_CONTRACT.systems.map((system) => {
    const source = system.id === 'hermes' ? hermesSource : openclawSource;
    const runtimeSystem = runtimeSystems[system.id] || {};
    const mcpStatus = runtimeSystem.mcpConfigured === true ? 'healthy' : runtimeSystem.mcpConfigured === false ? 'warning' : 'inactive';
    const contractStatus = runtimeSystem.runtimeContract?.status || 'warning';
    const durableStatus = runtimeSystem.durablePipeline?.status || (system.id === 'hermes' ? 'warning' : 'warning');
    const sourceStatus = sourceStatusFor(source, sourcesUnavailable);
    const statusInputs = [mcpStatus, contractStatus, durableStatus, sourceStatus, readSmokeStatus, thinkRuntime.status].filter((item) => item !== 'inactive');
    const status = statusInputs.includes('critical')
      ? 'critical'
      : statusInputs.includes('warning')
      ? 'warning'
      : 'healthy';

    return {
      id: system.id,
      label: system.label,
      status,
      mcp: {
        configured: runtimeSystem.mcpConfigured === true,
        status: mcpStatus,
        proof: runtimeSystem.mcpProof || system.proof,
      },
      runtimeContract: {
        status: contractStatus,
        proof: runtimeSystem.runtimeContract?.proof || 'runtime contract not verified',
        label: runtimeSystem.runtimeContract?.label || 'GBrain shared-brain contract not verified',
      },
      source: {
        id: source?.id || (system.id === 'hermes' ? 'hermes-agent' : 'clawd'),
        status: sourceStatus,
        lastSyncAt: source?.lastSyncAt || null,
        pages: source?.pages ?? null,
        proof: source ? 'gbrain sources list' : 'source not found in live GBrain list',
      },
      tools: requiredTools.map((tool) => ({ id: tool.id, label: tool.label, present: tool.present, mode: tool.mode })),
      thinkRuntime,
      readSmoke: {
        status: readSmokeStatus,
        proof: liveHealth ? 'gbrain call get_health + gbrain --tools-json' : 'health/tool discovery unavailable',
        checkedAt: liveHealth?.checkedAt || live.tools?.checkedAt || null,
      },
      writeSmoke: {
        status: durableStatus,
        proof: runtimeSystem.durablePipeline?.proof || system.proof,
        label: runtimeSystem.durablePipeline?.label || 'Curated write path not verified',
      },
    };
  });

  const connectedCount = systems.filter((system) => system.mcp.configured).length;
  const healthyCount = systems.filter((system) => system.status === 'healthy').length;
  const status = toolsUnavailable
    ? 'warning'
    : missingTools.length > 0 || blockingFeatureGaps.length > 0 || thinkRuntime.status === 'critical' || thinkRuntime.status === 'warning' || healthyCount < systems.length
    ? 'warning'
    : 'healthy';

  return {
    ok: true,
    status,
    checkedAt: liveHealth?.checkedAt || liveTools?.checkedAt || runtime?.checkedAt || new Date().toISOString(),
    systems,
    connectedCount,
    systemCount: systems.length,
    healthyCount,
    toolContract: {
      status: toolsUnavailable ? 'warning' : missingTools.length > 0 || thinkRuntime.status === 'warning' || thinkRuntime.status === 'critical' ? 'warning' : 'healthy',
      checkedAt: liveTools?.checkedAt || null,
      requiredCount: requiredTools.length,
      presentCount: presentTools.length,
      missingCount: missingTools.length,
      tools: requiredTools,
      baseRequiredCount: baseTools.length,
      basePresentCount: presentBaseTools.length,
      baseMissingCount: missingBaseTools.length,
    },
    thinkRuntime,
    featureGaps: {
      status: blockingFeatureGaps.length > 0 ? 'warning' : live.features && !liveFeatures ? 'warning' : 'healthy',
      checkedAt: liveFeatures?.checkedAt || live.features?.checkedAt || null,
      count: featureGaps.length,
      blockingCount: blockingFeatureGaps.length,
      optionalCount: optionalFeatureGaps.length,
      recommendations: featureGaps,
    },
  };
}

function buildGBrainOverview(live = {}, extra = {}) {
  const liveHealth = live.health?.ok ? live.health : null;
  const liveSources = live.sources?.ok ? live.sources : null;
  const liveVersion = live.version?.ok ? live.version : null;
  const hasIntegrationRuntime = Boolean(extra.integrationRuntime);
  const integrationHealth = buildGBrainIntegrationHealth(live, extra.integrationRuntime || {});
  const liveAttemptedAt = live.health?.checkedAt || live.sources?.checkedAt || live.version?.checkedAt || live.tools?.checkedAt || live.features?.checkedAt || null;
  const liveCheckedAt = liveHealth?.checkedAt || liveSources?.checkedAt || liveVersion?.checkedAt || liveAttemptedAt;
  const healthUnavailable = Boolean(live.health && !live.health.ok);
  const sourcesUnavailable = Boolean(live.sources && !live.sources.ok);
  const versionUnavailable = Boolean(live.version && !live.version.ok);
  const versionValue = liveVersion?.version || '0.40.2.0';
  const versionMetricValue = versionUnavailable ? 'Unavailable' : versionValue;
  const healthScore = liveHealth?.score ?? null;
  const healthValue = healthUnavailable ? 'Unavailable' : healthScore !== null ? `${healthScore}/100` : '9/10';
  const pages = liveHealth?.metrics?.pages ?? liveSources?.totalPages ?? null;
  const chunks = liveHealth?.metrics?.chunks ?? null;
  const embedded = liveHealth?.metrics?.embedded ?? null;
  const missing = liveHealth?.metrics?.missingEmbeddings ?? null;
  const stalePages = liveHealth?.metrics?.stalePages ?? null;
  const coverage = liveHealth?.metrics?.embeddingCoverage ?? null;
  const hasMissingEmbeddings = Number.isFinite(missing) && missing > 0;
  const queue = liveHealth?.metrics?.queue || {};
  const hasLiveQueueCounters = [queue.waiting, queue.active, queue.stalled].every(Number.isFinite);
  const queueUnavailable = Boolean(liveHealth && !hasLiveQueueCounters);
  const healthStatus = liveHealthStatus(liveHealth, healthUnavailable);
  const queueStatus = healthUnavailable ? 'warning' : queueUnavailable ? 'warning' : healthStatus;
  const sourceStatus = liveSourceStatus(liveSources, sourcesUnavailable);
  const queueValue = hasLiveQueueCounters
    ? `${queue.waiting} / ${queue.active} / ${queue.stalled}`
    : liveHealth ? 'Unavailable' : '0 / 0 / 0';
  const sourceCount = liveSources?.count ?? null;
  const sourceWarnings = liveSources?.warningCount ?? null;
  const sourceFreshness = liveSources?.freshness || null;
  const staleSourceCount = sourceFreshness?.staleCount ?? 0;
  const sourceFreshnessStatus = sourceFreshness?.status || sourceStatus;
  const sourceFreshnessDetail = sourcesUnavailable
    ? 'source freshness unavailable'
    : liveSources && sourceFreshness
    ? staleSourceCount > 0
      ? `${staleSourceCount} source${staleSourceCount === 1 ? '' : 's'} stale or missing sync proof`
      : `all sync-tracked sources fresh under ${sourceFreshness.defaultThresholdHours}h default`
    : 'saved audit has no freshness thresholds';
  const sourceRisks = sourcesUnavailable
    ? ['Live source probe could not reach the local GBrain runtime.']
    : staleSourceCount > 0
    ? sourceFreshness.staleSources.map((source) => `${source.id} freshness is ${source.label.toLowerCase()}.`)
    : sourceWarnings > 0
    ? [`${sourceWarnings} live source${sourceWarnings === 1 ? '' : 's'} reported a warning status.`]
    : [];
  const hasRuntimeIntegrationWarning = hasIntegrationRuntime && Boolean(liveAttemptedAt) && integrationHealth.systems.some((system) => [
    system.mcp?.status,
    system.runtimeContract?.status,
    system.readSmoke?.status,
    system.writeSmoke?.status,
  ].some((status) => status === 'warning' || status === 'critical'));
  const activeCaveats = [
    ...(healthUnavailable ? ['Live health probe unavailable.'] : []),
    ...(sourcesUnavailable ? ['Live source probe unavailable.'] : []),
    ...(stalePages > 0 ? [`Live health reports ${formatCount(stalePages)} stale page${stalePages === 1 ? '' : 's'}.`] : []),
    ...(hasMissingEmbeddings ? [`Live health reports ${formatCount(missing)} missing embedding${missing === 1 ? '' : 's'}.`] : []),
    ...(staleSourceCount > 0 ? [`${staleSourceCount} source${staleSourceCount === 1 ? '' : 's'} exceeded freshness thresholds.`] : []),
    ...((sourceWarnings || 0) > 0 ? [`${sourceWarnings} live source${sourceWarnings === 1 ? '' : 's'} reported a warning status.`] : []),
    ...(hasRuntimeIntegrationWarning ? ['Integration health warning: runtime readiness is degraded.'] : []),
    ...(integrationHealth.thinkRuntime?.status === 'warning' || integrationHealth.thinkRuntime?.status === 'critical'
      ? [`${integrationHealth.thinkRuntime.label}: ${integrationHealth.thinkRuntime.detail}`]
      : []),
  ];
  const hasActiveCaveats = activeCaveats.length > 0;

  const nodes = [
    {
      id: 'gbrain-core',
      label: 'GBrain Core',
      kind: 'core',
      status: healthStatus,
      summary: 'Postgres-backed local shared memory for Hermes, OpenClaw, and Codex.',
      proof: {
        label: liveHealth || healthUnavailable ? 'Live health probe' : 'Hermes audit',
        source: liveHealth || healthUnavailable ? 'gbrain call get_health' : AUDIT_REPORT_PATH,
        verifiedAt: liveCheckedAt || AUDIT_VERIFIED_AT,
        detail: healthUnavailable
          ? `Read-only health probe is unavailable: ${live.health.error}`
          : liveHealth
          ? `Read-only health probe returned ${liveHealth.status}.`
          : 'Installed GBrain 0.40.2.0; engine is Postgres-backed; health 9/10.',
      },
      metrics: [
        { label: 'Version', value: versionMetricValue },
        { label: 'Pages', value: pages !== null ? formatCount(pages) : healthUnavailable ? 'Unavailable' : '15,713' },
        { label: 'Chunks', value: chunks !== null ? formatCount(chunks) : healthUnavailable ? 'Unavailable' : '191,638' },
        { label: 'Embedded', value: embedded !== null ? formatCount(embedded) : healthUnavailable ? 'Unavailable' : '191,638' },
        ...(stalePages !== null ? [{ label: 'Stale pages', value: formatCount(stalePages) }] : []),
      ],
      risks: [
        liveHealth
          ? stalePages > 0
            ? 'Live health reports stale pages; do not treat current data as fully live.'
            : 'Live probe is read-only and does not prove write or repair paths.'
          : healthUnavailable
          ? 'Live GBrain health probe could not reach the local runtime.'
          : 'Green state is based on the latest saved audit, not a live mutation or repair run.',
        GBRAIN_INTEGRATION_CONTRACT.localMemoryBoundary,
      ],
      nextSafeAction: liveHealth
        ? 'Use the allowlisted Operator Actions for local maintenance; keep arbitrary repair commands outside this surface.'
        : healthUnavailable
        ? 'Restore local GBrain database connectivity, then refresh this page.'
        : 'Restore local GBrain database connectivity, then refresh the live health probe.',
    },
    {
      id: 'hermes',
      label: 'Hermes hmudur',
      kind: 'agent',
      status: 'healthy',
      summary: 'Conversational operator surface reading GBrain through the MCP bridge while keeping Hermes profile memory local.',
      proof: {
        label: 'Read smoke passed',
        source: AUDIT_REPORT_PATH,
        verifiedAt: AUDIT_VERIFIED_AT,
        detail: 'Hermes hmudur read smoke passed through GBrain MCP.',
      },
      metrics: [
        { label: 'Bridge', value: 'MCP read' },
        { label: 'Memory boundary', value: 'Local + curated' },
      ],
      risks: ['Do not promote raw Hermes transcripts or private profile memory into GBrain.'],
      nextSafeAction: 'Store bridge smoke results as structured JSON instead of report text.',
    },
    {
      id: 'openclaw',
      label: 'OpenClaw',
      kind: 'agent',
      status: 'healthy',
      summary: 'Runtime tool surface with verified GBrain tool-call reads while keeping OpenClaw native memory local.',
      proof: {
        label: 'Tool smoke passed',
        source: AUDIT_REPORT_PATH,
        verifiedAt: AUDIT_VERIFIED_AT,
        detail: 'OpenClaw read smoke passed through GBrain tool with failures 0.',
      },
      metrics: [
        { label: 'Failures', value: '0' },
        { label: 'Memory boundary', value: 'Local + shared recall' },
      ],
      risks: ['Do not mirror raw OpenClaw sessions, credentials, or untagged runtime memory into GBrain.'],
      nextSafeAction: 'Expose latest gateway bridge proof without writing to memory.',
    },
    {
      id: 'codex',
      label: 'Codex',
      kind: 'agent',
      status: 'healthy',
      summary: 'Local Codex memories and workspace sessions included as GBrain sources.',
      proof: {
        label: 'Source registered',
        source: AUDIT_REPORT_PATH,
        verifiedAt: AUDIT_VERIFIED_AT,
        detail: 'Sources include codex-memories and mission-control.',
      },
      metrics: [{ label: 'Mode', value: 'source' }],
      risks: ['Codex is represented as one node in v1; App, memories, and sessions may split later.'],
      nextSafeAction: 'Decide whether Codex needs separate app, memory, and workspace nodes.',
    },
    {
      id: 'sources',
      label: 'Source Systems',
      kind: 'source',
      status: sourceStatus,
      summary: liveSources
        ? 'Project sources feeding the shared brain, verified by the live source probe.'
        : 'Project sources feeding the shared brain, verified by the saved audit.',
      proof: {
        label: liveSources || sourcesUnavailable ? 'Live source probe' : 'Source list captured',
        source: liveSources || sourcesUnavailable ? 'gbrain sources list' : AUDIT_REPORT_PATH,
        verifiedAt: liveSources?.checkedAt || live.sources?.checkedAt || AUDIT_VERIFIED_AT,
        detail: sourcesUnavailable
          ? `Read-only source probe is unavailable: ${live.sources.error}`
          : liveSources
          ? `Read-only source probe returned ${sourceCount} registered source${sourceCount === 1 ? '' : 's'}.`
          : 'Sources include clawd, hermes-agent, gbrain, codex-memories, finance-analyzer, mission-control, PDFQuickFix, JapaneseBuddy, gstack.',
      },
      metrics: [
        { label: 'Known sources', value: sourceCount !== null ? String(sourceCount) : '9' },
        ...(liveSources?.totalPages ? [{ label: 'Source pages', value: formatCount(liveSources.totalPages) }] : []),
        ...(sourceFreshness ? [{ label: 'Stale sources', value: String(staleSourceCount) }] : []),
      ],
      risks: sourceRisks,
      nextSafeAction: liveSources
        ? staleSourceCount > 0
          ? 'Refresh stale source syncs before relying on this as live runtime context.'
          : 'Keep source freshness thresholds visible as the live shape evolves.'
        : sourcesUnavailable
        ? 'Restore local GBrain database connectivity, then refresh this page.'
        : 'Restore local GBrain database connectivity, then refresh the live source probe.',
    },
    {
      id: 'queues',
      label: 'Embedding Queues',
      kind: 'queue',
      status: queueStatus,
      summary: hasMissingEmbeddings
        ? `Embedding coverage reports ${formatCount(missing)} missing embedding${missing === 1 ? '' : 's'} in the latest live audit.`
        : 'Embedding coverage and minion queue are clean in the latest audit.',
      proof: {
        label: liveHealth || healthUnavailable ? 'Live queue probe' : 'Queue audit',
        source: liveHealth || healthUnavailable ? 'gbrain jobs stats --json' : AUDIT_REPORT_PATH,
        verifiedAt: liveCheckedAt || AUDIT_VERIFIED_AT,
        detail: healthUnavailable
          ? `Read-only jobs probe is unavailable because health is unavailable: ${live.health.error}`
          : queueUnavailable
          ? 'Read-only health probe refreshed, but jobs stats counters were unavailable.'
          : liveHealth
          ? 'Read-only health and jobs probes refreshed embedding and queue counters.'
          : 'Embed coverage 100%; missing embeddings 0; 0 waiting, 0 active, 0 stalled.',
      },
      metrics: [
        { label: 'Coverage', value: coverage !== null ? formatPercent(coverage) : healthUnavailable ? 'Unavailable' : '100%' },
        { label: 'Missing', value: missing !== null ? formatCount(missing) : healthUnavailable ? 'Unavailable' : '0' },
        { label: 'Stalled', value: Number.isFinite(queue.stalled) ? formatCount(queue.stalled) : liveHealth || healthUnavailable ? 'Unavailable' : '0' },
      ],
      risks: [
        ...(healthUnavailable ? ['Live health and jobs probes were unavailable; queue counters are not current.'] : []),
        ...(queueUnavailable ? ['Live jobs stats counters were not available; do not treat queue depth as clean.'] : []),
        ...(hasMissingEmbeddings ? [`Live health reports ${formatCount(missing)} missing embedding${missing === 1 ? '' : 's'}.`] : []),
      ],
      nextSafeAction: healthUnavailable
        ? 'Restore local GBrain database connectivity, then refresh the live queue probe.'
        : hasMissingEmbeddings
        ? 'Run the embedding repair/backfill path before calling this node clean.'
        : 'Refresh at a conservative interval to avoid false negatives or extra load.',
    },
    {
      id: 'google-bridge',
      label: 'Google Bridge',
      kind: 'bridge',
      status: 'healthy',
      summary: 'Custom local Google bridge is operational and tracked with bridge-specific proof.',
      proof: {
        label: 'Custom bridge proof captured',
        source: AUDIT_REPORT_PATH,
        verifiedAt: AUDIT_VERIFIED_AT,
        detail: 'Custom local Google bridge is verified separately from the official integrations doctor.',
      },
      metrics: [{ label: 'Bridge signal', value: 'custom verified' }],
      risks: [],
      nextSafeAction: 'Keep the bridge-specific proof fresh alongside Gmail and Calendar ingest checks.',
    },
  ];

  const edges = [
    { id: 'edge-hermes-gbrain', from: 'hermes', to: 'gbrain-core', label: 'read', status: 'healthy', proofNodeId: 'hermes' },
    { id: 'edge-openclaw-gbrain', from: 'openclaw', to: 'gbrain-core', label: 'tool read', status: 'healthy', proofNodeId: 'openclaw' },
    { id: 'edge-codex-gbrain', from: 'codex', to: 'gbrain-core', label: 'source sync', status: 'healthy', proofNodeId: 'codex' },
    { id: 'edge-sources-gbrain', from: 'sources', to: 'gbrain-core', label: 'sync', status: sourceStatus, proofNodeId: 'sources' },
    { id: 'edge-queues-gbrain', from: 'queues', to: 'gbrain-core', label: 'embed', status: queueStatus, proofNodeId: 'queues' },
    { id: 'edge-google-gbrain', from: 'google-bridge', to: 'gbrain-core', label: 'bridge', status: 'healthy', proofNodeId: 'google-bridge' },
  ];

  const overview = {
    ok: true,
    mode: liveAttemptedAt ? 'live-read-only' : 'read-only-fixture',
    refreshedAt: liveCheckedAt || AUDIT_VERIFIED_AT,
    evidenceFreshness: liveAttemptedAt ? 'live-read-only' : 'saved-audit',
    title: 'GBrain',
    subtitle: 'Shared memory for Hermes, OpenClaw, and Codex',
    trust: {
      label: healthUnavailable
        ? 'Health probe unavailable'
        : stalePages > 0 || staleSourceCount > 0
        ? 'Live data stale'
        : hasActiveCaveats
        ? liveHealth
          ? 'Live with caveats'
          : 'Trusted with caveats'
        : liveHealth
        ? 'Live trusted'
        : 'Trusted',
      status: healthUnavailable ? 'warning' : hasActiveCaveats && healthStatus === 'healthy' ? 'warning' : healthStatus,
      score: healthScore ?? 90,
      lastVerifiedAt: liveCheckedAt || AUDIT_VERIFIED_AT,
      source: liveAttemptedAt ? 'gbrain call get_health' : AUDIT_REPORT_PATH,
    },
    cockpit: {
      health: { label: 'Health', value: healthValue, status: healthStatus, proofNodeId: 'gbrain-core' },
      version: {
        label: 'Active version',
        value: versionUnavailable ? 'Unavailable' : versionValue,
        detail: liveVersion ? 'gbrain --version' : versionUnavailable ? 'version probe unavailable' : 'saved audit baseline',
        status: versionUnavailable ? 'warning' : healthStatus,
        proofNodeId: 'gbrain-core',
      },
      embeddings: {
        label: 'Embeddings',
        value: healthUnavailable ? 'Unavailable' : coverage !== null ? formatPercent(coverage) : '100%',
        detail: healthUnavailable
          ? 'health probe unavailable'
          : stalePages > 0
          ? `${formatCount(stalePages)} stale pages`
          : `${missing !== null ? formatCount(missing) : '0'} missing`,
        status: healthStatus,
        proofNodeId: 'queues',
      },
      freshness: {
        label: 'Freshness',
        value: sourcesUnavailable ? 'Unavailable' : staleSourceCount > 0 ? `${staleSourceCount} stale` : liveSources ? 'Fresh' : 'Audit',
        detail: sourceFreshnessDetail,
        status: sourcesUnavailable ? 'warning' : sourceFreshnessStatus,
        proofNodeId: 'sources',
      },
      queue: {
        label: 'Queue',
        value: healthUnavailable ? 'Unavailable' : queueValue,
        detail: healthUnavailable ? 'health probe unavailable' : queueUnavailable ? 'jobs stats unavailable' : 'waiting / active / stalled',
        status: queueStatus,
        proofNodeId: 'queues',
      },
      memoryRole: {
        label: 'Memory role',
        value: 'Shared brain',
        detail: 'Hermes/OpenClaw keep local memory; GBrain stores curated cross-system knowledge',
        status: 'healthy',
        proofNodeId: 'gbrain-core',
      },
      integration: {
        label: 'Integration health',
        value: `${integrationHealth.connectedCount}/${integrationHealth.systemCount} connected`,
        detail: `${integrationHealth.toolContract.basePresentCount}/${integrationHealth.toolContract.baseRequiredCount} base tools; think ${statusLabelText(integrationHealth.thinkRuntime.status)}; ${integrationHealth.featureGaps.optionalCount} optional feature${integrationHealth.featureGaps.optionalCount === 1 ? '' : 's'}`,
        status: integrationHealth.status,
        proofNodeId: 'gbrain-core',
      },
      think: {
        label: 'Think runtime',
        value: integrationHealth.thinkRuntime.status === 'healthy' ? 'Ready' : integrationHealth.thinkRuntime.status === 'inactive' ? 'Not probed' : 'Unverified',
        detail: integrationHealth.thinkRuntime.detail,
        status: integrationHealth.thinkRuntime.status === 'inactive' ? 'warning' : integrationHealth.thinkRuntime.status,
        proofNodeId: 'gbrain-core',
      },
      autopilot: { label: 'Operator actions', value: 'Allowlisted', detail: `${listGBrainActions().length} local actions; probes remain read-only`, status: 'healthy', proofNodeId: 'gbrain-core' },
      bridge: { label: 'Bridge proof', value: '2 passed', detail: 'Hermes + OpenClaw read smokes', status: 'healthy', proofNodeId: 'hermes' },
      caveats: {
        label: 'Caveats',
        value: String(activeCaveats.length),
        detail: activeCaveats.length ? activeCaveats.join(' ') : 'No active caveats',
        status: activeCaveats.length ? 'warning' : 'healthy',
        proofNodeId: activeCaveats.length ? (staleSourceCount > 0 || (sourceWarnings || 0) > 0 ? 'sources' : 'queues') : 'gbrain-core',
      },
    },
    nodes,
    edges,
    caveats: activeCaveats,
    warnings: [],
    integrationContract: GBRAIN_INTEGRATION_CONTRACT,
    integrationHealth,
    handoff: {
      source: DESIGN_HANDOFF_PATH,
      recommendedNextSlice: liveHealth || liveSources
        ? 'Live health/source freshness thresholds are connected read-only.'
        : liveAttemptedAt
        ? 'Live health/source endpoints are connected read-only, but the local GBrain runtime is unavailable.'
        : 'Live health/source endpoints are present but the local GBrain runtime is unavailable.',
    },
    live: {
      health: live.health || null,
      sources: live.sources || null,
      version: live.version || null,
      tools: live.tools || null,
      features: live.features || null,
    },
  };

  if (extra.timelineSummary) overview.timelineSummary = extra.timelineSummary;
  if (extra.incidentBanner !== undefined) overview.incidentBanner = extra.incidentBanner;
  return overview;
}

function statusLabelText(status) {
  if (status === 'healthy') return 'ready';
  if (status === 'critical') return 'missing';
  if (status === 'warning') return 'unverified';
  return 'not probed';
}

function buildGBrainRouter(options = {}) {
  const router = express.Router();
  const timelineService = options.timelineService || createGBrainTimelineService({
    projectRoot: options.projectRoot,
    enabled: options.mcConfig?.modules?.gbrainTimeline !== false,
    ledgerPath: options.timelineLedgerPath,
  });

  router.get('/api/gbrain/overview', async (req, res) => {
    const [health, sources, version, tools, features, providers, hermesProxy] = await Promise.all([
      buildLiveGBrainHealth(options),
      buildLiveGBrainSources(options),
      buildLiveGBrainVersion(options),
      buildLiveGBrainTools(options),
      buildLiveGBrainFeatures(options),
      buildLiveGBrainProviders(options),
      buildLiveHermesProxyStatus(options),
    ]);
    const integrationRuntime = buildLocalGBrainIntegrationRuntime(options);
    const overview = buildGBrainOverview({ health, sources, version, tools, features, providers, hermesProxy }, { integrationRuntime });
    const result = await timelineService.captureOverview(overview);
    res.json(buildGBrainOverview({ health, sources, version, tools, features, providers, hermesProxy }, {
      integrationRuntime,
      timelineSummary: result.timelineSummary,
      incidentBanner: result.timelineSummary?.incidentBanner || null,
    }));
  });

  router.get('/api/gbrain/health', async (req, res) => {
    res.json(await buildLiveGBrainHealth(options));
  });

  router.get('/api/gbrain/sources', async (req, res) => {
    res.json(await buildLiveGBrainSources(options));
  });

  router.get('/api/gbrain/version', async (req, res) => {
    res.json(await buildLiveGBrainVersion(options));
  });

  router.get('/api/gbrain/integration-health', async (req, res) => {
    const [health, sources, tools, features, providers, hermesProxy] = await Promise.all([
      buildLiveGBrainHealth(options),
      buildLiveGBrainSources(options),
      buildLiveGBrainTools(options),
      buildLiveGBrainFeatures(options),
      buildLiveGBrainProviders(options),
      buildLiveHermesProxyStatus(options),
    ]);
    res.json(buildGBrainIntegrationHealth({ health, sources, tools, features, providers, hermesProxy }, buildLocalGBrainIntegrationRuntime(options)));
  });

  router.get('/api/gbrain/actions', (req, res) => {
    res.json({
      ok: true,
      mode: 'live-write-allowlist',
      actions: listGBrainActions(),
    });
  });

  router.post('/api/gbrain/actions', async (req, res) => {
    const result = await runGBrainAction(req.body?.action, options);
    const statusCode = result.ok ? 200 : result.status === 'busy' ? 409 : result.status === 'failed' ? 502 : 400;
    res.status(statusCode).json(result);
  });

  router.get('/api/gbrain/timeline', (req, res) => {
    res.json(timelineService.readTimeline({ limit: req.query.limit }));
  });

  return router;
}

module.exports = {
  buildGBrainOverview,
  buildLiveGBrainHealth,
  buildLiveGBrainSources,
  buildLiveGBrainVersion,
  buildLiveGBrainTools,
  buildLiveGBrainFeatures,
  buildLiveGBrainProviders,
  buildLiveHermesProxyStatus,
  buildGBrainIntegrationHealth,
  buildLocalGBrainIntegrationRuntime,
  listGBrainActions,
  runGBrainAction,
  buildGBrainRouter,
  sanitizeMessage,
  liveHealthStatus,
};
