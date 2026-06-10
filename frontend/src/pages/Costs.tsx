import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  AlertCircle,
  Calendar,
  Cloud,
  Cpu,
  DollarSign,
  Loader2,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import PageTransition from '../components/PageTransition'
import GlassCard from '../components/GlassCard'
import AnimatedCounter from '../components/AnimatedCounter'
import { useIsMobile } from '../lib/useIsMobile'

interface AWSSCostData {
  period: { start: string; end: string }
  total: number
  daily: Array<{ date: string; cost: number }>
  services: Array<{ name: string; cost: number }>
  credits: number
  remaining: number
}

interface TokenDailyEntry {
  date: string
  cost?: number
  tokens?: number
}

interface ModelDailyEntry {
  date: string
  totalCost?: number
  totalTokens?: number
  models?: Record<string, { cost?: number; tokens?: number }>
  [key: string]: unknown
}

interface TokenServiceData {
  name: string
  cost?: number
  tokens?: number
  percentage?: number
  costSource?: string
  costStatus?: string
  billingModes?: string
  costNote?: string
}

interface AgentUsageData {
  key: 'openclaw' | 'hermes' | string
  label: string
  accent?: string
  source?: string
  status?: 'ready' | 'refreshing' | 'unavailable' | string
  summary: {
    periodUsd?: number
    periodTokens?: number
    todayUsd?: number
    todayTokens?: number
    thisWeekUsd?: number
    thisWeekTokens?: number
    thisMonthUsd?: number
    thisMonthTokens?: number
    totalUsd?: number
    totalTokens?: number
  }
  byService?: TokenServiceData[]
}

interface TokenData {
  source?: string
  period?: { key?: 'day' | '7d' | 'month'; start?: string; end?: string }
  daily: TokenDailyEntry[]
  dailyByModel?: ModelDailyEntry[]
  modelKeys?: string[]
  agents?: AgentUsageData[]
  summary: {
    periodUsd?: number
    previousPeriodUsd?: number
    periodTokens?: number
    todayUsd?: number
    yesterdayUsd?: number
    thisWeekUsd?: number
    thisMonthUsd?: number
    totalUsd?: number
    todayTokens?: number
    thisWeekTokens?: number
    thisMonthTokens?: number
    totalTokens?: number
    note?: string
    budget?: { monthly: number; warning?: number }
  }
  byService: TokenServiceData[]
  budget?: { monthly: number }
  meta?: {
    updatedAt?: string
    refreshing?: boolean
    stale?: boolean
    ageMs?: number
    openclawStatus?: 'ready' | 'refreshing' | 'unavailable' | string
    hermesStatus?: 'ready' | 'refreshing' | 'unavailable' | string
  }
}

interface CodexBarDailyEntry {
  date: string
  totalCost: number
  totalTokens: number
  inputTokens: number
  outputTokens: number
  models: Array<{ model: string; cost: number; totalTokens: number }>
}

interface CodexBarCostData {
  source: string
  provider: string
  updatedAt: string | null
  last30DaysCostUSD: number
  last30DaysTokens: number
  sessionCostUSD: number
  sessionTokens: number
  totals: {
    totalCost: number
    totalTokens: number
    inputTokens: number
    outputTokens: number
  }
  daily: CodexBarDailyEntry[]
}

interface SessionData {
  key: string
  model: string
  totalTokens: number
  updatedAt: string | null
  displayName?: string
}

interface ConfigData {
  modules: {
    aws?: boolean
    [key: string]: boolean | undefined
  }
}

interface ChartSeriesItem {
  model: string
  key: string
  color: string
  totalCost: number
  totalTokens: number
  rawModels?: string[]
}

interface ChartDataRow {
  day: string
  fullDate: string
  total: number
  totalTokens: number
  [key: string]: string | number
}

interface AggregatedBreakdownItem {
  name: string
  rawNames: string[]
  tokens: number
  cost: number
  share: number
  local: boolean
  color: string
}

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

function formatCurrency(value: number) {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0)
}

function formatPreciseCurrency(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0
  if (Math.abs(safeValue) > 0 && Math.abs(safeValue) < 0.01) return `$${safeValue.toFixed(6)}`
  return formatCurrency(safeValue)
}

function costReliabilityLabel(item?: Pick<TokenServiceData, 'costSource' | 'costStatus' | 'billingModes'>) {
  const source = String(item?.costSource || '').toLowerCase()
  const status = String(item?.costStatus || '').toLowerCase()
  const modes = String(item?.billingModes || '').toLowerCase()
  if (source.includes('included') || status.includes('included') || modes.includes('included')) return 'Included'
  if (source.includes('unknown') || status.includes('unknown')) return 'Unknown cost'
  if (source.includes('fallback')) return 'Estimated'
  if (source.includes('api')) return 'Metered'
  return 'Unknown cost'
}

function formatAgentCostValue(cost: number, sourceLabel: string) {
  if (cost === 0 && (sourceLabel === 'Included' || sourceLabel === 'Unknown cost')) return sourceLabel
  return formatPreciseCurrency(cost)
}

function formatTokens(value: number) {
  return integerFormatter.format(Math.round(Number.isFinite(value) ? value : 0))
}

function formatCompactTokenValue(value: number) {
  const safeValue = Math.round(Number.isFinite(value) ? value : 0)
  return compactNumberFormatter.format(safeValue)
}

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

