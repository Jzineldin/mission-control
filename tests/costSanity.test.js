const assert = require('node:assert/strict');

const {
  normalizeUsageCosts,
  lookupFallbackPricing,
  isImplausibleCloudCost,
  displayCostLabel,
} = require('../server/services/costSanity');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

(function testGpt55IsSubscriptionIncludedNotFallbackPriced() {
  assert.equal(lookupFallbackPricing('openai-codex/gpt-5.5'), null);
  assert.equal(displayCostLabel({ costSource: 'included', costStatus: 'included' }), 'included');
})();

(function testLocalIncludedCostKeepsLocalBillingMode() {
  const usage = normalizeUsageCosts({
    daily: [{ date: '2026-05-24', cost: 0, totalCost: 0, tokens: 10, totalTokens: 10 }],
    dailyByModel: [{
      date: '2026-05-24',
      totalCost: 0,
      totalTokens: 10,
      'ollama/qwen3.6:35b-a3b-nvfp4': 0,
      'ollama/qwen3.6:35b-a3b-nvfp4_tokens': 10,
      'ollama/qwen3.6:35b-a3b-nvfp4_costSource': 'included',
    }],
    byService: [{
      name: 'ollama/qwen3.6:35b-a3b-nvfp4',
      cost: 0,
      tokens: 10,
      costSource: 'included',
      costStatus: 'included',
      billingModes: 'local_included',
    }],
  });

  assert.equal(usage.byService[0].billingModes, 'local_included');
  assert.match(usage.byService[0].costNote, /Local model/);
})();

(function testImplausibleApiMicroCostIsNotTreatedAsSpend() {
  assert.equal(isImplausibleCloudCost({ name: 'openai-codex/gpt-5.5', tokens: 8_595_100, cost: 0.000009005297, costSource: 'api' }), true);

  const usage = clone({
    summary: {
      periodUsd: 0.000009005297,
      todayUsd: 0.000009005297,
      thisWeekUsd: 0.000009005297,
      thisMonthUsd: 0.000009005297,
      totalUsd: 0.000009005297,
      periodTokens: 8_595_100,
    },
    daily: [{ date: '2026-05-08', cost: 0.000009005297, totalCost: 0.000009005297, tokens: 8_595_100, totalTokens: 8_595_100 }],
    dailyByModel: [{
      date: '2026-05-08',
      totalCost: 0.000009005297,
      totalTokens: 8_595_100,
      'openai-codex/gpt-5.5': 0.000009005297,
      'openai-codex/gpt-5.5_tokens': 8_595_100,
      'openai-codex/gpt-5.5_costSource': 'api',
    }],
    byService: [{ name: 'openai-codex/gpt-5.5', cost: 0.000009005297, tokens: 8_595_100, sessions: 46, costSource: 'api' }],
  });

  const normalized = normalizeUsageCosts(usage);
  assert.equal(normalized.byService[0].cost, 0);
  assert.equal(normalized.byService[0].costSource, 'included');
  assert.equal(normalized.byService[0].costStatus, 'included');
  assert.equal(normalized.byService[0].billingModes, 'subscription_included');
  assert.equal(normalized.summary.periodUsd, 0);
  assert.equal(normalized.daily[0].cost, 0);
  assert.equal(normalized.dailyByModel[0]['openai-codex/gpt-5.5'], 0);
  assert.equal(normalized.dailyByModel[0]['openai-codex/gpt-5.5_costSource'], 'included');
})();

(function testUnknownZeroCostCloudModelsRemainUnknownNotDefaultSpend() {
  const usage = normalizeUsageCosts({
    summary: { periodUsd: 0, periodTokens: 1_000_000 },
    daily: [{ date: '2026-05-08', cost: 0, totalCost: 0, tokens: 1_000_000, totalTokens: 1_000_000 }],
    dailyByModel: [{ date: '2026-05-08', totalCost: 0, totalTokens: 1_000_000, 'vendor/new-cloud-model': 0, 'vendor/new-cloud-model_tokens': 1_000_000, 'vendor/new-cloud-model_costSource': 'fallback_estimate' }],
    byService: [{ name: 'vendor/new-cloud-model', cost: 0, tokens: 1_000_000, sessions: 1, costSource: 'fallback_estimate' }],
  });

  assert.equal(usage.byService[0].costSource, 'unknown');
  assert.equal(usage.byService[0].costStatus, 'unknown');
  assert.equal(usage.summary.periodUsd, 0);
})();

