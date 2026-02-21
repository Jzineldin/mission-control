'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const express = require('express');
const { mcConfig, MEMORY_PATH } = require('../lib/config');
const cache = require('../lib/cache');
const { fetchSessions, fetchNotionActivity, buildActivityFromMemory } = require('../lib/gateway');

const router = express.Router();

// ── Background status refresher ───────────────────────────────────────────────

async function refreshStatusCache() {
  try {
    const [openclawStatus, notionActivity, sessionData] = await Promise.allSettled([
      new Promise((resolve) => {
        try {
          resolve(execSync('openclaw status 2>&1', { timeout: 8000, encoding: 'utf8' }));
        } catch (e) {
          resolve(e.stdout || '');
        }
      }),
      fetchNotionActivity(8).catch(() => null),
      fetchSessions(50).catch(() => ({ count: 0, sessions: [] })),
    ]);

    const ocStatus = openclawStatus.status === 'fulfilled' ? openclawStatus.value : '';
    const activity = notionActivity.status === 'fulfilled' ? notionActivity.value : null;
    const sessions = sessionData.status === 'fulfilled' ? sessionData.value : { count: 0, sessions: [] };

    const sessionsMatch = ocStatus.match(/(\d+) active/);
    const modelMatch = ocStatus.match(/default\s+(us\.anthropic\.\S+|anthropic\.\S+|[\w./-]+claude[\w./-]*)/);
    const memoryMatch = ocStatus.match(/(\d+)\s*files.*?(\d+)\s*chunks/);
    const heartbeatInterval = ocStatus.match(/Heartbeat\s*│\s*(\w+)/);
    const agentsMatch = ocStatus.match(/Agents\s*│\s*(\d+)/);

    const channels = [];
    const channelRegex = /│\s*(Discord|WhatsApp|Telegram)\s*│\s*(ON|OFF)\s*│\s*(OK|OFF|ERROR)\s*│\s*(.+?)\s*│/g;
    let m;
    while ((m = channelRegex.exec(ocStatus)) !== null) {
      channels.push({ name: m[1], enabled: m[2], state: m[3], detail: m[4].trim() });
    }

    const sessionList = sessions.sessions || [];
    const totalTokens = sessionList.reduce((sum, s) => sum + (s.totalTokens || 0), 0);
    const tokenUsage = { used: totalTokens, limit: 0, percentage: 0 };

    let recentActivity = activity;
    if (!recentActivity?.length) {
      recentActivity = buildActivityFromMemory();
    }

    let heartbeat = { lastHeartbeat: null, lastChecks: {} };
    try {
      const raw = await fs.promises.readFile(path.join(MEMORY_PATH, 'heartbeat-state.json'), 'utf8');
      heartbeat = JSON.parse(raw);
    } catch {
      // use default heartbeat object
    }

    cache.status = { sessionsMatch, modelMatch, memoryMatch, heartbeatInterval, agentsMatch, channels, tokenUsage, recentActivity, heartbeat };
    cache.statusTime = Date.now();
  } catch (e) {
    console.error('[StatusCache] refresh failed:', e.message);
  }
}

// ── GET /api/status ───────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    if (Date.now() - cache.statusTime > cache.STATUS_TTL) {
      refreshStatusCache(); // fire-and-forget — serve stale immediately
    }
    if (!cache.status) {
      await refreshStatusCache();
    }

    const { sessionsMatch, modelMatch, memoryMatch, heartbeatInterval, agentsMatch, channels, tokenUsage, recentActivity, heartbeat: cachedHb } = cache.status || {};

    // Always read heartbeat state fresh from disk (cheap operation)
    let hb = cachedHb || {};
    try {
      const raw = await fs.promises.readFile(path.join(MEMORY_PATH, 'heartbeat-state.json'), 'utf8');
      hb = JSON.parse(raw);
    } catch {
      // use cached value
    }

    res.json({
      agent: {
        name: mcConfig.name || 'Mission Control',
        status: 'active',
        model: modelMatch
          ? modelMatch[1]
              .replace('us.anthropic.', '')
              .replace(/claude-opus-(\d+)-(\d+).*/, 'Claude Opus $1.$2')
              .replace(/claude-sonnet-(\d+).*/, 'Claude Sonnet $1')
              .replace(/-/g, ' ')
          : 'Claude Opus 4.6',
        activeSessions: sessionsMatch ? parseInt(sessionsMatch[1]) : 0,
        totalAgents: agentsMatch ? parseInt(agentsMatch[1]) : 1,
        memoryFiles: memoryMatch ? parseInt(memoryMatch[1]) : 46,
        memoryChunks: memoryMatch ? parseInt(memoryMatch[2]) : 225,
        heartbeatInterval: heartbeatInterval ? heartbeatInterval[1] : '1h',
        channels,
      },
      heartbeat: hb,
      recentActivity: recentActivity || [],
      tokenUsage: tokenUsage || { used: 0, limit: 1000000, percentage: 0 },
    });
  } catch (err) {
    console.error('[Status API]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.refreshStatusCache = refreshStatusCache;
