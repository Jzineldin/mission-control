import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageTransition from '../components/PageTransition'
import { useApi, timeAgo } from '../lib/hooks'
import { useIsMobile } from '../lib/useIsMobile'
import {
  Activity,
  ArrowRight,
  Briefcase,
  Clock3,
  Copy,
  ExternalLink,
  Users,
  Wifi,
  X,
} from 'lucide-react'

interface OfficeTaskPreview {
  id: string
  title: string
  column: 'queue' | 'inProgress' | 'blocked' | 'done'
  priority: string
  status?: string
  tags?: string[]
  executionPath?: 'direct' | 'task-path' | 'automation' | string
  source?: string | null
  updatedAt?: string | null
}

interface OfficeDesk {
  id: string
  name: string
  role?: string
  emoji?: string
  model?: string
  liveState: 'live' | 'warm' | 'idle' | 'offline'
  activeTaskCount: number
  inProgressTaskCount: number
  blockedTaskCount?: number
  sessionCount: number
  lastActivityAt?: string | null
  lastActivityText?: string
  latestSessionKey?: string | null
  dbStatus?: string | null
  memoryHash?: string | null
  pathSummary?: {
    direct: number
    taskPath: number
    automation: number
  }
  lastExecutionPath?: 'direct' | 'task-path' | 'automation' | null
  taskPreview?: OfficeTaskPreview[]
}

interface RankedDesk extends OfficeDesk {
  attentionScore: number
  attentionReason: string
  nextTask: OfficeTaskPreview | null
}

interface OfficeTelemetry {
  generatedAt: string
  summary: {
    agents: number
    live: number
    warm: number
    idle: number
    offline: number
    openTasks: number
  }
  desks: OfficeDesk[]
}

function stateStyle(state: OfficeDesk['liveState']) {
  if (state === 'live') return { label: 'LIVE', color: '#32D74B', bg: 'rgba(50,215,75,0.16)', border: '1px solid rgba(50,215,75,0.35)' }
  if (state === 'warm') return { label: 'WARM', color: '#64D2FF', bg: 'rgba(100,210,255,0.16)', border: '1px solid rgba(100,210,255,0.35)' }
  if (state === 'idle') return { label: 'IDLE', color: '#FF9F0A', bg: 'rgba(255,159,10,0.16)', border: '1px solid rgba(255,159,10,0.35)' }
  return { label: 'OFFLINE', color: '#FF453A', bg: 'rgba(255,69,58,0.16)', border: '1px solid rgba(255,69,58,0.35)' }
}

function taskColumnLabel(column: string) {
  if (column === 'inProgress') return 'Running'
  if (column === 'blocked') return 'Blocked'
  if (column === 'done') return 'Done'
  return 'Queued'
}

function priorityTone(priority: string) {
  if (priority === 'high') return '#FF453A'
  if (priority === 'medium') return '#FF9F0A'
  return '#64D2FF'
}

function pathTone(path?: string | null) {
  if (path === 'direct') return { label: 'Direct', color: '#64D2FF', bg: 'rgba(100,210,255,0.12)', border: '1px solid rgba(100,210,255,0.22)' }
  if (path === 'automation') return { label: 'Automation', color: '#BF5AF2', bg: 'rgba(191,90,242,0.12)', border: '1px solid rgba(191,90,242,0.22)' }
  return { label: 'Task Path', color: '#32D74B', bg: 'rgba(50,215,75,0.12)', border: '1px solid rgba(50,215,75,0.22)' }
}

function attentionTone(score: number) {
  if (score >= 75) return { label: 'Immediate', color: '#FF453A', bg: 'rgba(255,69,58,0.14)', border: '1px solid rgba(255,69,58,0.28)' }
  if (score >= 45) return { label: 'Watch', color: '#FF9F0A', bg: 'rgba(255,159,10,0.14)', border: '1px solid rgba(255,159,10,0.28)' }
  return { label: 'Stable', color: '#64D2FF', bg: 'rgba(100,210,255,0.14)', border: '1px solid rgba(100,210,255,0.28)' }
}

function primaryTask(tasks: OfficeTaskPreview[] = []) {
  if (!tasks.length) return null
  return [...tasks].sort((left, right) => {
    const columnWeight = (value: string) => (value === 'inProgress' ? 4 : value === 'blocked' ? 3 : value === 'queue' ? 2 : 1)
    const priorityWeight = (value: string) => (value === 'high' ? 3 : value === 'medium' ? 2 : 1)
    return columnWeight(right.column) - columnWeight(left.column) || priorityWeight(right.priority) - priorityWeight(left.priority)
  })[0]
}

