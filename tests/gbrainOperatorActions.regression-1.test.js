const assert = require('node:assert/strict');

const { buildGBrainOverview, listGBrainActions } = require('../server/routes/gbrain');

// Regression: ISSUE-001 — cockpit still claimed no mutation controls after operator actions shipped.
// Found by /qa on 2026-05-28
// Report: .gstack/qa-reports/qa-report-127-0-0-1-3333-2026-05-28.md
(function testCockpitNamesAllowlistedOperatorActions() {
  const overview = buildGBrainOverview();
  const actions = listGBrainActions();

  assert.equal(actions.length, 7);
  assert.equal(overview.cockpit.autopilot.label, 'Operator actions');
  assert.equal(overview.cockpit.autopilot.value, 'Allowlisted');
  assert.match(overview.cockpit.autopilot.detail, /7 local actions/i);
  assert.doesNotMatch(overview.cockpit.autopilot.detail, /no mutation controls/i);
})();

(function testCoreNextActionPointsToAllowlistedActions() {
  const overview = buildGBrainOverview({
    health: {
      ok: true,
      mode: 'live-read-only',
      checkedAt: '2026-05-28T16:00:00.000Z',
      status: 'healthy',
      score: 100,
      metrics: {
        pages: 1,
        chunks: 1,
        embedded: 1,
        missingEmbeddings: 0,
        stalePages: 0,
        embeddingCoverage: 100,
        queue: { waiting: 0, active: 0, stalled: 0 },
      },
    },
  });
  const core = overview.nodes.find((node) => node.id === 'gbrain-core');

  assert.match(core.nextSafeAction, /allowlisted Operator Actions/i);
  assert.doesNotMatch(core.nextSafeAction, /outside this read-only surface/i);
})();

console.log('gbrainOperatorActions regression tests passed');
