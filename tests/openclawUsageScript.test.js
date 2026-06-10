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

function writeTokenCountLine(file, timestamp, totalTokens) {
  fs.appendFileSync(file, `${JSON.stringify({
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        last_token_usage: {
          input_tokens: totalTokens - 1,
          output_tokens: 1,
          cached_input_tokens: 0,
          total_tokens: totalTokens,
        },
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

    fs.appendFileSync(sessionFile, `${JSON.stringify({ type: 'session_meta', payload: { model_provider: 'openai-codex', model: 'gpt-test' } })}\n`);
    writeUsageLine(sessionFile, timestamp, 11);
    writeUsageLine(sessionFile, timestamp, 13);
    writeTokenCountLine(sessionFile, timestamp, 17);
    writeUsageLine(trajectoryFile, timestamp, 999);

    const files = listSessionFiles(today.getTime() - 60_000);
    assert.equal(files.length, 1, 'nested session JSONL should be discovered and trajectory files skipped');
    assert.ok(files[0].sessionKey.includes('alpha/agent/codex-home/sessions'), 'session key should preserve nested identity');

    const summary = await buildForPeriod('day');
    assert.equal(summary.summary.recordsScanned, 3, 'usage records should come from both supported JSONL shapes');
    assert.equal(summary.summary.periodTokens, 41, 'message and token_count usage records should contribute to totals');
    assert.equal(summary.byService[0].sessions, 1, 'multiple usage records in one file should count as one session');
  });

  await withTempHome(async (home) => {
    const today = new Date();
    const nestedDir = path.join(
      home,
      '.openclaw',
      'agents',
      'main',
      'sessions',
      String(today.getFullYear()),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    );
    fs.mkdirSync(nestedDir, { recursive: true });
    const sessionFile = path.join(nestedDir, 'missing-model.jsonl');
    const timestamp = today.toISOString();

    fs.appendFileSync(sessionFile, `${JSON.stringify({ type: 'session_meta', payload: { model_provider: 'openai' } })}\n`);
    writeTokenCountLine(sessionFile, timestamp, 21);

    const summary = await buildForPeriod('day');
    assert.equal(summary.byService[0].name, 'openai/gpt-5.5', 'missing OpenClaw Codex model should land in the configured default model bucket');
    assert.equal(summary.byService[0].costSource, 'included', 'default GPT-5.5 bucket should be subscription-included, not unknown spend');
    assert.equal(summary.byService[0].tokens, 21, 'default model bucket should preserve token totals');
  });
}

runBehaviorTests()
  .then(() => console.log('openclaw usage script tests passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
