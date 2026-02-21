'use strict';
const express = require('express');
const { AGENTS_FILE, GATEWAY_PORT, GATEWAY_TOKEN, agentName } = require('../lib/config');
const { readJSON, writeJSON, generateId } = require('../lib/helpers');
const { fetchSessions } = require('../lib/gateway');

const router = express.Router();

// ── GET /api/agents ───────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const sessionData = await fetchSessions(50);
    const sessions = sessionData.sessions || [];

    const customAgents = await readJSON(AGENTS_FILE, []);

    const mainSession = sessions.find(s => s.key === 'agent:main:main');
    const agents = [];

    // Primary agent
    agents.push({
      id: 'primary',
      name: agentName,
      role: 'Commander',
      avatar: '🤖',
      status: 'active',
      model: mainSession
        ? (mainSession.model || '').replace('us.anthropic.', '').replace(/claude-opus-(\d+).*/, 'Claude Opus $1').replace(/-/g, ' ')
        : 'Claude Opus 4.6',
      description: 'Primary AI agent. Manages all operations, communications, and development tasks.',
      lastActive: mainSession?.updatedAt ? new Date(mainSession.updatedAt).toISOString() : new Date().toISOString(),
      totalTokens: mainSession?.totalTokens || 0,
      sessionKey: 'agent:main:main',
    });

    // Custom agents
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
        created: agent.created,
      });
    });

    // Sub-agents from real sessions
    sessions.filter(s => s.key.includes(':subagent:')).forEach(s => {
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

    // Discord channel sessions
    sessions
      .filter(s => s.key.includes(':discord:channel:') && (s.totalTokens || 0) > 0)
      .sort((a, b) => (b.totalTokens || 0) - (a.totalTokens || 0))
      .forEach(s => {
        const name = (s.displayName || '').replace(/^discord:\d+#/, '') || s.key.split(':').pop();
        agents.push({
          id: s.sessionId || s.key,
          name: `#${name}`,
          role: 'Channel Session',
          avatar: '💬',
          status: 'active',
          model: (s.model || '').replace('us.anthropic.', '').replace(/claude-opus-(\d+).*/, 'Claude Opus $1').replace(/-/g, ' '),
          description: 'Discord channel session',
          lastActive: s.updatedAt ? new Date(s.updatedAt).toISOString() : null,
          totalTokens: s.totalTokens || 0,
          sessionKey: s.key,
        });
      });

    // Mission Control chat sessions (merged)
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

    res.json({ agents, conversations: [] });
  } catch (e) {
    console.error('[Agents API]', e.message);
    res.json({
      agents: [{ id: 'primary', name: agentName, role: 'Commander', avatar: '🤖', status: 'active', model: 'Claude Opus 4.6', description: 'Primary agent (session data unavailable)', lastActive: new Date().toISOString(), totalTokens: 0 }],
      conversations: [],
      error: e.message,
    });
  }
});

// ── POST /api/agents/create ───────────────────────────────────────────────────

router.post('/create', async (req, res) => {
  try {
    const { name, description, model, systemPrompt, skills } = req.body;
    if (!name || !model) {
      return res.status(400).json({ error: 'name and model are required' });
    }

    const agents = await readJSON(AGENTS_FILE, []);
    const agent = {
      id: generateId('custom'),
      name,
      description: description || '',
      model,
      systemPrompt: systemPrompt || '',
      skills: skills || [],
      created: new Date().toISOString(),
      status: 'active',
    };
    agents.push(agent);
    await writeJSON(AGENTS_FILE, agents);

    res.json({ ok: true, agent });
  } catch (error) {
    console.error('[Create Agent]', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
