const express = require('express');

const CRON_MODEL_ALIASES = {
  'local-qwen3.6-35b-a3b-nvfp4': 'ollama/qwen3.6:35b-a3b-nvfp4',
};

function normalizeCronModel(model) {
  const key = String(model || '').trim();
  return CRON_MODEL_ALIASES[key] || key;
}

function parseCronJobRef(id = '', schedulerHint = '') {
  const raw = String(id || '');
  const explicitScheduler = String(schedulerHint || '').trim().toLowerCase();
  const match = raw.match(/^(openclaw|hermes):(.+)$/);
  if (match) return { scheduler: match[1], sourceId: match[2] };
  return { scheduler: explicitScheduler || 'openclaw', sourceId: raw };
}

function assertSafeCronSourceId(sourceId) {
  const value = String(sourceId || '').trim();
  if (!value) {
    const error = new Error('Cron job id is required');
    error.statusCode = 400;
    throw error;
  }
  if (value.startsWith('-')) {
    const error = new Error('Cron job id cannot start with "-"');
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function assertOpenclawCronAction(id, schedulerHint = '') {
  const ref = parseCronJobRef(id, schedulerHint);
  if (ref.scheduler !== 'openclaw') {
    const error = new Error('Hermes cron jobs are shown read-only in Mission Control for now. Manage them from Hermes Agent.');
    error.statusCode = 501;
    throw error;
  }
  return assertSafeCronSourceId(ref.sourceId);
}

function cleanOpenclawError(error) {
  const raw = [error?.stderr, error?.stdout, error?.message]
    .filter(Boolean)
    .join('\n');
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line
      && !/^Config \([^)]*openclaw\.json\): missing env var /.test(line)
      && !/^Command failed: \/.*openclaw\b/.test(line));
  return lines[0] || 'OpenClaw command failed';
}

