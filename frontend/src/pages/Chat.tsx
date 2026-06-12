import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Bot,
  Clock,
  Hash,
  Loader2,
  MessageCircle,
  Search,
  Send,
  Sparkles,
  Trash2,
  User,
  Zap,
} from 'lucide-react'
import GlassCard from '../components/GlassCard'
import PageTransition from '../components/PageTransition'
import StatusBadge from '../components/StatusBadge'
import { useChat } from '../hooks/useChat'
import { apiQueryOptions, fetchJson, timeAgo } from '../lib/hooks'
import { useIsMobile } from '../lib/useIsMobile'
import { markdownToHtml, sanitizeHtml } from '../utils/sanitize'
import styles from './Chat.module.css'

interface SessionInfo {
  key?: string
  displayName?: string
  label?: string
  type?: string
  model?: string
  isActive?: boolean
  updatedAt?: string | number
  totalTokens?: number
}

interface HistoryMessage {
  role?: string
  content?: string
  ts?: number
}

function sessionName(session: SessionInfo): string {
  const key = session.key || ''
  const displayName = session.displayName || key

  if (displayName.includes('#')) {
    const channel = displayName.split('#').pop()?.split(':')[0] || displayName
    return `#${channel}`
  }

  if (key === 'agent:main:main' || displayName.includes('main-main')) return 'Main Session'
  if (key.includes(':subagent:')) return session.label || 'Sub-Agent'
  if (session.label) return session.label
  if (displayName.includes('mission-control')) return 'Mission Control Chat'

  return key.split(':').pop()?.substring(0, 12) || displayName.substring(0, 30)
}

function sessionIcon(session: SessionInfo) {
  switch (session.type || 'other') {
    case 'discord':
      return '💬'
    case 'sub-agent':
      return '🤖'
    case 'web':
      return '🌐'
    case 'main':
      return '👤'
    default:
      return '❓'
  }
}

function sessionTypeLabel(session: SessionInfo): string {
  switch (session.type || 'other') {
    case 'discord':
      return 'Discord Channel'
    case 'sub-agent':
      return 'Sub-Agent'
    case 'web':
      return 'Web Interface'
    case 'main':
      return 'Main Session'
    default:
      return 'Other Session'
  }
}

