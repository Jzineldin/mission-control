import { useState, useEffect } from 'react'
import {
  Activity,
  Cpu,
  MessageSquare,
  Database,
  Radio,
  Heart,
  BarChart3,
  Zap,
  Mail,
  Calendar,
  Code
} from 'lucide-react'
import PageTransition from '../components/PageTransition'
import GlassCard from '../components/GlassCard'
import AnimatedCounter from '../components/AnimatedCounter'
import StatusBadge from '../components/StatusBadge'
import { useApi, timeAgo } from '../lib/hooks'

const activityIcons: Record<string, any> = {
  heartbeat: Heart,
  development: Code,
  email: Mail,
  memory: Database,
  calendar: Calendar,
  business: BarChart3,
  chat: MessageSquare,
}

export default function Dashboard() {
  const { data, loading } = useApi<any>('/api/status', 30000)
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
        <div className="flex items-center justify-center h-full">
          <div className="w-6 h-6 border-2 border-[#007AFF] border-t-transparent rounded-full animate-spin" />
        </div>
      </PageTransition>
    )
  }

  const { agent, heartbeat, recentActivity, tokenUsage } = data

  return (
    <PageTransition>
      <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '28px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="text-title">Dashboard</h1>
            <p className="text-body" style={{ marginTop: '8px' }}>System overview and agent status</p>
          </div>
          <StatusBadge status="active" pulse label="Live" />
        </div>

        {/* Hero Status Card */}
        <GlassCard delay={0.05}>
          <div style={{ padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(0,122,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Activity size={24} style={{ color: '#007AFF' }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <h2 className="text-heading">{agent.name}</h2>
                  <StatusBadge status="active" pulse />
                </div>
                <p className="text-caption" style={{ marginTop: 4 }}>
                  {agent.model} · {agent.heartbeatInterval} heartbeat · {agent.totalAgents} agent{agent.totalAgents > 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
              <div style={{ textAlign: 'right' }}>
                <p className="text-label">Sessions</p>
                <p style={{ fontSize: '24px', fontWeight: 300, color: 'rgba(255,255,255,0.92)', marginTop: 4 }}>
                  <AnimatedCounter end={agent.activeSessions} />
                </p>
              </div>
              <div className="divider-v" style={{ height: 40 }} />
              <div style={{ textAlign: 'right' }}>
                <p className="text-label">Memory</p>
                <p style={{ fontSize: '24px', fontWeight: 300, color: 'rgba(255,255,255,0.92)', marginTop: 4 }}>
                  <AnimatedCounter end={agent.memoryChunks} />
                  <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', marginLeft: 4 }}>chunks</span>
                </p>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
          {[
            { label: 'Active Sessions', value: agent.activeSessions, icon: Activity, color: '#007AFF' },
            { label: 'Memory Files', value: agent.memoryFiles, icon: Database, color: '#BF5AF2' },
            { label: 'Memory Chunks', value: agent.memoryChunks, icon: Cpu, color: '#32D74B' },
            { label: 'Channels', value: agent.channels?.length || 0, icon: Radio, color: '#FF9500' },
          ].map((stat, i) => (
            <GlassCard key={stat.label} delay={0.1 + i * 0.05}>
              <div style={{ padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: `${stat.color}20` }}>
                    <stat.icon size={16} style={{ color: stat.color }} strokeWidth={2} />
                  </div>
                  <span className="text-label">{stat.label}</span>
                </div>
                <p style={{ fontSize: '28px', fontWeight: 300, color: 'rgba(255,255,255,0.92)' }}>
                  <AnimatedCounter end={stat.value} />
                </p>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Two-column Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Left Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Channels */}
            <GlassCard delay={0.2} hover={false}>
              <div style={{ padding: '24px' }}>
                <h3 className="text-heading" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Radio size={14} style={{ color: '#BF5AF2' }} /> Channels
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {agent.channels?.length > 0 ? agent.channels.map((ch: any) => (
                    <div key={ch.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <MessageSquare size={14} style={{ color: 'rgba(255,255,255,0.65)' }} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p className="text-body" style={{ fontWeight: 500 }}>{ch.name}</p>
                          <p className="text-caption" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.detail}</p>
                        </div>
                      </div>
                      <StatusBadge status={ch.state === 'OK' ? 'active' : ch.state === 'OFF' ? 'off' : 'error'} />
                    </div>
                  )) : (
                    <p className="text-caption">No channel data available</p>
                  )}
                </div>
              </div>
            </GlassCard>

            {/* Token Usage */}
            <GlassCard delay={0.25} hover={false}>
              <div style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <h3 className="text-heading" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BarChart3 size={14} style={{ color: '#06B6D4' }} /> Token Usage
                  </h3>
                  <span className="text-heading">{tokenUsage.percentage}%</span>
                </div>
                <div className="macos-progress" style={{ marginBottom: '10px' }}>
                  <div className="macos-progress-fill" style={{ width: `${tokenUsage.percentage}%` }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-caption">{(tokenUsage.used / 1000).toFixed(0)}k used</span>
                  <span className="text-caption">{(tokenUsage.limit / 1000).toFixed(0)}k limit</span>
                </div>
              </div>
            </GlassCard>

            {/* Heartbeat */}
            <GlassCard delay={0.3} hover={false}>
              <div style={{ padding: '24px' }}>
                <h3 className="text-heading" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Heart size={14} style={{ color: '#FF453A' }} /> Heartbeat
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', textAlign: 'center' }}>
                  <div>
                    <p className="text-label" style={{ marginBottom: '6px' }}>Last</p>
                    <p className="text-body">{heartbeat.lastHeartbeat ? timeAgo(new Date(heartbeat.lastHeartbeat * 1000).toISOString()) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-label" style={{ marginBottom: '6px' }}>Next</p>
                    <p className="text-body" style={{ fontFamily: 'monospace', color: '#007AFF' }}>{countdown || '—'}</p>
                  </div>
                  <div>
                    <p className="text-label" style={{ marginBottom: '6px' }}>Interval</p>
                    <p className="text-body">{agent.heartbeatInterval}</p>
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Right Column - Activity Feed */}
          <GlassCard delay={0.2} hover={false}>
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '560px' }}>
              <h3 className="text-heading" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={14} style={{ color: '#FFD60A' }} /> Recent Activity
              </h3>
              <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {recentActivity.map((a: any, i: number) => {
                    const Icon = activityIcons[a.type] || Activity
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon size={13} style={{ color: 'rgba(255,255,255,0.5)' }} strokeWidth={2} />
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p className="text-body" style={{ fontWeight: 500 }}>{a.action}</p>
                          <p className="text-caption" style={{ marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{a.detail}</p>
                        </div>
                        <span className="text-caption" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{timeAgo(a.time)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </PageTransition>
  )
}
