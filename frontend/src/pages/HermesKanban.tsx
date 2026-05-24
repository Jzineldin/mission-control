import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Archive,
  CheckCircle,
  Clock,
  Loader2,
  MessageSquare,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  UserRound,
  UsersRound,
  X,
  Zap,
} from 'lucide-react'
import PageTransition from '../components/PageTransition'
import { apiQueryOptions, fetchJson, timeAgo } from '../lib/hooks'
import { useIsMobile } from '../lib/useIsMobile'

type HermesTask = {
  id: string
  title: string
  body?: string | null
  assignee?: string | null
  status: string
  priority?: number
  tenant?: string | null
  workspace_kind?: string
  workspace_path?: string | null
  created_by?: string | null
  createdAt?: string | null
  startedAt?: string | null
  completedAt?: string | null
  lastHeartbeatAt?: string | null
  worker_pid?: number | null
  result?: string | null
  skills?: string[]
}

type HermesBoardPayload = {
  ok: boolean
  error?: string
  profile: string
  refreshedAt?: string
  statuses: string[]
  columns: Record<string, HermesTask[]>
  stats?: {
    by_status?: Record<string, number>
    oldest_ready_age_seconds?: number | null
  } | null
  assignees?: Array<{ name: string; onDisk: boolean; counts: Record<string, number>; active: number }>
  summary?: {
    total: number
    active: number
    done: number
    blocked: number
    running: number
    byAssignee: Record<string, number>
  }
}

type HermesDetailPayload = {
  ok: boolean
  error?: string
  task?: HermesTask
  comments?: Array<{ author?: string; body?: string; createdAt?: string }>
  events?: Array<{ kind: string; payload?: Record<string, unknown>; createdAt?: string }>
  runs?: Array<{ id: number; profile?: string; status?: string; outcome?: string; summary?: string; error?: string; worker_pid?: number | null; startedAt?: string; endedAt?: string }>
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock; empty: string }> = {
  triage: { label: 'Triage', color: '#64D2FF', icon: ShieldAlert, empty: 'No specs waiting.' },
  todo: { label: 'Todo', color: '#8E8E93', icon: Clock, empty: 'No parked work.' },
  ready: { label: 'Ready', color: '#007AFF', icon: Play, empty: 'No ready cards.' },
  running: { label: 'Running', color: '#BF5AF2', icon: Zap, empty: 'No live workers.' },
  blocked: { label: 'Blocked', color: '#FF453A', icon: AlertCircle, empty: 'No blockers.' },
  done: { label: 'Done', color: '#32D74B', icon: CheckCircle, empty: 'No completed cards yet.' },
}

const defaultStatuses = ['triage', 'todo', 'ready', 'running', 'blocked', 'done']
const emptyColumns: Record<string, HermesTask[]> = {}

function priorityLabel(priority?: number) {
  const value = Number(priority || 0)
  if (value >= 50) return { label: 'High', color: '#FF453A' }
  if (value >= 10) return { label: 'Medium', color: '#FF9500' }
  return { label: 'Low', color: '#8E8E93' }
}

