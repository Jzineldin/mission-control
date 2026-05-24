#!/usr/bin/env node
/**
 * openclaw-usage-summary.js
 * Fast, bounded OpenClaw token/cost summary for Mission Control.
 *
 * The official OpenClaw session-cost-usage bundle currently walks every session
 * with loadSessionCostSummary and can hang for minutes on Yordam's session corpus.
 * This script reads the persisted session JSONL usage records directly instead:
 * one pass over recent files, no gateway calls, no per-session bundle fan-out.
 */
const path = require('node:path');
const fs = require('node:fs');
const readline = require('node:readline');
const costSanity = require('../server/services/costSanity');

const VALID_PERIODS = new Set(['day', '7d', 'month']);

function dayKey(date) {
  return date.toLocaleDateString('en-CA', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
}

function rangeForPeriod(period) {
  const now = new Date();
  const start = new Date(now);
  if (period === 'day') {
    start.setHours(0, 0, 0, 0);
    return { startMs: start.getTime(), endMs: now.getTime(), keys: [dayKey(start)], startKey: dayKey(start), endKey: dayKey(now) };
  }
  if (period === '7d') {
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);
    const keys = [];
    const cursor = new Date(start);
    while (cursor <= now) {
      keys.push(dayKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return { startMs: start.getTime(), endMs: now.getTime(), keys, startKey: keys[0], endKey: keys[keys.length - 1] };
  }
  start.setHours(0, 0, 0, 0);
  start.setDate(1);
  const keys = [];
  const cursor = new Date(start);
  while (cursor <= now) {
    keys.push(dayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return { startMs: start.getTime(), endMs: now.getTime(), keys, startKey: keys[0], endKey: keys[keys.length - 1] };
}

function modelName(provider, model) {
  const p = String(provider || '').trim();
  const m = String(model || '').trim();
  if (!p && !m) return 'unknown';
  if (!p) return m;
  if (!m) return p;
  return `${p}/${m}`;
}

function usageCostTotal(cost) {
  if (typeof cost === 'number') return Number.isFinite(cost) ? cost : 0;
  if (!cost || typeof cost !== 'object') return 0;
  return Number(cost.total || cost.totalCost || cost.usd || 0) || 0;
}

function usageNumber(usage, keys) {
  for (const key of keys) {
    if (usage[key] !== undefined && usage[key] !== null) return Number(usage[key]) || 0;
  }
  return 0;
}

function extractUsageRecord(obj, fallbackTimestampMs) {
  if (!obj || typeof obj !== 'object') return null;
  const message = obj.message && typeof obj.message === 'object' ? obj.message : null;
  if (!message || !message.usage || typeof message.usage !== 'object') return null;
  const usage = message.usage;
  const input = usageNumber(usage, ['input', 'inputTokens', 'promptTokens']);
  const output = usageNumber(usage, ['output', 'outputTokens', 'completionTokens']);
  const cacheRead = usageNumber(usage, ['cacheRead', 'cacheReadTokens', 'cachedInputTokens']);
  const cacheWrite = usageNumber(usage, ['cacheWrite', 'cacheWriteTokens']);
  const totalTokens = usageNumber(usage, ['totalTokens', 'tokens']) || input + output + cacheRead + cacheWrite;
  const totalCost = usageCostTotal(usage.cost);
  if (totalTokens <= 0 && totalCost <= 0) return null;

  const timestampRaw = message.timestamp || obj.timestamp;
  const timestampMs = typeof timestampRaw === 'number'
    ? (timestampRaw < 10_000_000_000 ? timestampRaw * 1000 : timestampRaw)
    : Date.parse(timestampRaw || '') || fallbackTimestampMs;

  return {
    timestampMs,
    date: dayKey(new Date(timestampMs)),
    provider: message.provider || message.api || 'unknown',
    model: message.model || message.modelId || 'unknown',
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens,
    totalCost,
  };
}

function listSessionFiles(startMs) {
  const agentsBase = path.join(process.env.HOME || '/home/ubuntu', '.openclaw', 'agents');
  const files = [];
  let agents = [];
  try {
    agents = fs.readdirSync(agentsBase, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name);
  } catch {
    return files;
  }

  for (const agentId of agents) {
    const sessionsDir = path.join(agentsBase, agentId, 'sessions');
    let entries = [];
    try {
      entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl') || entry.name.endsWith('.trajectory.jsonl')) continue;
      const fullPath = path.join(sessionsDir, entry.name);
      try {
        const stat = fs.statSync(fullPath);
        // mtime is a coarse prefilter only; each usage record is checked by timestamp below.
        if (stat.mtimeMs >= startMs - 24 * 60 * 60 * 1000) {
          files.push({ agentId, path: fullPath, mtimeMs: stat.mtimeMs });
        }
      } catch {}
    }
  }
  return files;
}

async function scanUsageRecords(range) {
  const files = listSessionFiles(range.startMs);
  const records = [];
  const maxFiles = Number(process.env.MC_OPENCLAW_USAGE_MAX_FILES || 20000);
  const scanFiles = files
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, Number.isFinite(maxFiles) && maxFiles > 0 ? maxFiles : 20000);

  for (const file of scanFiles) {
    const stream = fs.createReadStream(file.path, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line || line.charCodeAt(0) !== 123) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      const record = extractUsageRecord(obj, file.mtimeMs);
      if (!record || record.timestampMs < range.startMs || record.timestampMs > range.endMs) continue;
      records.push(record);
    }
  }
  return { records, filesScanned: scanFiles.length, filesAvailable: files.length };
}

function createTotalsBucket(name) {
  return { name, cost: 0, tokens: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, sessions: 0 };
}

async function buildForPeriod(period) {
  const r = rangeForPeriod(period);
  const { records, filesScanned, filesAvailable } = await scanUsageRecords(r);
  const dailyMap = new Map(r.keys.map((date) => [date, {
    date,
    cost: 0,
    totalCost: 0,
    tokens: 0,
    totalTokens: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  }]));
  const modelTotals = new Map();
  const modelDailyTotals = new Map();

  for (const record of records) {
    const daily = dailyMap.get(record.date);
    if (!daily) continue;
    daily.cost += record.totalCost;
    daily.totalCost = daily.cost;
    daily.tokens += record.totalTokens;
    daily.totalTokens = daily.tokens;
    daily.input += record.input;
    daily.output += record.output;
    daily.cacheRead += record.cacheRead;
    daily.cacheWrite += record.cacheWrite;

    const name = modelName(record.provider, record.model);
    const model = modelTotals.get(name) || createTotalsBucket(name);
    model.cost += record.totalCost;
    model.tokens += record.totalTokens;
    model.input += record.input;
    model.output += record.output;
    model.cacheRead += record.cacheRead;
    model.cacheWrite += record.cacheWrite;
    model.sessions += 1;
    modelTotals.set(name, model);

    const dailyKey = `${record.date}::${name}`;
    const dailyModel = modelDailyTotals.get(dailyKey) || { date: record.date, name, cost: 0, tokens: 0 };
    dailyModel.cost += record.totalCost;
    dailyModel.tokens += record.totalTokens;
    modelDailyTotals.set(dailyKey, dailyModel);
  }

  const daily = r.keys.map((date) => dailyMap.get(date));
  let byServiceList = Array.from(modelTotals.values())
    .filter((item) => item.tokens > 0 || item.cost > 0)
    .sort((a, b) => b.tokens - a.tokens)
    .map((item) => {
      const normalized = costSanity.normalizeServiceCost({
        name: item.name,
        cost: item.cost,
        tokens: item.tokens,
        sessions: item.sessions,
        percentage: 0,
        costSource: item.cost > 0 ? 'api' : 'unknown',
      });
      return normalized;
    });

  const periodTokens = byServiceList.reduce((sum, item) => sum + Number(item.tokens || 0), 0);
  for (const item of byServiceList) {
    item.percentage = periodTokens > 0 ? Math.round((Number(item.tokens || 0) / periodTokens) * 100) : 0;
  }

  const dailyByModel = daily.map((row) => {
    const out = { date: row.date, totalCost: row.cost, totalTokens: row.tokens };
    for (const svc of byServiceList) {
      const key = `${row.date}::${svc.name}`;
      const b = modelDailyTotals.get(key) || { cost: 0, tokens: 0 };
      out[svc.name] = Number(b.cost || 0);
      out[`${svc.name}_tokens`] = Number(b.tokens || 0);
      out[`${svc.name}_costSource`] = svc.costSource || (b.cost > 0 ? 'api' : 'unknown');
    }
    return out;
  });

  const todayKey = dayKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = dayKey(yesterday);
  const todayRow = daily.find((d) => d.date === todayKey) || {};
  const yesterdayRow = daily.find((d) => d.date === yesterdayKey) || {};
  const monthPrefix = todayKey.slice(0, 7);
  const thisMonthRows = daily.filter((d) => String(d.date || '').startsWith(monthPrefix));
  const thisWeekRows = daily.slice(-7);

  return costSanity.normalizeUsageCosts({
    source: 'openclaw.session_jsonl_fast_scan',
    period,
    periodRange: { start: r.startKey, end: r.endKey },
    summary: {
      periodUsd: daily.reduce((sum, d) => sum + Number(d.cost || 0), 0),
      previousPeriodUsd: 0,
      periodTokens: daily.reduce((sum, d) => sum + Number(d.tokens || 0), 0),
      todayUsd: todayRow.cost || 0,
      yesterdayUsd: yesterdayRow.cost || 0,
      thisWeekUsd: thisWeekRows.reduce((sum, d) => sum + Number(d.cost || 0), 0),
      thisMonthUsd: thisMonthRows.reduce((sum, d) => sum + Number(d.cost || 0), 0),
      totalUsd: daily.reduce((sum, d) => sum + Number(d.cost || 0), 0),
      todayTokens: todayRow.tokens || 0,
      thisWeekTokens: thisWeekRows.reduce((sum, d) => sum + Number(d.tokens || 0), 0),
      thisMonthTokens: thisMonthRows.reduce((sum, d) => sum + Number(d.tokens || 0), 0),
      totalTokens: thisMonthRows.reduce((sum, d) => sum + Number(d.tokens || 0), 0),
      note: `Source: OpenClaw session JSONL fast scan (${records.length} usage records, ${filesScanned}/${filesAvailable} files)`,
      recordsScanned: records.length,
      filesScanned,
      filesAvailable,
    },
    daily,
    dailyByModel,
    modelKeys: byServiceList.map((item) => item.name),
    byService: byServiceList,
  });
}

async function main() {
  const period = process.argv.slice(2).find((arg) => VALID_PERIODS.has(String(arg))) || 'month';
  const data = await buildForPeriod(period);
  process.stdout.write(JSON.stringify(data));
}

main().catch((err) => {
  console.error('[openclaw-usage-summary] failed', err && err.message ? err.message : String(err));
  process.exit(1);
});
