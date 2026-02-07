import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, Cpu, MessageSquare, Database, Radio, Heart,
  BarChart3, Zap, Mail, Calendar, Code, CheckCircle, Search,
  Clock, Loader2, Play, ArrowRight, Bell
} from 'lucide-react'
import PageTransition from '../components/PageTransition'
import GlassCard from '../components/GlassCard'
import AnimatedCounter from '../components/AnimatedCounter'
import StatusBadge from '../components/StatusBadge'
import { useApi, timeAgo } from '../lib/hooks'
import { useIsMobile } from '../lib/useIsMobile'

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

export default function Dashboard() {
  const m = useIsMobile()
  const navigate = useNavigate()
  const { data, loading } = useApi<any>('/api/status', 30000)
  const { data: activityData } = useApi<any>('/api/activity', 10000)
  const [countdown, setCountdown] = useState('')

  useEffect(() => {
    if (!data?.heartbeat?.lastChecks) return
    const interval = setInterval(() => {
      const last = data.heartbeat.lastHeartbeat || Date.now() / 1000
      const next = last + 3600
      const remaining = Math.max(0, next - Date.now() / 1000)
      const mins = Math.floor(remaining / 60)
      const secs = Math.floor(remaining % 60)
      setCountdown(`${mins}m ${secs}s`)
    }, 1000)
    return () => clearInterval(interval)
  }, [data])

  if (loading || !data) {
    return (
      <PageTransition>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
          <div style={{ width: 24, height: 24, border: '2px solid #007AFF', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
      </PageTransition>
    )
  }

  const { agent, heartbeat, tokenUsage } = data
  const feed = activityData?.feed || []

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
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(0,122,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Activity size={20} style={{ color: '#007AFF' }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>{agent.name}</h2>
                  <StatusBadge status="active" pulse />
                </div>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m ? agent.heartbeatInterval : `${agent.model} · ${agent.heartbeatInterval} · ${agent.totalAgents} agents`}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, justifyContent: m ? 'space-around' : 'flex-end', paddingTop: m ? 12 : 0, borderTop: m ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <div style={{ textAlign: 'center' }}>
                <p className="text-label">Sessions</p>
                <p style={{ fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.92)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                  <AnimatedCounter end={agent.activeSessions} />
                </p>
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

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: m ? 10 : 20 }}>
          {[
            { label: 'Sessions', value: agent.activeSessions, icon: Activity, color: '#007AFF' },
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
                  {feed.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,0.3)' }}>
                      <Bell size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
                      <p style={{ fontSize: 12 }}>No activity yet</p>
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
                    <BarChart3 size={13} style={{ color: '#007AFF' }} /> Tokens
                  </h3>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)', fontVariantNumeric: 'tabular-nums' }}>{tokenUsage.percentage}%</span>
                </div>
                <div className="macos-progress" style={{ marginBottom: 8 }}>
                  <div className="macos-progress-fill" style={{ width: `${tokenUsage.percentage}%` }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{(tokenUsage.used / 1000).toFixed(0)}k</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{(tokenUsage.limit / 1000).toFixed(0)}k limit</span>
                </div>
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
                    <p style={{ fontSize: 12, color: '#007AFF', fontFamily: 'monospace' }}>{countdown || '—'}</p>
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
