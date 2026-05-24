const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_RETENTION = 1000;
const HEARTBEAT_MS = 60 * 60 * 1000;
const DEFAULT_SOURCE_THRESHOLD_HOURS = 24;
const DEFAULT_SOURCE_THRESHOLDS = {
  missionControl: 12,
  clawd: 24,
  hermes: 24,
  openclaw: 24,
  codex: 48,
  default: DEFAULT_SOURCE_THRESHOLD_HOURS,
};

const processLocks = new Map();

function sanitizeTimelineText(value) {
  return String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-[redacted]')
    .replace(/\/(?:Users|home)\/[^/\s]+/g, '~')
    .replace(/"((?:token|apiKey|api_key|cookie|authorization))"\s*:\s*"[^"]+"/gi, '"$1":"[redacted]"')
    .slice(0, 300);
}

function sanitizeTimelineValue(value) {
  if (typeof value === 'string') return sanitizeTimelineText(value);
  if (Array.isArray(value)) return value.map(sanitizeTimelineValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeTimelineValue(item)]),
    );
  }
  return value;
}

function normalizeStatus(status) {
  const value = String(status || 'inactive').toLowerCase();
  if (value === 'healthy' || value === 'warning' || value === 'critical' || value === 'inactive') return value;
  if (/fail|error|critical|unavailable/.test(value)) return 'critical';
  if (/warn|stale|degrad|caveat|unknown/.test(value)) return 'warning';
  if (/ok|clean|healthy|synced|verified/.test(value)) return 'healthy';
  return 'inactive';
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashValue(value) {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex').slice(0, 16);
}

function thresholdForSource(sourceId, thresholds = DEFAULT_SOURCE_THRESHOLDS) {
  const key = String(sourceId || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const foundKey = Object.keys(thresholds).find((candidate) => candidate.toLowerCase() === key);
  return Number(thresholds[foundKey] || thresholds.default || DEFAULT_SOURCE_THRESHOLD_HOURS);
}

function normalizeSnapshot(overview, options = {}) {
  const now = options.capturedAt || overview?.refreshedAt || new Date().toISOString();
  const nodes = Array.isArray(overview?.nodes) ? overview.nodes : [];
  const cockpit = overview?.cockpit || {};
  const sourcesNode = nodes.find((node) => node.id === 'sources');
  const bridgeNodes = nodes
    .filter((node) => node.kind === 'agent' || node.kind === 'bridge')
    .map((node) => ({
      id: String(node.id),
      label: sanitizeTimelineText(node.label),
      status: normalizeStatus(node.status),
      proofLabel: sanitizeTimelineText(node.proof?.label || ''),
      proofSource: sanitizeTimelineText(node.proof?.source || ''),
      verifiedAt: node.proof?.verifiedAt || overview?.refreshedAt || now,
    }));
  const warnings = [
    ...(Array.isArray(overview?.warnings) ? overview.warnings : []),
    ...(Array.isArray(overview?.caveats) ? overview.caveats : []),
  ].map(sanitizeTimelineText);
  const sourceThresholdHours = thresholdForSource('default', options.sourceThresholds);
  const sourceFreshness = {
    defaultThresholdHours: sourceThresholdHours,
    status: normalizeStatus(sourcesNode?.status || 'inactive'),
    label: sourcesNode ? `Default ${sourceThresholdHours}h threshold` : 'No source proof loaded',
    warningCount: Number(overview?.live?.sources?.warningCount || 0),
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    id: hashValue({ now, trust: overview?.trust, warnings }),
    capturedAt: now,
    actor: options.actor || 'mission-control',
    trust: {
      label: sanitizeTimelineText(overview?.trust?.label || 'No trust state'),
      status: normalizeStatus(overview?.trust?.status),
      score: Number.isFinite(Number(overview?.trust?.score)) ? Number(overview.trust.score) : null,
      source: sanitizeTimelineText(overview?.trust?.source || ''),
      lastVerifiedAt: overview?.trust?.lastVerifiedAt || overview?.refreshedAt || now,
    },
    metrics: {
      health: sanitizeTimelineText(cockpit.health?.value || ''),
      embeddings: sanitizeTimelineText(cockpit.embeddings?.value || ''),
      embeddingsDetail: sanitizeTimelineText(cockpit.embeddings?.detail || ''),
      queue: sanitizeTimelineText(cockpit.queue?.value || ''),
      caveats: sanitizeTimelineText(cockpit.caveats?.value || ''),
      bridge: sanitizeTimelineText(cockpit.bridge?.value || ''),
    },
    bridgeProof: bridgeNodes,
    sourceFreshness,
    warnings,
  };
}

function fingerprintSnapshot(snapshot) {
  return hashValue({
    schemaVersion: snapshot.schemaVersion,
    trust: {
      label: snapshot.trust?.label,
      status: snapshot.trust?.status,
      score: snapshot.trust?.score,
      source: snapshot.trust?.source,
    },
    metrics: snapshot.metrics,
    bridgeProof: snapshot.bridgeProof?.map((item) => ({
      id: item.id,
      status: item.status,
      proofLabel: item.proofLabel,
      proofSource: item.proofSource,
    })),
    sourceFreshness: snapshot.sourceFreshness,
    warnings: snapshot.warnings,
  });
}

function timelinePathFor(projectRoot) {
  return path.join(projectRoot, 'data', 'gbrain', 'evidence-timeline.jsonl');
}

function parseLimit(value, defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultLimit;
  return Math.min(Math.floor(parsed), maxLimit);
}

function readTimeline(options = {}) {
  const ledgerPath = options.ledgerPath || timelinePathFor(options.projectRoot || process.cwd());
  const limit = parseLimit(options.limit, options.defaultLimit, options.maxLimit);
  const warnings = [];
  if (!fs.existsSync(ledgerPath)) {
    return {
      enabled: true,
      entries: [],
      warnings,
      malformedLineCount: 0,
      retainedEntryCount: 0,
      truncated: false,
      limit,
      schemaVersion: SCHEMA_VERSION,
    };
  }

  let text = '';
  try {
    text = fs.readFileSync(ledgerPath, 'utf8');
  } catch (error) {
    return {
      enabled: true,
      entries: [],
      warnings: [`Timeline ledger unreadable: ${sanitizeTimelineText(error.message)}`],
      malformedLineCount: 0,
      retainedEntryCount: 0,
      truncated: false,
      limit,
      schemaVersion: SCHEMA_VERSION,
    };
  }

  const entries = [];
  let malformedLineCount = 0;
  const lines = text.split('\n').filter(Boolean);
  for (const [index, line] of lines.entries()) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object') entries.push(sanitizeTimelineValue(parsed));
    } catch (error) {
      malformedLineCount += 1;
      warnings.push(`Malformed timeline line ${index + 1}: ${sanitizeTimelineText(error.message)}`);
    }
  }

  const retainedEntryCount = entries.length;
  const sorted = entries.sort((a, b) => String(b.capturedAt || '').localeCompare(String(a.capturedAt || '')));
  const limited = sorted.slice(0, limit);
  return {
    enabled: true,
    entries: limited,
    warnings,
    malformedLineCount,
    retainedEntryCount,
    truncated: sorted.length > limited.length,
    limit,
    schemaVersion: SCHEMA_VERSION,
  };
}

