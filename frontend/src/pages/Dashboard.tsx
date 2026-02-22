import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, Cpu, MessageSquare, Database, Radio, Heart,
  BarChart3, Mail, Calendar, CheckCircle, Search,
  Clock, Loader2, ArrowRight, Bell
} from 'lucide-react'
import PageTransition from '../components/PageTransition'
import GlassCard from '../components/GlassCard'
import AnimatedCounter from '../components/AnimatedCounter'
import StatusBadge from '../components/StatusBadge'
import { useDashboardData, timeAgo } from '../lib/hooks'
import { useIsMobile } from '../lib/useIsMobile'
import { TEXT, COLORS, GLASS, accent } from '../lib/theme'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const feedIcons: Record<string, any> = {
  check: CheckCircle,
  search: Search,
  clock: Clock,
  loader: Loader2,
}

const feedColors: Record<string, string> = {
  task_completed: COLORS.green,
  task_running:   COLORS.blue,
  scout_found:    COLORS.orange,
  scout_deployed: COLORS.purple,
  cron_run:       COLORS.gray,
}

function QuickActionsBar() {
  const m = useIsMobile()
  const [loading, setLoading] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const handleQuickAction = async (endpoint: string, _label: string) => {
    if (loading) return

    if (endpoint === '/quick/emails') {
      window.dispatchEvent(new CustomEvent('open-chat', { detail: { message: 'Check my unread emails and summarize anything important.', autoSend: true } }))
      return
    }
    if (endpoint === '/quick/schedule') {
      window.dispatchEvent(new CustomEvent('open-chat', { detail: { message: "What's on my calendar today and tomorrow?", autoSend: true } }))
      return
    }
    if (endpoint === '/heartbeat/run') {
      window.dispatchEvent(new CustomEvent('open-chat', { detail: { message: 'Run a quick heartbeat check: emails, calendar, anything urgent I should know about?', autoSend: true } }))
      return
    }

    setLoading(endpoint)
    setResult(null)

    try {
      const res = await fetch(`/api${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await res.json()

      if (data.status === 'triggered') {
        setResult('✅ Heartbeat triggered')
      } else if (data.status === 'error') {
        setResult(`❌ ${data.error}`)
      } else {
        setResult('✅ Action completed')
      }

      setTimeout(() => setResult(null), 10000)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      setResult(`❌ ${e.message}`)
      setTimeout(() => setResult(null), 10000)
    } finally {
      setLoading(null)
    }
  }

  const actions = [
    { endpoint: '/heartbeat/run', label: '▶ Run Heartbeat', icon: Heart },
    { endpoint: '/quick/emails', label: '📧 Check Emails', icon: Mail },
    { endpoint: '/quick/schedule', label: '📅 Today\'s Schedule', icon: Calendar },
  ]

  const blueAccent = accent(COLORS.blue)
  const isActive = (ep: string) => loading === ep

  return (
    <GlassCard delay={0.08} noPad>
      <div style={{ padding: m ? 14 : 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: TEXT.primary, marginBottom: 12 }}>
          Quick Actions
        </h3>

        <div style={{
          display: 'flex',
          flexDirection: m ? 'column' : 'row',
          gap: m ? 10 : 12
        }}>
          {actions.map(action => (
            <button
              key={action.endpoint}
              onClick={() => handleQuickAction(action.endpoint, action.label)}
              disabled={isActive(action.endpoint)}
              style={{
                flex: m ? undefined : 1,
                padding: '10px 16px',
                borderRadius: 8,
                border: `1px solid ${blueAccent.border}`,
                background: isActive(action.endpoint) ? blueAccent.bgHover : blueAccent.bg,
                color: TEXT.primary,
                fontSize: 12,
                fontWeight: 500,
                cursor: isActive(action.endpoint) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all 0.15s',
                opacity: isActive(action.endpoint) ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isActive(action.endpoint)) {
                  e.currentTarget.style.background = blueAccent.bgHover
                  e.currentTarget.style.borderColor = blueAccent.borderHi
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive(action.endpoint)) {
                  e.currentTarget.style.background = blueAccent.bg
                  e.currentTarget.style.borderColor = blueAccent.border
                }
              }}
            >
              {isActive(action.endpoint) ? (
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <action.icon size={14} />
              )}
              {action.label}
            </button>
          ))}
        </div>

        {result && (
          <div style={{
            marginTop: 12,
            padding: '8px 12px',
            borderRadius: 6,
            background: result.startsWith('❌') ? accent(COLORS.red).bg : accent(COLORS.green).bg,
            border: `1px solid ${result.startsWith('❌') ? accent(COLORS.red).border : accent(COLORS.green).border}`,
            fontSize: 11,
            color: result.startsWith('❌') ? COLORS.red : COLORS.green,
          }}>
            {result}
          </div>
        )}
      </div>
    </GlassCard>
  )
}

export default function Dashboard() {
  const m = useIsMobile()
  const navigate = useNavigate()
  const { status: data, activity: activityData, sessions: sessionsData, loading } = useDashboardData()
  const [countdown, setCountdown] = useState('')

  useEffect(() => {
    if (!data?.heartbeat?.lastChecks) return
    const interval = setInterval(() => {
      const last = data.heartbeat.lastHeartbeat || Date.now() / 1000
      const next = last + 3600
      const remaining = next - Date.now() / 1000
      if (remaining <= 0) {
        setCountdown('Overdue')
      } else {
        const mins = Math.floor(remaining / 60)
        const secs = Math.floor(remaining % 60)
        setCountdown(`${mins}m ${secs}s`)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [data])

  if (loading || !data) {
    return (
      <PageTransition>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
          <div style={{ width: 24, height: 24, border: `2px solid ${COLORS.blue}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
      </PageTransition>
    )
  }

  const { agent, heartbeat, tokenUsage } = data
  const feed = activityData?.feed || []
  const sessions = sessionsData?.sessions || []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeSessions = sessions.filter((s: any) => s.isActive).length
  const totalSessions = sessions.length

  const displayName = agent.name === 'Mission Control'
    ? 'Agent'
    : agent.name

  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: m ? 16 : 28 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="text-title">Dashboard</h1>
            <p className="text-body" style={{ marginTop: 4 }}>Your agent at a glance — status, activity & channels</p>
          </div>
          <StatusBadge status="active" pulse label="Live" />
        </div>

        {/* Hero Status Card */}
        <GlassCard delay={0.05} noPad>
          <div style={{ padding: m ? 16 : 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: m ? 12 : 0 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: accent(COLORS.blue).bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Activity size={20} style={{ color: COLORS.blue }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 600, color: TEXT.primary }}>{displayName}</h2>
                  <StatusBadge status="active" pulse />
                </div>
                <p style={{ fontSize: 11, color: TEXT.tertiary, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m ? agent.heartbeatInterval : `${agent.model} · ${agent.heartbeatInterval} · ${agent.totalAgents} agents`}
                </p>
                {sessions.length > 0 && (
                  <p style={{ fontSize: 10, color: TEXT.dim, marginTop: 4 }}>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    Last active: {timeAgo(sessions.sort((a: any, b: any) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())[0]?.updatedAt || '')}
                  </p>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, justifyContent: m ? 'space-around' : 'flex-end', paddingTop: m ? 12 : 0, borderTop: m ? `1px solid ${GLASS.divider}` : 'none' }}>
              <div style={{ textAlign: 'center' }}>
                <p className="text-label">Sessions</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 2 }}>
                  <p style={{ fontSize: 22, fontWeight: 300, color: TEXT.primary, fontVariantNumeric: 'tabular-nums' }}>
                    <AnimatedCounter end={activeSessions} />
                    <span style={{ fontSize: 14, color: TEXT.tertiary, marginLeft: 2 }}>/{totalSessions}</span>
                  </p>
                  <button
                    onClick={() => navigate('/conversations')}
                    style={{
                      fontSize: 10,
                      color: COLORS.blue,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      padding: 0,
                      marginLeft: 4,
                    }}
                  >
                    Manage →
                  </button>
                </div>
              </div>
              <div style={{ width: 1, height: 36, background: GLASS.border }} />
              <div style={{ textAlign: 'center' }}>
                <p className="text-label">Memory</p>
                <p style={{ fontSize: 22, fontWeight: 300, color: TEXT.primary, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                  <AnimatedCounter end={agent.memoryChunks} />
                  <span style={{ fontSize: 12, color: TEXT.tertiary, marginLeft: 4 }}>chunks</span>
                </p>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Quick Actions Bar */}
        <QuickActionsBar />

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: m ? 10 : 20 }}>
          {[
            { label: 'Sessions', value: totalSessions,          icon: Activity, color: COLORS.blue   },
            { label: 'Mem Files', value: agent.memoryFiles,     icon: Database, color: COLORS.purple },
            { label: 'Chunks',   value: agent.memoryChunks,     icon: Cpu,      color: COLORS.green  },
            { label: 'Channels', value: agent.channels?.length || 0, icon: Radio, color: COLORS.orange },
          ].map((stat, i) => (
            <GlassCard key={stat.label} delay={0.1 + i * 0.05} noPad>
              <div style={{ padding: m ? '12px 14px' : 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: `${stat.color}20`, flexShrink: 0 }}>
                    <stat.icon size={14} style={{ color: stat.color }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: TEXT.tertiary, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</span>
                </div>
                <p style={{ fontSize: m ? 22 : 28, fontWeight: 300, color: TEXT.primary, fontVariantNumeric: 'tabular-nums' }}>
                  <AnimatedCounter end={stat.value} />
                </p>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Main content: Activity Feed + System Info */}
        <div style={{ display: 'flex', flexDirection: m ? 'column' : 'row', gap: m ? 16 : 24 }}>

          {/* Activity Feed — THE main feature */}
          <div style={{ flex: m ? undefined : 1.5, minWidth: 0 }}>
            <GlassCard delay={0.15} hover={false} noPad>
              <div style={{ padding: m ? 14 : 24, maxHeight: m ? 500 : 640, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: TEXT.primary, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Bell size={14} style={{ color: COLORS.yellow }} /> Activity Feed
                  </h3>
                  <span style={{ fontSize: 10, color: TEXT.dim }}>{feed.length} items</span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                  {feed.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,0.3)' }}>
                      <Bell size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
                      <p style={{ fontSize: 12 }}>No activity yet</p>
                    </div>
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ) : feed.map((item: any, _i: number) => {
                    const Icon = feedIcons[item.icon] || Activity
                    const color = feedColors[item.type] || COLORS.gray
                    const isRunning = item.type === 'task_running'

                    return (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex', gap: m ? 10 : 12, padding: m ? '10px 0' : '12px 0',
                          borderBottom: `1px solid ${GLASS.surface}`,
                          cursor: item.actionUrl ? 'pointer' : 'default',
                        }}
                        onClick={() => item.actionUrl && navigate(item.actionUrl)}
                      >
                        {/* Icon */}
                        <div style={{
                          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                          background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Icon size={14} style={{ color, ...(isRunning ? { animation: 'spin 1s linear infinite' } : {}) }} />
                        </div>

                        {/* Content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{
                            fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.88)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {item.title}
                          </p>
                          {item.detail && (
                            <p style={{
                              fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 3, lineHeight: 1.4,
                              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                            }}>
                              {item.detail}
                            </p>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                            {item.score && (
                              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: item.score >= 80 ? 'rgba(50,215,75,0.12)' : 'rgba(255,149,0,0.12)', color: item.score >= 80 ? COLORS.green : COLORS.orange }}>
                                {item.score}pts
                              </span>
                            )}
                            {item.source && (
                              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{item.source}</span>
                            )}
                            {item.priority && (
                              <span style={{
                                width: 6, height: 6, borderRadius: '50%',
                                background: item.priority === 'high' ? COLORS.red : item.priority === 'medium' ? COLORS.orange : COLORS.blue,
                              }} />
                            )}
                            <span style={{ fontSize: 10, color: TEXT.muted, marginLeft: 'auto' }}>
                              {item.time ? timeAgo(item.time) : ''}
                            </span>
                          </div>
                        </div>

                        {/* Action button */}
                        {item.actionable && (
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(item.actionUrl || '/workshop'); }}
                            style={{
                              alignSelf: 'center', padding: '5px 10px', borderRadius: 7, flexShrink: 0,
                              border: `1px solid ${color}30`, background: `${color}10`,
                              color, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: 4,
                            }}
                          >
                            {item.actionLabel || 'View'} <ArrowRight size={10} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Right Column - System Info */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: m ? 12 : 20, minWidth: 0 }}>
            {/* Channels */}
            <GlassCard delay={0.2} hover={false} noPad>
              <div style={{ padding: m ? 14 : 24 }}>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: TEXT.primary, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Radio size={13} style={{ color: COLORS.purple }} /> Channels
                </h3>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {agent.channels?.length > 0 ? agent.channels.map((ch: any) => (
                  <div key={ch.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${GLASS.borderSubtle}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                      <MessageSquare size={14} style={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>{ch.name}</p>
                        {!m && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.detail}</p>}
                      </div>
                    </div>
                    <StatusBadge status={ch.state === 'OK' ? 'active' : ch.state === 'OFF' ? 'off' : 'error'} />
                  </div>
                )) : <p style={{ fontSize: 12, color: TEXT.tertiary }}>No channels</p>}
              </div>
            </GlassCard>

            {/* Token Usage */}
            <GlassCard delay={0.25} hover={false} noPad>
              <div style={{ padding: m ? 14 : 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: TEXT.primary, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BarChart3 size={13} style={{ color: COLORS.blue }} /> Tokens Used
                  </h3>
                  <span style={{ fontSize: 18, fontWeight: 700, color: TEXT.primary, fontVariantNumeric: 'tabular-nums' }}>{(tokenUsage.used / 1000).toFixed(0)}k</span>
                </div>
                <div style={{ fontSize: 11, color: TEXT.tertiary }}>This session period · No usage limit</div>
              </div>
            </GlassCard>

            {/* Heartbeat */}
            <GlassCard delay={0.3} hover={false} noPad>
              <div style={{ padding: m ? 14 : 24 }}>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: TEXT.primary, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Heart size={13} style={{ color: COLORS.red }} /> Heartbeat
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center' }}>
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 4 }}>Last</p>
                    <p style={{ fontSize: 12, color: TEXT.secondary }}>{heartbeat.lastHeartbeat ? timeAgo(new Date(heartbeat.lastHeartbeat * 1000).toISOString()) : '—'}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 4 }}>Next</p>
                    <p style={{ fontSize: 12, color: countdown === 'Overdue' ? COLORS.red : COLORS.blue, fontFamily: 'monospace' }}>{countdown || '—'}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 4 }}>Interval</p>
                    <p style={{ fontSize: 12, color: TEXT.secondary }}>{agent.heartbeatInterval}</p>
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
