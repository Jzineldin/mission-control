import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, Cpu, MessageSquare, Database, Radio, Heart,
  BarChart3, Mail, Calendar, CheckCircle, Search,
  Clock, Loader2, ArrowRight, Bell, Sun, Sunset, Moon, Timer,
  WifiOff, RefreshCw, ExternalLink
} from 'lucide-react'
import PageTransition from '../components/PageTransition'
import GlassCard from '../components/GlassCard'
import AnimatedCounter from '../components/AnimatedCounter'
import { SkeletonCard } from '../components/Skeleton'
import StatusBadge from '../components/StatusBadge'
import { useApi, timeAgo } from '../lib/hooks'
import { useIsMobile } from '../lib/useIsMobile'
import { toast } from '../components/ToastSystem'
import OnboardingChecklist from '../components/OnboardingChecklist'

const feedIcons: Record<string, any> = {
  check: CheckCircle,
  search: Search,
  clock: Clock,
  loader: Loader2,
}

const feedColors: Record<string, string> = {
  task_completed: '#32D74B',
  task_running: '#007AFF',
  scout_found: '#FF9500',
  scout_deployed: '#BF5AF2',
  cron_run: '#8E8E93',
}

function getGreeting(): { text: string; icon: any; color: string } {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return { text: 'Good morning', icon: Sun, color: '#FFD60A' }
  if (hour >= 12 && hour < 18) return { text: 'Good afternoon', icon: Sun, color: '#FF9500' }
  if (hour >= 18 && hour < 22) return { text: 'Good evening', icon: Sunset, color: '#FF6B35' }
  return { text: 'Good night', icon: Moon, color: '#BF5AF2' }
}

function formatUptime(startedAt: number | string | undefined): string {
  if (!startedAt) return '—'
  const start = typeof startedAt === 'number' ? startedAt * 1000 : new Date(startedAt).getTime()
  const diff = Date.now() - start
  if (diff < 0) return '—'
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}


function GatewayPending() {
  const m = useIsMobile()
  const [elapsed, setElapsed] = useState(0)
  
  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [])
  
  // After 5 seconds, show the helpful offline card instead of just a spinner
  if (elapsed >= 5) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 24, padding: '0 24px' }}>
        <div style={{
          width: 72, height: 72, borderRadius: 20,
          background: 'rgba(255,149,0,0.12)', border: '1px solid rgba(255,149,0,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <WifiOff size={32} style={{ color: '#FF9500' }} />
        </div>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <h2 style={{ fontSize: m ? 18 : 22, fontWeight: 600, color: 'rgba(255,255,255,0.92)', marginBottom: 8 }}>
            Connecting to OpenClaw…
          </h2>
          <p style={{ fontSize: m ? 13 : 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
            {elapsed < 15
              ? "The gateway is taking longer than usual to respond. This happens when OpenClaw is starting up or restarting."
              : "Can't reach the OpenClaw gateway. Make sure it's running and the token in Settings matches your config."
            }
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 320 }}>
          <div style={{
            padding: '14px 18px', borderRadius: 10,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6
          }}>
            <strong style={{ color: 'rgba(255,255,255,0.85)' }}>Quick checks:</strong><br/>
            1. Is OpenClaw running? <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: 3 }}>openclaw status</code><br/>
            2. Gateway port is 18789 by default<br/>
            3. Check Settings → Gateway Token
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 8,
              border: '1px solid rgba(0,122,255,0.4)', background: 'rgba(0,122,255,0.15)',
              color: '#007AFF', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <RefreshCw size={14} />
            Retry Connection
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF9500', animation: 'pulse 2s ease-in-out infinite' }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Still trying… ({elapsed}s)</span>
        </div>
      </div>
    )
  }
  
  // First 5 seconds: simple spinner with helpful text
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: 16 }}>
      <div style={{ width: 24, height: 24, border: '2px solid #007AFF', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Connecting to OpenClaw gateway…</span>
    </div>
  )
}


