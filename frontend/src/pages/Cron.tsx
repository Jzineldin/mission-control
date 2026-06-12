import { Fragment, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Clock, Play, Pause, AlertTriangle, XCircle, Plus, Trash2, RotateCcw, Cpu } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import PageTransition from '../components/PageTransition'
import { useIsMobile } from '../lib/useIsMobile'
import GlassCard from '../components/GlassCard'
import StatusBadge from '../components/StatusBadge'
import PageHeader from '../components/ui/PageHeader'
import { useApi, timeAgo, formatDate } from '../lib/hooks'
import { normalizeCronStatus } from '../lib/status'
import styles from './Cron.module.css'

interface CronHistoryEntry {
  status?: string
}

// Success rate calculator from job history
function calcSuccessRate(history: CronHistoryEntry[]): { rate: string; pct: number; total: number; ok: number; failed: number } | null {
  if (!history || history.length === 0) return null
  const total = history.length
  const ok = history.filter((h) => h.status === 'done' || h.status === 'success' || h.status === 'ok').length
  const failed = total - ok
  const pct = Math.round((ok / total) * 100)
  return { rate: `${pct}%`, pct, total, ok, failed }
}

// Gradient bar for success rate
function SuccessBar({ rate }: { rate: { rate: string; pct: number; total: number; ok: number; failed: number } }) {
  const barColor = rate.pct === 100 ? '#32D74B' : rate.pct >= 75 ? '#FFD60A' : rate.pct >= 50 ? '#FF9500' : '#FF453A'
  return (
    <div className={styles.successBarOuter}>
      <div className={styles.successBarTop}>
        <span className={styles.successBarPct} style={{ color: barColor }}>{rate.rate}</span>
        <span className={styles.successBarTotal}>{rate.total}x</span>
      </div>
      <div className={styles.successBarTrack}>
        <div className={styles.successBarFill} style={{ width: `${rate.pct}%`, background: barColor }} />
      </div>
      {rate.failed > 0 && (
        <span className={styles.successBarFailed}>{rate.failed} failed</span>
      )}
    </div>
  )
}

// Cron expression presets
const CRON_PRESETS = [
  { label: 'Every hour', expr: '0 * * * *' },
  { label: 'Daily 8am', expr: '0 8 * * *' },
  { label: 'Daily 6pm', expr: '0 18 * * *' },
  { label: 'Weekly Monday', expr: '0 9 * * 1' },
  { label: 'Every 30min', expr: '*/30 * * * *' },
]

type CronScheduler = 'openclaw' | 'hermes'

interface CronJobActions {
  run?: boolean
  toggle?: boolean
  delete?: boolean
  model?: boolean
}

interface CronJob {
  id: string
  sourceId?: string
  scheduler?: CronScheduler
  schedulerLabel?: string
  actions?: CronJobActions
  name: string
  schedule: string
  status: string
  enabled: boolean
  lastRun: string | null
  nextRun: string | null
  duration: string | null
  target: string
  payload: string
  model?: string
  thinking?: string
  description: string
  history: CronHistoryEntry[]
}

interface CronApiResponse {
  jobs?: CronJob[]
}

interface CronModelResponse {
  id?: string
  name?: string
}

interface CreateCronJobPayload {
  name: string
  schedule: {
    kind: 'cron'
    expr: string
  }
  sessionTarget: string
  payload: {
    kind: string
    message: string
    model?: string
  }
  enabled: boolean
}

const FALLBACK_MODEL_OPTIONS = [
  { value: 'openai-codex/gpt-5.5', label: 'GPT-5.5' },
]

const CRON_MODEL_ALIASES: Record<string, string> = {
  'local-qwen3.6-35b-a3b-nvfp4': 'ollama/qwen3.6:35b-a3b-nvfp4',
}

const CLOUD_AGENT_MODEL = 'openai-codex/gpt-5.5'
const DISALLOWED_CLOUD_MODEL_RE = /^(anthropic\/|claude-cli\/|openrouter\/|qwen\/|minimax|minimax-portal\/|openai\/gpt-5\.4|openai-codex\/gpt-5\.[234])/i

function getCronScheduler(job?: CronJob): CronScheduler {
  return job?.scheduler === 'hermes' ? 'hermes' : 'openclaw'
}

function getCronSchedulerLabel(job?: CronJob) {
  return job?.schedulerLabel || (getCronScheduler(job) === 'hermes' ? 'Hermes' : 'OpenClaw')
}

function getCronSchedulerColor(job?: CronJob) {
  return getCronScheduler(job) === 'hermes' ? '#64D2FF' : '#BF5AF2'
}

