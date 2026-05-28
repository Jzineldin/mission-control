function createStatusService({
  mcConfig,
  memoryPath,
  prettyModelName,
  getOpenclawDefaultModelKey,
  fetchNotionActivity,
  fetchSessions,
  readRuntimeSnapshot,
  writeRuntimeSnapshot,
  runtimeSnapshotTtl,
  execSync,
  fs,
  path,
  processEnv = process.env,
}) {
  let statusCache = null;
  let statusCacheTime = 0;
  let refreshInFlight = null;
  const statusCacheTtl = 60000;

  function buildMinimalStatusResponse() {
    const modelKey = getOpenclawDefaultModelKey();
    return {
      generatedAt: new Date().toISOString(),
      agent: {
        name: mcConfig.name || 'Mission Control',
        status: 'active',
        model: prettyModelName(modelKey),
        activeSessions: 0,
        totalAgents: 0,
        memoryFiles: 0,
        memoryChunks: 0,
        heartbeatInterval: '1h',
        channels: [],
      },
      heartbeat: { lastChecks: {}, lastProactiveTasks: {} },
      recentActivity: [],
      tokenUsage: { used: 0, limit: 0, percentage: 0 },
    };
  }

  function buildStatusResponseFromCache(cache = {}, heartbeatOverride = null) {
    const {
      sessionsMatch,
      modelMatch,
      defaultModelKey,
      memoryMatch,
      heartbeatInterval,
      agentsMatch,
      channels,
      tokenUsage,
      recentActivity,
      heartbeat,
    } = cache || {};
    const hb = heartbeatOverride || heartbeat || {};

    return {
      agent: {
        name: mcConfig.name || 'Mission Control',
        status: 'active',
        model: prettyModelName(defaultModelKey || (modelMatch ? modelMatch[1] : '')),
        activeSessions: sessionsMatch ? Number.parseInt(sessionsMatch[1], 10) : 0,
        totalAgents: agentsMatch ? Number.parseInt(agentsMatch[1], 10) : 1,
        memoryFiles: memoryMatch ? Number.parseInt(memoryMatch[1], 10) : 46,
        memoryChunks: memoryMatch ? Number.parseInt(memoryMatch[2], 10) : 225,
        heartbeatInterval: heartbeatInterval ? heartbeatInterval[1] : '1h',
        channels: channels || [],
      },
      heartbeat: hb,
      recentActivity: recentActivity || [],
      tokenUsage: tokenUsage || { used: 0, limit: 1000000, percentage: 0 },
      generatedAt: cache.generatedAt || new Date().toISOString(),
    };
  }

  function buildActivityFromMemory() {
    const recentActivity = [];
    for (const dayOffset of [0, 1]) {
      const date = new Date();
      date.setDate(date.getDate() - dayOffset);
      const dateStr = date.toISOString().split('T')[0];
      try {
        const memPath = path.join(memoryPath, `${dateStr}.md`);
        if (!fs.existsSync(memPath)) continue;
        const memContent = fs.readFileSync(memPath, 'utf8');
        const sections = memContent.split(/\n## /).slice(1);
        sections.slice(0, 6).forEach((section) => {
          const firstLine = section.split('\n')[0].trim();
          const timeMatch = firstLine.match(/(\d{2}:\d{2})\s*UTC/);
          const time = timeMatch ? `${dateStr}T${timeMatch[1]}:00Z` : `${dateStr}T12:00:00Z`;
          const title = firstLine
            .replace(/\d{2}:\d{2}\s*UTC\s*[-—]\s*/, '')
            .replace(/\*\*/g, '')
            .substring(0, 80);
          const bullets = section.split('\n').filter((line) => /^[-*]\s/.test(line.trim()));
          const detail = (bullets[0] || '').replace(/^[-*]\s*/, '').replace(/\*\*/g, '').substring(0, 120);
          let type = 'general';
          const lower = (title + ' ' + detail).toLowerCase();
          if (lower.includes('bug') || lower.includes('security')) type = 'security';
          else if (lower.includes('build') || lower.includes('deploy') || lower.includes('dashboard')) type = 'development';
          else if (lower.includes('email') || lower.includes('lead')) type = 'business';
          else if (lower.includes('heartbeat')) type = 'heartbeat';
          else if (lower.includes('meeting')) type = 'meeting';
          if (title) recentActivity.push({ time, action: title, detail: detail || 'Activity logged', type });
        });
        if (recentActivity.length > 2) break;
      } catch {}
    }
    return recentActivity.length
      ? recentActivity
      : [{ time: new Date().toISOString(), action: 'System running', detail: 'Dashboard active', type: 'general' }];
  }

  async function doRefreshStatusCache() {
    try {
      const [openclawStatus, notionActivity, sessionData] = await Promise.allSettled([
        new Promise(async (resolve) => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 1500);
          try {
            const response = await fetch('http://127.0.0.1:18789/health', { signal: controller.signal });
            const body = await response.text();
            resolve(response.ok ? `Gateway │ live │ ${body}` : '');
          } catch {
            resolve('');
          } finally {
            clearTimeout(timeout);
          }
        }),
        fetchNotionActivity(8).catch(() => null),
        fetchSessions(50).catch(() => ({ count: 0, sessions: [] })),
      ]);

      const ocStatus = openclawStatus.status === 'fulfilled' ? openclawStatus.value : '';
      const activity = notionActivity.status === 'fulfilled' ? notionActivity.value : null;
      const sessions = sessionData.status === 'fulfilled' ? sessionData.value : { count: 0, sessions: [] };

      let defaultModelKey = '';
      try {
        const ocCfgPath = path.join(processEnv.HOME || '/home/ubuntu', '.openclaw/openclaw.json');
        const ocCfg = JSON.parse(fs.readFileSync(ocCfgPath, 'utf8'));
        defaultModelKey = ocCfg?.agents?.defaults?.model?.primary
          || ocCfg?.agents?.defaults?.model?.default
          || ocCfg?.model?.default
          || '';
      } catch {}

      const sessionsMatch = ocStatus.match(/(\d+) active/);
      const modelMatch = ocStatus.match(/default\s+([^\s(]+)/);
      const memoryMatch = ocStatus.match(/(\d+)\s*files.*?(\d+)\s*chunks/);
      const heartbeatInterval = ocStatus.match(/Heartbeat\s*│\s*(\w+)/);
      const agentsMatch = ocStatus.match(/Agents\s*│\s*(\d+)/);

      const channels = [];
      const channelRegex = /│\s*(Discord|WhatsApp|Telegram)\s*│\s*(ON|OFF)\s*│\s*(OK|OFF|ERROR)\s*│\s*(.+?)\s*│/g;
      let match;
      while ((match = channelRegex.exec(ocStatus)) !== null) {
        channels.push({ name: match[1], enabled: match[2], state: match[3], detail: match[4].trim() });
      }

      const sessionList = sessions.sessions || [];
      const totalTokens = sessionList.reduce((sum, session) => sum + (session.totalTokens || 0), 0);
      const tokenUsage = {
        used: totalTokens,
        limit: 0,
        percentage: 0,
      };

      let recentActivity = activity;
      if (!recentActivity || !recentActivity.length) {
        recentActivity = buildActivityFromMemory();
      }

      let heartbeat = {};
      try {
        heartbeat = JSON.parse(fs.readFileSync(path.join(memoryPath, 'heartbeat-state.json'), 'utf8'));
      } catch {
        heartbeat = { lastHeartbeat: null, lastChecks: {} };
      }

      statusCache = {
        generatedAt: new Date().toISOString(),
        sessionsMatch,
        modelMatch,
        defaultModelKey,
        memoryMatch,
        heartbeatInterval,
        agentsMatch,
        channels,
        tokenUsage,
        recentActivity,
        heartbeat,
      };
      statusCacheTime = Date.now();
      writeRuntimeSnapshot('status', buildStatusResponseFromCache(statusCache, heartbeat));
    } catch (error) {
      console.error('[StatusCache] refresh failed:', error.message);
    }
  }

  function refreshStatusCache() {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = new Promise((resolve) => {
      setImmediate(async () => {
        try {
          await doRefreshStatusCache();
        } finally {
          refreshInFlight = null;
          resolve();
        }
      });
    });
    return refreshInFlight;
  }

  async function getStatusResponse() {
    const snapshot = readRuntimeSnapshot('status', runtimeSnapshotTtl.status);
    if (snapshot) return snapshot;

    if (Date.now() - statusCacheTime > statusCacheTtl) {
      refreshStatusCache();
    }

    if (!statusCache) {
      return buildMinimalStatusResponse();
    }

    let heartbeat = statusCache.heartbeat || {};
    try {
      heartbeat = JSON.parse(fs.readFileSync(path.join(memoryPath, 'heartbeat-state.json'), 'utf8'));
    } catch {}

    const response = buildStatusResponseFromCache(statusCache, heartbeat);
    writeRuntimeSnapshot('status', response);
    return response;
  }

  return {
    refreshStatusCache,
    getStatusResponse,
  };
}

module.exports = {
  createStatusService,
};