function StatusBriefing() {
  const m = useIsMobile()
  const [loading, setLoading] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const { data: configData } = useApi<any>('/api/config', 300000) // Cache config for 5min
  const { data: activityData } = useApi<any>('/api/activity', 10000)
  const { data: costsData } = useApi<any>('/api/costs', 60000)
  const { data: statusData } = useApi<any>('/api/status', 30000)

  const handleQuickAction = async (endpoint: string, label: string) => {
    if (loading) return

    // All quick actions: open chat widget with auto-send
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

      // Clear result after 5 seconds
      setTimeout(() => setResult(null), 10000)
    } catch (e: any) {
      setResult(`❌ ${e.message}`)
      setTimeout(() => setResult(null), 10000)
    } finally {
      setLoading(null)
    }
  }

  // Time-based greeting
  const getGreeting = () => {
    const timezone = configData?.timezone || 'UTC'
    const now = new Date()
    const hour = now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: timezone })
    const hourNum = parseInt(hour)

    if (hourNum < 12) return 'Good morning'
    if (hourNum < 18) return 'Good afternoon'
    return 'Good evening'
  }

  // Generate briefing text
  const getBriefingText = () => {
    const feed = activityData?.feed || []
    const activeSessions = statusData?.sessions?.filter((s: any) => s.isActive).length || 0

    // Count cron jobs today
    const today = new Date().toDateString()
    const cronRuns = feed.filter((item: any) =>
      item.type === 'cron_run' && new Date(item.time).toDateString() === today
    ).length

    // Get today's cost
    const todayCost = costsData?.breakdown?.today?.total || 0

    const sessionText = activeSessions === 1 ? '1 active session' : `${activeSessions} active sessions`
    const cronText = cronRuns === 1 ? '1 cron job ran today' : `${cronRuns} cron jobs ran today`
    const costText = `$${todayCost.toFixed(2)} estimated cost today`

    return `${sessionText} • ${cronText} • ${costText}`
  }

  const actions = [
    { endpoint: '/heartbeat/run', label: 'Heartbeat', icon: Heart },
    { endpoint: '/quick/emails', label: 'Emails', icon: Mail },
    { endpoint: '/quick/schedule', label: 'Schedule', icon: Calendar },
  ]

  return (
    <GlassCard delay={0.08} noPad>
      <div style={{ padding: m ? 14 : 20 }}>
        <div style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.92)', marginBottom: 6 }}>
            {getGreeting()}
          </h3>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.4 }}>
            {getBriefingText()}
          </p>
        </div>

        <div style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 8,
          flexWrap: 'wrap'
        }}>
          {actions.map(action => (
            <button
              key={action.endpoint}
              onClick={() => handleQuickAction(action.endpoint, action.label)}
              disabled={loading === action.endpoint}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid rgba(0,122,255,0.3)',
                background: loading === action.endpoint
                  ? 'rgba(0,122,255,0.2)'
                  : 'rgba(0,122,255,0.1)',
                color: 'rgba(255,255,255,0.9)',
                fontSize: 11,
                fontWeight: 500,
                cursor: loading === action.endpoint ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.15s',
                opacity: loading === action.endpoint ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (loading !== action.endpoint) {
                  e.currentTarget.style.background = 'rgba(0,122,255,0.2)'
                  e.currentTarget.style.borderColor = 'rgba(0,122,255,0.5)'
                }
              }}
              onMouseLeave={(e) => {
                if (loading !== action.endpoint) {
                  e.currentTarget.style.background = 'rgba(0,122,255,0.1)'
                  e.currentTarget.style.borderColor = 'rgba(0,122,255,0.3)'
                }
              }}
            >
              {loading === action.endpoint ? (
                <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <action.icon size={12} />
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
            background: result.startsWith('❌')
              ? 'rgba(255,69,58,0.1)'
              : 'rgba(50,215,75,0.1)',
            border: `1px solid ${result.startsWith('❌')
              ? 'rgba(255,69,58,0.3)'
              : 'rgba(50,215,75,0.3)'}`,
            fontSize: 11,
            color: result.startsWith('❌')
              ? '#FF453A'
              : '#32D74B',
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
  const { data, loading } = useApi<any>('/api/status', 30000)
  const { data: activityData } = useApi<any>('/api/activity', 10000)
  const { data: sessionsData } = useApi<any>('/api/sessions', 15000)
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

  // Monitor for issues and show alerts
  const { data: costsData } = useApi<any>('/api/costs', 60000)
  useEffect(() => {
    if (!costsData?.breakdown?.today?.total) return
    const todayCost = costsData.breakdown.today.total
    
    // Get user's budget settings
    let alertThreshold = 15 // default $15/day
    let alertsEnabled = true
    try {
      const saved = localStorage.getItem('budget-settings')
      if (saved) {
        const settings = JSON.parse(saved)
        alertThreshold = settings.budget || 15
        alertsEnabled = settings.alertsEnabled !== false
      }
    } catch {}
    
    if (alertsEnabled && todayCost > alertThreshold) {
      // Only show once per session by checking if we already showed this alert
      const alertKey = `cost-alert-${Math.floor(todayCost)}`
      if (!sessionStorage.getItem(alertKey)) {
        toast.warning('Daily budget exceeded', `Today's estimated cost: $${todayCost.toFixed(2)} (limit: $${alertThreshold.toFixed(2)})`, { duration: 8000 })
        sessionStorage.setItem(alertKey, 'shown')
      }
    }
  }, [costsData])

  // Monitor for channel disconnections
  useEffect(() => {
    if (!data?.agent?.channels) return
    const disconnectedChannels = data.agent.channels.filter((ch: any) => ch.state !== 'OK')
    disconnectedChannels.forEach((ch: any) => {
      const alertKey = `channel-alert-${ch.name}`
      if (!sessionStorage.getItem(alertKey)) {
        toast.error('Channel disconnected', `${ch.name} is ${ch.state}`, { persistent: true })
        sessionStorage.setItem(alertKey, 'shown')
      }
    })
  }, [data])

  if (loading || !data) {
    return (
      <PageTransition>
        <GatewayPending />
      </PageTransition>
    )
  }

  const { agent, heartbeat, tokenUsage } = data
  const feed = activityData?.feed || []
  const sessions = sessionsData?.sessions || []
  const activeSessions = sessions.filter((s: any) => s.isActive).length
  const totalSessions = sessions.length

  // Use actual agent name or fallback to 'Agent'
  const displayName = agent.name || 'Agent'

  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: m ? 16 : 28 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {(() => { const g = getGreeting(); return <g.icon size={m ? 18 : 22} style={{ color: g.color }} /> })()}
              {getGreeting().text}
            </h1>
            <p className="text-body" style={{ marginTop: 4 }}>
              {activeSessions} active session{activeSessions !== 1 ? 's' : ''} · {feed.length} recent activit{feed.length !== 1 ? 'ies' : 'y'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {data?.startedAt && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                  <Timer size={11} style={{ color: 'rgba(255,255,255,0.35)' }} />
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>Uptime</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace' }}>
                  {formatUptime(data.startedAt)}
                </span>
              </div>
            )}
            <StatusBadge status="active" pulse label="Live" />
          </div>
        </div>

        {/* Onboarding Checklist — appears for new users, dismissible */}
        <OnboardingChecklist />

        {/* Hero Status Card */}
        <GlassCard delay={0.05} noPad>
          <div style={{ padding: m ? 16 : 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: m ? 12 : 0 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(0,122,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Activity size={20} style={{ color: '#007AFF' }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>{displayName}</h2>
                  <StatusBadge status="active" pulse />
                  {data?.startedAt && (
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
                      {formatUptime(data.startedAt)}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m ? agent.heartbeatInterval : `${agent.model} · ${agent.heartbeatInterval} · ${agent.totalAgents} agents`}
                </p>
                {/* Last Active timestamp */}
                {sessions.length > 0 && (
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
                    Last active: {timeAgo(sessions.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())[0]?.updatedAt || '')}
                  </p>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, justifyContent: m ? 'space-around' : 'flex-end', paddingTop: m ? 12 : 0, borderTop: m ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <div style={{ textAlign: 'center' }}>
                <p className="text-label">Sessions</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 2 }}>
                  <p style={{ fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.92)', fontVariantNumeric: 'tabular-nums' }}>
                    <AnimatedCounter end={activeSessions} />
                    <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', marginLeft: 2 }}>/{totalSessions}</span>
                  </p>
                  <button
                    onClick={() => navigate('/conversations')}
                    style={{
                      fontSize: 10,
                      color: '#007AFF',
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
              <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.08)' }} />
              <div style={{ textAlign: 'center' }}>
                <p className="text-label">Memory</p>
                <p style={{ fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.92)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                  <AnimatedCounter end={agent.memoryChunks} />
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginLeft: 4 }}>chunks</span>
                </p>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Status Briefing */}
        <StatusBriefing />

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: m ? 10 : 20 }}>
          {[
            { label: 'Sessions', value: totalSessions, icon: Activity, color: '#007AFF' },
            { label: 'Mem Files', value: agent.memoryFiles, icon: Database, color: '#BF5AF2' },
            { label: 'Chunks', value: agent.memoryChunks, icon: Cpu, color: '#32D74B' },
            { label: 'Channels', value: agent.channels?.length || 0, icon: Radio, color: '#FF9500' },
          ].map((stat, i) => (
            <GlassCard key={stat.label} delay={0.1 + i * 0.05} noPad>
              <div style={{ padding: m ? '12px 14px' : 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: `${stat.color}20`, flexShrink: 0 }}>
                    <stat.icon size={14} style={{ color: stat.color }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</span>
                </div>
                <p style={{ fontSize: m ? 22 : 28, fontWeight: 300, color: 'rgba(255,255,255,0.92)', fontVariantNumeric: 'tabular-nums' }}>
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
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.92)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Bell size={14} style={{ color: '#FFD60A' }} /> Activity Feed
                  </h3>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{feed.length} items</span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                  {loading ? (
                    <SkeletonCard count={3} />
                  ) : feed.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '50px 20px', color: 'rgba(255,255,255,0.4)' }}>
                      <Bell size={32} style={{ marginBottom: 16, opacity: 0.4 }} />
                      <h4 style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
                        No activity yet
                      </h4>
                      <p style={{ fontSize: 11, lineHeight: 1.5, color: 'rgba(255,255,255,0.35)' }}>
                        Your agent will log completed tasks, scout discoveries,<br />
                        and cron runs here.
                      </p>
                    </div>
                  ) : feed.map((item: any, i: number) => {
                    const Icon = feedIcons[item.icon] || Activity
                    const color = feedColors[item.type] || '#8E8E93'
                    const isRunning = item.type === 'task_running'
                    
                    return (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex', gap: m ? 10 : 12, padding: m ? '10px 0' : '12px 0',
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
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
                              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: item.score >= 80 ? 'rgba(50,215,75,0.12)' : 'rgba(255,149,0,0.12)', color: item.score >= 80 ? '#32D74B' : '#FF9500' }}>
                                {item.score}pts
                              </span>
                            )}
                            {item.source && (
                              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{item.source}</span>
                            )}
                            {item.priority && (
                              <span style={{
                                width: 6, height: 6, borderRadius: '50%',
                                background: item.priority === 'high' ? '#FF453A' : item.priority === 'medium' ? '#FF9500' : '#007AFF',
                              }} />
                            )}
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginLeft: 'auto' }}>
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
                <h3 style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Radio size={13} style={{ color: '#BF5AF2' }} /> Channels
                </h3>
                {agent.channels?.length > 0 ? agent.channels.map((ch: any) => (
                  <div key={ch.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                      <MessageSquare size={14} style={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>{ch.name}</p>
                        {!m && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.detail}</p>}
                      </div>
                    </div>
                    <StatusBadge status={ch.state === 'OK' ? 'active' : ch.state === 'OFF' ? 'off' : 'error'} />
                  </div>
                )) : <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>No channels</p>}
              </div>
            </GlassCard>

            {/* Token Usage */}
            <GlassCard delay={0.25} hover={false} noPad>
              <div style={{ padding: m ? 14 : 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BarChart3 size={13} style={{ color: '#007AFF' }} /> Tokens Used
                  </h3>
                  <span style={{ fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.92)', fontVariantNumeric: 'tabular-nums' }}>{(tokenUsage.used / 1000).toFixed(0)}k</span>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>This session period · No usage limit</div>
              </div>
            </GlassCard>

            {/* Heartbeat */}
            <GlassCard delay={0.3} hover={false} noPad>
              <div style={{ padding: m ? 14 : 24 }}>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Heart size={13} style={{ color: '#FF453A' }} /> Heartbeat
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center' }}>
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 4 }}>Last</p>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{heartbeat.lastHeartbeat ? timeAgo(new Date(heartbeat.lastHeartbeat * 1000).toISOString()) : '—'}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 4 }}>Next</p>
                    <p style={{ fontSize: 12, color: countdown === 'Overdue' ? '#FF453A' : '#007AFF', fontFamily: 'monospace' }}>{countdown || '—'}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 4 }}>Interval</p>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{agent.heartbeatInterval}</p>
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
