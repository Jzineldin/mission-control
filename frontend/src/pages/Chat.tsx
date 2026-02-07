import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageCircle, Send, Bot, User, Loader2, Trash2, Sparkles,
  ArrowLeft, Hash, MessageSquare, Zap, Clock
} from 'lucide-react'
import PageTransition from '../components/PageTransition'
import GlassCard from '../components/GlassCard'
import StatusBadge from '../components/StatusBadge'
import { useApi, timeAgo } from '../lib/hooks'
import { useIsMobile } from '../lib/useIsMobile'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  streaming?: boolean
}

const uuid = () => 'xxxx-xxxx-xxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16))

// Pretty name from session key
function sessionName(s: any): string {
  const dn = s.displayName || s.key || ''
  if (dn.includes('#')) {
    const channel = dn.split('#').pop()?.split(':')[0] || dn
    return `#${channel}`
  }
  if (s.label) return s.label
  if (dn.includes('mission-control')) return 'Mission Control Chat'
  if (dn.includes('main-main')) return 'Main Agent'
  if (s.key?.includes('subagent')) {
    const id = s.key.split(':').pop()?.substring(0, 8)
    return `Sub-agent ${id}`
  }
  return dn.substring(0, 30)
}

function sessionIcon(s: any) {
  const dn = s.displayName || s.key || ''
  if (dn.includes('#')) return Hash
  if (dn.includes('mission-control')) return MessageSquare
  if (s.key?.includes('subagent')) return Zap
  return MessageCircle
}

function sessionCategory(s: any): string {
  if (s.key?.includes('subagent')) return 'Sub-Agent'
  if (s.key?.includes('discord')) return 'Discord'
  if (s.key?.includes('mission-control') || s.displayName?.includes('mission-control')) return 'Dashboard'
  return 'Session'
}

// Clean model name
function modelShort(model: string): string {
  return model
    ?.replace('claude-', '')
    .replace(/-\d{8}.*/, '')
    .replace('opus-4-6', 'Opus 4.6')
    .replace('sonnet-4', 'Sonnet 4')
    .replace('haiku-4-5', 'Haiku 4.5')
    .replace(/-v\d.*/, '') || 'Unknown'
}

