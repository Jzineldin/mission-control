import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import { Menu, X } from 'lucide-react'
import { useIsMobile } from './lib/useIsMobile'
import Sidebar from './components/Sidebar'
import ChatWidget from './components/ChatWidget'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import Workshop from './pages/Workshop'
import Costs from './pages/Costs'
import Cron from './pages/Cron'
import Scout from './pages/Scout'
// Doc Digest removed — may return as Memory Explorer
import Agents from './pages/Agents'
import Settings from './pages/Settings'
import Skills from './pages/Skills'
import AWS from './pages/AWS'
import Setup from './pages/Setup'

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Check if setup is needed on initial app load (non-blocking)
  useEffect(() => {
    if (location.pathname !== '/setup') {
      fetch('/api/setup')
        .then(r => r.json())
        .then(data => {
          if (data.needsSetup) navigate('/setup')
        })
        .catch(() => {}) // Ignore errors — just show dashboard
    }
  }, []) // Run once on mount, not on every route change

  // Hide global chat widget on Conversations page (has its own chat)
  const hideChatWidget = isMobile && location.pathname === '/conversations'
  
  // Hide sidebar and chat widget on setup page
  const isSetupPage = location.pathname === '/setup'

  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="macos-desktop" style={{ display: 'flex', height: '100vh', overflow: 'hidden', maxWidth: '100vw' }}>
      {/* Mobile hamburger button — fixed top-left (hidden on setup) */}
      {isMobile && !isSetupPage && (
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            position: 'fixed',
            top: 12,
            left: 12,
            zIndex: 201,
            width: 44,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: sidebarOpen ? 'rgba(255,255,255,0.15)' : 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 10,
            color: 'rgba(255, 255, 255, 0.9)',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      )}

      {/* Sidebar overlay for mobile (hidden on setup) */}
      {isMobile && !isSetupPage && (
        <div
          className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar (hidden on setup) */}
      {!isSetupPage && <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />}
      
      <main style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        position: 'relative',
        zIndex: 1,
        maxWidth: '100%',
        WebkitOverflowScrolling: 'touch',
      }}>
        <div style={{
          padding: isSetupPage ? '32px 16px' : (isMobile ? '60px 16px 24px' : '32px 40px'),
          maxWidth: '100%',
          overflowX: 'hidden',
        }}>
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route path="/setup" element={<Setup />} />
              <Route path="/" element={<Dashboard />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/workshop" element={<Workshop />} />
              <Route path="/costs" element={<Costs />} />
              <Route path="/cron" element={<Cron />} />
              <Route path="/scout" element={<Scout />} />
              {/* Doc Digest removed */}
              <Route path="/agents" element={<Agents />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/skills" element={<Skills />} />
              <Route path="/aws" element={<AWS />} />
            </Routes>
          </AnimatePresence>
        </div>
      </main>

      {/* Global chat widget — hidden on pages with built-in chat (mobile) and setup page */}
      {!hideChatWidget && !isSetupPage && <ChatWidget />}
    </div>
  )
}
