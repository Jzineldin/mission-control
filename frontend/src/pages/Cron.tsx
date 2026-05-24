import { Fragment, useMemo, useState } from 'react'
import { Clock, Play, Pause, AlertTriangle, XCircle, Plus, Trash2, RotateCcw, Cpu } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import PageTransition from '../components/PageTransition'
import { useIsMobile } from '../lib/useIsMobile'
import GlassCard from '../components/GlassCard'
import StatusBadge from '../components/StatusBadge'
import { useApi, timeAgo, formatDate } from '../lib/hooks'
import { normalizeCronStatus } from '../lib/status'

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 64 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: barColor }}>{rate.rate}</span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{rate.total}x</span>
      </div>
      <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${rate.pct}%`, height: '100%', background: barColor, borderRadius: 2, transition: 'width 0.3s' }} />
      </div>
      {rate.failed > 0 && (
        <span style={{ fontSize: 10, color: '#FF453A' }}>{rate.failed} failed</span>
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
const CRON_TABLE_COLUMNS = 'minmax(0, 1fr) 70px minmax(92px, 0.7fr) 144px 72px 72px 250px 62px'
const CRON_TABLE_GAP = 12

const cronTableGridStyle = {
  display: 'grid',
  gridTemplateColumns: CRON_TABLE_COLUMNS,
  columnGap: CRON_TABLE_GAP,
  alignItems: 'center',
} as const

const cronTableCellStyle = {
  minWidth: 0,
  overflow: 'hidden',
} as const

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
    <span style={{ display: 'inline-flex', alignItems: 'center', width: 'fit-content', padding: '2px 7px', borderRadius: 999, border: `1px solid ${color}55`, background: `${color}18`, color, fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
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
              <select
                value={formData.model}
                onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))}
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
                {modelOptions.map((option) => (
                  <option key={option.value || 'default'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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

function ToggleSwitch({ enabled, onChange, disabled = false }: { enabled: boolean; onChange: (enabled: boolean) => void; disabled?: boolean }) {
  return (
    <div
      onClick={() => { if (!disabled) onChange(!enabled) }}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: disabled ? (enabled ? 'rgba(50,215,75,0.45)' : 'rgba(255,255,255,0.13)') : (enabled ? '#32D74B' : 'rgba(255,255,255,0.2)'),
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
        opacity: disabled ? 0.65 : 1
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
          <div style={{ width: 32, height: 32, border: '2px solid #007AFF', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
      </PageTransition>
    )
  }

  if (error && !data) {
    return (
      <PageTransition>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <GlassCard noPad>
            <div style={{ padding: m ? 16 : 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#FF453A' }}>
                <AlertTriangle size={18} />
                <strong>Cron API unavailable</strong>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>{error}</div>
              <div>
                <button
                  onClick={refetch}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.06)', color: 'white' }}
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
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${m ? 2 : 5}, 1fr)`, gap: m ? 8 : 16 }}>
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
                  style={{
                    padding: m ? '10px 12px' : 20,
                    cursor: 'pointer',
                    borderRadius: 18,
                    border: `1px solid ${statusFilter === item.key ? item.color : 'rgba(255,255,255,0.08)'}`,
                    background: statusFilter === item.key ? `${item.color}14` : 'transparent',
                    boxShadow: statusFilter === item.key ? `inset 0 0 0 1px ${item.color}22` : 'none',
                    transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s, transform 0.15s'
                  }}
                  onMouseEnter={(e) => {
                    if (statusFilter !== item.key) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (statusFilter !== item.key) {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                    }
                  }}
                >
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

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {([
              { key: 'all', label: 'All schedulers', count: jobs.length, color: 'rgba(255,255,255,0.62)' },
              { key: 'openclaw', label: 'OpenClaw', count: jobs.filter((job) => getCronScheduler(job) === 'openclaw').length, color: '#BF5AF2' },
              { key: 'hermes', label: 'Hermes', count: jobs.filter((job) => getCronScheduler(job) === 'hermes').length, color: '#64D2FF' },
            ] as const).map((item) => (
              <button
                key={item.key}
                onClick={() => setSchedulerFilter(item.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: m ? '6px 10px' : '7px 13px',
                  borderRadius: 999,
                  border: `1px solid ${schedulerFilter === item.key ? item.color : 'rgba(255,255,255,0.14)'}`,
                  background: schedulerFilter === item.key ? `${item.color}18` : 'rgba(255,255,255,0.035)',
                  color: schedulerFilter === item.key ? item.color : 'rgba(255,255,255,0.62)',
                  fontSize: 12, fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em'
                }}
              >
                {item.label}
                <span style={{ borderRadius: 999, padding: '1px 7px', background: schedulerFilter === item.key ? item.color : 'rgba(255,255,255,0.13)', color: schedulerFilter === item.key ? 'rgba(0,0,0,0.82)' : 'rgba(255,255,255,0.55)', fontVariantNumeric: 'tabular-nums' }}>{item.count}</span>
              </button>
            ))}
          </div>

          {/* Quick Filter Bar */}
          {!m && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                  style={{
                    padding: '6px 14px',
                    borderRadius: 20,
                    border: '1px solid',
                    borderColor: statusFilter === f.key ? f.color : 'rgba(255,255,255,0.15)',
                    background: statusFilter === f.key ? `${f.color}18` : 'rgba(255,255,255,0.04)',
                    color: statusFilter === f.key ? f.color : 'rgba(255,255,255,0.55)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  onMouseEnter={(e) => {
                    if (statusFilter !== f.key) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                      e.currentTarget.style.color = 'rgba(255,255,255,0.8)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (statusFilter !== f.key) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                      e.currentTarget.style.color = 'rgba(255,255,255,0.55)'
                    }
                  }}
                >
                  {f.label}
                  <span style={{
                    background: statusFilter === f.key ? f.color : 'rgba(255,255,255,0.15)',
                    color: statusFilter === f.key ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.5)',
                    borderRadius: 10,
                    padding: '1px 7px',
                    fontSize: 11,
                    fontWeight: 700,
                  }}>
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
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', alignSelf: 'center', marginLeft: 8 }}>
                {filteredJobs.length !== jobs.length ? `Showing ${filteredJobs.length} of ${jobs.length}` : `${jobs.length} total`}
              </span>
            </div>
          )}

          <div style={{ position: 'relative' }}>
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
              style={{
                width: '100%',
                padding: m ? '10px 40px 10px 12px' : '12px 44px 12px 16px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.9)',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            {jobSearch ? (
              <button
                type="button"
                onClick={() => setJobSearch('')}
                aria-label="Clear cron job search"
                title="Clear search"
                style={{
                  position: 'absolute',
                  top: '50%',
                  right: 10,
                  transform: 'translateY(-50%)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  padding: 0,
                  border: 'none',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.6)',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.14)'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.9)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
                }}
              >
                <XCircle size={14} />
              </button>
            ) : null}
          </div>

          {/* Jobs — card layout on mobile, table on desktop */}
          {m ? (
            /* MOBILE: Card list */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredJobs.map((job: CronJob, i: number) => (
                (() => {
                  const overlapMarker = overlapState.markers.get(job.id)
                  const showGroupHeader = i === 0 || getCronScheduler(filteredJobs[i - 1]) !== getCronScheduler(job)
                  return (
                <Fragment key={job.id}>
                  {showGroupHeader ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: i === 0 ? '0 0 2px' : '12px 0 2px', color: getCronSchedulerColor(job), fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      {getCronSchedulerLabel(job)}
                      <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 700 }}>{filteredJobs.filter((candidate) => getCronScheduler(candidate) === getCronScheduler(job)).length} jobs</span>
                    </div>
                  ) : null}
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.03 }}
                >
                  <GlassCard delay={0} noPad>
                    <div style={{ padding: 14 }}>
                      {overlapMarker ? (
                        <div style={{ marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 999, background: 'rgba(191,90,242,0.14)', border: '1px solid rgba(191,90,242,0.26)', color: '#D8B4FE', fontSize: 11, fontWeight: 600 }}>
                          <Clock size={11} />
                          {overlapMarker.label}
                        </div>
                      ) : null}
                      {/* Top: name + toggle */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{job.name}</p>
                          <div style={{ marginTop: 4 }}><SchedulerBadge job={job} /></div>
                        </div>
                        <ToggleSwitch
                          enabled={job.enabled}
                          onChange={() => handleToggle(job, job.enabled)}
                          disabled={job.actions?.toggle === false}
                        />
                      </div>

                      {/* Schedule */}
                      <code style={{ fontSize: 11, color: '#BF5AF2', background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: 5, fontFamily: 'monospace', display: 'inline-block', marginBottom: 10 }}>
                        {job.schedule}
                      </code>
                      
                      {/* Status */}
                      <div style={{ marginBottom: 10 }}>
                        <StatusBadge status={normalizeCronStatus(job.status, job.enabled)} label={job.enabled ? job.status : 'disabled'} />
                      </div>

                      {/* Success Rate */}
                      {(() => { const sr = calcSuccessRate(job.history); return sr ? (
                        <div style={{ marginBottom: 10 }}>
                          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4, margin: '0 0 4px' }}>Success Rate</p>
                          <SuccessBar rate={sr} />
                        </div>
                      ) : null })()}
                      
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

                      <div style={{ marginBottom: 10 }}>
                        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 2, margin: '0 0 2px' }}>Model</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Cpu size={12} color='#8e8e93' />
                          {job.payload === 'agentTurn' ? (
                            <select
                              value={normalizeCronModelValue(job.model) || ''}
                              onChange={(e) => handleModelChange(job, e.target.value)}
                              disabled={actionLoading === `model-${job.id}` || job.actions?.model === false}
                              title={`Change model: ${displayCronModel(job.model)}`}
                              style={{
                                width: '100%',
                                minWidth: 0,
                                background: 'rgba(255,255,255,0.05)',
                                color: 'rgba(255,255,255,0.85)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 6,
                                padding: '4px 6px',
                                fontSize: 12,
                                margin: 0,
                                cursor: (actionLoading === `model-${job.id}` || job.actions?.model === false) ? 'not-allowed' : 'pointer',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {modelOptions.map((option) => (
                                <option key={option.value || 'default'} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{job.model || 'session default'}</span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <button
                          onClick={() => handleRun(job)}
                          disabled={actionLoading === `run-${job.id}` || job.actions?.run === false}
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
                            cursor: (actionLoading === `run-${job.id}` || job.actions?.run === false) ? 'not-allowed' : 'pointer',
                            transition: 'all 0.15s',
                            opacity: (actionLoading === `run-${job.id}` || job.actions?.run === false) ? 0.45 : 1
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
                          onClick={() => handleDelete(job)}
                          disabled={actionLoading === `delete-${job.id}` || job.actions?.delete === false}
                          style={{
                            padding: '6px 8px',
                            background: 'rgba(255,69,58,0.1)',
                            border: '1px solid rgba(255,69,58,0.2)',
                            borderRadius: 6,
                            color: '#FF453A',
                            cursor: (actionLoading === `delete-${job.id}` || job.actions?.delete === false) ? 'not-allowed' : 'pointer',
                            transition: 'all 0.15s',
                            opacity: (actionLoading === `delete-${job.id}` || job.actions?.delete === false) ? 0.45 : 1
                          }}
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
              <div style={{ overflowX: 'hidden' }}>
                <div style={{ width: '100%' }}>
              <div style={{ ...cronTableGridStyle, padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['Name', 'Source', 'Schedule', 'Status', 'Last Run', 'Next Run', 'Model', 'Actions'].map((h) => (
                  <span key={h} style={{ ...cronTableCellStyle, color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', whiteSpace: 'nowrap' }}>{h}</span>
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
                      <div style={{ padding: '10px 16px', borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.05)', background: `${getCronSchedulerColor(job)}10`, color: getCronSchedulerColor(job), fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        {getCronSchedulerLabel(job)} · {filteredJobs.filter((candidate) => getCronScheduler(candidate) === getCronScheduler(job)).length} jobs
                      </div>
                    ) : null}
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.25 + i * 0.04 }}
                    style={{
                      ...cronTableGridStyle,
                      padding: '13px 16px',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      boxShadow: isFailed ? 'inset 3px 0 0 #FF453A' : 'inset 3px 0 0 transparent',
                      background: isFailed ? 'rgba(255,69,58,0.06)' : 'transparent',
                      transition: 'background 0.15s, box-shadow 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isFailed) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isFailed ? 'rgba(255,69,58,0.06)' : 'transparent'
                    }}
                  >
                    {/* Name */}
                    <div style={cronTableCellStyle}>
                      <p title={job.name} style={{ fontSize: 13, fontWeight: 600, color: isFailed ? '#FF6B6B' : 'rgba(255,255,255,0.92)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.25, margin: 0 }}>{job.name}</p>
                      <p title={job.sourceId || job.id} style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', margin: '2px 0 0' }}>{job.sourceId || job.id}</p>
                    </div>
                    <div style={cronTableCellStyle}><SchedulerBadge job={job} /></div>
                    {/* Schedule */}
                    <div style={cronTableCellStyle}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                        <code style={{ maxWidth: '100%', fontSize: 12, color: '#BF5AF2', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', padding: '4px 8px', borderRadius: 6, fontFamily: 'monospace', lineHeight: 1.35, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{job.schedule}</code>
                        {overlapMarker ? (
                          <span title={overlapMarker.detail} style={{ display: 'inline-flex', width: 'fit-content', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 999, background: 'rgba(191,90,242,0.14)', border: '1px solid rgba(191,90,242,0.24)', color: '#D8B4FE', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                            <Clock size={10} />
                            {overlapMarker.count} jobs
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {/* Status */}
                    <div style={{ ...cronTableCellStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ToggleSwitch
                        enabled={job.enabled}
                        onChange={() => handleToggle(job, job.enabled)}
                        disabled={job.actions?.toggle === false}
                      />
                      <div style={{ minWidth: 0 }}>
                        <StatusBadge status={normStatus} label={job.enabled ? job.status : 'disabled'} />
                        {sr ? <div style={{ marginTop: 4, width: 58 }}><SuccessBar rate={sr} /></div> : null}
                      </div>
                    </div>
                    {/* Last Run */}
                    <div style={cronTableCellStyle}>
                      {job.lastRun ? (
                        <>
                          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', margin: 0 }}>{timeAgo(job.lastRun)}</p>
                          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>{formatDate(job.lastRun)}</p>
                        </>
                      ) : <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>—</span>}
                    </div>
                    {/* Next Run */}
                    <div style={cronTableCellStyle}>
                      {job.nextRun ? (
                        <>
                          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', margin: 0 }}>{timeAgo(job.nextRun)}</p>
                          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>{formatDate(job.nextRun)}</p>
                        </>
                      ) : <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>—</span>}
                    </div>
                    {/* Model */}
                    <div style={{ ...cronTableCellStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Cpu size={12} color='#8e8e93' />
                      {job.payload === 'agentTurn' ? (
                        <select
                          value={normalizeCronModelValue(job.model) || ''}
                          onChange={(e) => handleModelChange(job, e.target.value)}
                          disabled={actionLoading === `model-${job.id}` || job.actions?.model === false}
                          aria-label={`Change model for ${job.name}`}
                          title={`Change model: ${displayCronModel(job.model)}`}
                          style={{
                            width: '100%',
                            minWidth: 0,
                            background: 'rgba(255,255,255,0.05)',
                            color: 'rgba(255,255,255,0.85)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 6,
                            padding: '4px 6px',
                            fontSize: 12,
                            cursor: (actionLoading === `model-${job.id}` || job.actions?.model === false) ? 'not-allowed' : 'pointer',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {modelOptions.map((option) => (
                            <option key={option.value || 'default'} value={option.value} title={option.value || 'Default'}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{job.model || 'default'}</span>
                      )}
                    </div>
                    {/* Actions */}
                    <div style={{ ...cronTableCellStyle, display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                      <button
                        onClick={() => handleRun(job)}
                        disabled={actionLoading === `run-${job.id}` || job.actions?.run === false}
                        title="Run now"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 28,
                          height: 26,
                          background: 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 6,
                          color: 'rgba(255,255,255,0.8)',
                          cursor: (actionLoading === `run-${job.id}` || job.actions?.run === false) ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s',
                          opacity: (actionLoading === `run-${job.id}` || job.actions?.run === false) ? 0.45 : 1
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
                        onClick={() => handleDelete(job)}
                        disabled={actionLoading === `delete-${job.id}` || job.actions?.delete === false}
                        title="Delete"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 28,
                          height: 26,
                          background: 'rgba(255,69,58,0.1)',
                          border: '1px solid rgba(255,69,58,0.2)',
                          borderRadius: 6,
                          color: '#FF453A',
                          cursor: (actionLoading === `delete-${job.id}` || job.actions?.delete === false) ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s',
                          opacity: (actionLoading === `delete-${job.id}` || job.actions?.delete === false) ? 0.45 : 1
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
