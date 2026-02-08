import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Settings2, ChevronDown, Save, RefreshCw, Shield, Database, Cpu, Globe, Download, Upload, Clock, Zap, DollarSign, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import { useIsMobile } from '../lib/useIsMobile'
import { useApi } from '../lib/hooks'
import GlassCard from '../components/GlassCard'
import StatusBadge from '../components/StatusBadge'

interface OpenClawConfig {
  model?: string
  available_models?: string[]
  gateway_port?: number
  token?: string
  memory_path?: string
  skills_path?: string
  bedrock_region?: string
}

export default function Settings() {
  const isMobile = useIsMobile()
  const { data: configData, refetch } = useApi<OpenClawConfig>('/api/settings')
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const { data: modelsData } = useApi<{ id: string; name: string }[]>('/api/models')

  const availableModels = (modelsData || []).map(m => ({
    id: m.id,
    name: m.name,
    description: m.name.includes('Opus') ? 'Most capable model' : m.name.includes('Sonnet') ? 'Balanced performance' : 'Fast and efficient',
  }))

  useEffect(() => {
    if (configData?.model) {
      setSelectedModel(configData.model)
    }
  }, [configData])

  const handleModelSwitch = async () => {
    if (selectedModel === configData?.model) return

    setSaving(true)
    setSaveStatus('idle')

    try {
      const response = await fetch('/api/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel })
      })

      if (response.ok) {
        setSaveStatus('success')
        setTimeout(() => setSaveStatus('idle'), 3000)
        refetch()
      } else {
        setSaveStatus('error')
        setTimeout(() => setSaveStatus('idle'), 3000)
      }
    } catch (error) {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } finally {
      setSaving(false)
    }
  }

  const getCurrentModelName = () => {
    if (!selectedModel) return 'Select Model'
    const model = availableModels.find(m => m.id === selectedModel)
    if (model) return model.name
    // Fallback: extract a readable name from the model ID
    const cleaned = selectedModel
      .replace(/^(us\.)?anthropic\./, '')
      .replace(/-v\d.*$/, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
    return cleaned || selectedModel
  }

  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '16px' : '0', display: 'flex', flexDirection: 'column', gap: isMobile ? 16 : 24 }}>
        {/* Header */}
        <div>
          <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Settings2 size={22} style={{ color: '#007AFF' }} /> Settings
          </h1>
          <p className="text-body" style={{ marginTop: 4 }}>Gateway configuration, model routing & preferences</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 16 : 20 }}>
          {/* Model Routing Card */}
          <GatewayHealthCard isMobile={isMobile} />
          <ModelRoutingCard isMobile={isMobile} />

          {/* OpenClaw Configuration Card */}
          <GlassCard noPad>
            <div style={{ padding: isMobile ? 16 : 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(191,90,242,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Shield size={18} style={{ color: '#BF5AF2' }} />
                </div>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>OpenClaw Configuration</h2>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  { label: 'Gateway Port', value: configData?.gateway_port || 18789 },
                  { label: 'Memory Path', value: configData?.memory_path || '/home/ubuntu/clawd/memory', mono: true },
                  { label: 'Skills Path', value: configData?.skills_path || '/home/ubuntu/clawd/skills', mono: true },
                  { label: 'AWS Region', value: configData?.bedrock_region || 'us-east-1', mono: true },
                ].map((item) => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', gap: 12 }}>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', flexShrink: 0 }}>{item.label}</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.92)', fontFamily: item.mono ? 'monospace' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{String(item.value)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>Status</span>
                  <StatusBadge status="active" label="Connected" />
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Heartbeat Configuration Card */}
          <HeartbeatConfigCard isMobile={isMobile} />

          {/* Budget Alerts Card */}
          <BudgetConfigCard isMobile={isMobile} />

          {/* System Information Card */}
          <SystemInformationCard isMobile={isMobile} />

          {/* Export/Import Configuration Card */}
          <ExportImportCard isMobile={isMobile} />
        </div>
      </div>
    </PageTransition>
  )
}

