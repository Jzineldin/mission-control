const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

const app = express();
const PORT = 3333;
const GATEWAY_PORT = 18789;
const GATEWAY_TOKEN = 'mc-zinbot-2026';

// Notion config
const NOTION_DB_ID = 'c540b580-22b5-4481-b33d-e55585d76771';
const NOTION_TOKEN = 'ntn_R18444199542F0vXHK0KOITqdSPpebU5GfT2rTJMAS1hpC';

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
      const raw = fs.readFileSync('/home/ubuntu/clawd/memory/heartbeat-state.json', 'utf8');
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
          const memPath = `/home/ubuntu/clawd/memory/${dateStr}.md`;
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
        name: 'Zinbot',
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
    // Read leads CSV
    let leads = [];
    try {
      const raw = fs.readFileSync('/home/ubuntu/clawd/smalandwebb/leads.csv', 'utf8');
      leads = parseCSV(raw);
    } catch (e) {
      console.error('[Scout] Failed to read leads.csv:', e.message);
    }

    // Read sent_log CSV
    let sentLog = [];
    try {
      const raw = fs.readFileSync('/home/ubuntu/clawd/smalandwebb/sent_log.csv', 'utf8');
      sentLog = parseCSV(raw);
    } catch (e) {
      console.error('[Scout] Failed to read sent_log.csv:', e.message);
    }

    // Build email->status map from sent log
    // Priority: sent > other statuses (DUPLICATE entries shouldn't override "sent")
    const statusPriority = { 'sent': 10, 'declined': 5, 'bounced': 4 };
    const emailStatus = {};
    sentLog.forEach(entry => {
      const email = (entry.email || '').trim().toLowerCase();
      if (!email) return;
      const status = (entry.status || 'unknown').trim();
      const statusLower = status.toLowerCase();

      const existing = emailStatus[email];
      const existingPrio = existing ? (statusPriority[existing.status.toLowerCase()] || 0) : -1;
      const newPrio = statusPriority[statusLower] || 0;

      // Keep the most meaningful status (sent > declined > duplicate)
      if (!existing || (statusLower !== 'duplicate' && newPrio >= existingPrio)) {
        emailStatus[email] = {
          status: status,
          date: entry.date || '',
          company: entry.company || '',
        };
      }
    });

    // Map leads to opportunity format
    const opportunities = leads.map((lead, i) => {
      const email = (lead.email || '').trim().toLowerCase();
      const logEntry = emailStatus[email];

      // Determine status
      let status = 'new';
      let statusDetail = 'Not contacted';
      if (logEntry) {
        const s = (logEntry.status || '').toLowerCase();
        if (s === 'sent') { status = 'contacted'; statusDetail = `Email sent ${logEntry.date}`; }
        else if (s.includes('bounce')) { status = 'bounced'; statusDetail = logEntry.status; }
        else if (s.includes('duplicate')) { status = 'duplicate'; statusDetail = 'Duplicate entry'; }
        else if (s.includes('error') || s.includes('has-website')) { status = 'has-website'; statusDetail = 'Already has a website'; }
        else if (s.includes('blacklist')) { status = 'blacklisted'; statusDetail = logEntry.status; }
        else if (s.includes('declined') || s.includes('rejected')) { status = 'declined'; statusDetail = logEntry.status; }
        else { status = logEntry.status; statusDetail = logEntry.status; }
      }

      return {
        id: `lead-${i + 1}`,
        title: lead.company || lead.name || 'Unknown',
        summary: `${lead.company || lead.name} — ${lead.city || 'Unknown city'}`,
        email: lead.email || '',
        city: lead.city || '',
        score: status === 'new' ? 80 : (status === 'contacted' ? 90 : 30),
        source: 'SmålandWebb Lead Gen',
        found: logEntry?.date ? `${logEntry.date}T12:00:00Z` : '2026-02-02T12:00:00Z',
        status,
        statusDetail,
        tags: ['småland', lead.city || ''].filter(Boolean),
      };
    });

    // Summary stats
    const stats = {
      total: opportunities.length,
      new: opportunities.filter(o => o.status === 'new').length,
      contacted: opportunities.filter(o => o.status === 'contacted').length,
      hasWebsite: opportunities.filter(o => o.status === 'has-website').length,
      bounced: opportunities.filter(o => o.status === 'bounced').length,
      declined: opportunities.filter(o => o.status === 'declined').length,
      blacklisted: opportunities.filter(o => o.status === 'blacklisted').length,
    };

    res.json({ opportunities, stats });
  } catch (e) {
    console.error('[Scout API]', e.message);
    res.json({ opportunities: [], stats: {}, error: e.message });
  }
});

// ========== API: Agents — Real from gateway sessions ==========
app.get('/api/agents', async (req, res) => {
  try {
    const sessions = await fetchSessions(50);

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

// SPA catch-all: serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Mission Control running at http://localhost:${PORT}`);
});
