import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Link2,
  Network,
  Play,
  Radio,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import PageTransition from '../components/PageTransition'
import GlassCard from '../components/GlassCard'
import { formatDate, timeAgo, useApi } from '../lib/hooks'
import styles from './GBrain.module.css'

type EvidenceStatus = 'healthy' | 'warning' | 'critical' | 'inactive'
type NodeKind = 'core' | 'agent' | 'source' | 'queue' | 'bridge'

interface Proof {
  label: string
  source: string
  verifiedAt: string
  detail: string
}

interface GBrainNode {
  id: string
  label: string
  kind: NodeKind
  status: EvidenceStatus
  summary: string
  proof: Proof
  metrics: { label: string; value: string }[]
  risks: string[]
  nextSafeAction: string
}

interface GBrainEdge {
  id: string
  from: string
  to: string
  label: string
  status: EvidenceStatus
  proofNodeId: string
}

interface CockpitMetric {
  label: string
  value: string
  detail: string
  status: EvidenceStatus
  proofNodeId: string
}

interface IntegrationSystem {
  id: string
  label: string
  localMemory: string
  gbrainUse: string
  proof: string
}

interface IntegrationContract {
  role: string
  label: string
  summary: string
  localMemoryBoundary: string
  writePolicy: string
  systems: IntegrationSystem[]
}

interface IntegrationHealthTool {
  id: string
  label: string
  mode: string
  present: boolean
}

interface IntegrationSystemHealth {
  id: string
  label: string
  status: EvidenceStatus
  mcp: { configured: boolean; status: EvidenceStatus; proof: string }
  runtimeContract: { status: EvidenceStatus; proof: string; label: string }
  source: { id: string; status: EvidenceStatus; lastSyncAt: string | null; pages: number | null; proof: string }
  tools: IntegrationHealthTool[]
  thinkRuntime?: ThinkRuntime
  readSmoke: { status: EvidenceStatus; proof: string; checkedAt: string | null }
  writeSmoke: { status: EvidenceStatus; proof: string; label: string }
}

interface ThinkRuntime {
  status: EvidenceStatus
  label: string
  detail: string
  proof: string
  checkedAt: string | null
  toolPresent: boolean
  activeModelConfigured: boolean
  proxyConfigured: boolean
  readyChatProviderCount: number
  readyChatProviders: string[]
}

interface IntegrationHealth {
  ok: boolean
  status: EvidenceStatus
  checkedAt: string
  connectedCount: number
  systemCount: number
  healthyCount: number
  systems: IntegrationSystemHealth[]
  toolContract: {
    status: EvidenceStatus
    checkedAt: string | null
    requiredCount: number
    presentCount: number
    missingCount: number
    baseRequiredCount?: number
    basePresentCount?: number
    tools: IntegrationHealthTool[]
  }
  thinkRuntime: ThinkRuntime
  featureGaps: {
    status: EvidenceStatus
    checkedAt: string | null
    count: number
    blockingCount?: number
    optionalCount?: number
    recommendations: { id: string; priority: number | null; title: string; pitch: string; command: string }[]
  }
}

interface GBrainOverview {
  ok: boolean
  mode: string
  refreshedAt: string
  title: string
  subtitle: string
  trust: {
    label: string
    status: EvidenceStatus
    score: number
    lastVerifiedAt: string
    source: string
  }
  cockpit: Record<string, CockpitMetric>
  nodes: GBrainNode[]
  edges: GBrainEdge[]
  warnings: string[]
  caveats?: string[]
  integrationContract?: IntegrationContract
  integrationHealth?: IntegrationHealth
  handoff: {
    source: string
    recommendedNextSlice: string
  }
  live?: {
    sources?: LiveSources | null
  }
  timelineSummary?: TimelineSummary
  incidentBanner?: IncidentBanner | null
}

interface SourceFreshness {
  status: EvidenceStatus
  label: string
  ageHours: number | null
  thresholdHours: number
  lastSyncAt: string | null
}

interface LiveSource {
  id: string
  status: string
  pages: number | null
  chunks: number | null
  lastSyncAt?: string | null
  freshness?: SourceFreshness
}

interface LiveSources {
  checkedAt: string
  freshness?: {
    status: EvidenceStatus
    defaultThresholdHours: number
    staleCount: number
    freshCount: number
    unknownCount: number
    untrackedCount: number
    oldestSourceId: string | null
    oldestAgeHours: number | null
  }
  sources: LiveSource[]
}

interface TimelineDiff {
  kind: string
  summary: string
  changes: { field: string; from: string | number | null; to: string | number | null }[]
}

interface IncidentBanner {
  status: EvidenceStatus
  title: string
  detail: string
  snapshotId?: string
}

