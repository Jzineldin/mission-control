import { useState } from 'react'
import { motion } from 'framer-motion'
import { Radar, SortDesc, Send, ExternalLink, X, Rocket, Shield, Code, Briefcase, GraduationCap, DollarSign } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import GlassCard from '../components/GlassCard'
import { useApi, timeAgo } from '../lib/hooks'

const scoreColor = (score: number) => {
  if (score >= 85) return '#32D74B'
  if (score >= 70) return '#007AFF'
  if (score >= 50) return '#FF9500'
  return '#8E8E93'
}

const FILTERS = [
  { id: 'all', label: 'All', icon: Radar },
  { id: 'openclaw', label: 'OpenClaw', icon: Code, match: (o: any) => o.category?.startsWith('openclaw') },
  { id: 'bounty', label: 'Bug Bounty', icon: Shield, match: (o: any) => o.category === 'bounty' },
  { id: 'freelance', label: 'Freelance', icon: Briefcase, match: (o: any) => ['freelance', 'twitter-jobs', 'linkedin-jobs', 'reddit-gigs', 'upwork'].includes(o.category) },
  { id: 'edtech', label: 'EdTech', icon: GraduationCap, match: (o: any) => o.category === 'edtech' },
  { id: 'funding', label: 'Grants', icon: DollarSign, match: (o: any) => ['funding', 'swedish-grants'].includes(o.category) },
]

export default function Scout() {
  const { data, loading } = useApi<any>('/api/scout', 60000)
  const [sortBy, setSortBy] = useState<'score' | 'date'>('score')
  const [filter, setFilter] = useState('all')

  if (loading || !data) {
    return (
      <PageTransition>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
          <div style={{ width: 32, height: 32, border: '2px solid #007AFF', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
      </PageTransition>
    )
  }

  const activeFilter = FILTERS.find(f => f.id === filter)
  const allOpportunities = [...(data.opportunities || [])].sort((a: any, b: any) => {
    if (sortBy === 'score') return b.score - a.score
    return new Date(b.found).getTime() - new Date(a.found).getTime()
  })
  const opportunities = filter === 'all' ? allOpportunities : allOpportunities.filter(activeFilter?.match || (() => true))

  // Count per filter
  const counts: Record<string, number> = {}
  for (const f of FILTERS) {
    counts[f.id] = f.id === 'all' ? allOpportunities.length : allOpportunities.filter(f.match || (() => true)).length
  }

  const handleDeploy = async (oppId: string) => {
    try {
      await fetch('/api/scout/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId: oppId }),
      })
      window.location.reload()
    } catch {}
  }

  const handleDismiss = async (oppId: string) => {
    try {
      await fetch('/api/scout/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId: oppId }),
      })
      window.location.reload()
    } catch {}
  }

  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Radar size={22} style={{ color: '#BF5AF2' }} /> Scout
            </h1>
            <p className="text-body" style={{ marginTop: 4 }}>
              AI-powered opportunity scanner · Last scan: {data.lastScan ? timeAgo(data.lastScan) : 'never'}
            </p>
          </div>
          <button
            onClick={() => setSortBy(sortBy === 'score' ? 'date' : 'score')}
            className="macos-button"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12 }}
          >
            <SortDesc size={13} />
            {sortBy === 'score' ? 'By Score' : 'By Date'}
          </button>
        </div>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                borderRadius: 10,
                border: filter === f.id ? '1px solid rgba(0,122,255,0.4)' : '1px solid rgba(255,255,255,0.08)',
                background: filter === f.id ? 'rgba(0,122,255,0.15)' : 'rgba(255,255,255,0.04)',
                color: filter === f.id ? '#fff' : 'rgba(255,255,255,0.55)',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <f.icon size={14} />
              {f.label}
              <span style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 6,
                background: filter === f.id ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)',
                color: filter === f.id ? '#fff' : 'rgba(255,255,255,0.4)',
              }}>
                {counts[f.id]}
              </span>
            </button>
          ))}
        </div>

        {/* Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[
            { label: 'Showing', value: opportunities.length, color: '#fff' },
            { label: 'High Score (85+)', value: opportunities.filter((o: any) => o.score >= 85).length, color: '#32D74B' },
            { label: 'Deployed', value: opportunities.filter((o: any) => o.status === 'deployed').length, color: '#007AFF' },
            { label: 'Avg Score', value: opportunities.length ? Math.round(opportunities.reduce((a: number, o: any) => a + o.score, 0) / opportunities.length) : 0, color: '#FF9500' },
          ].map((s, i) => (
            <GlassCard key={s.label} delay={0.05 + i * 0.03} noPad>
              <div style={{ padding: '16px 20px' }}>
                <p className="text-label" style={{ marginBottom: 8 }}>{s.label}</p>
                <p style={{ fontSize: 22, fontWeight: 300, color: s.color }}>{s.value}</p>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Opportunity List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {opportunities.length === 0 ? (
            <div className="macos-panel" style={{ padding: 40, textAlign: 'center' }}>
              <p className="text-body">No opportunities in this category yet.</p>
            </div>
          ) : (
            opportunities.map((opp: any, i: number) => (
              <motion.div
                key={opp.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.03 }}
                className="macos-panel"
                style={{
                  padding: '18px 22px',
                  opacity: opp.status === 'dismissed' ? 0.4 : 1,
                  cursor: 'pointer',
                }}
                onClick={() => opp.url && window.open(opp.url, '_blank')}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                  {/* Score */}
                  <div style={{
                    width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `${scoreColor(opp.score)}20`,
                    border: `1px solid ${scoreColor(opp.score)}40`,
                  }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: scoreColor(opp.score) }}>{opp.score}</span>
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {opp.title}
                      </h3>
                      <span className="macos-badge" style={{ fontSize: 10, flexShrink: 0 }}>{opp.status}</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: 8 }}>
                      {opp.summary}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="macos-badge" style={{ fontSize: 10 }}>{opp.source}</span>
                      <span className="macos-badge" style={{ fontSize: 10 }}>{opp.category}</span>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{timeAgo(opp.found)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    {opp.status === 'new' && (
                      <>
                        <button
                          onClick={() => handleDeploy(opp.id)}
                          className="macos-button-primary"
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: 11, borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: '#007AFF' }}
                        >
                          <Rocket size={12} /> Deploy
                        </button>
                        <button
                          onClick={() => handleDismiss(opp.id)}
                          className="macos-button"
                          style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', borderRadius: 8, fontSize: 11, cursor: 'pointer' }}
                        >
                          <X size={12} />
                        </button>
                      </>
                    )}
                    {opp.status === 'deployed' && (
                      <span style={{ fontSize: 10, color: '#32D74B', fontWeight: 600 }}>✓ In Workshop</span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </PageTransition>
  )
}
