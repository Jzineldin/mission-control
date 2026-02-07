import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useState } from 'react'
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
import Docs from './pages/Docs'
import Agents from './pages/Agents'
import Settings from './pages/Settings'
import Skills from './pages/Skills'
import AWS from './pages/AWS'

export default function App() {
  const location = useLocation()
  const isMobile = useIsMobile()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="macos-desktop" style={{ display: 'flex', height: '100vh', overflow: 'hidden', maxWidth: '100vw' }}>
      {/* Mobile hamburger button — fixed top-left */}
      {isMobile && (
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

      {/* Sidebar overlay for mobile */}
      {isMobile && (
        <div
          className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
          onClick={closeSidebar}
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />
      
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
          padding: isMobile ? '60px 16px 24px' : '32px 40px',
          maxWidth: '100%',
          overflowX: 'hidden',
        }}>
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/workshop" element={<Workshop />} />
              <Route path="/costs" element={<Costs />} />
              <Route path="/cron" element={<Cron />} />
              <Route path="/scout" element={<Scout />} />
              <Route path="/docs" element={<Docs />} />
              <Route path="/agents" element={<Agents />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/skills" element={<Skills />} />
              <Route path="/aws" element={<AWS />} />
            </Routes>
          </AnimatePresence>
        </div>
      </main>

      {/* Global chat widget — available on all pages */}
      <ChatWidget />
    </div>
  )
}
