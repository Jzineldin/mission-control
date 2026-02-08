import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useState, useEffect, lazy, Suspense } from 'react'
import { Menu, X } from 'lucide-react'
import { useIsMobile } from './lib/useIsMobile'
import Sidebar from './components/Sidebar'
import ChatWidget from './components/ChatWidget'
import CommandPalette from './components/CommandPalette'
import KeyboardShortcuts from './components/KeyboardShortcuts'
import NotificationSystem from './components/NotificationSystem'
import ErrorBoundary from './components/ErrorBoundary'
import ToastProvider from './components/ToastProvider'
import { ToastContainer } from './components/ToastSystem'

// Lazy load all pages
const Dashboard = lazy(() => import('./pages/Dashboard'))
const QuickStart = lazy(() => import('./pages/QuickStart'))
const Chat = lazy(() => import('./pages/Chat'))
const Workshop = lazy(() => import('./pages/Workshop'))
const Costs = lazy(() => import('./pages/Costs'))
const Cron = lazy(() => import('./pages/Cron'))
const Scout = lazy(() => import('./pages/Scout'))
const Memory = lazy(() => import('./pages/Memory'))
const Agents = lazy(() => import('./pages/Agents'))
const Settings = lazy(() => import('./pages/Settings'))
const Skills = lazy(() => import('./pages/Skills'))
const AWS = lazy(() => import('./pages/AWS'))
const Docs = lazy(() => import('./pages/Docs'))
const Setup = lazy(() => import('./pages/Setup'))
const NotFound = lazy(() => import('./pages/NotFound'))

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
  
  // G-key navigation: press G then a letter to navigate
  useEffect(() => {
    let gPressed = false
    let gTimeout: any = null
    
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      
      if (e.key === 'g' && !e.metaKey && !e.ctrlKey) {
        if (gPressed) return
        gPressed = true
        gTimeout = setTimeout(() => { gPressed = false }, 1500)
        return
      }
      
      if (gPressed) {
        gPressed = false
        clearTimeout(gTimeout)
        const routes: Record<string, string> = {
          d: '/', q: '/quick-start', c: '/conversations', w: '/workshop', s: '/scout',
          m: '/memory', e: '/settings', a: '/agents', k: '/skills',
          o: '/costs', r: '/cron',
        }
        const route = routes[e.key.toLowerCase()]
        if (route) {
          e.preventDefault()
          navigate(route)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])
  
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
          <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
              <div style={{ width: 24, height: 24, border: '2px solid #007AFF', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            </div>
          }>
            <AnimatePresence mode="wait">
              <Routes location={location} key={location.pathname}>
                <Route path="/setup" element={<ErrorBoundary><Setup /></ErrorBoundary>} />
                <Route path="/quick-start" element={<ErrorBoundary><QuickStart /></ErrorBoundary>} />
                <Route path="/" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
                <Route path="/conversations" element={<ErrorBoundary><Chat /></ErrorBoundary>} />
                <Route path="/workshop" element={<ErrorBoundary><Workshop /></ErrorBoundary>} />
                <Route path="/costs" element={<ErrorBoundary><Costs /></ErrorBoundary>} />
                <Route path="/cron" element={<ErrorBoundary><Cron /></ErrorBoundary>} />
                <Route path="/scout" element={<ErrorBoundary><Scout /></ErrorBoundary>} />
                <Route path="/memory" element={<ErrorBoundary><Memory /></ErrorBoundary>} />
                <Route path="/agents" element={<ErrorBoundary><Agents /></ErrorBoundary>} />
                <Route path="/settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
                <Route path="/skills" element={<ErrorBoundary><Skills /></ErrorBoundary>} />
                <Route path="/aws" element={<ErrorBoundary><AWS /></ErrorBoundary>} />
                <Route path="/docs" element={<ErrorBoundary><Docs /></ErrorBoundary>} />
                <Route path="*" element={<ErrorBoundary><NotFound /></ErrorBoundary>} />
              </Routes>
            </AnimatePresence>
          </Suspense>
        </div>
      </main>

      {/* Global chat widget — hidden on pages with built-in chat (mobile) and setup page */}
      {!hideChatWidget && !isSetupPage && <ChatWidget />}

      {/* Command Palette — available everywhere except setup */}
      {!isSetupPage && <CommandPalette />}
      {!isSetupPage && <KeyboardShortcuts />}
      <NotificationSystem />

      {/* Toast Notifications */}
      <ToastContainer />
    </div>
  )
}
