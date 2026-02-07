import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import Sidebar from './components/Sidebar'
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

  return (
    <div className="flex h-screen overflow-hidden macos-desktop">
      <Sidebar />
      <main className="flex-1 overflow-y-auto" style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ padding: '32px 40px' }}>
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
    </div>
  )
}