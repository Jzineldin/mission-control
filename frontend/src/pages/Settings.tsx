import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Settings2, ChevronDown, Save, RefreshCw, Shield, Database, Cpu, Globe } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import GlassCard from '../components/GlassCard'
import StatusBadge from '../components/StatusBadge'
import { useApi } from '../lib/hooks'

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
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Header */}
        <div>
          <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Settings2 size={22} style={{ color: '#007AFF' }} /> Settings
          </h1>
          <p className="text-body" style={{ marginTop: 4 }}>Configuration & system management</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Model Configuration Card */}
          <GlassCard noPad>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,122,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Cpu size={18} style={{ color: '#007AFF' }} />
                </div>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>Model Configuration</h2>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label className="text-label" style={{ display: 'block', marginBottom: 8 }}>Active Model</label>
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => setShowDropdown(!showDropdown)}
                      className="macos-control"
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 10, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.92)', fontSize: 13 }}
                    >
                      <span>{getCurrentModelName()}</span>
                      <ChevronDown
                        size={16}
                        style={{ color: 'rgba(255,255,255,0.45)', transition: 'transform 0.2s', transform: showDropdown ? 'rotate(180deg)' : 'none' }}
                      />
                    </button>

                    {showDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{ position: 'absolute', zIndex: 10, width: '100%', marginTop: 8, borderRadius: 12, overflow: 'hidden', background: 'rgba(30,30,40,0.95)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(40px)', boxShadow: '0 10px 40px rgba(0,0,0,0.4)' }}
                      >
                        {availableModels.map((model) => (
                          <button
                            key={model.id}
                            onClick={() => {
                              setSelectedModel(model.id)
                              setShowDropdown(false)
                            }}
                            style={{
                              width: '100%', textAlign: 'left', padding: '12px 16px', cursor: 'pointer',
                              border: 'none',
                              background: selectedModel === model.id ? 'rgba(0,122,255,0.15)' : 'transparent',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={(e) => { if (selectedModel !== model.id) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = selectedModel === model.id ? 'rgba(0,122,255,0.15)' : 'transparent' }}
                          >
                            <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.92)' }}>{model.name}</div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{model.description}</div>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleModelSwitch}
                  disabled={saving || selectedModel === configData?.model}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '12px 16px', borderRadius: 10, border: 'none', cursor: saving || selectedModel === configData?.model ? 'not-allowed' : 'pointer',
                    background: saving || selectedModel === configData?.model ? 'rgba(0,122,255,0.3)' : '#007AFF',
                    color: '#fff', fontSize: 13, fontWeight: 500,
                    opacity: saving || selectedModel === configData?.model ? 0.5 : 1,
                    transition: 'all 0.2s',
                  }}
                >
                  {saving ? (
                    <>
                      <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                      <span>Switching Model...</span>
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      <span>Apply Changes</span>
                    </>
                  )}
                </button>

                {saveStatus === 'success' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#32D74B', fontSize: 12 }}>
                    <span className="status-dot status-dot-green" />
                    Model switched successfully
                  </div>
                )}
                {saveStatus === 'error' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#FF453A', fontSize: 12 }}>
                    <span className="status-dot status-dot-red" />
                    Failed to switch model
                  </div>
                )}
              </div>
            </div>
          </GlassCard>

          {/* OpenClaw Configuration Card */}
          <GlassCard noPad>
            <div style={{ padding: 24 }}>
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
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>{item.label}</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.92)', fontFamily: item.mono ? 'monospace' : 'inherit' }}>{String(item.value)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>Status</span>
                  <StatusBadge status="active" label="Connected" />
                </div>
              </div>
            </div>
          </GlassCard>

          {/* System Information Card */}
          <GlassCard noPad>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,149,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Database size={18} style={{ color: '#FF9500' }} />
                </div>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>System Information</h2>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  { label: 'Mission Control Version', value: 'v2.0.0' },
                  { label: 'OpenClaw Version', value: 'v1.5.2' },
                  { label: 'Node.js Version', value: 'v20.15.0' },
                  { label: 'Platform', value: 'Linux x64' },
                ].map((item) => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>{item.label}</span>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.92)' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>

          {/* Quick Actions Card */}
          <GlassCard noPad>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(50,215,75,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Globe size={18} style={{ color: '#32D74B' }} />
                </div>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>Quick Actions</h2>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {['Restart OpenClaw Gateway', 'Clear Memory Cache', 'Export Configuration', 'View Logs'].map((label) => (
                  <button
                    key={label}
                    style={{
                      width: '100%', padding: '12px 16px', textAlign: 'left', borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)',
                      color: 'rgba(255,255,255,0.65)', fontSize: 13, cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </PageTransition>
  )
}
