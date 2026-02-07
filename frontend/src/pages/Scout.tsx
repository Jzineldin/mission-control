import { useState } from 'react'
import { motion } from 'framer-motion'
import { Radar, SortDesc, Send, ExternalLink } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import GlassCard from '../components/GlassCard'
import { useApi, timeAgo } from '../lib/hooks'

const scoreColor = (score: number) => {
  if (score >= 85) return { bg: 'bg-emerald-400/15', text: 'text-emerald-300', border: 'border-emerald-400/25', glow: 'shadow-[0_0_12px_rgba(52,211,153,0.15)]' }
  if (score >= 70) return { bg: 'bg-blue-400/15', text: 'text-blue-300', border: 'border-blue-400/25', glow: 'shadow-[0_0_12px_rgba(96,165,250,0.15)]' }
  if (score >= 50) return { bg: 'bg-amber-400/15', text: 'text-amber-300', border: 'border-amber-400/25', glow: '' }
  return { bg: 'bg-white/10', text: 'text-white/50', border: 'border-white/15', glow: '' }
}

const statusStyles: Record<string, string> = {
  new: 'bg-blue-400/15 text-blue-300 border-blue-400/20',
  reviewed: 'bg-amber-400/15 text-amber-300 border-amber-400/20',
  deployed: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/20',
}

export default function Scout() {
  const { data, loading } = useApi<any>('/api/scout', 60000)
  const [sortBy, setSortBy] = useState<'score' | 'date'>('score')

  if (loading || !data) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </PageTransition>
    )
  }

  const opportunities = [...data.opportunities].sort((a: any, b: any) => {
    if (sortBy === 'score') return b.score - a.score
    return new Date(b.found).getTime() - new Date(a.found).getTime()
  })

  return (
    <PageTransition>
      <div style={{ maxWidth: "1280px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "28px" }}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 style={{ color: 'rgba(255,255,255,0.92)' }} className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Radar size={24} className="text-cyan-300/60" strokeWidth={1.5} />
              Twitter Scout
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.45)' }} className="text-sm mt-1">Business opportunities discovered by AI</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.03, y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setSortBy(sortBy === 'score' ? 'date' : 'score')}
            className="macos-button flex items-center gap-2 px-4 py-2 text-xs font-medium"
          >
            <SortDesc size={13} />
            {sortBy === 'score' ? 'By Score' : 'By Date'}
          </motion.button>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
          <GlassCard delay={0.05} noPad>
            <div style={{ padding: 20 }}>
              <p style={{ color: 'rgba(255,255,255,0.45)' }} className="text-[10px] font-semibold uppercase tracking-wider mb-2">Total Found</p>
              <p style={{ color: 'rgba(255,255,255,0.92)' }} className="text-2xl font-light">{opportunities.length}</p>
            </div>
          </GlassCard>
          <GlassCard delay={0.1} noPad>
            <div style={{ padding: 20 }}>
              <p style={{ color: 'rgba(255,255,255,0.45)' }} className="text-[10px] font-semibold uppercase tracking-wider mb-2">High Score (85+)</p>
              <p className="text-2xl font-light text-emerald-300">
                {opportunities.filter((o: any) => o.score >= 85).length}
              </p>
            </div>
          </GlassCard>
          <GlassCard delay={0.15} noPad>
            <div style={{ padding: 20 }}>
              <p style={{ color: 'rgba(255,255,255,0.45)' }} className="text-[10px] font-semibold uppercase tracking-wider mb-2">Deployed</p>
              <p className="text-2xl font-light text-blue-300">
                {opportunities.filter((o: any) => o.status === 'deployed').length}
              </p>
            </div>
          </GlassCard>
        </div>

        {/* Opportunity List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {opportunities.map((opp: any, i: number) => {
            const sc = scoreColor(opp.score)
            return (
              <motion.div
                key={opp.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.04 }}
                whileHover={{ x: 4, scale: 1.005 }}
                className="liquid-glass cursor-pointer group"
                style={{ borderRadius: '20px', padding: 20 }}
              >
                <div className="relative z-10 flex items-start gap-4">
                  {/* Score Badge */}
                  <div className={`shrink-0 w-14 h-14 rounded-2xl ${sc.bg} border ${sc.border} ${sc.glow} flex items-center justify-center`}>
                    <span className={`text-xl font-bold ${sc.text}`}>{opp.score}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <h3 style={{ color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="text-sm font-semibold">{opp.title}</h3>
                      <span className={`pill-badge text-[10px] px-2 py-0.5 font-semibold border ${statusStyles[opp.status] || statusStyles.new}`} style={{ flexShrink: 0 }}>
                        {opp.status}
                      </span>
                    </div>
                    <p style={{ color: 'rgba(255,255,255,0.45)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} className="text-xs mb-3">{opp.summary}</p>
                    <div className="flex items-center gap-4">
                      <div className="flex gap-1.5" style={{ overflow: 'hidden' }}>
                        {opp.tags.map((tag: string) => (
                          <span key={tag} style={{ color: 'rgba(255,255,255,0.45)', flexShrink: 0 }} className="pill-badge text-[10px] px-2 py-0.5 font-medium">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <span style={{ color: 'rgba(255,255,255,0.45)' }} className="text-[10px]">{opp.source}</span>
                      <span style={{ color: 'rgba(255,255,255,0.45)' }} className="text-[10px]">{timeAgo(opp.found)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="shrink-0 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="macos-button macos-button-primary flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
                    >
                      <Send size={11} /> Deploy
                    </motion.button>
                    <button className="macos-button p-1.5">
                      <ExternalLink size={13} className="text-white/60" />
                    </button>
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
