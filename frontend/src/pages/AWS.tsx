import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Cloud, Play, CheckCircle, AlertCircle, ChevronDown, ChevronUp, X, MessageSquare, Image, Music, Video, Box, Brain, Mic, Languages, Search } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import { useIsMobile } from '../lib/useIsMobile'
import GlassCard from '../components/GlassCard'
import { useApi } from '../lib/hooks'

interface AWSService {
  name: string
  status: 'active' | 'available'
  description: string
  detail: string
}

interface BedrockModel {
  modelId: string
  modelName: string
  provider: string
  inputModalities?: string[]
  outputModalities?: string[]
  status: string
}

interface AWSData {
  account: { id: string; region: string; user?: string }
  services: AWSService[]
  credits: { total: number; note: string }
}

type ModelCategory = 'all' | 'text' | 'image-gen' | 'vision' | 'video' | 'embedding' | 'speech'

const CATEGORY_FILTERS: { id: ModelCategory; label: string; icon: any; match: (m: BedrockModel) => boolean }[] = [
  { id: 'all', label: 'All', icon: Box, match: () => true },
  { id: 'text', label: 'Text / Chat', icon: MessageSquare, match: (m) => {
    const inp = m.inputModalities || []; const out = m.outputModalities || []
    return out.includes('TEXT') && !out.includes('IMAGE') && !out.includes('VIDEO') && !out.includes('EMBEDDING')
  }},
  { id: 'vision', label: 'Vision', icon: Brain, match: (m) => {
    const inp = m.inputModalities || []; const out = m.outputModalities || []
    return inp.includes('IMAGE') && out.includes('TEXT') && !out.includes('IMAGE')
  }},
  { id: 'image-gen', label: 'Image Gen', icon: Image, match: (m) => (m.outputModalities || []).includes('IMAGE') },
  { id: 'video', label: 'Video', icon: Video, match: (m) => (m.outputModalities || []).includes('VIDEO') },
  { id: 'embedding', label: 'Embedding', icon: Box, match: (m) => (m.outputModalities || []).includes('EMBEDDING') },
  { id: 'speech', label: 'Speech', icon: Music, match: (m) => {
    const out = m.outputModalities || []
    return out.includes('SPEECH') || (m.inputModalities || []).includes('SPEECH')
  }},
]

function getModelAction(m: BedrockModel): { label: string; type: 'agent' | 'image' | 'tts' | 'none'; color: string } {
  const out = m.outputModalities || []
  const inp = m.inputModalities || []
  // Only Amazon models (Nova Canvas, Titan Image Gen) support text-to-image via our API
  if (out.includes('IMAGE') && (m.modelId.startsWith('amazon.nova-canvas') || m.modelId.startsWith('amazon.titan-image'))) {
    return { label: 'Generate Image', type: 'image', color: '#BF5AF2' }
  }
  if (out.includes('IMAGE')) return { label: 'Image Tool', type: 'none', color: '#BF5AF2' } // Stability needs input image
  if (out.includes('VIDEO')) return { label: 'Video Gen', type: 'none', color: '#FF9500' }
  if (out.includes('SPEECH')) return { label: 'Text to Speech', type: 'tts', color: '#32D74B' }
  if (out.includes('EMBEDDING')) return { label: 'Embedding', type: 'none', color: '#8E8E93' }
  if (out.includes('TEXT') && inp.includes('TEXT')) return { label: 'Use as Agent', type: 'agent', color: '#007AFF' }
  return { label: 'View', type: 'none', color: '#8E8E93' }
}