function pruneTimeline(options = {}) {
  const ledgerPath = options.ledgerPath || timelinePathFor(options.projectRoot || process.cwd());
  const retention = options.retention || DEFAULT_RETENTION;
  const current = readTimeline({ ...options, limit: retention, maxLimit: retention, defaultLimit: retention });
  if (!fs.existsSync(ledgerPath) || current.retainedEntryCount <= retention) return current;
  try {
    const nextText = current.entries
      .slice()
      .reverse()
      .map((entry) => JSON.stringify(entry))
      .join('\n');
    fs.writeFileSync(ledgerPath, `${nextText}\n`, 'utf8');
    return readTimeline(options);
  } catch (error) {
    return {
      ...current,
      warnings: [...current.warnings, `Timeline retention prune failed: ${sanitizeTimelineText(error.message)}`],
    };
  }
}

function computeTrustDiff(current, previous) {
  if (!current) return { kind: 'none', changes: [], summary: 'No timeline proof yet.' };
  if (!previous) return { kind: 'first-snapshot', changes: [], summary: 'First timeline proof captured.' };
  const changes = [];
  const checks = [
    ['trust.status', current.trust?.status, previous.trust?.status],
    ['trust.score', current.trust?.score, previous.trust?.score],
    ['health', current.metrics?.health, previous.metrics?.health],
    ['embeddings', current.metrics?.embeddings, previous.metrics?.embeddings],
    ['queue', current.metrics?.queue, previous.metrics?.queue],
    ['caveats', current.metrics?.caveats, previous.metrics?.caveats],
    ['sourceFreshness.status', current.sourceFreshness?.status, previous.sourceFreshness?.status],
  ];
  for (const [field, next, prior] of checks) {
    if (next !== prior) changes.push({ field, from: prior ?? null, to: next ?? null });
  }
  return {
    kind: changes.length ? 'changed' : 'unchanged',
    changes,
    summary: changes.length ? `${changes.length} trust field${changes.length === 1 ? '' : 's'} changed.` : 'No material trust change.',
  };
}

