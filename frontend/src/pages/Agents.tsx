import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, X, MessageSquare, Activity, BarChart3, Plus } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import { useIsMobile } from '../lib/useIsMobile'
import GlassCard from '../components/GlassCard'
import StatusBadge from '../components/StatusBadge'
import AnimatedCounter from '../components/AnimatedCounter'
import { useApi, timeAgo } from '../lib/hooks'

export default function Agents() {
  const m = useIsMobile()
  const { data, loading } = useApi<any>('/api/agents', 30000)
  const { data: modelsData } = useApi<any>('/api/models', 0)
  const { data: skillsData } = useApi<any>('/api/skills', 0)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    model: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
    systemPrompt: '',
    skills: [] as string[]
  })

  const templates = [
    {
      name: 'Research Bot',
      description: 'You research topics thoroughly and provide summaries with sources',
      model: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
      systemPrompt: 'You research topics thoroughly and provide comprehensive summaries with sources. Focus on accuracy, credibility, and providing multiple perspectives on complex topics.',
      skills: ['web_search', 'web_fetch']
    },
    {
      name: 'Code Reviewer',
      description: 'You review code for bugs, security issues, and best practices',
      model: 'us.anthropic.claude-opus-4-6-v1',
      systemPrompt: 'You review code for bugs, security vulnerabilities, and adherence to best practices. Provide detailed feedback on code quality, performance, and maintainability.',
      skills: ['exec', 'read', 'write', 'edit']
    },
    {
      name: 'Content Writer',
      description: 'You write engaging content for blogs, social media, and marketing',
      model: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
      systemPrompt: 'You write engaging, high-quality content for blogs, social media, and marketing materials. Focus on clear communication, compelling narratives, and audience engagement.',
      skills: ['web_search', 'image']
    }
  ]

  const applyTemplate = (template: typeof templates[0]) => {
    setCreateForm({
      name: template.name,
      description: template.description,
      model: template.model,
      systemPrompt: template.systemPrompt,
      skills: template.skills
    })
  }

  const handleCreateAgent = async () => {
    try {
      const response = await fetch('/api/agents/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm)
      })
      
      if (response.ok) {
        setShowCreateModal(false)
        setCreateForm({
          name: '',
          description: '',
          model: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
          systemPrompt: '',
          skills: []
        })
        // Refresh the agents list
        window.location.reload()
      }
    } catch (error) {
      console.error('Failed to create agent:', error)
    }
  }

  const handleSkillToggle = (skill: string) => {
    setCreateForm(prev => ({
      ...prev,
      skills: prev.skills.includes(skill)
        ? prev.skills.filter(s => s !== skill)
        : [...prev.skills, skill]
    }))
  }

  if (loading || !data) {
    return (
      <PageTransition>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
          <div style={{ width: 32, height: 32, border: '2px solid #BF5AF2', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
      </PageTransition>
    )
  }

  const { agents, conversations } = data
  const selected = agents.find((a: any) => a.id === selectedAgent)

  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: m ? '16px' : '0', display: 'flex', flexDirection: 'column', gap: m ? 20 : 28 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: m ? 'flex-start' : 'center', justifyContent: 'space-between', flexDirection: m ? 'column' : 'row', gap: m ? 12 : 0 }}>
          <div>
            <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Bot size={m ? 18 : 22} style={{ color: '#BF5AF2' }} /> Agent Hub
            </h1>
            <p className="text-body" style={{ marginTop: 4 }}>Multi-agent orchestration</p>
          </div>
          <motion.button
            whileHover={m ? undefined : { scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowCreateModal(true)}
            style={{
              background: 'linear-gradient(135deg, #BF5AF2 0%, #9C3AE8 100%)',
              border: 'none',
              borderRadius: 10,
              padding: m ? '10px 16px' : '12px 20px',
              color: 'white',
              fontSize: m ? 13 : 14,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(191,90,242,0.3)',
              width: m ? '100%' : undefined,
              justifyContent: m ? 'center' : undefined,
            }}
          >
            <Plus size={16} />
            Create Agent
          </motion.button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '2fr 1fr', gap: m ? 16 : 24 }}>
          {/* Agent Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : 'repeat(2, 1fr)', gap: m ? 12 : 16 }}>
              {agents.map((agent: any, i: number) => (
                <motion.div
                  key={agent.id}
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: i * 0.06 }}
                  whileHover={{ y: -3, scale: 1.01 }}
                  onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
                  className="macos-panel"
                  style={{
                    borderRadius: m ? 12 : 16, padding: m ? 14 : 20, cursor: 'pointer',
                    borderColor: selectedAgent === agent.id ? 'rgba(191,90,242,0.4)' : undefined,
                    background: selectedAgent === agent.id ? 'rgba(191,90,242,0.08)' : undefined,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                      {agent.avatar}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</h3>
                        <StatusBadge status={agent.status} pulse={agent.status === 'active'} />
                      </div>
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{agent.role}</p>
                      <p style={{ fontSize: 10, color: '#BF5AF2', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {agent.model?.replace('us.anthropic.', '').replace(/claude-opus-(\d+).*/, 'Claude Opus $1').replace(/claude-sonnet-(\d+).*/, 'Claude Sonnet $1').replace(/claude-haiku-(\d+).*/, 'Claude Haiku $1').replace(/-/g, ' ') || 'Unknown Model'}
                      </p>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 16, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>{agent.description}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <BarChart3 size={11} style={{ color: 'rgba(255,255,255,0.4)' }} /> {((agent.totalTokens || 0) / 1000).toFixed(0)}k tokens
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Activity size={11} style={{ color: 'rgba(255,255,255,0.4)' }} /> {agent.lastActive ? timeAgo(agent.lastActive) : 'n/a'}
                    </span>
                    <span style={{ marginLeft: 'auto' }}>
                      {agent.role}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Detail Panel */}
            <AnimatePresence>
              {selected && (
                <motion.div
                  initial={{ opacity: 0, height: 0, scale: 0.98 }}
                  animate={{ opacity: 1, height: 'auto', scale: 1 }}
                  exit={{ opacity: 0, height: 0, scale: 0.98 }}
                  transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <GlassCard hover={false} noPad>
                    <div style={{ padding: m ? 16 : 24 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
                            {selected.avatar}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>{selected.name}</h3>
                            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.description}</p>
                          </div>
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          className="macos-button"
                          style={{ padding: 8 }}
                          onClick={() => setSelectedAgent(null)}
                        >
                          <X size={16} style={{ color: 'rgba(255,255,255,0.6)' }} />
                        </motion.button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: m ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 16 }}>
                        {[
                          { label: 'Tokens', value: <><AnimatedCounter end={Math.round((selected.totalTokens || 0) / 1000)} /><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>k</span></> },
                          { label: 'Last Active', value: selected.lastActive ? timeAgo(selected.lastActive) : '—' },
                          { label: 'Model', value: selected.model?.replace('us.anthropic.', '').replace(/claude-opus-(\d+).*/, 'Claude Opus $1').replace(/claude-sonnet-(\d+).*/, 'Claude Sonnet $1').replace(/claude-haiku-(\d+).*/, 'Claude Haiku $1').replace(/-/g, ' ') || 'Unknown' },
                          { label: 'Status', value: <StatusBadge status={selected.status} size="md" /> },
                        ].map((item, idx) => (
                          <div key={idx} style={{ textAlign: 'center', padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <p style={{ fontSize: 20, fontWeight: 300, color: 'rgba(255,255,255,0.92)' }}>{item.value}</p>
                            <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{item.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Chat Feed */}
          <GlassCard delay={0.15} hover={false} noPad>
            <div style={{ padding: m ? 16 : 24 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.65)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <MessageSquare size={14} style={{ color: '#BF5AF2' }} /> Inter-Agent Chat
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 520, overflowY: 'auto', paddingRight: 4 }}>
                {conversations.map((msg: any, i: number) => {
                  const fromAgent = agents.find((a: any) => a.id === msg.from)
                  const isLeft = i % 2 === 0
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + i * 0.04 }}
                      style={{ display: 'flex', gap: 10, flexDirection: isLeft ? 'row' : 'row-reverse' }}
                    >
                      <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>
                        {fromAgent?.avatar || '🤖'}
                      </div>
                      <div style={{ maxWidth: '80%', textAlign: isLeft ? 'left' : 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, justifyContent: isLeft ? 'flex-start' : 'flex-end' }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.65)' }}>{fromAgent?.name || msg.from}</span>
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>→ {msg.to}</span>
                        </div>
                        <div style={{
                          padding: '10px 14px', fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5,
                          borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                        }}>
                          {msg.message}
                        </div>
                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 4, display: 'block' }}>{timeAgo(msg.time)}</span>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Create Agent Modal */}
        <AnimatePresence>
          {showCreateModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
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
                padding: 20
              }}
              onClick={() => setShowCreateModal(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: 'rgba(28, 28, 30, 0.95)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: m ? 12 : 16,
                  padding: m ? 20 : 32,
                  width: '100%',
                  maxWidth: m ? '95vw' : 600,
                  maxHeight: '90vh',
                  overflowY: 'auto'
                }}
              >
                {/* Modal Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>Create Agent</h2>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowCreateModal(false)}
                    style={{
                      background: 'rgba(255,255,255,0.1)',
                      border: 'none',
                      borderRadius: 8,
                      width: 32,
                      height: 32,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <X size={16} style={{ color: 'rgba(255,255,255,0.6)' }} />
                  </motion.button>
                </div>

                {/* Agent Templates */}
                <div style={{ marginBottom: 32 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.65)', marginBottom: 12 }}>Quick Start Templates</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
                    {templates.map((template, i) => (
                      <motion.div
                        key={template.name}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => applyTemplate(template)}
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 12,
                          padding: 16,
                          cursor: 'pointer',
                          textAlign: 'center'
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.92)', marginBottom: 4 }}>{template.name}</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
                          {template.model.includes('opus') ? 'Opus' : template.model.includes('sonnet') ? 'Sonnet' : 'Haiku'}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Form Fields */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: m ? 16 : 20 }}>
                  {/* Name */}
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.65)', marginBottom: 8 }}>
                      Name *
                    </label>
                    <input
                      type="text"
                      value={createForm.name}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Research Bot, Code Reviewer"
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 8,
                        fontSize: 14,
                        color: 'rgba(255,255,255,0.92)',
                        outline: 'none'
                      }}
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.65)', marginBottom: 8 }}>
                      Description
                    </label>
                    <textarea
                      value={createForm.description}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Brief description of what this agent does..."
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 8,
                        fontSize: 14,
                        color: 'rgba(255,255,255,0.92)',
                        outline: 'none',
                        resize: 'vertical',
                        minHeight: 80
                      }}
                    />
                  </div>

                  {/* Model */}
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.65)', marginBottom: 8 }}>
                      Model *
                    </label>
                    <select
                      value={createForm.model}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, model: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 8,
                        fontSize: 14,
                        color: 'rgba(255,255,255,0.92)',
                        outline: 'none'
                      }}
                    >
                      {(modelsData || []).map((model: any) => (
                        <option key={model.id} value={model.id}>{model.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* System Prompt */}
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.65)', marginBottom: 8 }}>
                      System Prompt
                    </label>
                    <textarea
                      value={createForm.systemPrompt}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, systemPrompt: e.target.value }))}
                      placeholder="You are a helpful assistant..."
                      rows={4}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 8,
                        fontSize: 14,
                        color: 'rgba(255,255,255,0.92)',
                        outline: 'none',
                        resize: 'vertical',
                        minHeight: 100
                      }}
                    />
                  </div>

                  {/* Skills */}
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.65)', marginBottom: 8 }}>
                      Skills
                    </label>
                    <div style={{ 
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 8,
                      padding: 16,
                      maxHeight: 200,
                      overflowY: 'auto'
                    }}>
                      {skillsData?.installed?.length ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                          {skillsData.installed.map((skill: any) => (
                            <label
                              key={skill.name}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                cursor: 'pointer',
                                fontSize: 13,
                                color: 'rgba(255,255,255,0.65)'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={createForm.skills.includes(skill.name)}
                                onChange={() => handleSkillToggle(skill.name)}
                                style={{ marginRight: 4 }}
                              />
                              {skill.name}
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', padding: 20 }}>
                          No skills available
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Modal Actions */}
                <div style={{ display: 'flex', gap: 12, marginTop: 32, justifyContent: 'flex-end' }}>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowCreateModal(false)}
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      border: 'none',
                      borderRadius: 8,
                      padding: '12px 24px',
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'rgba(255,255,255,0.65)',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleCreateAgent}
                    disabled={!createForm.name.trim()}
                    style={{
                      background: createForm.name.trim() ? 'linear-gradient(135deg, #BF5AF2 0%, #9C3AE8 100%)' : 'rgba(255,255,255,0.12)',
                      border: 'none',
                      borderRadius: 8,
                      padding: '12px 24px',
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'white',
                      cursor: createForm.name.trim() ? 'pointer' : 'not-allowed',
                      opacity: createForm.name.trim() ? 1 : 0.5
                    }}
                  >
                    Create Agent
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  )
}
