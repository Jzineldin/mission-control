import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Radar, SortDesc, X, Rocket, Shield, Code, Briefcase, GraduationCap, DollarSign, Search, Settings2, HelpCircle, Info, Plus, Trash2, Save } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import { useIsMobile } from '../lib/useIsMobile'
import GlassCard from '../components/GlassCard'
import { useApi, timeAgo } from '../lib/hooks'
import { addNotification } from '../components/NotificationSystem'
import SwipeableCard from '../components/SwipeableCard'

const scoreColor = (score: number) => {
  if (score >= 85) return '#32D74B'
  if (score >= 70) return '#007AFF'
  if (score >= 50) return '#FF9500'
  return '#8E8E93'
}

const getFreshnessInfo = (foundDate: string) => {
  const now = new Date()
  const found = new Date(foundDate)
  const hours = (now.getTime() - found.getTime()) / (1000 * 60 * 60)
  
  if (hours < 4) {
    return { badge: '🟢 Fresh', color: '#32D74B' }
  } else if (hours > 24) {
    const days = Math.floor(hours / 24)
    return { badge: `🕐 ${days}d old`, color: 'rgba(255,255,255,0.3)' }
  }
  return null
}

const getNextScanTime = (cronJobs: any[]) => {
  const scoutJob = cronJobs?.find(job => 
    job.name?.toLowerCase().includes('scout') || 
    job.description?.toLowerCase().includes('scout')
  )
  
  if (scoutJob?.nextRun) {
    const nextRun = new Date(scoutJob.nextRun)
    const now = new Date()
    const hours = Math.ceil((nextRun.getTime() - now.getTime()) / (1000 * 60 * 60))
    
    if (hours < 1) return 'Next scan: soon'
    if (hours < 24) return `Next scan: in ${hours}h`
    if (scoutJob.schedule?.includes('daily')) return 'Next scan: daily at 12:00 UTC'
    return 'Next scan: scheduled'
  }
  return null
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
  const { data, loading, refetch } = useApi<any>('/api/scout', 60000)
  const { data: cronData } = useApi<any>('/api/cron', 30000)
  const { data: scoutConfig } = useApi<any>('/api/scout/config', 0) // Load once
  const [sortBy, setSortBy] = useState<'score' | 'date'>('score')
  const [filter, setFilter] = useState('all')
  const [scanning, setScanning] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [showScoring, setShowScoring] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [editQueries, setEditQueries] = useState<Array<{ q: string; category: string; source: string; weight: number }>>([])
  const [savingConfig, setSavingConfig] = useState(false)

  // Keyboard shortcuts for Scout power users — must be before early return
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) return
      if (!data?.opportunities) return
      
      const newOpps = data.opportunities.filter((o: any) => o.status !== 'dismissed' && o.status !== 'deployed')
      if (newOpps.length === 0) return

      if (e.key === 'd' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault()
        // Inline deploy — can't reference handleDeploy since it's after early return
        fetch('/api/scout/deploy', { 
          method: 'POST', headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ opportunityId: newOpps[0].id }) 
        }).then(() => refetch())
      }
      if (e.key === 'D' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        fetch('/api/scout/deploy', { 
          method: 'POST', headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ opportunityId: newOpps[0].id, executeImmediately: true }) 
        }).then(() => refetch())
      }
      if (e.key === 'x' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        fetch('/api/scout/dismiss', { 
          method: 'POST', headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ opportunityId: newOpps[0].id }) 
        }).then(() => refetch())
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [data, refetch])

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

  const handleDeploy = async (oppId: string, executeImmediately = false) => {
    try {
      const opp = opportunities.find((o: any) => o.id === oppId)
      await fetch('/api/scout/deploy', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ opportunityId: oppId, executeImmediately }) 
      })
      refetch()
      
      if (executeImmediately) {
        addNotification({
          type: 'success',
          title: 'Deploying & executing!',
          message: `"${opp?.title || 'Opportunity'}" moved to Workshop and sub-agent started research`,
          duration: 8000
        })
      } else {
        addNotification({
          type: 'success',
          title: 'Opportunity deployed!',
          message: `"${opp?.title || 'Opportunity'}" moved to Workshop with AI-generated action plan`
        })
      }
    } catch (error) {
      addNotification({
        type: 'error', 
        title: 'Deploy failed',
        message: 'Could not deploy opportunity to Workshop'
      })
    }
  }

  const handleDismiss = async (oppId: string) => {
    try {
      await fetch('/api/scout/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ opportunityId: oppId }) })
      refetch()
    } catch {}
  }

  const handleRunScan = async () => {
    try {
      setScanning(true)
      setToast(null)
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
              setToast('✅ Scan completed! Results refreshed.')
              setTimeout(() => setToast(null), 4000)
              refetch() // Refetch to show new results
            } else {
              setTimeout(checkStatus, 3000) // Check again in 3 seconds
            }
          } catch {
            setScanning(false)
            setToast('❌ Scan status check failed')
            setTimeout(() => setToast(null), 4000)
          }
        }
        setTimeout(checkStatus, 3000)
      } else {
        setScanning(false)
      }
    } catch {
      setScanning(false)
      setToast('❌ Failed to start scan')
      setTimeout(() => setToast(null), 4000)
    }
  }

  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: m ? 12 : 24 }}>
        {/* Toast notification */}
        {toast && (
          <div style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '12px 16px',
            borderRadius: '8px',
            background: toast.startsWith('✅') ? 'rgba(50,215,75,0.9)' : 'rgba(255,69,58,0.9)',
            backdropFilter: 'blur(10px)',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '500',
            zIndex: 1000,
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)'
          }}>
            {toast}
          </div>
        )}

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Radar size={m ? 18 : 22} style={{ color: '#BF5AF2' }} /> Scout
            </h1>
            <p className="text-body" style={{ marginTop: 4, fontSize: m ? 11 : 13 }}>
              Find opportunities across the web — skills, jobs, grants & more • Press <code>d</code> to deploy, <code>D</code> to deploy & execute, <code>x</code> to dismiss
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 2, fontSize: m ? 10 : 12, opacity: 0.6 }}>
              <span>Last scan: {data?.lastScan ? timeAgo(data.lastScan) : 'never'}</span>
              {scoutConfig?.queryCount > 0 && (
                <>
                  <span style={{ color: 'rgba(255,255,255,0.25)' }}>•</span>
                  <span>{scoutConfig.queryCount} queries configured</span>
                </>
              )}
              {cronData?.jobs && getNextScanTime(cronData.jobs) && (
                <>
                  <span style={{ color: 'rgba(255,255,255,0.25)' }}>•</span>
                  <span>{getNextScanTime(cronData.jobs)}</span>
                </>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => {
                if (!showConfig) {
                  // Load queries from config
                  setEditQueries(scoutConfig?.queries || [])
                }
                setShowConfig(!showConfig)
                setShowScoring(false)
              }}
              className="macos-button"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12, color: showConfig ? '#007AFF' : 'rgba(255,255,255,0.6)' }}
              title="Configure search queries"
            >
              <Settings2 size={13} />
              {!m && 'Configure'}
            </button>
            <button
              onClick={() => { setShowScoring(!showScoring); setShowConfig(false) }}
              className="macos-button"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12, color: showScoring ? '#007AFF' : 'rgba(255,255,255,0.6)' }}
              title="How scoring works"
            >
              <Info size={13} />
              {!m && 'Scoring'}
            </button>
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

        {/* Scoring Explanation Panel */}
        {showScoring && scoutConfig?.scoring && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="macos-panel"
            style={{ padding: m ? 14 : 20, overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Info size={16} style={{ color: '#007AFF' }} />
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>How Scoring Works</h3>
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, marginBottom: 12 }}>
              {scoutConfig.scoring.explanation}
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#32D74B' }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>85+ Excellent</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#007AFF' }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>70-84 Good</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF9500' }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>50-69 Fair</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#8E8E93' }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>&lt;50 Low</span>
              </div>
            </div>
            {scoutConfig.queryCount > 0 && (
              <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                  📊 {scoutConfig.queryCount} search queries across {Object.values(scoutConfig.templateStats || {}).filter(v => v > 0).length} categories
                  {scoutConfig.hasApiKey ? ' • Brave Search API connected' : ' • ⚠️ No API key configured'}
                </span>
              </div>
            )}
          </motion.div>
        )}

        {/* Configuration Panel */}
        <AnimatePresence>
          {showConfig && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="macos-panel"
              style={{ padding: m ? 14 : 20, overflow: 'hidden' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Settings2 size={16} style={{ color: '#007AFF' }} />
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>Scout Configuration</h3>
                </div>
                <button
                  onClick={async () => {
                    setSavingConfig(true)
                    try {
                      await fetch('/api/scout/config', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ queries: editQueries })
                      })
                      setToast('✅ Configuration saved!')
                      setTimeout(() => setToast(null), 3000)
                      refetch()
                    } catch {
                      setToast('❌ Failed to save configuration')
                      setTimeout(() => setToast(null), 3000)
                    } finally {
                      setSavingConfig(false)
                    }
                  }}
                  disabled={savingConfig}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: 'none',
                    background: savingConfig ? 'rgba(0,122,255,0.5)' : '#007AFF',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: savingConfig ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Save size={12} />
                  {savingConfig ? 'Saving...' : 'Save'}
                </button>
              </div>

              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
                  Manage your search queries. Each query searches across the web and gets scored based on keywords, freshness, and source credibility.
                </p>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
                    Search Queries ({editQueries.length})
                  </span>
                  <button
                    onClick={() => {
                      setEditQueries([...editQueries, { q: '', category: 'custom', source: 'web', weight: 1.0 }])
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 8px',
                      borderRadius: 4,
                      border: '1px solid rgba(0,122,255,0.3)',
                      background: 'rgba(0,122,255,0.1)',
                      color: '#007AFF',
                      fontSize: 11,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    <Plus size={10} />
                    Add Query
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                  {editQueries.map((query, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <input
                        type="text"
                        value={query.q}
                        onChange={(e) => {
                          const newQueries = [...editQueries]
                          newQueries[i].q = e.target.value
                          setEditQueries(newQueries)
                        }}
                        placeholder="Search query..."
                        style={{
                          flex: 1,
                          padding: '6px 8px',
                          borderRadius: 4,
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: 'rgba(0,0,0,0.2)',
                          color: 'rgba(255,255,255,0.9)',
                          fontSize: 11,
                          outline: 'none',
                        }}
                      />
                      <select
                        value={query.category}
                        onChange={(e) => {
                          const newQueries = [...editQueries]
                          newQueries[i].category = e.target.value
                          setEditQueries(newQueries)
                        }}
                        style={{
                          padding: '6px 8px',
                          borderRadius: 4,
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: 'rgba(0,0,0,0.2)',
                          color: 'rgba(255,255,255,0.9)',
                          fontSize: 11,
                          outline: 'none',
                          minWidth: 80,
                        }}
                      >
                        <option value="openclaw">OpenClaw</option>
                        <option value="freelance">Freelance</option>
                        <option value="bounty">Bounty</option>
                        <option value="edtech">EdTech</option>
                        <option value="grants">Grants</option>
                        <option value="custom">Custom</option>
                      </select>
                      <button
                        onClick={() => {
                          setEditQueries(editQueries.filter((_, idx) => idx !== i))
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 24,
                          height: 24,
                          borderRadius: 4,
                          border: '1px solid rgba(255,69,58,0.3)',
                          background: 'rgba(255,69,58,0.1)',
                          color: '#FF453A',
                          cursor: 'pointer',
                        }}
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {editQueries.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(255,255,255,0.45)' }}>
                  <p style={{ fontSize: 12, marginBottom: 8 }}>No search queries configured</p>
                  <p style={{ fontSize: 11 }}>Add queries to discover opportunities across the web</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

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
            <div className="macos-panel" style={{ 
              padding: m ? '48px 24px' : '64px 48px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16
            }}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'rgba(191,90,242,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Radar size={28} style={{ color: '#BF5AF2' }} />
              </div>
              <div>
                <h3 style={{
                  fontSize: m ? '16px' : '18px',
                  fontWeight: '600',
                  color: 'rgba(255,255,255,0.92)',
                  margin: '0 0 8px 0'
                }}>
                  No results yet
                </h3>
                <p style={{
                  fontSize: m ? '13px' : '15px',
                  color: 'rgba(255,255,255,0.65)',
                  margin: 0,
                  lineHeight: 1.4
                }}>
                  {data?.lastScan 
                    ? (filter === 'all' 
                        ? 'No opportunities found yet — run your first scan!' 
                        : 'No results in this category. Try "All" or run a new scan.')
                    : 'Run your first scan to discover opportunities!'
                  }
                </p>
              </div>
              {!data?.lastScan && (
                <button
                  onClick={handleRunScan}
                  disabled={scanning}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '12px 24px',
                    borderRadius: '8px',
                    border: 'none',
                    background: scanning ? 'rgba(0,122,255,0.5)' : '#007AFF',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: scanning ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <Search size={16} style={{ 
                    animation: scanning ? 'spin 1s linear infinite' : 'none' 
                  }} />
                  {scanning ? 'Scanning...' : 'Run First Scan'}
                </button>
              )}
            </div>
          ) : (
            opportunities.map((opp: any, i: number) => (
              <motion.div
                key={opp.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + i * 0.02 }}
                className="macos-panel"
                style={{ 
                  padding: m ? 14 : '18px 22px', 
                  opacity: opp.status === 'dismissed' ? 0.4 : 1,
                }}
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
                          {opp.url ? <a href={opp.url} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ color: 'inherit', textDecoration: 'none' }} onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'} onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>{opp.title}</a> : opp.title}
                        </h3>
                        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          <span className="macos-badge" style={{ fontSize: 10 }}>{opp.source}</span>
                          <span className="macos-badge" style={{ fontSize: 10 }}>{opp.category}</span>
                          {getFreshnessInfo(opp.found) && (
                            <span style={{
                              fontSize: 9,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: 'rgba(255,255,255,0.06)',
                              color: getFreshnessInfo(opp.found)?.color,
                              fontWeight: 500
                            }}>
                              {getFreshnessInfo(opp.found)?.badge}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.4, marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {opp.summary}
                    </p>
                    {/* Actions — full width on mobile */}
                    {(!opp.status || opp.status === 'new') && (
                      <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleDeploy(opp.id, false)}
                          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: '#007AFF', fontSize: 11, fontWeight: 600 }}
                        >
                          <Rocket size={12} /> Deploy
                        </button>
                        <button
                          onClick={() => handleDeploy(opp.id, true)}
                          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: '#FF6B35', fontSize: 11, fontWeight: 600 }}
                        >
                          ⚡ Auto-Research
                        </button>
                        <button
                          onClick={() => handleDismiss(opp.id)}
                          style={{ width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}
                        >
                          <X size={12} />
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
                        {getFreshnessInfo(opp.found) && (
                          <span style={{
                            fontSize: 9,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: 'rgba(255,255,255,0.06)',
                            color: getFreshnessInfo(opp.found)?.color,
                            fontWeight: 500
                          }}>
                            {getFreshnessInfo(opp.found)?.badge}
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{timeAgo(opp.found)}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      {(!opp.status || opp.status === 'new') && (
                        <>
                          <button onClick={() => handleDeploy(opp.id, false)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: '#007AFF', fontSize: 10, fontWeight: 600 }}>
                            <Rocket size={11} /> Deploy
                          </button>
                          <button onClick={() => handleDeploy(opp.id, true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: '#FF6B35', fontSize: 10, fontWeight: 600 }}>
                            ⚡ Auto-Research
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