function GatewayHealthCard({ isMobile }: { isMobile: boolean }) {
  const { data: statusData } = useApi<any>('/api/status')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/status')
      if (!res.ok) throw new Error('Server error')
      const data = await res.json()
      
      // Check if agent data is populated (means gateway is connected)
      if (data?.agent?.model && data.agent.model !== '—') {
        setTestResult({ ok: true, message: `Connected! Model: ${data.agent.model}` })
      } else {
        setTestResult({ ok: false, message: 'Server running but gateway not responding. Check your gateway token and ensure OpenClaw is running.' })
      }
    } catch {
      setTestResult({ ok: false, message: 'Cannot reach Mission Control server. Is it running on port 3333?' })
    } finally {
      setTesting(false)
    }
  }

  const isConnected = statusData?.agent?.model && statusData.agent.model !== '—'

  return (
    <GlassCard noPad>
      <div style={{ padding: isMobile ? 16 : 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ 
            width: 36, height: 36, borderRadius: 10, 
            background: isConnected ? 'rgba(50,215,75,0.15)' : 'rgba(255,149,0,0.15)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center' 
          }}>
            {isConnected 
              ? <CheckCircle size={18} style={{ color: '#32D74B' }} />
              : <AlertCircle size={18} style={{ color: '#FF9500' }} />
            }
          </div>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>Gateway Connection</h2>
            <p style={{ fontSize: 11, color: isConnected ? '#32D74B' : '#FF9500', fontWeight: 500 }}>
              {isConnected ? 'Connected' : 'Not connected'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>Gateway Port</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontFamily: 'monospace' }}>18789</span>
          </div>
          {statusData?.agent?.model && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>Active Model</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>{statusData.agent.model}</span>
            </div>
          )}
          {statusData?.agent?.channels?.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>Channels</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
                {statusData.agent.channels.filter((c: any) => c.state === 'OK').length}/{statusData.agent.channels.length} active
              </span>
            </div>
          )}
        </div>

        <button
          onClick={handleTestConnection}
          disabled={testing}
          style={{
            width: '100%',
            padding: '10px 16px',
            borderRadius: 8,
            border: '1px solid rgba(0,122,255,0.3)',
            background: testing ? 'rgba(0,122,255,0.08)' : 'rgba(0,122,255,0.12)',
            color: '#007AFF',
            fontSize: 13,
            fontWeight: 600,
            cursor: testing ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {testing ? (
            <>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              Testing…
            </>
          ) : (
            <>
              <RefreshCw size={14} />
              Test Connection
            </>
          )}
        </button>

        {testResult && (
          <div style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 8,
            background: testResult.ok ? 'rgba(50,215,75,0.08)' : 'rgba(255,69,58,0.08)',
            border: `1px solid ${testResult.ok ? 'rgba(50,215,75,0.2)' : 'rgba(255,69,58,0.2)'}`,
            fontSize: 12,
            color: testResult.ok ? '#32D74B' : '#FF453A',
            lineHeight: 1.5,
          }}>
            {testResult.message}
          </div>
        )}
      </div>
    </GlassCard>
  )
}

function ModelRoutingCard({ isMobile }: { isMobile: boolean }) {
  const [routing, setRouting] = useState({ main: '', subagent: '', heartbeat: '' })
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  
  // Load current model from /api/status
  const { data: statusData } = useApi<any>('/api/status')
  // Load available models dynamically
  const { data: modelsData } = useApi<any[]>('/api/models')

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
    } catch (e) {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } finally {
      setSaving(false)
    }
  }

  const availableModels = modelsData || []

  const MODEL_OPTIONS = (() => {
    // Dynamic: from /api/models
    if (availableModels.length > 0) {
      const costTier = (id: string) => {
        if (id.includes('opus')) return '$$$'
        if (id.includes('sonnet') || id.includes('gpt-4')) return '$$'
        if (id.includes('haiku') || id.includes('gpt-3.5')) return '$'
        return '$$'
      }
      return availableModels.map((m: any) => ({
        value: m.id,
        label: `${m.name} (${costTier(m.id)})`,
        alias: m.alias || undefined,
      }))
    }
    // Fallback: hardcoded
    return [
      { value: 'us.anthropic.claude-opus-4-6-v1', label: 'Claude Opus 4.6 ($$$)', alias: 'opus' },
      { value: 'us.anthropic.claude-sonnet-4-20250514-v1:0', label: 'Claude Sonnet 4 ($$)', alias: 'sonnet' },
      { value: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', label: 'Claude Haiku 4.5 ($)', alias: 'haiku' },
    ]
  })()

  const selectStyle = { 
    width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', 
    background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.92)', fontSize: 13,
    cursor: 'pointer', appearance: 'none' as const,
    backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23999\' d=\'M6 8L1 3h10z\'/%3E%3C/svg%3E")',
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center',
  }

  return (
    <GlassCard noPad>
      <div style={{ padding: isMobile ? 16 : 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,149,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={18} style={{ color: '#FF9500' }} />
          </div>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>Model Routing</h2>
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
              background: saving ? 'rgba(255,149,0,0.3)' : '#FF9500',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#32D74B', fontSize: 12 }}>
              <span className="status-dot status-dot-green" />
              Model routing saved successfully
            </div>
          )}
          {saveStatus === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#FF453A', fontSize: 12 }}>
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
    } catch (e) {
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
            <Clock size={18} style={{ color: '#FF453A' }} />
          </div>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>Heartbeat Interval</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="text-label" style={{ display: 'block', marginBottom: 8 }}>Check Interval</label>
            <select
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              style={{ 
                width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', 
                background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.92)', fontSize: 13,
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
              background: saving ? 'rgba(255,69,58,0.3)' : '#FF453A',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#32D74B', fontSize: 12 }}>
              <span className="status-dot status-dot-green" />
              Heartbeat interval saved successfully
            </div>
          )}
          {saveStatus === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#FF453A', fontSize: 12 }}>
              <span className="status-dot status-dot-red" />
              Failed to save heartbeat interval
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  )
}

