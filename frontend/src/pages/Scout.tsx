/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Radar, SortDesc, X, Rocket, Shield, Code, Briefcase, GraduationCap, DollarSign, Search, ChevronLeft, ChevronRight, ChevronDown, Plus } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import { useIsMobile } from '../lib/useIsMobile'
import GlassCard from '../components/GlassCard'
import { useApi, timeAgo } from '../lib/hooks'
import { TEXT, COLORS, GLASS, accent } from '../lib/theme'

const scoreColor = (score: number) => {
  if (score >= 85) return COLORS.green
  if (score >= 70) return COLORS.blue
  if (score >= 50) return COLORS.orange
  return COLORS.gray
}

const getFreshnessInfo = (foundDate: string) => {
  const now = new Date()
  const found = new Date(foundDate)
  const hours = (now.getTime() - found.getTime()) / (1000 * 60 * 60)

  if (hours < 4) {
    return { badge: '🟢 Fresh', color: COLORS.green }
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
  { id: 'all',      label: 'All',      icon: Radar         },
  { id: 'openclaw', label: 'OpenClaw', icon: Code          },
  { id: 'bounty',   label: 'Bounty',   icon: Shield        },
  { id: 'freelance',label: 'Freelance',icon: Briefcase     },
  { id: 'edtech',   label: 'EdTech',   icon: GraduationCap },
  { id: 'funding',  label: 'Grants',   icon: DollarSign    },
]

const PAGE_SIZE = 20

export default function Scout() {
  const m = useIsMobile()
  const [sortBy, setSortBy]   = useState<'score' | 'date'>('score')
  const [filter, setFilter]   = useState('all')
  const [page, setPage]       = useState(1)
  const [scanning, setScanning] = useState(false)
  const [toast, setToast]     = useState<string | null>(null)

  // Reset to page 1 whenever filter or sort changes
  useEffect(() => { const reset = async () => { setPage(1) }; void reset() }, [filter, sortBy])

  const [queriesOpen, setQueriesOpen] = useState(false)
  const [queryOverrides, setQueryOverrides] = useState<string[] | null>(null)
  const [newQuery, setNewQuery] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)

  const scoutUrl = `/api/scout?filter=${filter}&sort=${sortBy}&page=${page}&limit=${PAGE_SIZE}`
  const { data, loading, refetch } = useApi<any>(scoutUrl, 60000)
  const { data: cronData } = useApi<any>('/api/cron', 30000)
  const { data: configData } = useApi<any>('/api/scout/config', 0)

  const queries: string[] = queryOverrides ?? (configData?.queries || [])
  const setQueries = (v: string[]) => setQueryOverrides(v)

  if (loading || !data) {
    return (
      <PageTransition>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
          <div style={{ width: 32, height: 32, border: `2px solid ${COLORS.blue}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
      </PageTransition>
    )
  }

  const opportunities   = data.opportunities || []
  const counts          = data.counts || {}
  const filteredStats   = data.filteredStats || {}
  const pagination      = data.pagination || { total: 0, page: 1, limit: PAGE_SIZE, pages: 1 }

  const handleDeploy = async (oppId: string) => {
    try {
      await fetch('/api/scout/deploy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ opportunityId: oppId }) })
      refetch()
    } catch { /* skip */ }
  }

  const handleDismiss = async (oppId: string) => {
    try {
      await fetch('/api/scout/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ opportunityId: oppId }) })
      refetch()
    } catch { /* skip */ }
  }

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    try {
      await fetch('/api/scout/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries }),
      })
      setToast('✅ Scan queries saved')
      setTimeout(() => setToast(null), 3000)
    } catch { /* skip */ }
    setSavingConfig(false)
  }

  const handleRunScan = async () => {
    try {
      setScanning(true)
      setToast(null)
      const response = await fetch('/api/scout/scan', { method: 'POST' })
      const result = await response.json()

      if (result.status === 'scanning') {
        const checkStatus = async () => {
          try {
            const statusResponse = await fetch('/api/scout/status')
            const status = await statusResponse.json()

            if (!status.scanning) {
              setScanning(false)
              setToast('✅ Scan completed! Results refreshed.')
              setTimeout(() => setToast(null), 4000)
              refetch()
            } else {
              setTimeout(checkStatus, 3000)
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
        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed', top: '20px', right: '20px',
            padding: '12px 16px', borderRadius: '8px',
            background: toast.startsWith('✅') ? 'rgba(50,215,75,0.9)' : 'rgba(255,69,58,0.9)',
            backdropFilter: 'blur(10px)', color: '#fff',
            fontSize: '14px', fontWeight: '500', zIndex: 1000,
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          }}>
            {toast}
          </div>
        )}

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Radar size={m ? 18 : 22} style={{ color: COLORS.purple }} /> Scout
            </h1>
            <p className="text-body" style={{ marginTop: 4, fontSize: m ? 11 : 13 }}>
              Find opportunities across the web — skills, jobs, grants & more
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 2, fontSize: m ? 10 : 12, opacity: 0.6 }}>
              <span>Last scan: {data?.lastScan ? timeAgo(data.lastScan) : 'never'}</span>
              {cronData?.jobs && getNextScanTime(cronData.jobs) && (
                <>
                  <span style={{ color: TEXT.muted }}>•</span>
                  <span>{getNextScanTime(cronData.jobs)}</span>
                </>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handleRunScan}
              disabled={scanning}
              className="macos-button"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', fontSize: 12,
                backgroundColor: scanning ? GLASS.borderSubtle : accent(COLORS.blue).bg,
                borderColor: scanning ? 'rgba(255,255,255,0.1)' : accent(COLORS.blue).border,
                color: scanning ? 'rgba(255,255,255,0.5)' : COLORS.blue,
                cursor: scanning ? 'not-allowed' : 'pointer',
              }}
            >
              <Search size={13} style={{ animation: scanning ? 'spin 1s linear infinite' : 'none' }} />
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

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 4, msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: m ? '7px 12px' : '8px 16px',
                borderRadius: 10, flexShrink: 0,
                border: filter === f.id ? `1px solid ${accent(COLORS.blue).border}` : `1px solid ${GLASS.border}`,
                background: filter === f.id ? accent(COLORS.blue).bg : GLASS.surface,
                color: filter === f.id ? '#fff' : 'rgba(255,255,255,0.55)',
                fontSize: m ? 11 : 12, fontWeight: 500, cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <f.icon size={m ? 12 : 14} />
              {f.label}
              <span style={{
                fontSize: 10, padding: '1px 5px', borderRadius: 6,
                background: filter === f.id ? 'rgba(255,255,255,0.15)' : GLASS.divider,
                color: filter === f.id ? '#fff' : 'rgba(255,255,255,0.4)',
              }}>
                {counts[f.id] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: m ? 8 : 16 }}>
          {[
            { label: 'Showing',   value: filteredStats.total    ?? 0, color: '#fff'        },
            { label: 'High (85+)',value: filteredStats.high     ?? 0, color: COLORS.green  },
            { label: 'Deployed',  value: filteredStats.deployed ?? 0, color: COLORS.blue   },
            { label: 'Avg Score', value: filteredStats.avgScore ?? 0, color: COLORS.orange },
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
              textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: accent(COLORS.purple).bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Radar size={28} style={{ color: COLORS.purple }} />
              </div>
              <div>
                <h3 style={{ fontSize: m ? '16px' : '18px', fontWeight: '600', color: TEXT.primary, margin: '0 0 8px 0' }}>
                  No results yet
                </h3>
                <p style={{ fontSize: m ? '13px' : '15px', color: TEXT.secondary, margin: 0, lineHeight: 1.4 }}>
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
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '12px 24px', borderRadius: '8px', border: 'none',
                    background: scanning ? accent(COLORS.blue).bgHover : COLORS.blue,
                    color: '#fff', fontSize: '14px', fontWeight: '600',
                    cursor: scanning ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
                  }}
                >
                  <Search size={16} style={{ animation: scanning ? 'spin 1s linear infinite' : 'none' }} />
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
                style={{ padding: m ? 14 : '18px 22px', opacity: opp.status === 'dismissed' ? 0.4 : 1 }}
              >
                {m ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: `${scoreColor(opp.score)}20`, border: `1px solid ${scoreColor(opp.score)}40`,
                      }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: scoreColor(opp.score) }}>{opp.score}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ fontSize: 13, fontWeight: 600, color: TEXT.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {opp.url
                            ? <a href={opp.url} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ color: 'inherit', textDecoration: 'none' }} onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'} onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>{opp.title}</a>
                            : opp.title}
                        </h3>
                        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          <span className="macos-badge" style={{ fontSize: 10 }}>{opp.source}</span>
                          <span className="macos-badge" style={{ fontSize: 10 }}>{opp.category}</span>
                          {getFreshnessInfo(opp.found) && (
                            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: GLASS.divider, color: getFreshnessInfo(opp.found)?.color, fontWeight: 500 }}>
                              {getFreshnessInfo(opp.found)?.badge}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <p style={{ fontSize: 12, color: TEXT.tertiary, lineHeight: 1.4, marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {opp.summary}
                    </p>
                    {opp.status === 'new' && (
                      <div style={{ display: 'flex', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleDeploy(opp.id)}
                          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: COLORS.blue, fontSize: 12, fontWeight: 600 }}
                        >
                          <Rocket size={13} /> Deploy
                        </button>
                        <button
                          onClick={() => handleDismiss(opp.id)}
                          style={{ width: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', borderRadius: 8, border: `1px solid ${GLASS.border}`, background: GLASS.divider, cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                    {opp.status === 'deployed' && (
                      <span style={{ fontSize: 11, color: COLORS.green, fontWeight: 600 }}>✓ In Workshop</span>
                    )}
                  </div>
                ) : (
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
                        <h3 style={{ fontSize: 13, fontWeight: 600, color: TEXT.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {opp.title}
                        </h3>
                        <span className="macos-badge" style={{ fontSize: 10, flexShrink: 0 }}>{opp.status}</span>
                      </div>
                      <p style={{ fontSize: 12, color: TEXT.tertiary, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: 8 }}>
                        {opp.summary}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="macos-badge" style={{ fontSize: 10 }}>{opp.source}</span>
                        <span className="macos-badge" style={{ fontSize: 10 }}>{opp.category}</span>
                        {getFreshnessInfo(opp.found) && (
                          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: GLASS.divider, color: getFreshnessInfo(opp.found)?.color, fontWeight: 500 }}>
                            {getFreshnessInfo(opp.found)?.badge}
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{timeAgo(opp.found)}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      {opp.status === 'new' && (
                        <>
                          <button onClick={() => handleDeploy(opp.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: COLORS.blue, fontSize: 11 }}>
                            <Rocket size={12} /> Deploy
                          </button>
                          <button onClick={() => handleDismiss(opp.id)} className="macos-button" style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', borderRadius: 8, fontSize: 11, cursor: 'pointer' }}>
                            <X size={12} />
                          </button>
                        </>
                      )}
                      {opp.status === 'deployed' && <span style={{ fontSize: 10, color: COLORS.green, fontWeight: 600 }}>✓ In Workshop</span>}
                    </div>
                  </div>
                )}
              </motion.div>
            ))
          )}
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 8 }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '7px 14px', borderRadius: 8, fontSize: 12, cursor: pagination.page <= 1 ? 'not-allowed' : 'pointer',
                border: `1px solid ${GLASS.border}`, background: GLASS.surface,
                color: pagination.page <= 1 ? TEXT.muted : TEXT.secondary,
                opacity: pagination.page <= 1 ? 0.5 : 1,
              }}
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <span style={{ fontSize: 12, color: TEXT.tertiary }}>
              Page {pagination.page} of {pagination.pages}
              <span style={{ color: TEXT.muted, marginLeft: 8 }}>({pagination.total} total)</span>
            </span>
            <button
              onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
              disabled={pagination.page >= pagination.pages}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '7px 14px', borderRadius: 8, fontSize: 12, cursor: pagination.page >= pagination.pages ? 'not-allowed' : 'pointer',
                border: `1px solid ${GLASS.border}`, background: GLASS.surface,
                color: pagination.page >= pagination.pages ? TEXT.muted : TEXT.secondary,
                opacity: pagination.page >= pagination.pages ? 0.5 : 1,
              }}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}
        {/* Scan Queries */}
        <div className="macos-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <button
            onClick={() => setQueriesOpen(v => !v)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: m ? '12px 16px' : '14px 20px', background: 'none', border: 'none', cursor: 'pointer', color: TEXT.primary }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Search size={14} style={{ color: COLORS.purple }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Scan Queries ({queries.length})</span>
            </div>
            <ChevronDown size={14} style={{ color: 'rgba(255,255,255,0.4)', transform: queriesOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
          </button>
          {queriesOpen && (
            <div style={{ padding: m ? '8px 16px 16px' : '8px 20px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {queries.length === 0 && (
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: 0 }}>No queries configured. Add some below.</p>
                )}
                {queries.map((q, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, background: GLASS.divider, border: '1px solid rgba(255,255,255,0.1)' }}>
                    <span style={{ fontSize: 12, color: TEXT.secondary }}>{q}</span>
                    <button onClick={() => setQueries(queries.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 0, display: 'flex' }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  type="text"
                  value={newQuery}
                  onChange={(e) => setNewQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && newQuery.trim()) { setQueries([...queries, newQuery.trim()]); setNewQuery('') } }}
                  placeholder="Add a search query and press Enter..."
                  className="macos-input"
                  style={{ flex: 1, padding: '8px 12px', fontSize: 12 }}
                />
                <button
                  onClick={() => { if (newQuery.trim()) { setQueries([...queries, newQuery.trim()]); setNewQuery('') } }}
                  style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: GLASS.border, color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  <Plus size={14} />
                </button>
              </div>
              <button
                onClick={handleSaveConfig}
                disabled={savingConfig}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: savingConfig ? GLASS.border : COLORS.purple, color: '#fff', fontSize: 12, fontWeight: 600, cursor: savingConfig ? 'not-allowed' : 'pointer' }}
              >
                {savingConfig ? 'Saving...' : 'Save Queries'}
              </button>
            </div>
          )}
        </div>

      </div>
    </PageTransition>
  )
}
