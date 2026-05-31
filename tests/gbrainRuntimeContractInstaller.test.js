const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { installContract, replaceManagedBlock } = require('../scripts/install-gbrain-runtime-contract');

(function testManagedBlockIsIdempotentAndReplacesOldContent() {
  const first = replaceManagedBlock('alpha\n');
  const second = replaceManagedBlock(first);
  const replaced = replaceManagedBlock(first.replace('get_page, put_page', 'old tools'));

  assert.equal(first, second);
  assert.match(replaced, /get_page, put_page, query, recall, think, sources_list, get_health/);
  assert.doesNotMatch(replaced, /old tools/);
})();

(function testInstallerUpdatesHermesAndOpenClawTargets() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gbrain-contract-'));
  const homeDir = path.join(root, 'home');
  const clawdRoot = path.join(root, 'clawd');
  const hermesProfileDir = path.join(homeDir, '.hermes/profiles/hmudur');
  fs.mkdirSync(clawdRoot, { recursive: true });
  fs.mkdirSync(path.join(hermesProfileDir, 'memories'), { recursive: true });
  fs.writeFileSync(path.join(clawdRoot, 'AGENTS.md'), '# OpenClaw\n');
  fs.writeFileSync(path.join(hermesProfileDir, 'memories/MEMORY.md'), '# Hermes Memory\n');

  const dryRun = installContract({ homeDir, clawdRoot, hermesProfileDir });
  assert.equal(dryRun.ok, true);
  assert.equal(dryRun.mode, 'dry-run');
  assert.equal(dryRun.changedCount, 2);
  assert.doesNotMatch(fs.readFileSync(path.join(clawdRoot, 'AGENTS.md'), 'utf8'), /mission-control-gbrain-contract/);

  const applied = installContract({ homeDir, clawdRoot, hermesProfileDir, apply: true });
  assert.equal(applied.ok, true);
  assert.equal(applied.mode, 'apply');
  assert.equal(applied.changedCount, 2);
  assert.match(fs.readFileSync(path.join(clawdRoot, 'AGENTS.md'), 'utf8'), /mission-control-gbrain-contract:start/);
  assert.match(fs.readFileSync(path.join(hermesProfileDir, 'memories/MEMORY.md'), 'utf8'), /Never put raw transcripts, secrets, credentials/);

  const secondApply = installContract({ homeDir, clawdRoot, hermesProfileDir, apply: true });
  assert.equal(secondApply.ok, true);
  assert.equal(secondApply.changedCount, 0);
})();

console.log('gbrainRuntimeContractInstaller tests passed');
