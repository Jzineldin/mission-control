// Pure helper functions and constants for the Costs page.
// No hooks, no JSX — safe to import from any context.

import type { TokenServiceData, CodexBarDailyEntry, TokenData } from './types'

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const integerFormatter = new Intl.NumberFormat('en-US')
const compactNumberFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
})

export function formatCurrency(value: number) {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0)
}

export function formatPreciseCurrency(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0
  if (Math.abs(safeValue) > 0 && Math.abs(safeValue) < 0.01) return `$${safeValue.toFixed(6)}`
  return formatCurrency(safeValue)
}

export function formatTokens(value: number) {
  return integerFormatter.format(Math.round(Number.isFinite(value) ? value : 0))
}

export function formatCompactTokenValue(value: number) {
  const safeValue = Math.round(Number.isFinite(value) ? value : 0)
  return compactNumberFormatter.format(safeValue)
}

export function formatComparisonValue(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? 'No previous baseline'
    : formatCurrency(value)
}

export function formatSessionName(key: string, displayName?: string): string {
  if (key.includes('#')) {
    const channelName = key.split('#')[1]
    return `#${channelName}`
  }
  if (key === 'agent:main:main') return 'Main Session'
  if (key.includes(':subagent:')) return 'Sub-Agent'
  if (displayName) return displayName
  return key.split(':').pop()?.substring(0, 12) || 'Unknown'
}

export function formatSessionTimestamp(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// Color palettes
// ---------------------------------------------------------------------------

const DYNAMIC_COLORS = [
  '#FF9500', '#FF6B00', '#FFD60A', '#FF453A',
  '#BF5AF2', '#32D74B', '#007AFF', '#00C7BE',
  '#FF9F0A', '#64D2FF', '#30D158', '#FF375F',
]

export function hashColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return DYNAMIC_COLORS[Math.abs(hash) % DYNAMIC_COLORS.length]
}

export function getModelColor(model: string) {
  const lower = model.toLowerCase()
  if (lower.includes('gpt-5.4') && !lower.includes('mini')) return '#FF9500' // orange
  if (lower.includes('gpt-5.4-mini')) return '#FF6B00' // deep orange
  if (lower.includes('gpt-5.3')) return '#FFD60A' // yellow
  if (lower.includes('gpt-5') && !lower.includes('5.4') && !lower.includes('5.3')) return '#FF453A' // red-orange
  if (lower.includes('claude-sonnet') || lower.includes('sonnet')) return '#BF5AF2'
  if (lower.includes('claude-opus') || lower.includes('opus')) return '#FF453A'
  if (lower.includes('claude-haiku') || lower.includes('haiku')) return '#32D74B'
  if (lower.includes('ollama/')) return 'rgba(100, 210, 255, 0.68)'
  if (lower.includes('minimax')) return '#8E8E93'
  if (lower.includes('hunter-alpha') || lower.includes('openrouter')) return '#007AFF'
  return hashColor(model)
  return '#8E8E93'
}

export function getServiceColor(name: string) {
  const lowerName = name.toLowerCase()
  if (lowerName.includes('compute') || lowerName.includes('ec2') || lowerName.includes('lambda')) return '#007AFF'
  if (lowerName.includes('claude') || lowerName.includes('ai') || lowerName.includes('bedrock')) return '#BF5AF2'
  if (lowerName.includes('s3') || lowerName.includes('storage')) return '#32D74B'
  return '#8E8E93'
}

// ---------------------------------------------------------------------------
// Model name utilities
// ---------------------------------------------------------------------------

export function canonicalModelName(model: string) {
  const lower = model.toLowerCase()

  if (lower.includes('gpt-5.4-mini')) return 'GPT-5.4 Mini'
  if (lower.includes('gpt-5.4-nano')) return 'GPT-5.4 Nano'
  if (lower.includes('gpt-5.4')) return 'GPT-5.4'
  if (lower.includes('gpt-5.3-codex-spark')) return 'GPT-5.3 Codex Spark'
  if (lower.includes('gpt-5.3')) return 'GPT-5.3'
  if (lower.includes('claude-sonnet-4-6') || lower.includes('sonnet-4-6')) return 'Claude Sonnet 4.6'
  if (lower.includes('claude-sonnet') || lower.includes('sonnet')) return 'Claude Sonnet'
  if (lower.includes('claude-opus') || lower.includes('opus')) return 'Claude Opus'
  if (lower.includes('claude-haiku') || lower.includes('haiku')) return 'Claude Haiku'
  if (lower.includes('ollama/')) {
    return model
      .split('/')
      .pop()
      ?.split(':')[0]
      ?.replace(/[-_]/g, ' ')
      .replace(/\b\w/g, x => x.toUpperCase()) || 'Ollama Local'
  }
  if (lower.includes('openrouter/')) {
    return model
      .split('/')
      .slice(-1)[0]
      ?.split(':')[0]
      ?.replace(/[-_]/g, ' ')
      .replace(/\b\w/g, x => x.toUpperCase()) || 'OpenRouter'
  }

  return model || 'Unknown'
}

