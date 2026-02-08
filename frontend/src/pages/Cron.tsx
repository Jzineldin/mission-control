import { useState } from 'react'
import { Clock, Play, Pause, AlertTriangle, CheckCircle, XCircle, Plus, Trash2, RotateCcw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import PageTransition from '../components/PageTransition'
import { useIsMobile } from '../lib/useIsMobile'
import GlassCard from '../components/GlassCard'
import StatusBadge from '../components/StatusBadge'
import { useApi, timeAgo, formatDate } from '../lib/hooks'

const statusIcons: Record<string, any> = {
  success: CheckCircle,
  failed: XCircle,
  ok: CheckCircle,
  error: XCircle,
}

// Cron expression presets
const CRON_PRESETS = [
  { label: 'Every hour', expr: '0 * * * *' },
  { label: 'Daily 8am', expr: '0 8 * * *' },
  { label: 'Daily 6pm', expr: '0 18 * * *' },
  { label: 'Weekly Monday', expr: '0 9 * * 1' },
  { label: 'Every 30min', expr: '*/30 * * * *' },
]

interface CronJob {
  id: string
  name: string
  schedule: string
  status: string
  enabled: boolean
  lastRun: string | null
  nextRun: string | null
  duration: string | null
  target: string
  payload: string
  description: string
  history: any[]
}

interface CreateJobModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (job: any) => void
}

