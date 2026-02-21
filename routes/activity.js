'use strict';
const fs = require('fs');
const { execSync } = require('child_process');
const express = require('express');
const { TASKS_FILE, SCOUT_FILE } = require('../lib/config');
const cache = require('../lib/cache');
const { readJSON } = require('../lib/helpers');

const router = express.Router();

// ── GET /api/activity ─────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    if (cache.activity && Date.now() - cache.activityTime < cache.ACTIVITY_TTL) {
      return res.json(cache.activity);
    }

    const feed = [];

    // 1. Completed & in-progress tasks from tasks.json
    try {
      const tasks = await readJSON(TASKS_FILE, { columns: {} });
      for (const task of (tasks.columns.done || []).slice(0, 15)) {
        feed.push({
          id: `task-${task.id}`,
          type: 'task_completed',
          icon: 'check',
          title: task.title,
          detail: task.result ? task.result.substring(0, 200) : 'Completed',
          time: task.completed || task.created,
          priority: task.priority,
          source: task.source || 'manual',
          taskId: task.id,
          actionable: !!task.childSessionKey,
          actionLabel: task.childSessionKey ? 'Continue Chat' : 'View',
          actionUrl: `/workshop?task=${task.id}`,
        });
      }
      for (const task of (tasks.columns.inProgress || [])) {
        feed.push({
          id: `task-prog-${task.id}`,
          type: 'task_running',
          icon: 'loader',
          title: `Working: ${task.title}`,
          detail: 'Sub-agent executing...',
          time: task.startedAt || task.created,
          priority: task.priority,
          source: task.source || 'manual',
          taskId: task.id,
          actionable: true,
          actionLabel: 'View',
          actionUrl: `/workshop?task=${task.id}`,
        });
      }
    } catch (e) {
      console.warn('[Activity] Failed to read tasks:', e.message);
    }

    // 2. Scout opportunities (recent, not dismissed)
    try {
      if (fs.existsSync(SCOUT_FILE)) {
        const scout = await readJSON(SCOUT_FILE, {});
        for (const opp of (scout.opportunities || []).filter(o => o.status !== 'dismissed').slice(0, 10)) {
          feed.push({
            id: `scout-${opp.id}`,
            type: opp.status === 'deployed' ? 'scout_deployed' : 'scout_found',
            icon: 'search',
            title: opp.title,
            detail: opp.summary ? opp.summary.substring(0, 150) : '',
            time: opp.found,
            score: opp.score,
            source: opp.source,
            category: opp.category,
            actionable: opp.status !== 'deployed',
            actionLabel: 'Deploy',
            actionUrl: '/scout',
          });
        }
      }
    } catch (e) {
      console.warn('[Activity] Failed to read scout results:', e.message);
    }

    // 3. Cron job last runs
    try {
      const cronOutput = execSync('openclaw cron list --json 2>/dev/null || echo "[]"', { timeout: 5000 }).toString();
      const crons = JSON.parse(cronOutput);
      for (const job of (Array.isArray(crons) ? crons : crons.jobs || [])) {
        if (job.lastRun || job.lastRunAt) {
          feed.push({
            id: `cron-${job.id || job.jobId}`,
            type: 'cron_run',
            icon: 'clock',
            title: `Cron: ${job.name || job.id || 'unnamed'}`,
            detail: job.lastRunStatus === 'ok' ? 'Completed successfully' : `Status: ${job.lastRunStatus || 'unknown'}`,
            time: job.lastRun || job.lastRunAt,
            actionable: false,
          });
        }
      }
    } catch (e) {
      console.warn('[Activity] Failed to read cron jobs:', e.message);
    }

    feed.sort((a, b) => {
      const ta = a.time ? new Date(a.time).getTime() : 0;
      const tb = b.time ? new Date(b.time).getTime() : 0;
      return tb - ta;
    });

    const result = { feed: feed.slice(0, 30), generated: new Date().toISOString() };
    cache.activity = result;
    cache.activityTime = Date.now();
    res.json(result);
  } catch (e) {
    console.error('[Activity API]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
