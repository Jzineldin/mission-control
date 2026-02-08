import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
}

interface ToastContextType {
  addToast: (message: string, type?: ToastType, duration?: number) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context
}

const toastIcons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
}

const toastColors = {
  success: { bg: 'rgba(50,215,75,0.15)', border: 'rgba(50,215,75,0.3)', text: '#32D74B' },
  error: { bg: 'rgba(255,69,58,0.15)', border: 'rgba(255,69,58,0.3)', text: '#FF453A' },
  info: { bg: 'rgba(0,122,255,0.15)', border: 'rgba(0,122,255,0.3)', text: '#007AFF' },
}

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
    const id = Math.random().toString(36).slice(2)
    const toast = { id, message, type, duration }
    
    setToasts(prev => [...prev, toast])
    
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, duration)
    }
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      
      {/* Toast Container */}
      <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 9999, pointerEvents: 'none' }}>
        <AnimatePresence>
          {toasts.map(toast => {
            const Icon = toastIcons[toast.type]
            const colors = toastColors[toast.type]
            
            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, x: 400, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 400, scale: 0.9 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 16px', marginBottom: 8, borderRadius: 12,
                  background: `${colors.bg}dd`, backdropFilter: 'blur(20px) saturate(180%)',
                  border: `1px solid ${colors.border}`, color: colors.text,
                  fontSize: 14, fontWeight: 500, minWidth: 280, maxWidth: 400,
                  pointerEvents: 'auto', cursor: 'pointer',
                }}
                onClick={() => removeToast(toast.id)}
              >
                <Icon size={16} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, wordBreak: 'break-word' }}>{toast.message}</span>
                <X size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export default ToastProvider