function SchedulerBadge({ job }: { job: CronJob }) {
  const color = getCronSchedulerColor(job)
  return (
    <span
      className={styles.schedulerBadge}
      style={{ '--scheduler-color': color } as CSSProperties}
    >
      {getCronSchedulerLabel(job)}
    </span>
  )
}

function isDisallowedCloudModel(id: string) {
  const key = String(id || '').trim()
  return !!key && key !== CLOUD_AGENT_MODEL && DISALLOWED_CLOUD_MODEL_RE.test(key)
}

function normalizeCronModelValue(id?: string) {
  const key = String(id || '').trim()
  return CRON_MODEL_ALIASES[key] || key
}

function formatCronModelLabel(id: string, name?: string) {
  const key = String(id || '').trim()
  const base = String(name || key || '').trim() || 'Unknown model'
  if (!key) return base
  const localSuffixNeeded = key.startsWith('ollama/') && !key.includes(':cloud') && !/\((local|ollama)\)$/i.test(base)
  return localSuffixNeeded ? `${base} (local)` : base
}

function buildCronModelOptions(models: CronModelResponse[] = [], jobs: CronJob[] = []) {
  const byId = new Map<string, { value: string; label: string }>()
  const registryIds = new Set<string>()
  const add = (value: string, label?: string, fromCurrentJobOnly = false) => {
    const key = normalizeCronModelValue(value)
    if (!fromCurrentJobOnly && isDisallowedCloudModel(key)) return
    if (!key) return
    const next = { value: key, label: formatCronModelLabel(key, label) }
    if (byId.has(key)) {
      if (!fromCurrentJobOnly) byId.set(key, next)
      return
    }
    byId.set(key, next)
  }

  for (const model of models || []) {
    const id = normalizeCronModelValue(String(model?.id || ''))
    if (id && !isDisallowedCloudModel(id)) registryIds.add(id)
    add(id, String(model?.name || model?.id || ''))
  }
  for (const fallback of FALLBACK_MODEL_OPTIONS) add(fallback.value, fallback.label)
  for (const job of jobs || []) {
    const rawModel = String(job?.model || '')
    const normalizedModel = normalizeCronModelValue(rawModel)
    const isAlias = rawModel.trim() !== normalizedModel
    const fromCurrentJobOnly = !!normalizedModel && !registryIds.has(normalizedModel) && !FALLBACK_MODEL_OPTIONS.some((option) => option.value === normalizedModel)
    add(normalizedModel, isAlias ? `${rawModel} → ${normalizedModel}` : normalizedModel, fromCurrentJobOnly)
  }

  return [{ value: '', label: 'Default' }, ...Array.from(byId.values())]
}

type CronOverlapMarker = {
  count: number
  label: string
  detail: string
}

