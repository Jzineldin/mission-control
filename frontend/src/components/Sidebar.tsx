import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  Hammer,
  DollarSign,
  Clock,
  Radar,
  Brain,
  Bot,
  Activity,
  MessageCircle,
  Settings,
  Puzzle,
  Cloud,
  Command,
  Zap,
  FileText
} from 'lucide-react'

interface McConfig {
  name?: string
  subtitle?: string
  modules?: Record<string, boolean>
}

interface NavGroup {
  label: string
  items: NavItem[]
}

interface NavItem {
  to: string
  icon: any
  label: string
  module: string
}

const navGroups: NavGroup[] = [
  {
    label: '',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard', module: 'dashboard' },
      { to: '/quick-start', icon: Zap, label: 'Quick Start', module: 'dashboard' },
      { to: '/conversations', icon: MessageCircle, label: 'Conversations', module: 'chat' },
    ]
  },
  {
    label: 'Work',
    items: [
      { to: '/workshop', icon: Hammer, label: 'Workshop', module: 'workshop' },
      { to: '/scout', icon: Radar, label: 'Scout', module: 'scout' },
    ]
  },
  {
    label: 'Monitor',
    items: [
      { to: '/costs', icon: DollarSign, label: 'Costs', module: 'costs' },
      { to: '/cron', icon: Clock, label: 'Cron Jobs', module: 'cron' },
    ]
  },
  {
    label: 'Configure',
    items: [
      { to: '/agents', icon: Bot, label: 'Agents', module: 'agents' },
      { to: '/skills', icon: Puzzle, label: 'Skills', module: 'skills' },
      { to: '/memory', icon: Brain, label: 'Memory', module: 'memory' },
      { to: '/docs', icon: FileText, label: 'Documents', module: 'docs' },
      { to: '/settings', icon: Settings, label: 'Settings', module: 'settings' },
    ]
  },
  {
    label: 'Cloud',
    items: [
      { to: '/aws', icon: Cloud, label: 'AWS', module: 'aws' },
    ]
  },
]

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const [config, setConfig] = useState<McConfig | null>(null)

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(setConfig)
      .catch(() => setConfig({ name: 'Mission Control', subtitle: 'Mission Control', modules: {} }))
  }, [])

  // Filter nav groups based on enabled modules
  const filteredGroups = navGroups.map(group => ({
    ...group,
    items: config?.modules
      ? group.items.filter(item => config.modules![item.module] !== false)
      : group.items
  })).filter(group => group.items.length > 0)

  const displayName = config?.name || 'Mission Control'
  const subtitle = config?.subtitle || 'Mission Control'

  return (
    <aside 
      style={{ width: 256, height: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }} 
      className={`macos-sidebar ${isOpen ? 'open' : ''}`}
    >
      {/* Logo Section */}
      <div style={{ padding: '16px 16px 12px', position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#007AFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={16} style={{ color: '#fff' }} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>{subtitle}</h1>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>Agent Dashboard</p>
          </div>
          <div 
            style={{ 
              fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.3)', 
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, 
              padding: '2px 5px', cursor: 'default', flexShrink: 0 
            }} 
            title="Press ⌘K to open command palette"
          >
            <Command size={9} style={{ verticalAlign: 'middle', marginRight: 2 }} />K
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="divider-h" style={{ margin: '0 16px', position: 'relative', zIndex: 2 }} />

      {/* Navigation — Grouped */}
      <nav style={{ flex: 1, padding: '8px 12px 0', position: 'relative', zIndex: 2, overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filteredGroups.map((group, gi) => (
            <div key={group.label || 'top'} style={{ marginBottom: gi < filteredGroups.length - 1 ? 6 : 0 }}>
              {/* Section label */}
              {group.label && (
                <div style={{ 
                  fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.28)', 
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  padding: '10px 12px 4px', userSelect: 'none'
                }}>
                  {group.label}
                </div>
              )}
              {/* Nav items */}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `macos-list-item ${isActive ? 'active' : ''}`
                  }
                  style={{ display: 'flex', alignItems: 'center', gap: 12 }}
                  onClick={onClose}
                >
                  <item.icon size={15} strokeWidth={2} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </div>
      </nav>

      {/* Divider */}
      <div className="divider-h" style={{ margin: '0 16px', position: 'relative', zIndex: 2 }} />

      {/* Footer */}
      <div style={{ padding: 16, position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={16} style={{ color: 'rgba(255,255,255,0.65)' }} />
            </div>
            <span className="status-dot status-dot-green" style={{ position: 'absolute', top: -4, right: -4 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>{displayName}</p>
            <p style={{ fontSize: 10, color: '#32D74B', fontWeight: 500 }}>Active</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