export default function Chat() {
  const m = useIsMobile()
  const { data: sessionsData } = useApi<any>('/api/sessions', 15000)
  const [activeSession, setActiveSession] = useState<string | null>(null)
  const [activeSessionName, setActiveSessionName] = useState('')
  const [historyMessages, setHistoryMessages] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [filter, setFilter] = useState<'all' | 'discord' | 'subagent' | 'dashboard'>('all')

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom, historyMessages])

  const sessions = (sessionsData?.sessions || sessionsData || [])
    .filter((s: any) => {
      if (filter === 'all') return true
      const cat = sessionCategory(s).toLowerCase()
      if (filter === 'discord') return cat === 'discord'
      if (filter === 'subagent') return cat === 'sub-agent'
      if (filter === 'dashboard') return cat === 'dashboard'
      return true
    })
    .sort((a: any, b: any) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || isStreaming) return

    const userMsg: Message = { id: uuid(), role: 'user', content: text, timestamp: new Date() }
    const assistantId = uuid()
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', timestamp: new Date(), streaming: true }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setIsStreaming(true)

    const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))

    try {
      abortRef.current = new AbortController()
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, stream: true }),
        signal: abortRef.current.signal
      })

      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`)

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          for (const line of chunk.split('\n')) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') continue
              try {
                const delta = JSON.parse(data).choices?.[0]?.delta?.content
                if (delta) {
                  accumulated += delta
                  setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: accumulated } : m))
                }
              } catch {}
            }
          }
        }
      }
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, streaming: false } : m))
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `⚠️ ${err.message}`, streaming: false } : m))
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }

  const clearChat = () => {
    abortRef.current?.abort()
    setMessages([])
    setIsStreaming(false)
  }

  const [sessionInput, setSessionInput] = useState('')
  const [sessionSending, setSessionSending] = useState(false)

  const sendToSession = async () => {
    const text = sessionInput.trim()
    if (!text || sessionSending || !activeSession || activeSession === 'main-chat') return
    
    setSessionSending(true)
    // Optimistically add to UI
    setHistoryMessages(prev => [...prev, { role: 'user', content: text, ts: Date.now() }])
    setSessionInput('')
    
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(activeSession)}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      })
      const data = await res.json()
      if (data.result) {
        setHistoryMessages(prev => [...prev, { role: 'assistant', content: data.result, ts: Date.now() }])
      }
    } catch (err: any) {
      setHistoryMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${err.message}`, ts: Date.now() }])
    } finally {
      setSessionSending(false)
    }
  }

  const openMainChat = () => {
    setActiveSession('main-chat')
    setActiveSessionName('Zinbot')
    setMessages([])
    setHistoryMessages([])
  }

  const openSession = async (s: any) => {
    const name = sessionName(s)
    setActiveSession(s.key)
    setActiveSessionName(name)
    setHistoryLoading(true)
    setHistoryMessages([])
    setMessages([])
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(s.key)}/history`)
      const data = await res.json()
      setHistoryMessages(data.messages || [])
    } catch {
      setHistoryMessages([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const renderContent = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-size:12px;">$1</code>')
      .replace(/\n/g, '<br/>')
  }

  // Session history view (read-only)
  if (activeSession && activeSession !== 'main-chat') {
    return (
      <PageTransition>
        <div style={{ maxWidth: m ? '100%' : 900, margin: '0 auto', display: 'flex', flexDirection: 'column', height: m ? 'calc(100vh - 100px)' : 'calc(100vh - 96px)' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: m ? 12 : 16 }}>
            <button
              onClick={() => setActiveSession(null)}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 8, cursor: 'pointer', display: 'flex', color: 'rgba(255,255,255,0.7)' }}
            >
              <ArrowLeft size={18} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeSessionName}</h2>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>Session history · send a message to continue</p>
            </div>
          </div>

          {/* Messages */}
          <div className="macos-panel" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 0 }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: m ? '14px' : '20px 24px' }}>
              {historyLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <div style={{ width: 24, height: 24, border: '2px solid #007AFF', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                </div>
              ) : historyMessages.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, opacity: 0.4 }}>
                  <Clock size={32} />
                  <p style={{ fontSize: 13 }}>No messages found for this session</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {historyMessages.map((msg: any, i: number) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: msg.role === 'assistant' ? 'rgba(0,122,255,0.15)' : msg.role === 'system' ? 'rgba(255,149,0,0.15)' : 'rgba(255,255,255,0.08)' }}>
                        {msg.role === 'assistant' ? <Bot size={15} style={{ color: '#007AFF' }} />
                          : msg.role === 'system' ? <Zap size={15} style={{ color: '#FF9500' }} />
                          : <User size={15} style={{ color: 'rgba(255,255,255,0.6)' }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: msg.role === 'assistant' ? '#007AFF' : msg.role === 'system' ? '#FF9500' : 'rgba(255,255,255,0.65)', textTransform: 'capitalize', marginBottom: 4, display: 'block' }}>{msg.role}</span>
                        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,0.78)', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                          {typeof msg.content === 'string' ? msg.content.substring(0, 2000) : JSON.stringify(msg.content).substring(0, 2000)}
                          {(msg.content?.length || 0) > 2000 && <span style={{ color: 'rgba(255,255,255,0.3)' }}>... (truncated)</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Send message to continue conversation */}
            <div style={{ padding: m ? '10px 14px 14px' : '12px 20px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', zIndex: 10 }}>
              <form onSubmit={(e) => { e.preventDefault(); sendToSession(); }} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  value={sessionInput}
                  onChange={(e) => setSessionInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendToSession(); } }}
                  placeholder="Continue this conversation..."
                  disabled={sessionSending}
                  rows={1}
                  style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 12px', color: 'rgba(255,255,255,0.9)', fontSize: 13, resize: 'none', outline: 'none', fontFamily: 'inherit', maxHeight: 80, lineHeight: 1.4 }}
                  onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 80) + 'px' }}
                />
                <button type="submit" disabled={!sessionInput.trim() || sessionSending} style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: sessionInput.trim() && !sessionSending ? '#007AFF' : 'rgba(255,255,255,0.06)', color: sessionInput.trim() && !sessionSending ? '#fff' : 'rgba(255,255,255,0.25)', cursor: sessionInput.trim() && !sessionSending ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {sessionSending ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
                </button>
              </form>
            </div>
          </div>
        </div>
      </PageTransition>
    )
  }

  // Active chat view (main chat)
  if (activeSession === 'main-chat') {
    return (
      <PageTransition>
        <div style={{ maxWidth: m ? '100%' : 900, margin: '0 auto', display: 'flex', flexDirection: 'column', height: m ? 'calc(100vh - 100px)' : 'calc(100vh - 96px)' }}>
          {/* Chat header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: m ? 12 : 16 }}>
            <button
              onClick={() => setActiveSession(null)}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 8, cursor: 'pointer', display: 'flex', color: 'rgba(255,255,255,0.7)' }}
            >
              <ArrowLeft size={18} />
            </button>
            <Sparkles size={18} style={{ color: '#007AFF' }} />
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>Chat with Zinbot</h2>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>Full memory & tools</p>
            </div>
            {messages.length > 0 && (
              <button onClick={clearChat} className="macos-button" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', fontSize: 11 }}>
                <Trash2 size={12} /> Clear
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="macos-panel" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 0 }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: m ? '14px' : '20px 24px 12px' }}>
              {messages.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, opacity: 0.4 }}>
                  <Bot size={40} />
                  <p style={{ fontSize: 14, fontWeight: 500 }}>Hey! Ask me anything 🤖</p>
                  <p style={{ fontSize: 12 }}>Same brain as Discord — full memory, all tools.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <AnimatePresence>
                    {messages.map((msg) => (
                      <motion.div key={msg.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: msg.role === 'assistant' ? 'rgba(0,122,255,0.15)' : 'rgba(255,255,255,0.08)' }}>
                          {msg.role === 'assistant' ? <Bot size={15} style={{ color: '#007AFF' }} /> : <User size={15} style={{ color: 'rgba(255,255,255,0.6)' }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{msg.role === 'assistant' ? 'Zinbot' : 'You'}</span>
                            {msg.streaming && <Loader2 size={10} style={{ color: '#007AFF', animation: 'spin 1s linear infinite' }} />}
                          </div>
                          <div style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,0.82)', wordBreak: 'break-word' }} dangerouslySetInnerHTML={{ __html: renderContent(msg.content || '...') }} />
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
            {/* Input */}
            <div style={{ padding: m ? '10px 14px 14px' : '12px 24px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', zIndex: 10 }}>
              <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Message Zinbot..."
                  disabled={isStreaming}
                  rows={1}
                  autoFocus
                  style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 12px', color: 'rgba(255,255,255,0.9)', fontSize: 13, resize: 'none', outline: 'none', fontFamily: 'inherit', maxHeight: 100, lineHeight: 1.5 }}
                  onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 100) + 'px' }}
                />
                <button type="submit" disabled={!input.trim() || isStreaming} style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: input.trim() && !isStreaming ? '#007AFF' : 'rgba(255,255,255,0.06)', color: input.trim() && !isStreaming ? '#fff' : 'rgba(255,255,255,0.25)', cursor: input.trim() && !isStreaming ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {isStreaming ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
                </button>
              </form>
            </div>
          </div>
        </div>
      </PageTransition>
    )
  }

  // Sessions list view (default)
  const filters = [
    { id: 'all', label: 'All', count: (sessionsData?.sessions || sessionsData || []).length },
    { id: 'discord', label: 'Discord', count: (sessionsData?.sessions || sessionsData || []).filter((s: any) => sessionCategory(s) === 'Discord').length },
    { id: 'subagent', label: 'Sub-Agents', count: (sessionsData?.sessions || sessionsData || []).filter((s: any) => sessionCategory(s) === 'Sub-Agent').length },
    { id: 'dashboard', label: 'Dashboard', count: (sessionsData?.sessions || sessionsData || []).filter((s: any) => sessionCategory(s) === 'Dashboard').length },
  ]

  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: m ? 14 : 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <MessageCircle size={m ? 18 : 22} style={{ color: '#007AFF' }} /> Conversations
            </h1>
            <p className="text-body" style={{ marginTop: 4 }}>All agent sessions & chat history</p>
          </div>
          <button
            onClick={openMainChat}
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
            <Sparkles size={15} /> New Chat
          </button>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 4 }}>
          {filters.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as any)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: m ? '7px 12px' : '8px 14px',
                borderRadius: 8, flexShrink: 0,
                border: filter === f.id ? '1px solid rgba(0,122,255,0.4)' : '1px solid rgba(255,255,255,0.08)',
                background: filter === f.id ? 'rgba(0,122,255,0.12)' : 'rgba(255,255,255,0.04)',
                color: filter === f.id ? '#fff' : 'rgba(255,255,255,0.5)',
                fontSize: 12, fontWeight: 500, cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {f.label}
              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 5, background: filter === f.id ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)', color: filter === f.id ? '#fff' : 'rgba(255,255,255,0.35)' }}>
                {f.count}
              </span>
            </button>
          ))}
        </div>

        {/* Session list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: m ? 8 : 10 }}>
          {sessions.map((s: any, i: number) => {
            const Icon = sessionIcon(s)
            const cat = sessionCategory(s)
            const name = sessionName(s)
            return (
              <motion.div
                key={s.key}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.03 * i }}
                className="macos-panel"
                style={{ padding: m ? 14 : '16px 20px', cursor: 'pointer' }}
                onClick={() => openSession(s)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: m ? 36 : 40, height: m ? 36 : 40, borderRadius: 10, background: cat === 'Sub-Agent' ? 'rgba(255,149,0,0.12)' : cat === 'Discord' ? 'rgba(114,137,218,0.15)' : 'rgba(0,122,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={m ? 16 : 18} style={{ color: cat === 'Sub-Agent' ? '#FF9500' : cat === 'Discord' ? '#7289DA' : '#007AFF' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {name}
                      </h3>
                      <StatusBadge status="active" />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                      <span style={{ fontSize: 11, color: '#BF5AF2', fontWeight: 600 }}>{modelShort(s.model)}</span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>·</span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontVariantNumeric: 'tabular-nums' }}>{((s.totalTokens || 0) / 1000).toFixed(0)}k tokens</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                      <Clock size={10} style={{ color: 'rgba(255,255,255,0.3)' }} />
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{s.updatedAt ? timeAgo(s.updatedAt) : '—'}</span>
                    </div>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2, display: 'block' }}>{cat}</span>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </PageTransition>
  )
}
