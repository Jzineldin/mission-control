import { useState } from 'react'
import { motion } from 'framer-motion'
import { Radar, SortDesc, X, Rocket, Shield, Code, Briefcase, GraduationCap, DollarSign, Search } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import { useIsMobile } from '../lib/useIsMobile'
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
  { id: 'bounty', label: 'Bounty', icon: Shield, match: (o: any) => o.category === 'bounty' },
  { id: 'freelance', label: 'Freelance', icon: Briefcase, match: (o: any) => ['freelance', 'twitter-jobs', 'linkedin-jobs', 'reddit-gigs', 'upwork'].includes(o.category) },
  { id: 'edtech', label: 'EdTech', icon: GraduationCap, match: (o: any) => o.category === 'edtech' },
  { id: 'funding', label: 'Grants', icon: DollarSign, match: (o: any) => ['funding', 'swedish-grants'].includes(o.category) },
]

export default function Scout() {
  const m = useIsMobile()
  const { data, loading } = useApi<any>('/api/scout', 60000)
  const [sortBy, setSortBy] = useState<'score' | 'date'>('score')
  const [filter, setFilter] = useState('all')
  const [scanning, setScanning] = useState(false)

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

  const counts: Record<string, number> = {}
  for (const f of FILTERS) {
    counts[f.id] = f.id === 'all' ? allOpportunities.length : allOpportunities.filter(f.match || (() => true)).length
  }

  const handleDeploy = async (oppId: string) => {
    try {
      await fetch('/api/scout/deploy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ opportunityId: oppId }) })
      window.location.reload()
    } catch {}
  }

  const handleDismiss = async (oppId: string) => {
    try {
      await fetch('/api/scout/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ opportunityId: oppId }) })
      window.location.reload()
    } catch {}
  }

  const handleRunScan = async () => {
    try {
      setScanning(true)
      const response = await fetch('/api/scout/scan', { method: 'POST' })
      const result = await response.json()
      
      if (result.status === 'scanning') {
        // Poll for completion
        const checkStatus = async () => {
          try {
            const statusResponse = await fetch('/api/scout/status')
            const status = await statusResponse.json()
            
            if (!status.scanning) {
              setScanning(false)
              window.location.reload() // Reload to show new results
            } else {
              setTimeout(checkStatus, 3000) // Check again in 3 seconds
            }
          } catch {
            setScanning(false)
          }
        }
        setTimeout(checkStatus, 3000)
      } else {
        setScanning(false)
      }
    } catch {
      setScanning(false)
    }
  }

  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: m ? 12 : 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Radar size={m ? 18 : 22} style={{ color: '#BF5AF2' }} /> Scout
            </h1>
            <p className="text-body" style={{ marginTop: 4, fontSize: m ? 11 : 13 }}>
              Find opportunities across the web — skills, jobs, grants & more
            </p>
            <p className="text-body" style={{ marginTop: 2, fontSize: m ? 10 : 12, opacity: 0.6 }}>
              Last scan: {data?.lastScan ? timeAgo(data.lastScan) : 'never'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handleRunScan}
              disabled={scanning}
              className="macos-button"
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 6, 
                padding: '8px 14px', 
                fontSize: 12,
                backgroundColor: scanning ? 'rgba(255,255,255,0.05)' : 'rgba(0,122,255,0.15)',
                borderColor: scanning ? 'rgba(255,255,255,0.1)' : 'rgba(0,122,255,0.4)',
                color: scanning ? 'rgba(255,255,255,0.5)' : '#007AFF',
                cursor: scanning ? 'not-allowed' : 'pointer'
              }}
            >
              <Search size={13} style={{ 
                animation: scanning ? 'spin 1s linear infinite' : 'none' 
              }} />
              {scanning ? 'Scanning...' : 'Run Scan'}
            </button>
            <button
              onClick={() => setSortBy(sortBy === 'score' ? 'date' : 'score')}
              className="macos-button"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12 }}
            >
              <SortDesc size={13} />
              {sortBy === 'score' ? 'Score' : 'Date'}
            </button>
          </div>
        </div>

        {/* Filter Tabs — horizontal scroll on mobile */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 4, msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: m ? '7px 12px' : '8px 16px',
                borderRadius: 10, flexShrink: 0,
                border: filter === f.id ? '1px solid rgba(0,122,255,0.4)' : '1px solid rgba(255,255,255,0.08)',
                background: filter === f.id ? 'rgba(0,122,255,0.15)' : 'rgba(255,255,255,0.04)',
                color: filter === f.id ? '#fff' : 'rgba(255,255,255,0.55)',
                fontSize: m ? 11 : 12, fontWeight: 500, cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <f.icon size={m ? 12 : 14} />
              {f.label}
              <span style={{
                fontSize: 10, padding: '1px 5px', borderRadius: 6,
                background: filter === f.id ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)',
                color: filter === f.id ? '#fff' : 'rgba(255,255,255,0.4)',
              }}>
                {counts[f.id]}
              </span>
            </button>
          ))}
        </div>

        {/* Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: m ? 8 : 16 }}>
          {[
            { label: 'Showing', value: opportunities.length, color: '#fff' },
            { label: 'High (85+)', value: opportunities.filter((o: any) => o.score >= 85).length, color: '#32D74B' },
            { label: 'Deployed', value: opportunities.filter((o: any) => o.status === 'deployed').length, color: '#007AFF' },
            { label: 'Avg Score', value: opportunities.length ? Math.round(opportunities.reduce((a: number, o: any) => a + o.score, 0) / opportunities.length) : 0, color: '#FF9500' },
          ].map((s, i) => (
            <GlassCard key={s.label} delay={0.05 + i * 0.03} noPad>
              <div style={{ padding: m ? '10px 12px' : '16px 20px' }}>
                <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</p>
                <p style={{ fontSize: m ? 18 : 22, fontWeight: 300, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Opportunity List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {opportunities.length === 0 ? (
            <div className="macos-panel" style={{ padding: 32, textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>No opportunities in this category.</p>
            </div>
          ) : (
            opportunities.map((opp: any, i: number) => (
              <motion.div
                key={opp.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + i * 0.02 }}
                className="macos-panel"
                style={{ padding: m ? 14 : '18px 22px', opacity: opp.status === 'dismissed' ? 0.4 : 1, cursor: 'pointer' }}
                onClick={() => opp.url && window.open(opp.url, '_blank')}
              >
                {/* Mobile: vertical layout */}
                {m ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      {/* Score badge */}
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: `${scoreColor(opp.score)}20`, border: `1px solid ${scoreColor(opp.score)}40`,
                      }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: scoreColor(opp.score) }}>{opp.score}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {opp.title}
                        </h3>
                        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          <span className="macos-badge" style={{ fontSize: 10 }}>{opp.source}</span>
                          <span className="macos-badge" style={{ fontSize: 10 }}>{opp.category}</span>
                        </div>
                      </div>
                    </div>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.4, marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {opp.summary}
                    </p>
                    {/* Actions — full width on mobile */}
                    {opp.status === 'new' && (
                      <div style={{ display: 'flex', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleDeploy(opp.id)}
                          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: '#007AFF', fontSize: 12, fontWeight: 600 }}
                        >
                          <Rocket size={13} /> Deploy
                        </button>
                        <button
                          onClick={() => handleDismiss(opp.id)}
                          style={{ width: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                    {opp.status === 'deployed' && (
                      <span style={{ fontSize: 11, color: '#32D74B', fontWeight: 600 }}>✓ In Workshop</span>
                    )}
                  </div>
                ) : (
                  /* Desktop: horizontal layout */
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `${scoreColor(opp.score)}20`, border: `1px solid ${scoreColor(opp.score)}40`,
                    }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: scoreColor(opp.score) }}>{opp.score}</span>
                    </div>
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
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      {opp.status === 'new' && (
                        <>
                          <button onClick={() => handleDeploy(opp.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: '#007AFF', fontSize: 11 }}>
                            <Rocket size={12} /> Deploy
                          </button>
                          <button onClick={() => handleDismiss(opp.id)} className="macos-button" style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', borderRadius: 8, fontSize: 11, cursor: 'pointer' }}>
                            <X size={12} />
                          </button>
                        </>
                      )}
                      {opp.status === 'deployed' && <span style={{ fontSize: 10, color: '#32D74B', fontWeight: 600 }}>✓ In Workshop</span>}
                    </div>
                  </div>
                )}
              </motion.div>
            ))
          )}
        </div>
      </div>
    </PageTransition>
  )
}