export default function AWS() {
  const isMobile = useIsMobile()
  const { data: awsData, loading: awsLoading } = useApi<AWSData>('/api/aws/services', 60000)
  const { data: modelsData, loading: modelsLoading } = useApi<BedrockModel[]>('/api/aws/bedrock-models', 120000)
  const { data: costData } = useApi<any>('/api/aws/costs', 60000)
  const [category, setCategory] = useState<ModelCategory>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedModel, setSelectedModel] = useState<BedrockModel | null>(null)
  const [actionStatus, setActionStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [actionMessage, setActionMessage] = useState('')
  const [imagePrompt, setImagePrompt] = useState('')
  const [generatedImageUrl, setGeneratedImageUrl] = useState('')
  const [ttsText, setTtsText] = useState('')
  const [testingService, setTestingService] = useState<string | null>(null)
  const { data: galleryData } = useApi<{ images: { id: string; url: string; created: string; size: number }[] }>('/api/aws/gallery', 10000)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, string>>({})

  if (awsLoading) {
    return (
      <PageTransition>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
          <div style={{ width: 32, height: 32, border: '2px solid #007AFF', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
      </PageTransition>
    )
  }

  const account = awsData?.account || { id: '...', region: '...' }
  const services = awsData?.services || []
  const credits = awsData?.credits || { total: 0, note: '' }
  const allModels = modelsData || []

  const activeFilter = CATEGORY_FILTERS.find(f => f.id === category)!
  let models = category === 'all' ? allModels : allModels.filter(activeFilter.match)
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase()
    models = models.filter(m => m.modelName.toLowerCase().includes(q) || m.modelId.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q))
  }

  // Counts per category
  const counts: Record<string, number> = {}
  for (const f of CATEGORY_FILTERS) counts[f.id] = f.id === 'all' ? allModels.length : allModels.filter(f.match).length

  // Group by provider
  const providerGroups: Record<string, BedrockModel[]> = {}
  for (const m of models) { const p = m.provider || 'Unknown'; if (!providerGroups[p]) providerGroups[p] = []; providerGroups[p].push(m) }
  const sortedProviders = Object.entries(providerGroups).sort((a, b) => b[1].length - a[1].length)

  const handleSetAgentModel = async (modelId: string) => {
    setActionStatus('loading')
    try {
      const res = await fetch('/api/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: `amazon-bedrock/${modelId}` }),
      })
      if (res.ok) {
        setActionStatus('success')
        setActionMessage(`Agent model switched to ${modelId}`)
      } else {
        const data = await res.json().catch(() => ({}))
        setActionStatus('error')
        setActionMessage(data.error || 'Failed to switch model')
      }
    } catch (e: any) {
      setActionStatus('error')
      setActionMessage(e.message)
    }
  }

  const handleGenerateImage = async (modelId: string, prompt: string) => {
    if (!prompt.trim()) return
    setActionStatus('loading')
    setGeneratedImageUrl('')
    setActionMessage('Generating... this takes 10-30 seconds')
    try {
      const res = await fetch('/api/aws/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId, prompt }),
      })
      const data = await res.json()
      if (res.ok && data.imageUrl) {
        setActionStatus('success')
        setActionMessage(data.message)
        setGeneratedImageUrl(data.imageUrl)
      } else {
        setActionStatus('error')
        setActionMessage(data.error || 'Image generation failed')
      }
    } catch (e: any) {
      setActionStatus('error')
      setActionMessage(e.message)
    }
  }

  const handleTestService = async (name: string) => {
    setTestingService(name)
    try {
      const res = await fetch('/api/aws/services')
      setTestResults(prev => ({ ...prev, [name]: res.ok ? 'success' : 'error' }))
    } catch { setTestResults(prev => ({ ...prev, [name]: 'error' })) }
    setTestingService(null)
    setTimeout(() => setTestResults(prev => { const { [name]: _, ...rest } = prev; return rest }), 3000)
  }

  return (
    <>
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '16px' : '0', display: 'flex', flexDirection: 'column', gap: isMobile ? 16 : 24 }}>
        {/* Header */}
        <div>
          <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Cloud size={22} style={{ color: '#FF9500' }} /> AWS Dashboard
          </h1>
          <p className="text-body" style={{ marginTop: 4 }}>
            Account {account.id} · {account.region}{account.user ? ` · ${account.user}` : ''}
          </p>
        </div>

        {/* Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 16 }}>
          {[
            { label: 'Account ID', value: account.id, color: '#fff' },
            { label: 'Region', value: account.region, color: '#007AFF' },
            { label: 'Credits', value: `$${credits.total.toLocaleString()}`, color: '#32D74B' },
            { label: 'Bedrock Models', value: allModels.length, color: '#BF5AF2' },
          ].map((s, i) => (
            <GlassCard key={s.label} delay={0.05 + i * 0.03} noPad>
              <div style={{ padding: '16px 20px' }}>
                <p className="text-label" style={{ marginBottom: 8 }}>{s.label}</p>
                <p style={{ fontSize: 20, fontWeight: 300, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
                {s.label === 'Credits' && <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>{credits.note}</p>}
              </div>
            </GlassCard>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 16 : 20 }}>
          {/* Services */}
          <GlassCard delay={0.15} noPad>
            <div style={{ padding: '20px 24px' }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)', marginBottom: 16 }}>Services</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {services.map((svc) => (
                  <motion.div key={svc.name} whileHover={{ scale: 1.01 }} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>{svc.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{svc.description}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{svc.detail}</span>
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 6,
                        background: svc.status === 'active' ? 'rgba(50,215,75,0.15)' : 'rgba(255,255,255,0.06)',
                        color: svc.status === 'active' ? '#32D74B' : 'rgba(255,255,255,0.4)',
                        border: `1px solid ${svc.status === 'active' ? 'rgba(50,215,75,0.3)' : 'rgba(255,255,255,0.08)'}`,
                      }}>{svc.status}</span>
                      <button onClick={() => handleTestService(svc.name)} disabled={testingService === svc.name}
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}>
                        {testResults[svc.name] === 'success' ? <CheckCircle size={12} color="#32D74B" /> :
                         testResults[svc.name] === 'error' ? <AlertCircle size={12} color="#FF453A" /> : <Play size={12} />}
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </GlassCard>

          {/* Billing — REAL from Cost Explorer */}
          <GlassCard delay={0.2} noPad>
            <div style={{ padding: '20px 24px' }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)', marginBottom: 16 }}>Billing & Credits</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Credits + Spending */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                  <div style={{ padding: 14, borderRadius: 12, background: 'rgba(50,215,75,0.08)', border: '1px solid rgba(50,215,75,0.2)' }}>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Credits Left</p>
                    <p style={{ fontSize: isMobile ? 18 : 22, fontWeight: 300, color: '#32D74B', fontVariantNumeric: 'tabular-nums' }}>
                      ${costData ? costData.remaining?.toLocaleString() : '25,000'}
                    </p>
                  </div>
                  <div style={{ padding: 14, borderRadius: 12, background: 'rgba(255,149,0,0.08)', border: '1px solid rgba(255,149,0,0.2)' }}>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>This Month</p>
                    <p style={{ fontSize: isMobile ? 18 : 22, fontWeight: 300, color: '#FF9500', fontVariantNumeric: 'tabular-nums' }}>
                      ${costData ? costData.total?.toFixed(2) : '0.00'}
                    </p>
                  </div>
                </div>

                {/* Service Breakdown */}
                <div style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>By Service</p>
                  {(costData?.services || []).map((svc: any) => (
                    <div key={svc.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>{svc.name}</span>
                      <span style={{ fontSize: 12, color: svc.cost > 10 ? '#FF9500' : 'rgba(255,255,255,0.7)', fontWeight: svc.cost > 10 ? 600 : 400, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>${svc.cost.toFixed(2)}</span>
                    </div>
                  ))}
                  {(!costData?.services || costData.services.length === 0) && (
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No cost data yet</p>
                  )}
                </div>

                {/* Daily Spend Mini Chart */}
                {costData?.daily && costData.daily.length > 1 && (
                  <div style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Daily Spend</p>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 60 }}>
                      {costData.daily.map((d: any, i: number) => {
                        const maxCost = Math.max(...costData.daily.map((x: any) => x.cost), 1)
                        const height = Math.max((d.cost / maxCost) * 100, 2)
                        const isToday = i === costData.daily.length - 1
                        return (
                          <div key={d.date} title={`${d.date}: $${d.cost}`} style={{
                            flex: 1, height: `${height}%`, borderRadius: 3,
                            background: d.cost > 50 ? '#FF453A' : d.cost > 10 ? '#FF9500' : '#007AFF',
                            opacity: isToday ? 1 : 0.7,
                            minHeight: 2,
                          }} />
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>{costData.daily[0]?.date?.slice(5)}</span>
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>{costData.daily[costData.daily.length-1]?.date?.slice(5)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Image Gallery */}
        {galleryData && galleryData.images.length > 0 && (
          <GlassCard delay={0.22} noPad>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Image size={16} style={{ color: '#BF5AF2' }} /> Generated Images ({galleryData.images.length})
                </h2>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                {galleryData.images.map((img) => (
                  <motion.div
                    key={img.id}
                    whileHover={{ scale: 1.03 }}
                    style={{
                      borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255,255,255,0.03)',
                    }}
                    onClick={() => setLightboxUrl(img.url)}
                  >
                    <img src={img.url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                    <div style={{ padding: '8px 10px' }}>
                      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                        {new Date(img.created).toLocaleString()}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </GlassCard>
        )}

        {/* Bedrock Models Section */}
        <GlassCard delay={0.25} noPad>
          <div style={{ padding: '20px 24px' }}>
            {/* Models Header + Search */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>
                Bedrock Models ({models.length}{category !== 'all' ? ` / ${allModels.length}` : ''})
              </h2>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search models..."
                  style={{
                    padding: '8px 12px 8px 30px', borderRadius: 8, width: 220,
                    border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
                    color: '#fff', fontSize: 12, outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Category Filter Tabs */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              {CATEGORY_FILTERS.filter(f => counts[f.id] > 0 || f.id === 'all').map(f => (
                <button key={f.id} onClick={() => setCategory(f.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                  border: category === f.id ? '1px solid rgba(0,122,255,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  background: category === f.id ? 'rgba(0,122,255,0.15)' : 'rgba(255,255,255,0.04)',
                  color: category === f.id ? '#fff' : 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: 500, transition: 'all 0.2s',
                }}>
                  <f.icon size={13} />
                  {f.label}
                  <span style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 6,
                    background: category === f.id ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)',
                    color: category === f.id ? '#fff' : 'rgba(255,255,255,0.4)',
                  }}>{counts[f.id]}</span>
                </button>
              ))}
            </div>

            {/* Model Grid */}
            {modelsLoading ? (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Loading models from Bedrock...</p>
            ) : models.length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center', padding: 20 }}>No models match your search.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {sortedProviders.map(([provider, provModels]) => (
                  <div key={provider}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{provider}</span>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', padding: '1px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.06)' }}>{provModels.length}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
                      {provModels.map((m) => {
                        const action = getModelAction(m)
                        return (
                          <motion.div key={m.modelId} whileHover={{ scale: 1.02 }}
                            onClick={() => { setSelectedModel(m); setActionStatus('idle'); setActionMessage(''); setImagePrompt(''); setGeneratedImageUrl(''); setTtsText('') }}
                            style={{
                              padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                              transition: 'border-color 0.2s',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${action.color}40`)}
                            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.85)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {m.modelName}
                                </div>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {m.modelId}
                                </div>
                              </div>
                              <span style={{
                                fontSize: 9, padding: '2px 6px', borderRadius: 5, flexShrink: 0, marginLeft: 8,
                                background: `${action.color}15`, color: action.color, border: `1px solid ${action.color}30`,
                              }}>{action.label}</span>
                            </div>
                          </motion.div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </GlassCard>

        {/* Model Action Modal */}
        <AnimatePresence>
          {selectedModel && (() => {
            const action = getModelAction(selectedModel)
            return (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setSelectedModel(null)}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: 520, maxHeight: '85vh', borderRadius: 16, padding: 28,
                    background: 'rgba(30,30,40,0.95)', border: '1px solid rgba(255,255,255,0.1)',
                    backdropFilter: 'blur(60px) saturate(200%)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                    overflowY: 'auto',
                  }}
                >
                  {/* Modal Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{selectedModel.modelName}</h3>
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{selectedModel.provider} · {selectedModel.modelId}</p>
                    </div>
                    <button onClick={() => setSelectedModel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 4 }}>
                      <X size={18} />
                    </button>
                  </div>

                  {/* Modalities */}
                  <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                    <div>
                      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Input</p>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {(selectedModel.inputModalities || []).map(m => (
                          <span key={m} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'rgba(0,122,255,0.15)', color: '#007AFF', border: '1px solid rgba(0,122,255,0.3)' }}>{m}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Output</p>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {(selectedModel.outputModalities || []).map(m => (
                          <span key={m} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'rgba(50,215,75,0.15)', color: '#32D74B', border: '1px solid rgba(50,215,75,0.3)' }}>{m}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Action Area */}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 20 }}>
                    {action.type === 'agent' && (
                      <div>
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>
                          Switch agent's active model to this. Takes effect on next message.
                        </p>
                        <button
                          onClick={() => handleSetAgentModel(selectedModel.modelId)}
                          disabled={actionStatus === 'loading'}
                          style={{
                            width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                            background: actionStatus === 'success' ? 'rgba(50,215,75,0.2)' : 'rgba(0,122,255,0.8)',
                            color: '#fff', fontSize: 13, fontWeight: 500,
                            opacity: actionStatus === 'loading' ? 0.6 : 1,
                          }}
                        >
                          {actionStatus === 'loading' ? 'Switching...' : actionStatus === 'success' ? '✓ Model Switched!' : `Set as Agent Model`}
                        </button>
                      </div>
                    )}

                    {action.type === 'image' && (
                      <div>
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>
                          Generate an image using {selectedModel.modelName}.
                        </p>
                        <input
                          value={imagePrompt}
                          onChange={(e) => setImagePrompt(e.target.value)}
                          placeholder="Describe the image you want..."
                          style={{
                            width: '100%', padding: '10px 14px', borderRadius: 8, marginBottom: 10,
                            border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
                            color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box',
                          }}
                          onKeyDown={(e) => e.key === 'Enter' && handleGenerateImage(selectedModel.modelId, imagePrompt)}
                        />
                        <button
                          onClick={() => handleGenerateImage(selectedModel.modelId, imagePrompt)}
                          disabled={actionStatus === 'loading' || !imagePrompt.trim()}
                          style={{
                            width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                            background: !imagePrompt.trim() ? 'rgba(255,255,255,0.1)' : actionStatus === 'loading' ? 'rgba(191,90,242,0.4)' : 'rgba(191,90,242,0.8)',
                            color: '#fff', fontSize: 13, fontWeight: 500,
                            opacity: actionStatus === 'loading' ? 0.7 : 1,
                          }}
                        >
                          {actionStatus === 'loading' ? '⏳ Generating...' : 'Generate Image'}
                        </button>
                        {generatedImageUrl && (
                          <div style={{ marginTop: 16, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <img src={generatedImageUrl} alt="Generated" style={{ width: '100%', display: 'block' }} />
                          </div>
                        )}
                      </div>
                    )}

                    {action.type === 'tts' && (
                      <div>
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>
                          Convert text to speech using {selectedModel.modelName}.
                        </p>
                        <textarea
                          value={ttsText}
                          onChange={(e) => setTtsText(e.target.value)}
                          placeholder="Enter text to speak..."
                          rows={3}
                          style={{
                            width: '100%', padding: '10px 14px', borderRadius: 8, marginBottom: 10, resize: 'vertical',
                            border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
                            color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box',
                          }}
                        />
                        <button disabled style={{
                          width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none',
                          background: 'rgba(50,215,75,0.3)', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'not-allowed', opacity: 0.6,
                        }}>
                          Coming Soon — Use Polly via Services
                        </button>
                      </div>
                    )}

                    {action.type === 'none' && (
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                        This model type isn't directly actionable from the dashboard yet.
                      </p>
                    )}

                    {/* Status message */}
                    {actionMessage && (
                      <p style={{
                        fontSize: 12, marginTop: 12, textAlign: 'center',
                        color: actionStatus === 'success' ? '#32D74B' : actionStatus === 'error' ? '#FF453A' : 'rgba(255,255,255,0.5)',
                      }}>
                        {actionMessage}
                      </p>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )
          })()}
        </AnimatePresence>
      </div>
    </PageTransition>

    {/* Lightbox — outside PageTransition to avoid transform context breaking fixed positioning */}
    {lightboxUrl && (
      <div
        onClick={() => setLightboxUrl(null)}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'zoom-out', padding: 40,
        }}
      >
        <img
          src={lightboxUrl} alt="Generated"
          style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
          onClick={(e) => e.stopPropagation()}
        />
        <button onClick={() => setLightboxUrl(null)} style={{
          position: 'fixed', top: 24, right: 24, background: 'rgba(255,255,255,0.15)',
          border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '8px 16px',
          color: '#fff', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <X size={14} /> Close
        </button>
      </div>
    )}
    </>
  )
}
