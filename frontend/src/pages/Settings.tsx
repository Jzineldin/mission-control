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

  // Available models from Bedrock
  const availableModels = [
    { id: 'anthropic.claude-3-opus-20240229-v1:0', name: 'Claude Opus 4.6', description: 'Most capable model' },
    { id: 'anthropic.claude-3-5-sonnet-20241022-v2:0', name: 'Claude Sonnet 4', description: 'Balanced performance' },
    { id: 'anthropic.claude-3-5-haiku-20250102-v1:0', name: 'Claude Haiku', description: 'Fast and efficient' }
  ]

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
    const model = availableModels.find(m => m.id === selectedModel)
    return model?.name || 'Select Model'
  }

  return (
    <PageTransition>
      <div className="page-header">
        <Settings2 className="page-icon" />
        <h1 className="page-title">Settings</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Model Configuration Card */}
        <GlassCard>
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <Cpu className="text-blue-400" size={24} />
              <h2 className="text-heading">Model Configuration</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-label text-quaternary mb-2 block">Active Model</label>
                <div className="relative">
                  <button
                    onClick={() => setShowDropdown(!showDropdown)}
                    className="macos-control w-full flex items-center justify-between px-4 py-3 rounded-lg"
                  >
                    <span className="text-primary">{getCurrentModelName()}</span>
                    <ChevronDown
                      size={16}
                      className={`text-tertiary transition-transform ${showDropdown ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {showDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute z-10 w-full mt-2 macos-panel overflow-hidden"
                    >
                      {availableModels.map((model) => (
                        <button
                          key={model.id}
                          onClick={() => {
                            setSelectedModel(model.id)
                            setShowDropdown(false)
                          }}
                          className={`w-full text-left px-4 py-3 hover:bg-white/5 transition-colors ${
                            selectedModel === model.id ? 'bg-blue-500/20' : ''
                          }`}
                        >
                          <div className="font-medium text-primary">{model.name}</div>
                          <div className="text-caption text-tertiary mt-1">{model.description}</div>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </div>
              </div>

              <button
                onClick={handleModelSwitch}
                disabled={saving || selectedModel === configData?.model}
                className="macos-button-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
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
                <div className="text-green-400 text-caption flex items-center gap-2">
                  <div className="status-dot status-dot-green" />
                  Model switched successfully
                </div>
              )}
              {saveStatus === 'error' && (
                <div className="text-red-400 text-caption flex items-center gap-2">
                  <div className="status-dot status-dot-red" />
                  Failed to switch model
                </div>
              )}
            </div>
          </div>
        </GlassCard>

        {/* OpenClaw Configuration Card */}
        <GlassCard>
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <Shield className="text-purple-400" size={24} />
              <h2 className="text-heading">OpenClaw Configuration</h2>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center py-2">
                <span className="text-secondary">Gateway Port</span>
                <span className="text-primary font-mono">{configData?.gateway_port || 18789}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-secondary">Memory Path</span>
                <span className="text-primary text-caption font-mono">
                  {configData?.memory_path || '/home/ubuntu/clawd/memory'}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-secondary">Skills Path</span>
                <span className="text-primary text-caption font-mono">
                  {configData?.skills_path || '/home/ubuntu/clawd/skills'}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-secondary">AWS Region</span>
                <span className="text-primary font-mono">
                  {configData?.bedrock_region || 'us-east-1'}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-secondary">Status</span>
                <StatusBadge status="active" label="Connected" />
              </div>
            </div>
          </div>
        </GlassCard>

        {/* System Information Card */}
        <GlassCard>
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <Database className="text-orange-400" size={24} />
              <h2 className="text-heading">System Information</h2>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center py-2">
                <span className="text-secondary">Mission Control Version</span>
                <span className="text-primary">v2.0.0</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-secondary">OpenClaw Version</span>
                <span className="text-primary">v1.5.2</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-secondary">Node.js Version</span>
                <span className="text-primary">v20.15.0</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-secondary">Platform</span>
                <span className="text-primary">Linux x64</span>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Quick Actions Card */}
        <GlassCard>
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <Globe className="text-green-400" size={24} />
              <h2 className="text-heading">Quick Actions</h2>
            </div>

            <div className="space-y-3">
              <button className="macos-control w-full py-3 text-left px-4 hover:bg-white/10 transition-colors">
                Restart OpenClaw Gateway
              </button>
              <button className="macos-control w-full py-3 text-left px-4 hover:bg-white/10 transition-colors">
                Clear Memory Cache
              </button>
              <button className="macos-control w-full py-3 text-left px-4 hover:bg-white/10 transition-colors">
                Export Configuration
              </button>
              <button className="macos-control w-full py-3 text-left px-4 hover:bg-white/10 transition-colors">
                View Logs
              </button>
            </div>
          </div>
        </GlassCard>
      </div>
    </PageTransition>
  )
}