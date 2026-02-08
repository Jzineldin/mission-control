import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Keyboard } from 'lucide-react'

const shortcuts = [
  { keys: ['⌘', 'K'], description: 'Open command palette' },
  { keys: ['/'], description: 'Open chat' },
  { keys: ['?'], description: 'Show this help' },
  { keys: ['Esc'], description: 'Close dialogs & panels' },
  { keys: ['d'], description: 'Deploy first opportunity (Scout)' },
  { keys: ['D'], description: 'Deploy & execute first opportunity (Scout)' },
  { keys: ['x'], description: 'Dismiss first opportunity (Scout)' },
  { keys: ['G', 'D'], description: 'Go to Dashboard' },
  { keys: ['G', 'Q'], description: 'Go to Quick Start' },
  { keys: ['G', 'C'], description: 'Go to Conversations' },
  { keys: ['G', 'W'], description: 'Go to Workshop' },
  { keys: ['G', 'S'], description: 'Go to Scout' },
  { keys: ['G', 'M'], description: 'Go to Memory' },
  { keys: ['G', 'E'], description: 'Go to Settings' },
]

export default function KeyboardShortcutsModal() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger in inputs/textareas
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
            zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(28, 28, 30, 0.95)', backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16,
              padding: 28, width: '100%', maxWidth: 420,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Keyboard size={18} style={{ color: '#007AFF' }} />
                <h2 style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>Keyboard Shortcuts</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <X size={14} style={{ color: 'rgba(255,255,255,0.5)' }} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {shortcuts.map((shortcut, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0', borderBottom: i < shortcuts.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  }}
                >
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{shortcut.description}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {shortcut.keys.map((key, j) => (
                      <span key={j}>
                        <kbd style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          minWidth: 24, height: 24, padding: '0 6px',
                          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 5, fontSize: 11, fontWeight: 600,
                          color: 'rgba(255,255,255,0.65)', fontFamily: 'system-ui',
                        }}>
                          {key}
                        </kbd>
                        {j < shortcut.keys.length - 1 && (
                          <span style={{ margin: '0 2px', fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>+</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>
                Press <kbd style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 3, padding: '1px 4px', fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>?</kbd> anywhere to toggle this dialog
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
