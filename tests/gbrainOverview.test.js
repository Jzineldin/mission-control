const assert = require('node:assert/strict');

const { buildGBrainOverview } = require('../server/routes/gbrain');

(function testOverviewIsReadOnlyAndEvidenceBacked() {
  const overview = buildGBrainOverview();

  assert.equal(overview.ok, true);
  assert.equal(overview.mode, 'read-only-fixture');
  assert.equal(overview.title, 'GBrain');
  assert.equal(overview.trust.status, 'warning');
  assert.equal(overview.trust.label, 'Trusted with caveats');
  assert.ok(overview.nodes.length >= 6);
  assert.ok(overview.edges.length >= 5);
  assert.equal(overview.warnings.length, 0);
  assert.ok(overview.caveats.length >= 2);

  for (const node of overview.nodes) {
    assert.ok(node.proof?.source, `${node.id} is missing proof source`);
    assert.ok(node.proof?.detail, `${node.id} is missing proof detail`);
    assert.ok(node.nextSafeAction, `${node.id} is missing read-only next action`);
  }
})();

(function testCaveatNodesAreEvidenceBackedNotProofless() {
  const overview = buildGBrainOverview();
  const sources = overview.nodes.find((node) => node.id === 'sources');
  const googleBridge = overview.nodes.find((node) => node.id === 'google-bridge');

  assert.ok(sources);
  assert.ok(googleBridge);
  assert.equal(sources.status, 'warning');
  assert.equal(googleBridge.status, 'warning');
  assert.match(sources.summary, /verified/i);
  assert.match(googleBridge.proof.label, /caveat/i);
  assert.doesNotMatch(sources.nextSafeAction, /missing proof/i);
  assert.doesNotMatch(googleBridge.nextSafeAction, /missing proof/i);
})();

(function testCoreAuditNumbersArePresent() {
  const overview = buildGBrainOverview();
  const core = overview.nodes.find((node) => node.id === 'gbrain-core');
  const queues = overview.nodes.find((node) => node.id === 'queues');

  assert.ok(core);
  assert.ok(queues);
  assert.equal(core.metrics.find((metric) => metric.label === 'Pages')?.value, '15,713');
  assert.equal(core.metrics.find((metric) => metric.label === 'Embedded')?.value, '191,638');
  assert.equal(queues.metrics.find((metric) => metric.label === 'Missing')?.value, '0');
  assert.equal(overview.cockpit.embeddings.value, '100%');
})();

console.log('gbrainOverview tests passed');
