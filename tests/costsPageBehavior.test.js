const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Read Costs.tsx plus its helper modules so guards work regardless of which
// file the string lives in after the modular refactor.
const pagesDir = path.join(__dirname, '..', 'frontend', 'src', 'pages');
const costsDir = path.join(pagesDir, 'costs');
const filesToCheck = [
  path.join(pagesDir, 'Costs.tsx'),
  path.join(costsDir, 'lib.ts'),
  path.join(costsDir, 'types.ts'),
].filter(f => fs.existsSync(f));
const source = filesToCheck.map(f => fs.readFileSync(f, 'utf8')).join('\n');

assert.ok(
  source.includes("tokens?.source === 'sessions.fast_fallback'") && source.includes('tokens?.meta?.refreshing') && source.includes('tokens?.meta?.stale'),
  'Costs page should keep retrying while detailed cost data is fallback, refreshing, or stale',
);

assert.ok(
  source.includes("if (period === 'day') return days.slice(-2, -1)"),
  'CodexBar day comparison should use the previous real day row',
);

assert.ok(
  source.includes("if (period === '7d') return days.slice(-14, -7)"),
  'CodexBar 7d comparison should use the previous real 7-day window',
);

assert.ok(
  source.includes('return days.slice(-60, -30)') && source.includes("return codexbarCosts?.daily?.slice(-30) || []"),
  'CodexBar month comparison should compare the current rolling 30 days against the previous rolling 30 days',
);

assert.ok(
  source.includes("return { period: 'vs previous 30 days', daily: 'vs previous 30d avg' }"),
  'CodexBar month labels should describe the actual rolling baseline',
);

console.log('costs page behavior guards passed');
