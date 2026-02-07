import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, X, Send, Bot, User, Loader2, Minimize2 } from 'lucide-react'
import { useIsMobile } from '../lib/useIsMobile'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  streaming?: boolean
}

const uuid = () => 'xxxx-xxxx-xxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16))

export default function ChatWidget() {
  const m = useIsMobile()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [unread, setUnread] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])
  useEffect(() => { if (open) { setUnread(0); inputRef.current?.focus() } }, [open])

  // Listen for external "open-chat" events (from Workshop "Discuss" button)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.message) {
        setInput(detail.message)
        setOpen(true)
        // Auto-send if requested
        if (detail.autoSend) {
          setTimeout(() => {
            const btn = document.querySelector('[data-chat-send]') as HTMLButtonElement
            btn?.click()
          }, 100)
        }
      } else {
        setOpen(true)
      }
    }
    window.addEventListener('open-chat', handler)
    return () => window.removeEventListener('open-chat', handler)
  }, [])

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
                  if (!open) setUnread(prev => prev + 1)
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

  const renderContent = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 4px;border-radius:3px;font-size:11px;">$1</code>')
      .replace(/\n/g, '<br/>')
  }

  return (
    <>
      {/* Floating chat button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setOpen(true)}
            style={{
              position: 'fixed',
              bottom: m ? 20 : 28,
              right: m ? 16 : 28,
              zIndex: 300,
              width: m ? 52 : 56,
              height: m ? 52 : 56,
              borderRadius: '50%',
              border: 'none',
              background: 'linear-gradient(135deg, #007AFF 0%, #0055DD 100%)',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(0,122,255,0.4), 0 2px 8px rgba(0,0,0,0.3)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <MessageCircle size={m ? 22 : 24} />
            {/* Unread badge */}
            {unread > 0 && (
              <div style={{
                position: 'absolute', top: -4, right: -4,
                width: 20, height: 20, borderRadius: '50%',
                background: '#FF453A', color: '#fff',
                fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid #0d1117',
              }}>
                {unread > 9 ? '9+' : unread}
              </div>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={m ? { y: '100%' } : { opacity: 0, y: 20, scale: 0.95 }}
            animate={m ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
            exit={m ? { y: '100%' } : { opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            style={{
              position: 'fixed',
              zIndex: 301,
              ...(m ? {
                inset: 0,
                borderRadius: 0,
              } : {
                bottom: 28,
                right: 28,
                width: 400,
                height: 520,
                borderRadius: 16,
              }),
              background: 'rgba(20, 22, 30, 0.97)',
              backdropFilter: 'blur(40px)',
              WebkitBackdropFilter: 'blur(40px)',
              border: m ? 'none' : '1px solid rgba(255,255,255,0.1)',
              boxShadow: m ? 'none' : '0 16px 60px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              padding: m ? '14px 16px' : '14px 18px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              paddingTop: m ? '50px' : '14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,122,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bot size={16} style={{ color: '#007AFF' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>Zinbot</h3>
                  <p style={{ fontSize: 10, color: '#32D74B' }}>Online</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8, width: 32, height: 32,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'rgba(255,255,255,0.6)',
                }}
              >
                {m ? <X size={16} /> : <Minimize2 size={14} />}
              </button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', overflowX: 'hidden' }}>
              {messages.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, opacity: 0.4 }}>
                  <Bot size={32} />
                  <p style={{ fontSize: 13, fontWeight: 500, textAlign: 'center' }}>Ask me anything!</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {messages.map((msg) => (
                    <div key={msg.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: msg.role === 'assistant' ? 'rgba(0,122,255,0.15)' : 'rgba(255,255,255,0.08)' }}>
                        {msg.role === 'assistant' ? <Bot size={13} style={{ color: '#007AFF' }} /> : <User size={13} style={{ color: 'rgba(255,255,255,0.5)' }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>{msg.role === 'assistant' ? 'Zinbot' : 'You'}</span>
                          {msg.streaming && <Loader2 size={9} style={{ color: '#007AFF', animation: 'spin 1s linear infinite' }} />}
                        </div>
                        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'rgba(255,255,255,0.78)', wordBreak: 'break-word' }} dangerouslySetInnerHTML={{ __html: renderContent(msg.content || '...') }} />
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input */}
            <div style={{ padding: '10px 14px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Message..."
                  disabled={isStreaming}
                  rows={1}
                  style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '9px 12px', color: 'rgba(255,255,255,0.9)', fontSize: 13, resize: 'none', outline: 'none', fontFamily: 'inherit', maxHeight: 80, lineHeight: 1.4 }}
                  onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 80) + 'px' }}
                />
                <button type="submit" data-chat-send disabled={!input.trim() || isStreaming} style={{ width: 34, height: 34, borderRadius: 9, border: 'none', background: input.trim() && !isStreaming ? '#007AFF' : 'rgba(255,255,255,0.06)', color: input.trim() && !isStreaming ? '#fff' : 'rgba(255,255,255,0.2)', cursor: input.trim() && !isStreaming ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {isStreaming ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
