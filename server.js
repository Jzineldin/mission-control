const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');
const multer = require('multer');

// ========== CONFIG: Load mc-config.json (or create from defaults) ==========
const MC_CONFIG_PATH = path.join(__dirname, 'mc-config.json');
const MC_DEFAULT_CONFIG_PATH = path.join(__dirname, 'mc-config.default.json');
let mcConfig;
try {
  mcConfig = JSON.parse(fs.readFileSync(MC_CONFIG_PATH, 'utf8'));
} catch {
  // First run — copy default
  if (fs.existsSync(MC_DEFAULT_CONFIG_PATH)) {
    fs.copyFileSync(MC_DEFAULT_CONFIG_PATH, MC_CONFIG_PATH);
    mcConfig = JSON.parse(fs.readFileSync(MC_CONFIG_PATH, 'utf8'));
  } else {
    mcConfig = {
      name: 'Mission Control',
      subtitle: 'Mission Control',
      modules: { dashboard: true, chat: true, workshop: true, costs: true, cron: true, agents: true, settings: true, skills: true },
      gateway: { port: 18789, token: '' },
      aws: { enabled: false, bucket: '', region: 'us-east-1' },
      notion: { enabled: false, dbId: '', token: '' },
      scout: { enabled: false, braveApiKey: '' },
      workspace: '',
      skillsPath: '',
      memoryPath: ''
    };
  }
}

// Config-derived constants (backward compat)
const GATEWAY_PORT = mcConfig.gateway?.port || 18789;
const GATEWAY_TOKEN = mcConfig.gateway?.token || '';
const NOTION_DB_ID = mcConfig.notion?.dbId || '';
const NOTION_TOKEN = mcConfig.notion?.token || '';
const WORKSPACE_PATH = mcConfig.workspace || process.env.HOME || '/home/ubuntu';
const SKILLS_PATH = mcConfig.skillsPath || path.join(WORKSPACE_PATH, 'skills');
const MEMORY_PATH = mcConfig.memoryPath || path.join(WORKSPACE_PATH, 'memory');
const S3_BUCKET = mcConfig.aws?.bucket || '';
const S3_REGION = mcConfig.aws?.region || 'us-east-1';

const app = express();
const PORT = 3333;

app.use(express.json());

// Serve React frontend (static assets)
app.use(express.static(path.join(__dirname, 'frontend/dist')));

// Serve public files (concepts, etc)
app.use('/public', express.static(path.join(__dirname, 'public')));

// ========== HELPER: Fetch sessions from gateway ==========
async function fetchSessions(limit = 50) {
  try {
    const gwRes = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/tools/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GATEWAY_TOKEN}`,
      },
      body: JSON.stringify({
        tool: 'sessions_list',
        args: { limit, messageLimit: 0 },
      }),
    });
    const data = await gwRes.json();
    return data?.result?.details?.sessions || [];
  } catch (e) {
    console.error('[fetchSessions]', e.message);
    return [];
  }
}

// ========== HELPER: Fetch Notion activity ==========
async function fetchNotionActivity(pageSize = 5) {
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        page_size: pageSize,
        sorts: [{ property: 'Date', direction: 'descending' }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.results || !data.results.length) return null;

    return data.results.map(page => {
      const props = page.properties || {};
      // Name is a title field
      const name = (props.Name?.title || []).map(t => t.plain_text).join('') || 'Activity';
      // Date
      const dateStr = props.Date?.date?.start || page.created_time || new Date().toISOString();
      // Category
      const category = props.Category?.select?.name || 'general';
      // Status
      const status = props.Status?.select?.name || props.Status?.status?.name || 'done';
      // Details
      const details = (props.Details?.rich_text || []).map(t => t.plain_text).join('') || '';

      // Map category to type
      const typeMap = {
        'Development': 'development',
        'Business': 'business',
        'Meeting': 'meeting',
        'Planning': 'planning',
        'Bug Fix': 'development',
        'Personal': 'personal',
      };

      return {
        time: dateStr,
        action: name,
        detail: details || `${category} — ${status}`,
        type: typeMap[category] || 'general',
      };
    });
  } catch (e) {
    console.error('[Notion API]', e.message);
    return null;
  }
}

// ========== HELPER: Parse CSV (handles quoted fields) ==========
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim().replace(/^"(.*)"$/, '$1')] = (values[i] || '').trim().replace(/^"(.*)"$/, '$1'); });
    return obj;
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ========== CHAT PROXY ==========
// Proxies to OpenClaw Gateway chat completions API (streaming SSE)
app.post('/api/chat', async (req, res) => {
  const { messages, stream } = req.body;

  const payload = JSON.stringify({
    model: 'openclaw',
    messages: messages || [],
    stream: !!stream,
    user: 'mission-control',
  });

  console.log('[Chat proxy] Sending to gateway, payload length:', Buffer.byteLength(payload));

  try {
    const gwRes = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GATEWAY_TOKEN}`,
      },
      body: payload,
      signal: AbortSignal.timeout(120000),
    });

    if (stream) {
      // SSE streaming — pipe through
      res.writeHead(gwRes.status, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const reader = gwRes.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { res.end(); break; }
          res.write(value);
        }
      };
      pump().catch(err => {
        console.error('[Chat proxy] Stream error:', err.message);
        res.end();
      });

      req.on('close', () => { reader.cancel(); });
    } else {
      // Non-streaming JSON
      const data = await gwRes.text();
      console.log('[Chat proxy] Gateway responded:', gwRes.status, data.substring(0, 100));
      res.status(gwRes.status).send(data);
    }
  } catch (err) {
    console.error('[Chat proxy] Fetch error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: `Gateway error: ${err.message}` });
    }
  }
});

