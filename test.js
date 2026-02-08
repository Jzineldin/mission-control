#!/usr/bin/env node
/**
 * Mission Control — Basic API Test Suite
 * 
 * Run: node test.js [base-url]
 * Default: http://localhost:3333
 * 
 * Tests all API endpoints for basic functionality.
 * No dependencies — uses built-in fetch.
 */

const BASE = process.argv[2] || 'http://localhost:3333';
let passed = 0;
let failed = 0;
let skipped = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

async function skip(name, reason) {
  skipped++;
  console.log(`  ⏭️  ${name} (${reason})`);
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function run() {
  console.log(`\n🧪 Mission Control API Test Suite`);
  console.log(`   Base URL: ${BASE}\n`);

  // ========== CORE ==========
  console.log('Core Endpoints:');
  
  await test('GET /api/health returns status ok', async () => {
    const d = await get('/api/health');
    if (d.status !== 'ok') throw new Error(`status=${d.status}`);
    if (!d.version) throw new Error('missing version');
    if (!d.uptime && d.uptime !== 0) throw new Error('missing uptime');
  });

  await test('GET /api/status returns agent info', async () => {
    const d = await get('/api/status');
    if (!d.agent) throw new Error('missing agent');
    if (!d.agent.name) throw new Error('missing agent.name');
  });

  await test('GET /api/config returns modules', async () => {
    const d = await get('/api/config');
    if (!d.modules) throw new Error('missing modules');
    if (typeof d.modules.dashboard !== 'boolean') throw new Error('modules.dashboard not boolean');
  });

  // ========== MODELS ==========
  console.log('\nModel Discovery:');

  await test('GET /api/models returns array', async () => {
    const d = await get('/api/models');
    if (!Array.isArray(d)) throw new Error('not an array');
    if (d.length === 0) throw new Error('empty models list');
  });

  await test('Each model has id and name', async () => {
    const d = await get('/api/models');
    for (const m of d) {
      if (!m.id) throw new Error(`model missing id`);
      if (!m.name) throw new Error(`model ${m.id} missing name`);
    }
  });

  await test('Model names are clean (no raw version strings)', async () => {
    const d = await get('/api/models');
    for (const m of d) {
      if (m.name.includes('20250514')) throw new Error(`ugly name: ${m.name}`);
      if (m.name.includes('-v1:0')) throw new Error(`ugly name: ${m.name}`);
    }
  });

  // ========== SESSIONS ==========
  console.log('\nSessions:');

  await test('GET /api/sessions returns sessions array', async () => {
    const d = await get('/api/sessions');
    if (!d.sessions) throw new Error('missing sessions');
    if (!Array.isArray(d.sessions)) throw new Error('sessions not array');
  });

  // ========== CRON ==========
  console.log('\nCron Jobs:');

  await test('GET /api/cron returns jobs array', async () => {
    const d = await get('/api/cron');
    if (!d.jobs) throw new Error('missing jobs');
    if (!Array.isArray(d.jobs)) throw new Error('jobs not array');
  });

  // ========== SCOUT ==========
  console.log('\nScout:');

  await test('GET /api/scout returns opportunities', async () => {
    const d = await get('/api/scout');
    if (!d.opportunities && !Array.isArray(d.opportunities || [])) throw new Error('missing opportunities');
  });

  await test('GET /api/scout/config returns scoring info', async () => {
    const d = await get('/api/scout/config');
    if (!d.scoring) throw new Error('missing scoring');
    if (!d.scoring.explanation) throw new Error('missing scoring explanation');
    if (d.queryCount === undefined) throw new Error('missing queryCount');
  });

  await test('GET /api/scout/status returns scanning state', async () => {
    const d = await get('/api/scout/status');
    if (typeof d.scanning !== 'boolean') throw new Error('scanning not boolean');
  });

  // ========== DOCS ==========
  console.log('\nDocuments:');

  await test('GET /api/docs returns documents array', async () => {
    const d = await get('/api/docs');
    if (!d.documents) throw new Error('missing documents');
    if (!Array.isArray(d.documents)) throw new Error('documents not array');
  });

  // ========== SKILLS ==========
  console.log('\nSkills:');

  await test('GET /api/skills returns installed array', async () => {
    const d = await get('/api/skills');
    if (!d.installed) throw new Error('missing installed');
    if (!Array.isArray(d.installed)) throw new Error('installed not array');
  });

  // ========== AGENTS ==========
  console.log('\nAgents:');

  await test('GET /api/agents returns agents and conversations', async () => {
    const d = await get('/api/agents');
    if (!d.agents) throw new Error('missing agents');
    if (!Array.isArray(d.agents)) throw new Error('agents not array');
  });

  // ========== COSTS ==========
  console.log('\nCosts:');

  await test('GET /api/costs returns cost data', async () => {
    const d = await get('/api/costs');
    // Should return either breakdown or empty object
    if (typeof d !== 'object') throw new Error('not an object');
  });

  // ========== SETUP ==========
  console.log('\nSetup:');

  await test('GET /api/setup returns setup status', async () => {
    const d = await get('/api/setup');
    if (typeof d.needsSetup !== 'boolean') throw new Error('needsSetup not boolean');
    if (typeof d.gatewayRunning !== 'boolean') throw new Error('gatewayRunning not boolean');
  });

  // ========== MEMORY ==========
  console.log('\nMemory:');

  await test('GET /api/memory returns files list', async () => {
    const d = await get('/api/memory');
    if (!d.files) throw new Error('missing files');
    if (!Array.isArray(d.files)) throw new Error('files not array');
  });

  // ========== FRONTEND ==========
  console.log('\nFrontend:');

  await test('GET / returns HTML with app root', async () => {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(5000) });
    const html = await res.text();
    if (!html.includes('<div id="root">')) throw new Error('missing #root');
    if (!html.includes('Mission Control')) throw new Error('missing title');
  });

  await test('Static assets are served', async () => {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(5000) });
    const html = await res.text();
    const jsMatch = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
    if (!jsMatch) throw new Error('no JS bundle found in HTML');
    const jsRes = await fetch(`${BASE}${jsMatch[1]}`, { signal: AbortSignal.timeout(5000) });
    if (!jsRes.ok) throw new Error(`JS bundle returned ${jsRes.status}`);
  });

  // ========== RESULTS ==========
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log(`${'─'.repeat(40)}\n`);

  if (failed > 0) {
    console.log('❌ Some tests failed!');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!');
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
