import { useEffect, useMemo, useState } from 'react'
import { BookOpenText, Search, CalendarDays, Clock3, FileText, ChevronDown, ChevronRight } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import GlassCard from '../components/GlassCard'
import { useIsMobile } from '../lib/useIsMobile'
import { formatDate, timeAgo } from '../lib/hooks'

type MemoryScope = 'all' | 'daily' | 'longterm'

interface MemoryDoc {
  id: string
  title: string
  scope: Exclude<MemoryScope, 'all'>
  date: string | null
  path: string
  preview: string
  fullText: string
  updatedAt: string
}

interface MemoryResponse {
  documents: MemoryDoc[]
  total: number
  query: string
  scope: MemoryScope
  limit: number
}

const scopeOptions: { value: MemoryScope; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'daily', label: 'Daily' },
  { value: 'longterm', label: 'Long-term' },
]

function groupLabel(doc: MemoryDoc) {
  if (doc.scope === 'longterm') return 'Long-term'
  if (!doc.date) return 'Daily'
  const d = new Date(doc.date)
  const now = new Date()
  const dayMs = 24 * 60 * 60 * 1000
  const diff = Math.floor((now.setHours(0, 0, 0, 0) - d.setHours(0, 0, 0, 0)) / dayMs)
  if (diff <= 7) return 'This Week'
  if (diff <= 31) return 'This Month'
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

export default function Memory() {
  const isMobile = useIsMobile()
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<MemoryScope>('all')
  const [data, setData] = useState<MemoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.set('scope', scope)
        params.set('limit', '120')
        if (query.trim()) params.set('query', query.trim())

        const response = await fetch(`/api/memory?${params.toString()}`, { signal: controller.signal })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)

        const payload = (await response.json()) as MemoryResponse
        setData(payload)
        setError(null)
      } catch (err) {
        if ((err as { name?: string })?.name !== 'AbortError') {
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        setLoading(false)
      }
    }, 180)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, scope])

  const docs = useMemo(() => data?.documents || [], [data])

  // Derive the effective selectedId from the current docs list without an effect.
  // React allows calling setState during render when deriving state from other state/props.
  const computedSelectedId: string | null = !docs.length
    ? null
    : (selectedId && docs.some((d) => d.id === selectedId) ? selectedId : docs[0].id)
  if (computedSelectedId !== selectedId) {
    setSelectedId(computedSelectedId)
  }

  const selectedDoc = useMemo(() => docs.find((d) => d.id === selectedId) || null, [docs, selectedId])

  const grouped = useMemo(() => {
    const g: Record<string, MemoryDoc[]> = {}
    for (const d of docs) {
      const label = groupLabel(d)
      g[label] = g[label] || []
      g[label].push(d)
    }
    return Object.entries(g)
  }, [docs])

  // Merge new group labels into collapsedGroups during render (default: expanded).
  // React allows render-phase setState when deriving state from other state/props.
  const mergedCollapsed = useMemo(() => {
    if (!grouped.length) return collapsedGroups
    let changed = false
    const next = { ...collapsedGroups }
    for (const [label] of grouped) {
      if (next[label] === undefined) { next[label] = false; changed = true }
    }
    return changed ? next : collapsedGroups
  }, [grouped, collapsedGroups])
  if (mergedCollapsed !== collapsedGroups) {
    setCollapsedGroups(mergedCollapsed)
  }

  const timelineEntries = useMemo(() => {
    if (!selectedDoc) return []
    const lines = (selectedDoc.fullText || '').split('\n').map((x) => x.trim()).filter(Boolean)
    const entries: { title: string; body: string }[] = []
    let current: { title: string; body: string[] } | null = null
    for (const ln of lines) {
      if (ln.startsWith('#')) {
        if (current) entries.push({ title: current.title, body: current.body.join(' ') })
        current = { title: ln.replace(/^#+\s*/, ''), body: [] }
      } else if (current) {
        current.body.push(ln)
      }
    }
    if (current) entries.push({ title: current.title, body: current.body.join(' ') })
    if (!entries.length) {
      return [{ title: selectedDoc.title, body: selectedDoc.fullText || selectedDoc.preview }]
    }
    return entries.slice(0, 60)
  }, [selectedDoc])

  return (
    <PageTransition>
      <div style={{ maxWidth: 1360, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BookOpenText size={22} style={{ color: '#7C4DFF' }} /> Memory Surface
          </h1>
          <p className="text-body" style={{ marginTop: 4 }}>Search daily notes and long-term memory without leaving the operational view.</p>
        </div>

        <GlassCard noPad>
          <div style={{ padding: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 320px' }}>
              <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)' }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search memories..."
                className="macos-input"
                style={{ width: '100%', padding: '10px 12px 10px 34px', fontSize: 13 }}
              />
            </div>
            <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.72)', padding: '7px 10px', fontSize: 11, fontWeight: 600 }}>
                {docs.length} docs
              </span>
              <span style={{ borderRadius: 999, border: '1px solid rgba(124,77,255,0.25)', background: 'rgba(124,77,255,0.14)', color: 'rgba(255,255,255,0.8)', padding: '7px 10px', fontSize: 11, fontWeight: 600 }}>
                Scope: {scopeOptions.find((opt) => opt.value === scope)?.label || 'All'}
              </span>
            </div>
            <div style={{ display: 'inline-flex', gap: 8 }}>
              {scopeOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setScope(opt.value)}
                  style={{
                    borderRadius: 9,
                    border: scope === opt.value ? '1px solid rgba(124,77,255,0.6)' : '1px solid rgba(255,255,255,0.1)',
                    background: scope === opt.value ? 'rgba(124,77,255,0.2)' : 'rgba(255,255,255,0.05)',
                    color: 'rgba(255,255,255,0.85)',
                    padding: '7px 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </GlassCard>

        {error && <div className="macos-panel" style={{ padding: 12, color: '#ff6b6b' }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '300px 1fr', gap: 12, minHeight: 620 }}>
          <GlassCard noPad>
            <div style={{ padding: 12, borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 600 }}>
              Memory ({docs.length})
            </div>
            <div style={{ maxHeight: isMobile ? 260 : 620, overflowY: 'auto', padding: 10 }}>
              {loading ? (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Loading...</div>
              ) : docs.length === 0 ? (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>No memory found.</div>
              ) : (
                grouped.map(([label, items]) => {
                  const collapsed = !!collapsedGroups[label]
                  return (
                    <div key={label} style={{ marginBottom: 12 }}>
                      <button
                        onClick={() => setCollapsedGroups((prev) => ({ ...prev, [label]: !collapsed }))}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: 11,
                          color: 'rgba(255,255,255,0.55)',
                          marginBottom: 6,
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                          {label} ({items.length})
                        </span>
                      </button>

                      {!collapsed && (
                        <div style={{ display: 'grid', gap: 6 }}>
                          {items.map((d) => {
                            const active = d.id === selectedId
                            return (
                              <button
                                key={d.id}
                                onClick={() => setSelectedId(d.id)}
                                style={{
                                  textAlign: 'left',
                                  borderRadius: 10,
                                  border: active ? '1px solid rgba(124,77,255,0.55)' : '1px solid rgba(255,255,255,0.08)',
                                  background: active ? 'rgba(124,77,255,0.18)' : 'rgba(255,255,255,0.03)',
                                  padding: 10,
                                  cursor: 'pointer',
                                }}
                              >
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</div>
                                <div style={{ marginTop: 4, display: 'flex', gap: 10, fontSize: 10, color: 'rgba(255,255,255,0.52)' }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><FileText size={11} />{d.scope}</span>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock3 size={11} />{timeAgo(d.updatedAt)}</span>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </GlassCard>

          <GlassCard noPad>
            <div style={{ padding: 14, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {selectedDoc ? (
                <>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)' }}>{selectedDoc.scope === 'longterm' ? 'Long-term Memory' : 'Daily Memory'}</div>
                  <h2 style={{ margin: '4px 0 0', fontSize: 20, color: 'white' }}>{selectedDoc.title}</h2>
                  <div style={{ marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: 'rgba(255,255,255,0.56)' }}>
                    {selectedDoc.date ? <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><CalendarDays size={12} />{selectedDoc.date}</span> : null}
                    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Clock3 size={12} />{formatDate(selectedDoc.updatedAt)}</span>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Select a memory document…</div>
              )}
            </div>

            <div style={{ maxHeight: 620, overflowY: 'auto', padding: 14 }}>
              {!selectedDoc ? null : (
                <div style={{ display: 'grid', gap: 14 }}>
                  {timelineEntries.map((e, idx) => (
                    <div key={`${idx}-${e.title}`} style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 10 }}>
                      <div style={{ fontSize: 12, color: '#9D8CFF', fontWeight: 700 }}>
                        {idx === 0 ? 'Now' : `#${idx + 1}`}
                      </div>
                      <div>
                        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.94)', fontWeight: 650 }}>{e.title}</div>
                        <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,0.76)', whiteSpace: 'pre-wrap' }}>
                          {e.body || selectedDoc.preview}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    </PageTransition>
  )
}
