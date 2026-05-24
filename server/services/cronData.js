const fs = require('fs');
const path = require('path');

function writeJsonFileAtomic(filePath, value) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const existingMode = fs.existsSync(filePath) ? fs.statSync(filePath).mode & 0o777 : null;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  if (existingMode !== null) fs.chmodSync(tmpPath, existingMode);
  fs.renameSync(tmpPath, filePath);
}

function parseJsonCandidates(raw = '') {
  const text = String(raw || '').trim();
  if (!text) return [];

  const candidates = [];
  const seen = new Set();
  const pushCandidate = (candidate) => {
    const normalized = String(candidate || '').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  pushCandidate(text);
  const objStart = text.indexOf('{');
  const objEnd = text.lastIndexOf('}');
  if (objStart !== -1 && objEnd !== -1 && objEnd >= objStart) {
    pushCandidate(text.slice(objStart, objEnd + 1));
  }
  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd !== -1 && arrEnd >= arrStart) {
    pushCandidate(text.slice(arrStart, arrEnd + 1));
  }

  for (let start = 0; start < text.length; start += 1) {
    const opener = text[start];
    if (opener !== '{' && opener !== '[') continue;
    const closer = opener === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let end = start; end < text.length; end += 1) {
      const char = text[end];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === opener) depth += 1;
      if (char === closer) {
        depth -= 1;
        if (depth === 0) {
          pushCandidate(text.slice(start, end + 1));
          break;
        }
      }
    }
  }

  return candidates;
}

function parseFirstJson(raw = '', fallback = null) {
  const text = String(raw || '').trim();
  if (!text) return fallback;

  try {
    return JSON.parse(text);
  } catch {}

  const candidates = parseJsonCandidates(raw);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {}
  }
  const jsonIdx = text.indexOf('{"jobs"');
  if (jsonIdx !== -1) {
    const start = text.lastIndexOf('{', jsonIdx);
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const candidate = text.slice(start, end + 1);
      try {
        return JSON.parse(candidate);
      } catch {}
    }
  }
  return fallback;
}

function extractJsonPayload(raw = '') {
  const text = String(raw || '').trim();
  if (!text) throw new Error('Empty JSON payload');

  const unwrapCronJobs = (parsed) => {
    if (Array.isArray(parsed)) return { jobs: parsed };
    if (!parsed || typeof parsed !== 'object') return null;

    const queue = [parsed];
    const visited = new Set();
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || typeof current !== 'object' || visited.has(current)) continue;
      visited.add(current);

      if (Array.isArray(current.jobs)) return current === parsed ? parsed : { jobs: current.jobs };

      for (const key of ['result', 'details', 'payload', 'data']) {
        const next = current[key];
        if (next && typeof next === 'object') queue.push(next);
      }
    }

    return null;
  };

  const parsed = parseFirstJson(raw);
  if (parsed) {
    const unwrapped = unwrapCronJobs(parsed);
    if (unwrapped) return unwrapped;
  }

  throw new Error('No cron jobs JSON found in CLI output');
}