function buildCronRouter({
  readRuntimeSnapshot,
  writeRuntimeSnapshot,
  runtimeSnapshotTtl,
  cronService,
  openclawExec,
}) {
  const router = express.Router();
  let cronCache = null;
  let cronCacheTime = 0;
  let cronRefresh = null;
  const cronCacheTtl = 30000;

  function clearCronCache() {
    cronCache = null;
    cronCacheTime = 0;
  }

  async function refreshCronCacheNow() {
    const parsed = await cronService.fetchCronJobsLive();
    const rawJobs = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.jobs) ? parsed.jobs : []);
    if (!rawJobs || rawJobs.length === 0) return cronCache;
    const jobs = rawJobs.map((job) => cronService.mapCronJobForApi(job));
    const result = writeRuntimeSnapshot('cron', { jobs });
    cronCache = result;
    cronCacheTime = Date.now();
    return result;
  }

  async function refreshCronCache() {
    if (cronRefresh) return cronRefresh;
    cronRefresh = new Promise((resolve) => {
      setImmediate(async () => {
        try {
          resolve(await refreshCronCacheNow());
        } catch {
          resolve(cronCache);
        } finally {
          cronRefresh = null;
        }
      });
    });
    return cronRefresh;
  }

  router.get('/api/cron', async (req, res) => {
    try {
      const snapshot = readRuntimeSnapshot('cron', runtimeSnapshotTtl.cron);
      if (snapshot && Array.isArray(snapshot.jobs) && snapshot.jobs.length > 0 && snapshot.jobs.every((job) => job.scheduler && job.actions && (job.scheduler !== 'hermes' || (job.actions.model === true && job.actions.toggle === true)))) {
        return res.json(snapshot);
      }

      if (cronCache && Array.isArray(cronCache.jobs) && cronCache.jobs.length > 0 && Date.now() - cronCacheTime < cronCacheTtl) {
        return res.json(cronCache);
      }

      if (cronCache && Array.isArray(cronCache.jobs) && cronCache.jobs.length > 0) {
        refreshCronCache();
        return res.json({ ...cronCache, refreshing: true, warning: 'Serving cached cron snapshot while refreshing in background.' });
      }

      const result = await refreshCronCache();
      if (result && Array.isArray(result.jobs) && result.jobs.length > 0) {
        return res.json(result);
      }
      return res.json({ jobs: [], error: 'No cron jobs available from live fetch or cache.' });
    } catch (error) {
      console.error('[Cron API]', error.message);
      return res.json({ jobs: [], error: error.message, detail: error.stdout || error.stderr || null });
    }
  });

  router.post('/api/cron/:id/toggle', async (req, res) => {
    try {
      const { id } = req.params;
      const { enabled, scheduler } = req.body || {};
      const ref = parseCronJobRef(id, scheduler);
      if (ref.scheduler === 'hermes') {
        const job = cronService.updateHermesCronJobEnabled(assertSafeCronSourceId(ref.sourceId), enabled !== false);
        await refreshCronCacheNow();
        const mappedJob = cronService.mapCronJobForApi(job);
        return res.json({ ok: true, message: `Hermes job ${enabled !== false ? 'enabled' : 'disabled'}`, job: mappedJob });
      }
      const sourceId = assertOpenclawCronAction(id, scheduler);
      const command = enabled ? 'enable' : 'disable';
      await openclawExec(['cron', command, sourceId], 15000);
      clearCronCache();
      return res.json({ ok: true, message: `Job ${enabled ? 'enabled' : 'disabled'}` });
    } catch (error) {
      console.error('[Cron toggle]', error.message);
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.post('/api/cron/:id/run', async (req, res) => {
    try {
      const { id } = req.params;
      const sourceId = assertOpenclawCronAction(id, req.body?.scheduler);
      await openclawExec(['cron', 'run', sourceId], 30000);
      clearCronCache();
      return res.json({ ok: true, message: 'Job triggered successfully' });
    } catch (error) {
      console.error('[Cron run]', error.message);
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.post('/api/cron/create', async (req, res) => {
    try {
      const { job } = req.body;
      if (!job || !job.name || !job.schedule) {
        return res.status(400).json({ error: 'Invalid job format - name and schedule required' });
      }

      const args = ['cron', 'add', '--name', job.name];
      if (job.schedule?.kind === 'cron' && job.schedule.expr) {
        args.push('--cron', job.schedule.expr);
      } else if (job.schedule?.kind === 'every' && job.schedule.everyMs) {
        args.push('--every', `${Math.round(job.schedule.everyMs / 1000)}s`);
      } else if (job.schedule?.kind === 'at' && job.schedule.at) {
        args.push('--at', job.schedule.at);
      }
      args.push('--session', job.sessionTarget || 'isolated');
      if (job.payload?.kind === 'agentTurn') {
        args.push('--message', job.payload.message || '');
        if (job.payload.model) args.push('--model', job.payload.model);
      } else if (job.payload?.kind === 'systemEvent') {
        args.push('--system-event', job.payload.text || job.payload.message || '');
      }
      if (job.enabled === false) args.push('--disabled');
      args.push('--json');

      const { stdout, stderr } = await openclawExec(args, 20000);
      const parsed = cronService.parseFirstJson([stdout, stderr].filter(Boolean).join('\n')) || {};
      clearCronCache();
      return res.json({ ok: true, message: 'Job created successfully', job: parsed });
    } catch (error) {
      console.error('[Cron create]', error.message);
      return res.status(500).json({ error: error.message });
    }
  });

  router.delete('/api/cron/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const sourceId = assertOpenclawCronAction(id, req.body?.scheduler);
      await openclawExec(['cron', 'rm', sourceId], 15000);
      clearCronCache();
      return res.json({ ok: true, message: 'Job deleted successfully' });
    } catch (error) {
      console.error('[Cron delete]', error.message);
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.patch('/api/cron/:id/model', async (req, res) => {
    try {
      const { id } = req.params;
      const { model, thinking, scheduler } = req.body || {};
      const ref = parseCronJobRef(id, scheduler);
      if (!model && !thinking) {
        return res.status(400).json({ error: 'Provide at least model or thinking' });
      }

      const normalizedModel = normalizeCronModel(model);

      if (ref.scheduler === 'hermes') {
        if (thinking) {
          return res.status(501).json({ error: 'Hermes cron thinking edits are not supported from Mission Control yet.' });
        }
        const updated = cronService.updateHermesCronJobModel(assertSafeCronSourceId(ref.sourceId), normalizedModel);
        await refreshCronCacheNow();
        return res.json({
          ok: true,
          message: `Hermes cron model updated to ${normalizedModel || 'default'}`,
          job: cronService.mapCronJobForApi(updated),
        });
      }

      const args = ['cron', 'edit', assertSafeCronSourceId(ref.sourceId)];
      if (normalizedModel) args.push('--model', normalizedModel);
      if (thinking) args.push('--thinking', thinking);

      const { stdout, stderr } = await openclawExec(args, 15000);
      const parsed = cronService.parseFirstJson([stdout, stderr].filter(Boolean).join('\n')) || {};
      const updated = typeof parsed === 'object' && parsed !== null ? parsed : {};
      clearCronCache();
      return res.json({
        ok: true,
        message: `Model updated to ${updated.payload?.model || normalizedModel || '(unchanged)'}`,
        job: cronService.mapCronJobForApi(updated),
      });
    } catch (error) {
      console.error('[Cron update model]', error.message);
      return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : cleanOpenclawError(error) });
    }
  });

  return router;
}

module.exports = {
  buildCronRouter,
};
