import { useState } from 'react'
import { motion } from 'framer-motion'
import { Puzzle, Download, Trash2, ToggleLeft, ToggleRight, Package, FolderOpen, Code } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import GlassCard from '../components/GlassCard'
import StatusBadge from '../components/StatusBadge'
import { useApi } from '../lib/hooks'

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
  const { data: skillsData, loading, refetch } = useApi<{ installed: Skill[], available: Skill[] }>('/api/skills')
  const [filter, setFilter] = useState<'all' | 'installed' | 'available'>('all')
  const [toggling, setToggling] = useState<string | null>(null)

  const handleToggleSkill = async (skillName: string) => {
    setToggling(skillName)
    try {
      const response = await fetch(`/api/skills/${skillName}/toggle`, {
        method: 'POST'
      })
      if (response.ok) {
        refetch()
      }
    } catch (error) {
      console.error('Failed to toggle skill:', error)
    } finally {
      setToggling(null)
    }
  }

  const handleInstallSkill = async (skillName: string) => {
    setToggling(skillName)
    try {
      const response = await fetch(`/api/skills/${skillName}/install`, {
        method: 'POST'
      })
      if (response.ok) {
        refetch()
      }
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
      const response = await fetch(`/api/skills/${skillName}/uninstall`, {
        method: 'POST'
      })
      if (response.ok) {
        refetch()
      }
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

    // Combine both lists for 'all' filter
    return [
      ...(skillsData.installed || []),
      ...(skillsData.available || [])
    ]
  }

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case 'system':
        return <Package size={16} className="text-blue-400" />
      case 'workspace':
        return <FolderOpen size={16} className="text-green-400" />
      default:
        return <Code size={16} className="text-purple-400" />
    }
  }

  const filteredSkills = getFilteredSkills()

  return (
    <PageTransition>
      <div className="page-header">
        <Puzzle className="page-icon" />
        <h1 className="page-title">Skills Manager</h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <GlassCard>
          <div className="stat-card">
            <div className="stat-value">{skillsData?.installed?.length || 0}</div>
            <div className="stat-label">Installed</div>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="stat-card">
            <div className="stat-value">
              {skillsData?.installed?.filter(s => s.status === 'active').length || 0}
            </div>
            <div className="stat-label">Active</div>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="stat-card">
            <div className="stat-value">{skillsData?.available?.length || 0}</div>
            <div className="stat-label">Available</div>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="stat-card">
            <div className="stat-value">
              {(skillsData?.installed?.filter(s => s.type === 'system').length || 0)}
            </div>
            <div className="stat-label">System</div>
          </div>
        </GlassCard>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {(['all', 'installed', 'available'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-4 py-2 rounded-lg transition-all ${
              filter === tab
                ? 'macos-button-primary'
                : 'macos-control hover:bg-white/10'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Skills Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {loading ? (
          <GlassCard>
            <div className="p-6 text-center text-tertiary">
              Loading skills...
            </div>
          </GlassCard>
        ) : filteredSkills.length === 0 ? (
          <GlassCard>
            <div className="p-6 text-center text-tertiary">
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
              <GlassCard>
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-1">{getTypeIcon(skill.type)}</div>
                      <div className="flex-1">
                        <h3 className="text-heading mb-1">{skill.name}</h3>
                        <p className="text-body text-secondary line-clamp-2">
                          {skill.description || 'No description available'}
                        </p>
                        {skill.version && (
                          <div className="text-caption text-tertiary mt-2">
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

                  <div className="flex items-center gap-2">
                    {skill.installed ? (
                      <>
                        <button
                          onClick={() => handleToggleSkill(skill.name)}
                          disabled={toggling === skill.name}
                          className="flex items-center gap-2 px-3 py-2 macos-control hover:bg-white/10 transition-colors disabled:opacity-50"
                        >
                          {skill.status === 'active' ? (
                            <>
                              <ToggleRight size={16} className="text-green-400" />
                              <span className="text-caption">Disable</span>
                            </>
                          ) : (
                            <>
                              <ToggleLeft size={16} className="text-gray-400" />
                              <span className="text-caption">Enable</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleUninstallSkill(skill.name)}
                          disabled={toggling === skill.name}
                          className="flex items-center gap-2 px-3 py-2 macos-control hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                          <Trash2 size={16} className="text-red-400" />
                          <span className="text-caption">Uninstall</span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleInstallSkill(skill.name)}
                        disabled={toggling === skill.name}
                        className="flex items-center gap-2 px-3 py-2 macos-button-primary disabled:opacity-50"
                      >
                        <Download size={16} />
                        <span className="text-caption">Install</span>
                      </button>
                    )}
                  </div>

                  {skill.path && (
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <div className="text-caption text-tertiary font-mono">
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
    </PageTransition>
  )
}