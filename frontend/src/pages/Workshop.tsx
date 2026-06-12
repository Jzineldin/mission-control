import React, { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Clock, Zap, CheckCircle, Play, X, AlertCircle, Loader2, ArrowLeft, MessageSquare } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import { apiQueryOptions, timeAgo } from '../lib/hooks'
import { useIsMobile } from '../lib/useIsMobile'

const priorityConfig: Record<string, { color: string; label: string }> = {
  high: { color: '#FF453A', label: 'High' },
  medium: { color: '#FF9500', label: 'Medium' },
  low: { color: '#007AFF', label: 'Low' },
}

const columnConfig: Record<string, { title: string; color: string; icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }> }> = {
  queue: { title: 'Queue', color: '#8E8E93', icon: Clock },
  inProgress: { title: 'In Progress', color: '#007AFF', icon: Zap },
  blocked: { title: 'Blocked', color: '#FF453A', icon: AlertCircle },
  done: { title: 'Done', color: '#32D74B', icon: CheckCircle },
}

interface Task {
  id: string
  title: string
  description: string
  priority: string
  created?: string
  completed?: string
  startedAt?: string
  status?: string
  result?: string
  error?: string
  tags: string[]
  source?: string
  childSessionKey?: string
  executionPath?: 'direct' | 'task-path' | 'automation'
  routingReason?: string
  structuredTaskRequired?: boolean
  deliveryMode?: string
  managerDecision?: string
}

interface TasksPayload {
  columns: {
    queue: Task[]
    inProgress: Task[]
    blocked: Task[]
    done: Task[]
  }
}

const executionPathConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
  direct: { label: 'Direct', color: '#64D2FF', bg: 'rgba(100,210,255,0.12)', border: '1px solid rgba(100,210,255,0.25)' },
  'task-path': { label: 'Task Path', color: '#32D74B', bg: 'rgba(50,215,75,0.12)', border: '1px solid rgba(50,215,75,0.25)' },
  automation: { label: 'Automation', color: '#BF5AF2', bg: 'rgba(191,90,242,0.12)', border: '1px solid rgba(191,90,242,0.25)' },
}

function renderPathBadge(path?: string) {
  const config = executionPathConfig[String(path || 'task-path')] || executionPathConfig['task-path']
  return (
    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, color: config.color, background: config.bg, border: config.border, fontWeight: 600 }}>
      {config.label}
    </span>
  )
}

function blockedExplanation(task: Task) {
  const text = `${task.error || ''}\n${task.result || ''}`.trim()
  const lower = text.toLowerCase()
  const reasons: string[] = []
  const nextSteps: string[] = []

  if (lower.includes('no usable result')) {
    reasons.push('The agent process returned success, but the task did not produce a usable final result.')
    nextSteps.push('Re-run only after the gateway/config issue below is fixed; otherwise it will likely false-complete again.')
  }
  if (lower.includes('gateway token mismatch') || lower.includes('unauthorized')) {
    reasons.push('The local gateway rejected the request because the configured remote token does not match.')
    nextSteps.push('Align gateway.remote.token with the running gateway, then retry this task.')
  }
  if (lower.includes('missing env var')) {
    const matches = [...text.matchAll(/missing env var "([^"]+)"/g)].map(match => match[1])
    const unique = Array.from(new Set(matches)).slice(0, 4)
    reasons.push(unique.length ? `Missing environment variables: ${unique.join(', ')}.` : 'One or more configured environment variables are missing.')
    nextSteps.push('Set the required env vars only if that integration is needed; optional providers can stay disabled.')
  }
  if (!reasons.length && text) {
    reasons.push(text.split('\n').find(Boolean)?.slice(0, 180) || 'The task reported an execution error.')
  }
  if (!nextSteps.length) {
    nextSteps.push('Open the task report, fix the first concrete failure, then retry.')
  }

  return { reasons, nextSteps }
}

