'use strict';
const path = require('path');
const { execFile } = require('child_process');
const express = require('express');
const { SCOUT_FILE, TASKS_FILE, mcConfig, MC_CONFIG_PATH } = require('../lib/config');
const { readJSON, writeJSON, generateId } = require('../lib/helpers');

const router = express.Router();

let scoutScanRunning = false;

// ── Category predicates (shared with GET route) ───────────────────────────────

const CATEGORY_FILTERS = {
  openclaw:  o => o.category?.startsWith('openclaw'),
  bounty:    o => o.category === 'bounty',
  freelance: o => ['freelance', 'twitter-jobs', 'linkedin-jobs', 'reddit-gigs', 'upwork'].includes(o.category),
  edtech:    o => o.category === 'edtech',
  funding:   o => ['funding', 'swedish-grants'].includes(o.category),
};

// ── GET /api/scout ────────────────────────────────────────────────────────────
//
//   Query params:
//     filter  = all | openclaw | bounty | freelance | edtech | funding
//     sort    = score (default) | date
//     page    = 1-based page number (default 1)
//     limit   = items per page (default 20, max 100)

router.get('/', async (req, res) => {
  try {
    const scoutData = await readJSON(SCOUT_FILE, { opportunities: [], lastScan: null });

    // All qualifying results
    const all = (scoutData.opportunities || []).filter(o => o.score >= 15);

    // Parse + validate query params
    const filter = req.query.filter || 'all';
    const sort   = req.query.sort   || 'score';
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    // Filter
    const predicate = filter !== 'all' ? (CATEGORY_FILTERS[filter] || (() => false)) : null;
    const filtered  = predicate ? all.filter(predicate) : all;

    // Sort
    const sorted = [...filtered].sort((a, b) =>
      sort === 'date'
        ? new Date(b.found).getTime() - new Date(a.found).getTime()
        : b.score - a.score
    );

    // Paginate
    const total  = sorted.length;
    const pages  = Math.max(1, Math.ceil(total / limit));
    const offset = (Math.min(page, pages) - 1) * limit;
    const opportunities = sorted.slice(offset, offset + limit);

    // Per-tab badge counts (always over the full qualifying set)
    const counts = {
      all: all.length,
      ...Object.fromEntries(
        Object.entries(CATEGORY_FILTERS).map(([k, fn]) => [k, all.filter(fn).length])
      ),
    };

    // Stats for the current filter (full filtered set, not just this page)
    const filteredStats = {
      total:    filtered.length,
      high:     filtered.filter(o => o.score >= 85).length,
      deployed: filtered.filter(o => o.status === 'deployed').length,
      avgScore: filtered.length
        ? Math.round(filtered.reduce((a, o) => a + o.score, 0) / filtered.length)
        : 0,
    };

    res.json({
      opportunities,
      lastScan:      scoutData.lastScan || null,
      queryCount:    scoutData.queryCount || 0,
      pagination:    { total, page: Math.min(page, pages), limit, pages },
      counts,
      filteredStats,
      stats: {
        total:     all.length,
        new:       all.filter(o => o.status === 'new').length,
        deployed:  all.filter(o => o.status === 'deployed').length,
        dismissed: all.filter(o => o.status === 'dismissed').length,
        avgScore:  all.length
          ? Math.round(all.reduce((a, o) => a + o.score, 0) / all.length)
          : 0,
      },
    });
  } catch (e) {
    console.error('[Scout API]', e.message);
    res.json({ opportunities: [], stats: {}, error: e.message });
  }
});

// ── POST /api/scout/deploy ────────────────────────────────────────────────────

router.post('/deploy', async (req, res) => {
  try {
    const { opportunityId } = req.body;
    if (!opportunityId) return res.status(400).json({ error: 'Missing opportunityId' });

    const scoutData = await readJSON(SCOUT_FILE, null);
    if (!scoutData) return res.status(404).json({ error: 'No scout results found' });

    const opp = scoutData.opportunities.find(o => o.id === opportunityId);
    if (!opp) return res.status(404).json({ error: 'Opportunity not found' });

    opp.status = 'deployed';
    await writeJSON(SCOUT_FILE, scoutData);

    const tasks = await readJSON(TASKS_FILE, { columns: { queue: [], inProgress: [], blocked: [], done: [] } });
    const task = {
      id: generateId('scout'),
      title: opp.title.substring(0, 80),
      description: `${opp.summary}\n\nSource: ${opp.source} | Score: ${opp.score}\nURL: ${opp.url}`,
      priority: opp.score >= 80 ? 'high' : opp.score >= 50 ? 'medium' : 'low',
      created: new Date().toISOString(),
      tags: opp.tags || [opp.category],
      source: 'scout',
    };
    tasks.columns.queue.unshift(task);
    await writeJSON(TASKS_FILE, tasks);

    res.json({ ok: true, task });
  } catch (e) {
    console.error('[Scout deploy]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/scout/dismiss ───────────────────────────────────────────────────

router.post('/dismiss', async (req, res) => {
  try {
    const { opportunityId } = req.body;
    const scoutData = await readJSON(SCOUT_FILE, null);
    if (scoutData) {
      const opp = scoutData.opportunities.find(o => o.id === opportunityId);
      if (opp) {
        opp.status = 'dismissed';
        await writeJSON(SCOUT_FILE, scoutData);
      }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[Scout dismiss]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/scout/scan ──────────────────────────────────────────────────────

router.post('/scan', (req, res) => {
  try {
    if (scoutScanRunning) {
      return res.json({ status: 'already_scanning', message: 'Scout scan is already running' });
    }

    scoutScanRunning = true;
    execFile('node', [path.join(__dirname, '..', 'scout-engine.js')], { timeout: 300000 }, (error) => {
      scoutScanRunning = false;
      if (error) {
        console.error('[Scout scan]', error.message);
      } else {
        console.log('[Scout scan] Completed successfully');
      }
    });

    res.json({ status: 'scanning', message: 'Scout scan started in background' });
  } catch (e) {
    scoutScanRunning = false;
    console.error('[Scout scan start]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/scout/status ─────────────────────────────────────────────────────

router.get('/status', (req, res) => {
  res.json({ scanning: scoutScanRunning, status: scoutScanRunning ? 'scanning' : 'idle' });
});

// ── GET /api/scout/config ─────────────────────────────────────────────────────

router.get('/config', (req, res) => {
  res.json({
    queries: mcConfig.scout?.queries || [],
    schedule: mcConfig.scout?.schedule || 'daily',
  });
});

// ── POST /api/scout/config ────────────────────────────────────────────────────

router.post('/config', async (req, res) => {
  try {
    const { queries, schedule } = req.body;
    if (!Array.isArray(queries) || !queries.every(q => typeof q === 'string')) {
      return res.status(400).json({ error: 'queries must be an array of strings' });
    }
    mcConfig.scout = mcConfig.scout || {};
    mcConfig.scout.queries = queries;
    if (schedule) mcConfig.scout.schedule = schedule;
    await writeJSON(MC_CONFIG_PATH, mcConfig);
    res.json({ ok: true });
  } catch (e) {
    console.error('[Scout config]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
