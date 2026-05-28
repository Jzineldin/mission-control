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

console.log('gbrainOperatorActions regression tests passed');
