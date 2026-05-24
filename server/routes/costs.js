const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');
const { exec } = require('child_process');
const { normalizeUsageCosts } = require('../services/costSanity');

function buildCostsRouter({ mcConfig, projectRoot, sessionsService }) {
  const router = express.Router();
  const execPromise = util.promisify(exec);
  const costsCache = new Map();
  const costsRefreshes = new Map();
  const costsCacheTtl = 60000;
  const costsFallbackCacheTtl = 15000;
  const costsDiskCacheFile = path.join(process.env.MC_COSTS_CACHE_DIR || path.join(os.tmpdir(), 'mission-control'), 'costs-cache.json');
  // OpenClaw's session-cost-usage aggregation can take ~55s for 7d on Yordam's host.
  // A too-low timeout silently produced null OpenClaw data, which mergeUsage then rendered as 0 tokens.
  const openclawUsageTimeoutMs = Number(process.env.MC_OPENCLAW_USAGE_TIMEOUT_MS || 120000);

  function persistCostsCache() {
    try {
      fs.mkdirSync(path.dirname(costsDiskCacheFile), { recursive: true });
      fs.writeFileSync(costsDiskCacheFile, JSON.stringify(Object.fromEntries(costsCache), null, 2));
    } catch (error) {
      console.warn('[Costs API cache persist]', error.message);
    }
  }

  function loadCostsCache() {
    try {
      if (!fs.existsSync(costsDiskCacheFile)) return;
      const raw = JSON.parse(fs.readFileSync(costsDiskCacheFile, 'utf8'));
      Object.entries(raw || {}).forEach(([key, entry]) => {
        if (entry?.value && Number.isFinite(Number(entry.time))) {
          costsCache.set(key, entry);
        }
      });
    } catch (error) {
      console.warn('[Costs API cache load]', error.message);
    }
  }

  function setCostsCache(cacheKey, entry) {
    const previous = costsCache.get(cacheKey);
    if (!entry?.detailed && previous?.detailed) {
      return previous;
    }
    costsCache.set(cacheKey, entry);
    persistCostsCache();
    return entry;
  }

  loadCostsCache();

  function hostUserHome() {
    const candidates = [
      process.env.MC_USER_HOME,
      '/Users/yordamkocatepe',
      process.env.HOME,
    ].filter(Boolean);
    return candidates.find((candidate) => fs.existsSync(path.join(candidate, '.openclaw'))) || process.env.HOME || candidates[0];
  }

  async function openclawUsageSummary(period = 'month') {
    try {
      const script = path.join(projectRoot, 'scripts', 'openclaw-usage-summary.js');
      const { stdout } = await execPromise(`node ${JSON.stringify(script)} ${JSON.stringify(String(period))}`, {
        timeout: openclawUsageTimeoutMs,
        maxBuffer: 20 * 1024 * 1024,
        env: { ...process.env, HOME: hostUserHome() },
      });
      const trimmed = String(stdout || '').trim();
      if (!trimmed) return null;
      const result = JSON.parse(trimmed);
      if (result && typeof result === 'object') {
        result.source = 'openclaw.usage';
      }
      return result;
    } catch (error) {
      console.error('[OpenClaw Usage Summary]', error.message);
      return null;
    }
  }

  function dayKey(date) {
    return date.toLocaleDateString('en-CA', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
  }

  function rangeForPeriod(period) {
    const now = new Date();
    const start = new Date(now);
    if (period === 'day') {
      start.setHours(0, 0, 0, 0);
      return { startSec: Math.floor(start.getTime() / 1000), endSec: Math.floor(now.getTime() / 1000), keys: [dayKey(start)], startKey: dayKey(start), endKey: dayKey(now) };
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
      return { startSec: Math.floor(start.getTime() / 1000), endSec: Math.floor(now.getTime() / 1000), keys, startKey: keys[0], endKey: keys[keys.length - 1] };
    }
    start.setHours(0, 0, 0, 0);
    start.setDate(1);
    const keys = [];
    const cursor = new Date(start);
    while (cursor <= now) {
      keys.push(dayKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return { startSec: Math.floor(start.getTime() / 1000), endSec: Math.floor(now.getTime() / 1000), keys, startKey: keys[0], endKey: keys[keys.length - 1] };
  }

  async function sqliteJson(dbPath, sql) {
    const flatSql = String(sql || '').replace(/\s+/g, ' ').trim();
    const { stdout } = await execPromise(`sqlite3 -json ${JSON.stringify(dbPath)} ${JSON.stringify(flatSql)}`, {
      timeout: 30000,
      maxBuffer: 20 * 1024 * 1024,
      env: process.env,
    });
    const trimmed = String(stdout || '').trim();
    return trimmed ? JSON.parse(trimmed) : [];
  }

  function hermesProfileDbPath() {
    const home = process.env.HOME || '/Users/yordamkocatepe';
    const profile = process.env.HERMES_PROFILE || 'hmudur';
    const candidates = [
      process.env.HERMES_STATE_DB,
      process.env.HERMES_PROFILE_DIR ? path.join(process.env.HERMES_PROFILE_DIR, 'state.db') : null,
      path.join(home, '.hermes', 'profiles', profile, 'state.db'),
      home.endsWith(path.join('.hermes', 'profiles', profile, 'home')) ? path.resolve(home, '..', 'state.db') : null,
      '/Users/yordamkocatepe/.hermes/profiles/hmudur/state.db',
    ].filter(Boolean);
    return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[candidates.length - 1];
  }

  function hermesModelName(provider, model) {
    const p = String(provider || '').trim();
    const m = String(model || '').trim();
    if (!p && !m) return 'unknown';
    if (!p || p === 'unknown') return m || 'unknown';
    if (!m || m === 'unknown') return p;
    return `${p}/${m}`;
  }

  async function hermesUsageSummary(period = 'month') {
    const dbPath = hermesProfileDbPath();
    try {
      const r = rangeForPeriod(period);
      const rows = await sqliteJson(dbPath, `
        SELECT
          date(started_at, 'unixepoch', 'localtime') AS date,
          COALESCE(NULLIF(billing_provider, ''), 'unknown') AS provider,
          COALESCE(NULLIF(model, ''), 'unknown') AS model,
          COUNT(*) AS sessions,
          SUM(COALESCE(input_tokens, 0)) AS input,
          SUM(COALESCE(output_tokens, 0)) AS output,
          SUM(COALESCE(cache_read_tokens, 0)) AS cacheRead,
          SUM(COALESCE(cache_write_tokens, 0)) AS cacheWrite,
          SUM(COALESCE(reasoning_tokens, 0)) AS reasoning,
          SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) + COALESCE(cache_read_tokens, 0) + COALESCE(cache_write_tokens, 0) + COALESCE(reasoning_tokens, 0)) AS tokens,
          SUM(COALESCE(actual_cost_usd, estimated_cost_usd, 0)) AS cost,
          GROUP_CONCAT(DISTINCT COALESCE(NULLIF(cost_status, ''), 'unknown')) AS statuses,
          GROUP_CONCAT(DISTINCT COALESCE(NULLIF(billing_mode, ''), 'unknown')) AS billingModes
        FROM sessions
        WHERE started_at >= ${r.startSec} AND started_at <= ${r.endSec}
        GROUP BY date, provider, model
        ORDER BY date ASC, tokens DESC
      `);

      const byModel = new Map();
      const byDay = new Map();
      for (const row of rows) {
        const name = hermesModelName(row.provider, row.model);
        const tokens = Number(row.tokens || 0);
        const cost = Number(row.cost || 0);
        const sessions = Number(row.sessions || 0);
        const existing = byModel.get(name) || { name, cost: 0, tokens: 0, sessions: 0, costStatus: row.statuses || 'unknown', billingModes: row.billingModes || 'unknown' };
        existing.cost += cost;
        existing.tokens += tokens;
        existing.sessions += sessions;
        byModel.set(name, existing);

        const day = byDay.get(row.date) || { date: row.date, cost: 0, tokens: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, models: {} };
        day.cost += cost;
        day.tokens += tokens;
        day.input += Number(row.input || 0);
        day.output += Number(row.output || 0);
        day.cacheRead += Number(row.cacheRead || 0);
        day.cacheWrite += Number(row.cacheWrite || 0);
        day.reasoning += Number(row.reasoning || 0);
        day.models[name] = { cost, tokens };
        byDay.set(row.date, day);
      }

      const daily = r.keys.map((date) => {
        const day = byDay.get(date) || { date, cost: 0, tokens: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, models: {} };
        return { ...day, totalCost: day.cost, totalTokens: day.tokens };
      });

      const byService = Array.from(byModel.values())
        .filter((item) => item.tokens > 0 || item.cost > 0)
        .sort((a, b) => b.tokens - a.tokens)
        .map((item) => ({ ...item, percentage: 0, costSource: item.cost > 0 ? 'api' : (String(item.costStatus || '').includes('included') ? 'included' : 'unknown') }));
      const periodTokens = daily.reduce((sum, day) => sum + Number(day.tokens || 0), 0);
      const periodUsd = daily.reduce((sum, day) => sum + Number(day.cost || 0), 0);
      byService.forEach((item) => {
        item.percentage = periodTokens > 0 ? Math.round((item.tokens / periodTokens) * 100) : 0;
      });

      const dailyByModel = daily.map((day) => {
        const out = { date: day.date, totalCost: day.cost, totalTokens: day.tokens };
        for (const svc of byService) {
          const b = day.models[svc.name] || { cost: 0, tokens: 0 };
          out[svc.name] = b.cost || 0;
          out[`${svc.name}_tokens`] = b.tokens || 0;
          out[`${svc.name}_costSource`] = svc.costSource;
        }
        return out;
      });

      const todayKey = dayKey(new Date());
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = dayKey(yesterday);
      const todayRow = daily.find((day) => day.date === todayKey) || {};
      const yesterdayRow = daily.find((day) => day.date === yesterdayKey) || {};
      const thisWeekRows = daily.slice(-7);

      return {
        source: 'hermes.state.db',
        period,
        periodRange: { start: r.startKey, end: r.endKey },
        summary: {
          periodUsd,
          previousPeriodUsd: 0,
          periodTokens,
          todayUsd: todayRow.cost || 0,
          yesterdayUsd: yesterdayRow.cost || 0,
          thisWeekUsd: thisWeekRows.reduce((sum, day) => sum + Number(day.cost || 0), 0),
          thisMonthUsd: periodUsd,
          totalUsd: periodUsd,
          todayTokens: todayRow.tokens || 0,
          thisWeekTokens: thisWeekRows.reduce((sum, day) => sum + Number(day.tokens || 0), 0),
          thisMonthTokens: periodTokens,
          totalTokens: periodTokens,
          note: `Source: Hermes profile SQLite (${dbPath})`,
        },
        daily,
        dailyByModel,
        modelKeys: byService.map((item) => item.name),
        byService,
      };
    } catch (error) {
      console.error('[Hermes Usage Summary]', error.message);
      return null;
    }
  }

  function namespaceUsage(data, label) {
    if (!data) return null;
    const prefix = `${label} / `;
    const byService = (data.byService || []).map((item) => ({ ...item, name: `${prefix}${item.name}`, agent: label }));
    const modelKeys = byService.map((item) => item.name);
    const dailyByModel = (data.dailyByModel || []).map((row) => {
      const out = { date: row.date, totalCost: row.totalCost || 0, totalTokens: row.totalTokens || 0 };
      (data.byService || []).forEach((svc) => {
        const name = `${prefix}${svc.name}`;
        out[name] = Number(row[svc.name] || 0);
        out[`${name}_tokens`] = Number(row[`${svc.name}_tokens`] || 0);
        out[`${name}_costSource`] = row[`${svc.name}_costSource`] || svc.costSource || 'unknown';
      });
      return out;
    });
    return { ...data, byService, modelKeys, dailyByModel };
  }

  function emptyUsage(period, source) {
    const r = rangeForPeriod(period);
    const daily = r.keys.map((date) => ({ date, cost: 0, totalCost: 0, tokens: 0, totalTokens: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }));
    const dailyByModel = r.keys.map((date) => ({ date, totalCost: 0, totalTokens: 0 }));
    return {
      source,
      period,
      periodRange: { start: r.startKey, end: r.endKey },
      summary: {
        periodUsd: 0,
        previousPeriodUsd: 0,
        periodTokens: 0,
        todayUsd: 0,
        yesterdayUsd: 0,
        thisWeekUsd: 0,
        thisMonthUsd: 0,
        totalUsd: 0,
        todayTokens: 0,
        thisWeekTokens: 0,
        thisMonthTokens: 0,
        totalTokens: 0,
        note: `No ${source} usage found for this period`,
      },
      daily,
      dailyByModel,
      modelKeys: [],
      byService: [],
    };
  }

  function mergeUsage(openclawData, hermesData, period) {
    if (!openclawData && !hermesData) return null;

    const sources = [
      openclawData ? namespaceUsage(openclawData, 'OpenClaw') : null,
      hermesData ? namespaceUsage(hermesData, 'Hermes') : null,
    ].filter(Boolean);
    if (!sources.length) return null;

    const keySet = new Set();
    sources.forEach((src) => (src.daily || []).forEach((day) => keySet.add(day.date)));
    const keys = Array.from(keySet).sort();
    const daily = keys.map((date) => {
      const out = { date, cost: 0, totalCost: 0, tokens: 0, totalTokens: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
      sources.forEach((src) => {
        const row = (src.daily || []).find((day) => day.date === date) || {};
        out.cost += Number(row.cost || row.totalCost || 0);
        out.totalCost = out.cost;
        out.tokens += Number(row.tokens || row.totalTokens || 0);
        out.totalTokens = out.tokens;
        out.input += Number(row.input || 0);
        out.output += Number(row.output || 0);
        out.cacheRead += Number(row.cacheRead || 0);
        out.cacheWrite += Number(row.cacheWrite || 0);
      });
      return out;
    });

    const byService = sources.flatMap((src) => src.byService || []);
    const modelKeys = byService.map((item) => item.name);
    const dailyByModel = keys.map((date) => {
      const out = { date, totalCost: 0, totalTokens: 0 };
      sources.forEach((src) => {
        const row = (src.dailyByModel || []).find((day) => day.date === date) || {};
        out.totalCost += Number(row.totalCost || 0);
        out.totalTokens += Number(row.totalTokens || 0);
        (src.modelKeys || []).forEach((key) => {
          out[key] = Number(row[key] || 0);
          out[`${key}_tokens`] = Number(row[`${key}_tokens`] || 0);
          out[`${key}_costSource`] = row[`${key}_costSource`] || 'unknown';
        });
      });
      return out;
    });

    const sumSummary = (field) => sources.reduce((sum, src) => sum + Number(src.summary?.[field] || 0), 0);
    const agents = [
      openclawData ? { key: 'openclaw', label: 'OpenClaw', accent: '#5E5CE6', source: openclawData.source || 'openclaw.usage', status: 'ready', summary: openclawData.summary || {}, byService: namespaceUsage(openclawData, 'OpenClaw')?.byService || [] } : null,
      hermesData ? { key: 'hermes', label: 'Hermes', accent: '#00C7BE', source: hermesData.source || 'hermes.state.db', status: 'ready', summary: hermesData.summary || {}, byService: namespaceUsage(hermesData, 'Hermes')?.byService || [] } : null,
    ].filter(Boolean);

    return {
      source: 'combined.agent_usage',
      period,
      periodRange: { start: keys[0] || null, end: keys[keys.length - 1] || null },
      summary: {
        periodUsd: sumSummary('periodUsd'),
        previousPeriodUsd: sumSummary('previousPeriodUsd'),
        periodTokens: sumSummary('periodTokens'),
        todayUsd: sumSummary('todayUsd'),
        yesterdayUsd: sumSummary('yesterdayUsd'),
        thisWeekUsd: sumSummary('thisWeekUsd'),
        thisMonthUsd: sumSummary('thisMonthUsd'),
        totalUsd: sumSummary('totalUsd'),
        todayTokens: sumSummary('todayTokens'),
        thisWeekTokens: sumSummary('thisWeekTokens'),
        thisMonthTokens: sumSummary('thisMonthTokens'),
        totalTokens: sumSummary('totalTokens'),
        note: 'Combined view: OpenClaw session-cost-usage + Hermes profile state.db',
      },
      daily,
      dailyByModel,
      modelKeys,
      byService,
      agents,
    };
  }

  async function buildSessionsFallbackCost(period) {
    const sessionData = await sessionsService.listVisibleSessions(50);
    const sessions = sessionData.sessions || [];
    const totalTokens = sessions.reduce((sum, session) => sum + (session.totalTokens || 0), 0);

    const byService = Object.entries(
      sessions.reduce((acc, session) => {
        const channel = session.channel || session.kind || session.type || 'sessions';
        if (!acc[channel]) acc[channel] = { tokens: 0, sessions: 0 };
        acc[channel].tokens += session.totalTokens || 0;
        acc[channel].sessions += 1;
        return acc;
      }, {})
    )
      .filter(([, value]) => value.tokens > 0)
      .map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        cost: 0,
        tokens: value.tokens,
        sessions: value.sessions,
        percentage: totalTokens > 0 ? Math.round((value.tokens / totalTokens) * 100) : 0,
      }))
      .sort((left, right) => right.tokens - left.tokens);

    const dailyMap = {};
    sessions.forEach((session) => {
      if (!session.updatedAt) return;
      const day = new Date(session.updatedAt).toISOString().split('T')[0];
      dailyMap[day] = (dailyMap[day] || 0) + (session.totalTokens || 0);
    });

    const daily = [];
    const today = new Date();
    for (let index = 6; index >= 0; index -= 1) {
      const date = new Date(today);
      date.setDate(date.getDate() - index);
      const dateStr = date.toISOString().split('T')[0];
      daily.push({ date: dateStr, cost: 0, tokens: dailyMap[dateStr] || 0 });
    }

    return {
      source: 'sessions.fast_fallback',
      period: { key: period, start: daily[0]?.date || null, end: daily[daily.length - 1]?.date || null },
      daily,
      summary: {
        periodUsd: 0,
        periodTokens: totalTokens,
        todayUsd: 0,
        thisWeekUsd: 0,
        thisMonthUsd: 0,
        totalUsd: 0,
        todayTokens: 0,
        thisWeekTokens: 0,
        thisMonthTokens: 0,
        totalTokens,
        note: 'Fast fallback: computed from cached visible sessions while detailed usage refreshes in the background',
        budget: mcConfig.budget || { monthly: 0, warning: 0 },
      },
      byService,
      budget: mcConfig.budget || { monthly: 0 },
      dailyByModel: [],
      modelKeys: [],
    };
  }

  function attachCostsMeta(costsResult, meta = {}) {
    const now = new Date().toISOString();
    return {
      ...costsResult,
      meta: {
        updatedAt: costsResult?.meta?.updatedAt || now,
        refreshing: false,
        stale: false,
        ...(costsResult?.meta || {}),
        ...meta,
      },
    };
  }

  function cachedOpenClawUsage(previous, period) {
    const openclawAgent = previous?.agents?.find((agent) => agent.key === 'openclaw');
    if (!openclawAgent) return null;

    const prefixedModelKeys = (previous.modelKeys || []).filter((key) => key.startsWith('OpenClaw / '));
    const modelKeys = prefixedModelKeys.map((key) => key.replace(/^OpenClaw \/ /, ''));
    const dailyByModel = (previous.dailyByModel || []).map((row) => {
      const out = { date: row.date, totalCost: 0, totalTokens: 0 };
      prefixedModelKeys.forEach((prefixedKey, index) => {
        const key = modelKeys[index];
        const cost = Number(row[prefixedKey] || 0);
        const tokens = Number(row[`${prefixedKey}_tokens`] || 0);
        out[key] = cost;
        out[`${key}_tokens`] = tokens;
        out[`${key}_costSource`] = row[`${prefixedKey}_costSource`] || 'cached';
        out.totalCost += cost;
        out.totalTokens += tokens;
      });
      return out;
    });
    const daily = dailyByModel.map((row) => ({
      date: row.date,
      cost: row.totalCost,
      totalCost: row.totalCost,
      tokens: row.totalTokens,
      totalTokens: row.totalTokens,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    }));
    const byService = (previous.byService || [])
      .filter((item) => item.agent === 'OpenClaw' || String(item.name || '').startsWith('OpenClaw / '))
      .map((item) => ({ ...item, name: String(item.name || '').replace(/^OpenClaw \/ /, '') }));

    return {
      source: `${openclawAgent.source || 'openclaw.usage'}.cached`,
      period,
      periodRange: {
        start: previous.period?.start || daily[0]?.date || null,
        end: previous.period?.end || daily[daily.length - 1]?.date || null,
      },
      summary: openclawAgent.summary || {},
      daily,
      dailyByModel,
      modelKeys,
      byService,
    };
  }

  function detailedCostsResult(period, combinedUsage, meta = {}) {
    const normalizedUsage = normalizeUsageCosts(combinedUsage);
    const rangeRows = normalizedUsage.daily || [];
    return attachCostsMeta({
      source: normalizedUsage.source,
      period: {
        key: period,
        start: normalizedUsage.periodRange?.start || (rangeRows[0]?.date || null),
        end: normalizedUsage.periodRange?.end || (rangeRows[rangeRows.length - 1]?.date || null),
      },
      daily: rangeRows,
      summary: {
        ...(normalizedUsage.summary || {}),
        budget: mcConfig.budget || { monthly: 0, warning: 0 },
      },
      dailyByModel: normalizedUsage.dailyByModel || [],
      modelKeys: normalizedUsage.modelKeys || [],
      byService: normalizedUsage.byService || [],
      agents: normalizedUsage.agents || [],
      costReliability: normalizedUsage.costReliability,
      budget: mcConfig.budget || { monthly: 0 },
    }, meta);
  }

  function refreshCostsCache(cacheKey, period) {
    if (costsRefreshes.has(cacheKey)) return costsRefreshes.get(cacheKey);

    const startedAt = new Date().toISOString();
    const refresh = new Promise((resolve) => {
      setImmediate(async () => {
        try {
          const [openclawData, hermesData] = await Promise.all([
            openclawUsageSummary(period),
            hermesUsageSummary(period),
          ]);
          const combinedUsage = mergeUsage(openclawData, hermesData, period);
          if (combinedUsage) {
            const previous = costsCache.get(cacheKey)?.value;
            const hasPreviousOpenClaw = !!previous?.agents?.some((agent) => agent.key === 'openclaw' && Number(agent.summary?.periodTokens || 0) > 0);
            if (!openclawData && hasPreviousOpenClaw) {
              const cachedOpenClawData = cachedOpenClawUsage(previous, period);
              const usageWithCachedOpenClaw = mergeUsage(cachedOpenClawData, hermesData, period);
              const preserved = detailedCostsResult(period, usageWithCachedOpenClaw, {
                refreshing: false,
                stale: true,
                refreshStartedAt: startedAt,
                openclawStatus: 'unavailable',
                hermesStatus: 'ready',
                preservedPreviousOpenClaw: true,
              });
              setCostsCache(cacheKey, { value: preserved, time: Date.now(), detailed: true });
              resolve(preserved);
              return;
            }

            const costsResult = detailedCostsResult(period, combinedUsage, {
              refreshing: false,
              stale: false,
              refreshStartedAt: startedAt,
              openclawStatus: openclawData ? 'ready' : 'unavailable',
              hermesStatus: hermesData ? 'ready' : 'unavailable',
            });
            setCostsCache(cacheKey, { value: costsResult, time: Date.now(), detailed: true });
            resolve(costsResult);
            return;
          }

          if (!costsCache.has(cacheKey)) {
            const fallback = attachCostsMeta(await buildSessionsFallbackCost(period), {
              refreshing: false,
              stale: false,
              openclawStatus: 'unavailable',
              hermesStatus: 'unavailable',
            });
            setCostsCache(cacheKey, { value: fallback, time: Date.now(), detailed: false });
            resolve(fallback);
            return;
          }

          const previousEntry = costsCache.get(cacheKey);
          if (previousEntry) {
            const preserved = attachCostsMeta(previousEntry.value, {
              refreshing: false,
              stale: true,
              refreshStartedAt: startedAt,
              openclawStatus: 'unavailable',
              hermesStatus: 'unavailable',
              preservedPreviousUsage: true,
            });
            setCostsCache(cacheKey, { value: preserved, time: Date.now(), detailed: true });
            resolve(preserved);
            return;
          }

          resolve(null);
        } catch (error) {
          console.error('[Costs API background refresh]', error.message);
          resolve(null);
        } finally {
          costsRefreshes.delete(cacheKey);
        }
      });
    });
    costsRefreshes.set(cacheKey, refresh);
    return refresh;
  }

  router.get('/api/costs', async (req, res) => {
    try {
      const period = String(req.query.period || 'month');
      const cacheKey = `costs:${period}`;
      const cached = costsCache.get(cacheKey);
      const refreshing = costsRefreshes.has(cacheKey);

      if (cached) {
        const ageMs = Date.now() - cached.time;
        const ttl = cached.detailed ? costsCacheTtl : costsFallbackCacheTtl;
        const isFresh = ageMs < ttl;
        if (!isFresh && !refreshing) refreshCostsCache(cacheKey, period);
        const normalizedCachedValue = normalizeUsageCosts(cached.value);
        return res.json(attachCostsMeta(normalizedCachedValue, {
          refreshing: refreshing || !isFresh,
          stale: Boolean(cached.value?.meta?.stale) || !isFresh,
          ageMs,
        }));
      }

      if (!refreshing) refreshCostsCache(cacheKey, period);
      const fallback = attachCostsMeta(await buildSessionsFallbackCost(period), {
        refreshing: true,
        stale: false,
        openclawStatus: 'refreshing',
        hermesStatus: 'refreshing',
      });
      setCostsCache(cacheKey, { value: fallback, time: Date.now(), detailed: false });
      return res.json(fallback);
    } catch (error) {
      console.error('[Costs API]', error.message);
      return res.status(500).json({ error: error.message });
    }
  });


  router.get('/api/costs/codexbar', async (req, res) => {
    try {
      const { stdout } = await execPromise('codexbar cost --format json --provider codex', { timeout: 30000 });
      const data = JSON.parse(stdout);
      const raw = Array.isArray(data) ? data[0] : data;

      const daily = (raw.daily || []).map((day) => ({
        date: day.date,
        totalCost: day.totalCost || 0,
        totalTokens: day.totalTokens || 0,
        inputTokens: day.inputTokens || 0,
        outputTokens: day.outputTokens || 0,
        models: (day.modelBreakdowns || []).map((model) => ({
          model: model.modelName,
          cost: model.cost || 0,
          totalTokens: model.totalTokens || 0,
        })),
      }));

      const totals = raw.totals || {};
      return res.json({
        source: 'codexbar',
        provider: 'codex',
        updatedAt: raw.updatedAt || null,
        last30DaysCostUSD: raw.last30DaysCostUSD || 0,
        last30DaysTokens: raw.last30DaysTokens || 0,
        sessionCostUSD: raw.sessionCostUSD || 0,
        sessionTokens: raw.sessionTokens || 0,
        totals: {
          totalCost: totals.totalCost || 0,
          totalTokens: totals.totalTokens || 0,
          inputTokens: totals.inputTokens || 0,
          outputTokens: totals.outputTokens || 0,
        },
        daily,
      });
    } catch (error) {
      console.error('CodexBar costs error:', error.message);
      return res.status(500).json({ error: `Failed to load CodexBar cost data: ${error.message}` });
    }
  });

  return router;
}

module.exports = {
  buildCostsRouter,
};