function parseCronTableOutput(output) {
  const lines = (output || '').split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0];
  const colStarts = [];
  for (let index = 0; index < header.length; index += 1) {
    if (header[index] !== ' ' && (index === 0 || header[index - 1] === ' ')) {
      colStarts.push(index);
    }
  }

  const jobs = [];
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || line.startsWith('=') || !line.match(/^[0-9a-f]/)) continue;

    const parts = [];
    for (let cursor = 0; cursor < colStarts.length - 1; cursor += 1) {
      parts.push(line.slice(colStarts[cursor], colStarts[cursor + 1]).trim());
    }
    parts.push(line.slice(colStarts[colStarts.length - 1]).trim());

    if (!parts[0] || !parts[0].match(/^[0-9a-f]{8}/)) continue;

    const parseRelative = (value) => {
      if (!value || value === '—' || value === '-' || value === 'never') return null;
      const now = Date.now();
      const future = value.match(/^in\s+(\d+)([mhd])/);
      if (future) {
        const amount = Number.parseInt(future[1], 10);
        const unit = future[2];
        const offset = unit === 'm' ? amount * 60000 : unit === 'h' ? amount * 3600000 : amount * 86400000;
        return new Date(now + offset).toISOString();
      }
      const past = value.match(/^(\d+)([mhd])\s+ago$/);
      if (past) {
        const amount = Number.parseInt(past[1], 10);
        const unit = past[2];
        const offset = unit === 'm' ? amount * 60000 : unit === 'h' ? amount * 3600000 : amount * 86400000;
        return new Date(now - offset).toISOString();
      }
      return null;
    };

    jobs.push({
      id: parts[0],
      name: parts[1] || 'Unnamed',
      schedule: { expr: parts[2] || '?' },
      state: {
        lastStatus: (parts[5] || '').toLowerCase(),
        lastRunAtMs: parseRelative(parts[4]) ? new Date(parseRelative(parts[4])).getTime() : null,
        nextRunAtMs: parseRelative(parts[3]) ? new Date(parseRelative(parts[3])).getTime() : null,
      },
      sessionTarget: parts[6] || 'isolated',
      model: parts[8] || '',
      enabled: String(parts[5] || '').toLowerCase() !== 'disabled',
      payload: { kind: 'agentTurn' },
    });
  }

  return jobs;
}

