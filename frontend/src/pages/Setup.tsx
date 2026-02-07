import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, ArrowRight, ArrowLeft, Settings, Zap, Search } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import { useIsMobile } from '../lib/useIsMobile'

interface SetupData {
  dashboardName: string
  gateway: {
    port: number
    token: string
  }
  modules: Record<string, boolean>
  scout: {
    enabled: boolean
    queries: Array<{ q: string; category: string; source: string; weight: number }>
    schedule: string
  }
}

interface SetupStatus {
  needsSetup: boolean
  gatewayRunning: boolean
  gatewayPort: number
  gatewayVersion: string
  detectedConfig: {
    model: string
    channels: string[]
    agentName: string
    workspacePath: string
  }
}

const scoutTemplates = {
  freelance: [
    { q: '"looking for" "web developer" OR "website developer" remote 2026', category: 'freelance', source: 'web', weight: 1.0 },
    { q: 'site:x.com "hiring" OR "looking for" "react developer" OR "frontend developer" remote', category: 'twitter-jobs', source: 'twitter', weight: 0.9 },
    { q: 'site:reddit.com/r/forhire "looking for" react developer', category: 'reddit-gigs', source: 'reddit', weight: 0.8 }
  ],
  skills: [
    { q: 'site:github.com openclaw skill OR plugin', category: 'openclaw-github', source: 'github', weight: 1.0 },
    { q: 'clawhub.com skill OR "new skill" OR automation', category: 'openclaw-skills', source: 'web', weight: 1.0 },
    { q: 'site:x.com openclaw "new feature" OR "just shipped" OR "tip"', category: 'openclaw', source: 'twitter', weight: 1.0 }
  ],
  bounties: [
    { q: '"bug bounty" OR "vulnerability disclosure" program 2026', category: 'security', source: 'web', weight: 0.9 },
    { q: 'site:hackerone.com new program OR "just launched"', category: 'hackerone', source: 'web', weight: 0.8 },
    { q: '"responsible disclosure" reward program', category: 'disclosure', source: 'web', weight: 0.7 }
  ],
  grants: [
    { q: '"startup grant" OR "startup competition" 2026 application deadline', category: 'funding', source: 'web', weight: 0.95 },
    { q: '"innovation grant" OR "tech grant" europe 2026 open', category: 'eu-grants', source: 'web', weight: 0.9 },
    { q: 'edtech funding OR "education startup grant" 2026', category: 'edtech-funding', source: 'web', weight: 0.85 }
  ]
}

