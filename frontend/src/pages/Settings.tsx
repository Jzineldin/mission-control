/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { Settings2, Save, RefreshCw, Shield, Database, Globe, Download, Upload, Clock, Zap } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import { useIsMobile } from '../lib/useIsMobile'
import GlassCard from '../components/GlassCard'
import StatusBadge from '../components/StatusBadge'
import { useApi } from '../lib/hooks'
import { TEXT, COLORS, GLASS } from '../lib/theme'


function formatUptime(seconds: number): string {
  if (!seconds) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const mn = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${mn}m`
  return `${mn}m`
}

export default function Settings() {
  const isMobile = useIsMobile()
  const { data: configData } = useApi<any>('/api/settings')
  const { data: sysinfo } = useApi<any>('/api/settings/sysinfo', 0)

  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '16px' : '0', display: 'flex', flexDirection: 'column', gap: isMobile ? 16 : 24 }}>
        {/* Header */}
        <div>
          <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Settings2 size={22} style={{ color: COLORS.blue }} /> Settings
          </h1>
          <p className="text-body" style={{ marginTop: 4 }}>Gateway configuration, model routing & preferences</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 16 : 20 }}>
          {/* Model Routing Card */}
          <ModelRoutingCard isMobile={isMobile} />

          {/* OpenClaw Configuration Card */}
          <GlassCard noPad>
            <div style={{ padding: isMobile ? 16 : 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(191,90,242,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Shield size={18} style={{ color: COLORS.purple }} />
                </div>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: TEXT.primary }}>OpenClaw Configuration</h2>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  { label: 'Gateway Port', value: configData?.gateway_port || 18789 },
                  { label: 'Memory Path', value: configData?.memory_path || '/home/ubuntu/clawd/memory', mono: true },
                  { label: 'Skills Path', value: configData?.skills_path || '/home/ubuntu/clawd/skills', mono: true },
                  { label: 'AWS Region', value: configData?.bedrock_region || 'us-east-1', mono: true },
                ].map((item) => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', gap: 12 }}>
                    <span style={{ fontSize: 13, color: TEXT.secondary, flexShrink: 0 }}>{item.label}</span>
                    <span style={{ fontSize: 12, color: TEXT.primary, fontFamily: item.mono ? 'monospace' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{String(item.value)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
                  <span style={{ fontSize: 13, color: TEXT.secondary }}>Status</span>
                  <StatusBadge status="active" label="Connected" />
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Heartbeat Configuration Card */}
          <HeartbeatConfigCard isMobile={isMobile} />

          {/* System Information Card */}
          <GlassCard noPad>
            <div style={{ padding: isMobile ? 16 : 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,149,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Database size={18} style={{ color: COLORS.orange }} />
                </div>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: TEXT.primary }}>System Information</h2>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  { label: 'Mission Control Version', value: sysinfo?.mcVersion || '—' },
                  { label: 'OpenClaw Version', value: sysinfo?.openclawVersion || '—' },
                  { label: 'Node.js Version', value: sysinfo?.node || '—' },
                  { label: 'Platform', value: sysinfo?.platform || '—' },
                  { label: 'Uptime', value: sysinfo ? formatUptime(sysinfo.uptime) : '—' },
                ].map((item) => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ fontSize: 13, color: TEXT.secondary }}>{item.label}</span>
                    <span style={{ fontSize: 13, color: TEXT.primary }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>

          {/* Export/Import Configuration Card */}
          <ExportImportCard isMobile={isMobile} />
        </div>
      </div>
    </PageTransition>
  )
}

function ModelRoutingCard({ isMobile }: { isMobile: boolean }) {
  const [routing, setRouting] = useState({ main: '', subagent: '', heartbeat: '' })
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  
  // Load current model from /api/status
  const { data: statusData } = useApi<any>('/api/status')

  useEffect(() => {
    if (statusData?.agent?.model) {
      // Extract the full model ID from the current agent model
      const currentModel = statusData.agent.model
      // Map display names back to full model IDs (best effort)
      const modelMapping: Record<string, string> = {
        'Claude Opus 4': 'us.anthropic.claude-opus-4-6-v1',
        'Claude Sonnet 4': 'us.anthropic.claude-sonnet-4-20250514-v1:0',
        'Claude Haiku 4.5': 'us.anthropic.claude-haiku-4-5-20251001-v1:0'
      }
      
      const fullModelId = modelMapping[currentModel] || currentModel
      setRouting(prev => ({
        ...prev,
        main: fullModelId,
        subagent: prev.subagent || 'us.anthropic.claude-sonnet-4-20250514-v1:0',
        heartbeat: prev.heartbeat || 'us.anthropic.claude-haiku-4-5-20251001-v1:0'
      }))
    }
  }, [statusData])

  const handleSave = async () => {
    setSaving(true)
    setSaveStatus('idle')
    
    try {
      const res = await fetch('/api/settings/model-routing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(routing)
      })
      
      if (res.ok) {
        setSaveStatus('success')
        setTimeout(() => setSaveStatus('idle'), 3000)
      } else {
        setSaveStatus('error')
        setTimeout(() => setSaveStatus('idle'), 3000)
      }
    } catch (_e) {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } finally {
      setSaving(false)
    }
  }

  const MODEL_OPTIONS = [
    { value: 'us.anthropic.claude-opus-4-6-v1', label: 'Claude Opus 4.6 ($$$)' },
    { value: 'us.anthropic.claude-sonnet-4-20250514-v1:0', label: 'Claude Sonnet 4 ($$)' },
    { value: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', label: 'Claude Haiku 4.5 ($)' },
  ]

  const selectStyle = { 
    width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', 
    background: GLASS.surface, color: TEXT.primary, fontSize: 13,
    cursor: 'pointer', appearance: 'none' as const,
    backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23999\' d=\'M6 8L1 3h10z\'/%3E%3C/svg%3E")',
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center',
  }

  return (
    <GlassCard noPad>
      <div style={{ padding: isMobile ? 16 : 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,149,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={18} style={{ color: COLORS.orange }} />
          </div>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: TEXT.primary }}>Model Routing</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="text-label" style={{ display: 'block', marginBottom: 8 }}>Main Model</label>
            <select value={routing.main} onChange={(e) => setRouting({ ...routing, main: e.target.value })} style={selectStyle}>
              {MODEL_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          
          <div>
            <label className="text-label" style={{ display: 'block', marginBottom: 8 }}>Sub-agent Model</label>
            <select value={routing.subagent} onChange={(e) => setRouting({ ...routing, subagent: e.target.value })} style={selectStyle}>
              {MODEL_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          
          <div>
            <label className="text-label" style={{ display: 'block', marginBottom: 8 }}>Heartbeat Model</label>
            <select value={routing.heartbeat} onChange={(e) => setRouting({ ...routing, heartbeat: e.target.value })} style={selectStyle}>
              {MODEL_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px 16px', borderRadius: 10, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
              background: saving ? 'rgba(255,149,0,0.3)' : COLORS.orange,
              color: '#fff', fontSize: 13, fontWeight: 500,
              opacity: saving ? 0.5 : 1,
              transition: 'all 0.2s',
            }}
          >
            {saving ? (
              <>
                <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save size={16} />
                <span>Save Model Routing</span>
              </>
            )}
          </button>

          {saveStatus === 'success' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: COLORS.green, fontSize: 12 }}>
              <span className="status-dot status-dot-green" />
              Model routing saved successfully
            </div>
          )}
          {saveStatus === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: COLORS.red, fontSize: 12 }}>
              <span className="status-dot status-dot-red" />
              Failed to save model routing
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  )
}

function HeartbeatConfigCard({ isMobile }: { isMobile: boolean }) {
  const [interval, setInterval] = useState('1h')
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const intervalOptions = [
    { value: '30min', label: '30 minutes' },
    { value: '1h', label: '1 hour' },
    { value: '2h', label: '2 hours' },
    { value: '4h', label: '4 hours' },
    { value: 'off', label: 'Off' },
  ]

  const handleSave = async () => {
    setSaving(true)
    setSaveStatus('idle')
    
    try {
      const res = await fetch('/api/settings/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval })
      })
      
      if (res.ok) {
        setSaveStatus('success')
        setTimeout(() => setSaveStatus('idle'), 3000)
      } else {
        setSaveStatus('error')
        setTimeout(() => setSaveStatus('idle'), 3000)
      }
    } catch (_e) {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <GlassCard noPad>
      <div style={{ padding: isMobile ? 16 : 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,69,58,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={18} style={{ color: COLORS.red }} />
          </div>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: TEXT.primary }}>Heartbeat Interval</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="text-label" style={{ display: 'block', marginBottom: 8 }}>Check Interval</label>
            <select
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              style={{ 
                width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', 
                background: GLASS.surface, color: TEXT.primary, fontSize: 13,
                cursor: 'pointer'
              }}
            >
              {intervalOptions.map(opt => (
                <option key={opt.value} value={opt.value} style={{ background: '#1a1a1a', color: '#fff' }}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px 16px', borderRadius: 10, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
              background: saving ? 'rgba(255,69,58,0.3)' : COLORS.red,
              color: '#fff', fontSize: 13, fontWeight: 500,
              opacity: saving ? 0.5 : 1,
              transition: 'all 0.2s',
            }}
          >
            {saving ? (
              <>
                <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save size={16} />
                <span>Save Heartbeat Interval</span>
              </>
            )}
          </button>

          {saveStatus === 'success' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: COLORS.green, fontSize: 12 }}>
              <span className="status-dot status-dot-green" />
              Heartbeat interval saved successfully
            </div>
          )}
          {saveStatus === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: COLORS.red, fontSize: 12 }}>
              <span className="status-dot status-dot-red" />
              Failed to save heartbeat interval
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  )
}

function ExportImportCard({ isMobile }: { isMobile: boolean }) {
  const [importing, setImporting] = useState(false)
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const handleExport = () => {
    // Trigger download
    window.location.href = '/api/settings/export'
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setImportStatus('idle')
    
    try {
      const formData = new FormData()
      formData.append('config', file)
      
      const res = await fetch('/api/settings/import', {
        method: 'POST',
        body: formData
      })
      
      if (res.ok) {
        setImportStatus('success')
        setTimeout(() => setImportStatus('idle'), 3000)
      } else {
        setImportStatus('error')
        setTimeout(() => setImportStatus('idle'), 3000)
      }
    } catch (_e) {
      setImportStatus('error')
      setTimeout(() => setImportStatus('idle'), 3000)
    } finally {
      setImporting(false)
      // Clear file input
      e.target.value = ''
    }
  }

  return (
    <GlassCard noPad>
      <div style={{ padding: isMobile ? 16 : 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(50,215,75,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Globe size={18} style={{ color: COLORS.green }} />
          </div>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: TEXT.primary }}>Export / Import</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            onClick={handleExport}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              border: '1px solid rgba(50,215,75,0.3)', background: 'rgba(50,215,75,0.1)',
              color: COLORS.green, fontSize: 13, cursor: 'pointer', fontWeight: 500,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(50,215,75,0.2)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(50,215,75,0.1)' }}
          >
            <Download size={16} />
            Export Configuration
          </button>

          <div style={{ position: 'relative' }}>
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              disabled={importing}
              style={{
                position: 'absolute', width: '100%', height: '100%', opacity: 0, cursor: importing ? 'not-allowed' : 'pointer'
              }}
            />
            <button
              disabled={importing}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                border: '1px solid rgba(0,122,255,0.3)', background: 'rgba(0,122,255,0.1)',
                color: COLORS.blue, fontSize: 13, cursor: importing ? 'not-allowed' : 'pointer', fontWeight: 500,
                opacity: importing ? 0.5 : 1,
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { if (!importing) e.currentTarget.style.background = 'rgba(0,122,255,0.2)' }}
              onMouseLeave={(e) => { if (!importing) e.currentTarget.style.background = 'rgba(0,122,255,0.1)' }}
            >
              {importing ? (
                <>
                  <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <Upload size={16} />
                  <span>Import Configuration</span>
                </>
              )}
            </button>
          </div>

          {importStatus === 'success' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: COLORS.green, fontSize: 12 }}>
              <span className="status-dot status-dot-green" />
              Configuration imported successfully. Restart required.
            </div>
          )}
          {importStatus === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: COLORS.red, fontSize: 12 }}>
              <span className="status-dot status-dot-red" />
              Failed to import configuration
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  )
}
