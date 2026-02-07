import { Clock, Play, Pause, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import PageTransition from '../components/PageTransition'
import GlassCard from '../components/GlassCard'
import StatusBadge from '../components/StatusBadge'
import { useApi, timeAgo, formatDate } from '../lib/hooks'

const statusIcons: Record<string, any> = {
  success: CheckCircle,
  failed: XCircle,
}

export default function Cron() {
  const { data, loading } = useApi<any>('/api/cron', 30000)

  if (loading || !data) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </PageTransition>
    )
  }

  const { jobs } = data

  return (
    <PageTransition>
      <div style={{ maxWidth: "1280px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "28px" }}>
        {/* Header */}
        <div>
          <h1 style={{ color: 'rgba(255,255,255,0.92)' }} className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Clock size={24} className="text-blue-300/60" strokeWidth={1.5} />
            Cron Monitor
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.45)' }} className="text-sm mt-1">Scheduled jobs and automation status</p>
        </div>

        {/* Summary Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
          <GlassCard delay={0.05} noPad>
            <div style={{ padding: 20 }}>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-400/15 border border-emerald-400/20 flex items-center justify-center">
                  <Play size={14} className="text-emerald-400" />
                </div>
                <span style={{ color: 'rgba(255,255,255,0.45)' }} className="text-xs font-semibold">Active</span>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.92)' }} className="text-2xl font-light">
                {jobs.filter((j: any) => j.status === 'active').length}
              </p>
            </div>
          </GlassCard>
          <GlassCard delay={0.1} noPad>
            <div style={{ padding: 20 }}>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-xl bg-amber-400/15 border border-amber-400/20 flex items-center justify-center">
                  <Pause size={14} className="text-amber-400" />
                </div>
                <span style={{ color: 'rgba(255,255,255,0.45)' }} className="text-xs font-semibold">Paused</span>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.92)' }} className="text-2xl font-light">
                {jobs.filter((j: any) => j.status === 'paused').length}
              </p>
            </div>
          </GlassCard>
          <GlassCard delay={0.15} noPad>
            <div style={{ padding: 20 }}>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-xl bg-red-400/15 border border-red-400/20 flex items-center justify-center">
                  <AlertTriangle size={14} className="text-red-400" />
                </div>
                <span style={{ color: 'rgba(255,255,255,0.45)' }} className="text-xs font-semibold">Failed</span>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.92)' }} className="text-2xl font-light">
                {jobs.filter((j: any) => j.status === 'failed').length}
              </p>
            </div>
          </GlassCard>
        </div>

        {/* Jobs List */}
        <GlassCard className="overflow-hidden" delay={0.2} hover={false} noPad>
          {/* Table Header */}
          <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'grid', gridTemplateColumns: '3fr 2fr 1fr 2fr 2fr 1fr 1fr', gap: 16 }}>
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Name</span>
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Schedule</span>
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Status</span>
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Last Run</span>
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Next Run</span>
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Duration</span>
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em' }}>History</span>
          </div>

          {/* Rows */}
          {jobs.map((job: any, i: number) => (
            <motion.div
              key={job.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 + i * 0.04 }}
              className="glass-row"
              style={{ padding: '16px 24px', display: 'grid', gridTemplateColumns: '3fr 2fr 1fr 2fr 2fr 1fr 1fr', gap: 16, alignItems: 'center' }}
            >
              <div style={{ overflow: 'hidden' }}>
                <p style={{ color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="text-sm font-semibold">{job.name}</p>
                <p style={{ color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="text-[10px] font-mono">{job.id}</p>
              </div>
              <div>
                <code className="text-xs text-purple-300 bg-white/[0.06] border border-white/[0.08] px-2 py-1 rounded-lg font-mono">
                  {job.schedule}
                </code>
              </div>
              <div>
                <StatusBadge status={job.status} />
              </div>
              <div>
                <p style={{ color: 'rgba(255,255,255,0.65)' }} className="text-xs">{timeAgo(job.lastRun)}</p>
                <p style={{ color: 'rgba(255,255,255,0.45)' }} className="text-[10px]">{formatDate(job.lastRun)}</p>
              </div>
              <div>
                {job.nextRun ? (
                  <>
                    <p style={{ color: 'rgba(255,255,255,0.65)' }} className="text-xs">{timeAgo(job.nextRun).replace('ago', 'from now')}</p>
                    <p style={{ color: 'rgba(255,255,255,0.45)' }} className="text-[10px]">{formatDate(job.nextRun)}</p>
                  </>
                ) : (
                  <span style={{ color: 'rgba(255,255,255,0.45)' }} className="text-xs">—</span>
                )}
              </div>
              <div>
                <span style={{ color: 'rgba(255,255,255,0.65)' }} className="text-xs font-medium">{job.duration}</span>
              </div>
              <div className="flex gap-1.5">
                {job.history?.slice(0, 3).map((h: any, hi: number) => {
                  const Icon = statusIcons[h.status] || CheckCircle
                  return (
                    <Icon
                      key={hi}
                      size={13}
                      className={h.status === 'success' ? 'text-emerald-400/70' : 'text-red-400/70'}
                    />
                  )
                })}
              </div>
            </motion.div>
          ))}
        </GlassCard>
      </div>
    </PageTransition>
  )
}