export default function Setup() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [setupData, setSetupData] = useState<SetupData>({
    dashboardName: 'Mission Control',
    gateway: { port: 18789, token: '' },
    modules: {
      dashboard: true,
      chat: true,
      workshop: true,
      costs: true,
      cron: true,
      scout: false,
      docs: true,
      agents: true,
      settings: true,
      skills: true,
      aws: false
    },
    scout: {
      enabled: false,
      queries: [],
      schedule: 'daily'
    }
  })

  const [customQueries, setCustomQueries] = useState<string[]>([''])

  useEffect(() => {
    fetchSetupStatus()
  }, [])

  const fetchSetupStatus = async () => {
    try {
      const response = await fetch('/api/setup')
      const data = await response.json()
      setStatus(data)
      
      // Pre-populate form with detected values
      if (data.detectedConfig?.agentName) {
        setSetupData(prev => ({ ...prev, dashboardName: data.detectedConfig.agentName + ' Control' }))
      }
      // Pre-fill gateway token if detected
      if (data.detectedConfig?.gatewayToken) {
        setSetupData(prev => ({ ...prev, gateway: { ...prev.gateway, token: data.detectedConfig.gatewayToken } }))
      }
    } catch (error) {
      console.error('Failed to fetch setup status:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSetup = async () => {
    try {
      setLoading(true)
      
      // Combine template queries with custom queries
      let allQueries = [...setupData.scout.queries]
      customQueries.forEach(q => {
        if (q.trim()) {
          allQueries.push({ q: q.trim(), category: 'custom', source: 'web', weight: 0.8 })
        }
      })
      
      const payload = {
        ...setupData,
        scout: {
          ...setupData.scout,
          queries: allQueries
        }
      }
      
      const response = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      
      if (response.ok) {
        navigate('/')
      } else {
        console.error('Setup failed')
      }
    } catch (error) {
      console.error('Failed to save setup:', error)
    } finally {
      setLoading(false)
    }
  }

  const addScoutTemplate = (templateKey: keyof typeof scoutTemplates) => {
    const template = scoutTemplates[templateKey]
    setSetupData(prev => ({
      ...prev,
      scout: {
        ...prev.scout,
        enabled: true,
        queries: [...prev.scout.queries, ...template]
      }
    }))
  }

  const removeScoutTemplate = (templateKey: keyof typeof scoutTemplates) => {
    const template = scoutTemplates[templateKey]
    const templateCategories = template.map(t => t.category)
    setSetupData(prev => ({
      ...prev,
      scout: {
        ...prev.scout,
        queries: prev.scout.queries.filter(q => !templateCategories.includes(q.category))
      }
    }))
  }

  const isTemplateSelected = (templateKey: keyof typeof scoutTemplates) => {
    const template = scoutTemplates[templateKey]
    return template.every(t => setupData.scout.queries.some(q => q.category === t.category))
  }

  if (loading && !status) {
    return (
      <PageTransition>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '60vh',
          color: 'rgba(255, 255, 255, 0.7)'
        }}>
          Loading setup...
        </div>
      </PageTransition>
    )
  }

  const cardStyle = {
    background: 'rgba(255, 255, 255, 0.05)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: 16,
    padding: isMobile ? 20 : 32,
    maxWidth: 600,
    margin: '0 auto'
  }

  const buttonStyle = {
    background: '#007AFF',
    color: 'white',
    border: 'none',
    borderRadius: 10,
    padding: '12px 24px',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    transition: 'all 0.2s ease'
  }

  const secondaryButtonStyle = {
    background: 'rgba(255, 255, 255, 0.1)',
    color: 'rgba(255, 255, 255, 0.9)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: 10,
    padding: '12px 24px',
    fontSize: 16,
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    transition: 'all 0.2s ease'
  }

  const inputStyle = {
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    padding: '12px 16px',
    color: 'white',
    fontSize: 16,
    width: '100%',
    outline: 'none'
  }

  return (
    <PageTransition>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        
        {/* Step 1: Welcome */}
        {step === 1 && (
          <div style={cardStyle}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <h1 style={{ 
                fontSize: isMobile ? 28 : 36, 
                fontWeight: 700, 
                color: 'white', 
                marginBottom: 16,
                background: 'linear-gradient(135deg, #007AFF, #5856D6)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                Welcome to Mission Control
              </h1>
              <p style={{ 
                fontSize: 18, 
                color: 'rgba(255, 255, 255, 0.8)', 
                lineHeight: 1.5,
                maxWidth: 400,
                margin: '0 auto'
              }}>
                Your command center for OpenClaw AI agents. Let's get you set up in just a few steps.
              </p>
            </div>

            {/* Gateway Status */}
            <div style={{
              background: 'rgba(0, 0, 0, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 12,
              padding: 20,
              marginBottom: 24
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                {status?.gatewayRunning ? (
                  <CheckCircle size={24} style={{ color: '#32D74B' }} />
                ) : (
                  <div style={{ 
                    width: 24, 
                    height: 24, 
                    borderRadius: '50%', 
                    background: '#FF453A',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <div style={{ width: 8, height: 8, background: 'white', borderRadius: '50%' }} />
                  </div>
                )}
                <span style={{ fontSize: 18, fontWeight: 600, color: 'white' }}>
                  OpenClaw Gateway
                </span>
              </div>
              
              <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: 14 }}>
                Status: {status?.gatewayRunning ? 'Running' : 'Not detected'}<br />
                {status?.gatewayVersion && `Version: ${status.gatewayVersion}`}<br />
                Port: {status?.gatewayPort || 18789}
              </div>
            </div>

            {/* Detected Config */}
            {status?.detectedConfig && (
              <div style={{
                background: 'rgba(0, 122, 255, 0.1)',
                border: '1px solid rgba(0, 122, 255, 0.3)',
                borderRadius: 12,
                padding: 20,
                marginBottom: 32
              }}>
                <h3 style={{ color: '#007AFF', fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
                  Detected Configuration
                </h3>
                <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 14 }}>
                  {status.detectedConfig.model && <div>Model: {status.detectedConfig.model.replace('amazon-bedrock/', '')}</div>}
                  {status.detectedConfig.channels.length > 0 && <div>Channels: {status.detectedConfig.channels.join(', ')}</div>}
                  {status.detectedConfig.workspacePath && <div>Workspace: {status.detectedConfig.workspacePath}</div>}
                </div>
              </div>
            )}

            <div style={{ textAlign: 'center' }}>
              <button 
                style={buttonStyle}
                onClick={() => setStep(2)}
              >
                Let's Get Started
                <ArrowRight size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Configure */}
        {step === 2 && (
          <div style={cardStyle}>
            <h2 style={{ 
              fontSize: 28, 
              fontWeight: 700, 
              color: 'white', 
              marginBottom: 24,
              display: 'flex',
              alignItems: 'center',
              gap: 12
            }}>
              <Settings size={32} style={{ color: '#007AFF' }} />
              Configure Dashboard
            </h2>

            <div style={{ marginBottom: 24 }}>
              <label style={{ 
                display: 'block', 
                color: 'rgba(255, 255, 255, 0.9)', 
                fontWeight: 500, 
                marginBottom: 8 
              }}>
                Dashboard Name
              </label>
              <input
                style={inputStyle}
                type="text"
                value={setupData.dashboardName}
                onChange={(e) => setSetupData(prev => ({ ...prev, dashboardName: e.target.value }))}
                placeholder="Mission Control"
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ 
                display: 'block', 
                color: 'rgba(255, 255, 255, 0.9)', 
                fontWeight: 500, 
                marginBottom: 8 
              }}>
                Gateway Token
              </label>
              <input
                style={inputStyle}
                type="text"
                value={setupData.gateway.token}
                onChange={(e) => setSetupData(prev => ({ 
                  ...prev, 
                  gateway: { ...prev.gateway, token: e.target.value }
                }))}
                placeholder="Enter your gateway authentication token"
              />
              <p style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.6)', marginTop: 4 }}>
                This connects Mission Control to your OpenClaw gateway for secure communication.
              </p>
            </div>

            <div style={{ marginBottom: 32 }}>
              <label style={{ 
                display: 'block', 
                color: 'rgba(255, 255, 255, 0.9)', 
                fontWeight: 500, 
                marginBottom: 12 
              }}>
                Enable Modules
              </label>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', 
                gap: 12 
              }}>
                {Object.entries(setupData.modules).map(([key, enabled]) => (
                  <label key={key} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: enabled ? 'rgba(0, 122, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${enabled ? 'rgba(0, 122, 255, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
                    transition: 'all 0.2s ease'
                  }}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setSetupData(prev => ({
                        ...prev,
                        modules: { ...prev.modules, [key]: e.target.checked }
                      }))}
                      style={{ margin: 0 }}
                    />
                    <span style={{ 
                      color: enabled ? '#007AFF' : 'rgba(255, 255, 255, 0.8)',
                      fontSize: 14,
                      fontWeight: 500,
                      textTransform: 'capitalize'
                    }}>
                      {key}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button style={secondaryButtonStyle} onClick={() => setStep(1)}>
                <ArrowLeft size={20} />
                Back
              </button>
              <button style={buttonStyle} onClick={() => setStep(3)}>
                Continue
                <ArrowRight size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Scout Setup */}
        {step === 3 && (
          <div style={cardStyle}>
            <h2 style={{ 
              fontSize: 28, 
              fontWeight: 700, 
              color: 'white', 
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 12
            }}>
              <Search size={32} style={{ color: '#007AFF' }} />
              Scout Setup
            </h2>
            <p style={{ 
              color: 'rgba(255, 255, 255, 0.7)', 
              marginBottom: 24,
              fontSize: 16
            }}>
              What opportunities do you want to find? Scout will search for relevant leads automatically.
            </p>

            <div style={{ marginBottom: 24 }}>
              <h3 style={{ 
                color: 'rgba(255, 255, 255, 0.9)', 
                fontSize: 18, 
                fontWeight: 600, 
                marginBottom: 16 
              }}>
                Quick Templates
              </h3>
              
              <div style={{ display: 'grid', gap: 12 }}>
                {Object.entries(scoutTemplates).map(([key, template]) => {
                  const selected = isTemplateSelected(key as keyof typeof scoutTemplates)
                  return (
                    <div key={key} style={{
                      background: selected ? 'rgba(0, 122, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                      border: `1px solid ${selected ? 'rgba(0, 122, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                      borderRadius: 10,
                      padding: 16
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <h4 style={{ 
                            color: 'white', 
                            fontSize: 16, 
                            fontWeight: 600, 
                            marginBottom: 4,
                            textTransform: 'capitalize'
                          }}>
                            {key} Opportunities
                          </h4>
                          <p style={{ 
                            color: 'rgba(255, 255, 255, 0.6)', 
                            fontSize: 14,
                            margin: 0
                          }}>
                            {template.length} search queries • {key === 'freelance' ? 'Find web development jobs' : 
                             key === 'skills' ? 'Track OpenClaw ecosystem' : 
                             key === 'bounties' ? 'Security bug bounty programs' : 
                             'Startup grants and competitions'}
                          </p>
                        </div>
                        <button
                          style={{
                            background: selected ? '#007AFF' : 'rgba(255, 255, 255, 0.1)',
                            color: selected ? 'white' : 'rgba(255, 255, 255, 0.8)',
                            border: 'none',
                            borderRadius: 8,
                            padding: '8px 16px',
                            fontSize: 14,
                            fontWeight: 500,
                            cursor: 'pointer'
                          }}
                          onClick={() => {
                            if (selected) {
                              removeScoutTemplate(key as keyof typeof scoutTemplates)
                            } else {
                              addScoutTemplate(key as keyof typeof scoutTemplates)
                            }
                          }}
                        >
                          {selected ? 'Remove' : 'Add'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ marginBottom: 32 }}>
              <h3 style={{ 
                color: 'rgba(255, 255, 255, 0.9)', 
                fontSize: 18, 
                fontWeight: 600, 
                marginBottom: 16 
              }}>
                Custom Searches
              </h3>
              
              {customQueries.map((query, index) => (
                <div key={index} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    type="text"
                    value={query}
                    onChange={(e) => {
                      const newQueries = [...customQueries]
                      newQueries[index] = e.target.value
                      setCustomQueries(newQueries)
                    }}
                    placeholder="Enter custom search query..."
                  />
                  {customQueries.length > 1 && (
                    <button
                      style={{
                        background: 'rgba(255, 69, 58, 0.2)',
                        border: '1px solid rgba(255, 69, 58, 0.3)',
                        color: '#FF453A',
                        borderRadius: 8,
                        padding: '0 12px',
                        cursor: 'pointer'
                      }}
                      onClick={() => {
                        const newQueries = customQueries.filter((_, i) => i !== index)
                        setCustomQueries(newQueries)
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              
              <button
                style={{
                  ...secondaryButtonStyle,
                  marginTop: 8
                }}
                onClick={() => setCustomQueries([...customQueries, ''])}
              >
                Add Another Query
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button style={secondaryButtonStyle} onClick={() => setStep(2)}>
                <ArrowLeft size={20} />
                Back
              </button>
              <button style={buttonStyle} onClick={() => setStep(4)}>
                Continue
                <ArrowRight size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Done */}
        {step === 4 && (
          <div style={cardStyle}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <CheckCircle size={64} style={{ color: '#32D74B', marginBottom: 16 }} />
              <h2 style={{ 
                fontSize: 28, 
                fontWeight: 700, 
                color: 'white', 
                marginBottom: 16 
              }}>
                Setup Complete!
              </h2>
              <p style={{ 
                fontSize: 18, 
                color: 'rgba(255, 255, 255, 0.8)', 
                lineHeight: 1.5 
              }}>
                Your Mission Control dashboard is ready to go.
              </p>
            </div>

            <div style={{
              background: 'rgba(0, 0, 0, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 12,
              padding: 20,
              marginBottom: 32
            }}>
              <h3 style={{ color: 'white', fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
                Configuration Summary
              </h3>
              <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: 14 }}>
                <div>Dashboard Name: {setupData.dashboardName}</div>
                <div>Gateway Token: {setupData.gateway.token ? '●●●●●●●●' : 'Not set'}</div>
                <div>Modules Enabled: {Object.values(setupData.modules).filter(Boolean).length}</div>
                <div>Scout Queries: {setupData.scout.queries.length + customQueries.filter(q => q.trim()).length}</div>
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <button 
                style={buttonStyle}
                onClick={handleSaveSetup}
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Launch Dashboard'}
                {!loading && <Zap size={20} />}
              </button>
            </div>
          </div>
        )}
        
      </div>
    </PageTransition>
  )
}