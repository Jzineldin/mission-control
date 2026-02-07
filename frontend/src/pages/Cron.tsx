import { Clock, Play, Pause, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import PageTransition from '../components/PageTransition'
import { useIsMobile } from '../lib/useIsMobile'
import GlassCard from '../components/GlassCard'
import StatusBadge from '../components/StatusBadge'
import { useApi, timeAgo, formatDate } from '../lib/hooks'

const statusIcons: Record<string, any> = {
  success: CheckCircle,
  failed: XCircle,
}

export default function Cron() {
  const m = useIsMobile()
  const { data, loading } = useApi<any>('/api/cron', 30000)

  if (loading || !data) {
    return (
      <PageTransition>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
          <div style={{ width: 32, height: 32, border: '2px solid #007AFF', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
      </PageTransition>
    )
  }

  const { jobs } = data

  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: m ? 14 : 28 }}>
        {/* Header */}
        <div>
          <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Clock size={m ? 18 : 22} style={{ color: '#007AFF' }} /> Cron Monitor
          </h1>
          <p className="text-body" style={{ marginTop: 4 }}>Scheduled jobs that run automatically</p>
        </div>

        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: m ? 8 : 16 }}>
          {[
            { label: 'Active', icon: Play, color: '#32D74B', count: jobs.filter((j: any) => j.status === 'active').length },
            { label: 'Paused', icon: Pause, color: '#FF9500', count: jobs.filter((j: any) => j.status === 'paused').length },
            { label: 'Failed', icon: AlertTriangle, color: '#FF453A', count: jobs.filter((j: any) => j.status === 'failed').length },
          ].map((item, i) => (
            <GlassCard key={item.label} delay={0.05 + i * 0.05} noPad>
              <div style={{ padding: m ? '10px 12px' : 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: m ? 6 : 12 }}>
                  <div style={{ width: m ? 26 : 32, height: m ? 26 : 32, borderRadius: 8, background: `${item.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <item.icon size={m ? 12 : 14} style={{ color: item.color }} />
                  </div>
                  <span style={{ fontSize: m ? 10 : 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' }}>{item.label}</span>
                </div>
                <p style={{ fontSize: m ? 20 : 24, fontWeight: 300, color: 'rgba(255,255,255,0.92)', fontVariantNumeric: 'tabular-nums' }}>{item.count}</p>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Jobs — card layout on mobile, table on desktop */}
        {m ? (
          /* MOBILE: Card list */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {jobs.map((job: any, i: number) => (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.03 }}
              >
                <GlassCard delay={0} noPad>
                  <div style={{ padding: 14 }}>
                    {/* Top: name + status */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.name}</p>
                      </div>
                      <StatusBadge status={job.status} />
                    </div>
                    {/* Schedule */}
                    <code style={{ fontSize: 11, color: '#BF5AF2', background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: 5, fontFamily: 'monospace', display: 'inline-block', marginBottom: 10 }}>
                      {job.schedule}
                    </code>
                    {/* Details grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Last Run</p>
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{timeAgo(job.lastRun)}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Next Run</p>
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{job.nextRun ? timeAgo(job.nextRun) : '—'}</p>
                      </div>
                    </div>
                    {/* History dots */}
                    {job.history?.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        {job.history.slice(0, 5).map((h: any, hi: number) => {
                          const Icon = statusIcons[h.status] || CheckCircle
                          return <Icon key={hi} size={12} style={{ color: h.status === 'success' ? '#32D74B' : '#FF453A', opacity: 0.7 }} />
                        })}
                      </div>
                    )}
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        ) : (
          /* DESKTOP: Table */
          <GlassCard delay={0.2} hover={false} noPad>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'grid', gridTemplateColumns: '3fr 2fr 1fr 2fr 2fr 1fr 1fr', gap: 16 }}>
              {['Name', 'Schedule', 'Status', 'Last Run', 'Next Run', 'Duration', 'History'].map((h) => (
                <span key={h} style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em' }}>{h}</span>
              ))}
            </div>
            {jobs.map((job: any, i: number) => (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.04 }}
                style={{
                  padding: '16px 24px', display: 'grid', gridTemplateColumns: '3fr 2fr 1fr 2fr 2fr 1fr 1fr', gap: 16, alignItems: 'center',
                  borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.name}</p>
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{job.id}</p>
                </div>
                <div>
                  <code style={{ fontSize: 12, color: '#BF5AF2', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', padding: '4px 8px', borderRadius: 6, fontFamily: 'monospace' }}>{job.schedule}</code>
                </div>
                <div><StatusBadge status={job.status} /></div>
                <div>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{timeAgo(job.lastRun)}</p>
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>{formatDate(job.lastRun)}</p>
                </div>
                <div>
                  {job.nextRun ? (
                    <>
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{timeAgo(job.nextRun)}</p>
                      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>{formatDate(job.nextRun)}</p>
                    </>
                  ) : <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>—</span>}
                </div>
                <div><span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.65)' }}>{job.duration}</span></div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {job.history?.slice(0, 3).map((h: any, hi: number) => {
                    const Icon = statusIcons[h.status] || CheckCircle
                    return <Icon key={hi} size={13} style={{ color: h.status === 'success' ? '#32D74B' : '#FF453A', opacity: 0.7 }} />
                  })}
                </div>
              </motion.div>
            ))}
          </GlassCard>
        )}
      </div>
    </PageTransition>
  )
}
