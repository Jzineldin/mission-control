// All shared type declarations for the Costs page and its sub-components.

export interface AWSSCostData {
  period: { start: string; end: string }
  total: number
  daily: Array<{ date: string; cost: number }>
  services: Array<{ name: string; cost: number }>
  credits: number
  remaining: number
}

export interface TokenDailyEntry {
  date: string
  cost?: number
  tokens?: number
}

export interface ModelDailyEntry {
  date: string
  totalCost?: number
  totalTokens?: number
  models?: Record<string, { cost?: number; tokens?: number }>
  [key: string]: unknown
}

export interface TokenServiceData {
  name: string
  cost?: number
  tokens?: number
  percentage?: number
  costSource?: string
  costStatus?: string
  billingModes?: string
  costNote?: string
}

export interface AgentUsageData {
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

export interface TokenData {
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

export interface CodexBarDailyEntry {
  date: string
  totalCost: number
  totalTokens: number
  inputTokens: number
  outputTokens: number
  models: Array<{ model: string; cost: number; totalTokens: number }>
}

export interface CodexBarCostData {
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

export interface SessionData {
  key: string
  model: string
  totalTokens: number
  updatedAt: string | null
  displayName?: string
}

export interface ConfigData {
  modules: {
    aws?: boolean
    [key: string]: boolean | undefined
  }
}

export interface ChartSeriesItem {
  model: string
  key: string
  color: string
  totalCost: number
  totalTokens: number
  rawModels?: string[]
}

export interface ChartDataRow {
  day: string
  fullDate: string
  total: number
  totalTokens: number
  [key: string]: string | number
}

export interface AggregatedBreakdownItem {
  name: string
  rawNames: string[]
  tokens: number
  cost: number
  share: number
  local: boolean
  color: string
}

export interface ChartTooltipPayloadItem {
  value?: string | number
  name?: string
  dataKey?: string | number
  color?: string
  payload?: Record<string, string | number | undefined>
}