function estimateCost(tokens: number, model?: string): number {
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

function formatSessionName(key: string, displayName?: string): string {
  if (key.includes('#')) {
    const channelName = key.split('#')[1]
    return `#${channelName}`
  }
  if (key === 'agent:main:main') return 'Main Session'
  if (key.includes(':subagent:')) return 'Sub-Agent'
  if (displayName) return displayName
  return key.split(':').pop()?.substring(0, 12) || 'Unknown'
}

function formatSessionTimestamp(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const DYNAMIC_COLORS = [
  '#FF9500', '#FF6B00', '#FFD60A', '#FF453A',
  '#BF5AF2', '#32D74B', '#007AFF', '#00C7BE',
  '#FF9F0A', '#64D2FF', '#30D158', '#FF375F',
]

function hashColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return DYNAMIC_COLORS[Math.abs(hash) % DYNAMIC_COLORS.length]
}

function getModelColor(model: string) {
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

function canonicalModelName(model: string) {
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

function isLocalModel(model: string) {
  const lower = model.toLowerCase()
  return lower.includes('ollama/') || lower.includes('lmstudio') || lower.includes('localhost') || lower.includes('local/')
}

function toChartKey(index: number) {
  return `model_${index}`
}

function getServiceColor(name: string) {
  const lowerName = name.toLowerCase()
  if (lowerName.includes('compute') || lowerName.includes('ec2') || lowerName.includes('lambda')) return '#007AFF'
  if (lowerName.includes('claude') || lowerName.includes('ai') || lowerName.includes('bedrock')) return '#BF5AF2'
  if (lowerName.includes('s3') || lowerName.includes('storage')) return '#32D74B'
  return '#8E8E93'
}

function calculateTrend(current: number, previous: number | null | undefined) {
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

function sumCostRows(rows: Array<{ totalCost?: number; cost?: number }> = []) {
  return rows.reduce((sum, row) => sum + Number(row.totalCost ?? row.cost ?? 0), 0)
}

function previousCodexbarRows(days: CodexBarDailyEntry[] = [], period: 'day' | '7d' | 'month') {
  if (period === 'day') return days.slice(-2, -1)
  if (period === '7d') return days.slice(-14, -7)
  return days.slice(-60, -30)
}

function comparisonLabels(period: 'day' | '7d' | 'month') {
  if (period === 'day') return { period: 'vs previous day', daily: 'vs previous day' }
  if (period === '7d') return { period: 'vs previous 7 days', daily: 'vs previous 7d avg' }
  return { period: 'vs previous 30 days', daily: 'vs previous 30d avg' }
}

function formatComparisonValue(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? 'No previous baseline'
    : formatCurrency(value)
}

function TrendBadge({ trend }: { trend: ReturnType<typeof calculateTrend> }) {
  if (!trend) return null

  const positiveIsBad = trend.direction === 'up'
  const Icon = trend.direction === 'up' ? TrendingUp : TrendingDown
  const color = positiveIsBad ? '#FF453A' : '#32D74B'
  const bg = positiveIsBad ? 'rgba(255,69,58,0.14)' : 'rgba(50,215,75,0.14)'

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        borderRadius: 999,
        background: bg,
        color,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      <Icon size={12} />
      {trend.label || `${trend.percentage!.toFixed(trend.percentage! >= 100 ? 0 : 1)}%`}
    </div>
  )
}

interface ChartTooltipPayloadItem {
  value?: string | number
  name?: string
  dataKey?: string | number
  color?: string
  payload?: Record<string, string | number | undefined>
}

function readNumericField(row: Record<string, unknown>, key: string) {
  const value = row[key]
  const numberValue = Number(value || 0)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function hasUsableAgentSplitData(data?: Pick<TokenData, 'agents' | 'period'> | null) {
  return !!data?.agents?.some(agent => {
    const summaryTokens = Number(agent.summary?.periodTokens ?? agent.summary?.thisMonthTokens ?? agent.summary?.totalTokens ?? 0)
    const summaryCost = Number(agent.summary?.periodUsd ?? agent.summary?.thisMonthUsd ?? agent.summary?.totalUsd ?? 0)
    const serviceUsage = (agent.byService || []).some(service => Number(service.tokens || 0) > 0 || Number(service.cost || 0) > 0)
    return summaryTokens > 0 || summaryCost > 0 || serviceUsage
  })
}

function CustomChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: ChartTooltipPayloadItem[]
  label?: string
}) {
  if (!active || !payload?.length) return null

  const rows = payload
    .filter((entry) => Number(entry.value || 0) > 0)
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))

  if (!rows.length) return null

  const data = payload[0]?.payload || {}

  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 12,
        background: 'rgba(22,22,24,0.96)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
        minWidth: 220,
      }}
    >
      <div style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 10 }}>
        Total: {formatCurrency(Number(data.total || 0))} · Tokens: {formatTokens(Number(data.totalTokens || 0))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {rows.map((entry) => {
          const dataKey = String(entry.dataKey || '')
          const model = String(entry.name || dataKey)
          const tokenKey = `${dataKey}__tokens`
          const tokens = Number(data[tokenKey] || 0)
          const local = isLocalModel(model)
          return (
            <div key={dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: entry.color || '#8E8E93',
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: 'rgba(255,255,255,0.78)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {canonicalModelName(model)}
                </span>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.96)', fontSize: 11, fontWeight: 600, textAlign: 'right' }}>
                {local ? `${formatTokens(tokens)} tok` : `${formatCurrency(Number(entry.value || 0))} · ${formatTokens(tokens)} tok`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function buildDaySegments(day: ChartDataRow, chartSeries: ChartSeriesItem[]) {
  return chartSeries
    .map(series => ({
      key: series.key,
      label: series.model,
      value: Number(day[series.key] || 0),
      tokens: Number(day[`${series.key}__tokens`] || 0),
      color: series.color,
      local: isLocalModel(series.model),
    }))
    .filter(segment => segment.value > 0 || segment.tokens > 0)
}

function SessionEstimateChart({
  data,
  activeDate,
  onSelect,
}: {
  data: Array<{
    day: string
    fullDate: string
    estimatedCost: number
    tokens: number
    intensity: number
  }>
  activeDate: string | null
  onSelect: (date: string) => void
}) {
  const activeDay = data.find(day => day.fullDate === activeDate) || data[data.length - 1] || null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))`,
          gap: 10,
          alignItems: 'end',
          minHeight: 248,
        }}
      >
        {data.map(day => {
          const isActive = day.fullDate === activeDay?.fullDate
          const height = Math.max(day.intensity * 168, day.tokens > 0 ? 18 : 12)

          return (
            <button
              key={day.fullDate}
              type="button"
              onClick={() => onSelect(day.fullDate)}
              aria-pressed={isActive}
              style={{
                border: isActive ? '1px solid rgba(94,92,230,0.55)' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: 18,
                background: isActive
                  ? 'linear-gradient(180deg, rgba(94,92,230,0.22) 0%, rgba(20,24,38,0.86) 100%)'
                  : 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(12,14,22,0.7) 100%)',
                padding: '12px 6px 10px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: 10,
                boxShadow: isActive ? '0 18px 44px rgba(94,92,230,0.24)' : 'none',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.92)', fontWeight: 700 }}>
                {day.estimatedCost > 0 ? formatCurrency(day.estimatedCost) : 'idle'}
              </div>

              <div
                style={{
                  width: '100%',
                  maxWidth: 30,
                  height,
                  minHeight: 12,
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.05)',
                  display: 'flex',
                  alignItems: 'flex-end',
                  overflow: 'hidden',
                  padding: 3,
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: 999,
                    background: day.tokens > 0
                      ? 'linear-gradient(180deg, rgba(94,92,230,0.95) 0%, rgba(191,90,242,0.92) 52%, rgba(255,149,0,0.92) 100%)'
                      : 'rgba(255,255,255,0.12)',
                    opacity: day.tokens > 0 ? 1 : 0.4,
                  }}
                />
              </div>

              <span style={{ fontSize: 10, color: isActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)', fontWeight: isActive ? 700 : 500 }}>
                {day.day}
              </span>
            </button>
          )
        })}
      </div>

      {activeDay && (
        <div
          style={{
            padding: 16,
            borderRadius: 16,
            background: 'linear-gradient(135deg, rgba(94,92,230,0.14) 0%, rgba(255,149,0,0.08) 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Date</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.92)', fontWeight: 700, marginTop: 6 }}>{activeDay.fullDate}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Estimated Spend</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.92)', fontWeight: 700, marginTop: 6 }}>{formatCurrency(activeDay.estimatedCost)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tokens</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.92)', fontWeight: 700, marginTop: 6 }}>{formatTokens(activeDay.tokens)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function MobileDailySpendChart({
  chartData,
  chartSeries,
  activeDate,
  onSelect,
}: {
  chartData: ChartDataRow[]
  chartSeries: ChartSeriesItem[]
  activeDate: string | null
  onSelect: (date: string) => void
}) {
  const maxTotal = Math.max(...chartData.map(day => Number(day.total || 0)), 1)
  const activeDay = chartData.find(day => day.fullDate === activeDate) || chartData[chartData.length - 1] || null
  const activeSegments = activeDay ? buildDaySegments(activeDay, chartSeries) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
        Mobile uses a touch-first stacked view to avoid Safari/Recharts blank bars.
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${chartData.length}, minmax(0, 1fr))`,
          gap: 8,
          alignItems: 'end',
          height: 244,
          padding: '12px 0 4px',
        }}
      >
        {chartData.map(day => {
          const total = Number(day.total || 0)
          const segments = buildDaySegments(day, chartSeries)
          const isActive = day.fullDate === activeDay?.fullDate
          const columnHeight = total > 0 ? Math.max((total / maxTotal) * 168, 18) : 14

          return (
            <button
              key={day.fullDate}
              type="button"
              onClick={() => onSelect(day.fullDate)}
              aria-pressed={isActive}
              aria-label={`Select ${day.fullDate} daily spend`}
              style={{
                border: isActive ? '1px solid rgba(10,132,255,0.5)' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: 14,
                background: isActive ? 'rgba(10,132,255,0.14)' : 'rgba(255,255,255,0.03)',
                padding: '10px 4px 8px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: 8,
                minHeight: 0,
                WebkitTapHighlightColor: 'transparent',
                boxShadow: isActive ? '0 10px 28px rgba(10,132,255,0.18)' : 'none',
              }}
            >
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.92)', fontWeight: 700 }}>
                {formatCurrency(total)}
              </span>
              <div
                style={{
                  width: '100%',
                  maxWidth: 30,
                  height: columnHeight,
                  minHeight: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  borderRadius: 10,
                  overflow: 'hidden',
                  background: 'rgba(255,255,255,0.05)',
                }}
              >
                {segments.length > 0 ? (
                  segments.map(segment => {
                    const style: CSSProperties = {
                      height: `${Math.max((segment.value / total) * 100, 14)}%`,
                      background: segment.color,
                      minHeight: 8,
                    }
                    return <div key={segment.key} style={style} />
                  })
                ) : (
                  <div style={{ height: '100%', background: 'rgba(255,255,255,0.08)' }} />
                )}
              </div>
              <span style={{ fontSize: 10, color: isActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)', fontWeight: isActive ? 700 : 500 }}>
                {String(day.day)}
              </span>
            </button>
          )
        })}
      </div>

      {activeDay && (
        <div
          style={{
            padding: '14px',
            borderRadius: 14,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: 700 }}>{activeDay.fullDate}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>Tap another bar to inspect that day.</div>
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.95)', fontWeight: 700 }}>{formatCurrency(Number(activeDay.total || 0))}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeSegments.map(segment => (
              <div key={segment.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: segment.color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.76)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {segment.label}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.95)', fontWeight: 600, textAlign: 'right' }}>
                  {segment.local ? `${formatCurrency(0)} · ${formatTokens(segment.tokens)} tokens` : formatCurrency(segment.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {chartSeries.map(series => (
          <div
            key={series.key}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 999, background: series.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)' }}>{series.model}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Costs() {
  const m = useIsMobile()
  const [period, setPeriod] = useState<'day' | '7d' | 'month'>('month')
  const [awsCosts, setAwsCosts] = useState<AWSSCostData | null>(null)
  const [tokenData, setTokenData] = useState<TokenData | null>(null)
  const [codexbarCosts, setCodexbarCosts] = useState<CodexBarCostData | null>(null)
  const [config, setConfig] = useState<ConfigData | null>(null)
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [budget, setBudget] = useState<number>(0)
  const [budgetInput, setBudgetInput] = useState<string>('')
  const [savingBudget, setSavingBudget] = useState(false)
  const [activeChartDate, setActiveChartDate] = useState<string | null>(null)
  const [driverView, setDriverView] = useState<'models' | 'sessions' | 'codexbar' | 'notes'>('models')
  const [fallbackSessionTimestamp] = useState(() => Date.now() / 1000)

  const labels = {
    thisMonth: m ? 'Month' : 'This Month',
    creditsLeft: m ? 'Credits' : 'Credits Left',
    dailyAvg: m ? 'Daily Avg' : 'Daily Average',
    projected: m ? 'Projected' : 'Projected Monthly',
  }

  useEffect(() => {
    let cancelled = false
    const retryTimers: number[] = []

    const loadCosts = (attempt = 0) => {
      fetch(`/api/costs?period=${period}`)
        .then(r => r.json())
        .then(tokens => {
          if (cancelled) return
          setTokenData(tokens)
          setBudget(tokens?.budget?.monthly || 0)
          setBudgetInput((tokens?.budget?.monthly || 0).toString())
          setLoading(false)

          const needsDetailedRetry = (
            (
              tokens?.source === 'sessions.fast_fallback'
              || tokens?.meta?.refreshing
              || tokens?.meta?.stale
            )
            && attempt < 60
          )
          if (needsDetailedRetry) {
            const timer = window.setTimeout(() => loadCosts(attempt + 1), 2500)
            retryTimers.push(timer)
          }
        })
        .catch(err => {
          if (cancelled) return
          setError(err.message)
          setLoading(false)
        })
    }

    Promise.all([
      fetch('/api/aws/costs').then(r => r.json()).catch(() => null),
      fetch('/api/config').then(r => r.json()).catch(() => ({ modules: {} })),
      fetch('/api/sessions').then(r => r.json()).catch(() => ({ sessions: [] })),
      fetch('/api/costs/codexbar').then(r => r.json()).catch(() => null),
    ])
      .then(([aws, configData, sessionsData, codexbar]) => {
        if (cancelled) return
        setAwsCosts(aws)
        setCodexbarCosts(codexbar && !codexbar.error ? codexbar : null)
        setConfig(configData)
        setSessions(sessionsData.sessions || [])
      })
      .catch(() => null)

    loadCosts()

    return () => {
      cancelled = true
      retryTimers.forEach(timer => window.clearTimeout(timer))
    }
  }, [period])

  const saveBudget = async () => {
    if (!budgetInput.trim()) return
    setSavingBudget(true)
    try {
      const response = await fetch('/api/settings/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthly: parseFloat(budgetInput) || 0 }),
      })
      if (response.ok) {
        setBudget(parseFloat(budgetInput) || 0)
      }
    } catch (err) {
      console.error('Failed to save budget:', err)
    }
    setSavingBudget(false)
  }

  const ledgerActive = !!(tokenData && ['token-usage.csv', 'openclaw.usage', 'combined.agent_usage'].includes(tokenData.source || '') && tokenData.summary)
  const codexbarActive = !!(codexbarCosts && codexbarCosts.last30DaysCostUSD > 0)
  const codexbarLatest = codexbarCosts?.daily?.[codexbarCosts.daily.length - 1] || null
  const codexbarPeriodDays = useMemo(() => {
    if (!codexbarActive) return []
    if (period === 'day') return codexbarCosts?.daily?.slice(-1) || []
    if (period === '7d') return codexbarCosts?.daily?.slice(-7) || []
    return codexbarCosts?.daily?.slice(-30) || []
  }, [codexbarActive, codexbarCosts?.daily, period])

  const chartSeries = useMemo<ChartSeriesItem[]>(() => {
    const totals = new Map<string, { totalCost: number; totalTokens: number }>()

    if (codexbarActive && codexbarPeriodDays.length) {
      codexbarPeriodDays.forEach(day => {
        ;(day.models || []).forEach(model => {
          const name = model.model || 'Unknown model'
          const current = totals.get(name) || { totalCost: 0, totalTokens: 0 }
          current.totalCost += Number(model.cost || 0)
          current.totalTokens += Number(model.totalTokens || 0)
          totals.set(name, current)
        })
      })
    } else if (ledgerActive && tokenData?.dailyByModel?.length) {
      tokenData.dailyByModel.forEach(day => {
        Object.entries(day).forEach(([key, value]) => {
          if (key === 'date' || key === 'models' || key === 'totalCost' || key === 'totalTokens' || key.endsWith('_tokens') || key.endsWith('_costSource')) return
          const cost = Number(value || 0)
          const tokens = readNumericField(day, `${key}_tokens`)
          const current = totals.get(key) || { totalCost: 0, totalTokens: 0 }
          current.totalCost += Number.isFinite(cost) ? cost : 0
          current.totalTokens += Number.isFinite(tokens) ? tokens : 0
          totals.set(key, current)
        })
      })
    } else {
      return []
    }

    const sorted = Array.from(totals.entries())
      .map(([model, values], index) => ({
        model,
        key: toChartKey(index),
        color: getModelColor(model),
        totalCost: values.totalCost,
        totalTokens: values.totalTokens,
      }))
      .filter(item => item.totalCost > 0 || item.totalTokens > 0)
      .sort((a, b) => b.totalCost - a.totalCost || b.totalTokens - a.totalTokens)

    const visible = sorted.length > 6 ? sorted.slice(0, 5) : sorted
    const omitted = sorted.length > 6 ? sorted.slice(5) : []
    const withOther = omitted.length
      ? [
          ...visible,
          {
            model: 'Other models',
            key: toChartKey(visible.length),
            color: '#8E8E93',
            totalCost: omitted.reduce((sum, item) => sum + item.totalCost, 0),
            totalTokens: omitted.reduce((sum, item) => sum + item.totalTokens, 0),
            rawModels: omitted.map(item => item.model),
          },
        ]
      : visible

    return withOther.map((item, index) => ({ ...item, key: toChartKey(index) }))
  }, [codexbarActive, codexbarPeriodDays, ledgerActive, tokenData])

  const chartData = useMemo<ChartDataRow[]>(() => {
    if (!chartSeries.length) return []

    if (codexbarActive && codexbarPeriodDays.length) {
      return codexbarPeriodDays.map(day => {
        const row: Record<string, string | number> = {
          day: new Date(day.date).toLocaleDateString('en-US', { day: 'numeric' }),
          fullDate: day.date,
          total: Number(day.totalCost || 0),
          totalTokens: Number(day.totalTokens || 0),
        }

        chartSeries.forEach(series => {
          const modelNames = series.rawModels?.length ? series.rawModels : [series.model]
          const matchingModels = (day.models || []).filter(model => modelNames.includes(model.model))
          const value = matchingModels.reduce((sum, model) => sum + Number(model.cost || 0), 0)
          const tokens = matchingModels.reduce((sum, model) => sum + Number(model.totalTokens || 0), 0)
          row[series.key] = value
          row[`${series.key}__tokens`] = tokens
        })

        return row as ChartDataRow
      })
    }

    if (!ledgerActive || !tokenData?.dailyByModel?.length) return []

    const rows = tokenData.dailyByModel.map(day => {
      const row: Record<string, string | number> = {
        day: new Date(day.date).toLocaleDateString('en-US', { day: 'numeric' }),
        fullDate: day.date,
        total: Number(day.totalCost || 0),
        totalTokens: Number(day.totalTokens || 0),
      }

      chartSeries.forEach(series => {
        const modelNames = series.rawModels?.length ? series.rawModels : [series.model]
        const value = modelNames.reduce((sum, model) => sum + readNumericField(day, model), 0)
        const tokens = modelNames.reduce((sum, model) => sum + readNumericField(day, `${model}_tokens`), 0)
        row[series.key] = value
        row[`${series.key}__tokens`] = tokens
      })

      return row as ChartDataRow
    })

    return rows
  }, [chartSeries, codexbarActive, codexbarPeriodDays, ledgerActive, tokenData])

  const hasChartBars = chartData.some(row => Number(row.total || 0) > 0)
  const useMobileDailyChart = m && hasChartBars

  const sessionEstimateData = useMemo(() => {
    if (tokenData?.source !== 'sessions.fallback' || !tokenData.daily?.length) return []

    const mapped = tokenData.daily.map(day => ({
      day: new Date(day.date).toLocaleDateString('en-US', { day: 'numeric' }),
      fullDate: day.date,
      tokens: Number(day.tokens || 0),
      estimatedCost: estimateCost(Number(day.tokens || 0), 'sonnet'),
      intensity: 0,
    }))

    const maxTokens = Math.max(...mapped.map(day => day.tokens), 1)
    return mapped.map(day => ({
      ...day,
      intensity: maxTokens > 0 ? day.tokens / maxTokens : 0,
    }))
  }, [tokenData])

  const hasSessionEstimateChart = sessionEstimateData.some(day => day.tokens > 0)

  useEffect(() => {
    let cancelled = false
    const nextPool = chartData.length > 0 ? chartData : sessionEstimateData
    const timer = window.setTimeout(() => {
      if (cancelled) return
      if (!nextPool.length) {
        setActiveChartDate(null)
        return
      }

      setActiveChartDate(current => {
        if (current && nextPool.some(day => day.fullDate === current)) return current
        return nextPool[nextPool.length - 1]?.fullDate || null
      })
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [chartData, sessionEstimateData])

  const tokenBreakdown = useMemo<AggregatedBreakdownItem[]>(() => {
    const buckets = new Map<string, Omit<AggregatedBreakdownItem, 'share'> & { rawNamesSet: Set<string> }>()

    const addBucket = (rawName: string, tokens: number, cost: number) => {
      if (tokens <= 0 && cost <= 0) return
      const name = canonicalModelName(rawName)
      const current = buckets.get(name) || {
        name,
        rawNames: [],
        rawNamesSet: new Set<string>(),
        tokens: 0,
        cost: 0,
        local: false,
        color: getModelColor(rawName || name),
      }

      current.tokens += Number.isFinite(tokens) ? tokens : 0
      current.cost += Number.isFinite(cost) ? cost : 0
      current.local = current.local || isLocalModel(rawName)
      current.color = getModelColor(name)
      if (rawName) current.rawNamesSet.add(rawName)
      buckets.set(name, current)
    }

    if (ledgerActive && tokenData?.byService?.length) {
      tokenData.byService.forEach(item => {
        addBucket(item.name, item.tokens || 0, item.cost || 0)
      })
    } else {
      sessions.forEach(session => {
        addBucket(
          session.model || session.displayName || 'Unknown',
          session.totalTokens || 0,
          estimateCost(session.totalTokens || 0, session.model)
        )
      })
    }

    const items = Array.from(buckets.values()).map(item => ({
      name: item.name,
      rawNames: Array.from(item.rawNamesSet),
      tokens: item.tokens,
      cost: item.cost,
      local: item.local,
      color: item.color,
      share: 0,
    }))

    const total = items.reduce((sum, item) => sum + item.tokens, 0)
    return items
      .map(item => ({
        ...item,
        share: total > 0 ? (item.tokens / total) * 100 : 0,
      }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 8)
  }, [ledgerActive, sessions, tokenData])

  if (loading) {
    return (
      <PageTransition>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              border: '2px solid rgba(0,122,255,0.22)',
              borderTopColor: '#007AFF',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
        </div>
      </PageTransition>
    )
  }

  if (error || (!awsCosts && !tokenData)) {
    return (
      <PageTransition>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px', flexDirection: 'column', gap: '16px' }}>
          <AlertCircle size={48} style={{ color: '#FF453A' }} />
          <p style={{ color: 'rgba(255,255,255,0.65)' }}>Failed to load cost data</p>
        </div>
      </PageTransition>
    )
  }

  const isAwsEnabled = config?.modules?.aws === true
  const hasAwsData = !!(awsCosts && awsCosts.total > 0)
  const totalTokens = ledgerActive
    ? tokenData?.summary?.periodTokens || tokenData?.summary?.thisMonthTokens || tokenData?.summary?.totalTokens || 0
    : sessions.reduce((sum, s) => sum + (s.totalTokens || 0), 0)

  const tokenBasedCost = estimateCost(totalTokens, 'sonnet')
  const periodLabels = { day: 'Daily', '7d': '7 Days', month: 'Monthly' } as const
  const activePeriodLabel = periodLabels[period]
  const loadedCostsPeriodKey = tokenData?.period?.key
  const costsPeriodPending = !!loadedCostsPeriodKey && loadedCostsPeriodKey !== period
  const hasUsableAgentSplit = !costsPeriodPending && hasUsableAgentSplitData(tokenData)
  const agentSplitRefreshing = !!tokenData?.meta?.refreshing && !hasUsableAgentSplit
  const agentSplitPending = costsPeriodPending || agentSplitRefreshing
  const agentSplitPeriodLabel = loadedCostsPeriodKey && loadedCostsPeriodKey in periodLabels
    ? periodLabels[loadedCostsPeriodKey as keyof typeof periodLabels]
    : activePeriodLabel
  const codexbarPeriodCost = sumCostRows(codexbarPeriodDays)
  const codexbarPreviousDays = previousCodexbarRows(codexbarCosts?.daily || [], period)
  const codexbarPreviousPeriodCost = codexbarPreviousDays.length ? sumCostRows(codexbarPreviousDays) : null
  const codexbarPreviousDailyAvg = codexbarPreviousPeriodCost !== null ? codexbarPreviousPeriodCost / codexbarPreviousDays.length : null
  const codexbarPeriodTokens = codexbarPeriodDays.reduce((sum, day) => sum + (day.totalTokens || 0), 0)

  const currentPeriodCost = codexbarActive
    ? codexbarPeriodCost
    : hasAwsData
      ? awsCosts?.total || 0
      : ledgerActive
        ? (tokenData?.summary?.periodUsd ?? tokenData?.summary?.thisMonthUsd) || 0
        : tokenBasedCost

  const trackedDays = codexbarActive ? codexbarPeriodDays : hasAwsData ? awsCosts?.daily || [] : tokenData?.daily || []
  const dailyAvg = codexbarActive
    ? codexbarPeriodCost / Math.max(codexbarPeriodDays.length, 1)
    : hasAwsData
      ? (awsCosts?.daily || []).reduce((sum, d) => sum + (d.cost || 0), 0) / Math.max(awsCosts?.daily?.length || 0, 1)
      : ledgerActive
        ? currentPeriodCost / Math.max(trackedDays.length, 1)
        : tokenBasedCost / 30

  const previousPeriodCost = codexbarActive
    ? codexbarPreviousPeriodCost
    : tokenData?.summary?.previousPeriodUsd ?? null
  const previousDailyAvg = codexbarActive
    ? codexbarPreviousDailyAvg
    : tokenData?.summary?.yesterdayUsd ?? null
  const compareLabel = comparisonLabels(period)
  const monthlyTrend = calculateTrend(currentPeriodCost, previousPeriodCost)
  const dailyTrend = calculateTrend(dailyAvg, previousDailyAvg)

  const projectedMonthly = dailyAvg * 30
  const costSourceLabel = hasAwsData
    ? 'AWS live billing'
    : codexbarActive
      ? 'CodexBar invoice'
      : ledgerActive
        ? (tokenData.source === 'combined.agent_usage' ? 'OpenClaw + Hermes Usage' : tokenData.source === 'openclaw.usage' ? 'OpenClaw Usage' : 'Token ledger')
        : 'Estimated from sessions'
  const chartDayCount = trackedDays.length
  const monthlyBudgetBase = ledgerActive ? tokenData?.summary?.thisMonthUsd || 0 : currentPeriodCost
  const budgetUsage = budget > 0 ? monthlyBudgetBase / budget : 0
  const budgetUsagePct = budget > 0 ? Math.round(budgetUsage * 100) : 0
  const budgetRemaining = budget > 0 ? budget - monthlyBudgetBase : 0
  const budgetBadgeClass = budget <= 0
    ? 'macos-badge'
    : budgetUsage > 0.9
      ? 'macos-badge-red'
      : budgetUsage > 0.7
        ? 'macos-badge-orange'
        : 'macos-badge-green'

  const creditsUsed = hasAwsData && awsCosts ? awsCosts.credits - awsCosts.remaining : 0
  const burnRate = hasAwsData && awsCosts && creditsUsed > 0
    ? awsCosts.remaining / (creditsUsed / Math.max(awsCosts.daily.length, 1))
    : Infinity

  const topSessions = sessions
    .filter(s => s.totalTokens > 0)
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, 5)
    .map(s => ({
      sessionId: s.key,
      sessionName: formatSessionName(s.key, s.displayName),
      model: canonicalModelName(s.model || s.displayName || 'Unknown'),
      tokens: s.totalTokens,
      cost: estimateCost(s.totalTokens, s.model),
      timestamp: s.updatedAt ? new Date(s.updatedAt).getTime() / 1000 : fallbackSessionTimestamp,
      color: getModelColor(s.model || ''),
      channel: s.key.split(':')[0] || 'session',
    }))

  const dominantModel = tokenBreakdown[0] || null
  const localTokenShare = tokenBreakdown
    .filter(item => item.local)
    .reduce((sum, item) => sum + item.share, 0)
  const sessionPressureMax = Math.max(...topSessions.map(session => session.tokens), 1)
  const blendedCostBreakdown = codexbarActive && codexbarLatest?.models?.length
    ? (() => {
        const total = codexbarLatest.models.reduce((sum, model) => sum + (model.cost || 0), 0)
        return codexbarLatest.models.map(model => ({
          name: model.model,
          amount: model.cost || 0,
          share: total > 0 ? ((model.cost || 0) / total) * 100 : 0,
          color: '#FF9500',
          secondary: `${formatTokens(model.totalTokens || 0)} tokens`,
          local: false,
        }))
      })()
    : hasAwsData && awsCosts
      ? awsCosts.services.slice(0, m ? 5 : 8).map(service => ({
        name: service.name,
        amount: service.cost,
        share: awsCosts.total > 0 ? (service.cost / awsCosts.total) * 100 : 0,
        color: getServiceColor(service.name),
        secondary: formatCurrency(service.cost),
      }))
      : tokenBreakdown.map(item => ({
        name: item.name,
        amount: item.cost,
        share: item.share,
        color: item.color,
        secondary: `${formatTokens(item.tokens)} tokens`,
        local: item.local,
      }))

  const costSignals = [
    dominantModel
      ? {
          title: 'Dominant model',
          body: `${dominantModel.name} is carrying ${dominantModel.share.toFixed(1)}% of the token load this ${activePeriodLabel.toLowerCase()}.`,
          accent: dominantModel.color,
          icon: Cpu,
        }
      : null,
    topSessions[0]
      ? {
          title: 'Session pressure',
          body: `${topSessions[0].sessionName} is the heaviest session at ${formatTokens(topSessions[0].tokens)} tokens.`,
          accent: topSessions[0].color,
          icon: TrendingUp,
        }
      : null,
    {
      title: 'Spend posture',
      body: budget > 0
        ? `${budgetUsagePct}% of the monthly cap is already used. ${formatCurrency(Math.max(budgetRemaining, 0))} remains.`
        : `No budget cap set. Current projected month is ${formatCurrency(projectedMonthly)}.`,
      accent: budget > 0 && budgetUsage > 0.9 ? '#FF453A' : '#32D74B',
      icon: Target,
    },
    {
      title: 'Routing mix',
      body: localTokenShare > 0
        ? `${localTokenShare.toFixed(1)}% of tokens came from local models, which is helping cap cloud spend.`
        : 'Traffic is almost entirely cloud-routed right now; local models are not materially offsetting spend.',
      accent: localTokenShare > 15 ? '#32D74B' : '#007AFF',
      icon: Cloud,
    },
  ].filter(Boolean) as Array<{ title: string; body: string; accent: string; icon: typeof Cpu }>

  const agentSplit = agentSplitPending ? [] : (tokenData?.agents || []).map(agent => {
    const prefix = `${agent.label} / `
    const modelTotals = new Map<string, { name: string; tokens: number; cost: number; costSource?: string }>()

    ;(tokenData?.dailyByModel || []).forEach(day => {
      Object.keys(day).forEach(key => {
        if (!key.startsWith(prefix) || key.endsWith('_tokens') || key.endsWith('_costSource')) return
        const rawTokens = Number(day[`${key}_tokens`] || 0)
        const rawCost = Number(day[key] || 0)
        const current = modelTotals.get(key) || { name: key, tokens: 0, cost: 0, costSource: String(day[`${key}_costSource`] || '') }
        current.tokens += Number.isFinite(rawTokens) ? rawTokens : 0
        current.cost += Number.isFinite(rawCost) ? rawCost : 0
        current.costSource = current.costSource || String(day[`${key}_costSource`] || '')
        modelTotals.set(key, current)
      })
    })

    const periodModels = Array.from(modelTotals.values()).filter(model => model.tokens > 0 || model.cost > 0)
    const periodTokens = periodModels.reduce((sum, model) => sum + model.tokens, 0)
    const periodCost = periodModels.reduce((sum, model) => sum + model.cost, 0)
    const tokens = periodModels.length > 0
      ? periodTokens
      : Number(agent.summary?.periodTokens ?? agent.summary?.thisMonthTokens ?? agent.summary?.totalTokens ?? 0)
    const cost = periodModels.length > 0
      ? periodCost
      : Number(agent.summary?.periodUsd ?? agent.summary?.thisMonthUsd ?? agent.summary?.totalUsd ?? 0)
    const topModel = periodModels
      .slice()
      .sort((a, b) => Number(b.tokens || 0) - Number(a.tokens || 0))[0]
      || (agent.byService || []).slice().sort((a, b) => Number(b.tokens || 0) - Number(a.tokens || 0))[0]
    const costSourceProbe = (agent.byService || []).find(service => Number(service.cost || 0) > 0)
      || periodModels.find(model => Number(model.cost || 0) > 0)
      || (agent.byService || []).find(service => Number(service.tokens || 0) > 0)
      || topModel
    const costLabel = costReliabilityLabel(costSourceProbe)

    return {
      ...agent,
      tokens,
      cost,
      costLabel,
      topModel: topModel?.name?.replace(/^OpenClaw \/ /, '').replace(/^Hermes \/ /, '') || 'No model data',
    }
  })
  const totalAgentTokens = agentSplit.reduce((sum, agent) => sum + agent.tokens, 0)

  const overviewPills = [
    {
      label: 'Tracking Mode',
      value: codexbarActive ? 'CodexBar' : costSourceLabel,
      accent: codexbarActive ? '#FF9500' : hasAwsData ? '#32D74B' : ledgerActive ? '#5E5CE6' : '#FF9F0A',
    },
    {
      label: 'CodexBar Session',
      value: formatCurrency(codexbarCosts?.sessionCostUSD || 0),
      accent: codexbarActive ? '#FF9500' : '#8E8E93',
    },
    {
      label: 'Tracked Days',
      value: `${chartDayCount || 0} days`,
      accent: '#007AFF',
    },
    {
      label: 'Token Volume',
      value: formatCompactTokenValue(totalTokens),
      title: `${formatTokens(totalTokens)} tokens`,
      accent: '#BF5AF2',
    },
    {
      label: budget > 0 ? 'Budget Left' : 'Budget State',
      value: budget > 0 ? formatCurrency(Math.max(budgetRemaining, 0)) : 'No cap',
      accent: budget > 0 && budgetRemaining < budget * 0.2 ? '#FF453A' : '#32D74B',
    },
  ]

  return (
    <PageTransition>
      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: m ? '16px' : '0',
          display: 'flex',
          flexDirection: 'column',
          gap: m ? '20px' : '28px',
        }}
      >
        <GlassCard delay={0} noPad>
          <div
            style={{
              padding: m ? '18px' : '26px',
              display: 'grid',
              gridTemplateColumns: m ? '1fr' : 'minmax(0, 1.45fr) minmax(320px, 0.95fr)',
              gap: m ? '16px' : '24px',
              background: 'radial-gradient(circle at top left, rgba(50,215,75,0.12), transparent 34%), radial-gradient(circle at top right, rgba(94,92,230,0.16), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '0' }}>
                    <DollarSign size={m ? 24 : 28} style={{ color: '#32D74B' }} />
                    Cost Tracker
                  </h1>
                  <p className="text-body" style={{ margin: '8px 0 0 0', maxWidth: 620 }}>
                    {activePeriodLabel} view with budget tracking, daily movement, and the biggest cost drivers.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: m ? 'flex-start' : 'flex-end', alignItems: 'center' }}>
                  <span className="macos-badge macos-badge-blue">{activePeriodLabel}</span>
                  <span className={`macos-badge ${hasAwsData ? 'macos-badge-green' : ledgerActive ? 'macos-badge-blue' : 'macos-badge-orange'}`}>
                    {costSourceLabel}
                  </span>
                </div>
              </div>

              <div style={{ display: 'inline-flex', gap: 6, padding: 4, borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', alignSelf: 'flex-start' }}>
                {([
                  ['day', 'Daily'],
                  ['7d', '7 Days'],
                  ['month', 'Monthly'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setPeriod(key)}
                    style={{
                      border: 'none',
                      cursor: 'pointer',
                      borderRadius: 9,
                      padding: '7px 12px',
                      background: period === key ? 'linear-gradient(180deg, rgba(10,132,255,0.32) 0%, rgba(10,132,255,0.18) 100%)' : 'transparent',
                      color: period === key ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.6)',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr 1fr' : `repeat(${overviewPills.length}, minmax(0, 1fr))`, gap: 10 }}>
                {overviewPills.map(pill => (
                  <div
                    key={pill.label}
                    title={'title' in pill ? pill.title : undefined}
                    style={{
                      padding: m ? '12px' : '14px',
                      borderRadius: 16,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 24px ${pill.accent}18`,
                      minHeight: m ? 72 : 76,
                      display: 'grid',
                      gridTemplateRows: '30px 1fr',
                      alignItems: 'start',
                    }}
                  >
                    <div style={{ fontSize: 11, lineHeight: 1.2, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{pill.label}</div>
                    <div style={{ alignSelf: 'end', fontSize: m ? 13 : 15, color: 'rgba(255,255,255,0.94)', fontWeight: 700, whiteSpace: 'nowrap', fontFeatureSettings: '"tnum"' }}>{pill.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {codexbarActive ? (
                <div
                  style={{
                    minHeight: 0,
                    padding: m ? '14px' : '18px',
                    borderRadius: 20,
                    border: '1px solid rgba(255,149,0,0.28)',
                    background: 'linear-gradient(155deg, rgba(255,149,0,0.2) 0%, rgba(27,33,54,0.82) 48%, rgba(43,28,13,0.78) 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 18,
                    boxShadow: '0 18px 40px rgba(255,149,0,0.16)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'rgba(255,214,153,0.85)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>CodexBar Cost Pulse</div>
                      <div style={{ fontSize: m ? 30 : 38, color: 'rgba(255,255,255,0.96)', fontWeight: 300, marginTop: 10 }}>
                        {formatCurrency(currentPeriodCost)}
                      </div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.62)', marginTop: 6 }}>
                        Current month tracked spend
                      </div>
                    </div>
                    <span className="macos-badge macos-badge-orange">
                      INVOICE DATA
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                    <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', minWidth: 0, minHeight: 70, display: 'grid', gridTemplateRows: '30px 1fr', alignItems: 'start' }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Daily Pace</div>
                      <div style={{ alignSelf: 'end', fontSize: m ? 16 : 17, color: 'rgba(255,255,255,0.94)', fontWeight: 700, whiteSpace: 'nowrap' }}>{formatCurrency(dailyAvg)}</div>
                    </div>
                    <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', minWidth: 0, minHeight: 70, display: 'grid', gridTemplateRows: '30px 1fr', alignItems: 'start' }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Projection</div>
                      <div style={{ alignSelf: 'end', fontSize: m ? 16 : 17, color: 'rgba(255,255,255,0.94)', fontWeight: 700, whiteSpace: 'nowrap' }}>{formatCurrency(projectedMonthly)}</div>
                    </div>
                    <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', minWidth: 0, minHeight: 70, display: 'grid', gridTemplateRows: '30px 1fr', alignItems: 'start' }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Session Today</div>
                      <div style={{ alignSelf: 'end', fontSize: m ? 16 : 17, color: 'rgba(255,255,255,0.94)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {formatCurrency(codexbarCosts?.sessionCostUSD || 0)}
                      </div>
                    </div>
                    <div title={`${formatTokens(codexbarPeriodTokens)} tokens`} style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', minWidth: 0, minHeight: 70, display: 'grid', gridTemplateRows: '30px 1fr', alignItems: 'start' }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Period Tokens</div>
                      <div style={{ alignSelf: 'end', fontSize: m ? 16 : 17, color: 'rgba(255,255,255,0.94)', fontWeight: 700, whiteSpace: 'nowrap', fontFeatureSettings: '"tnum"' }}>
                        {formatCompactTokenValue(codexbarPeriodTokens)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      minHeight: 0,
                      padding: m ? '14px' : '18px',
                      borderRadius: 20,
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'linear-gradient(160deg, rgba(17,19,30,0.86) 0%, rgba(27,33,54,0.8) 58%, rgba(44,31,74,0.7) 100%)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 18,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Current Pulse</div>
                      <div style={{ fontSize: m ? 28 : 36, color: 'rgba(255,255,255,0.96)', fontWeight: 300, marginTop: 10 }}>
                        {formatCurrency(currentPeriodCost)}
                      </div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.62)', marginTop: 6 }}>
                        {period === 'month' ? 'Current month tracked spend' : `${activePeriodLabel} spend in view`}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                      <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Daily Pace</div>
                        <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.94)', fontWeight: 700, marginTop: 8 }}>{formatCurrency(dailyAvg)}</div>
                      </div>
                      <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Projection</div>
                        <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.94)', fontWeight: 700, marginTop: 8 }}>{formatCurrency(projectedMonthly)}</div>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      minHeight: 0,
                      padding: m ? '14px' : '18px',
                      borderRadius: 20,
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16,
                      opacity: 0.72,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                          CodexBar Real Costs
                        </div>
                        <div style={{ fontSize: m ? 28 : 34, color: 'rgba(255,255,255,0.96)', fontWeight: 300, marginTop: 10 }}>
                          {formatCurrency(0)}
                        </div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.62)', marginTop: 6 }}>
                          {period === 'month' ? 'Current month invoice data' : `${activePeriodLabel} invoice data`}
                        </div>
                      </div>
                      <span className="macos-badge" style={{ opacity: 0.7 }}>
                        INVOICE DATA
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                      <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Session Today</div>
                        <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.94)', fontWeight: 700, marginTop: 8 }}>
                          {formatCurrency(codexbarCosts?.sessionCostUSD || 0)}
                        </div>
                      </div>
                      <div title="0 tokens" style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Period Tokens</div>
                        <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.94)', fontWeight: 700, marginTop: 8, fontFeatureSettings: '"tnum"' }}>
                          {formatCompactTokenValue(0)}
                        </div>
                      </div>
                    </div>

                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                      No CodexBar invoice data is active yet for this view.
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </GlassCard>

        {(agentSplit.length > 0 || agentSplitPending) && (
          <GlassCard delay={0.12} noPad>
            <div style={{ padding: m ? '16px' : '22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ fontSize: m ? 15 : 16, fontWeight: 700, color: 'rgba(255,255,255,0.94)', margin: 0 }}>
                    Agent Split
                  </h3>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.48)', marginTop: 4 }}>
                    {agentSplitPending
                      ? `Refreshing Agent Split for the selected ${activePeriodLabel.toLowerCase()} period…`
                      : `Showing OpenClaw vs Hermes for the loaded ${agentSplitPeriodLabel.toLowerCase()} period.`}
                  </div>
                </div>
                {!agentSplitPending && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {tokenData?.meta?.refreshing && <span className="macos-badge">Refreshing</span>}
                    <span className="macos-badge macos-badge-blue">
                      {formatCompactTokenValue(totalAgentTokens)} TOKENS
                    </span>
                  </div>
                )}
              </div>

              {agentSplitPending ? (
                <div
                  style={{
                    position: 'relative',
                    overflow: 'hidden',
                    padding: m ? '18px' : '22px',
                    borderRadius: 20,
                    border: '1px solid rgba(10,132,255,0.18)',
                    background: 'radial-gradient(circle at 16% 18%, rgba(10,132,255,0.18), transparent 34%), radial-gradient(circle at 86% 8%, rgba(94,92,230,0.16), transparent 28%), rgba(255,255,255,0.035)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'rgba(10,132,255,0.14)', border: '1px solid rgba(10,132,255,0.22)' }}>
                        <Loader2 size={18} style={{ color: '#0A84FF', animation: 'spin 1s linear infinite' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: 800 }}>
                          Loading {activePeriodLabel} split
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.52)', marginTop: 3 }}>
                          Fetching fresh OpenClaw vs Hermes usage — old {agentSplitPeriodLabel.toLowerCase()} values are hidden.
                        </div>
                      </div>
                    </div>
                    <span className="macos-badge macos-badge-blue">Refreshing</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                    {['OpenClaw', 'Hermes'].map((label, index) => (
                      <div
                        key={label}
                        style={{
                          padding: m ? '14px' : '16px',
                          borderRadius: 18,
                          border: '1px solid rgba(255,255,255,0.08)',
                          background: 'rgba(255,255,255,0.04)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 13,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 999, background: index === 0 ? '#5E5CE6' : '#00C7BE', boxShadow: `0 0 18px ${index === 0 ? '#5E5CE6' : '#00C7BE'}` }} />
                            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', fontWeight: 800 }}>{label}</span>
                          </div>
                          <div style={{ width: 42, height: 10, borderRadius: 999, background: 'linear-gradient(90deg, rgba(255,255,255,0.12), rgba(255,255,255,0.22), rgba(255,255,255,0.12))', opacity: 0.72 }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          {[0, 1].map(item => (
                            <div key={item}>
                              <div style={{ width: item === 0 ? 36 : 48, height: 9, borderRadius: 999, background: 'rgba(255,255,255,0.10)', marginBottom: 9 }} />
                              <div style={{ width: item === 0 ? '72%' : '84%', height: 24, borderRadius: 10, background: 'linear-gradient(90deg, rgba(255,255,255,0.08), rgba(255,255,255,0.18), rgba(255,255,255,0.08))' }} />
                            </div>
                          ))}
                        </div>
                        <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                          <div style={{ width: index === 0 ? '58%' : '42%', height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${index === 0 ? '#5E5CE6' : '#00C7BE'}, rgba(255,255,255,0.35))`, opacity: 0.58 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : `repeat(${agentSplit.length}, minmax(0, 1fr))`, gap: 12 }}>
                  {agentSplit.map(agent => {
                  const share = totalAgentTokens > 0 ? (agent.tokens / totalAgentTokens) * 100 : 0
                  const accent = agent.accent || (agent.key === 'hermes' ? '#00C7BE' : '#5E5CE6')
                  return (
                    <div
                      key={agent.key}
                      style={{
                        padding: m ? '14px' : '18px',
                        borderRadius: 18,
                        border: `1px solid ${accent}55`,
                        background: `linear-gradient(145deg, ${accent}22 0%, rgba(255,255,255,0.035) 45%, rgba(255,255,255,0.02) 100%)`,
                        boxShadow: `0 14px 34px ${accent}18`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 14,
                        minWidth: 0,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 999, background: accent, boxShadow: `0 0 18px ${accent}` }} />
                          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: 800 }}>{agent.label}</span>
                        </div>
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.58)', fontWeight: 700 }}>{share.toFixed(1)}%</span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Cost</div>
                          <div style={{ fontSize: m ? 22 : 26, color: 'rgba(255,255,255,0.96)', fontWeight: 300, marginTop: 5 }}>
                            {formatAgentCostValue(agent.cost, agent.costLabel)}
                          </div>
                          <div style={{ fontSize: 10, color: agent.costLabel === 'Metered' ? 'rgba(255,255,255,0.42)' : '#FFCC00', fontWeight: 700, marginTop: 4 }}>
                            {agent.costLabel}
                          </div>
                        </div>
                        <div title={`${formatTokens(agent.tokens)} tokens`}>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tokens</div>
                          <div style={{ fontSize: m ? 22 : 26, color: 'rgba(255,255,255,0.96)', fontWeight: 300, marginTop: 5, fontFeatureSettings: '"tnum"' }}>
                            {formatCompactTokenValue(agent.tokens)}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.max(share, agent.tokens > 0 ? 3 : 0)}%`, height: '100%', borderRadius: 999, background: accent }} />
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.48)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={agent.topModel}>
                          Top model: {agent.topModel}
                        </div>
                      </div>
                    </div>
                  )
                })}
                </div>
              )}
            </div>
          </GlassCard>
        )}

        {budget > 0 && monthlyBudgetBase > 0 && monthlyBudgetBase / budget > 0.8 && (
          <div
            style={{
              padding: m ? '12px 16px' : '16px 20px',
              background: 'rgba(255, 149, 0, 0.15)',
              border: '1px solid rgba(255, 149, 0, 0.3)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
            }}
          >
            <AlertCircle size={20} style={{ color: '#FF9500' }} />
            <div>
              <div style={{ fontSize: m ? '13px' : '14px', color: 'rgba(255,255,255,0.92)', fontWeight: '600' }}>
                Budget alert
              </div>
              <div style={{ fontSize: m ? '12px' : '13px', color: 'rgba(255,255,255,0.75)', marginTop: '2px' }}>
                You have used {budgetUsagePct}% of the {formatCurrency(budget)} monthly target.
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isAwsEnabled && hasAwsData ? (m ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)') : (m ? '1fr' : 'repeat(3, 1fr)'),
            gap: m ? '12px' : '20px',
          }}
        >
          <GlassCard delay={0} noPad>
            <div style={{ padding: m ? '16px' : '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div
                  style={{
                    width: m ? '40px' : '48px',
                    height: m ? '40px' : '48px',
                    borderRadius: '12px',
                    background: currentPeriodCost > 100 ? 'rgba(255,149,0,0.15)' : 'rgba(50,215,75,0.15)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <DollarSign size={m ? 16 : 20} style={{ color: currentPeriodCost > 100 ? '#FF9500' : '#32D74B' }} />
                </div>
                <span style={{ fontSize: m ? '10px' : '11px', fontWeight: '700', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {period === 'month' ? labels.thisMonth : activePeriodLabel}
                </span>
              </div>
              <p style={{ fontSize: m ? '24px' : '32px', fontWeight: '300', color: 'rgba(255,255,255,0.92)', fontFamily: 'system-ui', fontFeatureSettings: '"tnum"', margin: '0' }}>
                <AnimatedCounter end={currentPeriodCost} formatter={formatCurrency} />
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: '10px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>
                  {compareLabel.period} {formatComparisonValue(previousPeriodCost)}
                </div>
                <TrendBadge trend={monthlyTrend} />
              </div>
            </div>
          </GlassCard>

          {isAwsEnabled && hasAwsData && awsCosts && (
            <GlassCard delay={0.05} noPad>
              <div style={{ padding: m ? '16px' : '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ width: m ? '40px' : '48px', height: m ? '40px' : '48px', borderRadius: '12px', background: 'rgba(50,215,75,0.15)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Target size={m ? 16 : 20} style={{ color: '#32D74B' }} />
                  </div>
                  <span style={{ fontSize: m ? '10px' : '11px', fontWeight: '700', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {labels.creditsLeft}
                  </span>
                </div>
                <p style={{ fontSize: m ? '24px' : '32px', fontWeight: '300', color: 'rgba(255,255,255,0.92)', fontFamily: 'system-ui', fontFeatureSettings: '"tnum"', margin: '0' }}>
                  <AnimatedCounter end={awsCosts.remaining} formatter={formatCurrency} />
                </p>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginTop: '8px' }}>
                  Remaining AWS credit balance
                </div>
              </div>
            </GlassCard>
          )}

          <GlassCard delay={0.1} noPad>
            <div style={{ padding: m ? '16px' : '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ width: m ? '40px' : '48px', height: m ? '40px' : '48px', borderRadius: '12px', background: 'rgba(0,122,255,0.15)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Calendar size={m ? 16 : 20} style={{ color: '#007AFF' }} />
                </div>
                <span style={{ fontSize: m ? '10px' : '11px', fontWeight: '700', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {labels.dailyAvg}
                </span>
              </div>
              <p style={{ fontSize: m ? '24px' : '32px', fontWeight: '300', color: 'rgba(255,255,255,0.92)', fontFamily: 'system-ui', fontFeatureSettings: '"tnum"', margin: '0' }}>
                <AnimatedCounter end={dailyAvg} formatter={formatCurrency} />
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: '10px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>
                  {compareLabel.daily} {formatComparisonValue(previousDailyAvg)}
                </div>
                <TrendBadge trend={dailyTrend} />
              </div>
            </div>
          </GlassCard>

          <GlassCard delay={0.15} noPad>
            <div style={{ padding: m ? '16px' : '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ width: m ? '40px' : '48px', height: m ? '40px' : '48px', borderRadius: '12px', background: 'rgba(255,149,0,0.15)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <TrendingUp size={m ? 16 : 20} style={{ color: '#FF9500' }} />
                </div>
                <span style={{ fontSize: m ? '10px' : '11px', fontWeight: '700', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {labels.projected}
                </span>
              </div>
              <p style={{ fontSize: m ? '24px' : '32px', fontWeight: '300', color: 'rgba(255,255,255,0.92)', fontFamily: 'system-ui', fontFeatureSettings: '"tnum"', margin: '0' }}>
                <AnimatedCounter end={projectedMonthly} formatter={formatCurrency} />
              </p>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginTop: '8px' }}>
                Projected if the current pace holds
              </div>
            </div>
          </GlassCard>
        </div>

        <GlassCard delay={0.18} noPad>
          <div style={{ padding: m ? '16px' : '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: m ? '16px' : '20px' }}>
              <div>
                <h3 style={{ fontSize: m ? '15px' : '16px', fontWeight: '600', color: 'rgba(255,255,255,0.92)', margin: 0 }}>
                  Budget Guardrail
                </h3>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
                  Set a monthly cap to keep alerts and runway tracking grounded.
                </div>
              </div>
              <span className={`macos-badge ${budgetBadgeClass}`}>
                {budget > 0 ? `${budgetUsagePct}% used` : 'No cap set'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: m ? 'column' : 'row', gap: '12px', alignItems: m ? 'stretch' : 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'rgba(255,255,255,0.65)', marginBottom: '8px' }}>
                  Monthly budget (USD)
                </label>
                <input
                  type="number"
                  value={budgetInput}
                  onChange={e => setBudgetInput(e.target.value)}
                  placeholder="Enter budget amount"
                  className="macos-input"
                  style={{ width: '100%', padding: '10px 14px' }}
                />
              </div>

              <button
                onClick={saveBudget}
                disabled={savingBudget || !budgetInput.trim()}
                className={`macos-button ${!savingBudget && budgetInput.trim() ? 'macos-button-primary' : ''}`}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  cursor: savingBudget || !budgetInput.trim() ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: '600',
                  opacity: savingBudget || !budgetInput.trim() ? 0.5 : 1,
                  minWidth: '80px',
                }}
              >
                {savingBudget ? 'Saving...' : 'Save'}
              </button>
            </div>

            {budget > 0 ? (
              <div style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)' }}>Current spend vs budget</span>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.92)', fontFamily: 'system-ui', fontFeatureSettings: '"tnum"' }}>
                    {formatCurrency(monthlyBudgetBase)} / {formatCurrency(budget)}
                  </span>
                </div>

                <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min((monthlyBudgetBase / budget) * 100, 100)}%`,
                      height: '100%',
                      background: monthlyBudgetBase / budget > 0.9 ? '#FF453A' : monthlyBudgetBase / budget > 0.7 ? '#FF9500' : '#32D74B',
                      borderRadius: '4px',
                      transition: 'all 0.6s ease',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>{budgetUsagePct}% used</span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>{formatCurrency(budgetRemaining)} remaining</span>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: '16px', padding: m ? '14px' : '16px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.82)', fontWeight: '500' }}>No monthly cap configured</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
                  Add a budget to get progress tracking and early spend alerts.
                </div>
              </div>
            )}
          </div>
        </GlassCard>

        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '2fr 1fr', gap: m ? '16px' : '24px' }}>
          <GlassCard delay={0.2} noPad>
            <div style={{ padding: m ? '16px' : '24px' }}>
              <div style={{ marginBottom: m ? '16px' : '24px' }}>
                <h3 style={{ fontSize: m ? '15px' : '16px', fontWeight: '600', color: 'rgba(255,255,255,0.92)', margin: 0 }}>
                  Daily Spend
                </h3>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
                  {chartDayCount > 0
                    ? codexbarActive
                      ? `${chartDayCount}-day CodexBar invoice spend; bars reconcile with the ${activePeriodLabel.toLowerCase()} cards.`
                      : hasSessionEstimateChart && !ledgerActive && !hasAwsData
                        ? `${chartDayCount}-day activity view estimated from session token flow.`
                        : `${chartDayCount}-day usage-ledger spend movement; unknown/included costs are excluded from billable bars.`
                    : 'Waiting for daily spend history.'}
                </div>
              </div>

              {chartData.length > 0 ? (
                useMobileDailyChart ? (
                  <MobileDailySpendChart
                    chartData={chartData}
                    chartSeries={chartSeries}
                    activeDate={activeChartDate}
                    onSelect={setActiveChartDate}
                  />
                ) : hasChartBars ? (
                  <div style={{ height: m ? 300 : 360, minHeight: m ? 300 : 360, width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={m ? 300 : 360}>
                      <BarChart data={chartData} margin={{ top: 8, right: 8, left: m ? -24 : -8, bottom: m ? 28 : 12 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="fullDate" tickFormatter={val => { const d = new Date(val); return `${d.getMonth()+1}/${d.getDate()}` }} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: m ? 10 : 11 }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={value => formatPreciseCurrency(Number(value || 0))} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: m ? 10 : 11 }} axisLine={false} tickLine={false} width={m ? 52 : 70} />
                        <Tooltip content={<CustomChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                        <Legend
                          verticalAlign="bottom"
                          align="center"
                          formatter={value => <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>{canonicalModelName(value)}</span>}
                          iconType="circle"
                          wrapperStyle={{ paddingTop: 12, fontSize: 11 }}
                        />
                        {chartSeries.map(series => (
                          <Bar
                            key={series.key}
                            dataKey={series.key}
                            name={series.model}
                            stackId="daily"
                            fill={series.color}
                            radius={[4, 4, 0, 0]}
                            minPointSize={3}
                            stroke="rgba(255,255,255,0.18)"
                            strokeWidth={0.6}
                          >
                            {chartData.map((_, index) => (
                              <Cell key={`${series.key}-${index}`} fill={series.color} />
                            ))}
                          </Bar>
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>
                      Recharts received data but visible bar height resolved to zero. Showing guaranteed CSS fallback.
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: m ? 4 : 6, height: m ? 220 : 260, paddingTop: 12 }}>
                      {(() => {
                        const maxTotal = Math.max(...chartData.map(day => Number(day.total || 0)), 1)
                        return chartData.map(day => {
                          const total = Number(day.total || 0)
                          const segments = chartSeries
                            .map(series => ({
                              key: series.key,
                              label: series.model,
                              value: Number(day[series.key] || 0),
                              color: series.color,
                            }))
                            .filter(segment => segment.value > 0)

                          const columnHeight = total > 0 ? Math.max((total / maxTotal) * (m ? 180 : 220), 8) : 0
                          return (
                            <div key={String(day.fullDate)} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                              <div style={{ width: '100%', maxWidth: 28, height: columnHeight, minHeight: total > 0 ? 8 : 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', borderRadius: 8, overflow: 'hidden', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                {segments.map(segment => {
                                  const style: CSSProperties = {
                                    height: `${Math.max((segment.value / total) * 100, 14)}%`,
                                    background: segment.color,
                                    minHeight: 6,
                                  }
                                  return <div key={segment.key} style={style} title={`${segment.label}: ${formatCurrency(segment.value)}`} />
                                })}
                              </div>
                              <span style={{ fontSize: m ? 9 : 10, color: 'rgba(255,255,255,0.45)' }}>{String(day.day)}</span>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  </div>
                )
              ) : hasSessionEstimateChart ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: m ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                      gap: 10,
                    }}
                  >
                    <div style={{ padding: '14px 16px', borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Fallback Mode</div>
                      <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.92)', fontWeight: 700, marginTop: 8 }}>Session activity estimate</div>
                    </div>
                    <div style={{ padding: '14px 16px', borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Monthly Estimate</div>
                      <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.92)', fontWeight: 700, marginTop: 8 }}>{formatCurrency(projectedMonthly)}</div>
                    </div>
                    <div style={{ padding: '14px 16px', borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Observed Tokens</div>
                      <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.92)', fontWeight: 700, marginTop: 8 }}>{formatTokens(totalTokens)}</div>
                    </div>
                  </div>

                  <SessionEstimateChart
                    data={sessionEstimateData}
                    activeDate={activeChartDate}
                    onSelect={setActiveChartDate}
                  />
                </div>
              ) : hasAwsData && awsCosts ? (
                <div style={{ height: m ? '180px' : '240px', display: 'flex', alignItems: 'flex-end', gap: m ? '2px' : '4px', paddingTop: '20px' }}>
                  {awsCosts.daily.map(day => {
                    const maxCost = Math.max(...awsCosts.daily.map(d => d.cost), 10)
                    const height = Math.max((day.cost / maxCost) * (m ? 140 : 200), 2)
                    return (
                      <div key={day.date} style={{ flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '100%', height: `${height}px`, background: '#007AFF', borderRadius: '4px 4px 0 0', opacity: '0.8', transition: 'all 0.3s ease' }} title={`${day.date}: ${formatCurrency(day.cost)}`} />
                        <span style={{ fontSize: m ? '7px' : '10px', color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 1.1 }}>
                          {new Date(day.date).toLocaleDateString('en-US', { day: 'numeric' })}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ height: m ? '180px' : '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.65)' }}>Using token-based cost estimation</div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', textAlign: 'center' }}>
                    Daily model history is not available yet.<br />
                    Estimated {formatCurrency(tokenBasedCost)} this month from {formatTokens(totalTokens)} tokens.
                  </div>
                </div>
              )}
            </div>
          </GlassCard>

          <GlassCard delay={0.25} noPad>
            <div style={{ padding: m ? '16px' : '24px' }}>
              <div style={{ marginBottom: m ? '16px' : '24px' }}>
                <h3 style={{ fontSize: m ? '15px' : '16px', fontWeight: '600', color: 'rgba(255,255,255,0.92)', margin: 0 }}>
                  Spend Composition
                </h3>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
                  {codexbarActive ? 'Ranked from the latest CodexBar invoice snapshot.' : 'Ranked view of the biggest drivers in the current view.'}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: m ? '12px' : '16px' }}>
                {blendedCostBreakdown.length > 0 ? (
                  blendedCostBreakdown.slice(0, m ? 5 : 7).map(item => (
                    <div key={item.name} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 999, background: item.color, flexShrink: 0 }} />
                          <span style={{ fontSize: m ? '12px' : '14px', color: 'rgba(255,255,255,0.75)', fontWeight: '600' }}>
                            {item.name}
                          </span>
                          {'local' in item && item.local ? <span className="macos-badge macos-badge-blue">Local</span> : null}
                        </div>
                        <span style={{ fontSize: m ? '12px' : '13px', color: 'rgba(255,255,255,0.92)', fontWeight: 700 }}>
                          {item.secondary}
                        </span>
                      </div>
                      <div style={{ height: '7px', background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.max(item.share, 2)}%`, height: '100%', background: item.color, borderRadius: 999, transition: 'width 0.6s ease' }} />
                      </div>
                      <div style={{ fontSize: 11, color: codexbarActive ? 'rgba(255,149,0,0.8)' : 'rgba(255,255,255,0.4)' }}>{item.share.toFixed(1)}% of current mix</div>
                    </div>
                  ))
                ) : totalTokens > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: m ? '12px' : '14px', color: 'rgba(255,255,255,0.65)', fontWeight: '500' }}>OpenClaw Sessions</span>
                      <span style={{ fontSize: m ? '12px' : '14px', color: 'rgba(255,255,255,0.92)', fontWeight: '600', fontFamily: 'system-ui', fontFeatureSettings: '"tnum"' }}>
                        {formatCurrency(estimateCost(totalTokens, 'sonnet'))}
                      </span>
                    </div>
                    <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: '100%', height: '100%', background: '#BF5AF2', borderRadius: '3px', transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)' }}>No usage data yet</div>
                )}
              </div>
            </div>
          </GlassCard>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : (isAwsEnabled && hasAwsData ? '1.45fr 0.8fr' : '1fr'), gap: m ? '16px' : '24px' }}>
          <GlassCard delay={0.28} noPad>
            <div style={{ padding: m ? '16px' : '24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ fontSize: m ? '15px' : '16px', fontWeight: '600', color: 'rgba(255,255,255,0.92)', margin: 0 }}>
                    Cost Drivers
                  </h3>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
                    One surface for model mix, session pressure, and methodology.
                  </div>
                </div>

                <div style={{ display: 'inline-flex', gap: 6, padding: 4, borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {([
                    ['models', 'By model'],
                    ['sessions', 'By session'],
                    ['codexbar', '🟠 CodexBar'],
                    ['notes', 'Notes'],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setDriverView(key)}
                      style={{
                        border: 'none',
                        cursor: 'pointer',
                        borderRadius: 9,
                        padding: '7px 12px',
                        background: driverView === key ? 'linear-gradient(180deg, rgba(94,92,230,0.34) 0%, rgba(94,92,230,0.18) 100%)' : 'transparent',
                        color: driverView === key ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.58)',
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {driverView === 'models' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
                  {tokenBreakdown.length > 0 ? tokenBreakdown.map((item, index) => (
                    <div
                      key={item.name}
                      style={{
                        padding: m ? '14px' : '16px',
                        borderRadius: 18,
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        display: 'grid',
                        gridTemplateColumns: m ? '1fr' : 'minmax(0, 1.2fr) minmax(220px, 0.8fr)',
                        gap: 14,
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <span className="macos-badge">#{index + 1}</span>
                            <span style={{ width: 10, height: 10, borderRadius: 999, background: item.color, flexShrink: 0 }} />
                            <span style={{ fontSize: m ? '13px' : '15px', color: 'rgba(255,255,255,0.92)', fontWeight: 700 }}>{item.name}</span>
                            {item.local ? <span className="macos-badge macos-badge-blue">Local</span> : null}
                          </div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{item.share.toFixed(1)}% share</div>
                        </div>

                        <div style={{ height: 10, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.max(item.share, 2)}%`, height: '100%', background: item.color, borderRadius: 999 }} />
                        </div>

                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                          {item.rawNames.length > 1 ? `${item.rawNames.length} model variants merged into one family.` : 'Single model family.'}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tokens</div>
                          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.94)', fontWeight: 700, marginTop: 6 }}>{formatTokens(item.tokens)}</div>
                        </div>
                        <div style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Estimated Cost</div>
                          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.94)', fontWeight: 700, marginTop: 6 }}>{item.local ? '$0.00' : formatCurrency(item.cost)}</div>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)' }}>No model breakdown data yet</div>
                  )}
                </div>
              ) : driverView === 'sessions' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
                  {topSessions.length > 0 ? topSessions.map((session, i) => (
                    <div
                      key={session.sessionId}
                      style={{
                        padding: m ? '14px' : '16px',
                        borderRadius: 18,
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="macos-badge">#{i + 1}</span>
                          <span className="macos-badge macos-badge-blue">{session.channel}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>Updated {formatSessionTimestamp(session.timestamp)}</div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : 'minmax(0, 1.2fr) minmax(180px, 0.8fr)', gap: 12, alignItems: 'start' }}>
                        <div>
                          <div style={{ fontSize: m ? '14px' : '15px', color: 'rgba(255,255,255,0.94)', fontWeight: 700 }}>{session.sessionName}</div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>{session.model}</div>
                        </div>
                        <div style={{ textAlign: m ? 'left' : 'right' }}>
                          <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.95)', fontWeight: 700 }}>{formatCurrency(session.cost)}</div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{formatTokens(session.tokens)} tokens</div>
                        </div>
                      </div>

                      <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.max((session.tokens / sessionPressureMax) * 100, 8)}%`, height: '100%', background: session.color, borderRadius: 999 }} />
                      </div>
                    </div>
                  )) : (
                    <div style={{ padding: m ? '32px 16px' : '48px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.45)' }}>
                      <div style={{ fontSize: m ? '14px' : '16px', marginBottom: '8px' }}>No session load data yet</div>
                      <div style={{ fontSize: m ? '12px' : '14px' }}>Start using OpenClaw to see session pressure here</div>
                    </div>
                  )}
                </div>
              ) : driverView === 'codexbar' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
                  {codexbarActive && codexbarCosts ? (
                    <>
                      {/* Summary stats */}
                      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 10 }}>
                        {[
                          { label: 'Last 30 Days', value: formatCurrency(codexbarCosts.last30DaysCostUSD), sub: formatTokens(codexbarCosts.last30DaysTokens) + ' tokens', accent: '#FF9500' },
                          { label: 'Session Today', value: formatCurrency(codexbarCosts.sessionCostUSD), sub: formatTokens(codexbarCosts.sessionTokens) + ' tokens', accent: '#FF9500' },
                          { label: 'Input', value: formatTokens(codexbarCosts.totals.inputTokens), sub: 'total', accent: '#007AFF' },
                          { label: 'Output', value: formatTokens(codexbarCosts.totals.outputTokens), sub: 'total', accent: '#32D74B' },
                        ].map(stat => (
                          <div key={stat.label} style={{ padding: m ? '12px' : '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{stat.label}</div>
                            <div style={{ fontSize: m ? 16 : 18, color: stat.accent, fontWeight: 700, marginTop: 6 }}>{stat.value}</div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{stat.sub}</div>
                          </div>
                        ))}
                      </div>

                      {/* Model breakdown from latest day */}
                      {codexbarLatest?.models && codexbarLatest.models.length > 0 && (
                        <>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: 600, marginBottom: -4 }}>
                            {codexbarLatest.date} — Latest Day Breakdown
                          </div>
                          {codexbarLatest.models.map((model, index) => {
                            const dayTotal = codexbarLatest.models.reduce((s, m) => s + (m.cost || 0), 0)
                            const share = dayTotal > 0 ? ((model.cost || 0) / dayTotal) * 100 : 0
                            return (
                              <div key={model.model} style={{ padding: m ? '14px' : '16px', borderRadius: 18, background: 'linear-gradient(180deg, rgba(255,149,0,0.06) 0%, rgba(255,149,0,0.02) 100%)', border: '1px solid rgba(255,149,0,0.15)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span className="macos-badge">#{index + 1}</span>
                                    <span style={{ fontSize: m ? 13 : 15, color: 'rgba(255,255,255,0.92)', fontWeight: 700 }}>{model.model}</span>
                                    <span className="macos-badge macos-badge-orange">INVOICE</span>
                                  </div>
                                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{share.toFixed(1)}% share</div>
                                </div>
                                <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden', marginBottom: 12 }}>
                                  <div style={{ width: Math.max(share, 3) + '%', height: '100%', background: '#FF9500', borderRadius: 999 }} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                  <div style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Cost</div>
                                    <div style={{ fontSize: 14, color: '#FF9500', fontWeight: 700, marginTop: 6 }}>{formatCurrency(model.cost)}</div>
                                  </div>
                                  <div style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tokens</div>
                                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.94)', fontWeight: 700, marginTop: 6 }}>{formatTokens(model.totalTokens)}</div>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </>
                      )}

                      {/* Daily history */}
                      {codexbarCosts.daily.length > 0 && (
                        <>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: 600, marginBottom: -4 }}>Daily History</div>
                          {codexbarCosts.daily.slice().reverse().map((day) => {
                            const dayTotal = day.totalCost || 0
                            const dayTokens = day.totalTokens || 0
                            const isLatest = day.date === codexbarLatest?.date
                            return (
                              <div key={day.date} style={{ padding: m ? '12px 14px' : '12px 16px', borderRadius: 14, background: isLatest ? 'rgba(255,149,0,0.06)' : 'rgba(255,255,255,0.03)', border: '1px solid ' + (isLatest ? 'rgba(255,149,0,0.18)' : 'rgba(255,255,255,0.07)' ) }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>{day.date}</span>
                                    {isLatest && <span className="macos-badge macos-badge-orange">TODAY</span>}
                                  </div>
                                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                                    <span style={{ fontSize: 13, color: '#FF9500', fontWeight: 700 }}>{formatCurrency(dayTotal)}</span>
                                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{formatTokens(dayTokens)} tok</span>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </>
                      )}

                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 4 }}>
                        Source: CodexBar · {codexbarCosts.updatedAt ? 'Updated ' + new Date(codexbarCosts.updatedAt).toLocaleString() : 'Loading...'}
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: '48px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.45)' }}>
                      <div style={{ fontSize: 14, marginBottom: 8 }}>CodexBar verisi yok</div>
                      <div style={{ fontSize: 12 }}>Mission Control + CodexBar entegrasyonu aktif değil</div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: 14 }}>
                  {costSignals.map(signal => {
                    const Icon = signal.icon
                    return (
                      <div
                        key={signal.title}
                        style={{
                          padding: m ? '14px' : '16px',
                          borderRadius: 18,
                          background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 12px 30px ${signal.accent}18`,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.94)', fontWeight: 700 }}>
                          <Icon size={15} style={{ color: signal.accent }} />
                          {signal.title}
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)', lineHeight: 1.6, marginTop: 10 }}>{signal.body}</div>
                      </div>
                    )
                  })}

                  <div
                    style={{
                      padding: m ? '14px' : '16px',
                      borderRadius: 18,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      gridColumn: m ? 'auto' : '1 / -1',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.9)', fontWeight: 700 }}>
                      <Zap size={15} style={{ color: '#FF9500' }} />
                      Methodology
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, marginTop: 10 }}>
                      {codexbarActive
                        ? 'This view is backed by CodexBar invoice data from OpenAI — the authoritative source.'
                        : hasAwsData
                        ? 'This view is backed by AWS billing data.'
                        : ledgerActive
                          ? tokenData.source === 'openclaw.usage'
                            ? 'This view is backed by OpenClaw usage summaries extracted from session transcripts.'
                            : 'This view is backed by token ledger rows and estimated model pricing.'
                          : 'This view is currently using session token fallback, so spend is estimated from token volume rather than model-resolved ledger data.'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </GlassCard>

          {isAwsEnabled && hasAwsData && awsCosts && (
            <GlassCard delay={0.35} noPad>
              <div style={{ padding: m ? '16px' : '24px' }}>
                <div style={{ marginBottom: m ? '16px' : '24px' }}>
                  <h3 style={{ fontSize: m ? '15px' : '16px', fontWeight: '600', color: 'rgba(255,255,255,0.92)', margin: 0 }}>Credits Runway</h3>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
                    How long the remaining AWS credit balance can support current usage.
                  </div>
                </div>
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: m ? '12px' : '14px', color: 'rgba(255,255,255,0.65)' }}>Used</span>
                    <span style={{ fontSize: m ? '12px' : '14px', color: 'rgba(255,255,255,0.92)', fontFamily: 'system-ui', fontFeatureSettings: '"tnum"' }}>
                      {formatCurrency(creditsUsed)} / {formatCurrency(awsCosts.credits)}
                    </span>
                  </div>
                  <div style={{ height: '12px', background: 'rgba(255,255,255,0.1)', borderRadius: '6px', overflow: 'hidden' }}>
                    <div style={{ width: `${(creditsUsed / awsCosts.credits) * 100}%`, height: '100%', background: creditsUsed / awsCosts.credits > 0.75 ? '#FF453A' : creditsUsed / awsCosts.credits > 0.5 ? '#FF9500' : '#32D74B', borderRadius: '6px', transition: 'width 0.6s ease' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: m ? '12px' : '13px', color: 'rgba(255,255,255,0.45)' }}>At current rate, credits last:</span>
                    <span style={{ fontSize: m ? '12px' : '13px', color: 'rgba(255,255,255,0.92)', fontWeight: '600' }}>{burnRate === Infinity ? '∞' : `${Math.round(burnRate)} days`}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: m ? '12px' : '13px', color: 'rgba(255,255,255,0.45)' }}>Daily burn rate:</span>
                    <span style={{ fontSize: m ? '12px' : '13px', color: 'rgba(255,255,255,0.92)', fontWeight: '600' }}>{formatCurrency(dailyAvg)}/day</span>
                  </div>
                </div>
              </div>
            </GlassCard>
          )}
        </div>
      </div>
    </PageTransition>
  )
}
