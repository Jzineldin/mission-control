import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Rocket, MessageCircle, Hammer, Radar, DollarSign, Clock,
  Brain, Settings, ChevronRight, X, CheckCircle, Sparkles, Zap
} from 'lucide-react'

interface Step {
  id: string
  title: string
  description: string
  icon: any
  color: string
  action: string  // route or action
  actionLabel: string
  completed: boolean
}

const STORAGE_KEY = 'mc-onboarding-progress'

function loadProgress(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch { return {} }
}

function saveProgress(progress: Record<string, boolean>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
}

export default function OnboardingChecklist() {
  const navigate = useNavigate()
  const [progress, setProgress] = useState(loadProgress)
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(true)

  // Check if onboarding was permanently dismissed
  useEffect(() => {
    if (localStorage.getItem('mc-onboarding-dismissed') === 'true') {
      setDismissed(true)
    }
  }, [])

  const steps: Step[] = [
    {
      id: 'quickstart',
      title: 'Try automation recipes',
      description: 'Enable one-click automations like daily email digest or weekly budget review',
      icon: Zap,
      color: '#FF9500',
      action: '/quick-start',
      actionLabel: 'Quick Start',
      completed: !!progress.quickstart,
    },
    {
      id: 'chat',
      title: 'Talk to your agent',
      description: 'Open the chat widget (bottom-right) or Conversations page. Ask anything!',
      icon: MessageCircle,
      color: '#007AFF',
      action: '/conversations',
      actionLabel: 'Open Chat',
      completed: !!progress.chat,
    },
    {
      id: 'workshop',
      title: 'Create your first task',
      description: 'Add a task in the Workshop. Your agent can research, write, or code for you.',
      icon: Hammer,
      color: '#FF9500',
      action: '/workshop',
      actionLabel: 'Open Workshop',
      completed: !!progress.workshop,
    },
    {
      id: 'cron',
      title: 'Schedule a cron job',
      description: 'Automate recurring tasks — daily check-ins, weekly reports, reminders.',
      icon: Clock,
      color: '#BF5AF2',
      action: '/cron',
      actionLabel: 'Open Cron Jobs',
      completed: !!progress.cron,
    },
    {
      id: 'costs',
      title: 'Check your costs',
      description: 'See how much your agent is costing. Set a budget to stay in control.',
      icon: DollarSign,
      color: '#32D74B',
      action: '/costs',
      actionLabel: 'View Costs',
      completed: !!progress.costs,
    },
    {
      id: 'memory',
      title: 'Explore agent memory',
      description: 'Your agent stores context in SOUL.md, MEMORY.md, and daily logs. Check them out.',
      icon: Brain,
      color: '#FF6B35',
      action: '/memory',
      actionLabel: 'Open Memory',
      completed: !!progress.memory,
    },
    {
      id: 'settings',
      title: 'Configure model routing',
      description: 'Choose which models to use for main chat, sub-agents, and heartbeats.',
      icon: Settings,
      color: '#8E8E93',
      action: '/settings',
      actionLabel: 'Open Settings',
      completed: !!progress.settings,
    },
  ]

  const completedCount = steps.filter(s => s.completed).length
  const allDone = completedCount === steps.length

  const handleStepClick = (step: Step) => {
    // Mark as completed
    const newProgress = { ...progress, [step.id]: true }
    setProgress(newProgress)
    saveProgress(newProgress)
    // Navigate
    navigate(step.action)
  }

  const handleDismiss = () => {
    localStorage.setItem('mc-onboarding-dismissed', 'true')
    setDismissed(true)
  }

  if (dismissed) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      style={{
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: allDone ? 'rgba(50,215,75,0.15)' : 'rgba(0,122,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {allDone
              ? <Sparkles size={16} style={{ color: '#32D74B' }} />
              : <Rocket size={16} style={{ color: '#007AFF' }} />
            }
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>
              {allDone ? 'Setup Complete! 🎉' : 'Getting Started'}
            </h3>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
              {allDone
                ? 'You\'ve explored all the features!'
                : `${completedCount}/${steps.length} steps completed`
              }
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Progress dots */}
          <div style={{ display: 'flex', gap: 3 }}>
            {steps.map(s => (
              <div key={s.id} style={{
                width: 6, height: 6, borderRadius: '50%',
                background: s.completed ? '#32D74B' : 'rgba(255,255,255,0.15)',
                transition: 'all 0.3s',
              }} />
            ))}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); handleDismiss() }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.3)', padding: 4,
            }}
            title="Dismiss onboarding"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Steps */}
      <AnimatePresence>
        {expanded && !allDone && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {steps.map((step) => (
                <div
                  key={step.id}
                  onClick={() => handleStepClick(step)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    background: step.completed ? 'rgba(50,215,75,0.04)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${step.completed ? 'rgba(50,215,75,0.1)' : 'transparent'}`,
                    transition: 'all 0.15s',
                    opacity: step.completed ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!step.completed) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                  }}
                  onMouseLeave={(e) => {
                    if (!step.completed) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
                  }}
                >
                  {/* Icon */}
                  <div style={{
                    width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                    background: step.completed ? 'rgba(50,215,75,0.12)' : `${step.color}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {step.completed
                      ? <CheckCircle size={14} style={{ color: '#32D74B' }} />
                      : <step.icon size={14} style={{ color: step.color }} />
                    }
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: 12, fontWeight: 500,
                      color: step.completed ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.85)',
                      textDecoration: step.completed ? 'line-through' : 'none',
                    }}>
                      {step.title}
                    </p>
                    {!step.completed && (
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2, lineHeight: 1.4 }}>
                        {step.description}
                      </p>
                    )}
                  </div>

                  {/* Arrow */}
                  {!step.completed && (
                    <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