function BlockedExplanation({ task, compact = false }: { task: Task; compact?: boolean }) {
  const explanation = blockedExplanation(task)
  return (
    <div style={{
      padding: compact ? '8px 10px' : '12px 14px',
      borderRadius: 10,
      background: 'rgba(255,159,10,0.08)',
      border: '1px solid rgba(255,159,10,0.2)',
      display: 'flex',
      flexDirection: 'column',
      gap: compact ? 5 : 8,
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#FFB224' }}>Why blocked</div>
      {explanation.reasons.slice(0, compact ? 1 : 3).map((reason) => (
        <p key={reason} style={{ margin: 0, fontSize: compact ? 11 : 12, lineHeight: 1.55, color: 'rgba(255,255,255,0.78)' }}>{reason}</p>
      ))}
      {!compact && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.72)' }}>Next useful action</div>
          {explanation.nextSteps.slice(0, 2).map((step) => (
            <p key={step} style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: 'rgba(255,255,255,0.68)' }}>{step}</p>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Workshop() {
  const m = useIsMobile()
  const queryClient = useQueryClient()
  const { data, isLoading: loading } = useQuery(apiQueryOptions<TasksPayload>('/api/tasks', 5000))
  const donePageSize = m ? 6 : 10
  const [showAddModal, setShowAddModal] = useState(false)
  const [viewTask, setViewTask] = useState<Task | null>(null)
  const [addForm, setAddForm] = useState({ title: '', description: '', priority: 'medium', tags: '' })
  const [executing, setExecuting] = useState<Record<string, boolean>>({})
  const [doneVisibleCount, setDoneVisibleCount] = useState(donePageSize)
  const [searchParams, setSearchParams] = useSearchParams()
  const invalidateTasks = () => queryClient.invalidateQueries({ queryKey: ['api', '/api/tasks'] })

  const addTaskMutation = useMutation({
    mutationFn: async (payload: { title: string; description: string; priority: string; tags: string[] }) => {
      await fetch('/api/tasks/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    },
    onSuccess: invalidateTasks,
  })

  const executeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await fetch(`/api/tasks/${taskId}/execute`, { method: 'POST' })
    },
    onSettled: invalidateTasks,
  })

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
    },
    onSettled: invalidateTasks,
  })

  // Auto-open task from URL param (?task=xxx). This synchronizes external state
  // (the URL) into component state and must also clear the param via
  // setSearchParams, which cannot run during render — so the effect is the
  // right home for it despite the lint rule.
  useEffect(() => {
    if (!data || viewTask) return
    const taskId = searchParams.get('task')
    if (!taskId) return
    const columns = data.columns
    for (const col of Object.values(columns) as Task[][]) {
      const found = col.find(t => t.id === taskId)
      if (found) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setViewTask(found)
        setSearchParams({}, { replace: true })
        break
      }
    }
  }, [data, searchParams, viewTask, setSearchParams])

  // Clamp doneVisibleCount to totalDone during render (avoids setState-in-effect).
  const totalDone = data?.columns?.done?.length ?? 0
  const clampedDoneCount = totalDone === 0 ? donePageSize : Math.max(donePageSize, Math.min(doneVisibleCount, totalDone))
  if (clampedDoneCount !== doneVisibleCount) {
    setDoneVisibleCount(clampedDoneCount)
  }

  if (loading || !data) {
    return (
      <PageTransition>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
          <div style={{ width: 24, height: 24, border: '2px solid #007AFF', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
      </PageTransition>
    )
  }

  const columns = data.columns

  const handleAddTask = async () => {
    if (!addForm.title.trim()) return
    try {
      await addTaskMutation.mutateAsync({
        title: addForm.title.trim(),
        description: addForm.description.trim(),
        priority: addForm.priority,
        tags: addForm.tags.split(',').map(t => t.trim()).filter(Boolean),
      })
      setShowAddModal(false)
      setAddForm({ title: '', description: '', priority: 'medium', tags: '' })
    } catch { /* mutation failed; modal stays open so user can retry */ }
  }

  const handleExecute = async (taskId: string) => {
    setExecuting(prev => ({ ...prev, [taskId]: true }))
    try {
      await executeTaskMutation.mutateAsync(taskId)
    } catch { /* execution request failed; task remains in current column */ }
  }

  const discussWithMudur = (task: Task) => {
    const reportSnippet = task.result ? task.result.substring(0, 500) : task.description
    const message = `Regarding the task "${task.title}":\n\n${reportSnippet}\n\nWhat should we do with this?`
    window.dispatchEvent(new CustomEvent('open-chat', { detail: { message } }))
  }

  // === TASK REPORT VIEW ===
  if (viewTask) {
    const isExecuting = viewTask.status === 'executing'
    return (
      <PageTransition>
        <div style={{ maxWidth: m ? '100%' : 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: m ? 14 : 20 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => setViewTask(null)}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 8, cursor: 'pointer', display: 'flex', color: 'rgba(255,255,255,0.7)' }}
            >
              <ArrowLeft size={18} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: m ? 15 : 17, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>
                {viewTask.title}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: priorityConfig[viewTask.priority]?.color || '#8E8E93' }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                  {isExecuting ? 'Sub-agent working...' : viewTask.status === 'done' ? `Completed ${viewTask.completed ? timeAgo(viewTask.completed) : ''}` : 'Queued'}
                </span>
                {renderPathBadge(viewTask.executionPath)}
                {viewTask.structuredTaskRequired ? (
                  <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.65)' }}>
                    decision-first
                  </span>
                ) : null}
                {viewTask.tags?.map(tag => (
                  <span key={tag} style={{ fontSize: 10, padding: '1px 7px', borderRadius: 5, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>{tag}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          {viewTask.description && (
            <div className="macos-panel" style={{ padding: m ? 14 : 20 }}>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>Task Description</p>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>{viewTask.description}</p>
              {viewTask.routingReason ? (
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.42)', marginTop: 10 }}>
                  Route: {viewTask.routingReason}
                </p>
              ) : null}
            </div>
          )}

          {/* Executing state */}
          {isExecuting && (
            <div className="macos-panel" style={{ padding: m ? 14 : 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Loader2 size={18} style={{ color: '#007AFF', animation: 'spin 1s linear infinite' }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#007AFF' }}>Sub-agent is working...</p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Results will appear here when done. This page auto-refreshes.</p>
                </div>
              </div>
            </div>
          )}

          {/* Report */}
          {viewTask.result && (
            <div className="macos-panel" style={{ padding: m ? 14 : 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>📋 Agent Report</p>
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {viewTask.result}
              </div>
            </div>
          )}

          {/* Error */}
          {viewTask.error && (
            <div className="macos-panel" style={{ padding: m ? 14 : 20, borderLeft: '3px solid #FF453A' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <AlertCircle size={16} style={{ color: '#FF453A' }} />
                <p style={{ fontSize: 13, color: '#FF453A' }}>{viewTask.error}</p>
              </div>
              <BlockedExplanation task={viewTask} />
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, flexDirection: m ? 'column' : 'row' }}>
            {/* Discuss with Müdür — the primary action */}
            {viewTask.result && (
              <button
                onClick={() => discussWithMudur(viewTask)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: '#007AFF', color: '#fff', fontSize: 13, fontWeight: 600,
                }}
              >
                <MessageSquare size={15} /> Discuss with Müdür
              </button>
            )}

            {/* Execute for queue tasks */}
            {!viewTask.result && !isExecuting && (
              <button
                onClick={() => { handleExecute(viewTask.id); setViewTask({ ...viewTask, status: 'executing' }); }}
                disabled={executing[viewTask.id]}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: '#007AFF', color: '#fff', fontSize: 13, fontWeight: 600,
                }}
              >
                <Play size={15} /> Execute Task
              </button>
            )}

            {/* Re-execute */}
            {viewTask.result && (
              <button
                onClick={() => { handleExecute(viewTask.id); setViewTask({ ...viewTask, status: 'executing', result: undefined }); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px 20px', borderRadius: 10, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500,
                }}
              >
                <Play size={14} /> Re-run
              </button>
            )}
          </div>

          {/* Delete button */}
          <button
            onClick={async () => {
              if (!confirm(`Delete "${viewTask.title}"?`)) return
              await deleteTaskMutation.mutateAsync(viewTask.id)
              setViewTask(null)
            }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,69,58,0.3)',
              background: 'rgba(255,69,58,0.1)', color: '#FF453A', fontSize: 12, cursor: 'pointer',
              marginTop: 8, width: m ? '100%' : 'auto', alignSelf: 'flex-start',
            }}
          >
            🗑 Delete Task
          </button>
        </div>
      </PageTransition>
    )
  }

  // === KANBAN VIEW ===
  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: m ? 14 : 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: m ? 'flex-start' : 'center', justifyContent: 'space-between', flexDirection: m ? 'column' : 'row', gap: m ? 12 : 0 }}>
          <div>
            <h1 className="text-title">Workshop</h1>
            <p className="text-body" style={{ marginTop: 4 }}>Create tasks, let your agent research & execute them</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: m ? '10px 16px' : '10px 20px',
              borderRadius: 10, border: 'none', cursor: 'pointer',
              background: '#007AFF', color: '#fff',
              fontSize: 13, fontWeight: 600,
              width: m ? '100%' : undefined,
              justifyContent: m ? 'center' : undefined,
            }}
          >
            <Plus size={15} /> Add Task
          </button>
        </div>

        {/* Kanban Columns */}
        <div style={{ display: 'flex', flexDirection: m ? 'column' : 'row', gap: m ? 20 : 24 }}>
          {(['queue', 'inProgress', 'blocked', 'done'] as const).map((col) => {
            const tasks: Task[] = columns[col] || []
            const visibleTasks = col === 'done' ? tasks.slice(0, doneVisibleCount) : tasks
            const hiddenDoneCount = col === 'done' ? Math.max(0, tasks.length - visibleTasks.length) : 0
            const config = columnConfig[col]
            const Icon = config.icon
            return (
              <div key={col} style={{ flex: m ? undefined : 1, minWidth: 0 }}>
                {/* Column Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingLeft: 4 }}>
                  <Icon size={15} style={{ color: config.color }} />
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>{config.title}</h3>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>{tasks.length}</span>
                </div>

                {col === 'done' && tasks.length > donePageSize && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginBottom: 12,
                    padding: '10px 12px',
                    borderRadius: 12,
                    background: 'rgba(50,215,75,0.06)',
                    border: '1px solid rgba(50,215,75,0.14)',
                  }}>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
                      Showing latest {visibleTasks.length} of {tasks.length}
                    </p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {hiddenDoneCount > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDoneVisibleCount((current) => Math.min(tasks.length, current + donePageSize))
                          }}
                          style={{
                            padding: '5px 10px',
                            borderRadius: 999,
                            border: '1px solid rgba(50,215,75,0.18)',
                            background: 'rgba(50,215,75,0.08)',
                            color: '#32D74B',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Show {Math.min(donePageSize, hiddenDoneCount)} more
                        </button>
                      )}
                      {hiddenDoneCount > donePageSize && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDoneVisibleCount(tasks.length)
                          }}
                          style={{
                            padding: '5px 10px',
                            borderRadius: 999,
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: 'rgba(255,255,255,0.05)',
                            color: 'rgba(255,255,255,0.75)',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Show all
                        </button>
                      )}
                      {doneVisibleCount > donePageSize && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDoneVisibleCount(donePageSize)
                          }}
                          style={{
                            padding: '5px 10px',
                            borderRadius: 999,
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: 'transparent',
                            color: 'rgba(255,255,255,0.6)',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Recent only
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Cards */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  ...(col === 'done' && !m ? {
                    maxHeight: 'min(72vh, 960px)',
                    overflowY: 'auto',
                    paddingRight: 4,
                  } : {}),
                }}>
                  {tasks.length === 0 && (
                    <div style={{ padding: '24px 16px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 12, color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
                      {col === 'queue' ? 'Add tasks or deploy from Scout' : col === 'inProgress' ? 'Execute a task to start' : 'Completed tasks show here'}
                    </div>
                  )}
                  {visibleTasks.map((task, i) => (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 + i * 0.03 }}
                      className="macos-panel"
                      style={{ padding: m ? 14 : 16, cursor: 'pointer' }}
                      onClick={() => setViewTask(task)}
                    >
                      {/* Priority dot + title */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ 
                          display: 'inline-block', 
                          width: 8, 
                          height: 8, 
                          borderRadius: '50%', 
                          background: task.priority === 'high' ? '#FF453A' : task.priority === 'medium' ? '#FF9500' : '#8E8E93',
                          marginRight: 8 
                        }} />
                        <h4 style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {task.title}
                        </h4>
                        <span style={{ 
                          fontSize: 10, 
                          padding: '2px 6px', 
                          borderRadius: 4, 
                          background: `rgba(${task.priority === 'high' ? '255,69,58' : task.priority === 'medium' ? '255,149,0' : '142,142,147'}, 0.15)`,
                          color: task.priority === 'high' ? '#FF453A' : task.priority === 'medium' ? '#FF9500' : '#8E8E93',
                          textTransform: 'capitalize',
                          fontWeight: 500
                        }}>
                          {task.priority}
                        </span>
                        {renderPathBadge(task.executionPath)}
                      </div>

                      {/* Description */}
                      {task.description && (
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 10, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {task.description}
                        </p>
                      )}

                      {/* Status for in-progress */}
                      {col === 'inProgress' && task.status === 'executing' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, padding: '6px 10px', borderRadius: 8, background: 'rgba(0,122,255,0.1)', border: '1px solid rgba(0,122,255,0.2)' }}>
                          <Loader2 size={12} style={{ color: '#007AFF', animation: 'spin 1s linear infinite' }} />
                          <span style={{ fontSize: 11, color: '#007AFF', fontWeight: 500 }}>Sub-agent working...</span>
                        </div>
                      )}

                      {col === 'blocked' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.2)' }}>
                          <AlertCircle size={12} style={{ color: '#FF453A' }} />
                          <span style={{ fontSize: 11, color: '#FF453A', fontWeight: 500 }}>{task.error ? 'Needs attention' : 'Execution blocked'}</span>
                        </div>
                      )}

                      {/* Result preview for done tasks */}
                      {col === 'done' && task.result && (
                        <div style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(50,215,75,0.08)', border: '1px solid rgba(50,215,75,0.15)', marginBottom: 10 }}>
                          <p style={{ fontSize: 11, color: 'rgba(50,215,75,0.8)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            ✅ {task.result}
                          </p>
                        </div>
                      )}

                      {col === 'blocked' && (task.error || task.result) && (
                        <div style={{ marginBottom: 10 }}>
                          <BlockedExplanation task={task} compact />
                        </div>
                      )}

                      {/* Footer: tags + actions */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1, overflow: 'hidden' }}>
                          {task.tags?.map(tag => {
                            const tagColors = ['#007AFF', '#32D74B', '#FF9500', '#FF453A', '#BF5AF2', '#64D2FF'];
                            const colorIndex = tag.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % tagColors.length;
                            const tagColor = tagColors[colorIndex];
                            return (
                              <span key={tag} style={{ 
                                fontSize: 10, 
                                padding: '2px 7px', 
                                borderRadius: 5, 
                                background: `rgba(${parseInt(tagColor.slice(1,3), 16)}, ${parseInt(tagColor.slice(3,5), 16)}, ${parseInt(tagColor.slice(5,7), 16)}, 0.15)`, 
                                color: tagColor,
                                border: `1px solid rgba(${parseInt(tagColor.slice(1,3), 16)}, ${parseInt(tagColor.slice(3,5), 16)}, ${parseInt(tagColor.slice(5,7), 16)}, 0.3)`
                              }}>{tag}</span>
                            );
                          })}
                          {task.source && (
                            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 5, background: task.source === 'scout' ? 'rgba(191,90,242,0.12)' : 'rgba(255,255,255,0.06)', color: task.source === 'scout' ? '#BF5AF2' : 'rgba(255,255,255,0.4)' }}>
                              {task.source}
                            </span>
                          )}
                          {task.structuredTaskRequired ? (
                            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 5, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)' }}>
                              decision-first
                            </span>
                          ) : null}
                        </div>

                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                          {/* Execute button for queue tasks */}
                          {col === 'queue' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleExecute(task.id); }}
                              disabled={executing[task.id]}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                padding: '6px 12px', borderRadius: 8,
                                border: 'none', cursor: executing[task.id] ? 'wait' : 'pointer',
                                background: executing[task.id] ? 'rgba(0,122,255,0.3)' : '#007AFF',
                                color: '#fff', fontSize: 11, fontWeight: 600,
                              }}
                            >
                              {executing[task.id] ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={12} />}
                              Execute
                            </button>
                          )}

                          {/* Discuss for done tasks */}
                          {col === 'done' && task.result && (
                            <button
                              onClick={(e) => { e.stopPropagation(); discussWithMudur(task); }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '5px 10px', borderRadius: 7,
                                border: '1px solid rgba(0,122,255,0.3)', background: 'rgba(0,122,255,0.08)',
                                color: '#007AFF', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                              }}
                            >
                              <MessageSquare size={11} /> Discuss
                            </button>
                          )}

                          {col === 'blocked' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleExecute(task.id); }}
                              disabled={executing[task.id]}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '5px 10px', borderRadius: 7,
                                border: '1px solid rgba(255,69,58,0.3)', background: 'rgba(255,69,58,0.08)',
                                color: '#FF453A', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                              }}
                            >
                              {executing[task.id] ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={11} />}
                              Retry
                            </button>
                          )}

                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                            {task.completed ? timeAgo(task.completed) : task.created ? timeAgo(task.created) : ''}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Add Task Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              style={{ background: 'rgba(28,28,30,0.95)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: m ? 12 : 16, padding: m ? 20 : 28, width: '100%', maxWidth: m ? '95vw' : 480 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>Add Task</h2>
                <button onClick={() => setShowAddModal(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <X size={16} style={{ color: 'rgba(255,255,255,0.6)' }} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.65)', marginBottom: 6 }}>Title *</label>
                  <input
                    value={addForm.title}
                    onChange={(e) => setAddForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g. Research competitors, Write blog post..."
                    autoFocus
                    style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 13, color: 'rgba(255,255,255,0.92)', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.65)', marginBottom: 6 }}>Description</label>
                  <textarea
                    value={addForm.description}
                    onChange={(e) => setAddForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="What should be done? Any specific instructions..."
                    rows={3}
                    style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 13, color: 'rgba(255,255,255,0.92)', outline: 'none', resize: 'vertical', minHeight: 70, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.65)', marginBottom: 6 }}>Priority</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['low', 'medium', 'high'] as const).map(p => (
                      <button
                        key={p}
                        onClick={() => setAddForm(prev => ({ ...prev, priority: p }))}
                        style={{
                          flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer',
                          border: addForm.priority === p ? `1px solid ${priorityConfig[p].color}40` : '1px solid rgba(255,255,255,0.08)',
                          background: addForm.priority === p ? `${priorityConfig[p].color}15` : 'rgba(255,255,255,0.04)',
                          color: addForm.priority === p ? priorityConfig[p].color : 'rgba(255,255,255,0.5)',
                          fontSize: 12, fontWeight: 500, textTransform: 'capitalize',
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.65)', marginBottom: 6 }}>Tags (comma separated)</label>
                  <input
                    value={addForm.tags}
                    onChange={(e) => setAddForm(prev => ({ ...prev, tags: e.target.value }))}
                    placeholder="research, email, dev..."
                    style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 13, color: 'rgba(255,255,255,0.92)', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <button
                onClick={handleAddTask}
                disabled={!addForm.title.trim()}
                style={{
                  width: '100%', marginTop: 20, padding: '12px', borderRadius: 10,
                  border: 'none', cursor: addForm.title.trim() ? 'pointer' : 'not-allowed',
                  background: addForm.title.trim() ? '#007AFF' : 'rgba(255,255,255,0.08)',
                  color: '#fff', fontSize: 14, fontWeight: 600,
                  opacity: addForm.title.trim() ? 1 : 0.5,
                }}
              >
                Add to Queue
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  )
}
