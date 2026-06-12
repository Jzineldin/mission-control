import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Users, UserCog, Sparkles, RefreshCw, Hammer, ChevronDown, Check } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import GlassCard from '../components/GlassCard'

type Member = {
  id: string
  name: string
  emoji: string
  model: string
  modelKey?: string
  workspace?: string | null
  role: string
  capability?: string
  title?: string
  registryStatus?: string
  runtimeStatus?: string
  source?: string
  summary?: string
  responsibilities: string[]
}

type Group = { role: string; capability?: string; emoji?: string; members: Member[] }

type TeamPayload = {
  lead: { id: string; name: string; emoji: string; model: string; modelKey?: string } | null
  roleGroups: Group[]
  missingSuggested: { id: string; capability?: string; role: string; name: string; emoji: string; reason?: string; severity?: string }[]
  totalAgents: number
  mode?: string
  shadow?: { enabled?: boolean; canary?: boolean }
  dataSources?: { registry?: string; runtime?: string }
  updatedAt?: string
}

const modelPickerButtonStyle: CSSProperties = {
  width: 210,
  maxWidth: '100%',
  minWidth: 120,
  height: 30,
  padding: '0 10px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.04)',
  color: 'rgba(255,255,255,0.92)',
  fontSize: 11,
  textAlign: 'left',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
}

