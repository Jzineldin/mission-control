'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const express = require('express');
const { GATEWAY_PORT, GATEWAY_TOKEN, OPENCLAW_DIR } = require('../lib/config');
const cache = require('../lib/cache');
const { gatewayInvoke, readJSON, getLastAssistantMessage } = require('../lib/helpers');

const router = express.Router();

function parseCronJobs(parsed) {
  return (parsed.jobs || []).map(j => ({
    id: j.id,
    agentId: j.agentId || 'main',
    name: j.name || j.id.substring(0, 8),
    schedule: j.schedule?.expr || j.schedule?.kind || '?',
    status: !j.enabled ? 'disabled' : (j.state?.lastStatus === 'ok' ? 'active' : j.state?.lastStatus || 'idle'),
    lastRun: j.state?.lastRunAtMs ? new Date(j.state.lastRunAtMs).toISOString() : null,
    nextRun: j.state?.nextRunAtMs ? new Date(j.state.nextRunAtMs).toISOString() : null,
    duration: j.state?.lastDurationMs ? `${j.state.lastDurationMs}ms` : null,
    target: j.sessionTarget || 'main',
    payload: j.payload?.kind || '?',
    description: j.payload?.text?.substring(0, 120) || j.payload?.message?.substring(0, 120) || '',
    lastOutput: '',
    lastStatus: j.state?.lastStatus || 'idle',
    lastError: j.state?.lastError || '',
    history: [],
    enabled: j.enabled !== false,
  }));
}

async function getCronLastOutput(agentId, jobId) {
  try {
    const sessionsPath = path.join(OPENCLAW_DIR, 'agents', agentId, 'sessions', 'sessions.json');
    const sessionsMap = await readJSON(sessionsPath, {});
    const cronKey = `agent:${agentId}:cron:${jobId}`;
    const session = sessionsMap[cronKey];
    if (!session) return '';
    const sessionId = session.sessionId ||
      (session.sessionFile || '').split('/').pop().replace('.jsonl', '');
    if (!sessionId) return '';
    const transcriptPath = session.sessionFile ||
      path.join(OPENCLAW_DIR, 'agents', agentId, 'sessions', `${sessionId}.jsonl`);
    return await getLastAssistantMessage(transcriptPath);
  } catch {
    return '';
  }
}

// ── GET /api/cron ─────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    if (cache.cron && Date.now() - cache.cronTime < cache.CRON_TTL) {
      return res.json(cache.cron);
    }
    const cronRaw = execSync('openclaw cron list --json 2>/dev/null', { timeout: 10000, encoding: 'utf8' });
    // Strip any non-JSON prefix (doctor warnings can print to stdout)
    const jsonStart = cronRaw.indexOf('{');
    const parsed = JSON.parse(jsonStart >= 0 ? cronRaw.slice(jsonStart) : cronRaw);
    const jobs = parseCronJobs(parsed);
    await Promise.all(jobs.map(async job => {
      job.lastOutput = await getCronLastOutput(job.agentId, job.id);
    }));
    const result = { jobs };
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
    await gatewayInvoke(GATEWAY_PORT, GATEWAY_TOKEN, 'cron', { action: 'update', jobId: id, patch: { enabled } });
    cache.cron = null; cache.cronTime = 0;
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
    cache.cron = null; cache.cronTime = 0;
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
    if (!job?.name || !job?.schedule) return res.status(400).json({ error: 'Invalid job format - name and schedule required' });
    await gatewayInvoke(GATEWAY_PORT, GATEWAY_TOKEN, 'cron', { action: 'add', job });
    cache.cron = null; cache.cronTime = 0;
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
    cache.cron = null; cache.cronTime = 0;
    res.json({ ok: true, message: 'Job deleted successfully' });
  } catch (error) {
    console.error('[Cron delete]', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
module.exports.parseCronJobs = parseCronJobs;
