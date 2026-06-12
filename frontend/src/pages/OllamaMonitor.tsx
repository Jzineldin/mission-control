import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Server, Activity, Boxes, Cpu, Gauge, HardDrive, RefreshCw, CircleAlert, Clock3, Settings2, Save, Wand2, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import GlassCard from '../components/GlassCard'
import StatusBadge from '../components/StatusBadge'
import { useApi } from '../lib/hooks'
import styles from './OllamaMonitor.module.css'

type OllamaModel = {
  name: string
  status: 'running' | 'ready'
  sizeLabel?: string | null
  digest?: string | null
  parameterSize?: string | null
  quantization?: string | null
  format?: string | null
  family?: string | null
  keepAlive?: string | null
  expiresAt?: string | null
  loadedAt?: string | null
}

type OllamaGpuDevice = {
  index: string
  name: string
  vendor?: string | null
  cores?: string | null
  utilGpu?: number | null
  utilMemory?: number | null
  memTotalMiB?: number | null
  memUsedMiB?: number | null
  memFreeMiB?: number | null
  tempC?: number | null
  powerDraw?: number | null
  powerLimit?: number | null
  memUsedEstimate?: boolean
  metricSource?: string | null
  memorySource?: string | null
}

type OllamaGpu = {
  available: boolean
  platform?: string
  limited?: boolean
  limitation?: string
  error?: string
  tried?: string[]
  devices?: OllamaGpuDevice[]
}

type OllamaOptimizationProfile = {
  enabled: boolean
  strategy: 'conservative' | 'balanced' | 'performance'
  keepAlive: string
  maxLoadedModels: number
  numCtx: number
  numParallel: number
}

type OllamaOptimizationRecommendation = OllamaOptimizationProfile & {
  reasons: string[]
}

type OllamaAlert = {
  code: string
  severity: 'critical' | 'warning' | string
  message: string
  triggeredAt: string
  suppressed: boolean
  cooldownUntil: string
}

type OllamaTelemetryHistoryItem = {
  generatedAt: string
  healthScore: number
  status: 'online' | 'degraded' | 'offline'
  latencyMs: number | null
  memoryUsedPercent: number
  cpuUsagePercent: number
  gpuUtilPercent?: number | null
  gpuMemoryPercent?: number | null
  runningModels: number
  totalModels: number
  alerts: OllamaAlert[]
}

type OllamaTelemetryHistoryResponse = {
  generatedAt: string
  history: OllamaTelemetryHistoryItem[]
  total: number
}

type OllamaModelTelemetryItem = {
  name: string
  requestCount: number
  errorCount: number
  errorRate: number
  avgLatencyMs: number | null
  p95LatencyMs: number | null
  requestsPerMinute: number
  status: string
  estimated: boolean
}

type OllamaModelTelemetryResponse = {
  generatedAt: string
  mode: string
  estimated: boolean
  telemetrySource: string
  limitations?: string[]
  windowMs: number
  models: OllamaModelTelemetryItem[]
}

type TokenServiceUsage = {
  name: string
  cost?: number
  tokens?: number
  sessions?: number
  percentage?: number
  agent?: string
  costSource?: string
  costStatus?: string
  billingModes?: string
}

type TokenUsageResponse = {
  source?: string
  period?: { key?: string; start?: string | null; end?: string | null }
  summary?: {
    periodTokens?: number
    totalTokens?: number
  }
  byService?: TokenServiceUsage[]
  meta?: {
    updatedAt?: string
    refreshing?: boolean
    stale?: boolean
    ageMs?: number
  }
}

type ModelTokenUsage = {
  tokens: number
  sessions: number
  cost: number
  percentage: number
  sources: string[]
  costSources: string[]
}

type OllamaOptimizationPayload = {
  enabled: boolean
  current: OllamaOptimizationProfile
  recommendation: OllamaOptimizationRecommendation
  applyCommands: string[]
  platform: string
}

type OllamaTelemetry = {
  generatedAt: string
  healthScore: number
  alerts: OllamaAlert[]
  server: {
    baseUrl: string
    status: 'online' | 'degraded' | 'offline'
    enabled: boolean
    host: string
    port: number
    latencyMs?: number | null
    version?: string | null
    checks?: {
      ps: { ok: boolean; error?: string | null }
      tags: { ok: boolean; error?: string | null }
      version: { ok: boolean; error?: string | null }
    }
    error?: string | null
  }
  runtime: {
    runningModels: number
    totalModels: number
    canAcceptRequests: boolean
  }
  models: OllamaModel[]
  optimization?: OllamaOptimizationPayload
  system: {
    cpu: {
      cores: number
      load1: number
      load5: number
      load15: number
      usagePercent: number
    }
    memory: {
      totalBytes: number
      freeBytes: number
      usedBytes: number
      usedPercent: number
    }
    node: {
      uptimeSeconds: number
    }
    measuredAt: string
  }
  gpu?: OllamaGpu
}

const STATUS_GREEN = '#32D74B'
const STATUS_AMBER = '#FFD60A'
const STATUS_RED = '#FF453A'
const STATUS_GRAY = '#8E8E93'