function compactAge(seconds?: number | null) {
  const value = Number(seconds || 0)
  if (!Number.isFinite(value) || value <= 0) return 'none'
  const mins = Math.floor(value / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 48) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

function getNextAction(board?: HermesBoardPayload) {
  if (!board?.ok) return 'Reconnect Hermes Kanban'
  if ((board.summary?.blocked || 0) > 0) return 'Clear blockers first'
  if ((board.summary?.running || 0) > 0) return 'Watch live workers'
  if ((board.columns?.ready?.length || 0) > 0) return 'Dispatch ready work'
  if ((board.columns?.triage?.length || 0) > 0) return 'Promote triage cards'
  return 'Create the next card'
}

function actionPost(payload: Record<string, unknown>) {
  return fetchJson<{ ok: boolean; error?: string }>('/api/hermes-kanban/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  } as RequestInit)
}

function TaskCard({ task, onSelect }: { task: HermesTask; onSelect: (task: HermesTask) => void }) {
  const priority = priorityLabel(task.priority)
  return (
    <button
      onClick={() => onSelect(task)}
      className="macos-panel"
      style={{
        width: '100%',
        padding: 14,
        textAlign: 'left',
        cursor: 'pointer',
        border: '1px solid rgba(255,255,255,0.09)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 13, lineHeight: 1.35, fontWeight: 750, color: 'rgba(255,255,255,0.92)' }}>
          {task.title}
        </h3>
        <span style={{ flexShrink: 0, fontSize: 10, borderRadius: 999, padding: '3px 7px', color: priority.color, background: 'rgba(255,255,255,0.05)' }}>
          {priority.label}
        </span>
      </div>

      {task.body ? (
        <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.45, color: 'rgba(255,255,255,0.48)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {task.body}
        </p>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.05)', borderRadius: 999, padding: '3px 7px' }}>
          <UserRound size={10} /> {task.assignee || 'unassigned'}
        </span>
        {task.workspace_path ? (
          <span style={{ fontSize: 10, color: '#64D2FF', background: 'rgba(100,210,255,0.1)', borderRadius: 999, padding: '3px 7px' }}>
            {task.workspace_kind || 'dir'}
          </span>
        ) : null}
        {task.worker_pid ? (
          <span style={{ fontSize: 10, color: '#BF5AF2', background: 'rgba(191,90,242,0.1)', borderRadius: 999, padding: '3px 7px' }}>
            pid {task.worker_pid}
          </span>
        ) : null}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 12, fontSize: 10, color: 'rgba(255,255,255,0.34)' }}>
        <span>{task.createdAt ? timeAgo(task.createdAt) : 'no timestamp'}</span>
        {task.tenant ? <span>{task.tenant}</span> : null}
      </div>
    </button>
  )
}

export default function HermesKanban() {
  const m = useIsMobile()
  const queryClient = useQueryClient()
  const [selectedTask, setSelectedTask] = useState<HermesTask | null>(null)
  const [commentText, setCommentText] = useState('')
  const [assigneeText, setAssigneeText] = useState('')
  const [blockReason, setBlockReason] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [statusMode, setStatusMode] = useState<'active' | 'all'>('all')
  const [createForm, setCreateForm] = useState({ title: '', body: '', assignee: 'hmudur', workspace: '', priority: '10', triage: true, skills: '' })

  const boardQuery = useQuery(apiQueryOptions<HermesBoardPayload>('/api/hermes-kanban', 10000))
  const detailQuery = useQuery({
    ...apiQueryOptions<HermesDetailPayload>(selectedTask ? `/api/hermes-kanban/tasks/${encodeURIComponent(selectedTask.id)}` : '/api/hermes-kanban/tasks/none', 10000),
    enabled: Boolean(selectedTask),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['api', '/api/hermes-kanban'] })
    if (selectedTask) queryClient.invalidateQueries({ queryKey: ['api', `/api/hermes-kanban/tasks/${selectedTask.id}`] })
  }

  const actionMutation = useMutation({
    mutationFn: actionPost,
    onSuccess: invalidate,
  })

  const board = boardQuery.data
  const detail = detailQuery.data
  const statuses = useMemo(() => board?.statuses?.length ? board.statuses : defaultStatuses, [board?.statuses])
  const columns = useMemo(() => board?.columns || emptyColumns, [board?.columns])
  const visibleStatuses = statusMode === 'active' ? statuses.filter((status) => status !== 'done') : statuses
  const filteredColumns = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    return Object.fromEntries(statuses.map((status) => {
      const tasks = (columns[status] || []).filter((task) => {
        const matchesAssignee = assigneeFilter === 'all' || (task.assignee || 'unassigned') === assigneeFilter
        if (!matchesAssignee) return false
        if (!query) return true
        return [
          task.id,
          task.title,
          task.body || '',
          task.assignee || '',
          task.tenant || '',
          task.workspace_path || '',
          ...(task.skills || []),
        ].join(' ').toLowerCase().includes(query)
      })
      return [status, tasks]
    }))
  }, [assigneeFilter, columns, searchText, statuses])
  const assigneeOptions = useMemo(() => {
    const names = new Set<string>()
    board?.assignees?.forEach((assignee) => names.add(assignee.name))
    Object.values(columns).flat().forEach((task) => names.add(task.assignee || 'unassigned'))
    return Array.from(names).sort()
  }, [board?.assignees, columns])
  const filteredCount = Object.values(filteredColumns).flat().length

  const runAction = async (payload: Record<string, unknown>) => {
    await actionMutation.mutateAsync(payload)
  }

  const createTask = async () => {
    if (!createForm.title.trim()) return
    await runAction({
      action: 'create',
      title: createForm.title.trim(),
      body: createForm.body.trim(),
      assignee: createForm.assignee.trim(),
      workspace: createForm.workspace.trim(),
      priority: Number(createForm.priority || 0),
      triage: createForm.triage,
      skills: createForm.skills.split(',').map((item) => item.trim()).filter(Boolean),
    })
    setCreateForm({ title: '', body: '', assignee: 'hmudur', workspace: '', priority: '10', triage: true, skills: '' })
    setShowCreate(false)
  }

  return (
    <PageTransition>
      <div style={{ maxWidth: 1440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: m ? 14 : 22 }}>
        <div style={{ display: 'flex', alignItems: m ? 'stretch' : 'center', justifyContent: 'space-between', gap: 12, flexDirection: m ? 'column' : 'row' }}>
          <div>
            <h1 className="text-title">Hermes Kanban</h1>
            <p className="text-body" style={{ marginTop: 4 }}>hmudur board, worker state, blockers, and handoffs</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => boardQuery.refetch()}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.78)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
            >
              <RefreshCw size={14} /> Refresh
            </button>
            <button
              onClick={() => {
                if (confirm('Dispatch one ready Hermes Kanban worker?')) void runAction({ action: 'dispatch', taskId: 'board' })
              }}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(191,90,242,0.25)', background: 'rgba(191,90,242,0.12)', color: '#BF5AF2', cursor: 'pointer', fontSize: 12, fontWeight: 800 }}
            >
              <Play size={14} /> Dispatch
            </button>
            <button
              onClick={() => setShowCreate(true)}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 16px', borderRadius: 10, border: 'none', background: '#007AFF', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 800 }}
            >
              <Plus size={14} /> New Card
            </button>
          </div>
        </div>

        {boardQuery.isLoading ? (
          <div className="macos-panel" style={{ padding: 22, display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(255,255,255,0.7)' }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: '#007AFF' }} /> Loading Hermes board
          </div>
        ) : board?.ok === false || boardQuery.error ? (
          <div className="macos-panel" style={{ padding: 18, borderLeft: '3px solid #FF453A' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#FF453A', fontWeight: 800, fontSize: 13 }}>
              <AlertCircle size={16} /> Hermes Kanban unavailable
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.62)' }}>{board?.error || boardQuery.error?.message || 'Unknown error'}</p>
            <p style={{ margin: '8px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.42)' }}>
              Check that Mission Control is running the latest server and can reach the hmudur profile database.
            </p>
          </div>
        ) : (
          <>
            <div className="macos-panel" style={{ padding: m ? 14 : 16, display: 'grid', gridTemplateColumns: m ? '1fr' : 'minmax(220px, 1.2fr) repeat(5, minmax(110px, 1fr))', gap: 12, alignItems: 'stretch' }}>
              <div style={{ borderLeft: '3px solid #64D2FF', paddingLeft: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.48)', fontSize: 10, fontWeight: 850, textTransform: 'uppercase' }}>
                  <Zap size={13} /> Next action
                </div>
                <div style={{ marginTop: 8, fontSize: 18, lineHeight: 1.2, fontWeight: 850, color: 'rgba(255,255,255,0.94)' }}>{getNextAction(board)}</div>
                <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.42)' }}>
                  Refreshed {board?.refreshedAt ? timeAgo(board.refreshedAt) : 'just now'}
                </div>
              </div>
              {[
                { label: 'Active', value: board?.summary?.active || 0, color: '#64D2FF' },
                { label: 'Running', value: board?.summary?.running || 0, color: '#BF5AF2' },
                { label: 'Blocked', value: board?.summary?.blocked || 0, color: '#FF453A' },
                { label: 'Done', value: board?.summary?.done || 0, color: '#32D74B' },
                { label: 'Oldest ready', value: compactAge(board?.stats?.oldest_ready_age_seconds), color: '#FF9500' },
              ].map((item) => (
                <div key={item.label} style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.46)', fontWeight: 800, textTransform: 'uppercase' }}>{item.label}</div>
                  <div style={{ marginTop: 8, fontSize: typeof item.value === 'number' ? 24 : 15, fontWeight: 850, color: item.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div className="macos-panel" style={{ padding: 12, display: 'grid', gridTemplateColumns: m ? '1fr' : 'minmax(220px, 1fr) auto auto', gap: 10, alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.04)', padding: '0 10px', minHeight: 38 }}>
                <Search size={14} style={{ color: 'rgba(255,255,255,0.42)', flexShrink: 0 }} />
                <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search cards, workspace, tenant, skills" style={{ width: '100%', border: 0, outline: 0, background: 'transparent', color: 'rgba(255,255,255,0.9)', fontSize: 12 }} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.04)', padding: '0 10px', minHeight: 38 }}>
                <UsersRound size={14} style={{ color: 'rgba(255,255,255,0.42)', flexShrink: 0 }} />
                <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} style={{ minWidth: m ? '100%' : 150, border: 0, outline: 0, background: 'transparent', color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>
                  <option value="all">All assignees</option>
                  {assigneeOptions.map((assignee) => <option key={assignee} value={assignee}>{assignee}</option>)}
                </select>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: m ? 'stretch' : 'flex-end' }}>
                <SlidersHorizontal size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
                {(['active', 'all'] as const).map((mode) => (
                  <button key={mode} onClick={() => setStatusMode(mode)} style={{ flex: m ? 1 : 'initial', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.09)', background: statusMode === mode ? 'rgba(0,122,255,0.18)' : 'rgba(255,255,255,0.04)', color: statusMode === mode ? '#64D2FF' : 'rgba(255,255,255,0.62)', fontSize: 12, fontWeight: 800, cursor: 'pointer', textTransform: 'capitalize' }}>
                    {mode}
                  </button>
                ))}
              </div>
              {(searchText || assigneeFilter !== 'all') ? (
                <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                  <span>{filteredCount} matching cards</span>
                  <button onClick={() => { setSearchText(''); setAssigneeFilter('all') }} style={{ border: 0, background: 'transparent', color: '#64D2FF', cursor: 'pointer', fontSize: 11, fontWeight: 800 }}>Clear filters</button>
                </div>
              ) : null}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : 'repeat(3, minmax(260px, 1fr))', gap: 14, alignItems: 'start' }}>
              {visibleStatuses.map((status) => {
                const config = statusConfig[status] || statusConfig.todo
                const Icon = config.icon
                const tasks = filteredColumns[status] || []
                return (
                  <section key={status} style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px' }}>
                      <Icon size={15} style={{ color: config.color }} />
                      <h2 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.9)' }}>{config.label}</h2>
                      <span style={{ fontSize: 10, borderRadius: 999, padding: '2px 7px', color: config.color, background: 'rgba(255,255,255,0.05)' }}>{tasks.length}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {tasks.length ? tasks.map((task) => <TaskCard key={task.id} task={task} onSelect={setSelectedTask} />) : (
                        <div style={{ padding: 18, borderRadius: 10, border: '1px dashed rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.32)', fontSize: 12, textAlign: 'center' }}>
                          {config.empty}
                        </div>
                      )}
                    </div>
                  </section>
                )
              })}
            </div>
          </>
        )}
      </div>

      {selectedTask ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', justifyContent: 'flex-end' }} onClick={() => setSelectedTask(null)}>
          <aside onClick={(event) => event.stopPropagation()} style={{ width: m ? '100%' : 560, height: '100%', overflowY: 'auto', background: 'rgba(20,20,22,0.98)', borderLeft: '1px solid rgba(255,255,255,0.1)', padding: m ? 18 : 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.42)' }}>{selectedTask.id}</p>
                <h2 style={{ margin: '5px 0 0', fontSize: 18, lineHeight: 1.25, color: 'rgba(255,255,255,0.94)' }}>{detail?.task?.title || selectedTask.title}</h2>
              </div>
              <button onClick={() => setSelectedTask(null)} style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            {detailQuery.isLoading ? (
              <div className="macos-panel" style={{ padding: 16, display: 'flex', gap: 8, alignItems: 'center', color: 'rgba(255,255,255,0.65)' }}>
                <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Loading detail
              </div>
            ) : null}

            <div className="macos-panel" style={{ padding: 16 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { label: detail?.task?.status || selectedTask.status, color: statusConfig[selectedTask.status]?.color || '#8E8E93' },
                  { label: detail?.task?.assignee || selectedTask.assignee || 'unassigned', color: '#64D2FF' },
                  { label: `priority ${detail?.task?.priority ?? selectedTask.priority ?? 0}`, color: priorityLabel(detail?.task?.priority ?? selectedTask.priority).color },
                ].map((item) => (
                  <span key={item.label} style={{ fontSize: 11, fontWeight: 800, color: item.color, background: 'rgba(255,255,255,0.05)', borderRadius: 999, padding: '5px 9px' }}>{item.label}</span>
                ))}
              </div>
              {(detail?.task?.body || selectedTask.body) ? (
                <p style={{ margin: '14px 0 0', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,0.72)' }}>{detail?.task?.body || selectedTask.body}</p>
              ) : null}
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                <span>Created {selectedTask.createdAt ? timeAgo(selectedTask.createdAt) : 'unknown'}</span>
                <span>Heartbeat {selectedTask.lastHeartbeatAt ? timeAgo(selectedTask.lastHeartbeatAt) : 'none'}</span>
                <span style={{ gridColumn: '1 / -1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Workspace {selectedTask.workspace_path || 'scratch'}</span>
              </div>
            </div>

            <div className="macos-panel" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 850 }}>Operator Actions</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={assigneeText} onChange={(event) => setAssigneeText(event.target.value)} placeholder="assignee profile" style={{ flex: 1, minWidth: 0, padding: '9px 11px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.9)' }} />
                <button disabled={!assigneeText.trim()} onClick={() => runAction({ action: 'assign', taskId: selectedTask.id, assignee: assigneeText.trim() })} style={{ padding: '9px 12px', borderRadius: 8, border: 'none', background: assigneeText.trim() ? '#007AFF' : 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 800, cursor: assigneeText.trim() ? 'pointer' : 'not-allowed' }}>Assign</button>
              </div>
              <textarea value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Add an audit comment" rows={3} style={{ padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.9)', resize: 'vertical' }} />
              <button disabled={!commentText.trim()} onClick={async () => { await runAction({ action: 'comment', taskId: selectedTask.id, text: commentText.trim() }); setCommentText('') }} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(100,210,255,0.25)', background: 'rgba(100,210,255,0.1)', color: '#64D2FF', fontWeight: 800, cursor: commentText.trim() ? 'pointer' : 'not-allowed' }}>
                <MessageSquare size={14} /> Comment
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={blockReason} onChange={(event) => setBlockReason(event.target.value)} placeholder="block reason" style={{ flex: 1, minWidth: 0, padding: '9px 11px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.9)' }} />
                <button onClick={() => runAction({ action: 'block', taskId: selectedTask.id, reason: blockReason.trim() || 'Blocked from Mission Control' })} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(255,69,58,0.26)', background: 'rgba(255,69,58,0.1)', color: '#FF453A', fontWeight: 800, cursor: 'pointer' }}>Block</button>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => runAction({ action: 'unblock', taskId: selectedTask.id })} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(50,215,75,0.25)', background: 'rgba(50,215,75,0.1)', color: '#32D74B', fontWeight: 800, cursor: 'pointer' }}>Unblock</button>
                <button onClick={() => { if (confirm(`Archive ${selectedTask.id}?`)) void runAction({ action: 'archive', taskId: selectedTask.id }) }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', fontWeight: 800, cursor: 'pointer' }}>
                  <Archive size={14} /> Archive
                </button>
              </div>
              {actionMutation.isPending ? <p style={{ margin: 0, fontSize: 11, color: '#007AFF' }}>Applying action...</p> : null}
            </div>

            <div className="macos-panel" style={{ padding: 16 }}>
              <h3 style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 850 }}>Runs</h3>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {detail?.runs?.length ? detail.runs.map((run) => (
                  <div key={run.id} style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.74)', fontWeight: 800 }}>
                      <span>{run.profile || 'worker'} · {run.status || 'unknown'}</span>
                      <span>{run.startedAt ? timeAgo(run.startedAt) : ''}</span>
                    </div>
                    {run.summary || run.error ? <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.45, color: run.error ? '#FF9F0A' : 'rgba(255,255,255,0.55)' }}>{run.error || run.summary}</p> : null}
                  </div>
                )) : <p style={{ margin: '10px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>No runs recorded.</p>}
              </div>
            </div>

            <div className="macos-panel" style={{ padding: 16 }}>
              <h3 style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 850 }}>Recent Events</h3>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {detail?.events?.length ? detail.events.slice().reverse().slice(0, 8).map((event, index) => (
                  <div key={`${event.kind}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, color: 'rgba(255,255,255,0.58)', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 7 }}>
                    <span>{event.kind}</span>
                    <span style={{ color: 'rgba(255,255,255,0.35)' }}>{event.createdAt ? timeAgo(event.createdAt) : ''}</span>
                  </div>
                )) : <p style={{ margin: '10px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>No events recorded.</p>}
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {showCreate ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }} onClick={() => setShowCreate(false)}>
          <div onClick={(event) => event.stopPropagation()} style={{ width: '100%', maxWidth: 560, borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(24,24,26,0.98)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: 17, color: 'rgba(255,255,255,0.94)' }}>New Hermes Card</h2>
              <button onClick={() => setShowCreate(false)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}><X size={15} /></button>
            </div>
            <input value={createForm.title} onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Title" autoFocus style={{ padding: 11, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.9)' }} />
            <textarea value={createForm.body} onChange={(event) => setCreateForm((prev) => ({ ...prev, body: event.target.value }))} placeholder="Body and acceptance criteria" rows={5} style={{ padding: 11, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.9)', resize: 'vertical' }} />
            <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: 10 }}>
              <input value={createForm.assignee} onChange={(event) => setCreateForm((prev) => ({ ...prev, assignee: event.target.value }))} placeholder="Assignee" style={{ padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.9)' }} />
              <input value={createForm.priority} onChange={(event) => setCreateForm((prev) => ({ ...prev, priority: event.target.value }))} placeholder="Priority" type="number" style={{ padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.9)' }} />
              <input value={createForm.workspace} onChange={(event) => setCreateForm((prev) => ({ ...prev, workspace: event.target.value }))} placeholder="workspace, e.g. dir:/Users/..." style={{ padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.9)' }} />
              <input value={createForm.skills} onChange={(event) => setCreateForm((prev) => ({ ...prev, skills: event.target.value }))} placeholder="skills, comma separated" style={{ padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.9)' }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(255,255,255,0.66)' }}>
              <input type="checkbox" checked={createForm.triage} onChange={(event) => setCreateForm((prev) => ({ ...prev, triage: event.target.checked }))} />
              Start in triage
            </label>
            <button disabled={!createForm.title.trim() || actionMutation.isPending} onClick={createTask} style={{ padding: 12, borderRadius: 10, border: 'none', background: createForm.title.trim() ? '#007AFF' : 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 13, fontWeight: 850, cursor: createForm.title.trim() ? 'pointer' : 'not-allowed' }}>
              Create Card
            </button>
          </div>
        </div>
      ) : null}
    </PageTransition>
  )
}
