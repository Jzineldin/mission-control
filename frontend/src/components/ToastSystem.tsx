import { useState, useEffect, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react'

interface Toast {
  id: string
  type: 'success' | 'warning' | 'error' | 'info'
  title: string
  message?: string
  duration?: number
  persistent?: boolean
}

interface ToastContextType {
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

let toastContext: ToastContextType | null = null

const toastIcons = {
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
}

const toastColors = {
  success: { bg: 'rgba(50, 215, 75, 0.15)', border: 'rgba(50, 215, 75, 0.3)', color: '#32D74B' },
  warning: { bg: 'rgba(255, 149, 0, 0.15)', border: 'rgba(255, 149, 0, 0.3)', color: '#FF9500' },
  error: { bg: 'rgba(255, 69, 58, 0.15)', border: 'rgba(255, 69, 58, 0.3)', color: '#FF453A' },
  info: { bg: 'rgba(0, 122, 255, 0.15)', border: 'rgba(0, 122, 255, 0.3)', color: '#007AFF' },
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    toastContext = {
      addToast: (toast: Omit<Toast, 'id'>) => {
        const id = Math.random().toString(36).substr(2, 9)
        const newToast: Toast = { id, ...toast }
        setToasts(prev => [...prev, newToast])
        
        // Auto-remove after duration (default 5s)
        if (!toast.persistent) {
          setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
          }, toast.duration || 5000)
        }
      },
      removeToast: (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }
    }
  }, [])

  return (
    <div style={{
      position: 'fixed',
      top: 20,
      right: 20,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      maxWidth: 400,
      pointerEvents: 'none'
    }}>
      <AnimatePresence>
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onRemove={() => toastContext?.removeToast(toast.id)} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  const Icon = toastIcons[toast.type]
  const colors = toastColors[toast.type]

  return (
    <motion.div
      initial={{ opacity: 0, x: 300, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 300, scale: 0.95 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      style={{
        background: 'rgba(28, 28, 30, 0.95)',
        backdropFilter: 'blur(20px)',
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        padding: '16px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        pointerEvents: 'auto',
        position: 'relative',
        minWidth: 280,
        maxWidth: 400,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <Icon size={20} style={{ color: colors.color, flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ 
            fontSize: 14, 
            fontWeight: 600, 
            color: 'rgba(255,255,255,0.92)', 
            margin: 0, 
            marginBottom: toast.message ? 4 : 0,
            lineHeight: 1.3 
          }}>
            {toast.title}
          </h4>
          {toast.message && (
            <p style={{ 
              fontSize: 13, 
              color: 'rgba(255,255,255,0.65)', 
              margin: 0, 
              lineHeight: 1.4 
            }}>
              {toast.message}
            </p>
          )}
        </div>
        <button
          onClick={onRemove}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.4)',
            flexShrink: 0
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
        >
          <X size={14} />
        </button>
      </div>
    </motion.div>
  )
}

// Export global toast functions for use anywhere in the app
export const toast = {
  success: (title: string, message?: string, options?: { duration?: number; persistent?: boolean }) => {
    toastContext?.addToast({ type: 'success', title, message, ...options })
  },
  warning: (title: string, message?: string, options?: { duration?: number; persistent?: boolean }) => {
    toastContext?.addToast({ type: 'warning', title, message, ...options })
  },
  error: (title: string, message?: string, options?: { duration?: number; persistent?: boolean }) => {
    toastContext?.addToast({ type: 'error', title, message, ...options })
  },
  info: (title: string, message?: string, options?: { duration?: number; persistent?: boolean }) => {
    toastContext?.addToast({ type: 'info', title, message, ...options })
  },
}