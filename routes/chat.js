'use strict';
const express = require('express');
const { GATEWAY_PORT, GATEWAY_TOKEN } = require('../lib/config');

const router = express.Router();

router.get('/', (req, res) => res.json({ status: 'ok', hint: 'POST messages to chat' }));
router.options('/', (req, res) => res.sendStatus(204));

// POST /api/chat — try multiple methods to reach the agent
router.post('/', async (req, res) => {
  const { messages } = req.body;
  const lastUserMsg = [...(messages || [])].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) return res.status(400).json({ error: 'No user message' });

  console.log('[Chat] Message:', lastUserMsg.content.substring(0, 80));

  const gwUrl = `http://127.0.0.1:${GATEWAY_PORT}`;
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GATEWAY_TOKEN}` };

  // Method 1: Try sessions_send via tools/invoke
  try {
    const r = await fetch(`${gwUrl}/tools/invoke`, {
      method: 'POST', headers,
      body: JSON.stringify({ tool: 'sessions_send', args: { sessionKey: 'agent:main:main', message: lastUserMsg.content, timeoutSeconds: 60 } }),
      signal: AbortSignal.timeout(65000),
    });
    const data = await r.json();
    if (data?.ok) {
      const text = data?.result?.content?.[0]?.text || data?.result?.details?.reply || JSON.stringify(data.result);
      return res.json({ choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }] });
    }
  } catch (e) { console.warn('[Chat] sessions_send failed:', e.message); }

  // Method 2: Try v1/chat/completions
  try {
    const r = await fetch(`${gwUrl}/v1/chat/completions`, {
      method: 'POST', headers,
      body: JSON.stringify({ messages: messages || [], model: 'default' }),
      signal: AbortSignal.timeout(65000),
    });
    if (r.ok) {
      const data = await r.json();
      return res.json(data);
    }
  } catch (e) { console.warn('[Chat] v1/chat failed:', e.message); }

  // Fallback: explain the situation
  res.json({
    choices: [{
      message: { role: 'assistant', content: '⚠️ Chat is not connected yet. The OpenClaw gateway doesn\'t expose chat tools via HTTP.\n\nYou can talk to me via **Discord** or the **terminal** instead. We\'re working on enabling direct chat in Mission Control!' },
      finish_reason: 'stop',
    }],
  });
});

module.exports = router;