interface TimelineSummary {
  enabled: boolean
  status: EvidenceStatus
  lastCapturedAt: string | null
  lastCaptureReason: string
  skippedDuplicateCount: number
  malformedLineCount: number
  retainedEntryCount: number
  warning: string
  diff: TimelineDiff
  incidentBanner: IncidentBanner | null
}

interface TimelineEntry {
  id: string
  capturedAt: string
  actor: string
  trust: {
    label: string
    status: EvidenceStatus
    score: number | null
    source: string
    lastVerifiedAt: string
  }
  metrics: Record<string, string>
  bridgeProof: { id: string; label: string; status: EvidenceStatus; proofLabel: string; proofSource: string; verifiedAt: string }[]
  sourceFreshness: { status: EvidenceStatus; label: string; warningCount: number; defaultThresholdHours: number }
  warnings: string[]
}

interface TimelineResponse {
  enabled: boolean
  entries: TimelineEntry[]
  warnings: string[]
  malformedLineCount: number
  retainedEntryCount: number
  truncated: boolean
  limit: number
  schemaVersion: number
  diff: TimelineDiff
  incidentBanner: IncidentBanner | null
}

interface GBrainActionResult {
  ok: boolean
  action: string
  label: string
  status: string
  summary: string
  error?: string
  checkedAt: string
  refreshAfter?: boolean
  pending?: boolean
}

interface GBrainActionDefinition {
  id: string
  label: string
  description: string
  kind: string
  command: string
  refreshAfter: boolean
  timeoutMs?: number
}

interface GBrainActionsResponse {
  ok: boolean
  actions: GBrainActionDefinition[]
}

const fallbackActions: GBrainActionDefinition[] = [
  {
    id: 'sync-sources',
    label: 'Sync local sources',
    description: 'Incrementally sync every registered local source without remote pulls, then embed stale chunks.',
    kind: 'maintenance',
    command: 'gbrain sync --all --no-pull --parallel 1 --timeout 105 --json --yes && gbrain embed --stale',
    refreshAfter: true,
    timeoutMs: 120000,
  },
  {
    id: 'embed-stale',
    label: 'Embed stale chunks',
    description: 'Refresh embeddings for chunks marked stale by GBrain.',
    kind: 'maintenance',
    command: 'gbrain embed --stale',
    refreshAfter: true,
    timeoutMs: 120000,
  },
  {
    id: 'embed-missing',
    label: 'Backfill missing embeddings',
    description: 'Backfill missing embedding vectors using the stale-chunk fast path, then refresh live proof.',
    kind: 'repair',
    command: 'gbrain embed --stale --priority recent --batch-size 1000',
    refreshAfter: true,
    timeoutMs: 1800000,
  },
]

const nodePositions: Record<string, { x: number; y: number; size: number }> = {
  'gbrain-core': { x: 50, y: 50, size: 150 },
  hermes: { x: 17, y: 30, size: 112 },
  openclaw: { x: 83, y: 30, size: 112 },
  codex: { x: 17, y: 70, size: 112 },
  sources: { x: 83, y: 70, size: 112 },
  queues: { x: 50, y: 85, size: 112 },
  'google-bridge': { x: 50, y: 15, size: 112 },
}

function statusColor(status: EvidenceStatus) {
  if (status === 'healthy') return '#32D74B'
  if (status === 'warning') return '#FFD60A'
  if (status === 'critical') return '#FF453A'
  return '#8E8E93'
}

function statusLabel(status: EvidenceStatus) {
  if (status === 'healthy') return 'Verified'
  if (status === 'warning') return 'Caveat'
  if (status === 'critical') return 'Failing'
  return 'Read-only'
}

function proofScopeFor(data: GBrainOverview | null | undefined, loading: boolean) {
  if (loading) {
    return {
      label: 'Checking live proof',
      detail: 'Refreshing read probes before showing operator trust state.',
      status: 'inactive' as EvidenceStatus,
    }
  }

  if (!data) {
    return {
      label: 'No proof loaded',
      detail: 'The cockpit has not received a GBrain overview payload yet.',
      status: 'inactive' as EvidenceStatus,
    }
  }

  if (data.mode === 'live-read-only') {
    return {
      label: data.integrationContract?.label || 'Read proof only',
      detail: data.integrationContract?.summary || 'Health, sources, queues, and bridge checks are live; write and repair proof stays in allowlisted actions.',
      status: data.trust.status,
    }
  }

  return {
    label: data.mode === 'read-only-fixture' ? 'Saved audit baseline' : 'Bounded operator surface',
    detail: 'Use the evidence drawer before treating this state as current operational proof.',
    status: data.trust.status,
  }
}

function actionKindLabel(kind: string) {
  if (kind === 'diagnostic') return 'Check'
  if (kind === 'preview') return 'Dry run'
  if (kind === 'repair') return 'Repair'
  if (kind === 'maintenance') return 'Maintain'
  return 'Action'
}

