const assert = require('node:assert/strict');

const { hasCronModelPatch, isUsableCronSnapshot } = require('../server/routes/cron');

(function testLegacyCronSnapshotRemainsUsable() {
  assert.equal(isUsableCronSnapshot({
    jobs: [{ id: 'legacy-job', name: 'Legacy snapshot' }],
  }), true);
})();

(function testHermesCronSnapshotRequiresEditableActions() {
  assert.equal(isUsableCronSnapshot({
    jobs: [{ id: 'hermes:job', scheduler: 'hermes', actions: { model: true, toggle: true } }],
  }), true);
  assert.equal(isUsableCronSnapshot({
    jobs: [{ id: 'hermes:job', scheduler: 'hermes', actions: { model: true } }],
  }), false);
})();

(function testEmptyCronSnapshotIsNotUsable() {
  assert.equal(isUsableCronSnapshot({ jobs: [] }), false);
  assert.equal(isUsableCronSnapshot(null), false);
})();

(function testCronModelPatchAcceptsExplicitDefaultModel() {
  assert.equal(hasCronModelPatch({ model: '' }), true);
  assert.equal(hasCronModelPatch({ thinking: 'low' }), true);
  assert.equal(hasCronModelPatch({}), false);
})();

console.log('cron route tests passed');