function CreateJobModal({ isOpen, onClose, onSubmit }: CreateJobModalProps) {
  const m = useIsMobile()
  const [formData, setFormData] = useState({
    name: '',
    schedule: '',
    sessionTarget: 'isolated',
    payloadType: 'agentTurn',
    message: '',
    model: ''
  })

  const handlePresetClick = (expr: string) => {
    setFormData(prev => ({ ...prev, schedule: expr }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name || !formData.schedule || !formData.message) {
      alert('Name, schedule, and message are required')
      return
    }

    const job = {
      name: formData.name,
      schedule: {
        kind: 'cron',
        expr: formData.schedule
      },
      sessionTarget: formData.sessionTarget,
      payload: {
        kind: formData.payloadType,
        message: formData.message,
        ...(formData.payloadType === 'agentTurn' && formData.model ? { model: formData.model } : {})
      },
      enabled: true
    }

    onSubmit(job)
    setFormData({
      name: '',
      schedule: '',
      sessionTarget: 'isolated', 
      payloadType: 'agentTurn',
      message: '',
      model: ''
    })
    onClose()
  }

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(8px)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: m ? 16 : 32
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        style={{
          background: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 16,
          padding: m ? 20 : 32,
          width: '100%',
          maxWidth: 600,
          maxHeight: '90vh',
          overflowY: 'auto'
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: m ? 16 : 24
        }}>
          <h2 style={{
            fontSize: m ? 18 : 20,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.92)',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <Plus size={m ? 16 : 18} style={{ color: '#007AFF' }} />
            Create Cron Job
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              padding: 4,
              fontSize: 18
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: m ? 16 : 20 }}>
          {/* Name */}
          <div>
            <label style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.7)',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: '0.1em'
            }}>
              Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Check emails"
              style={{
                width: '100%',
                padding: m ? '10px 12px' : '12px 16px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.9)',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Schedule */}
          <div>
            <label style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.7)',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: '0.1em'
            }}>
              Schedule
            </label>
            <input
              type="text"
              value={formData.schedule}
              onChange={(e) => setFormData(prev => ({ ...prev, schedule: e.target.value }))}
              placeholder="0 8 * * * (daily at 8am)"
              style={{
                width: '100%',
                padding: m ? '10px 12px' : '12px 16px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.9)',
                fontSize: 14,
                fontFamily: 'monospace',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginTop: 8
            }}>
              {CRON_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handlePresetClick(preset.expr)}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    padding: '4px 8px',
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: 11,
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.12)'
                    e.currentTarget.style.color = 'rgba(255,255,255,0.9)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                    e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <p style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.5)',
              marginTop: 4,
              margin: '4px 0 0'
            }}>
              Format: minute hour day month weekday (* = any)
            </p>
          </div>

          {/* Session Target */}
          <div>
            <label style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.7)',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: '0.1em'
            }}>
              Session Target
            </label>
            <select
              value={formData.sessionTarget}
              onChange={(e) => setFormData(prev => ({ ...prev, sessionTarget: e.target.value }))}
              style={{
                width: '100%',
                padding: m ? '10px 12px' : '12px 16px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.9)',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box'
              }}
            >
              <option value="main">main</option>
              <option value="isolated">isolated</option>
            </select>
          </div>

          {/* Payload Type */}
          <div>
            <label style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.7)',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: '0.1em'
            }}>
              Payload Type
            </label>
            <select
              value={formData.payloadType}
              onChange={(e) => setFormData(prev => ({ ...prev, payloadType: e.target.value }))}
              style={{
                width: '100%',
                padding: m ? '10px 12px' : '12px 16px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.9)',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box'
              }}
            >
              <option value="systemEvent">systemEvent</option>
              <option value="agentTurn">agentTurn</option>
            </select>
          </div>

          {/* Message */}
          <div>
            <label style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.7)',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: '0.1em'
            }}>
              Message
            </label>
            <textarea
              value={formData.message}
              onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
              placeholder="Task description or prompt..."
              rows={3}
              style={{
                width: '100%',
                padding: m ? '10px 12px' : '12px 16px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.9)',
                fontSize: 14,
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Model (optional, only if agentTurn) */}
          {formData.payloadType === 'agentTurn' && (
            <div>
              <label style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.7)',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: '0.1em'
              }}>
                Model (Optional)
              </label>
              <input
                type="text"
                value={formData.model}
                onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))}
                placeholder="e.g. sonnet"
                style={{
                  width: '100%',
                  padding: m ? '10px 12px' : '12px 16px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  color: 'rgba(255,255,255,0.9)',
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          )}

          {/* Actions */}
          <div style={{
            display: 'flex',
            gap: 12,
            justifyContent: 'flex-end',
            marginTop: m ? 8 : 16
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: m ? '10px 16px' : '12px 20px',
                background: 'none',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.7)',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.9)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none'
                e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: m ? '10px 16px' : '12px 20px',
                background: '#007AFF',
                border: 'none',
                borderRadius: 8,
                color: 'white',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#0056CC'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#007AFF'
              }}
            >
              Create Job
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!enabled)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: enabled ? '#32D74B' : 'rgba(255,255,255,0.2)',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          background: 'white',
          position: 'absolute',
          top: 2,
          left: enabled ? 22 : 2,
          transition: 'left 0.2s',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}
      />
    </div>
  )
}

