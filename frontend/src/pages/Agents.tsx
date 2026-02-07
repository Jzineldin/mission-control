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
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </PageTransition>
    )
  }

  const { agents, conversations } = data
  const selected = agents.find((a: any) => a.id === selectedAgent)

  return (
    <PageTransition>
      <div style={{ maxWidth: "1280px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "28px" }}>
        {/* Header */}
        <div>
          <h1 style={{ color: 'rgba(255,255,255,0.92)' }} className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Bot size={24} className="text-violet-300/60" strokeWidth={1.5} />
            Agent Hub
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.45)' }} className="text-sm mt-1">Multi-agent orchestration & communication</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "24px" }}>
          {/* Agent Grid */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
              {agents.map((agent: any, i: number) => (
                <motion.div
                  key={agent.id}
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: i * 0.06 }}
                  whileHover={{ y: -3, scale: 1.01 }}
                  onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
                  className={`liquid-glass cursor-pointer transition-all duration-300 ${
                    selectedAgent === agent.id
                      ? '!border-purple-400/40 !bg-purple-500/[0.08]'
                      : ''
                  }`}
                  style={{ borderRadius: '20px', padding: 20 }}
                >
                  <div className="relative z-10">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center text-xl shadow-inner">
                        {agent.avatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 style={{ color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="text-sm font-semibold">{agent.name}</h3>
                          <StatusBadge status={agent.status} pulse={agent.status === 'active'} />
                        </div>
                        <p style={{ color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="text-[11px]">{agent.role} · {agent.model}</p>
                      </div>
                    </div>
                    <p style={{ color: 'rgba(255,255,255,0.45)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} className="text-xs mb-4">{agent.description}</p>
                    <div style={{ color: 'rgba(255,255,255,0.45)' }} className="flex items-center gap-4 text-[11px]">
                      <span className="flex items-center gap-1">
                        <BarChart3 size={11} className="text-white/40" /> {agent.tasksCompleted} tasks
                      </span>
                      <span className="flex items-center gap-1">
                        <Activity size={11} className="text-white/40" /> {agent.uptime} uptime
                      </span>
                      <span className="ml-auto">
                        {timeAgo(agent.lastActive)}
                      </span>
                    </div>
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
                  className="overflow-hidden"
                >
                  <GlassCard hover={false} noPad>
                    <div style={{ padding: 24 }}>
                      <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center text-2xl">
                            {selected.avatar}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <h3 style={{ color: 'rgba(255,255,255,0.92)' }} className="text-base font-bold">{selected.name}</h3>
                            <p style={{ color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="text-xs">{selected.description}</p>
                          </div>
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => setSelectedAgent(null)}
                          className="macos-button p-2"
                        >
                          <X size={16} className="text-white/60" />
                        </motion.button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
                        {[
                          { label: 'Tasks Done', value: <AnimatedCounter end={selected.tasksCompleted} />, },
                          { label: 'Uptime', value: selected.uptime },
                          { label: 'Model', value: selected.model },
                          { label: 'Status', value: <StatusBadge status={selected.status} size="md" /> },
                        ].map((item, idx) => (
                          <div key={idx} className="text-center" style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <p style={{ color: 'rgba(255,255,255,0.92)' }} className="text-xl font-light">{item.value}</p>
                            <p style={{ color: 'rgba(255,255,255,0.45)' }} className="text-[10px] font-semibold mt-1 uppercase tracking-wider">{item.label}</p>
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
              <h3 style={{ color: 'rgba(255,255,255,0.65)' }} className="text-sm font-semibold mb-5 flex items-center gap-2">
                <MessageSquare size={14} className="text-indigo-300/60" /> Inter-Agent Chat
              </h3>
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                {conversations.map((msg: any, i: number) => {
                  const fromAgent = agents.find((a: any) => a.id === msg.from)
                  const isLeft = i % 2 === 0
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + i * 0.04 }}
                      className={`flex gap-2.5 ${isLeft ? '' : 'flex-row-reverse'}`}
                    >
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center text-xs shrink-0">
                        {fromAgent?.avatar || '🤖'}
                      </div>
                      <div className={`max-w-[80%] ${isLeft ? '' : 'text-right'}`}>
                        <div className={`flex items-center gap-1.5 mb-1 ${isLeft ? '' : 'justify-end'}`}>
                          <span style={{ color: 'rgba(255,255,255,0.65)' }} className="text-[10px] font-semibold">{fromAgent?.name || msg.from}</span>
                          <span style={{ color: 'rgba(255,255,255,0.45)' }} className="text-[10px]">→ {msg.to}</span>
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.65)' }} className={`px-3.5 py-2.5 text-xs ${
                          isLeft ? 'glass-bubble-left' : 'glass-bubble-right'
                        }`}>
                          {msg.message}
                        </div>
                        <span style={{ color: 'rgba(255,255,255,0.45)' }} className="text-[9px] mt-1 block">{timeAgo(msg.time)}</span>
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
