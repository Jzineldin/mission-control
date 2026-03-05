'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');

// ── Config & shared state ─────────────────────────────────────────────────────
const { TASKS_FILE, OPENCLAW_DIR } = require('./lib/config');
const cache = require('./lib/cache');
const { readJSON, writeJSON, getLastAssistantMessage } = require('./lib/helpers');

// ── Route modules ─────────────────────────────────────────────────────────────
const chatRouter        = require('./routes/chat');
const statusRouter      = require('./routes/status');
const { refreshStatusCache } = require('./routes/status');
const sessionsRouter    = require('./routes/sessions');
const cronRouter        = require('./routes/cron');
const activityRouter    = require('./routes/activity');
const tasksRouter       = require('./routes/tasks');
const costsRouter       = require('./routes/costs');
const scoutRouter       = require('./routes/scout');
const agentsRouter      = require('./routes/agents');
const settingsRouter    = require('./routes/settings');
const modelRouter       = require('./routes/model');
const skillsRouter      = require('./routes/skills');
const awsRouter         = require('./routes/aws');
const docsRouter        = require('./routes/docs');
const setupRouter       = require('./routes/setup');
const { getPublicConfig } = require('./routes/setup');
const quickActionsRouter = require('./routes/quickactions');

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
const PORT = parseInt(process.env.PORT || '3333', 10);
const BIND_HOST = process.env.BIND_HOST || '127.0.0.1';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend/dist')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/chat',           chatRouter);
app.use('/api/status',         statusRouter);
app.use('/api/sessions',       sessionsRouter);
app.use('/api/cron',           cronRouter);
app.use('/api/activity',       activityRouter);
app.use('/api/tasks',          tasksRouter);
app.use('/api/costs',          costsRouter);
app.use('/api/settings',       settingsRouter);   // includes /budget, /model-routing, /heartbeat, /export, /import
app.use('/api/models',         modelRouter);       // GET  /api/models
app.use('/api/model',          modelRouter);       // POST /api/model
app.use('/api/scout',          scoutRouter);
app.use('/api/agents',         agentsRouter);
app.use('/api/skills',         skillsRouter);
app.use('/api/aws',            awsRouter);
app.use('/api/docs',           docsRouter);
app.use('/api/setup',          setupRouter);
app.get('/api/config',         getPublicConfig);   // public config, secrets stripped
app.use('/api',                quickActionsRouter);

// SPA catch-all
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
});

// ── Server startup ────────────────────────────────────────────────────────────
app.listen(PORT, BIND_HOST, async () => {
  console.log(`Mission Control running at http://localhost:${PORT}`);

  // Recover stuck inProgress tasks from the previous run
  try {
    const tasks = await readJSON(TASKS_FILE, null);
    if (tasks?.columns?.inProgress?.length) {
      const sessionsFile = path.join(OPENCLAW_DIR, 'agents/main/sessions/sessions.json');
      const sessions = await readJSON(sessionsFile, {});
      let recovered = 0;

      for (const task of [...tasks.columns.inProgress]) {
        const childKey = task.childSessionKey || '';
        const sessionId = sessions[childKey]?.sessionId || '';
        if (!sessionId) continue;

        const transcriptPath = path.join(OPENCLAW_DIR, 'agents/main/sessions', `${sessionId}.jsonl`);
        const resultText = await getLastAssistantMessage(transcriptPath);

        if (resultText) {
          const idx = tasks.columns.inProgress.indexOf(task);
          if (idx >= 0) tasks.columns.inProgress.splice(idx, 1);
          task.status = 'done';
          task.completed = new Date().toISOString();
          task.result = resultText.substring(0, 10000);
          tasks.columns.done.unshift(task);
          recovered++;
        }
      }

      if (recovered > 0) {
        await writeJSON(TASKS_FILE, tasks);
        console.log(`Recovered ${recovered} stuck inProgress tasks on startup`);
      }
    }
  } catch (e) {
    console.error('[Startup recovery]', e.message);
  }

  // Pre-warm caches in background — don't block startup
  setTimeout(() => refreshStatusCache(), 50);

  setTimeout(async () => {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/activity`);
      if (r.ok) console.log('[Startup] Pre-warmed activity cache');
      else console.warn('[Startup] Activity pre-warm returned', r.status);
    } catch (e) {
      console.warn('[Startup] Activity pre-warm failed:', e.message);
    }
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/costs`);
      if (r.ok) console.log('[Startup] Pre-warmed costs cache');
      else console.warn('[Startup] Costs pre-warm returned', r.status);
    } catch (e) {
      console.warn('[Startup] Costs pre-warm failed:', e.message);
    }
  }, 3000);
});
