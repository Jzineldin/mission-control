'use strict';
const express = require('express');
const { mcConfig } = require('../lib/config');
const cache = require('../lib/cache');
const { fetchSessions } = require('../lib/gateway');

const router = express.Router();

// ── GET /api/costs ────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    if (cache.costs && Date.now() - cache.costsTime < cache.COSTS_TTL) {
      return res.json(cache.costs);
    }

    const sessionData = await fetchSessions(50);
    const sessions = sessionData.sessions || [];
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

    const byService = Object.entries(byChannel)
      .filter(([, v]) => v.tokens > 0)
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
        breakdown: { 'Claude Opus 4 (Bedrock)': 0 },
      });
    }

    const result = {
      daily,
      summary: {
        today: 0,
        thisWeek: 0,
        thisMonth: 0,
        totalTokens,
        totalSessions: sessions.length,
        activeSessions: sessions.filter(s => (s.totalTokens || 0) > 0).length,
        note: 'All LLM costs are $0 — using AWS Bedrock with included credits',
        budget: { monthly: 0, warning: 0 },
      },
      byService,
      byType,
      byChannel,
      budget: mcConfig.budget || { monthly: 0 },
    };

    cache.costs = result;
    cache.costsTime = Date.now();
    res.json(result);
  } catch (e) {
    console.error('[Costs API]', e.message);
    res.json({
      daily: [],
      summary: { today: 0, thisWeek: 0, thisMonth: 0, totalTokens: 0, budget: { monthly: 0, warning: 0 } },
      byService: [],
      byType: {},
      byChannel: {},
      budget: mcConfig.budget || { monthly: 0 },
      error: e.message,
    });
  }
});

module.exports = router;
