import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Bot, User, Loader2, Trash2, Sparkles } from 'lucide-react'
import PageTransition from '../components/PageTransition'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  streaming?: boolean
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || isStreaming) return

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date()
    }

    const assistantId = crypto.randomUUID()
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      streaming: true
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setIsStreaming(true)

    // Build conversation history for context
    const history = [...messages, userMsg].map(m => ({
      role: m.role,
      content: m.content
    }))

    try {
      abortRef.current = new AbortController()
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          stream: true
        }),
        signal: abortRef.current.signal
      })

      if (!res.ok) {
        const err = await res.text()
        throw new Error(err || `HTTP ${res.status}`)
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                const delta = parsed.choices?.[0]?.delta?.content
                if (delta) {
                  accumulated += delta
                  setMessages(prev =>
                    prev.map(m => m.id === assistantId ? { ...m, content: accumulated } : m)
                  )
                }
              } catch {}
            }
          }
        }
      }

      setMessages(prev =>
        prev.map(m => m.id === assistantId ? { ...m, streaming: false } : m)
      )
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: `⚠️ Error: ${err.message}`, streaming: false }
              : m
          )
        )
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    if (isStreaming) {
      abortRef.current?.abort()
    }
    setMessages([])
    setIsStreaming(false)
  }

  const formatTime = (d: Date) => {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Simple markdown-ish rendering (bold, code, links)
  const renderContent = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-size:12px;">$1</code>')
      .replace(/\n/g, '<br/>')
  }

  return (
    <PageTransition>
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 96px)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Sparkles size={22} style={{ color: '#007AFF' }} /> Chat with Zinbot
            </h1>
            <p className="text-body" style={{ marginTop: 4 }}>Talk directly to your AI agent — same brain, same memory</p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="macos-button"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12 }}
            >
              <Trash2 size={14} /> Clear
            </button>
          )}
        </div>

        {/* Messages Area */}
        <div
          className="macos-panel"
          style={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            padding: 0,
          }}
        >
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 12px' }}>
            {messages.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, opacity: 0.4 }}>
                <Bot size={48} />
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 16, fontWeight: 500 }}>Hey! I'm Zinbot 🤖</p>
                  <p style={{ fontSize: 13, marginTop: 6 }}>Same me as on Discord — full memory, all tools.</p>
                  <p style={{ fontSize: 13 }}>Ask me anything or give me a task.</p>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <AnimatePresence>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}
                    >
                      {/* Avatar */}
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: msg.role === 'assistant' ? 'rgba(0,122,255,0.15)' : 'rgba(255,255,255,0.08)',
                      }}>
                        {msg.role === 'assistant'
                          ? <Bot size={18} style={{ color: '#007AFF' }} />
                          : <User size={18} style={{ color: 'rgba(255,255,255,0.6)' }} />}
                      </div>

                      {/* Bubble */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
                            {msg.role === 'assistant' ? 'Zinbot' : 'You'}
                          </span>
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                            {formatTime(msg.timestamp)}
                          </span>
                          {msg.streaming && (
                            <Loader2 size={12} style={{ color: '#007AFF', animation: 'spin 1s linear infinite' }} />
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: 13.5,
                            lineHeight: 1.6,
                            color: 'rgba(255,255,255,0.82)',
                            wordBreak: 'break-word',
                          }}
                          dangerouslySetInnerHTML={{ __html: renderContent(msg.content || '...') }}
                        />
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input Area */}
          <div style={{
            padding: '16px 24px 20px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-end',
            }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Zinbot..."
                disabled={isStreaming}
                rows={1}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  padding: '12px 16px',
                  color: 'rgba(255,255,255,0.9)',
                  fontSize: 13.5,
                  resize: 'none',
                  outline: 'none',
                  fontFamily: 'inherit',
                  maxHeight: 120,
                  lineHeight: 1.5,
                }}
                onInput={(e) => {
                  const t = e.currentTarget
                  t.style.height = 'auto'
                  t.style.height = Math.min(t.scrollHeight, 120) + 'px'
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isStreaming}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  border: 'none',
                  background: input.trim() && !isStreaming ? '#007AFF' : 'rgba(255,255,255,0.06)',
                  color: input.trim() && !isStreaming ? '#fff' : 'rgba(255,255,255,0.25)',
                  cursor: input.trim() && !isStreaming ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  flexShrink: 0,
                }}
              >
                {isStreaming ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={18} />}
              </button>
            </div>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 8, textAlign: 'center' }}>
              Connected to OpenClaw Gateway · Claude Opus 4.6 · Full tool access
            </p>
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
