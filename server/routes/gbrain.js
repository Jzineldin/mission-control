const express = require('express');
const util = require('util');
const os = require('os');
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
    description: 'Incrementally sync every registered local source without remote pulls.',
    kind: 'maintenance',
    args: ['sync', '--all', '--no-pull', '--parallel', '1', '--json', '--yes'],
    timeoutMs: 120000,
    refreshAfter: true,
  },
  'retry-failed-sync': {
    label: 'Retry failed syncs',
    description: 'Re-attempt previously failed source files, then refresh live proof.',
    kind: 'repair',
    args: ['sync', '--all', '--retry-failed', '--no-pull', '--parallel', '1', '--json', '--yes'],
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
  try {
    const pathEntries = [
      `${os.homedir()}/.bun/bin`,
      '/opt/homebrew/bin',
      '/usr/local/bin',
      process.env.PATH || '',
    ].filter(Boolean);
    const result = await execFilePromise('gbrain', args, {
      timeout: options.timeoutMs || DEFAULT_COMMAND_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        PATH: pathEntries.join(':'),
      },
    });
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
    command: `gbrain ${definition.args.join(' ')}`,
  }));
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

  return {
    ok: true,
    mode: 'live-read-only',
    checkedAt,
    count: sources.length,
    totalPages,
    healthyCount: sources.filter((source) => isHealthySourceStatus(source.status)).length,
    warningCount: sources.filter((source) => isWarningSourceStatus(source.status) || (source.freshness?.syncTracked !== false && source.freshness?.status === 'warning')).length,
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

  return {
    ok: sources.length > 0,
    mode: 'live-read-only',
    checkedAt,
    count: sources.length,
    totalPages,
    healthyCount: sources.filter((source) => isHealthySourceStatus(source.status)).length,
    warningCount: sources.filter((source) => isWarningSourceStatus(source.status) || (source.freshness?.syncTracked !== false && source.freshness?.status === 'warning')).length,
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
  try {
    const execFilePromise = options.execFilePromise || defaultExecFilePromise;
    const result = await runGBrain(execFilePromise, definition.args, { timeoutMs: definition.timeoutMs });
    const payload = parseJsonFromOutput(result.stdout);

    return {
      ok: result.ok,
      mode: 'live-write',
      action,
      label: definition.label,
      args: definition.args,
      checkedAt,
      status: result.ok ? 'completed' : 'failed',
      refreshAfter: definition.refreshAfter,
      summary: summarizeCommandOutput(result.stdout, result.stderr),
      payload: payload ? sanitizePayload(payload) : null,
      error: result.ok ? '' : result.error || summarizeCommandOutput(result.stdout, result.stderr),
    };
  } finally {
    activeGBrainActions.delete(action);
  }
}

function buildGBrainOverview(live = {}, extra = {}) {
  const liveHealth = live.health?.ok ? live.health : null;
  const liveSources = live.sources?.ok ? live.sources : null;
  const liveVersion = live.version?.ok ? live.version : null;
  const liveAttemptedAt = live.health?.checkedAt || live.sources?.checkedAt || live.version?.checkedAt || null;
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
  const activeCaveats = [
    ...(healthUnavailable ? ['Live health probe unavailable.'] : []),
    ...(sourcesUnavailable ? ['Live source probe unavailable.'] : []),
    ...(stalePages > 0 ? [`Live health reports ${formatCount(stalePages)} stale page${stalePages === 1 ? '' : 's'}.`] : []),
    ...(hasMissingEmbeddings ? [`Live health reports ${formatCount(missing)} missing embedding${missing === 1 ? '' : 's'}.`] : []),
    ...(staleSourceCount > 0 ? [`${staleSourceCount} source${staleSourceCount === 1 ? '' : 's'} exceeded freshness thresholds.`] : []),
    ...((sourceWarnings || 0) > 0 ? [`${sourceWarnings} live source${sourceWarnings === 1 ? '' : 's'} reported a warning status.`] : []),
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
      summary: 'Conversational operator surface reading GBrain through the MCP bridge.',
      proof: {
        label: 'Read smoke passed',
        source: AUDIT_REPORT_PATH,
        verifiedAt: AUDIT_VERIFIED_AT,
        detail: 'Hermes hmudur read smoke passed through GBrain MCP.',
      },
      metrics: [{ label: 'Bridge', value: 'MCP read' }],
      risks: [],
      nextSafeAction: 'Store bridge smoke results as structured JSON instead of report text.',
    },
    {
      id: 'openclaw',
      label: 'OpenClaw',
      kind: 'agent',
      status: 'healthy',
      summary: 'Runtime tool surface with verified GBrain tool-call reads.',
      proof: {
        label: 'Tool smoke passed',
        source: AUDIT_REPORT_PATH,
        verifiedAt: AUDIT_VERIFIED_AT,
        detail: 'OpenClaw read smoke passed through GBrain tool with failures 0.',
      },
      metrics: [{ label: 'Failures', value: '0' }],
      risks: [],
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
      autopilot: { label: 'Operator actions', value: 'Allowlisted', detail: '7 local actions; probes remain read-only', status: 'healthy', proofNodeId: 'gbrain-core' },
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
    },
  };

  if (extra.timelineSummary) overview.timelineSummary = extra.timelineSummary;
  if (extra.incidentBanner !== undefined) overview.incidentBanner = extra.incidentBanner;
  return overview;
}

function buildGBrainRouter(options = {}) {
  const router = express.Router();
  const timelineService = options.timelineService || createGBrainTimelineService({
    projectRoot: options.projectRoot,
    enabled: options.mcConfig?.modules?.gbrainTimeline !== false,
    ledgerPath: options.timelineLedgerPath,
  });

  router.get('/api/gbrain/overview', async (req, res) => {
    const [health, sources, version] = await Promise.all([
      buildLiveGBrainHealth(options),
      buildLiveGBrainSources(options),
      buildLiveGBrainVersion(options),
    ]);
    const overview = buildGBrainOverview({ health, sources, version });
    const result = await timelineService.captureOverview(overview);
    res.json(buildGBrainOverview({ health, sources, version }, {
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
  listGBrainActions,
  runGBrainAction,
  buildGBrainRouter,
  sanitizeMessage,
  liveHealthStatus,
};