(function testFallbackRawCostsDoNotSmearOntoZeroTokenDays() {
  const usage = normalizeUsageCosts({
    summary: { periodUsd: 0.000896, periodTokens: 32 },
    daily: [
      { date: '2026-05-07', cost: 0.000448, totalCost: 0.000448, tokens: 0, totalTokens: 0 },
      { date: '2026-05-08', cost: 0.000448, totalCost: 0.000448, tokens: 32, totalTokens: 32 },
    ],
    dailyByModel: [
      { date: '2026-05-07', totalCost: 0.000448, totalTokens: 0, 'openai-codex/gpt-5.3-codex': 0.000448, 'openai-codex/gpt-5.3-codex_tokens': 0, 'openai-codex/gpt-5.3-codex_costSource': 'fallback_estimate' },
      { date: '2026-05-08', totalCost: 0.000448, totalTokens: 32, 'openai-codex/gpt-5.3-codex': 0.000448, 'openai-codex/gpt-5.3-codex_tokens': 32, 'openai-codex/gpt-5.3-codex_costSource': 'fallback_estimate' },
    ],
    byService: [{ name: 'openai-codex/gpt-5.3-codex', cost: 0.000448, tokens: 32, sessions: 4, costSource: 'fallback_estimate' }],
  });

  assert.equal(usage.dailyByModel[0]['openai-codex/gpt-5.3-codex'], 0);
  assert.equal(usage.daily[0].cost, 0);
  assert.equal(usage.dailyByModel[1]['openai-codex/gpt-5.3-codex'], 0.000448);
  assert.equal(usage.summary.periodUsd, 0.000448);
})();

(function testIncludedFallbackCostStatusIsNotSpend() {
  const usage = normalizeUsageCosts({
    summary: { periodUsd: 0.000448, periodTokens: 32 },
    daily: [{ date: '2026-05-08', cost: 0.000448, totalCost: 0.000448, tokens: 32, totalTokens: 32 }],
    dailyByModel: [{ date: '2026-05-08', totalCost: 0.000448, totalTokens: 32, 'openai-codex/gpt-5.3-codex': 0.000448, 'openai-codex/gpt-5.3-codex_tokens': 32, 'openai-codex/gpt-5.3-codex_costSource': 'fallback_estimate' }],
    byService: [{ name: 'openai-codex/gpt-5.3-codex', cost: 0.000448, tokens: 32, sessions: 4, costSource: 'fallback_estimate', costStatus: 'included' }],
  });

  assert.equal(usage.byService[0].cost, 0);
  assert.equal(usage.byService[0].costSource, 'included');
  assert.equal(usage.dailyByModel[0]['openai-codex/gpt-5.3-codex'], 0);
  assert.equal(usage.summary.periodUsd, 0);
})();

(function testDailyRowsDoNotBorrowFullPeriodTokens() {
  const usage = normalizeUsageCosts({
    summary: { periodUsd: 0, periodTokens: 2_000_000 },
    daily: [
      { date: '2026-05-07', cost: 0, totalCost: 0, tokens: 0, totalTokens: 0 },
      { date: '2026-05-08', cost: 0, totalCost: 0, tokens: 2_000_000, totalTokens: 2_000_000 },
    ],
    dailyByModel: [
      { date: '2026-05-07', totalCost: 0, totalTokens: 0, 'openai-codex/gpt-5.4-mini': 0, 'openai-codex/gpt-5.4-mini_tokens': 0, 'openai-codex/gpt-5.4-mini_costSource': 'fallback_estimate' },
      { date: '2026-05-08', totalCost: 0, totalTokens: 2_000_000, 'openai-codex/gpt-5.4-mini': 0, 'openai-codex/gpt-5.4-mini_tokens': 2_000_000, 'openai-codex/gpt-5.4-mini_costSource': 'fallback_estimate' },
    ],
    byService: [{ name: 'openai-codex/gpt-5.4-mini', cost: 0, tokens: 2_000_000, sessions: 1, costSource: 'fallback_estimate' }],
    agents: [{ key: 'openclaw', label: 'OpenClaw', summary: { periodUsd: 0, todayUsd: 123, thisWeekUsd: 123, totalUsd: 0 }, byService: [{ name: 'OpenClaw / openai-codex/gpt-5.4-mini', cost: 0, tokens: 2_000_000, sessions: 1, costSource: 'fallback_estimate' }] }],
  });

  assert.equal(usage.dailyByModel[0]['openai-codex/gpt-5.4-mini'], 0);
  assert.equal(usage.daily[0].cost, 0);
  assert.equal(usage.dailyByModel[1]['openai-codex/gpt-5.4-mini'], 9);
  assert.equal(usage.summary.periodUsd, 9);
  assert.equal(usage.agents[0].summary.periodUsd, 9);
  assert.equal(usage.agents[0].summary.todayUsd, 123);
})();

console.log('costSanity tests passed');
