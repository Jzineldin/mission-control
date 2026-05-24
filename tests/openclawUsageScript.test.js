const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildForPeriod, listSessionFiles } = require('../scripts/openclaw-usage-summary');

const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'openclaw-usage-summary.js'), 'utf8');

assert.ok(!source.includes('loadCostUsageSummary'), 'script must not use the slow OpenClaw bundled summary path');
assert.ok(!source.includes('await usage.session('), 'script must not fan out through slow per-session OpenClaw aggregation');
assert.ok(source.includes('session JSONL fast scan'), 'script should use the bounded JSONL fast scan source');
assert.ok(source.includes("entry.name.endsWith('.trajectory.jsonl')"), 'script should skip trajectory JSONL files to avoid double counting');
assert.ok(source.includes('VALID_PERIODS'), 'script should ignore non-period flags such as --json');

async function withTempHome(fn) {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-openclaw-usage-'));
  const previousHome = process.env.HOME;
  process.env.HOME = tempHome;
  try {
    await fn(tempHome);
  } finally {
    process.env.HOME = previousHome;
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

function writeUsageLine(file, timestamp, totalTokens) {
  fs.appendFileSync(file, `${JSON.stringify({
    message: {
      timestamp,
      provider: 'openai-codex',
      model: 'gpt-test',
      usage: {
        input: totalTokens,
        output: 0,
        totalTokens,
        cost: { total: 0 },
      },
    },
  })}\n`);
}

async function runBehaviorTests() {
  await withTempHome(async (home) => {
    const today = new Date();
    const nestedDir = path.join(
      home,
      '.openclaw',
      'agents',
      'alpha',
      'agent',
      'codex-home',
      'sessions',
      String(today.getFullYear()),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    );
    fs.mkdirSync(nestedDir, { recursive: true });
    const sessionFile = path.join(nestedDir, 'rollout-test.jsonl');
    const trajectoryFile = path.join(nestedDir, 'rollout-test.trajectory.jsonl');
    const timestamp = today.toISOString();

    writeUsageLine(sessionFile, timestamp, 11);
    writeUsageLine(sessionFile, timestamp, 13);
    writeUsageLine(trajectoryFile, timestamp, 999);

    const files = listSessionFiles(today.getTime() - 60_000);
    assert.equal(files.length, 1, 'nested session JSONL should be discovered and trajectory files skipped');
    assert.ok(files[0].sessionKey.includes('alpha/agent/codex-home/sessions'), 'session key should preserve nested identity');

    const summary = await buildForPeriod('day');
    assert.equal(summary.summary.recordsScanned, 2, 'usage records should come from the nested session file');
    assert.equal(summary.summary.periodTokens, 24, 'nested usage records should contribute to totals');
    assert.equal(summary.byService[0].sessions, 1, 'multiple usage records in one file should count as one session');
  });
}

runBehaviorTests()
  .then(() => console.log('openclaw usage script tests passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