function modelOptionLabel(name: string, id: string) {
  const k = String(id || '').trim()
  if (!k) return String(name || '').trim() || 'Unknown model'
  if (k.includes('gpt-5.3-codex-spark')) return 'GPT-5.3 Codex Spark'
  if (k.includes('gpt-5.3-codex')) return 'GPT-5.3 Codex'
  if (k.includes('gpt-5.2-codex')) return 'GPT-5.2 Codex'
  if (k.includes('claude-sonnet-4-6')) return 'Claude Sonnet 4.6'
  if (k.includes('claude-opus-4-6')) return 'Claude Opus 4.6'
  if (k.includes('claude-opus-4-5')) return 'Claude Opus 4.5'
  const stripped = k
    .replace(/^openai-codex\//, '')
    .replace(/^openai\//, '')
    .replace(/^anthropic\//, '')
    .replace(/^ollama\//, '')
  return stripped.length > 28 ? `${stripped.slice(0, 28)}...` : stripped
}

export default function TeamStructure() {
  const [data, setData] = useState<TeamPayload | null>(null)
  const [models, setModels] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [bootstrapping, setBootstrapping] = useState(false)
  const [savingModel, setSavingModel] = useState<Record<string, boolean>>({})
  const [pendingModel, setPendingModel] = useState<Record<string, string>>({})
  const [openModelPicker, setOpenModelPicker] = useState<string | null>(null)
  const [pickerDirection, setPickerDirection] = useState<Record<string, 'up' | 'down'>>({})
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const activeGroupRole = useMemo(() => {
    if (!openModelPicker || !data) return null
    for (const group of data.roleGroups || []) {
      if (group.members?.some((m) => m.id === openModelPicker)) return group.role
    }
    return null
  }, [openModelPicker, data])

  // `loading` starts true and the UI only gates on `loading && !data`, so the
  // initial fetch needs no setLoading(true); later refreshes keep stale data visible.
  const load = async () => {
    try {
      const r = await fetch('/api/team/structure')
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setData(j)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load')
    } finally {
      setLoading(false)
    }
  }

  // Initial fetch on mount; load() only calls setState after awaiting the
  // response, but the lint rule traces the shared function and flags it anyway.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [])
  useEffect(() => {
    let cancelled = false
    const loadModels = async () => {
      try {
        const r = await fetch('/api/models')
        const j = await r.json()
        if (!r.ok || !Array.isArray(j) || cancelled) return
        const next = (j as { id?: unknown; name?: unknown }[])
          .map((m) => ({
            id: String(m?.id || ''),
            name: String(m?.name || m?.id || ''),
          }))
          .filter((m) => m.id)
        setModels(next)
      } catch { /* request failed; models list stays empty */ }
    }
    void loadModels()
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target?.closest('[data-model-picker-root="true"]')) {
        setOpenModelPicker(null)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  const visibleRoleGroups = useMemo(() => {
    if (!data) return []
    const leadId = data.lead?.id || ''
    return (data.roleGroups || [])
      .map((group) => ({
        ...group,
        members: (group.members || []).filter((member) => member.id !== leadId),
      }))
      .filter((group) => group.members.length > 0)
  }, [data])
  const totalMembers = useMemo(() => visibleRoleGroups.reduce((a, g) => a + g.members.length, 0), [visibleRoleGroups])
  const resolveModelValue = (id: string, fallback?: string) => pendingModel[id] || fallback || ''
  const setModelValue = (id: string, value: string) => {
    setPendingModel((prev) => ({ ...prev, [id]: value }))
  }
  const resolveCurrentModelLabel = (agentId: string, fallback?: string) => {
    const key = resolveModelValue(agentId, fallback || '')
    const model = models.find((m) => m.id === key)
    return key ? modelOptionLabel(model?.name || key, key) : 'Select model...'
  }

  const saveAgentModel = async (agentId: string, modelKey: string) => {
    const nextModel = String(modelKey || '').trim()
    if (!agentId || !nextModel) {
      setToast({ type: 'error', text: 'Agent ve model zorunlu.' })
      setTimeout(() => setToast(null), 3500)
      return
    }
    setSavingModel((prev) => ({ ...prev, [agentId]: true }))
    try {
      const r = await fetch(`/api/agents/${encodeURIComponent(agentId)}/model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: nextModel }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j?.ok === false) throw new Error(j?.error || `HTTP ${r.status}`)
      await load()
      setToast({ type: 'success', text: `${agentId} modeli güncellendi.` })
      setTimeout(() => setToast(null), 3500)
    } catch (e) {
      setToast({ type: 'error', text: `Model update failed: ${e instanceof Error ? e.message : String(e)}` })
      setTimeout(() => setToast(null), 5000)
    } finally {
      setSavingModel((prev) => ({ ...prev, [agentId]: false }))
    }
  }

  const handleModelChange = async (agentId: string, currentModel: string, nextModel: string) => {
    const next = String(nextModel || '').trim()
    const current = String(currentModel || '').trim()
    setModelValue(agentId, next)
    if (!next || next === current) return
    await saveAgentModel(agentId, next)
  }

  const bootstrap = async () => {
    setBootstrapping(true)
    try {
      const r = await fetch('/api/team/structure/bootstrap', { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      await load()
      setToast({ type: 'success', text: j.message || 'Role suggestions generated. No agents were created.' })
      setTimeout(() => setToast(null), 3500)
    } catch (e) {
      setToast({ type: 'error', text: `Suggestion generation failed: ${e instanceof Error ? e.message : String(e)}` })
      setTimeout(() => setToast(null), 5000)
    } finally {
      setBootstrapping(false)
    }
  }

  const renderModelPicker = (agentId: string, fallbackModel?: string) => {
    const current = resolveModelValue(agentId, fallbackModel || '')
    const isOpen = openModelPicker === agentId
    const direction = pickerDirection[agentId] || 'down'
    return (
      <div data-model-picker-root="true" style={{ position: 'relative', marginLeft: 'auto' }}>
        <button
          type="button"
          onClick={(event) => {
            if (isOpen) {
              setOpenModelPicker(null)
              return
            }
            const rect = event.currentTarget.getBoundingClientRect()
            const estimatedMenuHeight = Math.min(220, Math.max(90, models.length * 34)) + 12
            const shouldOpenUp = rect.bottom + estimatedMenuHeight > window.innerHeight - 12
            setPickerDirection((prev) => ({ ...prev, [agentId]: shouldOpenUp ? 'up' : 'down' }))
            setOpenModelPicker(agentId)
          }}
          style={{ ...modelPickerButtonStyle, borderColor: isOpen ? 'rgba(0,122,255,0.5)' : modelPickerButtonStyle.border as string }}
          title={current || 'Select model'}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', width: '100%', gap: 6 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resolveCurrentModelLabel(agentId, fallbackModel)}</span>
            <ChevronDown size={12} style={{ marginLeft: 'auto', opacity: 0.8, flexShrink: 0 }} />
          </span>
        </button>
        {isOpen ? (
          <div style={{ position: 'absolute', [direction === 'up' ? 'bottom' : 'top']: 34, right: 0, width: 260, zIndex: 3000, border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, background: 'rgba(15,19,32,0.98)', boxShadow: '0 16px 40px rgba(0,0,0,0.45)', maxHeight: 220, overflowY: 'auto', padding: 6 }}>
            {models.map((opt) => {
              const selected = opt.id === current
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setOpenModelPicker(null)
                    void handleModelChange(agentId, fallbackModel || '', opt.id)
                  }}
                  style={{ width: '100%', border: 'none', borderRadius: 8, background: selected ? 'rgba(0,122,255,0.18)' : 'transparent', color: selected ? '#8CC8FF' : 'rgba(255,255,255,0.9)', fontSize: 12, textAlign: 'left', padding: '8px 10px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
                  title={opt.id}
                >
                  {selected ? <Check size={12} /> : <span style={{ width: 12 }} />}
                  {modelOptionLabel(opt.name, opt.id)}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Users size={22} style={{ color: '#64D2FF' }} /> Team Structure
            </h1>
            <p className="text-body" style={{ marginTop: 4 }}>Main agent + regularly used subagents grouped by roles and responsibilities.</p>
          </div>
          <div style={{ display: 'inline-flex', gap: 8 }}>
            <button onClick={load} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.9)', cursor: 'pointer' }}><RefreshCw size={14} /> Refresh</button>
            {data?.missingSuggested?.length ? (
              <button onClick={bootstrap} disabled={bootstrapping} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: 'none', background: '#007AFF', color: 'white', cursor: 'pointer', opacity: bootstrapping ? 0.6 : 1 }}>
                <Hammer size={14} /> {bootstrapping ? 'Generating...' : `Generate Role Suggestions (${data.missingSuggested.length})`}
              </button>
            ) : null}
          </div>
        </div>

        {error && <div className="macos-panel" style={{ padding: 12, color: '#ff6b6b' }}>{error}</div>}
        {toast && (
          <div className="macos-panel" style={{ padding: 12, border: `1px solid ${toast.type === 'success' ? 'rgba(50,215,75,0.35)' : 'rgba(255,69,58,0.35)'}`, background: toast.type === 'success' ? 'rgba(50,215,75,0.12)' : 'rgba(255,69,58,0.12)', color: toast.type === 'success' ? '#32D74B' : '#FF453A', fontSize: 12, fontWeight: 600 }}>
            {toast.text}
          </div>
        )}

        {loading && !data ? (
          <div className="macos-panel" style={{ padding: 16 }}>Loading team structure...</div>
        ) : null}

        {!!data && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
              <div style={{ position: 'relative', zIndex: openModelPicker === data.lead?.id ? 40 : 1 }}>
                <GlassCard noPad overflowVisible>
                  <div style={{ padding: 14 }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>Lead Agent</div>
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 24 }}>{data.lead?.emoji || '🤖'}</span>
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.95)', fontWeight: 700 }}>{data.lead?.name || 'main'}</div>
                      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{data.lead?.model || '—'}</div>
                    </div>
                  </div>
                  {data.lead ? (
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, letterSpacing: 0.3, textTransform: 'uppercase', color: 'rgba(255,255,255,0.42)' }}>Model</span>
                      {renderModelPicker(data.lead.id, data.lead.modelKey || '')}
                    </div>
                  ) : null}
                  </div>
                </GlassCard>
              </div>

              <GlassCard noPad>
                <div style={{ padding: 14 }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>Subagents</div>
                  <div style={{ marginTop: 8, fontSize: 24, color: '#64D2FF', fontWeight: 800 }}>{totalMembers}</div>
                </div>
              </GlassCard>

              <GlassCard noPad>
                <div style={{ padding: 14 }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>Total Agents</div>
                  <div style={{ marginTop: 8, fontSize: 24, color: '#32D74B', fontWeight: 800 }}>{data.totalAgents}</div>
                  {data.mode ? (
                    <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.56)' }}>
                      Mode: {data.mode}{data.shadow?.enabled ? data.shadow?.canary ? ' · shadow+canary' : ' · shadow' : ''}
                    </div>
                  ) : null}
                </div>
              </GlassCard>
            </div>

            {data.missingSuggested?.length ? (
              <GlassCard noPad>
                <div style={{ padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.88)', fontWeight: 700 }}>
                    <Sparkles size={14} /> Suggested Missing Roles
                  </div>
                  <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                    {data.missingSuggested.map((m) => (
                      <div key={m.id} style={{ border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '8px 10px', fontSize: 12, color: 'rgba(255,255,255,0.82)' }}>
                        <div style={{ fontWeight: 700 }}>{m.emoji} {m.name} · {m.role}</div>
                        {m.reason ? <div style={{ marginTop: 4, color: 'rgba(255,255,255,0.6)' }}>{m.reason}</div> : null}
                      </div>
                    ))}
                  </div>
                </div>
              </GlassCard>
            ) : null}

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', alignItems: 'start' }}>
              {visibleRoleGroups.map((group) => (
                <div key={group.role} style={{ position: 'relative', zIndex: activeGroupRole === group.role ? 30 : 1 }}>
                  <GlassCard noPad overflowVisible>
                    <div style={{ padding: 14, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.92)', fontWeight: 700 }}>
                        <UserCog size={14} /> {group.emoji ? `${group.emoji} ` : ''}{group.role}
                      </div>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{group.members.length}</span>
                    </div>
                    </div>
                    <div style={{ padding: 12, display: 'grid', gap: 8 }}>
                    {group.members.length === 0 ? (
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>No members</div>
                    ) : group.members.map((m) => (
                      <div key={m.id} style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 18 }}>{m.emoji || '🤖'}</span>
                          <div>
                            <div style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 650, fontSize: 13 }}>{m.name}</div>
                            <div style={{ color: 'rgba(255,255,255,0.56)', fontSize: 11 }}>{m.id}</div>
                          </div>
                        </div>
                        {m.title || m.summary ? (
                          <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.68)', fontSize: 11 }}>
                            {m.title ? <div style={{ fontWeight: 600 }}>{m.title}</div> : null}
                            {m.summary ? <div style={{ marginTop: m.title ? 2 : 0 }}>{m.summary}</div> : null}
                          </div>
                        ) : null}
                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, letterSpacing: 0.3, textTransform: 'uppercase', color: 'rgba(255,255,255,0.42)' }}>Model</span>
                          {renderModelPicker(m.id, m.modelKey || '')}
                        </div>
                        {savingModel[m.id] ? <div style={{ marginTop: 4, fontSize: 10, color: '#8CC8FF' }}>Saving model...</div> : null}
                        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, padding: '3px 8px', fontSize: 10, color: 'rgba(255,255,255,0.72)' }}>
                            {m.registryStatus === 'registered' ? 'Registry' : 'Unregistered'}
                          </span>
                          <span style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, padding: '3px 8px', fontSize: 10, color: 'rgba(255,255,255,0.72)' }}>
                            {m.runtimeStatus === 'active' ? 'Runtime active' : 'Runtime inactive'}
                          </span>
                          {m.source ? (
                            <span style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, padding: '3px 8px', fontSize: 10, color: 'rgba(255,255,255,0.72)' }}>
                              {m.source}
                            </span>
                          ) : null}
                        </div>
                        <ul style={{ marginTop: 8, paddingLeft: 18, color: 'rgba(255,255,255,0.72)', fontSize: 11 }}>
                          {m.responsibilities?.slice(0, 2).map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                        {m.workspace ? <div style={{ marginTop: 6, color: 'rgba(255,255,255,0.46)', fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{m.workspace}</div> : null}
                      </div>
                    ))}
                    </div>
                  </GlassCard>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </PageTransition>
  )
}
