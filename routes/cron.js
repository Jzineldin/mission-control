'use strict';
const { execSync } = require('child_process');
const express = require('express');
const { GATEWAY_PORT, GATEWAY_TOKEN } = require('../lib/config');
const cache = require('../lib/cache');
const { gatewayInvoke } = require('../lib/helpers');

const router = express.Router();

function parseCronJobs(parsed) {
  return (parsed.jobs || []).map(j => ({
    id: j.id,
    name: j.name || j.id.substring(0, 8),
    schedule: j.schedule?.expr || j.schedule?.kind || '?',
    status: !j.enabled ? 'disabled' : (j.state?.lastStatus === 'ok' ? 'active' : j.state?.lastStatus || 'idle'),
    lastRun: j.state?.lastRunAtMs ? new Date(j.state.lastRunAtMs).toISOString() : null,
    nextRun: j.state?.nextRunAtMs ? new Date(j.state.nextRunAtMs).toISOString() : null,
    duration: j.state?.lastDurationMs ? `${j.state.lastDurationMs}ms` : null,
    target: j.sessionTarget || 'main',
    payload: j.payload?.kind || '?',
    description: j.payload?.text?.substring(0, 120) || '',
    history: [],
    enabled: j.enabled !== false,
  }));
}

// ── GET /api/cron ─────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  try {
    if (cache.cron && Date.now() - cache.cronTime < cache.CRON_TTL) {
      return res.json(cache.cron);
    }

    const cronRaw = execSync('openclaw cron list --json 2>&1', { timeout: 10000, encoding: 'utf8' });
    const parsed = JSON.parse(cronRaw);
    const result = { jobs: parseCronJobs(parsed) };
    cache.cron = result;
    cache.cronTime = Date.now();
    res.json(result);
  } catch (e) {
    console.error('[Cron API]', e.message);
    res.json({ jobs: [], error: e.message });
  }
});

// ── POST /api/cron/:id/toggle ─────────────────────────────────────────────────

router.post('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;

    const response = await gatewayInvoke(GATEWAY_PORT, GATEWAY_TOKEN, 'cron', {
      action: 'update',
      jobId: id,
      patch: { enabled },
    });

    cache.cron = null;
    cache.cronTime = 0;
    res.json({ ok: true, message: `Job ${enabled ? 'enabled' : 'disabled'}` });
  } catch (error) {
    console.error('[Cron toggle]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── POST /api/cron/:id/run ────────────────────────────────────────────────────

router.post('/:id/run', async (req, res) => {
  try {
    const { id } = req.params;

    await gatewayInvoke(GATEWAY_PORT, GATEWAY_TOKEN, 'cron', { action: 'run', jobId: id });

    cache.cron = null;
    cache.cronTime = 0;
    res.json({ ok: true, message: 'Job triggered successfully' });
  } catch (error) {
    console.error('[Cron run]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── POST /api/cron/create ─────────────────────────────────────────────────────

router.post('/create', async (req, res) => {
  try {
    const { job } = req.body;
    if (!job?.name || !job?.schedule) {
      return res.status(400).json({ error: 'Invalid job format - name and schedule required' });
    }

    await gatewayInvoke(GATEWAY_PORT, GATEWAY_TOKEN, 'cron', { action: 'add', job });

    cache.cron = null;
    cache.cronTime = 0;
    res.json({ ok: true, message: 'Job created successfully' });
  } catch (error) {
    console.error('[Cron create]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── DELETE /api/cron/:id ──────────────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await gatewayInvoke(GATEWAY_PORT, GATEWAY_TOKEN, 'cron', { action: 'remove', jobId: id });

    cache.cron = null;
    cache.cronTime = 0;
    res.json({ ok: true, message: 'Job deleted successfully' });
  } catch (error) {
    console.error('[Cron delete]', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
module.exports.parseCronJobs = parseCronJobs;
