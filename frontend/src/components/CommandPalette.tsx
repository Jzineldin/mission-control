import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Search, 
  LayoutDashboard,
  MessageCircle,
  Hammer,
  DollarSign,
  Clock,
  Radar,
  Bot,
  Settings,
  Puzzle,
  Cloud,
  Plus,
  Zap,
  Activity,
  Heart
} from 'lucide-react'
import { useIsMobile } from '../lib/useIsMobile'

interface CommandItem {
  id: string
  label: string
  icon: any
  type: 'page' | 'action'
  shortcut?: string
  action: () => void
}

export default function CommandPalette() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  // Navigation items (from Sidebar)
  const pages: CommandItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, type: 'page', action: () => navigate('/') },
    { id: 'conversations', label: 'Conversations', icon: MessageCircle, type: 'page', action: () => navigate('/conversations') },
    { id: 'workshop', label: 'Workshop', icon: Hammer, type: 'page', action: () => navigate('/workshop') },
    { id: 'costs', label: 'Cost Tracker', icon: DollarSign, type: 'page', action: () => navigate('/costs') },
    { id: 'cron', label: 'Cron Monitor', icon: Clock, type: 'page', action: () => navigate('/cron') },
    { id: 'scout', label: 'Scout', icon: Radar, type: 'page', action: () => navigate('/scout') },
    { id: 'agents', label: 'Agent Hub', icon: Bot, type: 'page', action: () => navigate('/agents') },
    { id: 'settings', label: 'Settings', icon: Settings, type: 'page', action: () => navigate('/settings') },
    { id: 'skills', label: 'Skills', icon: Puzzle, type: 'page', action: () => navigate('/skills') },
    { id: 'aws', label: 'AWS', icon: Cloud, type: 'page', action: () => navigate('/aws') },
  ]

  // Quick actions
  const actions: CommandItem[] = [
    {
      id: 'new-chat',
      label: 'New Chat',
      icon: Plus,
      type: 'action',
      action: () => {
        navigate('/conversations')
        // Trigger new chat after navigation
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('open-chat', { 
            detail: { message: '', autoSend: false } 
          }))
        }, 100)
      }
    },
    {
      id: 'add-task',
      label: 'Add Task',
      icon: Hammer,
      type: 'action',
      action: () => {
        navigate('/workshop')
        // Trigger add task modal after navigation
        setTimeout(() => {
          const addButton = document.querySelector('[data-add-task]') as HTMLButtonElement
          if (addButton) {
            addButton.click()
          } else {
            // Fallback - dispatch custom event that Workshop can listen for
            window.dispatchEvent(new CustomEvent('open-add-task'))
          }
        }, 100)
      }
    },
    {
      id: 'run-scan',
      label: 'Run Scout Scan',
      icon: Radar,
      type: 'action',
      action: async () => {
        try {
          await fetch('/api/scout/scan', { method: 'POST' })
          navigate('/scout')
        } catch (error) {
          console.error('Failed to trigger scan:', error)
        }
      }
    },
    {
      id: 'run-heartbeat',
      label: 'Run Heartbeat',
      icon: Heart,
      type: 'action',
      action: () => {
        window.dispatchEvent(new CustomEvent('open-chat', { 
          detail: { 
            message: 'Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.',
            autoSend: true 
          } 
        }))
      }
    }
  ]

  const allItems = [...pages, ...actions]

  // Filter items based on query
  const filteredItems = useMemo(() => {
    if (!query.trim()) return allItems
    
    const lowercaseQuery = query.toLowerCase()
    return allItems.filter(item => 
      item.label.toLowerCase().includes(lowercaseQuery) ||
      item.type.toLowerCase().includes(lowercaseQuery)
    )
  }, [query, allItems])

  // Group filtered items
  const groupedItems = useMemo(() => {
    const pageItems = filteredItems.filter(item => item.type === 'page')
    const actionItems = filteredItems.filter(item => item.type === 'action')
    
    const groups: { title: string; items: CommandItem[] }[] = []
    
    if (pageItems.length > 0) {
      groups.push({ title: 'Pages', items: pageItems })
    }
    if (actionItems.length > 0) {
      groups.push({ title: 'Actions', items: actionItems })
    }
    
    return groups
  }, [filteredItems])

  const totalItems = filteredItems.length

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Open/close with Cmd+K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(!isOpen)
        setQuery('')
        setSelectedIndex(0)
        return
      }

      // Close with Escape
      if (e.key === 'Escape') {
        if (isOpen) {
          e.preventDefault()
          setIsOpen(false)
          setQuery('')
          setSelectedIndex(0)
        } else {
          // Close chat widget if open (global Escape functionality)
          const closeButton = document.querySelector('[data-chat-widget-open] button[style*="background: rgba(255,255,255,0.06)"]') as HTMLButtonElement
          closeButton?.click()
        }
        return
      }

      if (!isOpen) return

      // Navigate with arrow keys
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, totalItems - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const selectedItem = filteredItems[selectedIndex]
        if (selectedItem) {
          selectedItem.action()
          setIsOpen(false)
          setQuery('')
          setSelectedIndex(0)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, selectedIndex, totalItems, filteredItems])

  // Focus input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Scroll selected item into view
  useEffect(() => {
    if (!resultsRef.current) return
    
    const selectedElement = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`)
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 400,
          display: 'flex',
          alignItems: isMobile ? 'flex-start' : 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          padding: isMobile ? '60px 16px' : '20px',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setIsOpen(false)
            setQuery('')
            setSelectedIndex(0)
          }
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          style={{
            width: '100%',
            maxWidth: 500,
            background: 'rgba(20, 22, 30, 0.97)',
            backdropFilter: 'blur(40px)',
            WebkitBackdropFilter: 'blur(40px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 16,
            boxShadow: '0 16px 60px rgba(0, 0, 0, 0.6)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: isMobile ? 'calc(100vh - 120px)' : '600px',
          }}
        >
          {/* Search Input */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}>
            <Search size={18} style={{ color: 'rgba(255, 255, 255, 0.5)', flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pages and actions..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'rgba(255, 255, 255, 0.92)',
                fontSize: 16,
                fontFamily: 'inherit',
              }}
            />
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              color: 'rgba(255, 255, 255, 0.4)',
              fontWeight: 500,
            }}>
              <kbd style={{
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}>
                ESC
              </kbd>
            </div>
          </div>

          {/* Results */}
          <div 
            ref={resultsRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '8px 0',
            }}
          >
            {totalItems === 0 ? (
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: 'rgba(255, 255, 255, 0.4)',
                fontSize: 14,
              }}>
                No results found
              </div>
            ) : (
              <div>
                {groupedItems.map((group, groupIndex) => {
                  let itemIndex = 0
                  // Calculate the starting index for this group
                  for (let i = 0; i < groupIndex; i++) {
                    itemIndex += groupedItems[i].items.length
                  }

                  return (
                    <div key={group.title}>
                      {/* Group header */}
                      <div style={{
                        padding: '12px 20px 8px',
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'rgba(255, 255, 255, 0.5)',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        borderTop: groupIndex > 0 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                        marginTop: groupIndex > 0 ? 8 : 0,
                      }}>
                        {group.title}
                      </div>

                      {/* Group items */}
                      {group.items.map((item, idx) => {
                        const currentIndex = itemIndex + idx
                        const isSelected = currentIndex === selectedIndex
                        const Icon = item.icon

                        return (
                          <div
                            key={item.id}
                            data-index={currentIndex}
                            onClick={() => {
                              item.action()
                              setIsOpen(false)
                              setQuery('')
                              setSelectedIndex(0)
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              padding: '12px 20px',
                              cursor: 'pointer',
                              background: isSelected ? 'rgba(0, 122, 255, 0.15)' : 'transparent',
                              borderLeft: isSelected ? '3px solid #007AFF' : '3px solid transparent',
                            }}
                          >
                            <div style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              background: isSelected ? 'rgba(0, 122, 255, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}>
                              <Icon 
                                size={16} 
                                style={{ 
                                  color: isSelected ? '#007AFF' : 'rgba(255, 255, 255, 0.65)' 
                                }} 
                              />
                            </div>
                            
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontSize: 14,
                                fontWeight: 500,
                                color: isSelected ? '#007AFF' : 'rgba(255, 255, 255, 0.92)',
                                marginBottom: 2,
                              }}>
                                {item.label}
                              </div>
                              {item.shortcut && (
                                <div style={{
                                  fontSize: 11,
                                  color: 'rgba(255, 255, 255, 0.4)',
                                }}>
                                  {item.shortcut}
                                </div>
                              )}
                            </div>

                            {/* Enter hint for selected item */}
                            {isSelected && (
                              <kbd style={{
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: 'rgba(0, 122, 255, 0.2)',
                                border: '1px solid rgba(0, 122, 255, 0.3)',
                                color: '#007AFF',
                                fontSize: 10,
                                fontWeight: 500,
                              }}>
                                ↵
                              </kbd>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer with shortcuts */}
          <div style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 11,
            color: 'rgba(255, 255, 255, 0.4)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <kbd style={{ padding: '2px 4px', borderRadius: 3, background: 'rgba(255, 255, 255, 0.08)' }}>↑</kbd>
                <kbd style={{ padding: '2px 4px', borderRadius: 3, background: 'rgba(255, 255, 255, 0.08)' }}>↓</kbd>
                <span>to navigate</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <kbd style={{ padding: '2px 6px', borderRadius: 3, background: 'rgba(255, 255, 255, 0.08)' }}>↵</kbd>
                <span>to select</span>
              </div>
            </div>
            <div>
              {totalItems} result{totalItems !== 1 ? 's' : ''}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}