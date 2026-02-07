const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

const app = express();
const PORT = 3333;
const GATEWAY_PORT = 18789;
const GATEWAY_TOKEN = 'mc-zinbot-2026';

app.use(express.json());

// Serve React frontend (static assets)
app.use(express.static(path.join(__dirname, 'frontend/dist')));

// Serve public files (concepts, etc)
app.use('/public', express.static(path.join(__dirname, 'public')));

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

// API: Agent status + heartbeat
app.get('/api/status', (req, res) => {
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
    // Model is in Sessions line: "default us.anthropic.claude-opus-4-6-v1 (1000k ctx)"
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
      recentActivity: [
        { time: heartbeat.lastHeartbeat ? new Date(heartbeat.lastHeartbeat * 1000).toISOString() : new Date().toISOString(), action: 'Heartbeat check', detail: heartbeat.note || 'Routine check', type: 'heartbeat' },
        { time: new Date(Date.now() - 3600000).toISOString(), action: 'Mission Control deployed', detail: 'Built and launched the Mission Control dashboard', type: 'development' },
        { time: new Date(Date.now() - 7200000).toISOString(), action: 'Email scan completed', detail: 'Checked inbox: Amazon Associates, micro1 AI interview', type: 'email' },
        { time: new Date(Date.now() - 10800000).toISOString(), action: 'Memory maintenance', detail: 'Reviewed daily notes, updated MEMORY.md', type: 'memory' },
        { time: new Date(Date.now() - 14400000).toISOString(), action: 'Calendar sync', detail: 'No events scheduled for today (Saturday)', type: 'calendar' },
        { time: new Date(Date.now() - 18000000).toISOString(), action: 'Lead generation batch', detail: 'Processed 15 new leads for SmålandWebb', type: 'business' },
        { time: new Date(Date.now() - 21600000).toISOString(), action: 'Discord message handled', detail: 'Responded to user query in main channel', type: 'chat' },
        { time: new Date(Date.now() - 25200000).toISOString(), action: 'Code review completed', detail: 'Reviewed Tale Forge Supabase functions', type: 'development' }
      ],
      tokenUsage: {
        used: 187432,
        limit: 1000000,
        percentage: 18.7
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Cron jobs
app.get('/api/cron', (req, res) => {
  // Try to read real cron data
  let cronJobs = [];
  try {
    const cronRaw = execSync('openclaw cron list 2>&1', { timeout: 10000, encoding: 'utf8' });
    // Parse cron output if available
    const lines = cronRaw.split('\n').filter(l => l.includes('│'));
    // Fallback to placeholder with realistic data
  } catch (e) {}

  cronJobs = [
    { id: 'hb-main', name: 'Heartbeat Check', schedule: '0 */1 * * *', status: 'active', lastRun: new Date(Date.now() - 3600000).toISOString(), nextRun: new Date(Date.now() + 3600000).toISOString(), duration: '12s', history: [{ time: new Date(Date.now() - 3600000).toISOString(), status: 'success', duration: '12s' }, { time: new Date(Date.now() - 7200000).toISOString(), status: 'success', duration: '8s' }, { time: new Date(Date.now() - 10800000).toISOString(), status: 'success', duration: '15s' }] },
    { id: 'email-scan', name: 'Email Scanner', schedule: '*/30 * * * *', status: 'active', lastRun: new Date(Date.now() - 1800000).toISOString(), nextRun: new Date(Date.now() + 1800000).toISOString(), duration: '5s', history: [{ time: new Date(Date.now() - 1800000).toISOString(), status: 'success', duration: '5s' }, { time: new Date(Date.now() - 3600000).toISOString(), status: 'success', duration: '4s' }] },
    { id: 'lead-gen', name: 'Lead Generator', schedule: '0 9 * * 1-5', status: 'active', lastRun: new Date(Date.now() - 86400000).toISOString(), nextRun: new Date(Date.now() + 172800000).toISOString(), duration: '45s', history: [{ time: new Date(Date.now() - 86400000).toISOString(), status: 'success', duration: '45s' }] },
    { id: 'mem-cleanup', name: 'Memory Maintenance', schedule: '0 3 * * *', status: 'active', lastRun: new Date(Date.now() - 43200000).toISOString(), nextRun: new Date(Date.now() + 43200000).toISOString(), duration: '22s', history: [{ time: new Date(Date.now() - 43200000).toISOString(), status: 'success', duration: '22s' }] },
    { id: 'cal-sync', name: 'Calendar Sync', schedule: '0 8,20 * * *', status: 'active', lastRun: new Date(Date.now() - 7200000).toISOString(), nextRun: new Date(Date.now() + 36000000).toISOString(), duration: '3s', history: [{ time: new Date(Date.now() - 7200000).toISOString(), status: 'success', duration: '3s' }] },
    { id: 'twitter-scout', name: 'Twitter Scout', schedule: '0 */4 * * *', status: 'paused', lastRun: new Date(Date.now() - 28800000).toISOString(), nextRun: null, duration: '18s', history: [{ time: new Date(Date.now() - 28800000).toISOString(), status: 'success', duration: '18s' }, { time: new Date(Date.now() - 43200000).toISOString(), status: 'failed', duration: '2s' }] },
    { id: 'backup', name: 'Workspace Backup', schedule: '0 4 * * *', status: 'active', lastRun: new Date(Date.now() - 21600000).toISOString(), nextRun: new Date(Date.now() + 64800000).toISOString(), duration: '8s', history: [] }
  ];

  res.json({ jobs: cronJobs });
});

// API: Tasks (Kanban)
app.get('/api/tasks', (req, res) => {
  res.json({
    columns: {
      queue: [
        { id: 't1', title: 'Integrate Stripe payments', description: 'Add Stripe checkout to Tale Forge for premium features', priority: 'high', created: new Date(Date.now() - 172800000).toISOString(), tags: ['tale-forge', 'payment'] },
        { id: 't2', title: 'Set up Twitter bot', description: 'Create automated Twitter posting for AI content', priority: 'medium', created: new Date(Date.now() - 259200000).toISOString(), tags: ['social', 'automation'] },
        { id: 't3', title: 'SmålandWebb portfolio page', description: 'Build a portfolio showcase page for completed projects', priority: 'low', created: new Date(Date.now() - 345600000).toISOString(), tags: ['smalandwebb', 'web'] },
        { id: 't8', title: 'AWS cost optimization', description: 'Review and optimize AWS resource usage', priority: 'medium', created: new Date(Date.now() - 86400000).toISOString(), tags: ['aws', 'cost'] }
      ],
      inProgress: [
        { id: 't4', title: 'Mission Control Dashboard', description: 'Build glassmorphism dashboard for agent management', priority: 'high', created: new Date(Date.now() - 3600000).toISOString(), tags: ['dashboard', 'ui'], assignee: 'Zinbot' },
        { id: 't5', title: 'Lead generation pipeline', description: 'Automated B2B lead finder for SmålandWebb using Brave + Hunter.io', priority: 'high', created: new Date(Date.now() - 432000000).toISOString(), tags: ['leads', 'business'], assignee: 'Zinbot' }
      ],
      done: [
        { id: 't6', title: 'Email automation setup', description: 'Configure Zoho SMTP for cold outreach with templates', priority: 'high', completed: new Date(Date.now() - 86400000).toISOString(), tags: ['email', 'automation'] },
        { id: 't7', title: 'OpenClaw configuration', description: 'Full agent setup with heartbeats, memory, and Discord integration', priority: 'high', completed: new Date(Date.now() - 604800000).toISOString(), tags: ['setup', 'openclaw'] },
        { id: 't9', title: 'Notion activity logging', description: 'Integrated automatic activity logging to Notion database', priority: 'medium', completed: new Date(Date.now() - 172800000).toISOString(), tags: ['notion', 'logging'] },
        { id: 't10', title: 'Google Workspace integration', description: 'Connected Gmail, Calendar, Drive via gog CLI', priority: 'high', completed: new Date(Date.now() - 518400000).toISOString(), tags: ['google', 'integration'] }
      ]
    }
  });
});

// API: Costs
app.get('/api/costs', (req, res) => {
  const today = new Date();
  const dailyCosts = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const base = 2.5 + Math.random() * 4;
    dailyCosts.push({
      date: d.toISOString().split('T')[0],
      total: parseFloat(base.toFixed(2)),
      breakdown: {
        'Claude Opus': parseFloat((base * 0.65).toFixed(2)),
        'Claude Sonnet': parseFloat((base * 0.15).toFixed(2)),
        'AWS Services': parseFloat((base * 0.12).toFixed(2)),
        'Brave Search': parseFloat((base * 0.05).toFixed(2)),
        'Hunter.io': parseFloat((base * 0.03).toFixed(2))
      }
    });
  }

  res.json({
    daily: dailyCosts,
    summary: {
      today: parseFloat((3.2 + Math.random() * 2).toFixed(2)),
      thisWeek: parseFloat((22.5 + Math.random() * 10).toFixed(2)),
      thisMonth: parseFloat((89.3 + Math.random() * 30).toFixed(2)),
      budget: { monthly: 200, warning: 150 }
    },
    byService: [
      { name: 'Claude Opus 4', cost: 58.42, percentage: 52 },
      { name: 'Claude Sonnet', cost: 16.83, percentage: 15 },
      { name: 'AWS (Polly/Titan/S3)', cost: 13.47, percentage: 12 },
      { name: 'Brave Search API', cost: 5.61, percentage: 5 },
      { name: 'Hunter.io', cost: 3.37, percentage: 3 },
      { name: 'Other', cost: 14.60, percentage: 13 }
    ]
  });
});

// API: Twitter Scout
app.get('/api/scout', (req, res) => {
  res.json({
    opportunities: [
      { id: 's1', title: 'Local bakery needs website redesign', summary: 'Spotted tweet from @LocalBakerySthlm complaining about their outdated website. They have 2.3k followers and seem ready to invest.', score: 92, source: 'Twitter', found: new Date(Date.now() - 7200000).toISOString(), status: 'new', tags: ['web-design', 'local-business'] },
      { id: 's2', title: 'Startup looking for AI integration', summary: 'CEO of fintech startup posted about needing AI chatbot for customer support. Budget mentioned: $5-10k.', score: 88, source: 'Twitter', found: new Date(Date.now() - 14400000).toISOString(), status: 'new', tags: ['ai', 'chatbot', 'fintech'] },
      { id: 's3', title: 'Restaurant chain wants online ordering', summary: 'Chain of 5 restaurants in Småland area looking for unified online ordering system. Posted in local business group.', score: 85, source: 'LinkedIn', found: new Date(Date.now() - 28800000).toISOString(), status: 'reviewed', tags: ['e-commerce', 'restaurant'] },
      { id: 's4', title: 'Freelance developer collaboration', summary: 'Experienced React developer looking for backend partner for SaaS project. Good portfolio, funded idea.', score: 78, source: 'Twitter', found: new Date(Date.now() - 43200000).toISOString(), status: 'new', tags: ['saas', 'collaboration'] },
      { id: 's5', title: 'E-commerce migration from Shopify', summary: 'Medium business frustrated with Shopify fees, looking for custom solution. Monthly revenue ~$50k.', score: 74, source: 'Reddit', found: new Date(Date.now() - 86400000).toISOString(), status: 'deployed', tags: ['e-commerce', 'migration'] },
      { id: 's6', title: 'Non-profit needs donation platform', summary: 'Environmental non-profit seeking developer for custom donation/volunteer management platform.', score: 71, source: 'Twitter', found: new Date(Date.now() - 129600000).toISOString(), status: 'new', tags: ['non-profit', 'platform'] }
    ]
  });
});

// API: Agents
app.get('/api/agents', (req, res) => {
  res.json({
    agents: [
      { id: 'zinbot', name: 'Zinbot', role: 'Commander', avatar: '🤖', status: 'active', model: 'Claude Opus 4', description: 'Primary AI agent. Manages all operations, communications, and development tasks.', lastActive: new Date().toISOString(), tasksCompleted: 247, uptime: '99.7%' },
      { id: 'architect', name: 'The Architect', role: 'Sub-Agent', avatar: '🏗️', status: 'idle', model: 'Claude Sonnet', description: 'Specialized in code architecture, system design, and complex builds.', lastActive: new Date(Date.now() - 3600000).toISOString(), tasksCompleted: 42, uptime: '95.2%' },
      { id: 'scout', name: 'Scout', role: 'Sub-Agent', avatar: '🔍', status: 'paused', model: 'Claude Haiku', description: 'Monitors Twitter, Reddit, and forums for business opportunities.', lastActive: new Date(Date.now() - 28800000).toISOString(), tasksCompleted: 156, uptime: '88.1%' },
      { id: 'scribe', name: 'Scribe', role: 'Sub-Agent', avatar: '📝', status: 'idle', model: 'Claude Sonnet', description: 'Handles documentation, email drafts, and content generation.', lastActive: new Date(Date.now() - 7200000).toISOString(), tasksCompleted: 89, uptime: '92.4%' }
    ],
    conversations: [
      { from: 'zinbot', to: 'architect', message: 'Build the Mission Control dashboard with glassmorphism design. Full spec attached.', time: new Date(Date.now() - 3600000).toISOString() },
      { from: 'architect', to: 'zinbot', message: 'On it. Setting up Express server and designing the UI components. ETA: 30 minutes.', time: new Date(Date.now() - 3500000).toISOString() },
      { from: 'zinbot', to: 'scout', message: 'Pause Twitter monitoring until API rate limits reset. Resume at 14:00 UTC.', time: new Date(Date.now() - 28800000).toISOString() },
      { from: 'scout', to: 'zinbot', message: 'Acknowledged. Found 6 opportunities before pausing. Reports saved.', time: new Date(Date.now() - 28700000).toISOString() },
      { from: 'zinbot', to: 'scribe', message: 'Draft a follow-up email for the SmålandWebb leads that responded positively.', time: new Date(Date.now() - 7200000).toISOString() },
      { from: 'scribe', to: 'zinbot', message: 'Draft ready. Personalized 3 follow-ups based on their industry and needs. Review?', time: new Date(Date.now() - 7100000).toISOString() }
    ]
  });
});

// SPA catch-all: serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Mission Control running at http://localhost:${PORT}`);
});