function deskAttentionScore(desk: OfficeDesk) {
  let score = 0
  const blocked = Number(desk.blockedTaskCount || 0)
  const queued = Math.max(0, Number(desk.activeTaskCount || 0) - blocked)
  const running = Number(desk.inProgressTaskCount || 0)

  if (desk.liveState === 'offline') score += queued || running || blocked ? 48 : 10
  if (desk.liveState === 'warm') score += 28
  if (desk.liveState === 'idle') score += queued || running || blocked ? 22 : 8
  if (desk.liveState === 'live') score += queued > 0 && running === 0 ? 6 : 0

  score += running * 24
  score += blocked * 20
  score += queued * 10
  if (!desk.sessionCount && (queued > 0 || running > 0 || blocked > 0)) score += 14
  if (desk.lastExecutionPath === 'task-path' && desk.liveState !== 'live' && queued > 0) score += 6

  return Math.min(100, score)
}

function deskAttentionReason(desk: OfficeDesk) {
  const blocked = Number(desk.blockedTaskCount || 0)
  const queued = Math.max(0, Number(desk.activeTaskCount || 0) - blocked)
  const running = Number(desk.inProgressTaskCount || 0)

  if (desk.liveState === 'offline' && (queued > 0 || running > 0 || blocked > 0)) return 'Work is open but no live session is attached.'
  if (blocked > 0) return `${blocked} blocked task${blocked === 1 ? '' : 's'} need operator review.`
  if (desk.liveState === 'warm' && running > 0) return 'Running work is attached to a stale session.'
  if (desk.liveState === 'warm') return 'This desk looks stale and is worth checking before new work lands.'
  if (desk.liveState === 'idle' && queued > 0) return 'Queued work is waiting for a human to pick the next move.'
  if (running > 0) return `${running} task${running === 1 ? '' : 's'} are currently in progress.`
  if (queued > 0) return `${queued} queued task${queued === 1 ? '' : 's'} are ready for triage.`
  return 'No immediate operator action required.'
}

function deskActionLabel(desk: RankedDesk) {
  if (desk.nextTask) return `Open ${taskColumnLabel(desk.nextTask.column).toLowerCase()} task`
  if (desk.latestSessionKey) return 'Copy session key'
  return 'Inspect desk'
}