function modelShort(model?: string): string {
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
  const queryClient = useQueryClient()
  const [activeSession, setActiveSession] = useState<string | null>(null)
  const [activeSessionName, setActiveSessionName] = useState('')
  const [filter, setFilter] = useState<'active' | 'all'>('active')
  const [searchQuery, setSearchQuery] = useState('')
  const [sessionInput, setSessionInput] = useState('')
  const historyEndRef = useRef<HTMLDivElement>(null)

  const { data: sessionsData } = useQuery(apiQueryOptions<{ sessions?: SessionInfo[] }>('/api/sessions', 15000))
  const {
    abortStream,
    clearChat,
    input,
    inputRef,
    isStreaming,
    messages,
    messagesEndRef,
    sendMessage,
    setInput,
  } = useChat()

  useEffect(() => abortStream, [abortStream])

  const historyKey = useMemo(
    () => ['session-history', activeSession] as const,
    [activeSession],
  )

  const historyQuery = useQuery({
    queryKey: historyKey,
    queryFn: () =>
      fetchJson<{ messages: HistoryMessage[] }>(
        `/api/sessions/${encodeURIComponent(activeSession || '')}/history`,
      ),
    enabled: Boolean(activeSession && activeSession !== 'main-chat'),
    refetchOnWindowFocus: false,
  })

  const historyMessages = useMemo(
    () => historyQuery.data?.messages || [],
    [historyQuery.data],
  )

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [historyMessages])

  const closeSessionMutation = useMutation({
    mutationFn: async (sessionKey: string) => {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionKey)}/close`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return sessionKey
    },
    onSuccess: async (sessionKey) => {
      await queryClient.invalidateQueries({ queryKey: ['api', '/api/sessions'] })
      if (activeSession === sessionKey) {
        setActiveSession(null)
        setActiveSessionName('')
      }
    },
  })

  const openMainChat = () => {
    setActiveSession('main-chat')
    setActiveSessionName('Müdür')
    clearChat()
  }

  const openSession = (session: SessionInfo) => {
    setActiveSession(session.key ?? null)
    setActiveSessionName(sessionName(session))
  }

  const sendToSession = useCallback(async () => {
    const text = sessionInput.trim()
    if (!text || !activeSession || activeSession === 'main-chat') return

    const optimisticEntry = { role: 'user', content: text, ts: Date.now() }
    queryClient.setQueryData<{ messages: HistoryMessage[] }>(historyKey, (previous) => ({
      messages: [...(previous?.messages || []), optimisticEntry],
    }))
    setSessionInput('')

    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(activeSession)}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const data = await response.json()
      if (data.result) {
        queryClient.setQueryData<{ messages: HistoryMessage[] }>(historyKey, (previous) => ({
          messages: [
            ...(previous?.messages || []),
            { role: 'assistant', content: data.result, ts: Date.now() },
          ],
        }))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      queryClient.setQueryData<{ messages: HistoryMessage[] }>(historyKey, (previous) => ({
        messages: [
          ...(previous?.messages || []),
          { role: 'assistant', content: `⚠️ ${message}`, ts: Date.now() },
        ],
      }))
    }
  }, [activeSession, historyKey, queryClient, sessionInput])

  const allSessions = sessionsData?.sessions || []
  const sessions = allSessions
    .filter((session) => (filter === 'active' ? session.isActive : true))
    .filter((session) => {
      if (!searchQuery) return true
      const searchTerm = searchQuery.toLowerCase()
      return (
        sessionName(session).toLowerCase().includes(searchTerm) ||
        String(session.key || '').toLowerCase().includes(searchTerm)
      )
    })
    .sort(
      (a, b) =>
        new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime(),
    )

  const filters = [
    { id: 'active', label: 'Active', count: allSessions.filter((s) => s.isActive).length },
    { id: 'all', label: 'All', count: allSessions.length },
  ]

  if (activeSession && activeSession !== 'main-chat') {
    return (
      <PageTransition>
        <div className={`${styles.surface} ${m ? styles.surfaceMobile : ''}`}>
          <div className={`${styles.topBar} ${m ? styles.topBarMobile : ''}`}>
            <button onClick={() => setActiveSession(null)} className={styles.backButton}>
              <ArrowLeft size={18} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeSessionName}
              </h2>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                Session history · send a message to continue
              </p>
            </div>
          </div>

          <div className={`macos-panel ${styles.panel}`}>
            <div className={`${styles.messagesArea} ${m ? styles.messagesAreaMobile : ''}`}>
              {historyQuery.isLoading ? (
                <div className={styles.loadingWrap}>
                  <div className={styles.spinner} />
                </div>
              ) : historyMessages.length === 0 ? (
                <div className={styles.emptyState}>
                  <Clock size={32} />
                  <p style={{ fontSize: 13 }}>No messages found for this session</p>
                </div>
              ) : (
                <div className={styles.messageList}>
                  {historyMessages.map((msg, index) => (
                    <div key={`${msg.ts || index}-${index}`} className={styles.messageRow}>
                      <div
                        className={`${styles.avatar} ${
                          msg.role === 'assistant'
                            ? styles.avatarAssistant
                            : msg.role === 'system'
                              ? styles.avatarSystem
                              : styles.avatarUser
                        }`}
                      >
                        {msg.role === 'assistant' ? (
                          <Bot size={15} />
                        ) : msg.role === 'system' ? (
                          <Zap size={15} />
                        ) : (
                          <User size={15} />
                        )}
                      </div>
                      <div className={styles.messageBody}>
                        <span
                          className={`${styles.historyRole} ${
                            msg.role === 'assistant'
                              ? styles.historyRoleAssistant
                              : msg.role === 'system'
                                ? styles.historyRoleSystem
                                : styles.historyRoleUser
                          }`}
                        >
                          {msg.role}
                        </span>
                        <div className={styles.historyContent}>
                          {typeof msg.content === 'string'
                            ? msg.content.substring(0, 2000)
                            : JSON.stringify(msg.content).substring(0, 2000)}
                          {(msg.content?.length || 0) > 2000 && (
                            <span className={styles.truncatedSuffix}>... (truncated)</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={historyEndRef} />
                </div>
              )}
            </div>

            <div className={`${styles.inputArea} ${m ? styles.inputAreaMobile : ''}`}>
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void sendToSession()
                }}
                className={styles.composer}
              >
                <textarea
                  value={sessionInput}
                  onChange={(event) => setSessionInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void sendToSession()
                    }
                  }}
                  placeholder="Continue this conversation..."
                  rows={1}
                  className={`${styles.textarea} ${styles.sessionTextarea}`}
                  onInput={(event) => {
                    const target = event.currentTarget
                    target.style.height = 'auto'
                    target.style.height = `${Math.min(target.scrollHeight, 80)}px`
                  }}
                />
                <button
                  type="submit"
                  disabled={!sessionInput.trim()}
                  className={`${styles.sendButton} ${
                    sessionInput.trim() ? styles.sendButtonActive : ''
                  }`}
                >
                  <Send size={16} />
                </button>
              </form>
            </div>
          </div>
        </div>
      </PageTransition>
    )
  }

  if (activeSession === 'main-chat') {
    return (
      <PageTransition>
        <div className={`${styles.surface} ${m ? styles.surfaceMobile : ''}`}>
          <div className={`${styles.topBar} ${m ? styles.topBarMobile : ''}`}>
            <button onClick={() => setActiveSession(null)} className={styles.backButton}>
              <ArrowLeft size={18} />
            </button>
            <Sparkles size={18} className={styles.accentIcon} />
            <div className={styles.topBarContent}>
              <h2 className={styles.topBarTitle}>Chat with Müdür</h2>
              <p className={styles.topBarSubtitle}>Full memory & tools</p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className={`macos-button ${styles.clearButton}`}
              >
                <Trash2 size={12} /> Clear
              </button>
            )}
          </div>

          <div className={`macos-panel ${styles.panel}`}>
            <div className={`${styles.messagesArea} ${m ? styles.messagesAreaMobile : ''}`}>
              {messages.length === 0 ? (
                <div className={styles.emptyState}>
                  <Bot size={40} />
                  <p className={styles.emptyTitle}>Hey! Ask me anything 🤖</p>
                  <p className={styles.emptySubtitle}>Same brain as Discord — full memory, all tools.</p>
                </div>
              ) : (
                <div className={styles.messageList}>
                  <AnimatePresence>
                    {messages.map((msg) => (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={styles.messageRow}
                      >
                        <div
                          className={`${styles.avatar} ${
                            msg.role === 'assistant' ? styles.avatarAssistant : styles.avatarUser
                          }`}
                        >
                          {msg.role === 'assistant' ? <Bot size={15} /> : <User size={15} />}
                        </div>
                        <div className={styles.messageBody}>
                          <div className={styles.messageMeta}>
                            <span className={styles.messageAuthor}>
                              {msg.role === 'assistant' ? 'Müdür' : 'You'}
                            </span>
                            {msg.streaming && (
                              <Loader2 size={10} style={{ color: '#007AFF', animation: 'spin 1s linear infinite' }} />
                            )}
                          </div>
                          <div
                            className={styles.messageContent}
                            dangerouslySetInnerHTML={{
                              __html: sanitizeHtml(markdownToHtml(msg.content || '...')),
                            }}
                          />
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            <div className={`${styles.inputArea} ${m ? styles.inputAreaMobile : ''}`}>
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void sendMessage()
                }}
                className={styles.composer}
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void sendMessage()
                    }
                  }}
                  placeholder="Message Müdür..."
                  disabled={isStreaming}
                  rows={1}
                  autoFocus
                  className={`${styles.textarea} ${styles.chatTextarea}`}
                  onInput={(event) => {
                    const target = event.currentTarget
                    target.style.height = 'auto'
                    target.style.height = `${Math.min(target.scrollHeight, 100)}px`
                  }}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isStreaming}
                  className={`${styles.sendButton} ${
                    input.trim() && !isStreaming ? styles.sendButtonActive : ''
                  }`}
                >
                  {isStreaming ? (
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <Send size={16} />
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <div className={`${styles.page} ${m ? styles.pageMobile : ''}`}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={`text-title ${styles.pageTitle}`}>
              <MessageCircle size={m ? 18 : 22} className={styles.accentIcon} /> Conversations
            </h1>
            <p className={`text-body ${styles.pageSubtitle}`}>All agent sessions & chat history</p>
          </div>
          <button
            onClick={openMainChat}
            className={`${styles.newChatButton} ${m ? styles.newChatButtonMobile : ''}`}
          >
            <Sparkles size={15} /> New Chat
          </button>
        </div>

        <div className={styles.filterWrap}>
          <div className={styles.searchWrap}>
            <input
              type="text"
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className={styles.searchInput}
            />
            <Search size={16} className={styles.searchIcon} />
          </div>

          <div className={styles.filterButtons}>
            {filters.map((entry) => (
              <button
                key={entry.id}
                onClick={() => setFilter(entry.id as 'active' | 'all')}
                className={`${styles.filterButton} ${m ? styles.filterButtonMobile : ''} ${
                  filter === entry.id ? styles.filterButtonActive : ''
                }`}
              >
                {entry.label}
                <span
                  className={`${styles.filterBadge} ${
                    filter === entry.id ? styles.filterBadgeActive : ''
                  }`}
                >
                  {entry.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className={`${styles.sessionList} ${m ? styles.sessionListMobile : ''}`}>
          {sessions.map((session, index) => (
            <motion.div
              key={session.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.03 * index }}
              className={`macos-panel ${styles.sessionCard} ${m ? styles.sessionCardMobile : ''}`}
              onClick={() => openSession(session)}
            >
              <div className={`${styles.sessionIcon} ${m ? styles.sessionIconMobile : ''}`}>
                {sessionIcon(session)}
              </div>
              <div className={styles.sessionBody}>
                <div className={styles.sessionTitleRow}>
                  <h3 className={styles.sessionTitle}>{sessionName(session)}</h3>
                  {session.isActive && <StatusBadge status="active" />}
                </div>
                <div className={styles.sessionMeta}>
                  <span className={styles.sessionType}>{sessionTypeLabel(session)}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>·</span>
                  <span className={styles.tokenPill}>
                    {((session.totalTokens || 0) / 1000).toFixed(0)}k tokens
                  </span>
                </div>
              </div>
              <div className={styles.sessionAside}>
                <div className={styles.sessionTime}>
                  <Clock size={10} style={{ color: 'rgba(255,255,255,0.3)' }} />
                  <span>{session.updatedAt ? timeAgo(new Date(session.updatedAt).toISOString()) : '—'}</span>
                </div>
                <span className={styles.sessionModel}>{modelShort(session.model)}</span>
              </div>
              <button
                onClick={(event) => {
                  event.stopPropagation()
                  if (!session.key) return
                  if (!confirm('Close this session?')) return
                  closeSessionMutation.mutate(session.key)
                }}
                disabled={closeSessionMutation.isPending}
                className={styles.closeButton}
              >
                {closeSessionMutation.isPending ? '·' : '✕'}
              </button>
            </motion.div>
          ))}

          {sessions.length === 0 && (
            <GlassCard noPad>
              <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Hash size={16} style={{ color: 'rgba(255,255,255,0.4)' }} />
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                  No sessions match the current filters.
                </span>
              </div>
            </GlassCard>
          )}
        </div>
      </div>
    </PageTransition>
  )
}
