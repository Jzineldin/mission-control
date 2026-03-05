'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const { OPENCLAW_DIR, HIDDEN_SESSIONS_FILE, GATEWAY_PORT, GATEWAY_TOKEN } = require('../lib/config');
const cache = require('../lib/cache');
const { readJSON, writeJSON, gatewayInvoke, getLastAssistantMessage } = require('../lib/helpers');
const { fetchSessions } = require('../lib/gateway');

const router = express.Router();

// Load hidden sessions at startup (sync read once is fine)
let hiddenSessions = [];
try {
  hiddenSessions = JSON.parse(fs.readFileSync(HIDDEN_SESSIONS_FILE, 'utf8'));
} catch {
  console.warn('[Sessions] No hidden-sessions.json found, starting with empty list');
}

// ── GET /api/sessions ─────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    if (cache.sessions && Date.now() - cache.sessionsTime < cache.SESSIONS_TTL) {
      return res.json(cache.sessions);
    }

    const sessionData = await fetchSessions(200);
    const sessions = sessionData.sessions || [];

    let result = {
      count: sessionData.count || sessions.length,
      sessions: sessions.map(s => {
        const key = s.key || '';
        const type = key.includes(':subagent:') ? 'sub-agent'
          : key.includes(':cron:') ? 'cron'
          : key.includes(':discord:') ? 'discord'
          : key.includes(':openai') ? 'web'
          : key.includes(':telegram:') ? 'telegram'
          : key.includes(':whatsapp:') ? 'whatsapp'
          : key.match(/agent:\w+:main$/) ? 'main'
          : 'other';
        return {
          key: s.key,
          kind: s.kind,
          channel: s.channel || 'unknown',
          displayName: s.displayName || s.key.split(':').slice(-1)[0],
          model: (s.model || '').replace('us.anthropic.', ''),
          totalTokens: s.totalTokens || 0,
          contextTokens: s.contextTokens || 0,
          updatedAt: s.updatedAt ? new Date(s.updatedAt).toISOString() : null,
          label: s.label || null,
          type,
          isActive: (s.totalTokens || 0) > 0,
        };
      }),
    };

    result.sessions = result.sessions.filter(s => !hiddenSessions.includes(s.key));
    result.count = result.sessions.length;

    cache.sessions = result;
    cache.sessionsTime = Date.now();
    res.json(result);
  } catch (e) {
    console.error('[Sessions API]', e.message);
    res.json({ count: 0, sessions: [], error: e.message });
  }
});

// ── GET /api/sessions/:sessionKey/history ─────────────────────────────────────

router.get('/:sessionKey/history', async (req, res) => {
  try {
    let sessionKey;
    try { sessionKey = decodeURIComponent(req.params.sessionKey); }
    catch { return res.status(400).json({ error: 'Invalid session key encoding' }); }
    // Extract agentId from key: "agent:<agentId>:..."
    const keyParts = sessionKey.split(':');
    const agentId = keyParts.length >= 2 ? keyParts[1] : 'main';

    // Read the session record from the agent's sessions.json on disk
    const sessionsPath = path.join(OPENCLAW_DIR, 'agents', agentId, 'sessions', 'sessions.json');
    const sessionsMap = await readJSON(sessionsPath, {});
    const session = sessionsMap[sessionKey];

    if (!session) return res.json({ messages: [], info: 'Session not found' });

    // Use sessionFile (absolute path) if present, otherwise build from sessionId
    let transcriptFile = session.sessionFile;
    if (!transcriptFile && session.sessionId) {
      transcriptFile = path.join(OPENCLAW_DIR, 'agents', agentId, 'sessions', `${session.sessionId}.jsonl`);
    }
    if (!transcriptFile) return res.json({ messages: [], info: 'No transcript found' });
    if (!fs.existsSync(transcriptFile)) return res.json({ messages: [], info: 'Transcript file missing' });

    const raw = await fs.promises.readFile(transcriptFile, 'utf8');
    const messages = [];

    for (const line of raw.split('\n').filter(Boolean)) {
      try {
        const entry = JSON.parse(line);
        if (entry.type !== 'message' || !entry.message) continue;
        const msg = entry.message;
        const role = msg.role;
        if (!role || role === 'toolResult' || role === 'toolUse') continue;

        let text = '';
        if (typeof msg.content === 'string') {
          text = msg.content;
        } else if (Array.isArray(msg.content)) {
          text = msg.content.filter(c => c.type === 'text').map(c => c.text || '').join('\n');
        }
        if (text.trim()) {
          messages.push({ role, content: text.substring(0, 3000), ts: entry.timestamp });
        }
      } catch {
        // skip malformed JSONL line
      }
    }

    res.json({ messages: messages.slice(-50), total: messages.length, sessionKey });
  } catch (err) {
    console.error('[Session history]', err.message);
    res.json({ messages: [], error: err.message });
  }
});