function DrawerContent({
  desk,
  mobile,
  onClose,
  onCopy,
  onOpenTask,
  onOpenAgents,
  onOpenTeam,
}: {
  desk: RankedDesk
  mobile: boolean
  onClose: () => void
  onCopy: (label: string, value: string) => void
  onOpenTask: (taskId: string) => void
  onOpenAgents: () => void
  onOpenTeam: () => void
}) {
  const state = stateStyle(desk.liveState)
  const attention = attentionTone(desk.attentionScore)

  return (
    <div
      className="macos-panel"
      style={{
        borderRadius: 18,
        padding: mobile ? 16 : 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        position: mobile ? 'relative' : 'sticky',
        top: mobile ? undefined : 76,
        background: 'linear-gradient(180deg, rgba(18,22,30,0.92), rgba(9,12,18,0.88))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.14)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              flexShrink: 0,
            }}
          >
            {desk.emoji || '🤖'}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>{desk.name}</div>
            <div style={{ marginTop: 3, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{desk.role || desk.id}</div>
          </div>
        </div>
        {mobile ? (
          <button
            type="button"
            onClick={onClose}
            style={{
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.7)',
              width: 34,
              height: 34,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: state.color, background: state.bg, border: state.border, borderRadius: 999, padding: '4px 10px' }}>{state.label}</span>
        <span style={{ fontSize: 10, fontWeight: 800, color: attention.color, background: attention.bg, border: attention.border, borderRadius: 999, padding: '4px 10px' }}>
          {attention.label}
        </span>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.88)' }}>Next action</div>
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {desk.nextTask ? (
            <button
              type="button"
              onClick={() => onOpenTask(desk.nextTask!.id)}
              style={{
                border: '1px solid rgba(50,215,75,0.34)',
                background: 'linear-gradient(135deg, rgba(50,215,75,0.18), rgba(50,215,75,0.09))',
                color: '#32D74B',
                borderRadius: 12,
                padding: '12px 13px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 800,
                gridColumn: mobile ? undefined : 'span 2',
              }}
            >
              Open blocked task
              <ExternalLink size={14} />
            </button>
          ) : null}

          <button
            type="button"
            onClick={onOpenAgents}
            style={{
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.035)',
              color: 'rgba(255,255,255,0.78)',
              borderRadius: 12,
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Open Agent Hub
            <ArrowRight size={14} />
          </button>

          <button
            type="button"
            onClick={onOpenTeam}
            style={{
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.035)',
              color: 'rgba(255,255,255,0.78)',
              borderRadius: 12,
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Open Team Structure
            <ArrowRight size={14} />
          </button>

          <button
            type="button"
            onClick={() => onCopy('Desk ID', desk.id)}
            style={{
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.82)',
              borderRadius: 12,
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Copy desk ID
            <Copy size={14} />
          </button>

          {desk.latestSessionKey ? (
            <button
              type="button"
              onClick={() => onCopy('Session key', desk.latestSessionKey!)}
              style={{
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.04)',
                color: 'rgba(255,255,255,0.82)',
                borderRadius: 12,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 700,
                gridColumn: mobile ? undefined : 'span 2',
              }}
            >
              Copy latest session key
              <Copy size={14} />
            </button>
          ) : null}
        </div>
      </div>

      <div style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.028)', padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.88)' }}>Why now</div>
            <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.55, color: 'rgba(255,255,255,0.68)' }}>{desk.attentionReason}</div>
          </div>
          <div style={{ borderRadius: 14, background: attention.bg, border: attention.border, padding: '8px 10px', minWidth: 70, textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: attention.color }}>Urgency</div>
            <div style={{ marginTop: 2, fontSize: 20, fontWeight: 800, color: 'rgba(255,255,255,0.94)' }}>{desk.attentionScore}</div>
          </div>
        </div>
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {[
            { label: 'Open', value: desk.activeTaskCount },
            { label: 'Running', value: desk.inProgressTaskCount },
            { label: 'Blocked', value: desk.blockedTaskCount || 0 },
          ].map((item) => (
            <div key={item.label} style={{ borderRadius: 12, background: 'rgba(255,255,255,0.04)', padding: 10 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.48)' }}>{item.label}</div>
              <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800, color: 'rgba(255,255,255,0.92)' }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.86)' }}>Task preview</div>
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {desk.taskPreview?.length ? desk.taskPreview.map((task) => (
            <div key={task.id} style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{task.title}</div>
                  <div style={{ marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, color: priorityTone(task.priority), background: 'rgba(255,255,255,0.04)', borderRadius: 999, padding: '3px 8px' }}>
                      {task.priority || 'medium'}
                    </span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.04)', borderRadius: 999, padding: '3px 8px' }}>
                      {taskColumnLabel(task.column)}
                    </span>
                    {task.executionPath ? (
                      <span style={{ fontSize: 10, color: pathTone(task.executionPath).color, background: pathTone(task.executionPath).bg, border: pathTone(task.executionPath).border, borderRadius: 999, padding: '3px 8px' }}>
                        {pathTone(task.executionPath).label}
                      </span>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenTask(task.id)}
                  style={{
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.04)',
                    color: 'rgba(255,255,255,0.82)',
                    borderRadius: 10,
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  Open
                  <ExternalLink size={13} />
                </button>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                {task.updatedAt ? `Updated ${timeAgo(task.updatedAt)}` : 'No timestamp'}
                {task.source ? ` · ${task.source}` : ''}
              </div>
            </div>
          )) : (
            <div style={{ borderRadius: 12, border: '1px dashed rgba(255,255,255,0.12)', padding: 12, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
              No task preview is attached to this desk yet.
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
        <div>Last activity: {desk.lastActivityAt ? timeAgo(desk.lastActivityAt) : (desk.lastActivityText || 'no signal')}</div>
        {desk.model ? <div>Model: {desk.model}</div> : null}
        {desk.dbStatus ? <div>Runtime status: {desk.dbStatus}</div> : null}
      </div>
    </div>
  )
}

export default function DigitalOffice() {
  const m = useIsMobile()
  const navigate = useNavigate()
  const { data, loading } = useApi<OfficeTelemetry>('/api/office/telemetry', 4000)
  const [selectedDeskId, setSelectedDeskId] = useState<string | null>(null)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const detailPanelRef = useRef<HTMLDivElement | null>(null)

  const desks = useMemo<RankedDesk[]>(() => {
    const rawDesks = Array.isArray(data?.desks) ? data.desks : []
    return rawDesks
      .map((desk) => {
        const nextTask = primaryTask(desk.taskPreview || [])
        return {
          ...desk,
          attentionScore: deskAttentionScore(desk),
          attentionReason: deskAttentionReason(desk),
          nextTask,
        }
      })
      .sort((left, right) => right.attentionScore - left.attentionScore || right.inProgressTaskCount - left.inProgressTaskCount || right.activeTaskCount - left.activeTaskCount)
  }, [data])

  // Derive selectedDeskId during render (React "storing info from previous renders"
  // pattern) to avoid setState-in-effect.
  const computedDeskId: string | null = !desks.length
    ? null
    : (selectedDeskId && desks.some((desk) => desk.id === selectedDeskId)
      ? selectedDeskId
      : desks[0].id)
  if (computedDeskId !== selectedDeskId) {
    setSelectedDeskId(computedDeskId)
    if (!computedDeskId) setMobileDrawerOpen(false)
  }

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const selectedDesk = desks.find((desk) => desk.id === selectedDeskId) || null
  const uncoveredDesks = desks.filter((desk) => desk.liveState !== 'live' && (desk.activeTaskCount > 0 || desk.inProgressTaskCount > 0))
  const needsAttention = desks.filter((desk) => desk.attentionScore >= 45)
  const hotDesks = desks.filter((desk) => desk.attentionScore >= 75)
  const executionMix = desks.reduce(
    (acc, desk) => {
      acc.taskPath += desk.pathSummary?.taskPath || 0
      acc.direct += desk.pathSummary?.direct || 0
      acc.automation += desk.pathSummary?.automation || 0
      return acc
    },
    { taskPath: 0, direct: 0, automation: 0 },
  )

  const openDesk = (deskId: string) => {
    setSelectedDeskId(deskId)
    const desk = desks.find((item) => item.id === deskId)
    setToast({ type: 'success', text: desk ? `Showing ${desk.name} details` : 'Desk details opened' })
    if (m) {
      setMobileDrawerOpen(true)
      return
    }
    window.requestAnimationFrame(() => {
      detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    })
  }

  const handleCopy = async (label: string, value: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(value)
      setToast({ type: 'success', text: `${label} copied` })
    } catch {
      setToast({ type: 'error', text: `${label} copy failed` })
    }
  }

  const openTask = (taskId: string) => {
    navigate(`/workshop?task=${encodeURIComponent(taskId)}`)
  }

  if (loading || !data) {
    return (
      <PageTransition>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
          <div style={{ width: 24, height: 24, border: '2px solid #64D2FF', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <div className="office-page" style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: m ? 'flex-start' : 'center', justifyContent: 'space-between', flexDirection: m ? 'column' : 'row', gap: 10 }}>
          <div>
            <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Users size={m ? 18 : 22} style={{ color: '#64D2FF' }} /> Digital Office
            </h1>
            <p className="text-body" style={{ marginTop: 4 }}>Operator console for triage, drilldown, and safe next actions.</p>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock3 size={13} /> Updated {timeAgo(data.generatedAt)}
          </div>
        </div>

        {toast ? (
          <div
            className="macos-panel"
            style={{
              borderRadius: 12,
              padding: '10px 12px',
              border: `1px solid ${toast.type === 'success' ? 'rgba(50,215,75,0.28)' : 'rgba(255,69,58,0.28)'}`,
              background: toast.type === 'success' ? 'rgba(50,215,75,0.1)' : 'rgba(255,69,58,0.1)',
              color: toast.type === 'success' ? '#32D74B' : '#FF453A',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {toast.text}
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : 'minmax(0, 1.18fr) minmax(340px, 0.82fr)', gap: 12, alignItems: 'stretch', marginBottom: m ? 4 : 22 }}>
          <div className="macos-panel office-summary-panel" style={{ borderRadius: 16, padding: 14, background: hotDesks.length ? 'linear-gradient(135deg, rgba(255,69,58,0.14), rgba(18,22,30,0.86))' : 'linear-gradient(135deg, rgba(100,210,255,0.10), rgba(18,22,30,0.86))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: hotDesks.length ? '#FF453A' : '#64D2FF' }}>Priority lane</div>
                <div style={{ marginTop: 5, fontSize: 12, color: 'rgba(255,255,255,0.62)' }}>What needs a human first.</div>
              </div>
              <Activity size={18} style={{ color: hotDesks.length ? '#FF453A' : '#64D2FF' }} />
            </div>
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              {[
                { label: 'Immediate desks', value: hotDesks.length, color: hotDesks.length ? '#FF453A' : '#64D2FF' },
                { label: 'Need attention', value: needsAttention.length, color: needsAttention.length ? '#FF9F0A' : '#64D2FF' },
                { label: 'Uncovered work', value: uncoveredDesks.length, color: uncoveredDesks.length ? '#FF9F0A' : '#32D74B' },
              ].map((item) => (
                <div key={item.label} style={{ borderRadius: 13, padding: 12, background: 'rgba(0,0,0,0.16)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.52)', whiteSpace: 'nowrap' }}>{item.label}</div>
                  <div style={{ marginTop: 5, fontSize: 24, fontWeight: 850, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="macos-panel office-summary-panel" style={{ borderRadius: 16, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.64)' }}>System snapshot</div>
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {[
                { label: 'Desks', value: data.summary.agents, icon: Users, color: '#64D2FF' },
                { label: 'Live', value: data.summary.live, icon: Wifi, color: data.summary.live ? '#32D74B' : '#FF9F0A' },
                { label: 'Open tasks', value: data.summary.openTasks, icon: Briefcase, color: '#BF5AF2' },
              ].map((item) => (
                <div key={item.label} style={{ borderRadius: 12, padding: '10px 9px', background: 'rgba(255,255,255,0.035)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.48)' }}>{item.label}</span>
                    <item.icon size={12} style={{ color: item.color }} />
                  </div>
                  <div style={{ marginTop: 5, fontSize: 19, fontWeight: 800, color: 'rgba(255,255,255,0.9)' }}>{item.value}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>
              <span>Task Path {executionMix.taskPath}</span>
              <span>· Direct {executionMix.direct}</span>
              <span>· Automation {executionMix.automation}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : 'minmax(0, 1.45fr) minmax(360px, 0.95fr)', gap: 14, alignItems: 'start', marginTop: m ? 2 : 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="macos-panel" style={{ borderRadius: 18, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>Attention queue</div>
                  <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                    Highest-value intervention first. Drill into a desk or jump straight to the relevant task.
                  </div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: hotDesks.length ? '#FF453A' : '#64D2FF', background: hotDesks.length ? 'rgba(255,69,58,0.12)' : 'rgba(100,210,255,0.12)', border: hotDesks.length ? '1px solid rgba(255,69,58,0.28)' : '1px solid rgba(100,210,255,0.24)', borderRadius: 999, padding: '4px 10px' }}>
                  {hotDesks.length ? `${hotDesks.length} immediate desk${hotDesks.length === 1 ? '' : 's'}` : 'No hot desks'}
                </span>
              </div>

              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {desks.map((desk) => {
                  const attention = attentionTone(desk.attentionScore)
                  const state = stateStyle(desk.liveState)
                  return (
                    <div
                      key={desk.id}
                      style={{
                        borderRadius: 14,
                        border: selectedDeskId === desk.id ? '1px solid rgba(100,210,255,0.35)' : '1px solid rgba(255,255,255,0.08)',
                        background: selectedDeskId === desk.id ? 'rgba(100,210,255,0.08)' : 'rgba(255,255,255,0.03)',
                        padding: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ minWidth: 0, display: 'flex', gap: 10 }}>
                          <div
                            style={{
                              width: 42,
                              height: 42,
                              borderRadius: 12,
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 20,
                              flexShrink: 0,
                            }}
                          >
                            {desk.emoji || '🤖'}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>{desk.name}</div>
                              <span style={{ fontSize: 10, fontWeight: 700, color: state.color, background: state.bg, border: state.border, borderRadius: 999, padding: '3px 8px' }}>{state.label}</span>
                            </div>
                            <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{desk.role || desk.id}</div>
                            <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5, color: 'rgba(255,255,255,0.72)' }}>{desk.attentionReason}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                          <div style={{ borderRadius: 12, background: attention.bg, border: attention.border, padding: '8px 10px', minWidth: 74, textAlign: 'center' }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: attention.color }}>Urgency</div>
                            <div style={{ marginTop: 3, fontSize: 20, fontWeight: 800, color: 'rgba(255,255,255,0.92)' }}>{desk.attentionScore}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => openDesk(desk.id)}
                            style={{
                              border: '1px solid rgba(255,255,255,0.12)',
                              background: 'rgba(255,255,255,0.04)',
                              color: 'rgba(255,255,255,0.84)',
                              borderRadius: 10,
                              padding: '8px 10px',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            Details
                            <ArrowRight size={13} />
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                          <span>Open {desk.activeTaskCount}</span>
                          <span>Running {desk.inProgressTaskCount}</span>
                          <span>Blocked {desk.blockedTaskCount || 0}</span>
                          <span>Sessions {desk.sessionCount}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {desk.nextTask ? (
                            <button
                              type="button"
                              onClick={() => openTask(desk.nextTask!.id)}
                              style={{
                                border: '1px solid rgba(50,215,75,0.24)',
                                background: 'rgba(50,215,75,0.12)',
                                color: '#32D74B',
                                borderRadius: 10,
                                padding: '8px 10px',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              {deskActionLabel(desk)}
                              <ExternalLink size={13} />
                            </button>
                          ) : desk.latestSessionKey ? (
                            <button
                              type="button"
                              onClick={() => handleCopy('Session key', desk.latestSessionKey!)}
                              style={{
                                border: '1px solid rgba(255,255,255,0.12)',
                                background: 'rgba(255,255,255,0.04)',
                                color: 'rgba(255,255,255,0.84)',
                                borderRadius: 10,
                                padding: '8px 10px',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              Copy session key
                              <Copy size={13} />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="macos-panel" style={{ borderRadius: 18, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>Desk floor</div>
              <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                Compact view of every desk. Use this when you want a full scan, not just the ranked queue.
              </div>
              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: m ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                {desks.map((desk) => {
                  const state = stateStyle(desk.liveState)
                  const attention = attentionTone(desk.attentionScore)
                  return (
                    <button
                      key={`floor-${desk.id}`}
                      type="button"
                      onClick={() => openDesk(desk.id)}
                      className="macos-panel"
                      style={{
                        borderRadius: 14,
                        padding: 12,
                        textAlign: 'left',
                        border: selectedDeskId === desk.id ? '1px solid rgba(100,210,255,0.35)' : '1px solid rgba(255,255,255,0.08)',
                        background: 'rgba(255,255,255,0.03)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <span style={{ fontSize: 18 }}>{desk.emoji || '🤖'}</span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{desk.name}</div>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>{desk.role || desk.id}</div>
                          </div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: attention.color }}>{desk.attentionScore}</span>
                      </div>
                      <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: state.color, background: state.bg, border: state.border, borderRadius: 999, padding: '3px 8px' }}>{state.label}</span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)' }}>Open {desk.activeTaskCount}</span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)' }}>Blocked {desk.blockedTaskCount || 0}</span>
                      </div>
                      <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.45 }}>
                        {desk.nextTask ? desk.nextTask.title : desk.attentionReason}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {!m && selectedDesk ? (
            <div ref={detailPanelRef}>
              <DrawerContent
                desk={selectedDesk}
                mobile={false}
                onClose={() => undefined}
                onCopy={handleCopy}
                onOpenTask={openTask}
                onOpenAgents={() => navigate('/agents')}
                onOpenTeam={() => navigate('/team')}
              />
            </div>
          ) : null}
        </div>

        {m && mobileDrawerOpen && selectedDesk ? (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(3,6,10,0.62)',
              zIndex: 60,
              display: 'flex',
              alignItems: 'flex-end',
              padding: 12,
            }}
            onClick={() => setMobileDrawerOpen(false)}
          >
            <div style={{ width: '100%', maxHeight: '82vh' }} onClick={(event) => event.stopPropagation()}>
              <DrawerContent
                desk={selectedDesk}
                mobile
                onClose={() => setMobileDrawerOpen(false)}
                onCopy={handleCopy}
                onOpenTask={openTask}
                onOpenAgents={() => {
                  setMobileDrawerOpen(false)
                  navigate('/agents')
                }}
                onOpenTeam={() => {
                  setMobileDrawerOpen(false)
                  navigate('/team')
                }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </PageTransition>
  )
}