export function isLocalModel(model: string) {
  const lower = model.toLowerCase()
  return lower.includes('ollama/') || lower.includes('lmstudio') || lower.includes('localhost') || lower.includes('local/')
}

export function toChartKey(index: number) {
  return `model_${index}`
}

// ---------------------------------------------------------------------------
// Pricing / cost estimation
// ---------------------------------------------------------------------------

// Pricing per 1M output tokens
// Source: OpenRouter public API (https://openrouter.ai/api/v1/models, 2026-04)
// These are the actual OpenRouter provider prices, not retail.
const MODEL_PRICING: Record<string, number> = {
  // OpenAI Codex (direct, not OpenRouter)
  'gpt-5.4': 15,
  'gpt-5.4-mini': 4.5,
  'gpt-5.3-codex-spark': 14,
  'gpt-5.3': 14,
  // Anthropic (OpenRouter)
  'claude-opus-4-6': 25,
  'claude-opus': 25,
  'claude-sonnet-4-6': 15,
  'claude-sonnet': 15,
  'claude-haiku': 5,
  // NVIDIA OpenRouter
  'nemotron-super-49b-v1.5': 0.4,
  'nemotron-3-super-120b-a12b': 0.5,
  'nemotron-free': 0,
  // MiniMax OpenRouter (provider=minimax)
  'minimax-m2.7': 1.2,
  'minimax-m2.5': 1.25,
  'minimax-m2.1': 0.95,
  'minimax-m2': 1.0,
  'minimax-m2-her': 1.2,
  // Xiaomi OpenRouter
  'mimo-v2-omni': 2.0,
  'mimo-v2-pro': 3.0,
  'mimo-v2-flash': 0.29,
  // OpenRouter Mancer
  'weaver': 10,
  // Qwen free
  'qwen3-free': 0,
  'qwen3.6-free': 0,
  // __default for unknown cloud models
  '__default': 5,
}

export function estimateCost(tokens: number, model?: string): number {
  if (model && isLocalModel(model)) return 0
  if (!model) return 0

  const modelLower = model.toLowerCase()

  // Local Ollama detection
  if (modelLower.includes('ollama/') || modelLower.includes('localhost')) return 0

  // MiniMax via OpenRouter
  if (modelLower.includes('minimax-m2.7')) return (tokens / 1_000_000) * MODEL_PRICING['minimax-m2.7']
  if (modelLower.includes('minimax-m2.5')) return (tokens / 1_000_000) * MODEL_PRICING['minimax-m2.5']
  if (modelLower.includes('minimax-m2.1')) return (tokens / 1_000_000) * MODEL_PRICING['minimax-m2.1']
  if (modelLower.includes('minimax-m2-her')) return (tokens / 1_000_000) * MODEL_PRICING['minimax-m2-her']
  if (modelLower.includes('minimax-m2')) return (tokens / 1_000_000) * MODEL_PRICING['minimax-m2']

  // NVIDIA OpenRouter
  if (modelLower.includes('nemotron-super-49b') || modelLower.includes('llama-3.3-nemotron')) return (tokens / 1_000_000) * MODEL_PRICING['nemotron-super-49b-v1.5']
  if (modelLower.includes('nemotron')) return (tokens / 1_000_000) * MODEL_PRICING['nemotron-3-super-120b-a12b']

  // OpenAI Codex (direct)
  if (modelLower.includes('gpt-5.4-mini') || modelLower.includes('gpt-5.4-nano')) return (tokens / 1_000_000) * MODEL_PRICING['gpt-5.4-mini']
  if (modelLower.includes('gpt-5.4')) return (tokens / 1_000_000) * MODEL_PRICING['gpt-5.4']
  if (modelLower.includes('gpt-5.3-codex') || modelLower.includes('gpt-5.3')) return (tokens / 1_000_000) * MODEL_PRICING['gpt-5.3-codex-spark']

  // Anthropic
  if (modelLower.includes('opus-4.6') || (modelLower.includes('opus') && modelLower.includes('4'))) return (tokens / 1_000_000) * MODEL_PRICING['claude-opus-4-6']
  if (modelLower.includes('sonnet-4.6') || (modelLower.includes('sonnet') && modelLower.includes('4'))) return (tokens / 1_000_000) * MODEL_PRICING['claude-sonnet-4-6']
  if (modelLower.includes('haiku')) return (tokens / 1_000_000) * MODEL_PRICING['claude-haiku']

  // Xiaomi OpenRouter
  if (modelLower.includes('mimo-v2-omni')) return (tokens / 1_000_000) * MODEL_PRICING['mimo-v2-omni']
  if (modelLower.includes('mimo-v2-pro')) return (tokens / 1_000_000) * MODEL_PRICING['mimo-v2-pro']
  if (modelLower.includes('mimo')) return (tokens / 1_000_000) * MODEL_PRICING['mimo-v2-flash']

  // OpenRouter Mancer
  if (modelLower.includes('weaver') || modelLower.includes('mancer')) return (tokens / 1_000_000) * MODEL_PRICING['weaver']

  // OpenRouter/other cloud models → fallback
  if (modelLower.includes('openrouter')) return (tokens / 1_000_000) * MODEL_PRICING['__default']

  return 0
}

