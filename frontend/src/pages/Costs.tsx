import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApi, fetchJson } from '../lib/hooks'
import {
  AlertCircle,
  Cloud,
  Cpu,
  Target,
  TrendingUp,
} from 'lucide-react'
import PageTransition from '../components/PageTransition'
import { useIsMobile } from '../lib/useIsMobile'
import type {
  AWSSCostData,
  TokenData,
  CodexBarCostData,
  SessionData,
  ConfigData,
  ChartSeriesItem,
  ChartDataRow,
  AggregatedBreakdownItem,
} from './costs/types'
import {
  formatCurrency,
  formatTokens,
  formatCompactTokenValue,
  formatSessionName,
  getModelColor,
  getServiceColor,
  canonicalModelName,
  isLocalModel,
  toChartKey,
  estimateCost,
  calculateTrend,
  costReliabilityLabel,
  sumCostRows,
  previousCodexbarRows,
  comparisonLabels,
  readNumericField,
  hasUsableAgentSplitData,
} from './costs/lib'
import CostPulseHeader from './costs/CostPulseHeader'
import AgentSplitCard from './costs/AgentSplitCard'
import type { AgentSplitItem } from './costs/AgentSplitCard'
import MetricCards from './costs/MetricCards'
import BudgetCard from './costs/BudgetCard'
import DailySpendSection from './costs/DailySpendSection'
import type { SessionEstimateDay, BlendedCostItem } from './costs/DailySpendSection'
import CostDriversSection from './costs/CostDriversSection'




