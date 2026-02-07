import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, X, MessageSquare, Activity, BarChart3 } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import GlassCard from '../components/GlassCard'
import StatusBadge from '../components/StatusBadge'
import AnimatedCounter from '../components/AnimatedCounter'
import { useApi, timeAgo } from '../lib/hooks'

export default function Agents() {
  const { data, loading } = useApi<any>('/api/agents', 30000)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)

  if (loading || !data) {
    return (
      <PageTransition>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
          <div style={{ width: 32, height: 32, border: '2px solid #BF5AF2', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
      </PageTransition>
    )
  }

  const { agents, conversations } = data
  const selected = agents.find((a: any) => a.id === selectedAgent)

  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* Header */}
        <div>
          <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Bot size={22} style={{ color: '#BF5AF2' }} /> Agent Hub
          </h1>
          <p className="text-body" style={{ marginTop: 4 }}>Multi-agent orchestration & communication</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
          {/* Agent Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              {agents.map((agent: any, i: number) => (
                <motion.div
                  key={agent.id}
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: i * 0.06 }}
                  whileHover={{ y: -3, scale: 1.01 }}
                  onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
                  className="macos-panel"
                  style={{
                    borderRadius: 16, padding: 20, cursor: 'pointer',
                    borderColor: selectedAgent === agent.id ? 'rgba(191,90,242,0.4)' : undefined,
                    background: selectedAgent === agent.id ? 'rgba(191,90,242,0.08)' : undefined,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                      {agent.avatar}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</h3>
                        <StatusBadge status={agent.status} pulse={agent.status === 'active'} />
                      </div>
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.role} · {agent.model}</p>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 16, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>{agent.description}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <BarChart3 size={11} style={{ color: 'rgba(255,255,255,0.4)' }} /> {((agent.totalTokens || 0) / 1000).toFixed(0)}k tokens
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Activity size={11} style={{ color: 'rgba(255,255,255,0.4)' }} /> {agent.lastActive ? timeAgo(agent.lastActive) : 'n/a'}
                    </span>
                    <span style={{ marginLeft: 'auto' }}>
                      {agent.role}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Detail Panel */}
            <AnimatePresence>
              {selected && (
                <motion.div
                  initial={{ opacity: 0, height: 0, scale: 0.98 }}
                  animate={{ opacity: 1, height: 'auto', scale: 1 }}
                  exit={{ opacity: 0, height: 0, scale: 0.98 }}
                  transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <GlassCard hover={false} noPad>
                    <div style={{ padding: 24 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
                            {selected.avatar}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>{selected.name}</h3>
                            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.description}</p>
                          </div>
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          className="macos-button"
                          style={{ padding: 8 }}
                          onClick={() => setSelectedAgent(null)}
                        >
                          <X size={16} style={{ color: 'rgba(255,255,255,0.6)' }} />
                        </motion.button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                        {[
                          { label: 'Tokens', value: <><AnimatedCounter end={Math.round((selected.totalTokens || 0) / 1000)} /><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>k</span></> },
                          { label: 'Last Active', value: selected.lastActive ? timeAgo(selected.lastActive) : '—' },
                          { label: 'Model', value: selected.model },
                          { label: 'Status', value: <StatusBadge status={selected.status} size="md" /> },
                        ].map((item, idx) => (
                          <div key={idx} style={{ textAlign: 'center', padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <p style={{ fontSize: 20, fontWeight: 300, color: 'rgba(255,255,255,0.92)' }}>{item.value}</p>
                            <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{item.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Chat Feed */}
          <GlassCard delay={0.15} hover={false} noPad>
            <div style={{ padding: 24 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.65)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <MessageSquare size={14} style={{ color: '#BF5AF2' }} /> Inter-Agent Chat
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 520, overflowY: 'auto', paddingRight: 4 }}>
                {conversations.map((msg: any, i: number) => {
                  const fromAgent = agents.find((a: any) => a.id === msg.from)
                  const isLeft = i % 2 === 0
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + i * 0.04 }}
                      style={{ display: 'flex', gap: 10, flexDirection: isLeft ? 'row' : 'row-reverse' }}
                    >
                      <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>
                        {fromAgent?.avatar || '🤖'}
                      </div>
                      <div style={{ maxWidth: '80%', textAlign: isLeft ? 'left' : 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, justifyContent: isLeft ? 'flex-start' : 'flex-end' }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.65)' }}>{fromAgent?.name || msg.from}</span>
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>→ {msg.to}</span>
                        </div>
                        <div style={{
                          padding: '10px 14px', fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5,
                          borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                        }}>
                          {msg.message}
                        </div>
                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 4, display: 'block' }}>{timeAgo(msg.time)}</span>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </PageTransition>
  )
}
