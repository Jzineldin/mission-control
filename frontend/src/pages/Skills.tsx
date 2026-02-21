import { useState } from 'react'
import { motion } from 'framer-motion'
import { Puzzle, Download, Trash2, ToggleLeft, ToggleRight, Package, FolderOpen, Code } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import { useIsMobile } from '../lib/useIsMobile'
import GlassCard from '../components/GlassCard'
import StatusBadge from '../components/StatusBadge'
import { useApi } from '../lib/hooks'
import { TEXT, COLORS, GLASS, accent } from '../lib/theme'

interface Skill {
  name: string
  description: string
  version?: string
  author?: string
  status: 'active' | 'inactive' | 'available'
  installed: boolean
  path?: string
  type?: 'workspace' | 'system' | 'custom'
}

export default function Skills() {
  const isMobile = useIsMobile()
  const { data: skillsData, loading, refetch } = useApi<{ installed: Skill[], available: Skill[] }>('/api/skills')
  const [filter, setFilter] = useState<'all' | 'installed' | 'available'>('all')
  const [toggling, setToggling] = useState<string | null>(null)

  const handleToggleSkill = async (skillName: string) => {
    setToggling(skillName)
    try {
      const skill = [...(skillsData?.installed || []), ...(skillsData?.available || [])].find(s => s.name === skillName)
      const newEnabled = skill?.status !== 'active'
      
      const response = await fetch(`/api/skills/${skillName}/toggle`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled })
      })
      if (response.ok) refetch()
    } catch (error) {
      console.error('Failed to toggle skill:', error)
    } finally {
      setToggling(null)
    }
  }

  const handleInstallSkill = async (skillName: string) => {
    setToggling(skillName)
    try {
      const response = await fetch(`/api/skills/${skillName}/install`, { method: 'POST' })
      if (response.ok) refetch()
    } catch (error) {
      console.error('Failed to install skill:', error)
    } finally {
      setToggling(null)
    }
  }

  const handleUninstallSkill = async (skillName: string) => {
    if (!confirm(`Are you sure you want to uninstall ${skillName}?`)) return
    setToggling(skillName)
    try {
      const response = await fetch(`/api/skills/${skillName}/uninstall`, { method: 'POST' })
      if (response.ok) refetch()
    } catch (error) {
      console.error('Failed to uninstall skill:', error)
    } finally {
      setToggling(null)
    }
  }

  const getFilteredSkills = () => {
    if (!skillsData) return []
    if (filter === 'installed') return skillsData.installed || []
    if (filter === 'available') return skillsData.available || []
    return [...(skillsData.installed || []), ...(skillsData.available || [])]
  }

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case 'system': return <Package size={16} style={{ color: COLORS.blue }} />
      case 'workspace': return <FolderOpen size={16} style={{ color: COLORS.green }} />
      default: return <Code size={16} style={{ color: COLORS.purple }} />
    }
  }

  const filteredSkills = getFilteredSkills()

  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '16px' : '0', display: 'flex', flexDirection: 'column', gap: isMobile ? 16 : 24 }}>
        {/* Header */}
        <div>
          <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Puzzle size={22} style={{ color: COLORS.purple }} /> Skills Manager
          </h1>
          <p className="text-body" style={{ marginTop: 4 }}>Installed skills that extend your agent's capabilities</p>
        </div>

        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 16 }}>
          {[
            { label: 'Installed', value: skillsData?.installed?.length || 0, color: COLORS.blue },
            { label: 'Active', value: skillsData?.installed?.filter(s => s.status === 'active').length || 0, color: COLORS.green },
            { label: 'Available', value: skillsData?.available?.length || 0, color: COLORS.purple },
            { label: 'System', value: skillsData?.installed?.filter(s => s.type === 'system').length || 0, color: COLORS.orange },
          ].map((s, i) => (
            <GlassCard key={s.label} delay={0.05 + i * 0.03} noPad>
              <div style={{ padding: '16px 20px' }}>
                <p className="text-label" style={{ marginBottom: 8 }}>{s.label}</p>
                <p style={{ fontSize: 24, fontWeight: 300, color: s.color }}>{s.value}</p>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: 8 }}>
          {(['all', 'installed', 'available'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              style={{
                padding: '8px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                border: filter === tab ? '1px solid rgba(0,122,255,0.4)' : '1px solid rgba(255,255,255,0.08)',
                background: filter === tab ? 'rgba(0,122,255,0.15)' : GLASS.surface,
                color: filter === tab ? '#fff' : 'rgba(255,255,255,0.55)',
                transition: 'all 0.2s',
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Skills Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {loading ? (
            <GlassCard noPad>
              <div style={{ padding: isMobile ? 16 : 24, textAlign: 'center', color: TEXT.tertiary, fontSize: 13 }}>
                Loading skills...
              </div>
            </GlassCard>
          ) : filteredSkills.length === 0 ? (
            <GlassCard noPad>
              <div style={{ padding: isMobile ? 16 : 24, textAlign: 'center', color: TEXT.tertiary, fontSize: 13 }}>
                No skills found
              </div>
            </GlassCard>
          ) : (
            filteredSkills.map((skill) => (
              <motion.div
                key={skill.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.01, translateY: -2 }}
                transition={{ duration: 0.2 }}
              >
                <GlassCard noPad>
                  <div style={{ padding: isMobile ? 16 : 24 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1 }}>
                        <div style={{ marginTop: 2 }}>{getTypeIcon(skill.type)}</div>
                        <div style={{ flex: 1 }}>
                          <h3 style={{ fontSize: 14, fontWeight: 600, color: TEXT.primary, marginBottom: 4 }}>{skill.name}</h3>
                          <p style={{ fontSize: 12, color: TEXT.secondary, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>
                            {skill.description || 'No description available'}
                          </p>
                          {skill.version && (
                            <div style={{ fontSize: 11, color: TEXT.tertiary, marginTop: 8 }}>
                              v{skill.version} {skill.author && `• by ${skill.author}`}
                            </div>
                          )}
                        </div>
                      </div>
                      <StatusBadge
                        status={skill.status === 'active' ? 'active' : skill.status === 'inactive' ? 'idle' : 'off'}
                        label={skill.status}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {skill.installed ? (
                        <>
                          {/* Enable/Disable Toggle */}
                          <button
                            onClick={() => handleToggleSkill(skill.name)}
                            disabled={toggling === skill.name}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8,
                              border: '1px solid rgba(255,255,255,0.08)', 
                              background: skill.status === 'active' ? 'rgba(52,215,75,0.15)' : GLASS.surface,
                              color: skill.status === 'active' ? COLORS.green : TEXT.secondary, 
                              fontSize: 11, cursor: 'pointer',
                              opacity: toggling === skill.name ? 0.5 : 1,
                              transition: 'all 0.2s',
                            }}
                          >
                            {skill.status === 'active' ? (
                              <><ToggleRight size={16} style={{ color: COLORS.green }} /><span>Enabled</span></>
                            ) : (
                              <><ToggleLeft size={16} style={{ color: COLORS.gray }} /><span>Disabled</span></>
                            )}
                          </button>
                          <button
                            onClick={() => handleUninstallSkill(skill.name)}
                            disabled={toggling === skill.name}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8,
                              border: '1px solid rgba(255,255,255,0.08)', background: GLASS.surface,
                              color: TEXT.secondary, fontSize: 11, cursor: 'pointer',
                              opacity: toggling === skill.name ? 0.5 : 1,
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,69,58,0.15)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = GLASS.surface }}
                          >
                            <Trash2 size={16} style={{ color: COLORS.red }} />
                            <span>Uninstall</span>
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleInstallSkill(skill.name)}
                          disabled={toggling === skill.name}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8,
                            border: 'none', background: COLORS.blue, color: '#fff', fontSize: 11, cursor: 'pointer',
                            opacity: toggling === skill.name ? 0.5 : 1,
                          }}
                        >
                          <Download size={16} />
                          <span>Install</span>
                        </button>
                      )}
                    </div>

                    {skill.path && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: 11, color: TEXT.dim, fontFamily: 'monospace' }}>
                          {skill.path}
                        </div>
                      </div>
                    )}
                  </div>
                </GlassCard>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </PageTransition>
  )
}