// ── POST /api/sessions/:sessionKey/send ───────────────────────────────────────

router.post('/:sessionKey/send', async (req, res) => {
  try {
    let sessionKey;
    try { sessionKey = decodeURIComponent(req.params.sessionKey); }
    catch { return res.status(400).json({ error: 'Invalid session key encoding' }); }
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    const cfg = await readJSON(path.join(OPENCLAW_DIR, 'openclaw.json'), {});
    const gwToken = cfg.gateway?.auth?.token || process.env.MC_GATEWAY_TOKEN || GATEWAY_TOKEN;
    const gwPort = cfg.gateway?.port || GATEWAY_PORT;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

    try {
      const response = await fetch(`http://127.0.0.1:${gwPort}/tools/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${gwToken}` },
        signal: controller.signal,
        body: JSON.stringify({ tool: 'sessions_send', args: { sessionKey, message, timeoutSeconds: 90 } }),
      });

      clearTimeout(timeout);
      const data = await response.json();
      let resultText = data?.result?.content?.[0]?.text || '';

      try {
        const parsed = JSON.parse(resultText);
        if (parsed.reply) resultText = parsed.reply;
      } catch {
        // not JSON, use as-is
      }

      res.json({ ok: !!resultText, result: resultText });
    } catch (fetchErr) {
      clearTimeout(timeout);
      console.warn('[Session send] Fetch timed out or failed, trying transcript fallback:', fetchErr.message);

      let resultText = '';
      try {
        const sessionsFile = path.join(OPENCLAW_DIR, 'agents/main/sessions/sessions.json');
        const sessions = await readJSON(sessionsFile, {});
        const sessionId = sessions[sessionKey]?.sessionId || '';
        if (sessionId) {
          const transcriptPath = path.join(OPENCLAW_DIR, 'agents/main/sessions', `${sessionId}.jsonl`);
          resultText = await getLastAssistantMessage(transcriptPath);
        }
      } catch (e) {
        console.error('[Session send] Transcript fallback failed:', e.message);
      }

      if (resultText) {
        res.json({ ok: true, result: resultText });
      } else {
        res.json({ ok: false, result: 'Response is taking longer than expected. The agent is still working — check back in a moment.' });
      }
    }
  } catch (err) {
    console.error('[Session send]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/sessions/:key/close ──────────────────────────────────────────

router.delete('/:key/close', async (req, res) => {
  let key;
  try { key = decodeURIComponent(req.params.key); }
  catch { return res.status(400).json({ error: 'Invalid key encoding' }); }
  if (!hiddenSessions.includes(key)) {
    hiddenSessions.push(key);
    await writeJSON(HIDDEN_SESSIONS_FILE, hiddenSessions);
  }
  cache.sessions = null;
  cache.sessionsTime = 0;
  res.json({ status: 'hidden', message: `Session "${key}" hidden from view` });
});

module.exports = router;
