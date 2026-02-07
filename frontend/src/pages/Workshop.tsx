import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Clock, Zap, CheckCircle, Play, X, AlertCircle, Loader2, ArrowLeft, MessageSquare, ExternalLink } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import { useApi, timeAgo } from '../lib/hooks'
import { useIsMobile } from '../lib/useIsMobile'

const priorityConfig: Record<string, { color: string; label: string }> = {
  high: { color: '#FF453A', label: 'High' },
  medium: { color: '#FF9500', label: 'Medium' },
  low: { color: '#007AFF', label: 'Low' },
}

const columnConfig: Record<string, { title: string; color: string; icon: any }> = {
  queue: { title: 'Queue', color: '#8E8E93', icon: Clock },
  inProgress: { title: 'In Progress', color: '#007AFF', icon: Zap },
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
}

export default function Workshop() {
  const m = useIsMobile()
  const { data, loading, refetch } = useApi<any>('/api/tasks', 5000)
  const [showAddModal, setShowAddModal] = useState(false)
  const [viewTask, setViewTask] = useState<Task | null>(null)
  const [addForm, setAddForm] = useState({ title: '', description: '', priority: 'medium', tags: '' })
  const [executing, setExecuting] = useState<Record<string, boolean>>({})
  const [searchParams, setSearchParams] = useSearchParams()

  // Auto-open task from URL param (?task=xxx)
  useEffect(() => {
    if (!data || viewTask) return
    const taskId = searchParams.get('task')
    if (!taskId) return
    const columns = data.columns
    for (const col of Object.values(columns) as Task[][]) {
      const found = col.find(t => t.id === taskId)
      if (found) {
        setViewTask(found)
        setSearchParams({}, { replace: true })
        break
      }
    }
  }, [data, searchParams])

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
      await fetch('/api/tasks/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: addForm.title.trim(),
          description: addForm.description.trim(),
          priority: addForm.priority,
          tags: addForm.tags.split(',').map(t => t.trim()).filter(Boolean),
        })
      })
      setShowAddModal(false)
      setAddForm({ title: '', description: '', priority: 'medium', tags: '' })
      refetch()
    } catch {}
  }

  const handleExecute = async (taskId: string) => {
    setExecuting(prev => ({ ...prev, [taskId]: true }))
    try {
      await fetch(`/api/tasks/${taskId}/execute`, { method: 'POST' })
      refetch()
    } catch {}
  }

  const discussWithZinbot = (task: Task) => {
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={16} style={{ color: '#FF453A' }} />
                <p style={{ fontSize: 13, color: '#FF453A' }}>{viewTask.error}</p>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, flexDirection: m ? 'column' : 'row' }}>
            {/* Discuss with Zinbot — the primary action */}
            {viewTask.result && (
              <button
                onClick={() => discussWithZinbot(viewTask)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: '#007AFF', color: '#fff', fontSize: 13, fontWeight: 600,
                }}
              >
                <MessageSquare size={15} /> Discuss with Zinbot
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
            <p className="text-body" style={{ marginTop: 4 }}>Task execution & project tracking</p>
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
          {(['queue', 'inProgress', 'done'] as const).map((col) => {
            const tasks: Task[] = columns[col] || []
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

                {/* Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {tasks.length === 0 && (
                    <div style={{ padding: '24px 16px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 12, color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
                      {col === 'queue' ? 'Add tasks or deploy from Scout' : col === 'inProgress' ? 'Execute a task to start' : 'Completed tasks show here'}
                    </div>
                  )}
                  {tasks.map((task, i) => (
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
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: priorityConfig[task.priority]?.color || '#8E8E93', flexShrink: 0 }} />
                        <h4 style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {task.title}
                        </h4>
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

                      {/* Result preview for done tasks */}
                      {col === 'done' && task.result && (
                        <div style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(50,215,75,0.08)', border: '1px solid rgba(50,215,75,0.15)', marginBottom: 10 }}>
                          <p style={{ fontSize: 11, color: 'rgba(50,215,75,0.8)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            ✅ {task.result}
                          </p>
                        </div>
                      )}

                      {/* Footer: tags + actions */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1, overflow: 'hidden' }}>
                          {task.tags?.map(tag => (
                            <span key={tag} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 5, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>{tag}</span>
                          ))}
                          {task.source && (
                            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 5, background: task.source === 'scout' ? 'rgba(191,90,242,0.12)' : 'rgba(255,255,255,0.06)', color: task.source === 'scout' ? '#BF5AF2' : 'rgba(255,255,255,0.4)' }}>
                              {task.source}
                            </span>
                          )}
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
                              onClick={(e) => { e.stopPropagation(); discussWithZinbot(task); }}
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