function actionKindColor(kind: string) {
  if (kind === 'diagnostic') return '#64D2FF'
  if (kind === 'preview') return '#BF5AF2'
  if (kind === 'repair') return '#FFD60A'
  return '#32D74B'
}

function formatActionTimeout(timeoutMs?: number) {
  if (!timeoutMs || timeoutMs <= 0) return ''
  const minutes = Math.round(timeoutMs / 60000)
  if (minutes >= 1) return minutes === 1 ? '1m' : `${minutes}m`
  return `${Math.round(timeoutMs / 1000)}s`
}

function kindIcon(kind: NodeKind) {
  if (kind === 'core') return <Brain size={22} />
  if (kind === 'agent') return <Bot size={19} />
  if (kind === 'source') return <Database size={19} />
  if (kind === 'queue') return <RefreshCw size={19} />
  return <Link2 size={19} />
}

function kindAccent(kind: NodeKind) {
  if (kind === 'core') return '#64D2FF'
  if (kind === 'agent') return '#0A84FF'
  if (kind === 'source') return '#BF5AF2'
  return '#5E5CE6'
}

function nodeRole(node: GBrainNode) {
  if (node.kind === 'core') return 'AI Memory Kernel'
  if (node.kind === 'agent') return 'MCP Server'
  if (node.kind === 'source') return 'Data & Knowledge'
  if (node.kind === 'queue') return 'Vector Pipelines'
  if (node.id === 'google-bridge') return 'Custom Bridge'
  return 'Integration Layer'
}

function lineFor(edge: GBrainEdge) {
  const from = nodePositions[edge.from]
  const to = nodePositions[edge.to]
  return { x1: from.x, y1: from.y, x2: to.x, y2: to.y, mx: (from.x + to.x) / 2, my: (from.y + to.y) / 2 }
}

