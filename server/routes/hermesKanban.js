const express = require('express');
const fs = require('fs');
const os = require('os');
const util = require('util');
const { execFile } = require('child_process');

const execFilePromise = util.promisify(execFile);

const STATUSES = ['triage', 'todo', 'ready', 'running', 'blocked', 'done'];

function findHermesBin() {
  const home = process.env.MC_USER_HOME || process.env.HOME || os.homedir();
  return [
    process.env.HERMES_BIN,
    `${home}/.local/bin/hermes`,
    '/opt/homebrew/bin/hermes',
    '/usr/local/bin/hermes',
    'hermes',
  ].filter(Boolean).find((candidate) => {
    try {
      return candidate === 'hermes' || fs.existsSync(candidate);
    } catch {
      return candidate === 'hermes';
    }
  }) || 'hermes';
}

function normalizeEpoch(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return new Date(numeric * 1000).toISOString();
}

function parseJsonOutput(stdout, fallback) {
  const text = String(stdout || '').trim();
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.search(/[\[{]/);
    if (start >= 0) return JSON.parse(text.slice(start));
    throw new Error(`Hermes returned non-JSON output: ${text.slice(0, 120)}`);
  }
}

function normalizeTask(task) {
  return {
    ...task,
    createdAt: normalizeEpoch(task.created_at),
    startedAt: normalizeEpoch(task.started_at),
    completedAt: normalizeEpoch(task.completed_at),
    lastHeartbeatAt: normalizeEpoch(task.last_heartbeat_at),
    skills: Array.isArray(task.skills) ? task.skills : [],
  };
}

function normalizeAssignee(row) {
  const counts = row?.counts && typeof row.counts === 'object' ? row.counts : {};
  const active = ['triage', 'todo', 'ready', 'running', 'blocked']
    .reduce((sum, status) => sum + Number(counts[status] || 0), 0);
  return {
    name: String(row?.name || 'unknown'),
    onDisk: Boolean(row?.on_disk),
    counts,
    active,
  };
}

function normalizeDetail(payload) {
  const task = normalizeTask(payload.task || {});
  const events = Array.isArray(payload.events) ? payload.events.map((event) => ({
    ...event,
    createdAt: normalizeEpoch(event.created_at),
  })) : [];
  const comments = Array.isArray(payload.comments) ? payload.comments.map((comment) => ({
    ...comment,
    createdAt: normalizeEpoch(comment.created_at),
  })) : [];
  const runs = Array.isArray(payload.runs) ? payload.runs.map((run) => ({
    ...run,
    startedAt: normalizeEpoch(run.started_at),
    endedAt: normalizeEpoch(run.ended_at),
  })) : [];
  return { ...payload, task, events, comments, runs };
}

function buildHermesEnv(profile) {
  const hostHome = process.env.MC_USER_HOME || process.env.HOME || os.homedir();
  return {
    ...process.env,
    HOME: hostHome,
    HERMES_PROFILE: profile,
  };
}

function buildHermesKanbanRouter({ mcConfig }) {
  const router = express.Router();
  const hermesBin = process.env.HERMES_BIN || findHermesBin();
  const profile = process.env.HERMES_PROFILE || mcConfig?.hermes?.profile || 'hmudur';

  async function hermes(args, { json = false, timeout = 15000 } = {}) {
    const { stdout, stderr } = await execFilePromise(hermesBin, ['--profile', profile, 'kanban', ...args], {
      env: buildHermesEnv(profile),
      timeout,
      maxBuffer: 10 * 1024 * 1024,
    });
    const errorText = String(stderr || '').trim();
    const out = String(stdout || '').trim();
    if (out.toLowerCase().includes('could not initialize database')) {
      throw new Error(out);
    }
    if (json) return parseJsonOutput(out, null);
    return { stdout: out, stderr: errorText };
  }

  router.get('/api/hermes-kanban', async (req, res) => {
    try {
      const columns = {};
      const [lists, stats, assignees] = await Promise.all([
        Promise.all(STATUSES.map(async (status) => {
          const tasks = await hermes(['list', '--status', status, '--json'], { json: true });
          return [status, Array.isArray(tasks) ? tasks.map(normalizeTask) : []];
        })),
        hermes(['stats', '--json'], { json: true }).catch(() => null),
        hermes(['assignees', '--json'], { json: true }).catch(() => []),
      ]);
      for (const [status, tasks] of lists) columns[status] = tasks;

      const allTasks = Object.values(columns).flat();
      const byAssignee = allTasks.reduce((acc, task) => {
        const key = task.assignee || 'unassigned';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      const activeCount = ['triage', 'todo', 'ready', 'running', 'blocked']
        .reduce((sum, status) => sum + (columns[status]?.length || 0), 0);

      res.json({
        ok: true,
        source: 'hermes-kanban-cli',
        profile,
        refreshedAt: new Date().toISOString(),
        statuses: STATUSES,
        columns,
        stats,
        assignees: Array.isArray(assignees) ? assignees.map(normalizeAssignee) : [],
        summary: {
          total: allTasks.length,
          active: activeCount,
          done: columns.done?.length || 0,
          blocked: columns.blocked?.length || 0,
          running: columns.running?.length || 0,
          byAssignee,
        },
      });
    } catch (error) {
      res.status(503).json({
        ok: false,
        error: error.message,
        profile,
        columns: Object.fromEntries(STATUSES.map((status) => [status, []])),
        statuses: STATUSES,
      });
    }
  });

  router.get('/api/hermes-kanban/tasks/:taskId', async (req, res) => {
    try {
      const payload = await hermes(['show', req.params.taskId, '--json'], { json: true });
      res.json({ ok: true, profile, ...normalizeDetail(payload || {}) });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message, taskId: req.params.taskId });
    }
  });

  function assertNoFlagPrefix(value, label) {
    const text = String(value || '');
    if (text.startsWith('-')) {
      const error = new Error(`${label} cannot start with "-"`);
      error.statusCode = 400;
      throw error;
    }
    return text;
  }

  router.post('/api/hermes-kanban/actions', async (req, res) => {
    try {
      const body = req.body || {};
      const action = String(body.action || '').trim();
      const taskId = String(body.taskId || '').trim();
      const args = [];

      if (action === 'create') {
        const title = assertNoFlagPrefix(String(body.title || '').trim(), 'title');
        if (!title) return res.status(400).json({ error: 'title required' });
        args.push('create', title);
        if (body.body) args.push('--body', String(body.body));
        if (body.assignee) args.push('--assignee', assertNoFlagPrefix(body.assignee, 'assignee'));
        if (body.workspace) args.push('--workspace', assertNoFlagPrefix(body.workspace, 'workspace'));
        if (body.tenant) args.push('--tenant', assertNoFlagPrefix(body.tenant, 'tenant'));
        if (Number.isFinite(Number(body.priority))) args.push('--priority', String(Math.trunc(Number(body.priority))));
        if (body.triage) args.push('--triage');
        if (Array.isArray(body.skills)) {
          body.skills.filter(Boolean).forEach((skill) => args.push('--skill', assertNoFlagPrefix(skill, 'skill')));
        }
        args.push('--created-by', 'mission-control', '--json');
      } else {
        if (!taskId) return res.status(400).json({ error: 'taskId required' });
        const safeTaskId = assertNoFlagPrefix(taskId, 'taskId');
        if (action === 'assign') {
          if (!body.assignee) return res.status(400).json({ error: 'assignee required' });
          args.push('assign', safeTaskId, assertNoFlagPrefix(body.assignee, 'assignee'));
        } else if (action === 'comment') {
          if (!body.text) return res.status(400).json({ error: 'text required' });
          args.push('comment', '--author', 'mission-control', safeTaskId, String(body.text));
        } else if (action === 'block') {
          args.push('block', safeTaskId, String(body.reason || 'Blocked from Mission Control'));
        } else if (action === 'unblock') {
          args.push('unblock', safeTaskId);
        } else if (action === 'archive') {
          args.push('archive', safeTaskId);
        } else if (action === 'dispatch') {
          args.push('dispatch', '--max', '1', '--json');
        } else {
          return res.status(400).json({ error: `Unsupported action: ${action}` });
        }
      }

      const result = await hermes(args, { json: action === 'create' || action === 'dispatch', timeout: action === 'dispatch' ? 30000 : 15000 });
      res.json({ ok: true, action, result });
    } catch (error) {
      res.status(error.statusCode || 500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

module.exports = { buildHermesKanbanRouter };