function severityRank(status) {
  return { inactive: 0, healthy: 1, warning: 2, critical: 3 }[normalizeStatus(status)] || 0;
}

function buildIncidentBanner(current, previous) {
  if (!current) return null;
  const reasons = [];
  if (current.trust?.status === 'critical') reasons.push('Current trust proof is failing.');
  if (previous && severityRank(current.trust?.status) > severityRank(previous.trust?.status)) {
    reasons.push(`Trust changed from ${previous.trust?.status || 'unknown'} to ${current.trust.status}.`);
  }
  if (previous && current.metrics?.queue !== previous.metrics?.queue && /[1-9]/.test(String(current.metrics?.queue || ''))) {
    reasons.push(`Queue changed from ${previous.metrics?.queue || 'unknown'} to ${current.metrics.queue}.`);
  }
  const currentWarnings = Number(current.metrics?.caveats);
  const previousWarnings = Number(previous?.metrics?.caveats);
  if (Number.isFinite(currentWarnings) && Number.isFinite(previousWarnings) && currentWarnings > previousWarnings) {
    reasons.push(`Caveats increased from ${previousWarnings} to ${currentWarnings}.`);
  }
  if (!reasons.length) return null;
  return {
    status: current.trust?.status === 'critical' ? 'critical' : 'warning',
    title: 'Trust evidence changed',
    detail: reasons.join(' '),
    snapshotId: current.id,
  };
}

function summarizeTimeline(readResult, captureResult = {}) {
  const entries = readResult.entries || [];
  const [latest, previous] = entries;
  const diff = computeTrustDiff(latest, previous);
  const incidentBanner = buildIncidentBanner(latest, previous);
  const warning = captureResult.warning || readResult.warnings?.[0] || '';
  return {
    enabled: true,
    status: captureResult.warning || readResult.malformedLineCount ? 'warning' : 'healthy',
    lastCapturedAt: latest?.capturedAt || null,
    lastCaptureReason: captureResult.reason || 'not-captured',
    skippedDuplicateCount: captureResult.skippedDuplicateCount || 0,
    malformedLineCount: readResult.malformedLineCount || 0,
    retainedEntryCount: readResult.retainedEntryCount || 0,
    warning,
    diff,
    incidentBanner,
  };
}