function formatOverlapMinute(dateStr?: string | null) {
  if (!dateStr) return null
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function buildCronOverlapMarkers(jobs: CronJob[]) {
  const markers = new Map<string, CronOverlapMarker>()
  const nextRunBuckets = new Map<string, CronJob[]>()
  const scheduleBuckets = new Map<string, CronJob[]>()

  for (const job of jobs || []) {
    if (!job?.enabled) continue

    if (job.nextRun) {
      const key = job.nextRun.slice(0, 16)
      const bucket = nextRunBuckets.get(key) || []
      bucket.push(job)
      nextRunBuckets.set(key, bucket)
      continue
    }

    const parts = String(job.schedule || '').trim().split(/\s+/)
    if (parts.length < 2) continue
    const [minute, hour] = parts
    if (!minute || !hour || minute === '*') continue
    const key = `${hour}|${minute}`
    const bucket = scheduleBuckets.get(key) || []
    bucket.push(job)
    scheduleBuckets.set(key, bucket)
  }

  for (const bucket of nextRunBuckets.values()) {
    if (bucket.length < 2) continue
    const label = formatOverlapMinute(bucket[0]?.nextRun) || 'same minute'
    const detail = `${bucket.length} jobs share the next execution window`
    for (const job of bucket) {
      markers.set(job.id, { count: bucket.length, label: `Overlap ${label}`, detail })
    }
  }

  for (const [key, bucket] of scheduleBuckets.entries()) {
    if (bucket.length < 2) continue
    const [hour, minute] = key.split('|')
    const label = hour === '*'
      ? `Overlap :${minute.padStart(2, '0')}`
      : `Overlap ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    const detail = `${bucket.length} enabled jobs share the same cron slot`
    for (const job of bucket) {
      if (!markers.has(job.id)) {
        markers.set(job.id, { count: bucket.length, label, detail })
      }
    }
  }

  return {
    markers,
    affectedJobs: markers.size,
    windows: new Set(Array.from(markers.values()).map((marker) => marker.label)).size,
  }
}


interface CreateJobModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (job: CreateCronJobPayload) => void
  modelOptions: { value: string; label: string }[]
}

function CreateJobModal({ isOpen, onClose, onSubmit, modelOptions }: CreateJobModalProps) {
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

    const job: CreateCronJobPayload = {
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
    <div className={m ? `${styles.modalOverlay} ${styles.modalOverlayMobile}` : styles.modalOverlay}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className={m ? `${styles.modalPanel} ${styles.modalPanelMobile}` : styles.modalPanel}
      >
        <div className={m ? `${styles.modalHeader} ${styles.modalHeaderMobile}` : styles.modalHeader}>
          <h2 className={m ? `${styles.modalTitle} ${styles.modalTitleMobile}` : styles.modalTitle}>
            <Plus size={m ? 16 : 18} className={styles.iconBlue} />
            Create Cron Job
          </h2>
          <button
            onClick={onClose}
            className={styles.modalClose}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className={m ? `${styles.modalForm} ${styles.modalFormMobile}` : styles.modalForm}>
          {/* Name */}
          <div>
            <label className={styles.fieldLabel}>
              Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Check emails"
              className={m ? `${styles.fieldInput} ${styles.fieldInputMobile}` : styles.fieldInput}
            />
          </div>

          {/* Schedule */}
          <div>
            <label className={styles.fieldLabel}>
              Schedule
            </label>
            <input
              type="text"
              value={formData.schedule}
              onChange={(e) => setFormData(prev => ({ ...prev, schedule: e.target.value }))}
              placeholder="0 8 * * * (daily at 8am)"
              className={m
                ? `${styles.fieldInput} ${styles.fieldInputMobile} ${styles.fieldInputMono}`
                : `${styles.fieldInput} ${styles.fieldInputMono}`}
            />
            <div className={styles.presetRow}>
              {CRON_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handlePresetClick(preset.expr)}
                  className={styles.presetBtn}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <p className={styles.fieldHint}>
              Format: minute hour day month weekday (* = any)
            </p>
          </div>

          {/* Session Target */}
          <div>
            <label className={styles.fieldLabel}>
              Session Target
            </label>
            <select
              value={formData.sessionTarget}
              onChange={(e) => setFormData(prev => ({ ...prev, sessionTarget: e.target.value }))}
              className={m ? `${styles.fieldSelect} ${styles.fieldSelectMobile}` : styles.fieldSelect}
            >
              <option value="main">main</option>
              <option value="isolated">isolated</option>
            </select>
          </div>

          {/* Payload Type */}
          <div>
            <label className={styles.fieldLabel}>
              Payload Type
            </label>
            <select
              value={formData.payloadType}
              onChange={(e) => setFormData(prev => ({ ...prev, payloadType: e.target.value }))}
              className={m ? `${styles.fieldSelect} ${styles.fieldSelectMobile}` : styles.fieldSelect}
            >
              <option value="systemEvent">systemEvent</option>
              <option value="agentTurn">agentTurn</option>
            </select>
          </div>

          {/* Message */}
          <div>
            <label className={styles.fieldLabel}>
              Message
            </label>
            <textarea
              value={formData.message}
              onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
              placeholder="Task description or prompt..."
              rows={3}
              className={m ? `${styles.fieldTextarea} ${styles.fieldTextareaMobile}` : styles.fieldTextarea}
            />
          </div>

          {/* Model (optional, only if agentTurn) */}
          {formData.payloadType === 'agentTurn' && (
            <div>
              <label className={styles.fieldLabel}>
                Model (Optional)
              </label>
              <select
                value={formData.model}
                onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))}
                className={m ? `${styles.fieldSelect} ${styles.fieldSelectMobile}` : styles.fieldSelect}
              >
                {modelOptions.map((option) => (
                  <option key={option.value || 'default'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Actions */}
          <div className={m ? `${styles.modalActions} ${styles.modalActionsMobile}` : styles.modalActions}>
            <button
              type="button"
              onClick={onClose}
              className={m ? `${styles.cancelBtn} ${styles.cancelBtnMobile}` : styles.cancelBtn}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={m ? `${styles.submitBtn} ${styles.submitBtnMobile}` : styles.submitBtn}
            >
              Create Job
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

function ToggleSwitch({ enabled, onChange, disabled = false }: { enabled: boolean; onChange: (enabled: boolean) => void; disabled?: boolean }) {
  // background and opacity are dynamic (depend on enabled + disabled state)
  const trackBg = disabled
    ? (enabled ? 'rgba(50,215,75,0.45)' : 'rgba(255,255,255,0.13)')
    : (enabled ? '#32D74B' : 'rgba(255,255,255,0.2)')

  return (
    <div
      onClick={() => { if (!disabled) onChange(!enabled) }}
      className={styles.toggleTrack}
      style={{
        background: trackBg,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.65 : 1,
      }}
    >
      <div
        className={styles.toggleThumb}
        style={{ left: enabled ? 22 : 2 }}
      />
    </div>
  )
}

export default function Cron() {
  const m = useIsMobile()
  const { data, loading, error, refetch } = useApi<CronApiResponse>('/api/cron', 30000)
  const { data: modelsData } = useApi<CronModelResponse[]>('/api/models', 60000)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [jobSearch, setJobSearch] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled' | 'failed' | 'overlap'>('all')
  const [schedulerFilter, setSchedulerFilter] = useState<'all' | CronScheduler>('all')
  const jobs = useMemo<CronJob[]>(() => data?.jobs || [], [data?.jobs])
  const modelOptions = useMemo(
    () => buildCronModelOptions(Array.isArray(modelsData) ? modelsData : [], jobs),
    [modelsData, jobs]
  )
  const modelLabelByValue = useMemo(
    () => new Map(modelOptions.map((option) => [option.value, option.label])),
    [modelOptions]
  )
  const displayCronModel = (model?: string) => {
    const normalized = normalizeCronModelValue(model) || ''
    return modelLabelByValue.get(normalized) || normalized || 'Default'
  }
  const overlapState = useMemo(() => buildCronOverlapMarkers(jobs), [jobs])
  const filteredJobs = useMemo(() => {
    const query = jobSearch.trim().toLowerCase()
    let result = jobs
    if (schedulerFilter !== 'all') result = result.filter((job) => getCronScheduler(job) === schedulerFilter)
    if (query) {
      result = result.filter((job) => [
        job.name,
        job.id,
        job.sourceId,
        job.description,
        getCronSchedulerLabel(job),
      ].some((value) => String(value || '').toLowerCase().includes(query)))
    }
    if (statusFilter === 'overlap') {
      result = result.filter((job) => overlapState.markers.has(job.id))
    } else if (statusFilter !== 'all') {
      result = result.filter((job) => normalizeCronStatus(job.status, job.enabled) === statusFilter)
    }
    return [...result].sort((left, right) => {
      const order = { openclaw: 0, hermes: 1 } as const
      const schedulerOrder = order[getCronScheduler(left)] - order[getCronScheduler(right)]
      if (schedulerOrder !== 0) return schedulerOrder
      return String(left.name || '').localeCompare(String(right.name || ''))
    })
  }, [jobs, jobSearch, overlapState, schedulerFilter, statusFilter])

  const handleSummaryFilterClick = (filterKey: 'all' | 'active' | 'disabled' | 'failed' | 'overlap') => {
    setStatusFilter((current) => current === filterKey ? 'all' : filterKey)
  }

  const handleToggle = async (job: CronJob, enabled: boolean) => {
    if (job.actions?.toggle === false) return
    const jobId = job.id
    setActionLoading(`toggle-${jobId}`)
    try {
      const response = await fetch(`/api/cron/${jobId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled, scheduler: getCronScheduler(job) })
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

  const handleRun = async (job: CronJob) => {
    if (job.actions?.run === false) return
    const jobId = job.id
    setActionLoading(`run-${jobId}`)
    try {
      const response = await fetch(`/api/cron/${jobId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduler: getCronScheduler(job) })
      })
      if (response.ok) {
        const jobName = jobs.find((j) => j.id === jobId)?.name || jobId
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

  const handleDelete = async (job: CronJob) => {
    if (job.actions?.delete === false) return
    const jobId = job.id
    if (!confirm('Are you sure you want to delete this cron job?')) return

    setActionLoading(`delete-${jobId}`)
    try {
      const response = await fetch(`/api/cron/${jobId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduler: getCronScheduler(job) })
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

  const handleCreateJob = async (job: CreateCronJobPayload) => {
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

  const handleModelChange = async (job: CronJob, model: string) => {
    if (job.actions?.model === false) return
    const jobId = job.id
    setActionLoading(`model-${jobId}`)

    try {
      const response = await fetch(`/api/cron/${jobId}/model`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, scheduler: getCronScheduler(job) })
      })

      if (response.ok) {
        const jobName = jobs.find((j) => j.id === jobId)?.name || jobId
        setToast(`✅ "${jobName}" model set to ${model || 'default'}`)
        setTimeout(() => setToast(null), 3000)
        refetch()
      } else {
        const error = await response.json()
        setToast(`❌ Model update failed: ${error.error || 'Unknown error'}`)
        setTimeout(() => setToast(null), 5000)
      }
    } catch (error) {
      setToast(`❌ Error: ${error}`)
      setTimeout(() => setToast(null), 5000)
    }

    setActionLoading(null)
  }

  if (loading && !data) {
    return (
      <PageTransition>
        <div className={styles.loadingWrap}>
          <div className={styles.spinner} />
        </div>
      </PageTransition>
    )
  }

  if (error && !data) {
    return (
      <PageTransition>
        <div className={styles.errorWrap}>
          <GlassCard noPad>
            <div className={m ? `${styles.errorPad} ${styles.errorPadMobile}` : styles.errorPad}>
              <div className={styles.errorTitle}>
                <AlertTriangle size={18} />
                <strong>Cron API unavailable</strong>
              </div>
              <div className={styles.errorMessage}>{error}</div>
              <div>
                <button
                  onClick={refetch}
                  className={styles.retryBtn}
                >
                  Retry
                </button>
              </div>
            </div>
          </GlassCard>
        </div>
      </PageTransition>
    )
  }

  return (
    <>
      <PageTransition>
        <div className={m ? `${styles.page} ${styles.pageMobile}` : styles.page}>
          {/* Header */}
          <div className={styles.headerRow}>
            <PageHeader
              icon={<Clock size={m ? 18 : 22} className={styles.iconBlue} />}
              title="Cron Jobs"
              subtitle="Scheduled jobs that run automatically"
            />
            <button
              onClick={() => setShowCreateModal(true)}
              className={m ? `${styles.createBtn} ${styles.createBtnMobile}` : styles.createBtn}
            >
              <Plus size={m ? 14 : 16} />
              Create Job
            </button>
          </div>

          {/* Toast notification */}
          {toast && (
            <div className={`${styles.toast} ${toast.startsWith('✅') ? styles.toastOk : styles.toastError}`}>
              {toast}
            </div>
          )}

          {/* Summary Cards */}
          <div
            className={styles.summaryGrid}
            style={{ gridTemplateColumns: `repeat(${m ? 2 : 5}, 1fr)`, gap: m ? 8 : 16 }}
          >
            {([
              { key: 'all', label: 'All', icon: Cpu, color: 'rgba(255,255,255,0.5)', count: jobs.length },
              { key: 'active', label: 'Active', icon: Play, color: '#32D74B', count: jobs.filter((j: CronJob) => normalizeCronStatus(j.status, j.enabled) === 'active').length },
              { key: 'disabled', label: 'Disabled', icon: Pause, color: '#FF9500', count: jobs.filter((j: CronJob) => normalizeCronStatus(j.status, j.enabled) === 'disabled').length },
              { key: 'failed', label: 'Failed', icon: AlertTriangle, color: '#FF453A', count: jobs.filter((j: CronJob) => normalizeCronStatus(j.status, j.enabled) === 'failed').length },
              { key: 'overlap', label: 'Overlap', icon: Clock, color: '#BF5AF2', count: overlapState.affectedJobs },
            ] as const).map((item, i) => (
              <GlassCard key={item.label} delay={0.05 + i * 0.05} noPad>
                <div
                  onClick={() => handleSummaryFilterClick(item.key)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleSummaryFilterClick(item.key)
                    }
                  }}
                  aria-pressed={statusFilter === item.key}
                  className={[
                    m ? `${styles.statInner} ${styles.statInnerMobile}` : styles.statInner,
                    statusFilter === item.key ? styles.statInnerActive : '',
                  ].join(' ')}
                  style={{ '--stat-color': item.color } as CSSProperties}
                >
                  <div className={m ? `${styles.statTop} ${styles.statTopMobile}` : styles.statTop}>
                    <div
                      className={m ? `${styles.statIconWrap} ${styles.statIconWrapMobile}` : styles.statIconWrap}
                      style={{ '--stat-color': item.color } as CSSProperties}
                    >
                      <item.icon size={m ? 12 : 14} style={{ color: item.color }} />
                    </div>
                    <span className={m ? `${styles.statLabel} ${styles.statLabelMobile}` : styles.statLabel}>{item.label}</span>
                  </div>
                  <p className={m ? `${styles.statValue} ${styles.statValueMobile}` : styles.statValue}>{item.count}</p>
                </div>
              </GlassCard>
            ))}
          </div>

          <div className={styles.schedulerBar}>
            {([
              { key: 'all', label: 'All schedulers', count: jobs.length, color: 'rgba(255,255,255,0.62)' },
              { key: 'openclaw', label: 'OpenClaw', count: jobs.filter((job) => getCronScheduler(job) === 'openclaw').length, color: '#BF5AF2' },
              { key: 'hermes', label: 'Hermes', count: jobs.filter((job) => getCronScheduler(job) === 'hermes').length, color: '#64D2FF' },
            ] as const).map((item) => (
              <button
                key={item.key}
                onClick={() => setSchedulerFilter(item.key)}
                className={[
                  m ? `${styles.schedulerPill} ${styles.schedulerPillMobile}` : styles.schedulerPill,
                  schedulerFilter === item.key ? styles.schedulerPillActive : '',
                ].join(' ')}
                style={{ '--pill-color': item.color } as CSSProperties}
              >
                {item.label}
                <span className={schedulerFilter === item.key ? `${styles.schedulerPillCount} ${styles.schedulerPillCountActive}` : styles.schedulerPillCount}>
                  {item.count}
                </span>
              </button>
            ))}
          </div>

          {/* Quick Filter Bar */}
          {!m && (
            <div className={styles.filterBar}>
              {([
                { key: 'all', label: 'All Jobs', color: 'rgba(255,255,255,0.6)' },
                { key: 'active', label: 'Active', color: '#32D74B' },
                { key: 'disabled', label: 'Disabled', color: '#FF9500' },
                { key: 'failed', label: 'Failed', color: '#FF453A' },
                { key: 'overlap', label: 'Overlap', color: '#BF5AF2' },
              ] as const).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={[
                    styles.filterBtn,
                    statusFilter === f.key ? styles.filterBtnActive : '',
                  ].join(' ')}
                  style={{ '--filter-color': f.color } as CSSProperties}
                >
                  {f.label}
                  <span className={statusFilter === f.key ? `${styles.filterBtnCount} ${styles.filterBtnCountActive}` : styles.filterBtnCount}>
                    {f.key === 'all'
                      ? jobs.length
                      : f.key === 'active'
                        ? jobs.filter((j: CronJob) => normalizeCronStatus(j.status, j.enabled) === 'active').length
                        : f.key === 'disabled'
                          ? jobs.filter((j: CronJob) => normalizeCronStatus(j.status, j.enabled) === 'disabled').length
                          : f.key === 'failed'
                            ? jobs.filter((j: CronJob) => normalizeCronStatus(j.status, j.enabled) === 'failed').length
                            : overlapState.affectedJobs}
                  </span>
                </button>
              ))}
              <span className={styles.filterCount}>
                {filteredJobs.length !== jobs.length ? `Showing ${filteredJobs.length} of ${jobs.length}` : `${jobs.length} total`}
              </span>
            </div>
          )}

          <div className={styles.searchWrap}>
            <input
              type="text"
              value={jobSearch}
              onChange={(e) => setJobSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && jobSearch) {
                  e.preventDefault()
                  setJobSearch('')
                }
              }}
              placeholder="Search jobs by name, id, scheduler..."
              aria-label="Search cron jobs by name, id, or scheduler"
              className={m ? `${styles.searchInput} ${styles.searchInputMobile}` : styles.searchInput}
            />
            {jobSearch ? (
              <button
                type="button"
                onClick={() => setJobSearch('')}
                aria-label="Clear cron job search"
                title="Clear search"
                className={styles.searchClear}
              >
                <XCircle size={14} />
              </button>
            ) : null}
          </div>

          {/* Jobs — card layout on mobile, table on desktop */}
          {m ? (
            /* MOBILE: Card list */
            <div className={styles.cardList}>
              {filteredJobs.map((job: CronJob, i: number) => (
                (() => {
                  const overlapMarker = overlapState.markers.get(job.id)
                  const showGroupHeader = i === 0 || getCronScheduler(filteredJobs[i - 1]) !== getCronScheduler(job)
                  return (
                <Fragment key={job.id}>
                  {showGroupHeader ? (
                    <div
                      className={styles.groupHeader}
                      style={{
                        margin: i === 0 ? '0 0 2px' : '12px 0 2px',
                        color: getCronSchedulerColor(job),
                      }}
                    >
                      {getCronSchedulerLabel(job)}
                      <span className={styles.groupHeaderCount}>{filteredJobs.filter((candidate) => getCronScheduler(candidate) === getCronScheduler(job)).length} jobs</span>
                    </div>
                  ) : null}
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.03 }}
                >
                  <GlassCard delay={0} noPad>
                    <div className={styles.cardPad}>
                      {overlapMarker ? (
                        <div className={styles.overlapPill}>
                          <Clock size={11} />
                          {overlapMarker.label}
                        </div>
                      ) : null}
                      {/* Top: name + toggle */}
                      <div className={styles.cardTopRow}>
                        <div className={styles.cardNameWrap}>
                          <p className={styles.cardName}>{job.name}</p>
                          <div className={styles.cardSchedulerBadge}><SchedulerBadge job={job} /></div>
                        </div>
                        <ToggleSwitch
                          enabled={job.enabled}
                          onChange={() => handleToggle(job, job.enabled)}
                          disabled={job.actions?.toggle === false}
                        />
                      </div>

                      {/* Schedule */}
                      <code className={styles.scheduleCode}>
                        {job.schedule}
                      </code>

                      {/* Status */}
                      <div className={styles.cardSection}>
                        <StatusBadge status={normalizeCronStatus(job.status, job.enabled)} label={job.enabled ? job.status : 'disabled'} />
                      </div>

                      {/* Success Rate */}
                      {(() => { const sr = calcSuccessRate(job.history); return sr ? (
                        <div className={styles.cardSection}>
                          <p className={styles.cardMiniLabel}>Success Rate</p>
                          <SuccessBar rate={sr} />
                        </div>
                      ) : null })()}

                      {/* Details grid */}
                      <div className={styles.cardDetailsGrid}>
                        <div>
                          <p className={styles.cardDetailLabel}>Last Run</p>
                          <p className={styles.cardDetailValue}>{job.lastRun ? timeAgo(job.lastRun) : '—'}</p>
                        </div>
                        <div>
                          <p className={styles.cardDetailLabel}>Next Run</p>
                          <p className={styles.cardDetailValue}>{job.nextRun ? timeAgo(job.nextRun) : '—'}</p>
                        </div>
                      </div>

                      <div className={styles.cardModelRow}>
                        <p className={styles.cardDetailLabel}>Model</p>
                        <div className={styles.cardModelInner}>
                          <Cpu size={12} color='#8e8e93' />
                          {job.payload === 'agentTurn' ? (
                            <select
                              value={normalizeCronModelValue(job.model) || ''}
                              onChange={(e) => handleModelChange(job, e.target.value)}
                              disabled={actionLoading === `model-${job.id}` || job.actions?.model === false}
                              title={`Change model: ${displayCronModel(job.model)}`}
                              className={styles.modelSelect}
                              style={{
                                cursor: (actionLoading === `model-${job.id}` || job.actions?.model === false) ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {modelOptions.map((option) => (
                                <option key={option.value || 'default'} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={styles.modelText}>{job.model || 'session default'}</span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className={styles.cardActions}>
                        <button
                          onClick={() => handleRun(job)}
                          disabled={actionLoading === `run-${job.id}` || job.actions?.run === false}
                          className={[
                            styles.runBtnCard,
                            (actionLoading === `run-${job.id}` || job.actions?.run === false) ? styles.btnDisabled : '',
                          ].join(' ')}
                        >
                          {actionLoading === `run-${job.id}` ? (
                            <RotateCcw size={12} className={styles.spinIcon} />
                          ) : (
                            <Play size={12} />
                          )}
                          Run Now
                        </button>
                        <button
                          onClick={() => handleDelete(job)}
                          disabled={actionLoading === `delete-${job.id}` || job.actions?.delete === false}
                          className={[
                            styles.deleteBtnCard,
                            (actionLoading === `delete-${job.id}` || job.actions?.delete === false) ? styles.btnDisabled : '',
                          ].join(' ')}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
                </Fragment>
                  )
                })()
              ))}
            </div>
          ) : (
            /* DESKTOP: Table */
            <GlassCard delay={0.2} hover={false} noPad>
              <div className={styles.tableWrap}>
                <div className={styles.tableInner}>
              <div className={`${styles.tableGrid} ${styles.tableHead}`}>
                {['Name', 'Source', 'Schedule', 'Status', 'Last Run', 'Next Run', 'Model', 'Actions'].map((h) => (
                  <span key={h} className={styles.tableHeadCell}>{h}</span>
                ))}
              </div>
              {filteredJobs.map((job: CronJob, i: number) => {
                const normStatus = normalizeCronStatus(job.status, job.enabled)
                const isFailed = normStatus === 'failed'
                const sr = calcSuccessRate(job.history)
                const overlapMarker = overlapState.markers.get(job.id)
                const showGroupHeader = i === 0 || getCronScheduler(filteredJobs[i - 1]) !== getCronScheduler(job)
                return (
                  <Fragment key={job.id}>
                    {showGroupHeader ? (
                      <div
                        className={styles.tableGroupHeader}
                        style={{
                          borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.08)',
                          background: `${getCronSchedulerColor(job)}10`,
                          color: getCronSchedulerColor(job),
                        }}
                      >
                        {getCronSchedulerLabel(job)} · {filteredJobs.filter((candidate) => getCronScheduler(candidate) === getCronScheduler(job)).length} jobs
                      </div>
                    ) : null}
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.25 + i * 0.04 }}
                    className={[styles.tableGrid, styles.tableRow, isFailed ? styles.tableRowFailed : ''].join(' ')}
                    onMouseEnter={(e) => {
                      if (!isFailed) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isFailed ? 'rgba(255,69,58,0.06)' : 'transparent'
                    }}
                  >
                    {/* Name */}
                    <div className={styles.tableCell}>
                      <p title={job.name} className={[styles.cellName, isFailed ? styles.cellNameFailed : ''].join(' ')}>{job.name}</p>
                      <p title={job.sourceId || job.id} className={styles.cellId}>{job.sourceId || job.id}</p>
                    </div>
                    <div className={styles.tableCell}><SchedulerBadge job={job} /></div>
                    {/* Schedule */}
                    <div className={styles.tableCell}>
                      <div className={styles.scheduleColInner}>
                        <code className={styles.scheduleCodeDesktop}>{job.schedule}</code>
                        {overlapMarker ? (
                          <span title={overlapMarker.detail} className={styles.overlapTag}>
                            <Clock size={10} />
                            {overlapMarker.count} jobs
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {/* Status */}
                    <div className={`${styles.tableCell} ${styles.statusCell}`}>
                      <ToggleSwitch
                        enabled={job.enabled}
                        onChange={() => handleToggle(job, job.enabled)}
                        disabled={job.actions?.toggle === false}
                      />
                      <div className={styles.statusCellInner}>
                        <StatusBadge status={normStatus} label={job.enabled ? job.status : 'disabled'} />
                        {sr ? <div className={styles.successBarWrap}><SuccessBar rate={sr} /></div> : null}
                      </div>
                    </div>
                    {/* Last Run */}
                    <div className={styles.tableCell}>
                      {job.lastRun ? (
                        <>
                          <p className={styles.timeCell}>{timeAgo(job.lastRun)}</p>
                          <p className={styles.timeCellSub}>{formatDate(job.lastRun)}</p>
                        </>
                      ) : <span className={styles.timeCellEmpty}>—</span>}
                    </div>
                    {/* Next Run */}
                    <div className={styles.tableCell}>
                      {job.nextRun ? (
                        <>
                          <p className={styles.timeCell}>{timeAgo(job.nextRun)}</p>
                          <p className={styles.timeCellSub}>{formatDate(job.nextRun)}</p>
                        </>
                      ) : <span className={styles.timeCellEmpty}>—</span>}
                    </div>
                    {/* Model */}
                    <div className={`${styles.tableCell} ${styles.modelCell}`}>
                      <Cpu size={12} color='#8e8e93' />
                      {job.payload === 'agentTurn' ? (
                        <select
                          value={normalizeCronModelValue(job.model) || ''}
                          onChange={(e) => handleModelChange(job, e.target.value)}
                          disabled={actionLoading === `model-${job.id}` || job.actions?.model === false}
                          aria-label={`Change model for ${job.name}`}
                          title={`Change model: ${displayCronModel(job.model)}`}
                          className={styles.modelSelectDesktop}
                          style={{
                            cursor: (actionLoading === `model-${job.id}` || job.actions?.model === false) ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {modelOptions.map((option) => (
                            <option key={option.value || 'default'} value={option.value} title={option.value || 'Default'}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={styles.modelTextDesktop}>{job.model || 'default'}</span>
                      )}
                    </div>
                    {/* Actions */}
                    <div className={`${styles.tableCell} ${styles.actionsCell}`}>
                      <button
                        onClick={() => handleRun(job)}
                        disabled={actionLoading === `run-${job.id}` || job.actions?.run === false}
                        title="Run now"
                        className={[
                          styles.runBtn,
                          (actionLoading === `run-${job.id}` || job.actions?.run === false) ? styles.btnDisabled : '',
                        ].join(' ')}
                      >
                        {actionLoading === `run-${job.id}` ? (
                          <RotateCcw size={14} className={styles.spinIcon} />
                        ) : (
                          <Play size={14} />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(job)}
                        disabled={actionLoading === `delete-${job.id}` || job.actions?.delete === false}
                        title="Delete"
                        className={[
                          styles.deleteBtn,
                          (actionLoading === `delete-${job.id}` || job.actions?.delete === false) ? styles.btnDisabled : '',
                        ].join(' ')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </motion.div>
                  </Fragment>
                )
              })}
                </div>
              </div>
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
        modelOptions={modelOptions}
      />
        )}
      </AnimatePresence>
    </>
  )
}