export default function Costs() {
  const m = useIsMobile()
  const queryClient = useQueryClient()
  const [period, setPeriod] = useState<'day' | '7d' | 'month'>('month')
  const [activeChartDate, setActiveChartDate] = useState<string | null>(null)
  const [driverView, setDriverView] = useState<'models' | 'sessions' | 'codexbar' | 'notes'>('models')
  const [fallbackSessionTimestamp] = useState(() => Date.now() / 1000)

  // ---- Four period-independent fetches ----
  const { data: awsCosts } = useApi<AWSSCostData>('/api/aws/costs')
  const { data: configRaw } = useApi<ConfigData>('/api/config')
  const { data: sessionsRaw } = useApi<{ sessions: SessionData[] }>('/api/sessions')
  const { data: codexbarRaw } = useApi<CodexBarCostData & { error?: string }>('/api/costs/codexbar')

  const config: ConfigData = configRaw ?? { modules: {} }
  const sessions: SessionData[] = useMemo(() => sessionsRaw?.sessions ?? [], [sessionsRaw])
  const codexbarCosts: CodexBarCostData | null =
    codexbarRaw && !codexbarRaw.error ? (codexbarRaw as CodexBarCostData) : null

  // ---- Costs query with stale-retry ----
  const costsQuery = useQuery<TokenData, Error>({
    queryKey: ['api', `/api/costs?period=${period}`],
    queryFn: () => fetchJson<TokenData>(`/api/costs?period=${period}`),
    refetchInterval: (query) => {
      const tokens = query.state.data
      const stale =
        tokens?.source === 'sessions.fast_fallback' ||
        tokens?.meta?.refreshing ||
        tokens?.meta?.stale
      return stale ? 2500 : false
    },
    refetchOnWindowFocus: false,
  })

  const tokenData: TokenData | null = costsQuery.data ?? null
  const loading = costsQuery.isLoading
  const error: string | null = costsQuery.error ? String(costsQuery.error.message || 'Unknown error') : null

  // ---- budget / budgetInput — initialized once when tokenData first arrives ----
  // Using render-phase sentinel pattern (same as Calendar.tsx formKey) to avoid
  // setState-in-effect which is an ESLint error in this repo.
  const [budgetSeenKey, setBudgetSeenKey] = useState<string | undefined>(undefined)
  const [budget, setBudget] = useState<number>(0)
  const [budgetInput, setBudgetInput] = useState<string>('')

  const budgetFromData = tokenData?.budget?.monthly ?? 0
  // Derive a stable key from whether we have data yet
  const budgetDataKey = tokenData ? 'loaded' : undefined
  if (budgetDataKey !== undefined && budgetDataKey !== budgetSeenKey) {
    setBudgetSeenKey(budgetDataKey)
    setBudget(budgetFromData)
    setBudgetInput(budgetFromData.toString())
  }

  // ---- saveBudget mutation ----
  const saveBudgetMutation = useMutation({
    mutationFn: (monthly: number) =>
      fetchJson('/api/settings/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthly }),
      }),
    onSuccess: (_data, monthly) => {
      setBudget(monthly)
      void queryClient.invalidateQueries({ queryKey: ['api', `/api/costs?period=${period}`] })
    },
  })

  const savingBudget = saveBudgetMutation.isPending

  const saveBudget = () => {
    if (!budgetInput.trim()) return
    saveBudgetMutation.mutate(parseFloat(budgetInput) || 0)
  }

  const labels = {
    thisMonth: m ? 'Month' : 'This Month',
    creditsLeft: m ? 'Credits' : 'Credits Left',
    dailyAvg: m ? 'Daily Avg' : 'Daily Average',
    projected: m ? 'Projected' : 'Projected Monthly',
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
        <CostPulseHeader
          m={m}
          period={period}
          setPeriod={setPeriod}
          activePeriodLabel={activePeriodLabel}
          hasAwsData={hasAwsData}
          ledgerActive={ledgerActive}
          costSourceLabel={costSourceLabel}
          overviewPills={overviewPills}
          codexbarActive={codexbarActive}
          codexbarCosts={codexbarCosts}
          codexbarPeriodTokens={codexbarPeriodTokens}
          currentPeriodCost={currentPeriodCost}
          dailyAvg={dailyAvg}
          projectedMonthly={projectedMonthly}
        />

        {(agentSplit.length > 0 || agentSplitPending) && (
          <AgentSplitCard
            m={m}
            agentSplit={agentSplit as AgentSplitItem[]}
            agentSplitPending={agentSplitPending}
            activePeriodLabel={activePeriodLabel}
            agentSplitPeriodLabel={agentSplitPeriodLabel}
            totalAgentTokens={totalAgentTokens}
            tokenDataRefreshing={!!(tokenData?.meta?.refreshing)}
          />
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

        <MetricCards
          m={m}
          isAwsEnabled={isAwsEnabled}
          hasAwsData={hasAwsData}
          awsCosts={awsCosts ?? null}
          currentPeriodCost={currentPeriodCost}
          dailyAvg={dailyAvg}
          projectedMonthly={projectedMonthly}
          previousPeriodCost={previousPeriodCost}
          previousDailyAvg={previousDailyAvg}
          monthlyTrend={monthlyTrend}
          dailyTrend={dailyTrend}
          compareLabel={compareLabel}
          period={period}
          labels={labels}
          activePeriodLabel={activePeriodLabel}
        />

        <BudgetCard
          m={m}
          budget={budget}
          budgetInput={budgetInput}
          setBudgetInput={setBudgetInput}
          saveBudget={saveBudget}
          savingBudget={savingBudget}
          budgetUsagePct={budgetUsagePct}
          budgetUsage={budgetUsage}
          budgetRemaining={budgetRemaining}
          budgetBadgeClass={budgetBadgeClass}
          monthlyBudgetBase={monthlyBudgetBase}
        />

        <DailySpendSection
          m={m}
          chartData={chartData}
          chartSeries={chartSeries}
          hasChartBars={hasChartBars}
          useMobileDailyChart={useMobileDailyChart}
          activeChartDate={activeChartDate}
          setActiveChartDate={setActiveChartDate}
          chartDayCount={chartDayCount}
          codexbarActive={codexbarActive}
          ledgerActive={ledgerActive}
          hasAwsData={hasAwsData}
          activePeriodLabel={activePeriodLabel}
          awsCosts={awsCosts ?? null}
          hasSessionEstimateChart={hasSessionEstimateChart}
          sessionEstimateData={sessionEstimateData as SessionEstimateDay[]}
          projectedMonthly={projectedMonthly}
          totalTokens={totalTokens}
          tokenBasedCost={tokenBasedCost}
          blendedCostBreakdown={blendedCostBreakdown as BlendedCostItem[]}
        />

        <CostDriversSection
          m={m}
          isAwsEnabled={isAwsEnabled}
          hasAwsData={hasAwsData}
          awsCosts={awsCosts ?? null}
          codexbarActive={codexbarActive}
          codexbarCosts={codexbarCosts}
          codexbarLatest={codexbarLatest}
          driverView={driverView}
          setDriverView={setDriverView}
          tokenBreakdown={tokenBreakdown}
          topSessions={topSessions}
          sessionPressureMax={sessionPressureMax}
          costSignals={costSignals}
          creditsUsed={creditsUsed}
          burnRate={burnRate}
          dailyAvg={dailyAvg}
          ledgerActive={ledgerActive}
          tokenDataSource={tokenData?.source}
        />
      </div>
    </PageTransition>
  )
}