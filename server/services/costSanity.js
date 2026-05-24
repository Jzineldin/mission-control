const FALLBACK_PRICING = {
  'openai-codex/gpt-5.4-mini': 4.5,
  'openai-codex/gpt-5.4': 15,
  'openai-codex/gpt-5.3-codex-spark': 14,
  'anthropic/claude-opus-4-6': 25,
  'anthropic/claude-sonnet-4-6': 15,
  'anthropic/claude-haiku': 5,
  'nvidia/llama-3.3-nemotron-super-49b-v1.5': 0.4,
  'nvidia/nemotron-3-super-120b-a12b': 0.5,
  'minimax/minimax-m2.7': 1.2,
  'minimax/minimax-m2.5': 1.25,
  'minimax/minimax-m2.1': 0.95,
  'minimax/minimax-m2': 1.0,
  'minimax/minimax-m2-her': 1.2,
  'xiaomi/mimo-v2-omni': 2.0,
  'xiaomi/mimo-v2-pro': 3.0,
  'xiaomi/mimo-v2-flash': 0.29,
};

const SUMMARY_COST_FIELDS = ['periodUsd', 'todayUsd', 'yesterdayUsd', 'thisWeekUsd', 'thisMonthUsd', 'totalUsd'];

function dayKey(date) {
  return date.toLocaleDateString('en-CA', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
}

function costSummaryFromDaily(daily = [], fallbackCost = 0) {
  const periodUsd = daily.length
    ? daily.reduce((sum, row) => sum + Number(row.cost || row.totalCost || 0), 0)
    : Number(fallbackCost || 0);
  const today = new Date();
  const todayKey = dayKey(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = dayKey(yesterday);
  const monthPrefix = todayKey.slice(0, 7);
  const thisWeekRows = daily.slice(-7);
  return {
    periodUsd,
    todayUsd: Number((daily.find((row) => row.date === todayKey) || {}).cost || 0),
    yesterdayUsd: Number((daily.find((row) => row.date === yesterdayKey) || {}).cost || 0),
    thisWeekUsd: thisWeekRows.reduce((sum, row) => sum + Number(row.cost || row.totalCost || 0), 0),
    thisMonthUsd: daily
      .filter((row) => String(row.date || '').startsWith(monthPrefix))
      .reduce((sum, row) => sum + Number(row.cost || row.totalCost || 0), 0),
    totalUsd: periodUsd,
  };
}

function modelKey(name) {
  return String(name || '').replace(/^(OpenClaw|Hermes) \/ /, '').toLowerCase();
}

function isLocalModel(name) {
  const lower = modelKey(name);
  return lower.includes('ollama/') || lower.includes('localhost') || lower.includes('lmstudio') || lower.includes('local/');
}

function isSubscriptionIncludedModel(name) {
  const lower = modelKey(name);
  return lower.includes('openai-codex/gpt-5.5') || lower.includes('gpt-5.5');
}

function lookupFallbackPricing(name) {
  if (!name || isLocalModel(name) || isSubscriptionIncludedModel(name)) return null;
  const lower = modelKey(name);
  for (const [key, rate] of Object.entries(FALLBACK_PRICING)) {
    if (lower.includes(key.toLowerCase())) return rate;
  }
  if (lower.includes('gpt-5.4-mini') || lower.includes('gpt-5.4-nano')) return FALLBACK_PRICING['openai-codex/gpt-5.4-mini'];
  if (lower.includes('gpt-5.4') && !lower.includes('mini')) return FALLBACK_PRICING['openai-codex/gpt-5.4'];
  if (lower.includes('gpt-5.3-codex') || lower.includes('gpt-5.3')) return FALLBACK_PRICING['openai-codex/gpt-5.3-codex-spark'];
  if (lower.includes('minimax-m2.7')) return FALLBACK_PRICING['minimax/minimax-m2.7'];
  if (lower.includes('minimax-m2.5')) return FALLBACK_PRICING['minimax/minimax-m2.5'];
  if (lower.includes('minimax-m2.1')) return FALLBACK_PRICING['minimax/minimax-m2.1'];
  if (lower.includes('minimax-m2-her')) return FALLBACK_PRICING['minimax/minimax-m2-her'];
  if (lower.includes('minimax-m2')) return FALLBACK_PRICING['minimax/minimax-m2'];
  return null;
}

function isImplausibleCloudCost({ name, tokens, cost }) {
  const tokenCount = Number(tokens || 0);
  const usd = Number(cost || 0);
  if (!Number.isFinite(tokenCount) || !Number.isFinite(usd)) return false;
  if (tokenCount < 100_000 || usd <= 0 || isLocalModel(name)) return false;
  const usdPerMillionTokens = usd / tokenCount * 1_000_000;
  return usdPerMillionTokens > 0 && usdPerMillionTokens < 0.01;
}

function displayCostLabel(item = {}) {
  const source = String(item.costSource || '').toLowerCase();
  const status = String(item.costStatus || '').toLowerCase();
  const mode = String(item.billingModes || '').toLowerCase();
  if (source.includes('included') || status.includes('included') || mode.includes('included')) return 'included';
  if (source.includes('unknown') || status.includes('unknown')) return 'unknown';
  if (source.includes('fallback')) return 'estimated';
  if (source.includes('api')) return 'metered';
  return 'unknown';
}

function isIncludedCost(item = {}) {
  const source = String(item.costSource || '').toLowerCase();
  const status = String(item.costStatus || '').toLowerCase();
  const mode = String(item.billingModes || '').toLowerCase();
  return source.includes('included') || status.includes('included') || mode.includes('included');
}

function isEstimatedCostSource(source) {
  const lower = String(source || '').toLowerCase();
  return lower.includes('fallback') || lower.includes('estimate');
}

function normalizeServiceCost(item = {}) {
  const out = { ...item };
  const tokens = Number(out.tokens || 0);
  const currentCost = Number(out.cost || 0);

  if (isIncludedCost(out) || isSubscriptionIncludedModel(out.name) || isImplausibleCloudCost({ name: out.name, tokens, cost: currentCost })) {
    out.cost = 0;
    out.costSource = 'included';
    out.costStatus = 'included';
    out.billingModes = 'subscription_included';
    out.costNote = 'Subscription-included or implausible micro-cost; not treated as billable spend';
    return out;
  }

  if ((currentCost === 0 || !Number.isFinite(currentCost)) && tokens > 0) {
    const rate = lookupFallbackPricing(out.name);
    if (rate !== null && rate > 0) {
      out.cost = tokens * rate / 1_000_000;
      out.costSource = 'fallback_estimate';
      out.costStatus = out.costStatus || 'estimated';
    } else if (isLocalModel(out.name)) {
      out.cost = 0;
      out.costSource = 'included';
      out.costStatus = 'included';
      out.billingModes = out.billingModes || 'local_included';
    } else {
      out.cost = 0;
      out.costSource = 'unknown';
      out.costStatus = 'unknown';
    }
  }

  return out;
}

function normalizeUsageCosts(usage) {
  if (!usage || typeof usage !== 'object') return usage;
  const normalized = { ...usage };
  const byService = (usage.byService || []).map(normalizeServiceCost);
  normalized.byService = byService;

  const costsByName = new Map(byService.map((item) => [String(item.name || ''), item]));
  normalized.dailyByModel = (usage.dailyByModel || []).map((row) => {
    const out = { ...row, totalCost: 0, totalTokens: Number(row.totalTokens || 0) };
    for (const svc of byService) {
      const key = String(svc.name || '');
      if (!key || !(key in out)) continue;
      // Daily model rows must only use the tokens recorded for that day. Falling back
      // to the service's full-period token count manufactures spend on idle days.
      const tokens = Number(out[`${key}_tokens`] || 0);
      const normalizedSvc = costsByName.get(key) || svc;
      const rowSource = out[`${key}_costSource`];
      const source = isIncludedCost(normalizedSvc) ? (normalizedSvc.costSource || 'included') : (rowSource || normalizedSvc.costSource || 'unknown');
      const rawCost = Number(out[key] || 0);
      let cost = rawCost;
      if (source === 'included' || source === 'unknown') {
        cost = 0;
      } else if (tokens <= 0 && isEstimatedCostSource(source)) {
        // Estimated/fallback daily spend is only valid when the same row has tokens.
        // Keeping a pre-filled period estimate on zero-token days smears one tiny
        // estimate across every day in the chart and inflates period totals.
        cost = 0;
      } else if ((rawCost === 0 || !Number.isFinite(rawCost)) && tokens > 0) {
        const rate = lookupFallbackPricing(key);
        cost = rate !== null && rate > 0 ? tokens * rate / 1_000_000 : 0;
      } else if (isImplausibleCloudCost({ name: key, tokens, cost: rawCost })) {
        cost = 0;
      }
      out[key] = cost;
      out[`${key}_costSource`] = source;
      out.totalCost += Number(cost || 0);
    }
    return out;
  });

  const dailyCostByDate = new Map((normalized.dailyByModel || []).map((row) => [row.date, Number(row.totalCost || 0)]));
  normalized.daily = (usage.daily || []).map((row) => {
    const cost = dailyCostByDate.has(row.date) ? dailyCostByDate.get(row.date) : Number(row.cost || row.totalCost || 0);
    return { ...row, cost, totalCost: cost };
  });

  const fallbackServiceCost = byService.reduce((sum, item) => sum + Number(item.cost || 0), 0);
  const costSummary = costSummaryFromDaily(normalized.daily || [], fallbackServiceCost);
  normalized.summary = { ...(usage.summary || {}) };
  SUMMARY_COST_FIELDS.forEach((field) => {
    if (field in normalized.summary) normalized.summary[field] = costSummary[field];
  });
  if ('periodUsd' in normalized.summary || byService.length) normalized.summary.periodUsd = costSummary.periodUsd;
  if ('totalUsd' in normalized.summary || byService.length) normalized.summary.totalUsd = costSummary.totalUsd;
  normalized.costReliability = byService.some((item) => item.costSource === 'unknown') ? 'partial_unknown' : 'normalized';

  if (Array.isArray(usage.agents)) {
    normalized.agents = usage.agents.map((agent) => {
      const agentOut = { ...agent, byService: (agent.byService || []).map(normalizeServiceCost) };
      const agentCost = agentOut.byService.reduce((sum, item) => sum + Number(item.cost || 0), 0);
      agentOut.summary = { ...(agent.summary || {}) };
      if ('periodUsd' in agentOut.summary || agentOut.byService.length) agentOut.summary.periodUsd = agentCost;
      if ('totalUsd' in agentOut.summary || agentOut.byService.length) agentOut.summary.totalUsd = agentCost;
      return agentOut;
    });
  }

  return normalized;
}

module.exports = {
  FALLBACK_PRICING,
  displayCostLabel,
  isImplausibleCloudCost,
  isLocalModel,
  isSubscriptionIncludedModel,
  lookupFallbackPricing,
  normalizeServiceCost,
  normalizeUsageCosts,
};
