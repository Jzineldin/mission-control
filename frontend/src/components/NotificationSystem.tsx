import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'

interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message: string
  timestamp: number
  duration?: number
}

interface NotificationSystemProps {
  maxVisible?: number
}

const iconMap = {
  success: CheckCircle,
  error: AlertCircle, 
  warning: AlertTriangle,
  info: Info
}

const colorMap = {
  success: '#32D74B',
  error: '#FF453A',
  warning: '#FF9500', 
  info: '#007AFF'
}

let notificationQueue: Notification[] = []
let setNotifications: React.Dispatch<React.SetStateAction<Notification[]>> | null = null

export function addNotification(notification: Omit<Notification, 'id' | 'timestamp'>) {
  const newNotification: Notification = {
    ...notification,
    id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    timestamp: Date.now(),
    duration: notification.duration || 5000
  }

  if (setNotifications) {
    setNotifications(prev => [...prev, newNotification])
  } else {
    notificationQueue.push(newNotification)
  }
}

export default function NotificationSystem({ maxVisible = 5 }: NotificationSystemProps) {
  const [notifications, _setNotifications] = useState<Notification[]>([])

  // Expose setNotifications globally
  useEffect(() => {
    setNotifications = _setNotifications
    
    // Process any queued notifications
    if (notificationQueue.length > 0) {
      _setNotifications(notificationQueue)
      notificationQueue = []
    }

    return () => {
      setNotifications = null
    }
  }, [])

  // Auto-remove notifications after duration
  useEffect(() => {
    const timers: NodeJS.Timeout[] = []
    
    notifications.forEach(notification => {
      if (notification.duration > 0) {
        const timer = setTimeout(() => {
          _setNotifications(prev => prev.filter(n => n.id !== notification.id))
        }, notification.duration)
        timers.push(timer)
      }
    })

    return () => timers.forEach(clearTimeout)
  }, [notifications])

  const removeNotification = (id: string) => {
    _setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const visibleNotifications = notifications.slice(-maxVisible)

  return (
    <div style={{
      position: 'fixed',
      top: 20,
      right: 20,
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      maxWidth: 400,
      pointerEvents: 'none'
    }}>
      <AnimatePresence mode="popLayout">
        {visibleNotifications.map((notification, index) => {
          const Icon = iconMap[notification.type]
          const color = colorMap[notification.type]
          
          return (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, x: 300, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 300, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              style={{
                background: 'rgba(13, 17, 23, 0.95)',
                border: `1px solid ${color}40`,
                borderRadius: 12,
                padding: 16,
                minWidth: 280,
                maxWidth: 400,
                backdropFilter: 'blur(20px)',
                boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)`,
                pointerEvents: 'auto'
              }}
              layout
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: `${color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Icon size={18} style={{ color }} />
                </div>
                
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.92)',
                    margin: '0 0 4px 0',
                    lineHeight: 1.3
                  }}>
                    {notification.title}
                  </h4>
                  <p style={{
                    fontSize: 13,
                    color: 'rgba(255,255,255,0.65)',
                    margin: 0,
                    lineHeight: 1.4,
                    wordBreak: 'break-word'
                  }}>
                    {notification.message}
                  </p>
                </div>
                
                <button
                  onClick={() => removeNotification(notification.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255,255,255,0.35)',
                    cursor: 'pointer',
                    padding: 4,
                    borderRadius: 4,
                    flexShrink: 0,
                    transition: 'color 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.65)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
                >
                  <X size={14} />
                </button>
              </div>
              
              {/* Progress bar for timed notifications */}
              {notification.duration > 0 && (
                <motion.div
                  style={{
                    height: 2,
                    background: 'rgba(255,255,255,0.08)',
                    borderRadius: 1,
                    marginTop: 12,
                    overflow: 'hidden'
                  }}
                >
                  <motion.div
                    initial={{ width: '100%' }}
                    animate={{ width: '0%' }}
                    transition={{ duration: notification.duration / 1000, ease: 'linear' }}
                    style={{
                      height: '100%',
                      background: color,
                      borderRadius: 1
                    }}
                  />
                </motion.div>
              )}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}