function appendSnapshot(ledgerPath, snapshot) {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.appendFileSync(ledgerPath, `${JSON.stringify(snapshot)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'a' });
}

async function captureSnapshotIfNeeded(overview, options = {}) {
  const ledgerPath = options.ledgerPath || timelinePathFor(options.projectRoot || process.cwd());
  const lockKey = ledgerPath;
  if (processLocks.has(lockKey)) return processLocks.get(lockKey);

  const run = (async () => {
    try {
      const snapshot = normalizeSnapshot(overview, options);
      const fingerprint = fingerprintSnapshot(snapshot);
      const current = readTimeline({ ...options, ledgerPath, limit: 1, defaultLimit: 1, maxLimit: 1 });
      const latest = current.entries[0] || null;
      const latestFingerprint = latest ? fingerprintSnapshot(latest) : '';
      const latestCapturedAt = latest?.capturedAt ? Date.parse(latest.capturedAt) : NaN;
      const heartbeatElapsed = !Number.isFinite(latestCapturedAt) || (Date.parse(snapshot.capturedAt) - latestCapturedAt) >= (options.heartbeatMs || HEARTBEAT_MS);

      if (latest && latestFingerprint === fingerprint && !heartbeatElapsed) {
        return {
          captured: false,
          reason: 'skipped-duplicate',
          snapshot: latest,
          skippedDuplicateCount: 1,
          warning: current.warnings[0] || '',
        };
      }

      const reason = latest && latestFingerprint === fingerprint ? 'heartbeat' : 'changed';
      const nextSnapshot = { ...snapshot, fingerprint };
      appendSnapshot(ledgerPath, nextSnapshot);
      const pruned = pruneTimeline({ ...options, ledgerPath });
      return {
        captured: true,
        reason,
        snapshot: nextSnapshot,
        skippedDuplicateCount: 0,
        warning: pruned.warnings[0] || '',
      };
    } catch (error) {
      return {
        captured: false,
        reason: 'failed',
        warning: `Timeline capture failed: ${sanitizeTimelineText(error.message)}`,
        skippedDuplicateCount: 0,
      };
    }
  })();

  processLocks.set(lockKey, run);
  try {
    return await run;
  } finally {
    processLocks.delete(lockKey);
  }
}

function createGBrainTimelineService(options = {}) {
  const projectRoot = options.projectRoot || process.cwd();
  const ledgerPath = options.ledgerPath || timelinePathFor(projectRoot);
  const enabled = options.enabled !== false;
  const baseOptions = {
    projectRoot,
    ledgerPath,
    sourceThresholds: options.sourceThresholds || DEFAULT_SOURCE_THRESHOLDS,
    heartbeatMs: options.heartbeatMs || HEARTBEAT_MS,
    retention: options.retention || DEFAULT_RETENTION,
    defaultLimit: options.defaultLimit || DEFAULT_LIMIT,
    maxLimit: options.maxLimit || MAX_LIMIT,
  };

  return {
    enabled,
    ledgerPath,
    async captureOverview(overview) {
      if (!enabled) {
        return {
          overview,
          timelineSummary: {
            enabled: false,
            status: 'inactive',
            lastCapturedAt: null,
            lastCaptureReason: 'disabled',
            skippedDuplicateCount: 0,
            malformedLineCount: 0,
            retainedEntryCount: 0,
            warning: '',
            diff: { kind: 'disabled', changes: [], summary: 'Evidence Timeline disabled.' },
            incidentBanner: null,
          },
        };
      }
      const capture = await captureSnapshotIfNeeded(overview, baseOptions);
      const readResult = readTimeline({ ...baseOptions, limit: 2 });
      return {
        overview,
        timelineSummary: summarizeTimeline(readResult, capture),
      };
    },
    readTimeline(query = {}) {
      if (!enabled) {
        return {
          enabled: false,
          entries: [],
          warnings: [],
          malformedLineCount: 0,
          retainedEntryCount: 0,
          truncated: false,
          limit: parseLimit(query.limit, baseOptions.defaultLimit, baseOptions.maxLimit),
          schemaVersion: SCHEMA_VERSION,
          diff: { kind: 'disabled', changes: [], summary: 'Evidence Timeline disabled.' },
          incidentBanner: null,
        };
      }
      const result = readTimeline({ ...baseOptions, limit: query.limit });
      return {
        ...result,
        diff: computeTrustDiff(result.entries[0], result.entries[1]),
        incidentBanner: buildIncidentBanner(result.entries[0], result.entries[1]),
      };
    },
  };
}

module.exports = {
  SCHEMA_VERSION,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  DEFAULT_SOURCE_THRESHOLDS,
  sanitizeTimelineText,
  normalizeSnapshot,
  fingerprintSnapshot,
  captureSnapshotIfNeeded,
  readTimeline,
  pruneTimeline,
  computeTrustDiff,
  buildIncidentBanner,
  createGBrainTimelineService,
  timelinePathFor,
};