function formatBytes(bytes?: number | null) {
  if (!Number.isFinite(bytes || NaN) || (bytes || 0) <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = Number(bytes)
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

function formatMiB(v?: number | null) {
  if (!Number.isFinite(v || NaN) || (v || 0) <= 0) return '—'
  return `${v} MB`
}

function finiteNumber(value?: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function presentText(value?: string | null): string | null {
  const text = String(value || '').trim()
  return text && text !== '—' ? text : null
}

function modelMetaParts(model: OllamaModel) {
  return [model.parameterSize, model.quantization, model.format].map(presentText).filter(Boolean) as string[]
}

function hasAnyGpuMetricValue(
  devices?: OllamaGpuDevice[],
  options?: {
    includeEstimated?: boolean
  },
): boolean {
  if (!devices?.length) return false
  const includeEstimated = options?.includeEstimated ?? false
  return devices.some((device) => {
    const memUsed = Number.isFinite(device.memUsedMiB as number) && (!device.memUsedEstimate || includeEstimated)
      ? device.memUsedMiB
      : null
    return [device.utilGpu, device.utilMemory, device.tempC, device.powerDraw, device.powerLimit, memUsed].some((value) => Number.isFinite(value as number))
  })
}

function formatTime(dateStr?: string | null) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function healthColor(score: number) {
  if (score >= 85) return STATUS_GREEN
  if (score >= 60) return STATUS_AMBER
  return STATUS_RED
}

function percentTone(percent: number) {
  if (percent >= 92) return STATUS_RED
  if (percent >= 80) return STATUS_AMBER
  return STATUS_GREEN
}

function serverTone(status: string) {
  if (status === 'online') return STATUS_GREEN
  if (status === 'degraded') return STATUS_AMBER
  return STATUS_RED
}

function formatMetric(value?: number | null, digits = 2) {
  if (!Number.isFinite(value as number)) return '—'
  return Number(value).toFixed(digits)
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

function formatErrorRate(rate?: number | null) {
  if (!Number.isFinite(rate as number)) return '0.0%'
  return (Number(rate) * 100).toFixed(1) + '%'
}

function formatTokens(value?: number | null) {
  const n = Number(value || 0)
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(n >= 10_000_000_000 ? 1 : 2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 1 : 2)}K`
  return String(Math.round(n))
}

function canonicalLocalModelName(value?: string | null) {
  return String(value || '')
    .trim()
    .replace(/^(OpenClaw|Hermes)\s*\/\s*/i, '')
    .replace(/^(ollama|custom|lmstudio|local)\//i, '')
    .replace(/:latest$/i, '')
    .toLowerCase()
}

function aggregateLocalTokenUsage(services: TokenServiceUsage[] = []) {
  const usage = new Map<string, ModelTokenUsage>()
  for (const service of services) {
    const rawName = String(service.name || '')
    const localLike = /(^|\/\s*)(ollama|custom|lmstudio|local)\//i.test(rawName)
    if (!localLike) continue
    const key = canonicalLocalModelName(rawName)
    if (!key) continue
    const existing = usage.get(key) || { tokens: 0, sessions: 0, cost: 0, percentage: 0, sources: [], costSources: [] }
    existing.tokens += Number(service.tokens || 0)
    existing.sessions += Number(service.sessions || 0)
    existing.cost += Number(service.cost || 0)
    existing.percentage += Number(service.percentage || 0)
    const source = String(service.agent || '').trim() || rawName.split('/')[0]?.trim()
    if (source && !existing.sources.includes(source)) existing.sources.push(source)
    const costSource = String(service.costSource || service.costStatus || service.billingModes || '').trim()
    if (costSource && !existing.costSources.includes(costSource)) existing.costSources.push(costSource)
    usage.set(key, existing)
  }
  return usage
}

function modelTelemetryLabels(estimated?: boolean) {
  if (!estimated) {
    return {
      rate: 'Req/min',
      volume: 'Requests in window',
      volumeShort: 'Requests',
      error: 'Average error rate',
      errorShort: 'Err%',
      latency: 'p95 latency',
      source: 'Request telemetry',
      note: 'Backed by request telemetry when available.',
    }
  }

  return {
    rate: 'Samples/min',
    volume: 'Samples in window',
    volumeShort: 'Samples',
    error: 'Status error pressure',
    errorShort: 'Err pressure',
    latency: 'Probe p95',
    source: 'Estimated telemetry',
    note: 'Estimated from monitor snapshots and Ollama health probes; this is not a real request log.',
  }
}

function summarizePercentTrend(values: number[]) {
  const valid = values.filter((v) => Number.isFinite(v))
  if (!valid.length) return '—'
  const current = valid[valid.length - 1]
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  return `Now ${Math.round(current)}% · Min ${Math.round(min)}% · Max ${Math.round(max)}%`
}

function safeProfile(current: OllamaOptimizationProfile): OllamaOptimizationProfile {
  return {
    enabled: !!current?.enabled,
    strategy: current?.strategy === 'conservative' || current?.strategy === 'performance' ? current.strategy : 'balanced',
    keepAlive: String(current?.keepAlive || '5m').trim(),
    maxLoadedModels: Number.isFinite(current?.maxLoadedModels as number) ? Number(current?.maxLoadedModels) : 2,
    numCtx: Number.isFinite(current?.numCtx as number) ? Number(current?.numCtx) : 2048,
    numParallel: Number.isFinite(current?.numParallel as number) ? Number(current?.numParallel) : 1,
  }
}

function renderSparkline(values: number[], color: string, gradientId: string) {
  if (!values.length) {
    return <div className={styles.mutedSmall}>No metrics yet</div>
  }
  if (values.length === 1) {
    return <p className={styles.mutedSmall}>{`${Math.round(values[0])}%`}</p>
  }

  const width = 260
  const height = 44
  const pad = 6
  const clamped = values.map((v) => Math.max(0, Math.min(100, v)))
  const min = Math.min(...clamped)
  const max = Math.max(...clamped)
  const span = Math.max(1, max - min)
  const points = clamped
    .map((v, index) => {
      const x = (index / (clamped.length - 1)) * width
      const y = (height - pad) - ((v - min) / span) * (height - pad * 2)
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height: '52px', display: 'block' }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={`0,${height - pad} ${points} ${width},${height - pad}`}
        fill={`url(#${gradientId})`}
        opacity={0.25}
      />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MetricPill({ label, value, tone, title }: { label: string; value: string; tone?: 'estimate' | 'ok'; title?: string }) {
  return (
    <div className={`${styles.pill} ${tone === 'estimate' ? styles.pillEstimate : ''}`} title={title}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function OllamaLoadingState() {
  return (
    <PageTransition>
      <div className={styles.page}>
        <div className={styles.topBar}>
          <div>
            <div className={styles.titleRow}>
              <span className={styles.titleIcon}><Server size={20} /></span>
              <h1>Ollama Monitor</h1>
            </div>
            <p className={styles.subtitle}>Loading local model telemetry. Ollama is often a 10-15s check on first paint.</p>
          </div>
          <StatusBadge status="idle" label="Loading" />
        </div>

        <GlassCard delay={0.04} noPad>
          <div className={styles.loadingCard}>
            <div className={styles.loadingSpinner} />
            <div>
              <strong>Checking local inference health</strong>
              <small>Server, loaded models, GPU, memory, and optimization policy.</small>
            </div>
          </div>
        </GlassCard>

        <div className={styles.loadingGrid}>
          {['Server', 'Models', 'Memory', 'GPU'].map((label) => (
            <GlassCard key={label} delay={0.06} noPad>
              <div className={styles.loadingPanel}>
                <p>{label}</p>
                <div className={styles.shimmer} style={{ width: '68%', height: 14 }} />
                <div className={styles.shimmer} style={{ width: '42%', height: 10, opacity: 0.7 }} />
              </div>
            </GlassCard>
          ))}
        </div>
      </div>
    </PageTransition>
  )
}

export default function OllamaMonitor() {
  const { data, loading, error, refetch } = useApi<OllamaTelemetry>('/api/ollama/telemetry', 2500)
  const { data: historyData } = useApi<OllamaTelemetryHistoryResponse>('/api/ollama/telemetry/history', 5000)
  const { data: modelTelemetryData } = useApi<OllamaModelTelemetryResponse>('/api/ollama/telemetry/models', 5000)
  const [usagePeriod, setUsagePeriod] = useState<'day' | '7d' | 'month'>('month')
  const { data: tokenUsageData } = useApi<TokenUsageResponse>(`/api/costs?period=${usagePeriod}`, 60000)
  const [optimizationProfile, setOptimizationProfile] = useState<OllamaOptimizationProfile | null>(null)
  const [isSavingOptimization, setIsSavingOptimization] = useState(false)
  const [optimizationMessage, setOptimizationMessage] = useState('')
  const [optimizationDirty, setOptimizationDirty] = useState(false)
  const [isRollingBackOptimization, setIsRollingBackOptimization] = useState(false)
  const [expandedModels, setExpandedModels] = useState<Record<string, boolean>>({})

  const models = useMemo(() => data?.models || [], [data?.models])
  const modelMetrics = useMemo(() => modelTelemetryData?.models || [], [modelTelemetryData?.models])
  const modelTelemetryIsEstimated = !!modelTelemetryData?.estimated
  const modelLabels = useMemo(() => modelTelemetryLabels(modelTelemetryIsEstimated), [modelTelemetryIsEstimated])
  const modelMetricMap = useMemo(() => {
    return new Map(modelMetrics.map((metric) => [metric.name, metric]))
  }, [modelMetrics])
  const modelTokenUsageMap = useMemo(() => aggregateLocalTokenUsage(tokenUsageData?.byService || []), [tokenUsageData?.byService])
  const getModelTokenUsage = (name: string) => modelTokenUsageMap.get(canonicalLocalModelName(name))
  const tokenUsageSummary = useMemo(() => {
    const totalTokens = Array.from(modelTokenUsageMap.values()).reduce((sum, usage) => sum + usage.tokens, 0)
    const matchedTokens = models.reduce((sum, model) => sum + (modelTokenUsageMap.get(canonicalLocalModelName(model.name))?.tokens || 0), 0)
    const visibleModelsWithTokens = models.filter((model) => (modelTokenUsageMap.get(canonicalLocalModelName(model.name))?.tokens || 0) > 0).length
    return { totalTokens, matchedTokens, visibleModelsWithTokens }
  }, [modelTokenUsageMap, models])
  const modelSummary = useMemo(() => {
    const totalModels = models.length
    const runningCount = models.filter((model) => model.status === 'running').length
    const avgErrorRate = modelMetrics.length
      ? modelMetrics.reduce((sum, metric) => sum + (Number.isFinite(metric.errorRate) ? Number(metric.errorRate) : 0), 0) / modelMetrics.length
      : 0
    const totalRequests = modelMetrics.reduce((sum, metric) => sum + (Number.isFinite(metric.requestCount) ? Number(metric.requestCount) : 0), 0)

    return {
      totalModels,
      runningCount,
      avgErrorRate,
      totalRequests,
    }
  }, [modelMetrics, models])
  const allModelsExpanded = models.length > 0 && models.every((model) => expandedModels[model.name])
  const runningModelNames = useMemo(() => {
    return models
      .filter((model) => model.status === 'running')
      .map((model) => model.name)
      .filter(Boolean)
  }, [models])
  const visibleRunningModelNames = runningModelNames.slice(0, 2)
  const hiddenRunningModelCount = Math.max(0, runningModelNames.length - visibleRunningModelNames.length)
  const latestModelAt = useMemo(() => {
    let latest = ''
    for (const model of models) {
      const candidate = model.loadedAt || model.expiresAt || ''
      if (candidate && candidate > latest) latest = candidate
    }
    return latest ? formatTime(latest) : '—'
  }, [models])

  const gpu = data?.gpu
  const gpuHasDevices = !!gpu?.devices?.length
  const hasLiveGpuMetrics = hasAnyGpuMetricValue(gpu?.devices || [], { includeEstimated: false })
  const hasAnyGpuMetrics = hasAnyGpuMetricValue(gpu?.devices || [], { includeEstimated: true })
  const hasEstimatedGpuMetrics = hasAnyGpuMetrics && !hasLiveGpuMetrics
  const gpuPlatform = gpu?.platform || 'linux'
  const gpuLabel = !gpuHasDevices
    ? 'No metrics'
    : hasLiveGpuMetrics && !gpu?.limited
      ? 'Active'
      : hasEstimatedGpuMetrics
        ? 'Estimated'
        : 'Partial'
  const gpuBadgeStatus = !gpu?.available || !gpuHasDevices ? 'error' : gpu?.limited ? 'idle' : 'ok'

  const optimization = data?.optimization
  const optimizationCurrent = optimization?.current
  const baseOptimizationProfile = useMemo(() => {
    return optimizationCurrent ? safeProfile(optimizationCurrent) : null
  }, [optimizationCurrent])
  const activeOptimizationProfile = optimizationDirty ? optimizationProfile : baseOptimizationProfile
  const recommendation = optimization?.recommendation
  const platform = optimization?.platform || 'unknown'
  const recommendationDiffers = useMemo(() => {
    if (!recommendation || !baseOptimizationProfile) return false
    const rec = safeProfile(recommendation)
    const cur = baseOptimizationProfile
    return (
      rec.strategy !== cur.strategy ||
      rec.keepAlive !== cur.keepAlive ||
      rec.maxLoadedModels !== cur.maxLoadedModels ||
      rec.numCtx !== cur.numCtx ||
      rec.numParallel !== cur.numParallel
    )
  }, [recommendation, baseOptimizationProfile])
  const healthScore = Number.isFinite(Number(data?.healthScore)) ? Number(data?.healthScore) : 0
  const alertNotes = useMemo(() => {
    return data?.alerts || []
  }, [data?.alerts])
  const healthHistory = useMemo(() => historyData?.history || [], [historyData?.history])
  const healthTrend = useMemo(() => {
    return healthHistory
      .map((item) => item.healthScore)
      .filter((score) => Number.isFinite(score))
      .slice(-20)
  }, [healthHistory])

  const updateOptimizationProfile = (next: Partial<OllamaOptimizationProfile>) => {
    setOptimizationProfile((prev) => {
      const current = prev || activeOptimizationProfile
      if (!current) {
        return null
      }
      const updated = { ...current, ...next }
      setOptimizationDirty(true)
      return updated
    })
  }

  const toggleModelExpanded = (name: string) => {
    setExpandedModels((prev) => ({
      ...prev,
      [name]: !prev[name],
    }))
  }

  const setAllModelsExpanded = (expanded: boolean) => {
    setExpandedModels(
      Object.fromEntries(models.map((model) => [model.name, expanded])),
    )
  }

  const handleCopyCommands = async (commands: string[]) => {
    if (!commands.length) return
    await navigator.clipboard.writeText(commands.join('\n'))
    setOptimizationMessage('Apply commands copied to clipboard.')
    setTimeout(() => setOptimizationMessage(''), 2500)
  }

  const applyRecommendationToForm = () => {
    if (!recommendation) return
    setOptimizationProfile(recommendation)
    setOptimizationDirty(true)
    setOptimizationMessage('Recommendation loaded into the form. Save to apply.')
    setTimeout(() => setOptimizationMessage(''), 2500)
  }

  const handleSaveOptimization = async () => {
    if (!activeOptimizationProfile) return
    setIsSavingOptimization(true)
    setOptimizationMessage('')
    try {
      const dryRunResponse = await fetch('/api/ollama/optimization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dry-run', profile: activeOptimizationProfile }),
      })
      if (!dryRunResponse.ok) {
        const text = await dryRunResponse.text()
        throw new Error(text || `HTTP ${dryRunResponse.status}`)
      }
      const dryRun = await dryRunResponse.json()
      const changedKeys = Array.isArray(dryRun?.diff?.changed) ? dryRun.diff.changed : []
      const confirmed = window.confirm(
        changedKeys.length
          ? `These settings will change: ${changedKeys.join(', ')}. Apply?`
          : 'No changes detected. Apply anyway?'
      )
      if (!confirmed) {
        setOptimizationMessage('Apply cancelled.')
        return
      }

      const applyResponse = await fetch('/api/ollama/optimization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', profile: activeOptimizationProfile, confirm: true }),
      })
      if (!applyResponse.ok) {
        const text = await applyResponse.text()
        throw new Error(text || `HTTP ${applyResponse.status}`)
      }
      const applied = await applyResponse.json()
      const verifyOk = applied?.verification?.ok ? 'OK' : 'FAIL'
      setOptimizationDirty(false)
      setOptimizationMessage(`Settings applied. Post-apply verify: ${verifyOk}${applied?.verification?.latencyMs ? ` (${applied.verification.latencyMs}ms)` : ''}.`)
      await refetch()
    } catch (err: unknown) {
      setOptimizationMessage(errorMessage(err, 'Save failed'))
    } finally {
      setIsSavingOptimization(false)
      setTimeout(() => setOptimizationMessage(''), 4000)
    }
  }

  const handleRollbackOptimization = async () => {
    setIsRollingBackOptimization(true)
    setOptimizationMessage('')
    try {
      const confirmed = window.confirm('Roll back the last optimization change?')
      if (!confirmed) {
        setOptimizationMessage('Rollback cancelled.')
        return
      }
      const response = await fetch('/api/ollama/optimization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rollback', confirm: true }),
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `HTTP ${response.status}`)
      }
      const rolled = await response.json()
      setOptimizationDirty(false)
      setOptimizationMessage(`Rollback complete. Verify: ${rolled?.verification?.ok ? 'OK' : 'FAIL'}`)
      await refetch()
    } catch (err: unknown) {
      setOptimizationMessage(errorMessage(err, 'Rollback failed'))
    } finally {
      setIsRollingBackOptimization(false)
      setTimeout(() => setOptimizationMessage(''), 4000)
    }
  }

  const visibleGpuUtilHistory = useMemo(() => {
    if (!data?.gpu?.available) return []
    return healthHistory
      .map((item) => item.gpuUtilPercent)
      .filter((value): value is number => Number.isFinite(value))
      .slice(-30)
  }, [data?.gpu?.available, healthHistory])
  const visibleGpuMemHistory = useMemo(() => {
    if (!data?.gpu?.available) return []
    return healthHistory
      .map((item) => item.gpuMemoryPercent)
      .filter((value): value is number => Number.isFinite(value))
      .slice(-30)
  }, [data?.gpu?.available, healthHistory])

  if (loading && !data) {
    return <OllamaLoadingState />
  }

  if (!data || error) {
    return (
      <PageTransition>
        <div className={styles.errorWrap}>
          <CircleAlert size={48} />
          <p>{error || 'Could not load Ollama telemetry'}</p>
          <button className={styles.retryButton} onClick={() => refetch()}>
            Retry
          </button>
        </div>
      </PageTransition>
    )
  }

  const firstGpuDevice = gpu?.devices?.[0]
  const gpuLoadNow = finiteNumber(firstGpuDevice?.utilGpu)
  const cpuPercent = data.system.cpu.usagePercent
  const memPercent = data.system.memory.usedPercent
  const periodLabel = usagePeriod === 'day' ? 'Today' : usagePeriod === '7d' ? 'Last 7 days' : 'This month'

  const heroCards: { label: string; icon: ReactNode; value: string; detail: string; color: string; spark?: number[] }[] = [
    {
      label: 'Health score',
      icon: <Gauge size={13} />,
      value: String(healthScore),
      detail: 'Overall health, scored 0-100',
      color: healthColor(healthScore),
      spark: healthTrend,
    },
    {
      label: 'Server',
      icon: <Server size={13} />,
      value: data.server.status.charAt(0).toUpperCase() + data.server.status.slice(1),
      detail: `${data.server.baseUrl}${data.server.version ? ` · v${data.server.version}` : ''}`,
      color: serverTone(data.server.status),
    },
    {
      label: 'Models loaded',
      icon: <Boxes size={13} />,
      value: `${data.runtime.runningModels}/${data.runtime.totalModels}`,
      detail: runningModelNames.length
        ? `${visibleRunningModelNames.join(', ')}${hiddenRunningModelCount ? ` +${hiddenRunningModelCount} more` : ''}`
        : `No model loaded · last load ${latestModelAt}`,
      color: data.runtime.runningModels > 0 ? STATUS_GREEN : STATUS_GRAY,
    },
    {
      label: 'CPU',
      icon: <Cpu size={13} />,
      value: `${cpuPercent}%`,
      detail: `Load ${data.system.cpu.load1} / ${data.system.cpu.load5} / ${data.system.cpu.load15}`,
      color: percentTone(cpuPercent),
    },
    {
      label: 'Memory',
      icon: <HardDrive size={13} />,
      value: `${memPercent}%`,
      detail: `${formatBytes(data.system.memory.usedBytes)} / ${formatBytes(data.system.memory.totalBytes)}`,
      color: percentTone(memPercent),
    },
    {
      label: 'GPU load',
      icon: <Activity size={13} />,
      value: gpuLoadNow !== null ? `${Math.round(gpuLoadNow)}%` : '—',
      detail: firstGpuDevice?.name || 'No GPU metrics',
      color: gpuLoadNow !== null ? percentTone(gpuLoadNow) : STATUS_GRAY,
    },
  ]

  return (
    <PageTransition>
      <div className={styles.page}>
        <div className={styles.topBar}>
          <div>
            <div className={styles.titleRow}>
              <span className={styles.titleIcon}><Server size={20} /></span>
              <h1>Ollama Monitor</h1>
            </div>
            <p className={styles.subtitle}>Local inference health, loaded models, and hardware headroom in one operational surface.</p>
          </div>
          <button className={styles.refreshButton} onClick={() => refetch()}>
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        {alertNotes.length > 0 ? (
          <div
            className={styles.alertBanner}
            style={{ '--status-color': alertNotes.some((alert) => alert.severity === 'critical') ? STATUS_RED : STATUS_AMBER } as CSSProperties}
            role="status"
          >
            <CircleAlert size={16} />
            <div>
              <strong>{alertNotes.length} active alert{alertNotes.length === 1 ? '' : 's'}</strong>
              {alertNotes.slice(0, 3).map((alert) => (
                <span key={`${alert.code}-${alert.triggeredAt}`}>
                  {alert.message}
                  {alert.suppressed ? ' (cooldown)' : ''}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {data.server.error ? (
          <div className={styles.alertBanner} style={{ '--status-color': STATUS_AMBER } as CSSProperties} role="status">
            <CircleAlert size={16} />
            <div>
              <strong>Server warning</strong>
              <span>{data.server.error}</span>
            </div>
          </div>
        ) : null}

        <div className={styles.heroStrip}>
          {heroCards.map((card) => (
            <div className={styles.heroCard} key={card.label} style={{ '--status-color': card.color } as CSSProperties}>
              <span className={styles.heroLabel}>{card.icon}{card.label}</span>
              <strong className={styles.heroValue}>{card.value}</strong>
              <small className={styles.heroDetail}>{card.detail}</small>
              {card.spark && card.spark.length > 1 ? (
                <div className={styles.heroSpark}>{renderSparkline(card.spark, card.color, `hero-${card.label.replace(/\s+/g, '-')}`)}</div>
              ) : null}
            </div>
          ))}
        </div>

        <div className={styles.mainGrid}>
          <GlassCard delay={0.08} noPad>
            <div className={styles.panelHeader}>
              <div className={styles.panelTitle}><Activity size={15} /> GPU</div>
              <StatusBadge
                status={gpuBadgeStatus}
                label={gpuLabel === 'No metrics' ? gpuLabel : `${gpuLabel}${gpu?.devices?.length ? ` (${gpu.devices.length})` : ''}`}
              />
            </div>
            <div className={styles.panelBody}>
              {(!gpu?.available || !gpu?.devices?.length) ? (
                <>
                  <p className={styles.muted}>
                    {gpu?.error ? `GPU metrics unavailable: ${gpu.error}` : 'No GPU metrics are visible.'}
                  </p>
                  {!!gpu?.limitation && <p className={styles.mutedSmall}>Note: {gpu.limitation}</p>}
                  {!!gpu?.tried?.length && <p className={styles.mutedSmall}>Commands tried: {gpu.tried.join(', ')}</p>}
                </>
              ) : (
                <>
                  {hasEstimatedGpuMetrics && !hasLiveGpuMetrics ? (
                    <p className={styles.muted}>
                      GPU devices found; live counters are unavailable, so VRAM is estimated from the loaded model footprint.
                    </p>
                  ) : null}
                  {(gpuPlatform === 'darwin' || gpu?.limited) && gpu?.limitation ? (
                    <p className={styles.mutedSmall}>{gpu.limitation}</p>
                  ) : null}
                  {gpu.devices?.map((device) => {
                    const utilGpu = finiteNumber(device.utilGpu)
                    const utilMemory = finiteNumber(device.utilMemory)
                    const memUsed = finiteNumber(device.memUsedMiB)
                    const memTotal = finiteNumber(device.memTotalMiB)
                    const memFree = finiteNumber(device.memFreeMiB)
                    const tempC = finiteNumber(device.tempC)
                    const powerDraw = finiteNumber(device.powerDraw)
                    const powerLimit = finiteNumber(device.powerLimit)
                    const memoryLabel = device.memUsedEstimate
                      ? 'Memory estimate'
                      : gpuPlatform === 'darwin'
                        ? 'GPU memory observed'
                        : 'VRAM used'
                    const metricPills = [
                      utilGpu !== null ? { label: 'GPU load', value: `${Math.round(utilGpu)}%` } : null,
                      utilMemory !== null ? { label: 'Memory pressure', value: `${Math.round(utilMemory)}%` } : null,
                      memUsed !== null || memTotal !== null ? {
                        label: memoryLabel,
                        value: [memUsed !== null ? formatMiB(memUsed) : null, memTotal !== null ? formatMiB(memTotal) : null].filter(Boolean).join(' / '),
                        tone: device.memUsedEstimate ? 'estimate' as const : 'ok' as const,
                      } : null,
                      memFree !== null ? { label: gpuPlatform === 'darwin' ? 'Memory free observed' : 'VRAM free', value: formatMiB(memFree) } : null,
                      tempC !== null ? { label: 'Temperature', value: `${Math.round(tempC)} °C` } : null,
                      powerDraw !== null || powerLimit !== null ? {
                        label: 'Power',
                        value: [powerDraw !== null ? `${Math.round(powerDraw)} W` : null, powerLimit !== null ? `${Math.round(powerLimit)} W limit` : null].filter(Boolean).join(' / '),
                      } : null,
                    ].filter(Boolean) as { label: string; value: string; tone?: 'estimate' | 'ok' }[]
                    const subtitle = [device.vendor, device.cores ? `${device.cores} cores` : null].map(presentText).filter(Boolean).join(' · ')

                    return (
                      <div key={device.index} className={styles.gpuDevice}>
                        <div className={styles.gpuDeviceHead}>
                          <div>
                            <p className={styles.gpuDeviceName}>{device.name}</p>
                            <p className={styles.gpuDeviceMeta}>
                              GPU {device.index}{subtitle ? ` · ${subtitle}` : ''}
                            </p>
                          </div>
                          {device.memUsedEstimate ? (
                            <p className={`${styles.gpuDeviceNote} ${styles.gpuDeviceNoteWarn}`}>
                              macOS does not expose per-process VRAM here; memory is estimated from loaded model size.
                            </p>
                          ) : device.memorySource === 'apple-ioreg-unified-memory' ? (
                            <p className={styles.gpuDeviceNote}>
                              Memory is observed from Apple unified-memory counters, not discrete VRAM.
                            </p>
                          ) : null}
                        </div>

                        {metricPills.length > 0 ? (
                          <div className={styles.pillGrid}>
                            {metricPills.map((metric) => (
                              <MetricPill key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} />
                            ))}
                          </div>
                        ) : (
                          <p className={styles.muted}>No live GPU counters are available from this machine right now.</p>
                        )}

                        {device.index === gpu?.devices?.[0]?.index ? (
                          <>
                            {visibleGpuUtilHistory.length > 0 ? (
                              <div className={styles.trendBlock}>
                                <div className={styles.trendHead}>
                                  <span className={styles.trendLabel}>GPU load trend</span>
                                  <span className={styles.trendStats}>{summarizePercentTrend(visibleGpuUtilHistory)}</span>
                                </div>
                                {renderSparkline(visibleGpuUtilHistory, '#5E5CE6', 'gpu-util-gradient')}
                              </div>
                            ) : null}
                            {visibleGpuMemHistory.length > 0 ? (
                              <div className={styles.trendBlock}>
                                <div className={styles.trendHead}>
                                  <span className={styles.trendLabel}>{gpuPlatform === 'darwin' ? 'GPU memory trend' : 'VRAM trend'}</span>
                                  <span className={styles.trendStats}>{summarizePercentTrend(visibleGpuMemHistory)}</span>
                                </div>
                                {renderSparkline(visibleGpuMemHistory, '#64D2FF', 'gpu-mem-gradient')}
                              </div>
                            ) : null}
                            {!hasLiveGpuMetrics ? (
                              <p className={styles.mutedSmall}>
                                Live GPU counters are not exposed, so unavailable charts and fields are hidden.
                              </p>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          </GlassCard>

          <GlassCard delay={0.12} noPad>
            <div className={styles.panelHeader}>
              <div className={styles.panelTitle}><Settings2 size={15} /> Optimization</div>
              <div className={styles.panelMeta}>{platform}{optimizationDirty ? ' · unsaved changes' : ''}</div>
            </div>
            <div className={styles.panelBody}>
              {!optimization ? (
                <p className={styles.muted}>No optimization data available.</p>
              ) : (
                <>
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>Enabled</span>
                      <span className={styles.checkboxBox}>
                        <input
                          type="checkbox"
                          checked={!!activeOptimizationProfile?.enabled}
                          onChange={(event) => updateOptimizationProfile({ enabled: event.target.checked })}
                        />
                        <span>{activeOptimizationProfile?.enabled ? 'Enabled' : 'Disabled'}</span>
                      </span>
                    </label>
                    <label className={styles.field}>
                      <span>Strategy</span>
                      <select
                        value={activeOptimizationProfile?.strategy || 'balanced'}
                        onChange={(event) =>
                          updateOptimizationProfile({
                            strategy: (event.target.value === 'performance' || event.target.value === 'conservative'
                              ? event.target.value
                              : 'balanced') as OllamaOptimizationProfile['strategy'],
                          })
                        }
                      >
                        <option value="conservative">Conservative</option>
                        <option value="balanced">Balanced</option>
                        <option value="performance">Performance</option>
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>Keep-alive</span>
                      <input
                        value={activeOptimizationProfile?.keepAlive || ''}
                        onChange={(event) => updateOptimizationProfile({ keepAlive: event.target.value })}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Max loaded models</span>
                      <input
                        type="number"
                        min={1}
                        max={16}
                        value={activeOptimizationProfile?.maxLoadedModels ?? ''}
                        onChange={(event) => updateOptimizationProfile({ maxLoadedModels: Number(event.target.value) })}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>num_ctx</span>
                      <input
                        type="number"
                        min={256}
                        max={65536}
                        step={256}
                        value={activeOptimizationProfile?.numCtx ?? ''}
                        onChange={(event) => updateOptimizationProfile({ numCtx: Number(event.target.value) })}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>num_parallel</span>
                      <input
                        type="number"
                        min={1}
                        max={16}
                        value={activeOptimizationProfile?.numParallel ?? ''}
                        onChange={(event) => updateOptimizationProfile({ numParallel: Number(event.target.value) })}
                      />
                    </label>
                  </div>

                  {recommendation && recommendationDiffers ? (
                    <div
                      className={styles.recommendStrip}
                      title={recommendation.reasons?.length ? recommendation.reasons.join('\n') : undefined}
                    >
                      <Wand2 size={13} />
                      <span>
                        Recommended: {recommendation.strategy} · keep-alive {recommendation.keepAlive} · {recommendation.maxLoadedModels} models · ctx {recommendation.numCtx} · parallel {recommendation.numParallel}
                      </span>
                      <button type="button" onClick={applyRecommendationToForm}>Use</button>
                    </div>
                  ) : null}

                  <div className={styles.buttonRow}>
                    <button
                      className={`${styles.btn} ${styles.btnGhost}`}
                      onClick={() => handleCopyCommands(optimization?.applyCommands || [])}
                      disabled={!optimization?.applyCommands?.length}
                    >
                      <Copy size={14} />
                      Copy commands
                    </button>
                    <button
                      className={`${styles.btn} ${styles.btnGhost} ${styles.btnDanger}`}
                      onClick={handleRollbackOptimization}
                      disabled={isRollingBackOptimization}
                    >
                      {isRollingBackOptimization ? 'Rolling back…' : 'Rollback'}
                    </button>
                    <button
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      onClick={handleSaveOptimization}
                      disabled={isSavingOptimization || !optimizationDirty}
                    >
                      <Save size={14} />
                      {isSavingOptimization ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                  {!!optimizationMessage && <p className={styles.formMessage}>{optimizationMessage}</p>}
                </>
              )}
            </div>
          </GlassCard>
        </div>

        <GlassCard delay={0.16} noPad>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <Server size={15} /> Models
              {modelTelemetryIsEstimated ? <span className={styles.modelBadge}>estimated telemetry</span> : null}
              {tokenUsageData?.meta?.refreshing ? <span className={`${styles.modelBadge} ${styles.modelBadgeInfo}`}>token usage refreshing</span> : null}
            </div>
            <div className={styles.modelControls}>
              <select
                className={styles.controlSelect}
                value={usagePeriod}
                onChange={(event) => setUsagePeriod(event.target.value as 'day' | '7d' | 'month')}
                title="Token usage period"
              >
                <option value="day">Today</option>
                <option value="7d">Last 7 days</option>
                <option value="month">This month</option>
              </select>
              {models.length > 0 ? (
                <button className={styles.controlButton} onClick={() => setAllModelsExpanded(!allModelsExpanded)}>
                  {allModelsExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  {allModelsExpanded ? 'Collapse all' : 'Expand all'}
                </button>
              ) : null}
            </div>
          </div>
          <div className={styles.panelBody}>
            {(models.length > 0 || modelMetrics.length > 0) ? (
              <div className={styles.statRow}>
                <MetricPill label="Models available" value={String(modelSummary.totalModels)} />
                <MetricPill label="Loaded now" value={String(modelSummary.runningCount)} />
                {tokenUsageData ? <MetricPill label="Period tokens" value={formatTokens(tokenUsageSummary.matchedTokens || tokenUsageSummary.totalTokens)} tone="ok" /> : null}
                {tokenUsageData ? <MetricPill label="Models with usage" value={`${tokenUsageSummary.visibleModelsWithTokens}/${models.length}`} tone="ok" /> : null}
                {modelMetrics.length > 0 ? <MetricPill label={modelLabels.error} value={formatErrorRate(modelSummary.avgErrorRate)} tone={modelTelemetryIsEstimated ? 'estimate' : 'ok'} /> : null}
                {modelMetrics.length > 0 ? <MetricPill label={modelLabels.volume} value={String(modelSummary.totalRequests)} tone={modelTelemetryIsEstimated ? 'estimate' : 'ok'} /> : null}
              </div>
            ) : null}

            {modelMetrics.length > 0 ? (
              <div
                className={`${styles.infoStrip} ${modelTelemetryIsEstimated ? styles.infoStripWarn : ''}`}
                title={[
                  modelLabels.note,
                  modelTelemetryData?.limitations?.length ? `Limits: ${modelTelemetryData.limitations.join('; ')}` : '',
                ].filter(Boolean).join('\n')}
              >
                <CircleAlert size={13} />
                <span>
                  <strong>{modelLabels.source}</strong> · {modelTelemetryData?.telemetrySource || 'unknown'} · window {Math.round((modelTelemetryData?.windowMs || 0) / 60000)}m · updated {formatTime(modelTelemetryData?.generatedAt)}
                </span>
              </div>
            ) : null}

            {tokenUsageData ? (
              <div className={`${styles.infoStrip} ${tokenUsageData.meta?.stale ? styles.infoStripWarn : ''}`}>
                <Clock3 size={13} />
                <span>
                  <strong>Token usage · {periodLabel}</strong> · {tokenUsageData.source || 'unknown'} · updated {formatTime(tokenUsageData.meta?.updatedAt)}{tokenUsageData.meta?.stale ? ' · stale cache' : ''}
                </span>
              </div>
            ) : null}

            {models.length === 0 ? (
              <p className={styles.muted}>No models found.</p>
            ) : (
              <div className={styles.modelList}>
                {models.map((model) => {
                  const metric = modelMetricMap.get(model.name)
                  const isExpanded = !!expandedModels[model.name]
                  const metaParts = modelMetaParts(model)
                  const requestsPerMinute = finiteNumber(metric?.requestsPerMinute)
                  const hasErrorRate = metric && finiteNumber(metric.errorRate) !== null
                  const tokenUsage = getModelTokenUsage(model.name)
                  const hasTokenUsage = !!tokenUsage && tokenUsage.tokens > 0
                  const tokenUsageTitle = tokenUsage
                    ? `${tokenUsage.tokens.toLocaleString()} tokens${tokenUsage.sessions ? ` · ${tokenUsage.sessions} sessions` : ''}${tokenUsage.sources.length ? ` · ${tokenUsage.sources.join(', ')}` : ''}`
                    : 'No token usage recorded in selected period'

                  return (
                    <div key={model.name} className={styles.modelCard}>
                      <button className={styles.modelToggle} onClick={() => toggleModelExpanded(model.name)}>
                        <div className={styles.modelNameCell}>
                          <div className={styles.modelNameRow}>
                            <p className={styles.modelName}>{model.name}</p>
                            {model.status === 'running' ? <StatusBadge status="active" label="running" pulse /> : null}
                          </div>
                          {metaParts.length > 0 ? <p className={styles.modelMeta}>{metaParts.join(' · ')}</p> : null}
                        </div>
                        <div className={`${styles.modelCell} ${hasTokenUsage ? '' : styles.modelCellMuted}`} title={tokenUsageTitle}>
                          <span>Tokens</span>
                          <strong>{hasTokenUsage ? formatTokens(tokenUsage.tokens) : '—'}</strong>
                        </div>
                        <div className={`${styles.modelCell} ${requestsPerMinute !== null ? '' : styles.modelCellMuted}`}>
                          <span>{modelLabels.rate}</span>
                          <strong>{requestsPerMinute !== null ? formatMetric(requestsPerMinute, 2) : '—'}</strong>
                        </div>
                        <div className={`${styles.modelCell} ${hasErrorRate ? '' : styles.modelCellMuted}`}>
                          <span>{modelLabels.errorShort}</span>
                          <strong>{hasErrorRate ? formatErrorRate(metric!.errorRate) : '—'}</strong>
                        </div>
                        {isExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                      </button>

                      {isExpanded ? (
                        <div className={styles.modelExpand}>
                          {metric ? (
                            <div className={styles.detailGrid}>
                              <MetricPill
                                label="Period tokens"
                                value={hasTokenUsage ? formatTokens(tokenUsage.tokens) : '—'}
                                title={tokenUsageTitle}
                              />
                              <MetricPill label={modelLabels.rate} value={formatMetric(metric.requestsPerMinute, 2)} />
                              {finiteNumber(metric.p95LatencyMs) !== null ? (
                                <MetricPill label={modelLabels.latency} value={`${formatMetric(metric.p95LatencyMs, 0)} ms`} />
                              ) : null}
                              <MetricPill label={modelLabels.errorShort} value={formatErrorRate(metric.errorRate)} />
                              <MetricPill label={modelLabels.volumeShort} value={String(metric.requestCount)} />
                            </div>
                          ) : null}

                          <div className={styles.detailGrid}>
                            {presentText(model.sizeLabel) ? <MetricPill label="Size" value={model.sizeLabel!} /> : null}
                            {presentText(model.family) ? <MetricPill label="Family" value={model.family!} /> : null}
                            {presentText(model.keepAlive) ? <MetricPill label="Keep-alive" value={model.keepAlive!} /> : null}
                            {formatTime(model.loadedAt) !== '—' ? <MetricPill label="Loaded" value={formatTime(model.loadedAt)} /> : null}
                            {formatTime(model.expiresAt) !== '—' ? <MetricPill label="Expires" value={formatTime(model.expiresAt)} /> : null}
                          </div>

                          <div className={styles.digestGrid}>
                            {presentText(model.digest) ? (
                              <div>
                                <p className={styles.label}>Digest</p>
                                <p className={styles.value}>{model.digest}</p>
                              </div>
                            ) : null}
                            <div>
                              <p className={styles.label}>Telemetry</p>
                              <p className={styles.value}>
                                {metric ? `${metric.status}${metric.estimated ? ' · snapshot-estimated, not request logs' : ''}` : 'Telemetry unavailable'}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </GlassCard>
      </div>
    </PageTransition>
  )
}
