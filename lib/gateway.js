'use strict';
const fs = require('fs');
const path = require('path');
const { GATEWAY_PORT, GATEWAY_TOKEN, MEMORY_PATH, NOTION_DB_ID, NOTION_TOKEN, OPENCLAW_DIR } = require('./config');
const { gatewayInvoke } = require('./helpers');

// ── Sessions ──────────────────────────────────────────────────────────────────

async function fetchSessions(limit = 50) {
  try {
    const data = await gatewayInvoke(GATEWAY_PORT, GATEWAY_TOKEN, 'sessions_list', { limit, messageLimit: 1 });
    if (data?.sessions) return data;
    if (Array.isArray(data)) return { count: data.length, sessions: data };
  } catch (e) {
    console.error('[fetchSessions] Gateway API failed:', e.message);
  }

  // Fallback: read sessions.json directly
  try {
    const sessionsPath = path.join(OPENCLAW_DIR, 'agents/main/sessions/sessions.json');
    const raw = await fs.promises.readFile(sessionsPath, 'utf8');
    const sessionsMap = JSON.parse(raw);
    const sessions = Object.entries(sessionsMap).slice(0, limit).map(([key, s]) => ({
      key,
      kind: s.kind || 'unknown',
      channel: s.channel || 'unknown',
      displayName: s.displayName || key.split(':').slice(-1)[0],
      model: s.model || '',
      totalTokens: s.totalTokens || 0,
      contextTokens: s.contextTokens || 0,
      updatedAt: s.updatedAt ? new Date(s.updatedAt).toISOString() : null,
      label: s.label || null,
    }));
    return { count: sessions.length, sessions };
  } catch (e2) {
    console.error('[fetchSessions] Disk fallback failed:', e2.message);
    return { count: 0, sessions: [] };
  }
}

// ── Notion activity ───────────────────────────────────────────────────────────

async function fetchNotionActivity(pageSize = 5) {
  if (!NOTION_DB_ID || !NOTION_TOKEN) return null;
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
    if (!data.results?.length) return null;

    const typeMap = {
      Development: 'development', Business: 'business', Meeting: 'meeting',
      Planning: 'planning', 'Bug Fix': 'development', Personal: 'personal',
    };

    return data.results.map(page => {
      const props = page.properties || {};
      const name = (props.Name?.title || []).map(t => t.plain_text).join('') || 'Activity';
      const dateStr = props.Date?.date?.start || page.created_time || new Date().toISOString();
      const category = props.Category?.select?.name || 'general';
      const status = props.Status?.select?.name || props.Status?.status?.name || 'done';
      const details = (props.Details?.rich_text || []).map(t => t.plain_text).join('') || '';
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

// ── Activity from memory markdown files ───────────────────────────────────────

function buildActivityFromMemory() {
  const recentActivity = [];
  for (const dayOffset of [0, 1]) {
    const d = new Date();
    d.setDate(d.getDate() - dayOffset);
    const dateStr = d.toISOString().split('T')[0];
    try {
      const memPath = path.join(MEMORY_PATH, `${dateStr}.md`);
      if (!fs.existsSync(memPath)) continue;
      const memContent = fs.readFileSync(memPath, 'utf8');
      const sections = memContent.split(/\n## /).slice(1);
      sections.slice(0, 6).forEach(section => {
        const firstLine = section.split('\n')[0].trim();
        const timeMatch = firstLine.match(/(\d{2}:\d{2})\s*UTC/);
        const time = timeMatch ? `${dateStr}T${timeMatch[1]}:00Z` : `${dateStr}T12:00:00Z`;
        const title = firstLine.replace(/\d{2}:\d{2}\s*UTC\s*[-—]\s*/, '').replace(/\*\*/g, '').substring(0, 80);
        const bullets = section.split('\n').filter(l => /^[-*]\s/.test(l.trim()));
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
    } catch (e) {
      console.warn(`[buildActivityFromMemory] Failed to read ${dateStr}.md:`, e.message);
    }
  }
  return recentActivity.length
    ? recentActivity
    : [{ time: new Date().toISOString(), action: 'System running', detail: 'Dashboard active', type: 'general' }];
}

module.exports = { fetchSessions, fetchNotionActivity, buildActivityFromMemory };