function BudgetConfigCard({ isMobile }: { isMobile: boolean }) {
  const [budget, setBudget] = useState('15.00')
  const [alertsEnabled, setAlertsEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  useEffect(() => {
    // Load existing budget settings
    try {
      const saved = localStorage.getItem('budget-settings')
      if (saved) {
        const settings = JSON.parse(saved)
        setBudget(settings.budget || '15.00')
        setAlertsEnabled(settings.alertsEnabled !== false)
      }
    } catch {}
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaveStatus('idle')
    
    try {
      const settings = { budget: parseFloat(budget) || 15, alertsEnabled }
      localStorage.setItem('budget-settings', JSON.stringify(settings))
      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch {
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
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,149,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DollarSign size={18} style={{ color: '#FF9500' }} />
          </div>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>Budget Alerts</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.65)', marginBottom: 8 }}>
              Daily Budget Limit
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>$</span>
              <input
                type="number"
                step="0.50"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                style={{
                  width: '100%', paddingLeft: 28, padding: '12px 16px', borderRadius: 10, 
                  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', 
                  color: 'rgba(255,255,255,0.92)', fontSize: 13, outline: 'none'
                }}
              />
            </div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
              Get notified when estimated daily cost exceeds this amount
            </p>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.65)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={alertsEnabled}
                onChange={(e) => setAlertsEnabled(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              Enable budget alerts
            </label>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px 16px', borderRadius: 10, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
              background: saving ? 'rgba(255,149,0,0.3)' : '#FF9500',
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
                <span>Save Budget Settings</span>
              </>
            )}
          </button>

          {saveStatus === 'success' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#32D74B', fontSize: 12 }}>
              <span className="status-dot status-dot-green" />
              Budget settings saved successfully
            </div>
          )}
          {saveStatus === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#FF453A', fontSize: 12 }}>
              <span className="status-dot status-dot-red" />
              Failed to save budget settings
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
    } catch (e) {
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
            <Globe size={18} style={{ color: '#32D74B' }} />
          </div>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>Export / Import</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            onClick={handleExport}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              border: '1px solid rgba(50,215,75,0.3)', background: 'rgba(50,215,75,0.1)',
              color: '#32D74B', fontSize: 13, cursor: 'pointer', fontWeight: 500,
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
                color: '#007AFF', fontSize: 13, cursor: importing ? 'not-allowed' : 'pointer', fontWeight: 500,
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#32D74B', fontSize: 12 }}>
              <span className="status-dot status-dot-green" />
              Configuration imported successfully. Restart required.
            </div>
          )}
          {importStatus === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#FF453A', fontSize: 12 }}>
              <span className="status-dot status-dot-red" />
              Failed to import configuration
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  )
}

function SystemInformationCard({ isMobile }: { isMobile: boolean }) {
  const { data: statusData } = useApi<any>('/api/status')

  // Extract system information from status data, fallback to "—" if not available
  const systemInfo = [
    { label: 'Mission Control Version', value: statusData?.system?.missionControlVersion || '—' },
    { label: 'OpenClaw Version', value: statusData?.system?.openClawVersion || '—' },
    { label: 'Node.js Version', value: statusData?.system?.nodeVersion || '—' },
    { label: 'Platform', value: statusData?.system?.platform || '—' },
  ]

  return (
    <GlassCard noPad>
      <div style={{ padding: isMobile ? 16 : 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,149,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Database size={18} style={{ color: '#FF9500' }} />
          </div>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>System Information</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {systemInfo.map((item) => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>{item.label}</span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.92)' }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  )
}
