import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Hammer,
  DollarSign,
  Clock,
  Radar,
  FileText,
  Bot,
  Activity,
  MessageCircle
} from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/chat', icon: MessageCircle, label: 'Chat' },
  { to: '/workshop', icon: Hammer, label: 'Workshop' },
  { to: '/costs', icon: DollarSign, label: 'Cost Tracker' },
  { to: '/cron', icon: Clock, label: 'Cron Monitor' },
  { to: '/scout', icon: Radar, label: 'Twitter Scout' },
  { to: '/docs', icon: FileText, label: 'Doc Digest' },
  { to: '/agents', icon: Bot, label: 'Agent Hub' },
]

export default function Sidebar() {
  return (
    <aside className="w-64 h-screen flex flex-col macos-sidebar" style={{ position: 'relative' }}>
      {/* Logo Section */}
      <div className="p-4 pb-3" style={{ position: 'relative', zIndex: 2 }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#007AFF] flex items-center justify-center">
            <Activity size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-[rgba(255,255,255,0.92)]">Mission Control</h1>
            <p className="text-[10px] text-[rgba(255,255,255,0.45)] font-medium">System Monitor</p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="divider-h mx-4" style={{ position: "relative", zIndex: 2 }} />

      {/* Navigation */}
      <nav className="flex-1 px-3 mt-3" style={{ position: "relative", zIndex: 2 }}>
        <div className="space-y-1.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `macos-list-item flex items-center gap-3 ${
                  isActive ? 'active' : ''
                }`
              }
            >
              <item.icon size={16} strokeWidth={2} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Divider */}
      <div className="divider-h mx-4" style={{ position: "relative", zIndex: 2 }} />

      {/* Footer */}
      <div className="p-4" style={{ position: "relative", zIndex: 2 }}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-8 h-8 rounded-lg bg-[rgba(255,255,255,0.1)] flex items-center justify-center">
              <Bot size={16} className="text-[rgba(255,255,255,0.65)]" />
            </div>
            <span className="absolute -top-1 -right-1 status-dot status-dot-green" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[rgba(255,255,255,0.92)]">Zinbot</p>
            <p className="text-[10px] text-[#32D74B] font-medium">Active</p>
          </div>
        </div>
      </div>
    </aside>
  )
}