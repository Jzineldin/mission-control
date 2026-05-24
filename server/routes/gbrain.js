const express = require('express');
const util = require('util');
const os = require('os');
const { execFile } = require('child_process');
const { createGBrainTimelineService } = require('../services/gbrainTimeline');

const AUDIT_REPORT_PATH = '~/hermes-workspace/reports/gbrain-full-audit-20260524.md';
const DESIGN_HANDOFF_PATH = 'docs/gbrain-hybrid-brain-view-handoff-20260524.md';
const AUDIT_VERIFIED_AT = '2026-05-24T00:00:00.000Z';
const DEFAULT_COMMAND_TIMEOUT_MS = 7000;

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

async function runGBrain(execFilePromise, args) {
  try {
    const pathEntries = [
      `${os.homedir()}/.bun/bin`,
      '/opt/homebrew/bin',
      '/usr/local/bin',
      process.env.PATH || '',
    ].filter(Boolean);
    const result = await execFilePromise('gbrain', args, {
      timeout: DEFAULT_COMMAND_TIMEOUT_MS,
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

function liveHealthStatus(liveHealth, healthUnavailable = false) {
  if (healthUnavailable) return 'critical';
  if (!liveHealth) return 'warning';
  const rawStatus = String(liveHealth.status || '').toLowerCase();
  const score = Number(liveHealth.score);
  if (/critical|fail|error|unavailable/.test(rawStatus)) return 'critical';
  if (Number.isFinite(score) && score < 90) return 'warning';
  if (/warn|degrad|unknown/.test(rawStatus)) return 'warning';
  return 'healthy';
}

function liveSourceStatus(liveSources, sourcesUnavailable = false) {
  if (sourcesUnavailable) return 'critical';
  if (!liveSources) return 'warning';
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
  const coverage = findNumber(healthPayload, ['embed_coverage', 'embedding_coverage', 'coverage']);
  const waiting = findNumber(jobsPayload, ['waiting', 'queued', 'pending']);
  const active = findNumber(jobsPayload, ['active', 'running', 'processing']);
  const stalled = findNumber(jobsPayload, ['stalled', 'dead']);
  const rawStatus = findString(healthPayload, ['status', 'health_status']);
  const status = rawStatus || (score !== null && score >= 90 ? 'healthy' : 'unknown');

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
  const waiting = numberFromText(jobsText, /Queue health:\s*(\d+)\s+waiting/i);
  const active = numberFromText(jobsText, /Queue health:\s*\d+\s+waiting,\s*(\d+)\s+active/i);
  const stalled = numberFromText(jobsText, /Queue health:\s*\d+\s+waiting,\s*\d+\s+active,\s*(\d+)\s+stalled/i);

  if (score === null && coveragePercent === null && missing === null) return null;

  return {
    ok: true,
    mode: 'live-read-only',
    checkedAt,
    status: score !== null && score >= 7 ? 'healthy' : 'warning',
    score: score !== null ? score * 10 : null,
    metrics: {
      pages: null,
      chunks: null,
      embedded: null,
      missingEmbeddings: missing,
      embeddingCoverage: coveragePercent !== null ? coveragePercent : null,
      queue: { waiting, active, stalled },
    },
  };
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
      return {
        id: String(source.id || source.name || source.source || 'unknown'),
        status: String(status),
        pages,
        chunks: Number.isFinite(Number(source.chunks || source.chunk_count)) ? Number(source.chunks || source.chunk_count) : null,
      };
    })
    .filter((source) => source.id && source.id !== 'unknown');
  const totalPages = sources.reduce((sum, source) => sum + (source.pages || 0), 0);

  return {
    ok: true,
    mode: 'live-read-only',
    checkedAt,
    count: sources.length,
    totalPages,
    healthyCount: sources.filter((source) => isHealthySourceStatus(source.status)).length,
    warningCount: sources.filter((source) => isWarningSourceStatus(source.status)).length,
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
      const synced = /last sync\s+([^\s]+)/i.test(line);
      const neverSynced = /never synced/i.test(line);
      const statusColumn = columns.find((column) => /ok|clean|healthy|synced|warn|corrupt|dirty|missing|error|fail/i.test(column));
      const kind = columns.find((column, index) => index > 0 && !column.includes('/')) || 'unknown';
      const status = neverSynced ? 'never-synced' : synced ? 'synced' : statusColumn || kind;
      return {
        id,
        status,
        pages: pageMatch ? Number(pageMatch[1].replace(/,/g, '')) : null,
        chunks: null,
      };
    })
    .filter(Boolean);
  const totalPages = sources.reduce((sum, source) => sum + (source.pages || 0), 0);

  return {
    ok: sources.length > 0,
    mode: 'live-read-only',
    checkedAt,
    count: sources.length,
    totalPages,
    healthyCount: sources.filter((source) => isHealthySourceStatus(source.status)).length,
    warningCount: sources.filter((source) => isWarningSourceStatus(source.status)).length,
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
    return normalizeHealthPayload(healthPayload, jobsPayload, checkedAt);
  }

  const fallbackHealthResult = await runGBrain(execFilePromise, ['health', '--json']);
  const fallbackPayload = parseJsonFromOutput(fallbackHealthResult.stdout);
  if (fallbackHealthResult.ok && fallbackPayload) {
    return normalizeHealthPayload(fallbackPayload, jobsPayload, checkedAt);
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

  return textHealth;
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

function buildGBrainOverview(live = {}, extra = {}) {
  const liveHealth = live.health?.ok ? live.health : null;
  const liveSources = live.sources?.ok ? live.sources : null;
  const liveAttemptedAt = live.health?.checkedAt || live.sources?.checkedAt || null;
  const liveCheckedAt = liveHealth?.checkedAt || liveSources?.checkedAt || liveAttemptedAt;
  const healthUnavailable = Boolean(live.health && !live.health.ok);
  const sourcesUnavailable = Boolean(live.sources && !live.sources.ok);
  const healthScore = liveHealth?.score ?? null;
  const healthValue = healthUnavailable ? 'Unavailable' : healthScore !== null ? `${healthScore}/100` : '9/10';
  const pages = liveHealth?.metrics?.pages ?? liveSources?.totalPages ?? null;
  const chunks = liveHealth?.metrics?.chunks ?? null;
  const embedded = liveHealth?.metrics?.embedded ?? null;
  const missing = liveHealth?.metrics?.missingEmbeddings ?? null;
  const coverage = liveHealth?.metrics?.embeddingCoverage ?? null;
  const queue = liveHealth?.metrics?.queue || {};
  const hasLiveQueueCounters = [queue.waiting, queue.active, queue.stalled].every(Number.isFinite);
  const queueUnavailable = Boolean(liveHealth && !hasLiveQueueCounters);
  const healthStatus = liveHealthStatus(liveHealth, healthUnavailable);
  const queueStatus = healthUnavailable ? 'critical' : queueUnavailable ? 'warning' : healthStatus;
  const sourceStatus = liveSourceStatus(liveSources, sourcesUnavailable);
  const queueValue = hasLiveQueueCounters
    ? `${queue.waiting} / ${queue.active} / ${queue.stalled}`
    : liveHealth ? 'Unavailable' : '0 / 0 / 0';
  const sourceCount = liveSources?.count ?? null;
  const sourceWarnings = liveSources?.warningCount ?? null;
  const sourceRisks = sourcesUnavailable
    ? ['Live source probe could not reach the local GBrain runtime.']
    : sourceWarnings > 0
    ? [`${sourceWarnings} live source${sourceWarnings === 1 ? '' : 's'} reported a warning status.`]
    : [];
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
        { label: 'Pages', value: pages !== null ? formatCount(pages) : '15,713' },
        { label: 'Chunks', value: chunks !== null ? formatCount(chunks) : '191,638' },
        { label: 'Embedded', value: embedded !== null ? formatCount(embedded) : '191,638' },
      ],
      risks: [
        liveHealth
          ? 'Live probe is read-only and does not prove write or repair paths.'
          : healthUnavailable
          ? 'Live GBrain health probe could not reach the local runtime.'
          : 'Green state is based on the latest saved audit, not a live mutation or repair run.',
      ],
      nextSafeAction: liveHealth
        ? 'Keep write and repair controls outside this read-only surface.'
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
      ],
      risks: sourceRisks,
      nextSafeAction: liveSources
        ? 'Add per-source freshness thresholds after the live shape is stable.'
        : sourcesUnavailable
        ? 'Restore local GBrain database connectivity, then refresh this page.'
        : 'Restore local GBrain database connectivity, then refresh the live source probe.',
    },
    {
      id: 'queues',
      label: 'Embedding Queues',
      kind: 'queue',
      status: queueStatus,
      summary: 'Embedding coverage and minion queue are clean in the latest audit.',
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
        { label: 'Coverage', value: coverage !== null ? formatPercent(coverage) : '100%' },
        { label: 'Missing', value: missing !== null ? formatCount(missing) : '0' },
        { label: 'Stalled', value: Number.isFinite(queue.stalled) ? formatCount(queue.stalled) : liveHealth ? 'Unavailable' : '0' },
      ],
      risks: queueUnavailable ? ['Live jobs stats counters were not available; do not treat queue depth as clean.'] : [],
      nextSafeAction: 'Refresh at a conservative interval to avoid false negatives or extra load.',
    },
    {
      id: 'google-bridge',
      label: 'Google Bridge',
      kind: 'bridge',
      status: 'warning',
      summary: 'Custom local bridge caveat is documented: the official integrations doctor is not the proof source for it.',
      proof: {
        label: 'Bridge caveat captured',
        source: AUDIT_REPORT_PATH,
        verifiedAt: AUDIT_VERIFIED_AT,
        detail: 'Official integrations doctor does not represent the custom local Google bridge.',
      },
      metrics: [{ label: 'Doctor signal', value: 'mismatch' }],
      risks: ['Do not treat official doctor output as proof of this custom local bridge; use bridge-specific proof when available.'],
      nextSafeAction: 'Add a bridge-specific proof record later; do not block the overview on official doctor mismatch.',
    },
  ];

  const edges = [
    { id: 'edge-hermes-gbrain', from: 'hermes', to: 'gbrain-core', label: 'read', status: 'healthy', proofNodeId: 'hermes' },
    { id: 'edge-openclaw-gbrain', from: 'openclaw', to: 'gbrain-core', label: 'tool read', status: 'healthy', proofNodeId: 'openclaw' },
    { id: 'edge-codex-gbrain', from: 'codex', to: 'gbrain-core', label: 'source sync', status: 'healthy', proofNodeId: 'codex' },
    { id: 'edge-sources-gbrain', from: 'sources', to: 'gbrain-core', label: 'sync', status: sourceStatus, proofNodeId: 'sources' },
    { id: 'edge-queues-gbrain', from: 'queues', to: 'gbrain-core', label: 'embed', status: queueStatus, proofNodeId: 'queues' },
    { id: 'edge-google-gbrain', from: 'google-bridge', to: 'gbrain-core', label: 'bridge', status: 'warning', proofNodeId: 'google-bridge' },
  ];

  const overview = {
    ok: true,
    mode: liveAttemptedAt ? 'live-read-only' : 'read-only-fixture',
    refreshedAt: liveCheckedAt || AUDIT_VERIFIED_AT,
    evidenceFreshness: liveAttemptedAt ? 'live-read-only' : 'saved-audit',
    title: 'GBrain',
    subtitle: 'Shared memory for Hermes, OpenClaw, and Codex',
    trust: {
      label: healthUnavailable ? 'Live check unavailable' : liveHealth ? 'Live with caveats' : 'Trusted with caveats',
      status: healthUnavailable ? 'critical' : healthStatus === 'healthy' ? 'warning' : healthStatus,
      score: healthScore ?? 90,
      lastVerifiedAt: liveCheckedAt || AUDIT_VERIFIED_AT,
      source: liveAttemptedAt ? 'gbrain call get_health' : AUDIT_REPORT_PATH,
    },
    cockpit: {
      health: { label: 'Health', value: healthValue, status: healthStatus, proofNodeId: 'gbrain-core' },
      embeddings: {
        label: 'Embeddings',
        value: healthUnavailable ? 'Unavailable' : coverage !== null ? formatPercent(coverage) : '100%',
        detail: healthUnavailable ? 'health probe unavailable' : `${missing !== null ? formatCount(missing) : '0'} missing`,
        status: healthStatus,
        proofNodeId: 'queues',
      },
      queue: { label: 'Queue', value: healthUnavailable ? 'Unavailable' : queueValue, detail: queueUnavailable ? 'jobs stats unavailable' : 'waiting / active / stalled', status: queueStatus, proofNodeId: 'queues' },
      autopilot: { label: 'Autopilot', value: 'Read-only', detail: 'No mutation controls in v1', status: 'inactive', proofNodeId: 'gbrain-core' },
      bridge: { label: 'Bridge proof', value: '2 passed', detail: 'Hermes + OpenClaw read smokes', status: 'healthy', proofNodeId: 'hermes' },
      caveats: {
        label: 'Caveats',
        value: sourceWarnings !== null ? String(1 + sourceWarnings) : '1',
        detail: sourcesUnavailable
          ? 'Bridge caveat; source probe unavailable'
          : liveAttemptedAt && sourceWarnings > 0
          ? 'Bridge caveat plus live source warnings'
          : 'Google bridge doctor mismatch',
        status: 'warning',
        proofNodeId: 'google-bridge',
      },
    },
    nodes,
    edges,
    caveats: [
      'Official integrations doctor does not represent the custom local Google bridge.',
      ...((sourceWarnings || 0) > 0 ? [`${sourceWarnings} live source${sourceWarnings === 1 ? '' : 's'} reported a warning status.`] : []),
    ],
    warnings: [],
    handoff: {
      source: DESIGN_HANDOFF_PATH,
      recommendedNextSlice: liveHealth || liveSources
        ? 'Live health/source endpoints are connected read-only; next slice is freshness thresholds.'
        : liveAttemptedAt
        ? 'Live health/source endpoints are connected read-only, but the local GBrain runtime is unavailable.'
        : 'Live health/source endpoints are present but the local GBrain runtime is unavailable.',
    },
    live: {
      health: live.health || null,
      sources: live.sources || null,
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
    const [health, sources] = await Promise.all([
      buildLiveGBrainHealth(options),
      buildLiveGBrainSources(options),
    ]);
    const overview = buildGBrainOverview({ health, sources });
    const result = await timelineService.captureOverview(overview);
    res.json(buildGBrainOverview({ health, sources }, {
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

  router.get('/api/gbrain/timeline', (req, res) => {
    res.json(timelineService.readTimeline({ limit: req.query.limit }));
  });

  return router;
}

module.exports = {
  buildGBrainOverview,
  buildLiveGBrainHealth,
  buildLiveGBrainSources,
  buildGBrainRouter,
  sanitizeMessage,
  liveHealthStatus,
};
