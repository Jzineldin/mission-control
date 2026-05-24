const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'openclaw-usage-summary.js'), 'utf8');

assert.ok(!source.includes('loadCostUsageSummary'), 'script must not use the slow OpenClaw bundled summary path');
assert.ok(!source.includes('await usage.session('), 'script must not fan out through slow per-session OpenClaw aggregation');
assert.ok(source.includes('session JSONL fast scan'), 'script should use the bounded JSONL fast scan source');
assert.ok(source.includes("entry.name.endsWith('.trajectory.jsonl')"), 'script should skip trajectory JSONL files to avoid double counting');
assert.ok(source.includes('VALID_PERIODS'), 'script should ignore non-period flags such as --json');

console.log('openclaw usage script tests passed');
