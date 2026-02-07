import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  Hammer,
  DollarSign,
  Clock,
  Radar,
  FileText,
  Bot,
  Activity,
  MessageCircle,
  Settings,
  Puzzle,
  Cloud
} from 'lucide-react'

interface McConfig {
  name?: string
  subtitle?: string
  modules?: Record<string, boolean>
}

const allNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', module: 'dashboard' },
  { to: '/chat', icon: MessageCircle, label: 'Conversations', module: 'chat' },
  { to: '/workshop', icon: Hammer, label: 'Workshop', module: 'workshop' },
  { to: '/costs', icon: DollarSign, label: 'Cost Tracker', module: 'costs' },
  { to: '/cron', icon: Clock, label: 'Cron Monitor', module: 'cron' },
  { to: '/scout', icon: Radar, label: 'Scout', module: 'scout' },
  { to: '/docs', icon: FileText, label: 'Doc Digest', module: 'docs' },
  { to: '/agents', icon: Bot, label: 'Agent Hub', module: 'agents' },
  { to: '/settings', icon: Settings, label: 'Settings', module: 'settings' },
  { to: '/skills', icon: Puzzle, label: 'Skills', module: 'skills' },
  { to: '/aws', icon: Cloud, label: 'AWS', module: 'aws' },
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

  // Filter nav items based on enabled modules
  const navItems = config?.modules
    ? allNavItems.filter(item => config.modules![item.module] !== false)
    : allNavItems

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
          <div>
            <h1 style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>{subtitle}</h1>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>System Monitor</p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="divider-h" style={{ margin: '0 16px', position: 'relative', zIndex: 2 }} />

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '12px 12px 0', position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `macos-list-item ${isActive ? 'active' : ''}`
              }
              style={{ display: 'flex', alignItems: 'center', gap: 12 }}
              onClick={onClose} // Close sidebar on mobile when nav item is clicked
            >
              <item.icon size={16} strokeWidth={2} />
              <span>{item.label}</span>
            </NavLink>
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
