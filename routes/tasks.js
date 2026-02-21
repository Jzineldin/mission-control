'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const { TASKS_FILE, OPENCLAW_DIR, GATEWAY_PORT, GATEWAY_TOKEN, SUB_AGENT_MODEL } = require('../lib/config');
const cache = require('../lib/cache');
const { readJSON, writeJSON, generateId } = require('../lib/helpers');

const router = express.Router();

// ── GET /api/tasks ────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const data = await readJSON(TASKS_FILE, null);
    if (!data) throw new Error('tasks.json not found');
    res.json(data);
  } catch (e) {
    console.error('[Tasks API] Failed to read tasks.json:', e.message);
    res.json({ columns: { queue: [], inProgress: [], blocked: [], done: [] } });
  }
});

// ── POST /api/tasks ───────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const data = req.body;
    if (!data?.columns) {
      return res.status(400).json({ error: 'Invalid format. Expected { columns: { queue, inProgress, done, ... } }' });
    }
    await writeJSON(TASKS_FILE, data);
    res.json({ ok: true, message: 'Tasks updated' });
  } catch (e) {
    console.error('[Tasks POST]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/tasks/add ───────────────────────────────────────────────────────

router.post('/add', async (req, res) => {
  try {
    const { title, description, priority, tags } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });

    const tasks = await readJSON(TASKS_FILE, { columns: { queue: [], inProgress: [], blocked: [], done: [] } });
    const task = {
      id: generateId('task'),
      title,
      description: description || '',
      priority: priority || 'medium',
      created: new Date().toISOString(),
      tags: tags || [],
      source: 'manual',
    };
    tasks.columns.queue.unshift(task);
    await writeJSON(TASKS_FILE, tasks);
    res.json({ ok: true, task });
  } catch (e) {
    console.error('[Tasks add]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/tasks/:taskId ─────────────────────────────────────────────────

router.delete('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const tasks = await readJSON(TASKS_FILE, { columns: {} });

    let found = false;
    for (const col of Object.keys(tasks.columns)) {
      const idx = tasks.columns[col].findIndex(t => t.id === taskId);
      if (idx !== -1) {
        tasks.columns[col].splice(idx, 1);
        found = true;
        break;
      }
    }
    if (!found) return res.status(404).json({ error: 'Task not found' });

    await writeJSON(TASKS_FILE, tasks);
    cache.activity = null;
    cache.activityTime = 0;
    res.json({ ok: true, deleted: taskId });
  } catch (e) {
    console.error('[Tasks delete]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/tasks/:taskId/execute ──────────────────────────────────────────

router.post('/:taskId/execute', async (req, res) => {
  try {
    const { taskId } = req.params;
    const tasks = await readJSON(TASKS_FILE, { columns: {} });

    // Find task in any column
    let task = null;
    for (const [col, items] of Object.entries(tasks.columns)) {
      const idx = items.findIndex(t => t.id === taskId);
      if (idx >= 0) {
        task = items.splice(idx, 1)[0];
        break;
      }
    }
    if (!task) return res.status(404).json({ error: 'Task not found' });

    task.startedAt = new Date().toISOString();
    task.status = 'executing';
    tasks.columns.inProgress.unshift(task);
    await writeJSON(TASKS_FILE, tasks);

    // Read gateway credentials from OpenClaw config
    const cfg = await readJSON(path.join(OPENCLAW_DIR, 'openclaw.json'), {});
    const gwToken = cfg.gateway?.auth?.token || process.env.MC_GATEWAY_TOKEN || GATEWAY_TOKEN;
    const gwPort = cfg.gateway?.port || GATEWAY_PORT;

    const taskPrompt = buildTaskPrompt(task);

    // Spawn sub-agent — fire and forget
    const spawnRes = await fetch(`http://127.0.0.1:${gwPort}/tools/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${gwToken}` },
      body: JSON.stringify({
        tool: 'sessions_spawn',
        args: { task: taskPrompt, model: SUB_AGENT_MODEL, runTimeoutSeconds: 300, label: `workshop-${taskId}` },
      }),
    });

    const spawnData = await spawnRes.json();
    const childKey = spawnData?.result?.details?.childSessionKey
      || spawnData?.result?.content?.[0]?.text?.match(/"childSessionKey":\s*"([^"]+)"/)?.[1]
      || '';

    if (!childKey) {
      console.error('[Task Execute] No child session key returned:', JSON.stringify(spawnData));
    }

    task.childSessionKey = childKey;
    await writeJSON(TASKS_FILE, tasks);

    // Poll for completion in background
    if (childKey) {
      pollTaskCompletion(taskId, childKey, gwPort, gwToken);
    }

    res.json({ ok: true, message: 'Task execution started', taskId, childKey });
  } catch (e) {
    console.error('[Task execute]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Background polling ────────────────────────────────────────────────────────

function pollTaskCompletion(taskId, childKey, gwPort, gwToken) {
  const pollInterval = setInterval(async () => {
    try {
      const listData = await fetch(`http://127.0.0.1:${gwPort}/tools/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${gwToken}` },
        body: JSON.stringify({ tool: 'sessions_list', args: { limit: 100, messageLimit: 1 } }),
      }).then(r => r.json());

      const listParsed = JSON.parse(listData?.result?.content?.[0]?.text || '{}');
      const sessions = listParsed.sessions || listParsed || [];
      const child = sessions.find(s => s.key === childKey);
      const isEnded = !child || child.abortedLastRun || (child.idle && child.idle > 60);
      if (!isEnded) return;

      clearInterval(pollInterval);
      const resultText = await fetchTaskResult(childKey, gwPort, gwToken);
      await markTaskDone(taskId, resultText);
    } catch (e) {
      console.error('[Task poll]', e.message);
    }
  }, 10000);

  // Safety timeout: 6 minutes
  setTimeout(async () => {
    clearInterval(pollInterval);
    try {
      const tasks = await readJSON(TASKS_FILE, { columns: { inProgress: [] } });
      const idx = tasks.columns.inProgress.findIndex(t => t.id === taskId);
      if (idx >= 0) {
        const timedOut = tasks.columns.inProgress.splice(idx, 1)[0];
        timedOut.status = 'done';
        timedOut.completed = new Date().toISOString();
        timedOut.result = 'Task timed out after 6 minutes. Check sub-agent session for results.';
        tasks.columns.done.unshift(timedOut);
        await writeJSON(TASKS_FILE, tasks);
        console.warn(`[Task poll] ${taskId} timed out`);
      }
    } catch (e) {
      console.error('[Task poll] Timeout cleanup failed:', e.message);
    }
  }, 360000);
}

async function fetchTaskResult(childKey, gwPort, gwToken) {
  // Try sessions_history via gateway
  try {
    const histRes = await fetch(`http://127.0.0.1:${gwPort}/tools/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${gwToken}` },
      body: JSON.stringify({ tool: 'sessions_history', args: { sessionKey: childKey, limit: 5 } }),
    });
    const histData = await histRes.json();
    const histText = histData?.result?.content?.[0]?.text || '';
    try {
      const msgs = JSON.parse(histText);
      const assistantMsgs = (Array.isArray(msgs) ? msgs : []).filter(m => m.role === 'assistant');
      if (assistantMsgs.length > 0) {
        const last = assistantMsgs[assistantMsgs.length - 1];
        const text = typeof last.content === 'string' ? last.content : last.content?.[0]?.text || '';
        if (text) return text;
      }
    } catch {
      if (histText) return histText.substring(0, 2000);
    }
  } catch (e) {
    console.error('[Task result] History fetch failed:', e.message);
  }

  // Fallback: read transcript file directly
  try {
    const sessionsJson = await readJSON(
      path.join(OPENCLAW_DIR, 'agents/main/sessions/sessions.json'),
      {}
    );
    const sessionId = sessionsJson[childKey]?.sessionId || '';
    const transcriptPath = path.join(OPENCLAW_DIR, 'agents/main/sessions', `${sessionId}.jsonl`);
    if (sessionId && fs.existsSync(transcriptPath)) {
      const lines = (await fs.promises.readFile(transcriptPath, 'utf8')).trim().split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const evt = JSON.parse(lines[i]);
          if (evt.type === 'message' && evt.message?.role === 'assistant') {
            const content = evt.message.content;
            const text = Array.isArray(content)
              ? content.filter(c => c.type === 'text').map(c => c.text).join('\n')
              : typeof content === 'string' ? content : '';
            if (text) return text;
          }
        } catch {
          // skip malformed line
        }
      }
    }
  } catch (e) {
    console.error('[Task result] Transcript read failed:', e.message);
  }

  return '';
}

async function markTaskDone(taskId, resultText) {
  try {
    const tasks = await readJSON(TASKS_FILE, { columns: { inProgress: [], done: [] } });
    const idx = tasks.columns.inProgress.findIndex(t => t.id === taskId);
    if (idx >= 0) {
      const doneTask = tasks.columns.inProgress.splice(idx, 1)[0];
      doneTask.status = 'done';
      doneTask.completed = new Date().toISOString();
      doneTask.result = (resultText || 'Task completed (no output captured)').substring(0, 3000);
      tasks.columns.done.unshift(doneTask);
      await writeJSON(TASKS_FILE, tasks);
      console.log(`[Task execute] Done: ${taskId} — ${doneTask.result.substring(0, 80)}...`);
    }
  } catch (e) {
    console.error('[Task done] Failed to update tasks.json:', e.message);
  }
}

// ── Task prompt builder ───────────────────────────────────────────────────────

function buildTaskPrompt(task) {
  const title = task.title || '';
  const desc = task.description || '';
  const fullText = `${title} ${desc}`.toLowerCase();

  if (task.source === 'scout' && (fullText.includes('skill') || fullText.includes('plugin'))) {
    return `RESEARCH TASK: A new OpenClaw skill/plugin was found by the Scout engine.

Title: ${task.title}
Details: ${task.description}

Your job:
1. Visit the URL mentioned and read about this skill
2. Summarize what it does, who made it, and key features
3. Check if it's compatible with our setup (OpenClaw on AWS EC2, Ubuntu)
4. Give a clear recommendation: INSTALL (with instructions) or SKIP (with reason)
5. Rate usefulness 1-10 for our use case

Be thorough but concise. This report will be shown to the user.`;
  }

  if (task.source === 'scout' && (fullText.includes('bounty') || fullText.includes('hackerone') || fullText.includes('bugcrowd'))) {
    return `BUG BOUNTY RESEARCH: The Scout engine found a potential bounty opportunity.

Title: ${task.title}
Details: ${task.description}

Your job:
1. Research this program/target — what's the scope, payout range, platform
2. Check if it's a new program or new scope addition
3. Identify the most promising attack surfaces
4. Estimate difficulty and potential payout
5. Give a GO/SKIP recommendation with reasoning

Be specific and actionable.`;
  }

  if (task.source === 'scout' && (fullText.includes('freelance') || fullText.includes('job') || fullText.includes('hiring') || fullText.includes('looking for'))) {
    return `JOB/FREELANCE RESEARCH: The Scout engine found a potential opportunity.

Title: ${task.title}
Details: ${task.description}

Your job:
1. Research this opportunity — who's hiring, what they need, compensation
2. Check if it matches our skills (React, Next.js, Supabase, AI/ML, Python)
3. Draft a brief pitch/response if it's a good fit
4. Give an APPLY/SKIP recommendation

Be practical — focus on fit and potential earnings.`;
  }

  if (task.source === 'scout' && (fullText.includes('grant') || fullText.includes('funding') || fullText.includes('competition'))) {
    return `FUNDING RESEARCH: The Scout engine found a potential grant/funding opportunity.

Title: ${task.title}
Details: ${task.description}

Your job:
1. Research eligibility, deadlines, and requirements
2. Check if the project qualifies
3. Summarize the application process
4. Give an APPLY/SKIP recommendation with deadline

Be specific about requirements and timeline.`;
  }

  return `TASK EXECUTION:

Title: ${task.title}
Description: ${task.description}

Your job:
1. Analyze what needs to be done
2. Do the work — research, write, code, whatever is needed
3. If the task requires external actions (sending emails, deploying code), describe exactly what should be done but don't do it without explicit permission
4. Provide a clear, detailed summary of results and any next steps

Be thorough. Your output will be shown directly to the user as the task result.`;
}

module.exports = router;