export default function Cron() {
  const m = useIsMobile()
  const { data, loading, refetch } = useApi<any>('/api/cron', 30000)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const handleToggle = async (jobId: string, enabled: boolean) => {
    setActionLoading(`toggle-${jobId}`)
    try {
      const response = await fetch(`/api/cron/${jobId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled })
      })
      if (response.ok) {
        refetch()
      } else {
        const error = await response.json()
        alert(`Failed to toggle job: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      alert(`Error: ${error}`)
    }
    setActionLoading(null)
  }

  const [toast, setToast] = useState<string | null>(null)
  const [expandedJob, setExpandedJob] = useState<string | null>(null)
  const [jobRuns, setJobRuns] = useState<any[]>([])
  const [runsLoading, setRunsLoading] = useState(false)

  const handleExpand = async (jobId: string) => {
    if (expandedJob === jobId) {
      setExpandedJob(null)
      return
    }
    setExpandedJob(jobId)
    setRunsLoading(true)
    try {
      const res = await fetch(`/api/cron/${jobId}/runs`)
      const data = await res.json()
      setJobRuns(Array.isArray(data) ? data.slice(0, 5) : [])
    } catch {
      setJobRuns([])
    }
    setRunsLoading(false)
  }

  const handleRun = async (jobId: string) => {
    setActionLoading(`run-${jobId}`)
    try {
      const response = await fetch(`/api/cron/${jobId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      if (response.ok) {
        const jobName = jobs.find((j: any) => j.id === jobId)?.name || jobId
        setToast(`✅ "${jobName}" triggered!`)
        setTimeout(() => setToast(null), 4000)
        setTimeout(refetch, 1500)
      } else {
        const error = await response.json()
        setToast(`❌ Failed: ${error.error || 'Unknown error'}`)
        setTimeout(() => setToast(null), 5000)
      }
    } catch (error) {
      setToast(`❌ Error: ${error}`)
      setTimeout(() => setToast(null), 5000)
    }
    setActionLoading(null)
  }

  const handleDelete = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this cron job?')) return
    
    setActionLoading(`delete-${jobId}`)
    try {
      const response = await fetch(`/api/cron/${jobId}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        refetch()
      } else {
        const error = await response.json()
        alert(`Failed to delete job: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      alert(`Error: ${error}`)
    }
    setActionLoading(null)
  }

  const handleCreateJob = async (job: any) => {
    try {
      const response = await fetch('/api/cron/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job })
      })
      if (response.ok) {
        refetch()
      } else {
        const error = await response.json()
        alert(`Failed to create job: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      alert(`Error: ${error}`)
    }
  }

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
    <>
      <PageTransition>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: m ? 14 : 28 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
                <Clock size={m ? 18 : 22} style={{ color: '#007AFF' }} /> Cron Jobs
              </h1>
              <p className="text-body" style={{ marginTop: 4, margin: '4px 0 0' }}>Scheduled jobs that run automatically</p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: m ? '8px 12px' : '10px 16px',
                background: '#007AFF',
                border: 'none',
                borderRadius: 8,
                color: 'white',
                fontSize: m ? 13 : 14,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#0056CC'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#007AFF'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <Plus size={m ? 14 : 16} />
              Create Job
            </button>
          </div>

          {/* Toast notification */}
          {toast && (
            <div style={{
              padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 500,
              background: toast.startsWith('✅') ? 'rgba(50,215,75,0.15)' : 'rgba(255,69,58,0.15)',
              border: `1px solid ${toast.startsWith('✅') ? 'rgba(50,215,75,0.3)' : 'rgba(255,69,58,0.3)'}`,
              color: toast.startsWith('✅') ? '#32D74B' : '#FF453A',
            }}>
              {toast}
            </div>
          )}

          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: m ? 8 : 16 }}>
            {[
              { label: 'Active', icon: Play, color: '#32D74B', count: jobs.filter((j: CronJob) => j.status === 'active' || (j.enabled && j.status !== 'disabled')).length },
              { label: 'Disabled', icon: Pause, color: '#FF9500', count: jobs.filter((j: CronJob) => j.status === 'disabled' || !j.enabled).length },
              { label: 'Failed', icon: AlertTriangle, color: '#FF453A', count: jobs.filter((j: CronJob) => j.status === 'failed' || j.status === 'error').length },
            ].map((item, i) => (
              <GlassCard key={item.label} delay={0.05 + i * 0.05} noPad>
                <div style={{ padding: m ? '10px 12px' : 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: m ? 6 : 12 }}>
                    <div style={{ width: m ? 26 : 32, height: m ? 26 : 32, borderRadius: 8, background: `${item.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <item.icon size={m ? 12 : 14} style={{ color: item.color }} />
                    </div>
                    <span style={{ fontSize: m ? 10 : 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' }}>{item.label}</span>
                  </div>
                  <p style={{ fontSize: m ? 20 : 24, fontWeight: 300, color: 'rgba(255,255,255,0.92)', fontVariantNumeric: 'tabular-nums', margin: 0 }}>{item.count}</p>
                </div>
              </GlassCard>
            ))}
          </div>

          {/* Jobs — card layout on mobile, table on desktop */}
          {m ? (
            /* MOBILE: Card list */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {jobs.map((job: CronJob, i: number) => (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.03 }}
                >
                  <GlassCard delay={0} noPad>
                    <div style={{ padding: 14 }}>
                      {/* Top: name + toggle */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{job.name}</p>
                        </div>
                        <ToggleSwitch 
                          enabled={job.enabled} 
                          onChange={(enabled) => handleToggle(job.id, job.enabled)} 
                        />
                      </div>
                      
                      {/* Schedule */}
                      <code style={{ fontSize: 11, color: '#BF5AF2', background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: 5, fontFamily: 'monospace', display: 'inline-block', marginBottom: 10 }}>
                        {job.schedule}
                      </code>
                      
                      {/* Status */}
                      <div style={{ marginBottom: 10 }}>
                        <StatusBadge status={job.enabled ? job.status : 'disabled'} />
                      </div>
                      
                      {/* Details grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                        <div>
                          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 2, margin: '0 0 2px' }}>Last Run</p>
                          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', margin: 0 }}>{job.lastRun ? timeAgo(job.lastRun) : '—'}</p>
                        </div>
                        <div>
                          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 2, margin: '0 0 2px' }}>Next Run</p>
                          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', margin: 0 }}>{job.nextRun ? timeAgo(job.nextRun) : '—'}</p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <button
                          onClick={() => handleRun(job.id)}
                          disabled={actionLoading === `run-${job.id}`}
                          style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            padding: '6px 10px',
                            background: 'rgba(255,255,255,0.08)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 6,
                            color: 'rgba(255,255,255,0.8)',
                            fontSize: 12,
                            fontWeight: 500,
                            cursor: actionLoading === `run-${job.id}` ? 'not-allowed' : 'pointer',
                            transition: 'all 0.15s',
                            opacity: actionLoading === `run-${job.id}` ? 0.6 : 1
                          }}
                        >
                          {actionLoading === `run-${job.id}` ? (
                            <RotateCcw size={12} style={{ animation: 'spin 1s linear infinite' }} />
                          ) : (
                            <Play size={12} />
                          )}
                          Run Now
                        </button>
                        <button
                          onClick={() => handleDelete(job.id)}
                          disabled={actionLoading === `delete-${job.id}`}
                          style={{
                            padding: '6px 8px',
                            background: 'rgba(255,69,58,0.1)',
                            border: '1px solid rgba(255,69,58,0.2)',
                            borderRadius: 6,
                            color: '#FF453A',
                            cursor: actionLoading === `delete-${job.id}` ? 'not-allowed' : 'pointer',
                            transition: 'all 0.15s',
                            opacity: actionLoading === `delete-${job.id}` ? 0.6 : 1
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </div>
          ) : (
            /* DESKTOP: Table */
            <GlassCard delay={0.2} hover={false} noPad>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'grid', gridTemplateColumns: '3fr 2fr 1fr 2fr 2fr 1fr 2fr', gap: 16 }}>
                {['Name', 'Schedule', 'Status', 'Last Run', 'Next Run', 'Duration', 'Actions'].map((h) => (
                  <span key={h} style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em' }}>{h}</span>
                ))}
              </div>
              {jobs.map((job: CronJob, i: number) => (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + i * 0.04 }}
                  style={{
                    padding: '16px 24px', display: 'grid', gridTemplateColumns: '3fr 2fr 1fr 2fr 2fr 1fr 2fr', gap: 16, alignItems: 'center',
                    borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ overflow: 'hidden', cursor: 'pointer' }} onClick={() => handleExpand(job.id)}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                      <span style={{ display: 'inline-block', transform: expandedJob === job.id ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', marginRight: 6, fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>▶</span>
                      {job.name}
                    </p>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', margin: '2px 0 0', paddingLeft: 18 }}>{job.id}</p>
                  </div>
                  <div>
                    <code style={{ fontSize: 12, color: '#BF5AF2', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', padding: '4px 8px', borderRadius: 6, fontFamily: 'monospace' }}>{job.schedule}</code>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ToggleSwitch 
                        enabled={job.enabled} 
                        onChange={(enabled) => handleToggle(job.id, job.enabled)} 
                      />
                      <StatusBadge status={job.enabled ? job.status : 'disabled'} />
                    </div>
                  </div>
                  <div>
                    {job.lastRun ? (
                      <>
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', margin: 0 }}>{timeAgo(job.lastRun)}</p>
                        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', margin: '2px 0 0' }}>{formatDate(job.lastRun)}</p>
                      </>
                    ) : <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>—</span>}
                  </div>
                  <div>
                    {job.nextRun ? (
                      <>
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', margin: 0 }}>{timeAgo(job.nextRun)}</p>
                        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', margin: '2px 0 0' }}>{formatDate(job.nextRun)}</p>
                      </>
                    ) : <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>—</span>}
                  </div>
                  <div><span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.65)' }}>{job.duration || '—'}</span></div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleRun(job.id)}
                      disabled={actionLoading === `run-${job.id}`}
                      title="Run now"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 32,
                        height: 28,
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 6,
                        color: 'rgba(255,255,255,0.8)',
                        cursor: actionLoading === `run-${job.id}` ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s',
                        opacity: actionLoading === `run-${job.id}` ? 0.6 : 1
                      }}
                      onMouseEnter={(e) => {
                        if (actionLoading !== `run-${job.id}`) {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.12)'
                          e.currentTarget.style.color = 'rgba(255,255,255,0.9)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                        e.currentTarget.style.color = 'rgba(255,255,255,0.8)'
                      }}
                    >
                      {actionLoading === `run-${job.id}` ? (
                        <RotateCcw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <Play size={14} />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(job.id)}
                      disabled={actionLoading === `delete-${job.id}`}
                      title="Delete"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 32,
                        height: 28,
                        background: 'rgba(255,69,58,0.1)',
                        border: '1px solid rgba(255,69,58,0.2)',
                        borderRadius: 6,
                        color: '#FF453A',
                        cursor: actionLoading === `delete-${job.id}` ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s',
                        opacity: actionLoading === `delete-${job.id}` ? 0.6 : 1
                      }}
                      onMouseEnter={(e) => {
                        if (actionLoading !== `delete-${job.id}`) {
                          e.currentTarget.style.background = 'rgba(255,69,58,0.15)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,69,58,0.1)'
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {/* Expanded: Run history */}
                  {expandedJob === job.id && (
                    <div style={{ gridColumn: '1 / -1', padding: '12px 0 4px', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 8 }}>
                      <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px' }}>Recent Runs</p>
                      {runsLoading ? (
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0 }}>Loading...</p>
                      ) : jobRuns.length === 0 ? (
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0 }}>No run history available</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {jobRuns.map((run: any, ri: number) => (
                            <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, fontSize: 12 }}>
                              <span style={{ color: run.status === 'ok' || run.status === 'completed' ? '#32D74B' : run.status === 'error' ? '#FF453A' : '#FF9500', fontWeight: 600 }}>
                                {run.status === 'ok' || run.status === 'completed' ? '✓' : run.status === 'error' ? '✗' : '●'} {run.status || 'unknown'}
                              </span>
                              <span style={{ color: 'rgba(255,255,255,0.5)' }}>{run.startedAt ? timeAgo(run.startedAt) : run.timestamp ? timeAgo(run.timestamp) : '—'}</span>
                              {run.durationMs && <span style={{ color: 'rgba(255,255,255,0.4)' }}>{run.durationMs}ms</span>}
                              {run.summary && <span style={{ color: 'rgba(255,255,255,0.6)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.summary}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </GlassCard>
          )}
        </div>
      </PageTransition>

      {/* Create Job Modal - Outside PageTransition to avoid position:fixed issues */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateJobModal
            isOpen={showCreateModal}
            onClose={() => setShowCreateModal(false)}
            onSubmit={handleCreateJob}
          />
        )}
      </AnimatePresence>
    </>
  )
}