// ---------------------------------------------------------------------------
// Trend / comparison helpers
// ---------------------------------------------------------------------------

export function calculateTrend(current: number, previous: number | null | undefined) {
  if (previous === null || previous === undefined || !Number.isFinite(previous)) return null
  if (!previous && !current) return null
  if (!previous || Math.abs(previous) < 0.01) {
    return current > 0
      ? { direction: 'up' as const, percentage: null, label: 'New baseline' }
      : null
  }
  const percentage = ((current - previous) / previous) * 100
  const absPercentage = Math.abs(percentage)
  const label = absPercentage > 999 ? `${(current / previous).toFixed(1)}×` : undefined
  return {
    direction: percentage >= 0 ? ('up' as const) : ('down' as const),
    percentage: absPercentage,
    label,
  }
}

export function costReliabilityLabel(item?: Pick<TokenServiceData, 'costSource' | 'costStatus' | 'billingModes'>) {
  const source = String(item?.costSource || '').toLowerCase()
  const status = String(item?.costStatus || '').toLowerCase()
  const modes = String(item?.billingModes || '').toLowerCase()
  if (source.includes('included') || status.includes('included') || modes.includes('included')) return 'Included'
  if (source.includes('unknown') || status.includes('unknown')) return 'Unknown cost'
  if (source.includes('fallback')) return 'Estimated'
  if (source.includes('api')) return 'Metered'
  return 'Unknown cost'
}

export function formatAgentCostValue(cost: number, sourceLabel: string) {
  if (cost === 0 && (sourceLabel === 'Included' || sourceLabel === 'Unknown cost')) return sourceLabel
  return formatPreciseCurrency(cost)
}

// ---------------------------------------------------------------------------
// CodexBar period helpers
// ---------------------------------------------------------------------------

export function sumCostRows(rows: Array<{ totalCost?: number; cost?: number }> = []) {
  return rows.reduce((sum, row) => sum + Number(row.totalCost ?? row.cost ?? 0), 0)
}

export function previousCodexbarRows(days: CodexBarDailyEntry[] = [], period: 'day' | '7d' | 'month') {
  if (period === 'day') return days.slice(-2, -1)
  if (period === '7d') return days.slice(-14, -7)
  return days.slice(-60, -30)
}

export function comparisonLabels(period: 'day' | '7d' | 'month') {
  if (period === 'day') return { period: 'vs previous day', daily: 'vs previous day' }
  if (period === '7d') return { period: 'vs previous 7 days', daily: 'vs previous 7d avg' }
  return { period: 'vs previous 30 days', daily: 'vs previous 30d avg' }
}

// ---------------------------------------------------------------------------
// Misc field helpers
// ---------------------------------------------------------------------------

export function readNumericField(row: Record<string, unknown>, key: string) {
  const value = row[key]
  const numberValue = Number(value || 0)
  return Number.isFinite(numberValue) ? numberValue : 0
}

export function hasUsableAgentSplitData(data?: Pick<TokenData, 'agents' | 'period'> | null) {
  return !!data?.agents?.some(agent => {
    const summaryTokens = Number(agent.summary?.periodTokens ?? agent.summary?.thisMonthTokens ?? agent.summary?.totalTokens ?? 0)
    const summaryCost = Number(agent.summary?.periodUsd ?? agent.summary?.thisMonthUsd ?? agent.summary?.totalUsd ?? 0)
    const serviceUsage = (agent.byService || []).some(service => Number(service.tokens || 0) > 0 || Number(service.cost || 0) > 0)
    return summaryTokens > 0 || summaryCost > 0 || serviceUsage
  })
}
