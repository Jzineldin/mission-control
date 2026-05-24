import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle2,
  Database,
  Link2,
  Network,
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
  handoff: {
    source: string
    recommendedNextSlice: string
  }
}

const nodePositions: Record<string, { x: number; y: number; size: number }> = {
  'gbrain-core': { x: 50, y: 48, size: 142 },
  hermes: { x: 25, y: 24, size: 116 },
  openclaw: { x: 74, y: 24, size: 116 },
  codex: { x: 24, y: 70, size: 116 },
  sources: { x: 75, y: 70, size: 116 },
  queues: { x: 50, y: 83, size: 112 },
  'google-bridge': { x: 50, y: 12, size: 112 },
}

function statusColor(status: EvidenceStatus) {
  if (status === 'healthy') return '#32D74B'
  if (status === 'warning') return '#FFD60A'
  if (status === 'critical') return '#FF453A'
  return '#8E8E93'
}

function statusLabel(status: EvidenceStatus) {
  if (status === 'healthy') return 'Verified'
  if (status === 'warning') return 'Verified caveat'
  if (status === 'critical') return 'Failing'
  return 'Read-only'
}

function kindIcon(kind: NodeKind) {
  if (kind === 'core') return <Brain size={22} />
  if (kind === 'agent') return <Bot size={19} />
  if (kind === 'source') return <Database size={19} />
  if (kind === 'queue') return <RefreshCw size={19} />
  return <Link2 size={19} />
}

function lineFor(edge: GBrainEdge) {
  const from = nodePositions[edge.from]
  const to = nodePositions[edge.to]
  return { x1: from.x, y1: from.y, x2: to.x, y2: to.y, mx: (from.x + to.x) / 2, my: (from.y + to.y) / 2 }
}

export default function GBrain() {
  const { data, loading, error, refetch } = useApi<GBrainOverview>('/api/gbrain/overview', 30000)
  const [selectedId, setSelectedId] = useState('gbrain-core')

  const selectedNode = useMemo(() => {
    if (!data?.nodes?.length) return null
    return data.nodes.find((node) => node.id === selectedId) || data.nodes[0]
  }, [data, selectedId])

  const nodeById = useMemo(() => new Map((data?.nodes || []).map((node) => [node.id, node])), [data])

  const selectProofNode = (nodeId: string) => {
    const exists = nodeById.has(nodeId)
    if (exists) setSelectedId(nodeId)
  }

  return (
    <PageTransition>
      <div className={styles.page}>
        <div className={styles.topBar}>
          <div>
            <div className={styles.titleRow}>
              <Brain size={24} style={{ color: '#32D74B' }} />
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
            {loading ? 'Loading trust state' : data?.trust.label || 'No trust state'}
          </button>
        </div>

        {error ? <GlassCard><div className={styles.error}>{error}</div></GlassCard> : null}

        <div className={styles.layout}>
          <GlassCard noPad className={styles.rail}>
            <div className={styles.panelHeader}>
              <div className={styles.panelTitle}><ShieldCheck size={15} /> Trust Cockpit</div>
              <div className={styles.panelMeta}>{data?.trust.lastVerifiedAt ? timeAgo(data.trust.lastVerifiedAt) : '—'}</div>
            </div>
            <div className={styles.metricList}>
              {Object.entries(data?.cockpit || {}).map(([key, metric]) => (
                <button key={key} className={styles.metricButton} onClick={() => selectProofNode(metric.proofNodeId)}>
                  <div className={styles.metricTop}>
                    <span className={styles.metricLabel}>{metric.label}</span>
                    <span className={styles.statusDot} style={{ '--status-color': statusColor(metric.status) } as CSSProperties} />
                  </div>
                  <div className={styles.metricValue}>{metric.value}</div>
                  <div className={styles.metricDetail}>{metric.detail}</div>
                </button>
              ))}
              {!data && !loading ? <div className={styles.metricDetail}>No overview payload loaded.</div> : null}
            </div>
          </GlassCard>

          <GlassCard noPad className={styles.mapPanel}>
            <div className={styles.panelHeader}>
              <div className={styles.panelTitle}><Network size={15} /> Living Brain Map</div>
              <div className={styles.panelMeta}>{data?.mode || 'read-only'}</div>
            </div>
            <div className={styles.mapCanvas}>
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
                      <text className={styles.edgeLabel} x={line.mx} y={line.my - 1} textAnchor="middle">{edge.label}</text>
                    </g>
                  )
                })}
              </svg>

              {(data?.nodes || []).map((node) => {
                const position = nodePositions[node.id] || { x: 50, y: 50, size: 110 }
                const active = selectedNode?.id === node.id
                return (
                  <button
                    key={node.id}
                    className={`${styles.node} ${node.kind === 'core' ? styles.coreNode : ''} ${active ? styles.nodeActive : ''}`}
                    onClick={() => setSelectedId(node.id)}
                    style={{
                      '--node-x': `${position.x}%`,
                      '--node-y': `${position.y}%`,
                      '--node-size': `${position.size}px`,
                      '--status-color': statusColor(node.status),
                    } as CSSProperties}
                  >
                    <span className={styles.nodeIcon}>{kindIcon(node.kind)}</span>
                    <span className={styles.nodeLabel}>{node.label}</span>
                    <span className={styles.nodeKind}>{statusLabel(node.status)}</span>
                  </button>
                )
              })}
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

                <div className={styles.section}>
                  <h3>Next Safe Action</h3>
                  <div className={styles.nextAction}>{selectedNode.nextSafeAction}</div>
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
      </div>
    </PageTransition>
  )
}