// ========== API: Agent status + heartbeat ==========
app.get('/api/status', async (req, res) => {
  try {
    // Read heartbeat state
    let heartbeat = {};
    try {
      const raw = fs.readFileSync(path.join(MEMORY_PATH, 'heartbeat-state.json'), 'utf8');
      heartbeat = JSON.parse(raw);
    } catch (e) {
      heartbeat = { lastHeartbeat: null, lastChecks: {}, note: 'Unable to read heartbeat state' };
    }

    // Run openclaw status
    let openclawStatus = '';
    try {
      openclawStatus = execSync('openclaw status 2>&1', { timeout: 15000, encoding: 'utf8' });
    } catch (e) {
      openclawStatus = e.stdout || 'Unable to get openclaw status';
    }

    // Parse some key info from the status output
    const sessionsMatch = openclawStatus.match(/(\d+) active/);
    const modelMatch = openclawStatus.match(/default\s+(us\.anthropic\.\S+|anthropic\.\S+|[\w./-]+claude[\w./-]*)/);
    const memoryMatch = openclawStatus.match(/(\d+)\s*files.*?(\d+)\s*chunks/);
    const heartbeatInterval = openclawStatus.match(/Heartbeat\s*│\s*(\w+)/);
    const agentsMatch = openclawStatus.match(/Agents\s*│\s*(\d+)/);

    // Channel statuses
    const channels = [];
    const channelRegex = /│\s*(Discord|WhatsApp|Telegram)\s*│\s*(ON|OFF)\s*│\s*(OK|OFF|ERROR)\s*│\s*(.+?)\s*│/g;
    let m;
    while ((m = channelRegex.exec(openclawStatus)) !== null) {
      channels.push({ name: m[1], enabled: m[2], state: m[3], detail: m[4].trim() });
    }

    // Fetch real recent activity from Notion (with fallback)
    let recentActivity = null;
    try {
      recentActivity = await fetchNotionActivity(8);
    } catch (e) {
      console.error('[Status] Notion fetch failed:', e.message);
    }

    // Fallback if Notion fails
    if (!recentActivity || !recentActivity.length) {
      // Build from heartbeat state + memory files
      recentActivity = [];
      if (heartbeat.lastHeartbeat) {
        recentActivity.push({
          time: new Date(heartbeat.lastHeartbeat * 1000).toISOString(),
          action: 'Heartbeat check',
          detail: heartbeat.note || 'Routine check',
          type: 'heartbeat'
        });
      }
      // Try to read today's memory file (or yesterday's)
      for (const dayOffset of [0, 1]) {
        const d = new Date();
        d.setDate(d.getDate() - dayOffset);
        const dateStr = d.toISOString().split('T')[0];
        try {
          const memPath = path.join(MEMORY_PATH, `${dateStr}.md`);
          if (fs.existsSync(memPath)) {
            const memContent = fs.readFileSync(memPath, 'utf8');
            // Extract h2 sections as activity items
            const sections = memContent.split(/\n## /).slice(1); // split on ## headers
            sections.slice(0, 6).forEach(section => {
              const firstLine = section.split('\n')[0].trim();
              // Check for timestamps like "07:35 UTC"
              const timeMatch = firstLine.match(/(\d{2}:\d{2})\s*UTC/);
              const time = timeMatch ? `${dateStr}T${timeMatch[1]}:00Z` : `${dateStr}T12:00:00Z`;
              // Clean the title
              const title = firstLine.replace(/\d{2}:\d{2}\s*UTC\s*[-—]\s*/, '').replace(/\*\*/g, '').substring(0, 80);
              // Get a detail from first bullet point
              const bullets = section.split('\n').filter(l => /^[-*]\s/.test(l.trim()));
              const detail = (bullets[0] || '').replace(/^[-*]\s*/, '').replace(/\*\*/g, '').substring(0, 120);
              // Guess type from keywords
              let type = 'general';
              const lower = (title + ' ' + detail).toLowerCase();
              if (lower.includes('bug') || lower.includes('security') || lower.includes('hack') || lower.includes('paypal')) type = 'security';
              else if (lower.includes('build') || lower.includes('deploy') || lower.includes('dashboard') || lower.includes('code')) type = 'development';
              else if (lower.includes('email') || lower.includes('lead') || lower.includes('outreach')) type = 'business';
              else if (lower.includes('heartbeat') || lower.includes('check')) type = 'heartbeat';
              else if (lower.includes('meeting') || lower.includes('call')) type = 'meeting';

              if (title) {
                recentActivity.push({ time, action: title, detail: detail || 'Activity logged', type });
              }
            });
            if (recentActivity.length > 2) break; // Got enough from this day
          }
        } catch (e) { /* ignore */ }
      }

      // If still empty, minimal fallback
      if (!recentActivity.length) {
        recentActivity = [
          { time: new Date().toISOString(), action: 'System running', detail: 'No recent activity data available', type: 'general' }
        ];
      }
    }

    // Fetch real token usage from sessions
    let tokenUsage = { used: 0, limit: 1000000, percentage: 0 };
    try {
      const sessions = await fetchSessions(50);
      const totalTokens = sessions.reduce((sum, s) => sum + (s.totalTokens || 0), 0);
      tokenUsage = {
        used: totalTokens,
        limit: 1000000,
        percentage: parseFloat((totalTokens / 10000).toFixed(1))
      };
    } catch (e) {
      console.error('[Status] Token usage fetch failed:', e.message);
    }

    res.json({
      agent: {
        name: mcConfig.name || 'Mission Control',
        status: 'active',
        model: modelMatch ? modelMatch[1].replace('us.anthropic.','').replace(/claude-opus-(\d+)-(\d+).*/, 'Claude Opus $1').replace(/claude-sonnet-(\d+).*/, 'Claude Sonnet $1').replace(/-/g,' ') : 'Claude Opus 4',
        activeSessions: sessionsMatch ? parseInt(sessionsMatch[1]) : 0,
        totalAgents: agentsMatch ? parseInt(agentsMatch[1]) : 1,
        memoryFiles: memoryMatch ? parseInt(memoryMatch[1]) : 46,
        memoryChunks: memoryMatch ? parseInt(memoryMatch[2]) : 225,
        heartbeatInterval: heartbeatInterval ? heartbeatInterval[1] : '1h',
        channels
      },
      heartbeat,
      recentActivity,
      tokenUsage
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== API: Live sessions (from OpenClaw gateway) ==========
app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await fetchSessions(25);

    res.json({
      count: sessions.length,
      sessions: sessions.map(s => ({
        key: s.key,
        kind: s.kind,
        channel: s.channel || 'unknown',
        displayName: s.displayName || s.key.split(':').slice(-1)[0],
        model: (s.model || '').replace('us.anthropic.', ''),
        totalTokens: s.totalTokens || 0,
        contextTokens: s.contextTokens || 0,
        updatedAt: s.updatedAt ? new Date(s.updatedAt).toISOString() : null,
        label: s.label || null,
      })),
    });
  } catch (e) {
    console.error('[Sessions API]', e.message);
    res.json({ count: 0, sessions: [], error: e.message });
  }
});

// ========== API: Cron jobs (LIVE from OpenClaw) ==========
app.get('/api/cron', (req, res) => {
  try {
    const cronRaw = execSync('openclaw cron list --json 2>&1', { timeout: 10000, encoding: 'utf8' });
    const parsed = JSON.parse(cronRaw);

    const jobs = (parsed.jobs || []).map(j => ({
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
    }));

    res.json({ jobs });
  } catch (e) {
    console.error('[Cron API]', e.message);
    res.json({ jobs: [], error: e.message });
  }
});

// ========== API: Tasks (Kanban) — reads from tasks.json ==========
const TASKS_FILE = path.join(__dirname, 'tasks.json');

app.get('/api/tasks', (req, res) => {
  try {
    const raw = fs.readFileSync(TASKS_FILE, 'utf8');
    const data = JSON.parse(raw);
    res.json(data);
  } catch (e) {
    console.error('[Tasks API] Failed to read tasks.json:', e.message);
    // Fallback: empty board
    res.json({
      columns: { queue: [], inProgress: [], blocked: [], done: [] }
    });
  }
});

// POST: Update tasks
app.post('/api/tasks', (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.columns) {
      return res.status(400).json({ error: 'Invalid format. Expected { columns: { queue, inProgress, done, ... } }' });
    }
    fs.writeFileSync(TASKS_FILE, JSON.stringify(data, null, 2), 'utf8');
    res.json({ ok: true, message: 'Tasks updated' });
  } catch (e) {
    console.error('[Tasks POST]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST: Add a single task to queue
app.post('/api/tasks/add', (req, res) => {
  try {
    const { title, description, priority, tags } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    
    const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    const task = {
      id: `task-${Date.now()}`,
      title,
      description: description || '',
      priority: priority || 'medium',
      created: new Date().toISOString(),
      tags: tags || [],
      source: 'manual',
    };
    tasks.columns.queue.unshift(task);
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
    res.json({ ok: true, task });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST: Execute a task — spawns sub-agent
app.post('/api/tasks/:taskId/execute', async (req, res) => {
  try {
    const { taskId } = req.params;
    const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    
    // Find task in any column
    let task = null;
    let fromCol = null;
    for (const [col, items] of Object.entries(tasks.columns)) {
      const idx = items.findIndex(t => t.id === taskId);
      if (idx >= 0) {
        task = items[idx];
        fromCol = col;
        items.splice(idx, 1);
        break;
      }
    }
    
    if (!task) return res.status(404).json({ error: 'Task not found' });
    
    // Move to inProgress
    task.startedAt = new Date().toISOString();
    task.status = 'executing';
    tasks.columns.inProgress.unshift(task);
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
    
    // Spawn sub-agent via gateway
    const configPath = path.join(require('os').homedir(), '.openclaw/openclaw.json');
    const cfg = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
    const gwToken = cfg.gateway?.auth?.token || 'mc-zinbot-2026';
    const gwPort = cfg.gateway?.port || 18789;
    
    // Fire and forget — sub-agent runs in background
    fetch(`http://127.0.0.1:${gwPort}/tools/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${gwToken}` },
      body: JSON.stringify({
        tool: 'sessions_spawn',
        input: {
          task: `Execute this task:\n\nTitle: ${task.title}\nDescription: ${task.description}\n\nDo the work described. When done, summarize what you accomplished.`,
          model: 'sonnet',
          runTimeoutSeconds: 300,
          label: `workshop-${taskId}`
        }
      })
    }).then(async (spawnRes) => {
      const spawnData = await spawnRes.json();
      const resultText = spawnData?.result?.content?.[0]?.text || '';
      
      // Move task to done
      const tasksNow = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
      const idx = tasksNow.columns.inProgress.findIndex(t => t.id === taskId);
      if (idx >= 0) {
        const doneTask = tasksNow.columns.inProgress.splice(idx, 1)[0];
        doneTask.status = 'done';
        doneTask.completed = new Date().toISOString();
        doneTask.result = resultText.substring(0, 2000) || 'Completed';
        tasksNow.columns.done.unshift(doneTask);
        fs.writeFileSync(TASKS_FILE, JSON.stringify(tasksNow, null, 2));
      }
    }).catch(err => {
      console.error('[Task Execute] Sub-agent error:', err.message);
      // Move task back to queue on error
      const tasksNow = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
      const idx = tasksNow.columns.inProgress.findIndex(t => t.id === taskId);
      if (idx >= 0) {
        const failedTask = tasksNow.columns.inProgress.splice(idx, 1)[0];
        failedTask.status = 'failed';
        failedTask.error = err.message;
        tasksNow.columns.queue.unshift(failedTask);
        fs.writeFileSync(TASKS_FILE, JSON.stringify(tasksNow, null, 2));
      }
    });
    
    res.json({ ok: true, message: 'Task execution started', taskId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== API: Costs — Real token usage from sessions ==========
app.get('/api/costs', async (req, res) => {
  try {
    const sessions = await fetchSessions(50);

    // Compute totals
    const totalTokens = sessions.reduce((sum, s) => sum + (s.totalTokens || 0), 0);

    // Breakdown by channel
    const byChannel = {};
    sessions.forEach(s => {
      const ch = s.channel || 'unknown';
      if (!byChannel[ch]) byChannel[ch] = { tokens: 0, sessions: 0 };
      byChannel[ch].tokens += (s.totalTokens || 0);
      byChannel[ch].sessions += 1;
    });

    // Breakdown by session type
    const byType = { main: 0, subagent: 0, discord: 0, openai: 0, other: 0 };
    sessions.forEach(s => {
      const key = s.key || '';
      const tokens = s.totalTokens || 0;
      if (key.includes(':subagent:')) byType.subagent += tokens;
      else if (key.includes(':main:main')) byType.main += tokens;
      else if (key.includes(':discord:')) byType.discord += tokens;
      else if (key.includes(':openai')) byType.openai += tokens;
      else byType.other += tokens;
    });

    // Build byService from real data (Bedrock = $0, but show token volume)
    const byService = Object.entries(byChannel)
      .filter(([_, v]) => v.tokens > 0)
      .map(([name, v]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        cost: 0,
        tokens: v.tokens,
        sessions: v.sessions,
        percentage: totalTokens > 0 ? Math.round((v.tokens / totalTokens) * 100) : 0,
      }))
      .sort((a, b) => b.tokens - a.tokens);

    // Daily token estimates — group sessions by last updated date
    const dailyMap = {};
    sessions.forEach(s => {
      if (s.updatedAt) {
        const day = new Date(s.updatedAt).toISOString().split('T')[0];
        if (!dailyMap[day]) dailyMap[day] = 0;
        dailyMap[day] += (s.totalTokens || 0);
      }
    });

    // Fill in last 7 days
    const daily = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      daily.push({
        date: dateStr,
        total: 0,
        tokens: dailyMap[dateStr] || 0,
        breakdown: {
          'Claude Opus 4 (Bedrock)': 0,
        }
      });
    }

    res.json({
      daily,
      summary: {
        today: 0,
        thisWeek: 0,
        thisMonth: 0,
        totalTokens,
        totalSessions: sessions.length,
        activeSessions: sessions.filter(s => (s.totalTokens || 0) > 0).length,
        note: 'All LLM costs are $0 — using AWS Bedrock with included credits',
        budget: { monthly: 0, warning: 0 }
      },
      byService,
      byType,
      byChannel,
    });
  } catch (e) {
    console.error('[Costs API]', e.message);
    res.json({
      daily: [],
      summary: { today: 0, thisWeek: 0, thisMonth: 0, totalTokens: 0, budget: { monthly: 0, warning: 0 } },
      byService: [],
      byType: {},
      byChannel: {},
      error: e.message,
    });
  }
});

// ========== API: Scout — Real SmålandWebb lead data ==========
app.get('/api/scout', (req, res) => {
  try {
    // Read scout results from scout-engine.js output
    let scoutData = { opportunities: [], lastScan: null };
    try {
      scoutData = JSON.parse(fs.readFileSync(path.join(__dirname, 'scout-results.json'), 'utf8'));
    } catch (e) {
      console.log('[Scout] No scout-results.json yet — run: node scout-engine.js');
    }

    // Filter out junk (score < 15)
    const opportunities = (scoutData.opportunities || []).filter(o => o.score >= 15);

    res.json({
      opportunities,
      lastScan: scoutData.lastScan || null,
      queryCount: scoutData.queryCount || 0,
      stats: {
        total: opportunities.length,
        new: opportunities.filter(o => o.status === 'new').length,
        deployed: opportunities.filter(o => o.status === 'deployed').length,
        dismissed: opportunities.filter(o => o.status === 'dismissed').length,
        avgScore: opportunities.length ? Math.round(opportunities.reduce((a, o) => a + o.score, 0) / opportunities.length) : 0,
      },
    });
  } catch (e) {
    console.error('[Scout API]', e.message);
    res.json({ opportunities: [], stats: {}, error: e.message });
  }
});

// Scout: Deploy opportunity → adds to Workshop tasks
app.post('/api/scout/deploy', (req, res) => {
  try {
    const { opportunityId } = req.body;
    if (!opportunityId) return res.status(400).json({ error: 'Missing opportunityId' });

    // Update scout results status
    const scoutFile = path.join(__dirname, 'scout-results.json');
    const scoutData = JSON.parse(fs.readFileSync(scoutFile, 'utf8'));
    const opp = scoutData.opportunities.find(o => o.id === opportunityId);
    if (!opp) return res.status(404).json({ error: 'Opportunity not found' });
    
    opp.status = 'deployed';
    fs.writeFileSync(scoutFile, JSON.stringify(scoutData, null, 2));

    // Add to tasks.json queue
    const tasksFile = path.join(__dirname, 'tasks.json');
    const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
    tasks.columns.queue.unshift({
      id: `scout-${Date.now()}`,
      title: opp.title.substring(0, 80),
      description: `${opp.summary}\n\nSource: ${opp.source} | Score: ${opp.score}\nURL: ${opp.url}`,
      priority: opp.score >= 80 ? 'high' : opp.score >= 50 ? 'medium' : 'low',
      created: new Date().toISOString(),
      tags: opp.tags || [opp.category],
      source: 'scout',
    });
    fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));

    res.json({ ok: true, task: tasks.columns.queue[0] });
  } catch (e) {
    console.error('[Scout deploy]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Scout: Dismiss opportunity
app.post('/api/scout/dismiss', (req, res) => {
  try {
    const { opportunityId } = req.body;
    const scoutFile = path.join(__dirname, 'scout-results.json');
    const scoutData = JSON.parse(fs.readFileSync(scoutFile, 'utf8'));
    const opp = scoutData.opportunities.find(o => o.id === opportunityId);
    if (opp) {
      opp.status = 'dismissed';
      fs.writeFileSync(scoutFile, JSON.stringify(scoutData, null, 2));
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== API: Agents — Real from gateway sessions + custom agents ==========
app.get('/api/agents', async (req, res) => {
  try {
    const sessions = await fetchSessions(50);

    // Load custom agents from agents-custom.json
    const customAgentsFile = path.join(__dirname, 'agents-custom.json');
    let customAgents = [];
    try {
      customAgents = JSON.parse(fs.readFileSync(customAgentsFile, 'utf8'));
    } catch {}

    // Zinbot (primary agent) = main session
    const mainSession = sessions.find(s => s.key === 'agent:main:main');
    const activeSessions = sessions.filter(s => (s.totalTokens || 0) > 0);

    // Build agents list
    const agents = [];

    // Primary: Zinbot
    agents.push({
      id: 'zinbot',
      name: 'Zinbot',
      role: 'Commander',
      avatar: '🤖',
      status: 'active',
      model: mainSession ? (mainSession.model || '').replace('us.anthropic.', '').replace(/claude-opus-(\d+).*/, 'Claude Opus $1').replace(/-/g, ' ') : 'Claude Opus 4',
      description: 'Primary AI agent. Manages all operations, communications, and development tasks.',
      lastActive: mainSession?.updatedAt ? new Date(mainSession.updatedAt).toISOString() : new Date().toISOString(),
      totalTokens: mainSession?.totalTokens || 0,
      sessionKey: 'agent:main:main',
    });

    // Add custom agents
    customAgents.forEach(agent => {
      agents.push({
        id: agent.id,
        name: agent.name,
        role: 'Custom Agent',
        avatar: '⚙️',
        status: agent.status || 'active',
        model: agent.model,
        description: agent.description || 'Custom agent',
        lastActive: null,
        totalTokens: 0,
        sessionKey: null,
        isCustom: true,
        systemPrompt: agent.systemPrompt,
        skills: agent.skills,
        created: agent.created
      });
    });

    // Sub-agents from real sessions
    const subagentSessions = sessions.filter(s => s.key.includes(':subagent:'));
    subagentSessions.forEach(s => {
      agents.push({
        id: s.sessionId || s.key,
        name: s.label || `Sub-agent ${s.key.split(':').pop().substring(0, 8)}`,
        role: 'Sub-Agent',
        avatar: '⚡',
        status: (s.totalTokens || 0) > 0 ? 'active' : 'idle',
        model: (s.model || '').replace('us.anthropic.', '').replace(/claude-opus-(\d+).*/, 'Claude Opus $1').replace(/-/g, ' '),
        description: s.label ? `Task: ${s.label}` : 'Spawned sub-agent',
        lastActive: s.updatedAt ? new Date(s.updatedAt).toISOString() : null,
        totalTokens: s.totalTokens || 0,
        sessionKey: s.key,
      });
    });

    // Discord channel sessions as "channel agents"
    const discordSessions = sessions
      .filter(s => s.key.includes(':discord:channel:') && (s.totalTokens || 0) > 0)
      .sort((a, b) => (b.totalTokens || 0) - (a.totalTokens || 0));

    discordSessions.forEach(s => {
      // Extract readable name from displayName
      const name = (s.displayName || '').replace(/^discord:\d+#/, '') || s.key.split(':').pop();
      agents.push({
        id: s.sessionId || s.key,
        name: `#${name}`,
        role: 'Channel Session',
        avatar: '💬',
        status: 'active',
        model: (s.model || '').replace('us.anthropic.', '').replace(/claude-opus-(\d+).*/, 'Claude Opus $1').replace(/-/g, ' '),
        description: `Discord channel session`,
        lastActive: s.updatedAt ? new Date(s.updatedAt).toISOString() : null,
        totalTokens: s.totalTokens || 0,
        sessionKey: s.key,
      });
    });

    // Mission Control chat session (merge multiple into one)
    const mcSessions = sessions.filter(s => s.key.includes(':openai'));
    const mcTotalTokens = mcSessions.reduce((sum, s) => sum + (s.totalTokens || 0), 0);
    if (mcTotalTokens > 0) {
      const latestMc = mcSessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
      agents.push({
        id: 'mission-control',
        name: 'Mission Control Chat',
        role: 'Interface',
        avatar: '🖥️',
        status: 'active',
        model: (latestMc?.model || '').replace('us.anthropic.', '').replace(/claude-opus-(\d+).*/, 'Claude Opus $1').replace(/-/g, ' '),
        description: `Chat sessions from Mission Control dashboard (${mcSessions.length} sessions)`,
        lastActive: latestMc?.updatedAt ? new Date(latestMc.updatedAt).toISOString() : null,
        totalTokens: mcTotalTokens,
        sessionKey: 'openai-users',
      });
    }

    // No fake conversations — just show real session activity
    const conversations = [];

    res.json({ agents, conversations });
  } catch (e) {
    console.error('[Agents API]', e.message);
    res.json({
      agents: [
        { id: 'zinbot', name: 'Zinbot', role: 'Commander', avatar: '🤖', status: 'active', model: 'Claude Opus 4', description: 'Primary agent (session data unavailable)', lastActive: new Date().toISOString(), totalTokens: 0 }
      ],
      conversations: [],
      error: e.message
    });
  }
});

// Create custom agent
app.post('/api/agents/create', (req, res) => {
  try {
    const { name, description, model, systemPrompt, skills } = req.body;
    if (!name || !model) {
      return res.status(400).json({ error: 'name and model are required' });
    }

    // Save to agents-custom.json file
    const agentsFile = path.join(__dirname, 'agents-custom.json');
    let agents = [];
    try {
      agents = JSON.parse(fs.readFileSync(agentsFile, 'utf8'));
    } catch {}

    const agent = {
      id: `custom-${Date.now()}`,
      name,
      description: description || '',
      model,
      systemPrompt: systemPrompt || '',
      skills: skills || [],
      created: new Date().toISOString(),
      status: 'active'
    };

    agents.push(agent);
    fs.writeFileSync(agentsFile, JSON.stringify(agents, null, 2));

    res.json({ ok: true, agent });
  } catch (error) {
    console.error('[Create Agent]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Settings API endpoints
app.get('/api/settings', async (req, res) => {
  try {
    // Read OpenClaw config
    const configPath = path.join(require('os').homedir(), '.openclaw/openclaw.json');
    const configData = fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
      : {};

    // Sanitize config (remove sensitive data)
    const sanitized = {
      model: configData.model || 'anthropic.claude-3-opus-20240229-v1:0',
      gateway_port: GATEWAY_PORT,
      memory_path: MEMORY_PATH,
      skills_path: SKILLS_PATH,
      bedrock_region: S3_REGION
    };

    res.json(sanitized);
  } catch (error) {
    console.error('Settings error:', error);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

app.post('/api/model', async (req, res) => {
  try {
    const { model } = req.body;

    // Call OpenClaw gateway to update model
    const response = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/config/model`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GATEWAY_TOKEN}`
      },
      body: JSON.stringify({ model })
    });

    if (response.ok) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Failed to switch model' });
    }
  } catch (error) {
    console.error('Model switch error:', error);
    res.status(500).json({ error: 'Failed to switch model' });
  }
});

// Skills API endpoints
app.get('/api/skills', async (req, res) => {
  try {
    const installed = [];
    const available = [];

    // Read OpenClaw config for installed skills
    const configPath = path.join(require('os').homedir(), '.openclaw/openclaw.json');
    let config = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    // Get installed skills from config
    if (config.skills && config.skills.entries) {
      for (const [name, skillConfig] of Object.entries(config.skills.entries)) {
        installed.push({
          name,
          description: skillConfig.description || 'No description',
          status: skillConfig.enabled !== false ? 'active' : 'inactive',
          installed: true,
          path: skillConfig.path,
          type: skillConfig.path?.includes('/usr/lib') ? 'system' : 'workspace'
        });
      }
    }

    // Scan workspace skills directory
    const workspaceSkillsPath = SKILLS_PATH;
    if (fs.existsSync(workspaceSkillsPath)) {
      const dirs = fs.readdirSync(workspaceSkillsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const dir of dirs) {
        const skillPath = path.join(workspaceSkillsPath, dir);
        const isInstalled = installed.some(s => s.name === dir);

        if (!isInstalled) {
          // Check for package.json or skill.json
          let skillInfo = { name: dir, description: 'Workspace skill' };
          const packagePath = path.join(skillPath, 'package.json');
          const skillJsonPath = path.join(skillPath, 'skill.json');

          if (fs.existsSync(packagePath)) {
            const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
            skillInfo.description = pkg.description || skillInfo.description;
            skillInfo.version = pkg.version;
            skillInfo.author = pkg.author;
          } else if (fs.existsSync(skillJsonPath)) {
            const skill = JSON.parse(fs.readFileSync(skillJsonPath, 'utf8'));
            skillInfo.description = skill.description || skillInfo.description;
            skillInfo.version = skill.version;
          }

          available.push({
            ...skillInfo,
            status: 'available',
            installed: false,
            path: skillPath,
            type: 'workspace'
          });
        }
      }
    }

    // Scan system skills directory
    const systemSkillsPath = '/usr/lib/node_modules/openclaw/skills';
    if (fs.existsSync(systemSkillsPath)) {
      const dirs = fs.readdirSync(systemSkillsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const dir of dirs) {
        const skillPath = path.join(systemSkillsPath, dir);
        const isInstalled = installed.some(s => s.name === dir);

        if (!isInstalled) {
          available.push({
            name: dir,
            description: 'System skill',
            status: 'available',
            installed: false,
            path: skillPath,
            type: 'system'
          });
        }
      }
    }

    res.json({ installed, available });
  } catch (error) {
    console.error('Skills error:', error);
    res.status(500).json({ error: 'Failed to load skills' });
  }
});

app.post('/api/skills/:name/toggle', async (req, res) => {
  try {
    const { name } = req.params;

    // Update OpenClaw config
    const configPath = path.join(require('os').homedir(), '.openclaw/openclaw.json');
    const config = fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
      : { skills: { entries: {} } };

    if (config.skills?.entries?.[name]) {
      config.skills.entries[name].enabled = !config.skills.entries[name].enabled;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      // Notify gateway about config change
      await fetch(`http://127.0.0.1:${GATEWAY_PORT}/config/reload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GATEWAY_TOKEN}`
        }
      });

      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Skill not found' });
    }
  } catch (error) {
    console.error('Skill toggle error:', error);
    res.status(500).json({ error: 'Failed to toggle skill' });
  }
});

app.post('/api/skills/:name/install', async (req, res) => {
  // Simplified install - just add to config
  try {
    const { name } = req.params;
    res.json({ success: true, message: 'Skill installation not implemented' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to install skill' });
  }
});

app.post('/api/skills/:name/uninstall', async (req, res) => {
  // Simplified uninstall - just remove from config
  try {
    const { name } = req.params;
    res.json({ success: true, message: 'Skill uninstall not implemented' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to uninstall skill' });
  }
});

// AWS API endpoints
app.get('/api/aws/services', async (req, res) => {
  try {
    const util = require('util');
    const execPromise = util.promisify(require('child_process').exec);

    // Real account info
    let account = { id: '239541130189', region: 'us-east-1' };
    try {
      const { stdout } = await execPromise('aws sts get-caller-identity --output json 2>/dev/null');
      const sts = JSON.parse(stdout);
      account.id = sts.Account;
      account.user = sts.Arn.split('/').pop();
    } catch {}

    // Real services — check what's actually accessible
    const services = [];
    const checks = [
      { name: 'Amazon Bedrock', cmd: 'aws bedrock list-foundation-models --query "length(modelSummaries)" --output text 2>/dev/null', desc: 'Foundation models (Opus, Sonnet, Haiku)', parse: (v) => `${v.trim()} models available` },
      { name: 'Amazon Polly', cmd: 'aws polly describe-voices --query "length(Voices)" --output text 2>/dev/null', desc: 'Text-to-speech (Neural voices)', parse: (v) => `${v.trim()} voices` },
      { name: 'Amazon Transcribe', cmd: 'aws transcribe list-transcription-jobs --max-results 1 --output json 2>/dev/null', desc: 'Speech-to-text', parse: () => 'Ready' },
      { name: 'Amazon Translate', cmd: 'aws translate list-languages --query "length(Languages)" --output text 2>/dev/null', desc: 'Translation (75+ languages)', parse: (v) => `${v.trim()} languages` },
      { name: 'Amazon S3', cmd: S3_BUCKET ? `aws s3api head-bucket --bucket ${S3_BUCKET} 2>/dev/null && echo ok` : 'echo none', desc: `Storage (${S3_BUCKET || 'not configured'})`, parse: () => S3_BUCKET ? 'Bucket active' : 'Not configured' },
    ];

    for (const svc of checks) {
      try {
        const { stdout } = await execPromise(svc.cmd, { timeout: 5000 });
        services.push({ name: svc.name, status: 'active', description: svc.desc, detail: svc.parse(stdout) });
      } catch {
        services.push({ name: svc.name, status: 'available', description: svc.desc, detail: 'Not tested' });
      }
    }

    res.json({
      account,
      services,
      credits: { total: 25000, note: 'AWS Activate credits' },
    });
  } catch (error) {
    console.error('AWS services error:', error);
    res.status(500).json({ error: 'Failed to load AWS services' });
  }
});

app.get('/api/aws/bedrock-models', async (req, res) => {
  try {
    const util = require('util');
    const execPromise = util.promisify(require('child_process').exec);
    const { stdout } = await execPromise('aws bedrock list-foundation-models --query "modelSummaries[?modelLifecycle.status==\'ACTIVE\'].{modelId:modelId,modelName:modelName,provider:providerName,input:inputModalities,output:outputModalities}" --output json 2>/dev/null', { timeout: 10000 });
    const models = JSON.parse(stdout || '[]');
    res.json(models.map(m => ({
      modelId: m.modelId,
      modelName: m.modelName,
      provider: m.provider,
      status: 'ACTIVE',
      inputModalities: m.input,
      outputModalities: m.output,
    })));
  } catch (error) {
    console.error('Bedrock models error:', error);
    res.status(500).json({ error: 'Failed to load Bedrock models' });
  }
});

app.get('/api/models', async (req, res) => {
  // List available models from Bedrock
  res.json([
    { id: 'us.anthropic.claude-opus-4-6-v1', name: 'Claude Opus 4.6' },
    { id: 'us.anthropic.claude-sonnet-4-20250514-v1:0', name: 'Claude Sonnet 4' },
    { id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Claude Haiku 4.5' }
  ]);
});

// Switch agent model via gateway config
app.post('/api/model', async (req, res) => {
  try {
    const { model } = req.body;
    if (!model) return res.status(400).json({ error: 'model required' });

    // Read current config, update model, write back
    const configPath = path.join(require('os').homedir(), '.openclaw/openclaw.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // Set the default model
    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    if (!config.agents.defaults.model) config.agents.defaults.model = {};
    config.agents.defaults.model.default = model;

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    // Signal gateway to reload config
    const util = require('util');
    const execPromise = util.promisify(require('child_process').exec);
    try {
      await execPromise('kill -USR1 $(pgrep -f openclaw-gateway)', { timeout: 5000 });
    } catch {}

    res.json({ ok: true, model, message: `Model switched to ${model}` });
  } catch (error) {
    console.error('Model switch error:', error);
    res.status(500).json({ error: 'Failed to switch model' });
  }
});

// Generate image via Bedrock → save to S3
const S3_PREFIX = 'images/mc-generated';

app.post('/api/aws/generate-image', async (req, res) => {
  try {
    const { modelId, prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    const util = require('util');
    const execPromise = util.promisify(require('child_process').exec);
    const timestamp = Date.now();

    // Build payload based on model provider
    let payload;
    if (modelId.startsWith('amazon.nova-canvas') || modelId.startsWith('amazon.titan-image')) {
      payload = {
        taskType: 'TEXT_IMAGE',
        textToImageParams: { text: prompt },
        imageGenerationConfig: { numberOfImages: 1, height: 1024, width: 1024 }
      };
    } else if (modelId.startsWith('stability.')) {
      payload = {
        prompt: prompt,
        mode: 'text-to-image',
        output_format: 'png'
      };
    } else {
      return res.status(400).json({ error: `Unsupported image model: ${modelId}` });
    }

    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const outFile = `/tmp/mc-image-${timestamp}.json`;

    await execPromise(
      `aws bedrock-runtime invoke-model --model-id "${modelId}" --content-type "application/json" --accept "application/json" --body "${payloadB64}" ${outFile}`,
      { timeout: 60000 }
    );

    // Parse response and save image
    const result = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    let imageB64;
    if (result.images && result.images[0]) {
      imageB64 = result.images[0];
    } else if (result.image) {
      imageB64 = result.image;
    } else {
      return res.status(500).json({ error: 'No image in response', keys: Object.keys(result) });
    }

    // Save locally first, then upload to S3
    const slug = prompt.replace(/[^a-zA-Z0-9]+/g, '-').substring(0, 40).toLowerCase();
    const filename = `${timestamp}-${slug}.png`;
    const localPath = `/tmp/mc-image-${timestamp}.png`;
    fs.writeFileSync(localPath, Buffer.from(imageB64, 'base64'));

    const s3Key = `${S3_PREFIX}/${filename}`;
    await execPromise(`aws s3 cp "${localPath}" "s3://${S3_BUCKET}/${s3Key}" --content-type image/png`, { timeout: 30000 });

    // Clean up local temp files
    try { fs.unlinkSync(outFile); } catch {}

    res.json({
      ok: true,
      message: `Image generated and saved to S3!`,
      imageUrl: `/api/aws/image/${timestamp}`,
      s3: `s3://${S3_BUCKET}/${s3Key}`,
    });
  } catch (error) {
    console.error('Image gen error:', error);
    res.status(500).json({ error: error.message || 'Image generation failed' });
  }
});

// Serve generated images (local cache)
app.get('/api/aws/image/:id', (req, res) => {
  const imgPath = `/tmp/mc-image-${req.params.id}.png`;
  if (fs.existsSync(imgPath)) {
    res.type('png').sendFile(imgPath);
  } else {
    res.status(404).json({ error: 'Image not found locally — check S3' });
  }
});

// List all generated images from S3
app.get('/api/aws/gallery', async (req, res) => {
  try {
    const util = require('util');
    const execPromise = util.promisify(require('child_process').exec);
    const { stdout } = await execPromise(`aws s3api list-objects-v2 --bucket ${S3_BUCKET} --prefix "${S3_PREFIX}/" --output json 2>/dev/null`, { timeout: 10000 });
    const data = JSON.parse(stdout);
    const images = (data.Contents || [])
      .filter(o => o.Key.endsWith('.png'))
      .map(o => {
        const filename = o.Key.split('/').pop();
        const id = filename.split('-')[0];
        return {
          id,
          url: `/api/aws/s3-image/${encodeURIComponent(o.Key)}`,
          created: o.LastModified,
          size: o.Size,
          s3Key: o.Key,
        };
      })
      .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
    res.json({ images });
  } catch (error) {
    // Fallback to local /tmp
    try {
      const files = fs.readdirSync('/tmp')
        .filter(f => f.startsWith('mc-image-') && f.endsWith('.png'))
        .map(f => {
          const id = f.replace('mc-image-', '').replace('.png', '');
          const stat = fs.statSync(`/tmp/${f}`);
          return { id, url: `/api/aws/image/${id}`, created: stat.mtime.toISOString(), size: stat.size };
        })
        .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
      res.json({ images: files });
    } catch { res.json({ images: [] }); }
  }
});

// Proxy S3 images
app.get('/api/aws/s3-image/:key(*)', async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);
    const localCache = `/tmp/s3-cache-${key.replace(/\//g, '_')}`;
    if (!fs.existsSync(localCache)) {
      const util = require('util');
      const execPromise = util.promisify(require('child_process').exec);
      await execPromise(`aws s3 cp "s3://${S3_BUCKET}/${key}" "${localCache}"`, { timeout: 15000 });
    }
    res.type('png').sendFile(localCache);
  } catch (error) {
    res.status(404).json({ error: 'Image not found' });
  }
});

// ========== API: Config (public, secrets stripped) ==========
app.get('/api/config', (req, res) => {
  // Deep clone to avoid mutating mcConfig
  const safe = JSON.parse(JSON.stringify(mcConfig));
  if (safe.gateway) safe.gateway = { port: safe.gateway.port };
  if (safe.notion) delete safe.notion.token;
  if (safe.scout) delete safe.scout.braveApiKey;
  res.json(safe);
});

// ========== API: Setup (first-time configuration) ==========
app.post('/api/setup', (req, res) => {
  try {
    const { name, subtitle, gatewayPort, gatewayToken, modules, aws, workspace, skillsPath, memoryPath } = req.body;
    if (name) mcConfig.name = name;
    if (subtitle) mcConfig.subtitle = subtitle;
    if (gatewayPort) mcConfig.gateway.port = gatewayPort;
    if (gatewayToken) mcConfig.gateway.token = gatewayToken;
    if (modules && typeof modules === 'object') {
      mcConfig.modules = { ...mcConfig.modules, ...modules };
    }
    if (aws && typeof aws === 'object') {
      mcConfig.aws = { ...mcConfig.aws, ...aws };
    }
    if (workspace) mcConfig.workspace = workspace;
    if (skillsPath) mcConfig.skillsPath = skillsPath;
    if (memoryPath) mcConfig.memoryPath = memoryPath;
    fs.writeFileSync(MC_CONFIG_PATH, JSON.stringify(mcConfig, null, 2));
    // Return safe copy
    const safe = JSON.parse(JSON.stringify(mcConfig));
    if (safe.gateway) safe.gateway = { port: safe.gateway.port };
    if (safe.notion) delete safe.notion.token;
    if (safe.scout) delete safe.scout.braveApiKey;
    res.json({ ok: true, config: safe });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// AWS Cost Explorer — real spending data
app.get('/api/aws/costs', async (req, res) => {
  try {
    const util = require('util');
    const execPromise = util.promisify(require('child_process').exec);

    // Get current month daily breakdown by service
    const startDate = new Date();
    startDate.setDate(1);
    const start = startDate.toISOString().split('T')[0];
    const end = new Date().toISOString().split('T')[0];

    const { stdout } = await execPromise(
      `aws ce get-cost-and-usage --time-period Start=${start},End=${end} --granularity DAILY --metrics BlendedCost --group-by Type=DIMENSION,Key=SERVICE --output json 2>/dev/null`,
      { timeout: 15000 }
    );
    const data = JSON.parse(stdout);

    // Parse into daily totals + service breakdown
    const services = {};
    const daily = [];
    let total = 0;

    for (const r of (data.ResultsByTime || [])) {
      const day = r.TimePeriod.Start;
      let dayTotal = 0;
      for (const g of (r.Groups || [])) {
        const svc = g.Keys[0];
        const amt = parseFloat(g.Metrics.BlendedCost.Amount);
        if (amt > 0.001) {
          services[svc] = (services[svc] || 0) + amt;
          dayTotal += amt;
        }
      }
      daily.push({ date: day, cost: Math.round(dayTotal * 100) / 100 });
      total += dayTotal;
    }

    // Sort services by cost
    const serviceList = Object.entries(services)
      .map(([name, cost]) => ({ name, cost: Math.round(cost * 100) / 100 }))
      .sort((a, b) => b.cost - a.cost);

    res.json({
      period: { start, end },
      total: Math.round(total * 100) / 100,
      daily,
      services: serviceList,
      credits: 25000,
      remaining: Math.round((25000 - total) * 100) / 100,
    });
  } catch (error) {
    console.error('AWS costs error:', error);
    res.status(500).json({ error: 'Failed to load cost data' });
  }
});

// === Session History ===
app.get('/api/sessions/:sessionKey/history', async (req, res) => {
  try {
    const sessionKey = decodeURIComponent(req.params.sessionKey);
    const configPath = path.join(require('os').homedir(), '.openclaw/openclaw.json');
    const cfg = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
    const gwToken = cfg.gateway?.auth?.token || 'mc-zinbot-2026';
    const gwPort = cfg.gateway?.port || 18789;
    
    // First get session info to find transcriptPath
    const listRes = await fetch(`http://127.0.0.1:${gwPort}/tools/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${gwToken}` },
      body: JSON.stringify({ tool: 'sessions_list', input: { limit: 100, messageLimit: 0 } })
    });
    
    if (!listRes.ok) return res.json({ messages: [] });
    
    const listData = await listRes.json();
    const listText = listData?.result?.content?.[0]?.text || '{}';
    const parsed = JSON.parse(listText);
    const session = (parsed.sessions || []).find((s) => s.key === sessionKey);
    
    if (!session?.transcriptPath) return res.json({ messages: [], info: 'No transcript found' });
    
    // Read JSONL transcript
    const transcriptDir = path.join(require('os').homedir(), '.openclaw/agents/main/sessions');
    const transcriptFile = path.join(transcriptDir, session.transcriptPath);
    
    if (!fs.existsSync(transcriptFile)) return res.json({ messages: [], info: 'Transcript file missing' });
    
    const lines = fs.readFileSync(transcriptFile, 'utf8').split('\n').filter(Boolean);
    const messages = [];
    
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type !== 'message' || !entry.message) continue;
        const msg = entry.message;
        const role = msg.role;
        if (!role || role === 'toolResult' || role === 'toolUse') continue;
        
        // Extract text from content array or string
        let text = '';
        if (typeof msg.content === 'string') {
          text = msg.content;
        } else if (Array.isArray(msg.content)) {
          text = msg.content
            .filter(c => c.type === 'text')
            .map(c => c.text || '')
            .join('\n');
        }
        
        if (text.trim()) {
          messages.push({ role, content: text.substring(0, 3000), ts: entry.timestamp });
        }
      } catch {}
    }
    
    // Return last 50 messages
    res.json({ messages: messages.slice(-50), total: messages.length, sessionKey });
  } catch (err) {
    res.json({ messages: [], error: err.message });
  }
});

// Send message to a session
app.post('/api/sessions/:sessionKey/send', async (req, res) => {
  try {
    const sessionKey = decodeURIComponent(req.params.sessionKey);
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    
    const configPath = path.join(require('os').homedir(), '.openclaw/openclaw.json');
    const cfg = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
    const gwToken = cfg.gateway?.auth?.token || 'mc-zinbot-2026';
    const gwPort = cfg.gateway?.port || 18789;
    
    const response = await fetch(`http://127.0.0.1:${gwPort}/tools/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${gwToken}` },
      body: JSON.stringify({
        tool: 'sessions_send',
        input: { sessionKey, message, timeoutSeconds: 120 }
      })
    });
    
    const data = await response.json();
    const resultText = data?.result?.content?.[0]?.text || '';
    res.json({ ok: response.ok, result: resultText });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Document Management ===
const docsDir = path.join(__dirname, 'documents');
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

const upload = multer({ dest: path.join(docsDir, '.tmp'), limits: { fileSize: 10 * 1024 * 1024 } });

app.get('/api/docs', (req, res) => {
  try {
    const files = fs.readdirSync(docsDir).filter(f => !f.startsWith('.'));
    const documents = files.map(f => {
      const stat = fs.statSync(path.join(docsDir, f));
      const ext = path.extname(f).replace('.', '');
      const sizeBytes = stat.size;
      const size = sizeBytes > 1024 * 1024 ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` 
        : sizeBytes > 1024 ? `${(sizeBytes / 1024).toFixed(1)} KB` 
        : `${sizeBytes} B`;
      // Rough chunk estimate: ~500 chars per chunk
      const chunks = Math.max(1, Math.round(sizeBytes / 500));
      return { id: f, name: f, type: ext, size, sizeBytes, chunks, modified: stat.mtime.toISOString() };
    });
    res.json({ documents, total: documents.length });
  } catch (err) {
    res.json({ documents: [], total: 0 });
  }
});

app.post('/api/docs/upload', upload.array('files', 20), (req, res) => {
  try {
    const uploaded = [];
    for (const file of (req.files || [])) {
      const dest = path.join(docsDir, file.originalname);
      fs.renameSync(file.path, dest);
      uploaded.push(file.originalname);
    }
    res.json({ ok: true, uploaded });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SPA catch-all: serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Mission Control running at http://localhost:${PORT}`);
});
