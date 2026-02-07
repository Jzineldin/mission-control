import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Clock, Zap, CheckCircle, Play, X, AlertCircle, Loader2, MessageSquare, ArrowLeft, Send } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import GlassCard from '../components/GlassCard'
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

interface ChatMessage {
  role: string
  content: string
  ts?: number
}

export default function Workshop() {
  const m = useIsMobile()
  const { data, loading, refetch } = useApi<any>('/api/tasks', 5000)
  const [showAddModal, setShowAddModal] = useState(false)
  const [chatTask, setChatTask] = useState<Task | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [addForm, setAddForm] = useState({ title: '', description: '', priority: 'medium', tags: '' })
  const [executing, setExecuting] = useState<Record<string, boolean>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  useEffect(() => { scrollToBottom() }, [chatMessages])

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

  const openTaskChat = async (task: Task) => {
    setChatTask(task)
    setChatMessages([])
    setChatLoading(true)
    
    // Load existing chat history if we have a session key
    if (task.childSessionKey) {
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(task.childSessionKey)}/history`)
        const msgs = await res.json()
        if (Array.isArray(msgs)) {
          setChatMessages(msgs.map((m: any) => ({ role: m.role, content: m.content, ts: m.ts })))
        }
      } catch {}
    }
    
    // If task has a result but no session, show result as message
    if (task.result && !task.childSessionKey) {
      setChatMessages([
        { role: 'user', content: `Task: ${task.title}\n${task.description}`, ts: Date.parse(task.created || '') || Date.now() },
        { role: 'assistant', content: task.result, ts: Date.parse(task.completed || '') || Date.now() },
      ])
    }
    
    setChatLoading(false)
  }

  const sendTaskMessage = async () => {
    const text = chatInput.trim()
    if (!text || chatSending || !chatTask) return
    
    setChatSending(true)
    setChatMessages(prev => [...prev, { role: 'user', content: text, ts: Date.now() }])
    setChatInput('')
    
    if (chatTask.childSessionKey) {
      // Send to existing sub-agent session
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(chatTask.childSessionKey)}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text })
        })
        const data = await res.json()
        if (data.result) {
          setChatMessages(prev => [...prev, { role: 'assistant', content: data.result, ts: Date.now() }])
        }
      } catch (err: any) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${err.message}`, ts: Date.now() }])
      }
    } else {
      // No session yet — execute the task with this message as context
      try {
        const res = await fetch(`/api/tasks/${chatTask.id}/execute`, { method: 'POST' })
        const data = await res.json()
        setChatMessages(prev => [...prev, { role: 'assistant', content: '⏳ Task execution started. Results will appear when the sub-agent finishes...', ts: Date.now() }])
        // Update chatTask with session key
        if (data.childKey) {
          setChatTask(prev => prev ? { ...prev, childSessionKey: data.childKey } : null)
        }
        refetch()
      } catch (err: any) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${err.message}`, ts: Date.now() }])
      }
    }
    
    setChatSending(false)
  }

  // === TASK CHAT VIEW ===
  if (chatTask) {
    const isExecuting = chatTask.status === 'executing'
    return (
      <PageTransition>
        <div style={{ maxWidth: m ? '100%' : 900, margin: '0 auto', display: 'flex', flexDirection: 'column', height: m ? 'calc(100vh - 100px)' : 'calc(100vh - 96px)' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: m ? 12 : 16 }}>
            <button
              onClick={() => setChatTask(null)}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 8, cursor: 'pointer', display: 'flex', color: 'rgba(255,255,255,0.7)' }}
            >
              <ArrowLeft size={18} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {chatTask.title}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: priorityConfig[chatTask.priority]?.color || '#8E8E93' }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                  {chatTask.status === 'executing' ? 'Sub-agent working...' : chatTask.status === 'done' ? 'Completed' : 'Queue'}
                </span>
                {chatTask.childSessionKey && (
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(0,122,255,0.1)', color: '#007AFF' }}>live session</span>
                )}
              </div>
            </div>
          </div>

          {/* Chat panel */}
          <div className="macos-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: m ? 14 : 20 }}>
              {/* Task description as system message */}
              {chatTask.description && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 }}>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>Task Description</p>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{chatTask.description}</p>
                </div>
              )}

              {chatLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                  <Loader2 size={20} style={{ color: '#007AFF', animation: 'spin 1s linear infinite' }} />
                </div>
              ) : chatMessages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,0.3)' }}>
                  <MessageSquare size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
                  <p style={{ fontSize: 13 }}>
                    {chatTask.childSessionKey ? 'Loading conversation...' : 'No messages yet. Send a message or click Execute to start.'}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {chatMessages.map((msg, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '85%',
                        padding: '10px 14px',
                        borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: msg.role === 'user' ? '#007AFF' : 'rgba(255,255,255,0.06)',
                        border: msg.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.08)',
                      }}>
                        <p style={{ fontSize: 13, color: msg.role === 'user' ? '#fff' : 'rgba(255,255,255,0.85)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {msg.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Executing indicator */}
              {isExecuting && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', marginTop: 8 }}>
                  <Loader2 size={14} style={{ color: '#007AFF', animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: 12, color: '#007AFF' }}>Sub-agent is working on this task...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{ padding: m ? '10px 14px 14px' : '12px 20px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <form onSubmit={(e) => { e.preventDefault(); sendTaskMessage(); }} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTaskMessage(); } }}
                  placeholder={chatTask.childSessionKey ? "Talk to the sub-agent about this task..." : "Describe what you want done, then send to execute..."}
                  disabled={chatSending}
                  rows={1}
                  autoFocus
                  style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 12px', color: 'rgba(255,255,255,0.9)', fontSize: 13, resize: 'none', outline: 'none', fontFamily: 'inherit', maxHeight: 80, lineHeight: 1.4 }}
                  onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 80) + 'px' }}
                />
                <button type="submit" disabled={!chatInput.trim() || chatSending} style={{
                  width: 36, height: 36, borderRadius: 10, border: 'none', flexShrink: 0,
                  background: chatInput.trim() && !chatSending ? '#007AFF' : 'rgba(255,255,255,0.06)',
                  color: chatInput.trim() && !chatSending ? '#fff' : 'rgba(255,255,255,0.25)',
                  cursor: chatInput.trim() && !chatSending ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {chatSending ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
                </button>
              </form>
            </div>
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
                      onClick={() => openTaskChat(task)}
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
                          {task.startedAt && <span style={{ fontSize: 10, color: 'rgba(0,122,255,0.6)', marginLeft: 'auto' }}>{timeAgo(task.startedAt)}</span>}
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

                      {/* Error for failed tasks */}
                      {task.error && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.2)' }}>
                          <AlertCircle size={12} style={{ color: '#FF453A' }} />
                          <span style={{ fontSize: 11, color: '#FF453A' }}>{task.error}</span>
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

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                          {/* Chat button for tasks with sessions */}
                          {(task.childSessionKey || col === 'done') && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openTaskChat(task); }}
                              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', fontSize: 11, cursor: 'pointer' }}
                            >
                              <MessageSquare size={11} /> Chat
                            </button>
                          )}

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

                          {/* Time */}
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
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
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