export default function GBrain() {
  const { data, loading, error, refetch } = useApi<GBrainOverview>('/api/gbrain/overview', 30000)
  const { data: timeline, loading: timelineLoading, error: timelineError } = useApi<TimelineResponse>('/api/gbrain/timeline?limit=50', 60000)
  const { data: actionsData, error: actionsError } = useApi<GBrainActionsResponse>('/api/gbrain/actions')
  const [selectedId, setSelectedId] = useState('gbrain-core')
  const [runningAction, setRunningAction] = useState<string | null>(null)
  const [actionResult, setActionResult] = useState<GBrainActionResult | null>(null)

  const selectedNode = useMemo(() => {
    if (!data?.nodes?.length) return null
    return data.nodes.find((node) => node.id === selectedId) || data.nodes[0]
  }, [data, selectedId])

  const nodeById = useMemo(() => new Map((data?.nodes || []).map((node) => [node.id, node])), [data])

  const selectProofNode = (nodeId: string) => {
    const exists = nodeById.has(nodeId)
    if (exists) setSelectedId(nodeId)
  }

  const timelineSummary = data?.timelineSummary
  const incidentBanner = data?.incidentBanner || timeline?.incidentBanner || timelineSummary?.incidentBanner
  const timelineEnabled = timeline?.enabled ?? timelineSummary?.enabled ?? true
  const timelineEntries = timeline?.entries || []
  const visibleTimelineEntries = timelineEntries.slice(0, 2)
  const hiddenTimelineCount = Math.max(0, (timeline?.retainedEntryCount ?? timelineEntries.length) - visibleTimelineEntries.length)
  const showTimelineDiff = timelineSummary?.diff && timelineSummary.diff.kind !== 'unchanged'
  const staleSources = useMemo(() => {
    return (data?.live?.sources?.sources || []).filter((source) => source.freshness?.status === 'warning')
  }, [data?.live?.sources?.sources])
  const actions = actionsData?.actions?.length ? actionsData.actions : fallbackActions
  const canRunActions = Boolean(data)
  const proofScope = proofScopeFor(data, loading)
  const selectedContractSystem = data?.integrationContract?.systems?.find((system) => system.id === selectedNode?.id)
  const selectedIntegrationSystem = data?.integrationHealth?.systems?.find((system) => system.id === selectedNode?.id)
  const missingIntegrationTools = data?.integrationHealth?.toolContract?.tools?.filter((tool) => !tool.present) || []
  const healthyNodeCount = (data?.nodes || []).filter((node) => node.status === 'healthy').length
  const degradedNodeCount = (data?.nodes || []).filter((node) => node.status === 'warning').length
  const disconnectedNodeCount = (data?.nodes || []).filter((node) => node.status === 'critical' || node.status === 'inactive').length
  const nodeCount = data?.nodes?.length || 0
  const integrationConnectedCount = data?.integrationHealth?.connectedCount ?? 0
  const integrationSystemCount = data?.integrationHealth?.systemCount ?? 0
  const allIntegrationSystemsConnected = Boolean(data?.integrationHealth && integrationConnectedCount === integrationSystemCount)
  const heroSignals: { label: string; value: string; detail: string; status: EvidenceStatus; icon: ReactNode }[] = [
    {
      label: 'Trust score',
      icon: <ShieldCheck size={13} />,
      value: data ? `${data.trust.score}/100` : '—',
      detail: data ? `${data.trust.label}; verified ${timeAgo(data.trust.lastVerifiedAt)}` : 'Waiting for live proof',
      status: data?.trust.status || 'inactive',
    },
    {
      label: 'Systems',
      icon: <Network size={13} />,
      value: data?.integrationHealth ? `${integrationConnectedCount}/${integrationSystemCount}` : `${data?.nodes?.length || 0} nodes`,
      detail: data?.integrationHealth
        ? allIntegrationSystemsConnected
          ? 'All required systems connected'
          : `${integrationSystemCount - integrationConnectedCount} required system${integrationSystemCount - integrationConnectedCount === 1 ? '' : 's'} missing runtime proof`
        : 'Topology loaded from overview',
      status: data?.integrationHealth?.status || data?.trust.status || 'inactive',
    },
    {
      label: 'Think runtime',
      icon: <Cpu size={13} />,
      value: data?.integrationHealth?.thinkRuntime ? statusLabel(data.integrationHealth.thinkRuntime.status) : 'Read proof',
      detail: data?.integrationHealth?.thinkRuntime?.detail || 'Runtime proof appears in the evidence drawer',
      status: data?.integrationHealth?.thinkRuntime?.status || 'inactive',
    },
    {
      label: 'Last verified',
      icon: <Clock size={13} />,
      value: data ? timeAgo(data.trust.lastVerifiedAt) : '—',
      detail: data?.trust.source || 'Waiting for source proof',
      status: data?.trust.status || 'inactive',
    },
  ]
  // These cockpit metrics are already shown in the hero strip; skip them in the rail.
  const heroCockpitLabels = new Set(['health', 'integration health', 'think runtime'])
  const cockpitEntries = Object.entries(data?.cockpit || {}).filter(
    ([, metric]) => !heroCockpitLabels.has(metric.label.toLowerCase()),
  )
  const mapReady = data?.trust.status === 'healthy' && disconnectedNodeCount === 0
  const mapSummary = mapReady
    ? 'All core systems verified and operational'
    : data?.trust.status === 'critical'
      ? 'Critical proof requires operator review'
      : 'Live proof has caveats; review evidence before action'

  const runAction = async (action: string) => {
    setRunningAction(action)
    setActionResult(null)
    try {
      const response = await fetch('/api/gbrain/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const result = await response.json()
      setActionResult(result)
      if (result.refreshAfter) await refetch()
    } catch (err) {
      setActionResult({
        ok: false,
        action,
        label: action,
        status: 'failed',
        summary: err instanceof Error ? err.message : 'Action failed',
        checkedAt: new Date().toISOString(),
      })
    } finally {
      setRunningAction(null)
    }
  }

  return (
    <PageTransition>
      <div className={styles.page}>
        <div className={styles.topBar}>
          <div>
            <div className={styles.titleRow}>
              <span className={styles.titleIcon}><Brain size={20} /></span>
              <h1>{data?.title || 'GBrain'}</h1>
            </div>
            <div className={styles.subtitle}>
              {data?.subtitle || 'Shared memory for Hermes, OpenClaw, and Codex'}
            </div>
          </div>
          <button
            className={styles.trustBadge}
            onClick={() => refetch()}
            style={{ '--status-color': statusColor(data?.trust.status || 'inactive') } as CSSProperties}
          >
            <span className={styles.trustDot} />
            <span>
              <strong>{loading ? 'Loading trust state' : data?.trust.label || 'No trust state'}</strong>
              <small>{data?.trust.score !== undefined ? `${data.trust.score}/100` : 'Refresh'}</small>
            </span>
          </button>
        </div>

        <div
          className={styles.proofScope}
          style={{ '--status-color': statusColor(proofScope.status) } as CSSProperties}
          role="status"
        >
          <ShieldCheck size={15} />
          <strong>{proofScope.label}</strong>
          <span>{proofScope.detail}</span>
        </div>

        <div className={styles.heroStrip}>
          {heroSignals.map((signal) => (
            <div
              className={styles.heroCard}
              key={signal.label}
              style={{ '--status-color': statusColor(signal.status) } as CSSProperties}
            >
              <span className={styles.heroLabel}>{signal.icon}{signal.label}</span>
              <strong className={styles.heroValue}>{signal.value}</strong>
              <small className={styles.heroDetail}>{signal.detail}</small>
            </div>
          ))}
        </div>

        {error ? <GlassCard><div className={styles.error}>{error}</div></GlassCard> : null}

        {incidentBanner ? (
          <div
            className={styles.incidentBanner}
            style={{ '--status-color': statusColor(incidentBanner.status) } as CSSProperties}
            role="status"
          >
            <AlertTriangle size={17} />
            <div>
              <strong>{incidentBanner.title}</strong>
              <span>{incidentBanner.detail}</span>
            </div>
          </div>
        ) : null}

        <div className={styles.layout}>
          <GlassCard noPad className={styles.rail}>
            <div className={styles.panelHeader}>
              <div className={styles.panelTitle}><ShieldCheck size={15} /> Trust Cockpit</div>
              <div className={styles.panelMeta}>{data?.trust.lastVerifiedAt ? timeAgo(data.trust.lastVerifiedAt) : '—'}</div>
            </div>
            <div className={styles.railBody}>
              <div className={styles.statGrid}>
                {cockpitEntries.map(([key, metric]) => (
                  <button
                    key={key}
                    className={styles.statCell}
                    title={metric.detail}
                    onClick={() => selectProofNode(metric.proofNodeId)}
                  >
                    <span className={styles.statTop}>
                      <span className={styles.statLabel}>{metric.label}</span>
                      <span className={styles.statusDot} style={{ '--status-color': statusColor(metric.status) } as CSSProperties} />
                    </span>
                    <span className={styles.statValue}>{metric.value}</span>
                  </button>
                ))}
              </div>
              {timelineSummary ? (
                <div className={styles.timelineHealth}>
                  <div className={styles.metricTop}>
                    <span className={styles.metricLabel}>Timeline ledger</span>
                    <span className={styles.statusDot} style={{ '--status-color': statusColor(timelineSummary.status) } as CSSProperties} />
                  </div>
                  <div className={styles.metricValue}>{timelineSummary.retainedEntryCount} retained</div>
                  <div className={styles.metricDetail}>
                    {timelineSummary.lastCapturedAt ? `Last proof ${timeAgo(timelineSummary.lastCapturedAt)} · ${timelineSummary.lastCaptureReason}` : timelineSummary.lastCaptureReason}
                  </div>
                  <div className={styles.metricSubDetail}>{timelineSummary.malformedLineCount} malformed · duplicate skips tracked</div>
                </div>
              ) : null}
              {!data && !loading ? <div className={styles.metricDetail}>No overview payload loaded.</div> : null}
            </div>
          </GlassCard>

          <GlassCard noPad className={styles.mapPanel}>
            <div className={styles.panelHeader}>
              <div className={styles.panelTitle}><Network size={15} /> Living Brain Map</div>
              <div className={styles.panelMeta}>{data?.mode || 'read-only'}</div>
            </div>
            <div className={styles.mapCanvas}>
              <div className={styles.mapStage}>
                <div className={styles.mapGlow} aria-hidden="true" />
                <div className={styles.mapOrbit} aria-hidden="true" />
                <div className={styles.mapInnerOrbit} aria-hidden="true" />
                <svg className={styles.edgeLayer} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  {(data?.edges || []).map((edge) => {
                    const line = lineFor(edge)
                    return (
                      <g key={edge.id}>
                        <line
                          className={styles.edgeLine}
                          x1={line.x1}
                          y1={line.y1}
                          x2={line.x2}
                          y2={line.y2}
                          style={{ '--status-color': statusColor(edge.status) } as CSSProperties}
                        />
                        <circle
                          className={styles.edgePulse}
                          cx={line.mx}
                          cy={line.my}
                          r="0.75"
                          style={{ '--status-color': statusColor(edge.status) } as CSSProperties}
                        />
                      </g>
                    )
                  })}
                </svg>

                {(data?.nodes || []).map((node) => {
                  const position = nodePositions[node.id] || { x: 50, y: 50, size: 110 }
                  const active = selectedNode?.id === node.id
                  const healthy = node.status === 'healthy'
                  return (
                    <button
                      key={node.id}
                      className={`${styles.node} ${node.kind === 'core' ? styles.coreNode : ''} ${active ? styles.nodeActive : ''} ${!healthy ? styles.nodeAlert : ''}`}
                      onClick={() => setSelectedId(node.id)}
                      style={{
                        '--node-x': `${position.x}%`,
                        '--node-y': `${position.y}%`,
                        '--node-size': `${position.size}px`,
                        '--status-color': statusColor(node.status),
                        '--node-accent': kindAccent(node.kind),
                      } as CSSProperties}
                    >
                      <span className={styles.nodeDot} title={statusLabel(node.status)} />
                      <span className={styles.nodeIcon}>{kindIcon(node.kind)}</span>
                      <span className={styles.nodeLabel}>{node.label}</span>
                      <span className={styles.nodeRole}>{nodeRole(node)}</span>
                      {!healthy ? (
                        <span className={styles.nodeStatus}><AlertTriangle size={11} />{statusLabel(node.status)}</span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
              <div
                className={styles.mapActionBand}
                style={{ '--status-color': statusColor(data?.trust.status || 'inactive') } as CSSProperties}
              >
                <span className={styles.mapActionIcon}><RefreshCw size={18} /></span>
                <div>
                  <strong>{mapSummary}</strong>
                  <span>{selectedNode ? `${selectedNode.label}: ${selectedNode.proof.label}` : 'GBrain is ready to read, reason, and remember.'}</span>
                </div>
                <div className={styles.mapActionStats}>
                  <span><i style={{ '--status-color': statusColor('healthy') } as CSSProperties} />{healthyNodeCount}/{nodeCount || '—'} verified</span>
                  <span><i style={{ '--status-color': statusColor(degradedNodeCount ? 'warning' : 'healthy') } as CSSProperties} />{degradedNodeCount} degraded</span>
                  <span><i style={{ '--status-color': statusColor(disconnectedNodeCount ? 'critical' : 'healthy') } as CSSProperties} />{data ? `${data.trust.score}%` : '—'} operational</span>
                </div>
                <button type="button" onClick={() => refetch()} disabled={loading}>
                  {loading ? 'Checking...' : 'Run System Check'}
                </button>
              </div>
            </div>
            <div className={styles.actionsDock}>
              <div className={styles.actionHeader}>
                <span>Allowlisted actions</span>
                <small>{runningAction ? 'running' : `${actions.length} local · probes stay read-only`}</small>
              </div>
              <div className={styles.actionGrid}>
                {actions.map((action) => {
                  const timeoutLabel = formatActionTimeout(action.timeoutMs)
                  return (
                    <button
                      key={action.id}
                      className={styles.actionButton}
                      type="button"
                      disabled={!canRunActions || Boolean(runningAction)}
                      title={`${action.command}${timeoutLabel ? ` · timeout ${timeoutLabel}` : ''}`}
                      style={{ '--action-color': actionKindColor(action.kind) } as CSSProperties}
                      onClick={() => runAction(action.id)}
                    >
                      <span className={styles.actionIconTile}>
                        {action.kind === 'diagnostic' || action.kind === 'preview' ? <RefreshCw size={13} /> : <Play size={13} />}
                      </span>
                      <span>
                        <span className={styles.actionTitleRow}>
                          <strong>{runningAction === action.id ? `${action.label}...` : action.label}</strong>
                          <em>{[actionKindLabel(action.kind), timeoutLabel].filter(Boolean).join(' · ')}</em>
                        </span>
                        <small className={styles.actionDescription}>{action.description}</small>
                      </span>
                    </button>
                  )
                })}
              </div>
              {actionResult ? (
                <div
                  className={styles.actionResult}
                  style={{ '--status-color': statusColor(actionResult.ok ? 'healthy' : 'warning') } as CSSProperties}
                >
                  <strong>
                    {actionResult.ok
                      ? `${actionResult.label} complete`
                      : actionResult.pending
                        ? `${actionResult.label || actionResult.action} stopping`
                        : `${actionResult.label || actionResult.action} failed`}
                  </strong>
                  <span>{actionResult.error || actionResult.summary}</span>
                </div>
              ) : null}
              {actionsError ? <div className={styles.actionHint}>{actionsError}</div> : null}
            </div>
            <div className={styles.warningStrip}>
              <AlertTriangle size={15} style={{ color: '#FFD60A', flex: '0 0 auto', marginTop: 1 }} />
              <span>{data?.handoff.recommendedNextSlice || 'Static fixture first; live health endpoints come after the UI model is clear.'}</span>
            </div>
          </GlassCard>

          <GlassCard noPad className={styles.drawer}>
            <div className={styles.panelHeader}>
              <div className={styles.panelTitle}><Radio size={15} /> Evidence Drawer</div>
              <div className={styles.panelMeta}>{selectedNode ? statusLabel(selectedNode.status) : '—'}</div>
            </div>
            {selectedNode ? (
              <div className={styles.drawerBody}>
                <div className={styles.selectedTitle}>
                  <h2>{selectedNode.label}</h2>
                  <span className={styles.statusDot} style={{ '--status-color': statusColor(selectedNode.status) } as CSSProperties} />
                </div>
                <p className={styles.summary}>{selectedNode.summary}</p>

                {selectedNode.metrics.length ? (
                  <div className={styles.miniMetrics}>
                    {selectedNode.metrics.map((metric) => (
                      <div className={styles.miniMetric} key={`${selectedNode.id}-${metric.label}`}>
                        <span>{metric.label}</span>
                        <strong>{metric.value}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}

                {data?.integrationContract && (selectedNode.id === 'gbrain-core' || selectedContractSystem) ? (
                  <div className={styles.section}>
                    <h3>{data.integrationContract.label}</h3>
                    <div className={styles.proofBox}>
                      <div className={styles.proofLabel}>
                        <ShieldCheck size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
                        {selectedContractSystem?.label || 'GBrain'}
                      </div>
                      <div className={styles.proofDetail} style={{ marginTop: 7 }}>
                        {selectedContractSystem
                          ? `${selectedContractSystem.localMemory} ${selectedContractSystem.gbrainUse}`
                          : data.integrationContract.summary}
                      </div>
                      <div className={styles.proofPath}>{selectedContractSystem?.proof || data.integrationContract.localMemoryBoundary}</div>
                      <div className={styles.proofPath}>{data.integrationContract.writePolicy}</div>
                    </div>
                  </div>
                ) : null}

                {data?.integrationHealth && (selectedNode.id === 'gbrain-core' || selectedIntegrationSystem) ? (
                  <div className={styles.section}>
                    <h3>Integration Health</h3>
                    {selectedIntegrationSystem ? (
                      <div className={styles.proofBox}>
                        <div className={styles.proofLabel}>
                          <CheckCircle2 size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
                          {selectedIntegrationSystem.label}
                        </div>
                        <div className={styles.miniMetrics} style={{ marginTop: 9 }}>
                          <div className={styles.miniMetric}><span>MCP</span><strong>{selectedIntegrationSystem.mcp.configured ? 'Connected' : 'Missing'}</strong></div>
                          <div className={styles.miniMetric}><span>Runtime</span><strong>{selectedIntegrationSystem.runtimeContract.status}</strong></div>
                          <div className={styles.miniMetric}><span>Source</span><strong>{selectedIntegrationSystem.source.status}</strong></div>
                          <div className={styles.miniMetric}><span>Think</span><strong>{selectedIntegrationSystem.thinkRuntime?.status || data.integrationHealth.thinkRuntime.status}</strong></div>
                          <div className={styles.miniMetric}><span>Read smoke</span><strong>{selectedIntegrationSystem.readSmoke.status}</strong></div>
                          <div className={styles.miniMetric}><span>Write path</span><strong>{selectedIntegrationSystem.writeSmoke.status}</strong></div>
                        </div>
                        <div className={styles.proofPath}>{selectedIntegrationSystem.mcp.proof}</div>
                        <div className={styles.proofPath}>{selectedIntegrationSystem.runtimeContract.label}</div>
                        <div className={styles.proofPath}>{selectedIntegrationSystem.thinkRuntime?.detail || data.integrationHealth.thinkRuntime.detail}</div>
                        <div className={styles.proofPath}>{selectedIntegrationSystem.writeSmoke.label}</div>
                      </div>
                    ) : (
                      <div className={styles.proofBox}>
                        <div className={styles.proofLabel}>
                          <CheckCircle2 size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
                          {data.integrationHealth.connectedCount}/{data.integrationHealth.systemCount} systems connected
                        </div>
                        <div className={styles.proofDetail} style={{ marginTop: 7 }}>
                          {data.integrationHealth.toolContract.basePresentCount ?? data.integrationHealth.toolContract.presentCount}/{data.integrationHealth.toolContract.baseRequiredCount ?? data.integrationHealth.toolContract.requiredCount} base tools present; think {statusLabel(data.integrationHealth.thinkRuntime.status)}
                          {missingIntegrationTools.length ? `; missing ${missingIntegrationTools.map((tool) => tool.label).join(', ')}` : '; no core tool gaps'}
                        </div>
                        <div className={styles.proofPath}>{data.integrationHealth.thinkRuntime.detail}</div>
                        <div className={styles.proofPath}>
                          Optional features: {data.integrationHealth.featureGaps.count
                            ? data.integrationHealth.featureGaps.recommendations.map((item) => item.title).join(', ')
                            : 'none reported'}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                <div className={styles.section}>
                  <h3>Last Known Proof</h3>
                  <div className={styles.proofBox}>
                    <div className={styles.proofLabel}><CheckCircle2 size={13} style={{ marginRight: 6, verticalAlign: -2 }} />{selectedNode.proof.label}</div>
                    <div className={styles.proofDetail} style={{ marginTop: 7 }}>{selectedNode.proof.detail}</div>
                    <div className={styles.proofPath}>{selectedNode.proof.source}</div>
                    <div className={styles.proofPath}>{formatDate(selectedNode.proof.verifiedAt)}</div>
                  </div>
                </div>

                <div className={styles.section}>
                  <h3>Known Risks</h3>
                  <div className={styles.riskBox}>
                    {selectedNode.risks.length ? (
                      <ul>
                        {selectedNode.risks.map((risk) => <li key={risk}>{risk}</li>)}
                      </ul>
                    ) : (
                      <div className={styles.proofDetail}>No specific risk captured for this node.</div>
                    )}
                  </div>
                </div>

                {selectedNode.id === 'sources' && data?.live?.sources?.freshness ? (
                  <div className={styles.section}>
                    <h3>Freshness Thresholds</h3>
                    <div className={styles.freshnessBox}>
                      <div className={styles.freshnessSummary}>
                        <span style={{ '--status-color': statusColor(data.live.sources.freshness.status) } as CSSProperties} />
                        <strong>
                          {data.live.sources.freshness.staleCount > 0
                            ? `${data.live.sources.freshness.staleCount} stale source${data.live.sources.freshness.staleCount === 1 ? '' : 's'}`
                            : 'All sync-tracked source syncs are fresh'}
                        </strong>
                        <small>Default threshold {data.live.sources.freshness.defaultThresholdHours}h · {data.live.sources.freshness.untrackedCount || 0} not applicable</small>
                      </div>
                      {staleSources.length ? (
                        <div className={styles.freshnessList}>
                          {staleSources.slice(0, 4).map((source) => (
                            <div key={source.id}>
                              <strong>{source.id}</strong>
                              <span>
                                {source.freshness?.ageHours !== null && source.freshness?.ageHours !== undefined
                                  ? `${source.freshness.ageHours}h old`
                                  : 'no sync timestamp'}
                                {' '}· threshold {source.freshness?.thresholdHours ?? data.live?.sources?.freshness?.defaultThresholdHours}h
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className={styles.section}>
                  <h3>Next Safe Action</h3>
                  <div className={styles.nextAction}>
                    <Play size={13} />
                    <span>{selectedNode.nextSafeAction}</span>
                  </div>
                </div>

                <div className={styles.section}>
                  <h3>Global Warnings</h3>
                  <div className={styles.riskBox}>
                    <ul>
                      {((data?.caveats?.length ? data.caveats : data?.warnings) || []).map((warning) => <li key={warning}>{warning}</li>)}
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles.drawerBody}>
                <div className={styles.summary}>Loading evidence...</div>
              </div>
            )}
          </GlassCard>
        </div>

        <GlassCard noPad className={styles.timelinePanel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}><RefreshCw size={15} /> Evidence Timeline</div>
            <div className={styles.panelMeta}>
              {timelineEnabled ? `${timeline?.retainedEntryCount ?? timelineSummary?.retainedEntryCount ?? 0} retained` : 'disabled'}
            </div>
          </div>
          <div className={styles.timelineBody}>
            {showTimelineDiff ? (
              <div className={styles.diffStrip}>
                <CheckCircle2 size={15} />
                <span>{timelineSummary.diff.summary}</span>
              </div>
            ) : null}

            {timelineSummary?.warning || timelineError || (timeline?.warnings || []).length ? (
              <div className={styles.timelineWarning}>
                <AlertTriangle size={15} />
                <span>{timelineSummary?.warning || timelineError || timeline?.warnings?.[0]}</span>
              </div>
            ) : null}

            {!timelineEnabled ? (
              <div className={styles.timelineEmpty}>Evidence Timeline disabled. Current cockpit proof remains available.</div>
            ) : timelineLoading && !timeline ? (
              <div className={styles.timelineEmpty}>Loading evidence timeline...</div>
            ) : timelineEntries.length === 0 ? (
              <div className={styles.timelineEmpty}>No timeline entries yet. Current live proof is shown above.</div>
            ) : (
              <div className={styles.timelineList}>
                {visibleTimelineEntries.map((entry, index) => (
                  <article
                    key={entry.id}
                    className={`${styles.timelineEntry} ${index > 0 ? styles.timelineEntryCompact : ''}`}
                    style={{ '--status-color': statusColor(entry.trust.status) } as CSSProperties}
                    tabIndex={0}
                  >
                    <div className={styles.timelineEntryTop}>
                      <div>
                        <strong>{entry.trust.label}</strong>
                        <span>{formatDate(entry.capturedAt)} · {entry.actor}</span>
                      </div>
                      <span className={styles.timelineStatus}>{statusLabel(entry.trust.status)}</span>
                    </div>
                    <div className={styles.timelineMetrics}>
                      <span>Health {entry.metrics.health || '—'}</span>
                      <span>Embeddings {entry.metrics.embeddings || '—'}</span>
                      <span>Queue {entry.metrics.queue || '—'}</span>
                      <span>Freshness {statusLabel(entry.sourceFreshness?.status || 'inactive')}</span>
                      <span>Caveats {entry.metrics.caveats || '0'}</span>
                    </div>
                    {index === 0 ? (
                      <div className={styles.timelineProofs}>
                        {entry.bridgeProof.slice(0, 3).map((proof) => (
                          <span key={`${entry.id}-${proof.id}`}>{proof.label}: {statusLabel(proof.status)}</span>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
                {hiddenTimelineCount > 0 ? (
                  <div className={styles.timelineMore}>{hiddenTimelineCount} older proof snapshots retained in the ledger.</div>
                ) : null}
              </div>
            )}
          </div>
        </GlassCard>
      </div>
    </PageTransition>
  )
}