function createCronService({
  openclawExec,
  gatewayPort,
  gatewayToken,
  getOpenclawDefaultModelKey,
  calendarFile,
  homeDir = process.env.MC_USER_HOME || process.env.HOME || '/Users/yordamkocatepe',
  hermesProfile = process.env.HERMES_PROFILE || 'hmudur',
}) {
  const openclawCronRunsDir = path.join(homeDir, '.openclaw', 'cron', 'runs');
  const hermesCronJobsFile = path.join(homeDir, '.hermes', 'profiles', hermesProfile, 'cron', 'jobs.json');
  const maxHistoryRuns = 10;

  function normalizeCronRunStatus(job = {}) {
    if (job.enabled === false) return 'disabled';
    const raw = String(job.state?.lastStatus || job.state?.lastRunStatus || '').trim().toLowerCase();
    if (['ok', 'active', 'running', 'success'].includes(raw)) return 'active';
    if (['failed', 'error', 'errored'].includes(raw)) return 'failed';
    if (job.state?.nextRunAtMs) return 'scheduled';
    return 'idle';
  }

  function readRunHistory(jobId = '', scheduler = 'openclaw') {
    if (scheduler !== 'openclaw') return [];
    const runFile = path.join(openclawCronRunsDir, `${jobId}.jsonl`);
    try {
      const content = fs.readFileSync(runFile, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      const runs = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line.trim());
          runs.push({
            ts: entry.ts || entry.runAtMs || null,
            status: entry.status || 'unknown',
            durationMs: entry.durationMs || null,
            runAtMs: entry.runAtMs || null,
            error: entry.error || null,
          });
        } catch {}
      }
      return runs.reverse().slice(0, maxHistoryRuns);
    } catch {
      return [];
    }
  }

  function isHermesJob(job = {}) {
    return String(job.scheduler || job.source || '').toLowerCase() === 'hermes';
  }

  function isOpenclawJob(job = {}) {
    return !isHermesJob(job);
  }

  function getCronJobSourceId(job = {}) {
    return String(job.sourceId || job.id || '');
  }

  function getCronJobApiId(job = {}) {
    const scheduler = isHermesJob(job) ? 'hermes' : 'openclaw';
    const sourceId = getCronJobSourceId(job);
    return sourceId.includes(':') ? sourceId : `${scheduler}:${sourceId}`;
  }

  function getCronJobActions(job = {}) {
    if (isHermesJob(job)) {
      return { run: false, toggle: true, delete: false, model: true };
    }
    return { run: true, toggle: true, delete: true, model: true };
  }

  function mapCronJobForApi(job = {}) {
    const scheduler = isHermesJob(job) ? 'hermes' : 'openclaw';
    const sourceId = getCronJobSourceId(job);
    return {
      id: getCronJobApiId(job),
      sourceId,
      name: job.name || String(job.id || '').substring(0, 8) || 'Unnamed job',
      scheduler,
      schedulerLabel: scheduler === 'hermes' ? 'Hermes' : 'OpenClaw',
      schedule: job.schedule?.expr || job.schedule?.display || job.schedule_display || job.schedule?.kind || '?',
      status: normalizeCronRunStatus(job),
      lastRun: job.state?.lastRunAtMs ? new Date(job.state.lastRunAtMs).toISOString() : null,
      nextRun: job.state?.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : null,
      duration: job.state?.lastDurationMs ? `${job.state.lastDurationMs}ms` : null,
      target: job.sessionTarget || 'main',
      payload: job.payload?.kind || '?',
      model: job.payload?.model || job.model || (scheduler === 'openclaw' ? getOpenclawDefaultModelKey() : '') || '',
      thinking: job.payload?.thinking || '',
      description: job.payload?.text?.substring(0, 120) || job.payload?.message?.substring(0, 120) || job.prompt?.substring(0, 120) || '',
      history: readRunHistory(sourceId, scheduler),
      enabled: job.enabled !== false,
      actions: getCronJobActions(job),
    };
  }

  function toMsOrNull(value) {
    if (!value) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
  }

  function normalizeHermesCronJob(job = {}) {
    const lastStatus = job.last_status || job.lastStatus || job.state;
    return {
      ...job,
      scheduler: 'hermes',
      sourceId: job.id,
      schedule: {
        kind: job.schedule?.kind || 'cron',
        expr: job.schedule?.expr || job.schedule_display || job.schedule?.display || '?',
        display: job.schedule_display || job.schedule?.display || job.schedule?.expr || '?',
      },
      sessionTarget: job.deliver || job.sessionTarget || 'origin',
      payload: {
        kind: job.prompt ? 'agentTurn' : (job.payload?.kind || 'cron'),
        message: job.prompt || job.payload?.message || '',
        model: [job.provider, job.model].filter(Boolean).join('/') || job.model || '',
        thinking: job.thinking || job.payload?.thinking || '',
      },
      state: {
        lastRunAtMs: toMsOrNull(job.last_run_at || job.lastRunAt),
        nextRunAtMs: toMsOrNull(job.next_run_at || job.nextRunAt),
        lastStatus,
        lastRunStatus: lastStatus,
        lastDurationMs: job.last_duration_ms || job.lastDurationMs || null,
      },
    };
  }

  function readHermesCronJobsFromDisk() {
    try {
      const parsed = JSON.parse(fs.readFileSync(hermesCronJobsFile, 'utf8'));
      const jobs = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.jobs) ? parsed.jobs : []);
      return jobs.map((job) => normalizeHermesCronJob(job));
    } catch {
      return [];
    }
  }

  function splitHermesModelRef(modelRef = '') {
    const normalized = String(modelRef || '').trim();
    if (!normalized || normalized === 'default') return { provider: null, model: null, base_url: null };
    if (normalized === 'custom/qwen3.6:35b-a3b-nvfp4' || normalized === 'ollama/qwen3.6:35b-a3b-nvfp4') {
      return { provider: 'custom', model: 'qwen3.6:35b-a3b-nvfp4', base_url: 'http://127.0.0.1:11434/v1' };
    }
    if (normalized === 'openai-codex/gpt-5.5' || normalized === 'openai-codex/openai/gpt-5.5' || normalized === 'openai/gpt-5.5') {
      return { provider: 'openai-codex', model: 'openai/gpt-5.5', base_url: null };
    }
    const slash = normalized.indexOf('/');
    if (slash > 0) {
      const provider = normalized.slice(0, slash);
      const model = normalized.slice(slash + 1);
      if (provider === 'openai-codex') return { provider, model, base_url: null };
      if (provider === 'custom' || provider === 'ollama') return { provider: 'custom', model, base_url: 'http://127.0.0.1:11434/v1' };
      return { provider, model, base_url: null };
    }
    return { provider: null, model: normalized, base_url: null };
  }

  function patchHermesCronJob(sourceId = '', patch = {}) {
    const parsed = JSON.parse(fs.readFileSync(hermesCronJobsFile, 'utf8'));
    const jobs = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.jobs) ? parsed.jobs : []);
    const index = jobs.findIndex((candidate) => String(candidate.id) === String(sourceId));
    if (index === -1) {
      const error = new Error(`Hermes cron job not found: ${sourceId}`);
      error.statusCode = 404;
      throw error;
    }

    const nextJob = { ...jobs[index], ...patch };
    const nextJobs = jobs.slice();
    nextJobs[index] = nextJob;
    const output = Array.isArray(parsed) ? nextJobs : { ...parsed, jobs: nextJobs };
    writeJsonFileAtomic(hermesCronJobsFile, output);
    return normalizeHermesCronJob(nextJob);
  }

  function updateHermesCronJobModel(sourceId = '', modelRef = '') {
    const next = splitHermesModelRef(modelRef);
    return patchHermesCronJob(sourceId, {
      provider: next.provider,
      model: next.model,
      base_url: next.base_url,
    });
  }

  function updateHermesCronJobEnabled(sourceId = '', enabled = true) {
    return patchHermesCronJob(sourceId, { enabled: enabled !== false });
  }


  async function fetchOpenclawCronJobsLive() {
    try {
      const { stdout, stderr } = await openclawExec(['cron', 'list', '--json', '--all'], 15000);
      const raw = [stdout, stderr].filter(Boolean).join('\n');
      if (raw.trim()) {
        try {
          const result = extractJsonPayload(raw);
          const jobs = Array.isArray(result) ? result : (Array.isArray(result?.jobs) ? result.jobs : []);
          if (jobs.length > 0) {
            return jobs.map((job) => ({ ...job, scheduler: 'openclaw', sourceId: job.id }));
          }
        } catch {}
      }
    } catch {}

    try {
      const { stdout } = await openclawExec(['cron', 'list'], 15000);
      const jobs = parseCronTableOutput(stdout);
      if (jobs.length > 0) return jobs.map((job) => ({ ...job, scheduler: 'openclaw', sourceId: job.id }));
    } catch {}

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`http://127.0.0.1:${gatewayPort}/tools/invoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${gatewayToken}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          tool: 'cron',
          args: { action: 'list' },
        }),
      });
      const data = await response.json();
      const details = data?.result?.details;
      if (details?.jobs || Array.isArray(details)) {
        const jobs = Array.isArray(details) ? details : details.jobs;
        return (jobs || []).map((job) => ({ ...job, scheduler: 'openclaw', sourceId: job.id }));
      }
      const textResult = data?.result?.content?.[0]?.text || '{}';
      const result = extractJsonPayload(textResult);
      const jobs = Array.isArray(result) ? result : (Array.isArray(result?.jobs) ? result.jobs : []);
      return jobs.map((job) => ({ ...job, scheduler: 'openclaw', sourceId: job.id }));
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchCronJobsLive() {
    const [openclawJobs, hermesJobs] = await Promise.all([
      fetchOpenclawCronJobsLive().catch(() => []),
      Promise.resolve(readHermesCronJobsFromDisk()).catch(() => []),
    ]);
    return { jobs: [...openclawJobs, ...hermesJobs] };
  }

  function toIsoOrNull(value) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  function normalizeCalendarEntry(entry = {}, nowIso = new Date().toISOString()) {
    return {
      id: String(entry.id || `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      title: String(entry.title || 'Untitled').trim() || 'Untitled',
      schedule: String(entry.schedule || ''),
      startsAt: toIsoOrNull(entry.startsAt),
      status: String(entry.status || 'scheduled'),
      assignee: String(entry.assignee || 'Mudur'),
      source: String(entry.source || 'manual'),
      linkedTaskId: entry.linkedTaskId || null,
      linkedJobId: entry.linkedJobId || null,
      notes: String(entry.notes || ''),
      createdAt: toIsoOrNull(entry.createdAt) || nowIso,
      updatedAt: toIsoOrNull(entry.updatedAt) || nowIso,
      lastSyncedAt: toIsoOrNull(entry.lastSyncedAt) || toIsoOrNull(entry.updatedAt) || nowIso,
    };
  }

  function sortCalendarEntries(entries = []) {
    return [...entries].sort((left, right) => {
      const leftTime = left.startsAt ? new Date(left.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right.startsAt ? new Date(right.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (leftTime !== rightTime) return leftTime - rightTime;
      return String(left.title || '').localeCompare(String(right.title || ''));
    });
  }

  function readCalendarDataSafe() {
    try {
      if (!fs.existsSync(calendarFile)) {
        return { entries: [], updatedAt: null, lastCronSyncAt: null };
      }
      const parsed = JSON.parse(fs.readFileSync(calendarFile, 'utf8'));
      const payload = Array.isArray(parsed) ? { entries: parsed } : (parsed || {});
      return {
        entries: sortCalendarEntries((payload.entries || []).map((entry) => normalizeCalendarEntry(entry))),
        updatedAt: toIsoOrNull(payload.updatedAt),
        lastCronSyncAt: toIsoOrNull(payload.lastCronSyncAt),
      };
    } catch (error) {
      console.error('[Calendar read]', error.message);
      return { entries: [], updatedAt: null, lastCronSyncAt: null, error: error.message };
    }
  }

  function writeCalendarDataSafe(payload = {}) {
    const dir = path.dirname(calendarFile);
    fs.mkdirSync(dir, { recursive: true });
    const next = {
      entries: sortCalendarEntries((payload.entries || []).map((entry) => normalizeCalendarEntry(entry))),
      updatedAt: toIsoOrNull(payload.updatedAt) || new Date().toISOString(),
      lastCronSyncAt: toIsoOrNull(payload.lastCronSyncAt),
    };
    fs.writeFileSync(calendarFile, JSON.stringify(next, null, 2), 'utf8');
    return next;
  }

  function mergeCalendarEntriesWithCronJobs(currentData = {}, cronJobs = [], syncedAtIso = new Date().toISOString()) {
    const entries = Array.isArray(currentData.entries)
      ? currentData.entries.map((entry) => normalizeCalendarEntry(entry, syncedAtIso))
      : [];
    const manualEntries = entries.filter((entry) => entry.source !== 'cron' || !entry.linkedJobId);
    const existingCronEntries = new Map(
      entries
        .filter((entry) => entry.linkedJobId)
        .map((entry) => [String(entry.linkedJobId), entry])
    );

    const syncedCronEntries = cronJobs.map((job) => {
      const previous = existingCronEntries.get(String(job.id)) || {};
      return normalizeCalendarEntry({
        ...previous,
        id: previous.id || `cron-${job.id}`,
        title: job.name || previous.title || String(job.id || 'Cron job'),
        schedule: job.schedule?.expr || job.schedule?.kind || previous.schedule || '',
        startsAt: job.state?.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : previous.startsAt || null,
        status: normalizeCronRunStatus(job),
        assignee: previous.assignee || 'Mudur',
        source: 'cron',
        linkedJobId: job.id,
        notes: job.payload?.text || job.payload?.message || previous.notes || '',
        createdAt: previous.createdAt || syncedAtIso,
        updatedAt: syncedAtIso,
        lastSyncedAt: syncedAtIso,
      }, syncedAtIso);
    });

    return {
      entries: [...manualEntries, ...syncedCronEntries],
      updatedAt: syncedAtIso,
      lastCronSyncAt: syncedAtIso,
    };
  }

  async function syncCalendarWithLiveCron() {
    const current = readCalendarDataSafe();
    const parsed = await fetchCronJobsLive();
    const cronJobs = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.jobs) ? parsed.jobs : []);
    if ((!cronJobs || cronJobs.length === 0) && Array.isArray(current.entries) && current.entries.length > 0) {
      return { ...current, warning: 'Live cron fetch returned empty; calendar preserved from last known good snapshot.' };
    }
    const merged = mergeCalendarEntriesWithCronJobs(current, cronJobs, new Date().toISOString());
    return writeCalendarDataSafe(merged);
  }

  function createCalendarEntry(payload = {}) {
    const nowIso = new Date().toISOString();
    if (!String(payload.title || '').trim()) {
      const error = new Error('title required');
      error.statusCode = 400;
      throw error;
    }

    const current = readCalendarDataSafe();
    const entry = normalizeCalendarEntry({
      ...payload,
      id: payload.id || `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastSyncedAt: nowIso,
    }, nowIso);

    const next = writeCalendarDataSafe({
      ...current,
      entries: [...current.entries, entry],
      updatedAt: nowIso,
      lastCronSyncAt: current.lastCronSyncAt,
    });

    return { ok: true, entry, entries: next.entries };
  }

  function updateCalendarEntry(id, payload = {}) {
    const current = readCalendarDataSafe();
    const idx = current.entries.findIndex((entry) => entry.id === id);
    if (idx < 0) {
      const error = new Error('Calendar entry not found');
      error.statusCode = 404;
      throw error;
    }

    const existing = current.entries[idx];
    const nowIso = new Date().toISOString();
    const updated = normalizeCalendarEntry({
      ...existing,
      ...payload,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: nowIso,
      lastSyncedAt: existing.source === 'cron'
        ? (existing.lastSyncedAt || existing.updatedAt || nowIso)
        : nowIso,
    });

    const nextEntries = [...current.entries];
    nextEntries[idx] = updated;
    const next = writeCalendarDataSafe({
      ...current,
      entries: nextEntries,
      updatedAt: nowIso,
      lastCronSyncAt: current.lastCronSyncAt,
    });

    return { ok: true, entry: updated, entries: next.entries };
  }

  function upsertTaskCalendarEntry(task = {}, options = {}) {
    const schedule = String(options.schedule || task.schedule || '').trim();
    const startsAt = toIsoOrNull(options.startsAt || task.scheduleAt || task.startsAt);
    if (!schedule && !startsAt) return null;

    const current = readCalendarDataSafe();
    const existing = current.entries.find((entry) => entry.linkedTaskId === task.id && entry.source !== 'cron');
    const nowIso = new Date().toISOString();
    const entry = normalizeCalendarEntry({
      ...existing,
      id: existing?.id || `task-${task.id}`,
      title: task.title || existing?.title || 'Task',
      schedule: schedule || existing?.schedule || '',
      startsAt: startsAt || existing?.startsAt || null,
      status: options.calendarStatus || task.calendarStatus || existing?.status || 'scheduled',
      assignee: task.assignee || existing?.assignee || 'Mudur',
      source: existing?.source || task.source || 'assistant',
      linkedTaskId: task.id,
      linkedJobId: task.linkedJobId || existing?.linkedJobId || null,
      notes: task.description || existing?.notes || '',
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
      lastSyncedAt: nowIso,
    }, nowIso);

    const nextEntries = current.entries.filter((item) => item.id !== entry.id);
    nextEntries.push(entry);
    writeCalendarDataSafe({
      ...current,
      entries: nextEntries,
      updatedAt: nowIso,
      lastCronSyncAt: current.lastCronSyncAt,
    });

    return entry;
  }

  return {
    parseFirstJson,
    fetchCronJobsLive,
    normalizeCronRunStatus,
    mapCronJobForApi,
    updateHermesCronJobModel,
    updateHermesCronJobEnabled,
    toIsoOrNull,
    normalizeCalendarEntry,
    readCalendarDataSafe,
    writeCalendarDataSafe,
    syncCalendarWithLiveCron,
    createCalendarEntry,
    updateCalendarEntry,
    upsertTaskCalendarEntry,
  };
}

module.exports = {
  createCronService,
  parseFirstJson,
};
