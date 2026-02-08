import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap, Mail, Calendar, DollarSign, Newspaper, Activity, BarChart3, 
  CheckCircle, Clock, ArrowRight, Sparkles
} from 'lucide-react'
import PageTransition from '../components/PageTransition'
import { useIsMobile } from '../lib/useIsMobile'
import GlassCard from '../components/GlassCard'
import { addNotification } from '../components/NotificationSystem'

const AUTOMATION_RECIPES = [
  {
    id: 'email-digest',
    name: '📧 Daily Email Digest',
    description: 'Check unread emails every morning and summarize important ones',
    schedule: '0 8 * * *',
    icon: Mail,
    color: '#007AFF',
    task: 'Check my unread emails from the last 24 hours and summarize any that look important or urgent. Include sender, subject, and brief priority assessment. If there are no important emails, just say "No urgent emails today."',
    category: 'productivity',
    timeToValue: '1 day'
  },
  {
    id: 'calendar-agenda', 
    name: '📅 Morning Agenda',
    description: 'Daily calendar overview with upcoming events and preparation notes',
    schedule: '0 8 * * *',
    icon: Calendar,
    color: '#FF9500',
    task: 'Check my calendar for today and tomorrow. Summarize upcoming events, meetings, and deadlines. Include any preparation notes or conflicts I should know about.',
    category: 'productivity',
    timeToValue: '1 day'
  },
  {
    id: 'budget-check',
    name: '💰 Weekly Budget Review', 
    description: 'Monday morning review of AI costs and spending projections',
    schedule: '0 9 * * 1',
    icon: DollarSign,
    color: '#32D74B', 
    task: 'Review my AI/OpenClaw costs from the past week. Check total spending, daily averages, and project monthly costs. Alert me if spending is trending high or if I\'m likely to exceed any budgets.',
    category: 'monitoring',
    timeToValue: '1 week'
  },
  {
    id: 'tech-news',
    name: '🔍 Daily Tech Scan',
    description: 'Morning tech news summary focused on AI and OpenClaw ecosystem',
    schedule: '0 7 * * *',
    icon: Newspaper,
    color: '#BF5AF2',
    task: 'Search for recent news about AI, OpenClaw, LLMs, and major tech developments from the past 24 hours. Summarize the top 3 most relevant stories with brief implications or insights.',
    category: 'learning',
    timeToValue: '1 day'
  },
  {
    id: 'system-health',
    name: '🚨 System Health Check',
    description: 'Daily check of OpenClaw gateway, resources, and system status',
    schedule: '0 6 * * *',
    icon: Activity,
    color: '#FF453A',
    task: 'Check system health: OpenClaw gateway status, disk space, memory usage, and any error logs. Alert me if anything needs attention or if resources are running low.',
    category: 'monitoring',
    timeToValue: '1 day'
  },
  {
    id: 'weekly-report',
    name: '📊 Weekly Summary',
    description: 'Sunday evening wrap-up of the week\'s activity and next week prep',
    schedule: '0 20 * * 0',
    icon: BarChart3,
    color: '#8E8E93',
    task: 'Create a weekly summary: tasks completed, costs incurred, key conversations, and important decisions made this week. Include a brief outlook and priorities for next week.',
    category: 'reflection',
    timeToValue: '1 week'
  }
]

export default function QuickStart() {
  const m = useIsMobile()
  const [enabledRecipes, setEnabledRecipes] = useState<Set<string>>(new Set())
  const [enablingId, setEnablingId] = useState<string | null>(null)

  const handleEnableRecipe = async (recipe: typeof AUTOMATION_RECIPES[0]) => {
    setEnablingId(recipe.id)
    try {
      const job = {
        name: recipe.name,
        description: `Automated recipe: ${recipe.description}`,
        schedule: { kind: 'cron', expr: recipe.schedule, tz: 'UTC' },
        payload: {
          kind: 'agentTurn',
          message: recipe.task
        },
        delivery: { mode: 'announce' },
        sessionTarget: 'isolated',
        enabled: true
      }

      const response = await fetch('/api/cron/create', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job })
      })

      if (response.ok) {
        setEnabledRecipes(prev => new Set([...prev, recipe.id]))
        
        addNotification({
          type: 'success',
          title: 'Recipe enabled!',
          message: `${recipe.name} will run automatically on schedule: ${recipe.schedule}`
        })
      } else {
        throw new Error('Failed to create cron job')
      }
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Failed to enable recipe',
        message: `Could not enable ${recipe.name}: ${error}`
      })
    } finally {
      setEnablingId(null)
    }
  }

  const categories = ['productivity', 'monitoring', 'learning', 'reflection']
  const categoryLabels = {
    productivity: '🎯 Productivity',
    monitoring: '📊 Monitoring', 
    learning: '🧠 Learning',
    reflection: '🤔 Reflection'
  }

  const enabledCount = enabledRecipes.size

  return (
    <PageTransition>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: m ? 16 : 28 }}>
        {/* Header */}
        <div>
          <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Zap size={m ? 18 : 22} style={{ color: '#FF9500' }} /> Quick Start
          </h1>
          <p className="text-body" style={{ marginTop: 4 }}>
            One-click automation recipes to get immediate value from your OpenClaw agent
          </p>
        </div>

        {/* Progress Card */}
        <GlassCard noPad>
          <div style={{ padding: m ? 16 : 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: enabledCount === AUTOMATION_RECIPES.length ? 'rgba(50,215,75,0.15)' : 'rgba(255,149,0,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {enabledCount === AUTOMATION_RECIPES.length 
                  ? <Sparkles size={20} style={{ color: '#32D74B' }} />
                  : <Zap size={20} style={{ color: '#FF9500' }} />
                }
              </div>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>
                  {enabledCount === AUTOMATION_RECIPES.length 
                    ? 'All Recipes Enabled! 🎉' 
                    : 'Automation Setup'
                  }
                </h2>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
                  {enabledCount === AUTOMATION_RECIPES.length
                    ? 'You\'ve enabled all available automation recipes!'
                    : `${enabledCount}/${AUTOMATION_RECIPES.length} recipes enabled`
                  }
                </p>
              </div>
            </div>
            
            {/* Progress bar */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(enabledCount / AUTOMATION_RECIPES.length) * 100}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  style={{ 
                    height: '100%', 
                    background: enabledCount === AUTOMATION_RECIPES.length 
                      ? 'linear-gradient(90deg, #32D74B, #30D158)' 
                      : 'linear-gradient(90deg, #007AFF, #5AC8FA)',
                    borderRadius: 3 
                  }}
                />
              </div>
            </div>

            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
              Enable automation recipes to start getting daily value from your agent. 
              Each recipe runs automatically and delivers insights to your preferred channel.
            </p>
          </div>
        </GlassCard>

        {/* Recipe Categories */}
        {categories.map(category => {
          const recipes = AUTOMATION_RECIPES.filter(r => r.category === category)
          return (
            <div key={category}>
              <h2 style={{ 
                fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.92)', 
                marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 
              }}>
                {categoryLabels[category as keyof typeof categoryLabels]}
              </h2>
              
              <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : 'repeat(2, 1fr)', gap: 16 }}>
                {recipes.map((recipe, i) => {
                  const isEnabled = enabledRecipes.has(recipe.id)
                  const isEnabling = enablingId === recipe.id
                  
                  return (
                    <motion.div
                      key={recipe.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                    >
                      <GlassCard
                        hover={!isEnabled}
                        noPad
                        style={{
                          opacity: isEnabled ? 0.7 : 1,
                          borderColor: isEnabled ? 'rgba(50,215,75,0.3)' : undefined,
                          background: isEnabled ? 'rgba(50,215,75,0.05)' : undefined,
                        }}
                      >
                        <div style={{ padding: m ? 16 : 20 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
                            <div style={{
                              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                              background: `${recipe.color}15`, 
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              border: `1px solid ${recipe.color}30`
                            }}>
                              {isEnabled 
                                ? <CheckCircle size={20} style={{ color: '#32D74B' }} />
                                : <recipe.icon size={20} style={{ color: recipe.color }} />
                              }
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.92)', marginBottom: 4 }}>
                                {recipe.name}
                              </h3>
                              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5, marginBottom: 8 }}>
                                {recipe.description}
                              </p>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <Clock size={10} />
                                  {recipe.schedule}
                                </span>
                                <span>⏱ {recipe.timeToValue}</span>
                              </div>
                            </div>
                          </div>

                          <motion.button
                            whileHover={!isEnabled && !isEnabling ? { scale: 1.01 } : {}}
                            whileTap={!isEnabled && !isEnabling ? { scale: 0.99 } : {}}
                            onClick={() => !isEnabled && !isEnabling && handleEnableRecipe(recipe)}
                            disabled={isEnabled || isEnabling}
                            style={{
                              width: '100%', padding: '10px 16px', borderRadius: 8, border: 'none',
                              background: isEnabled 
                                ? 'rgba(50,215,75,0.15)' 
                                : isEnabling 
                                  ? 'rgba(255,149,0,0.15)' 
                                  : recipe.color,
                              color: isEnabled ? '#32D74B' : '#fff',
                              fontSize: 13, fontWeight: 600, cursor: isEnabled || isEnabling ? 'default' : 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                              opacity: isEnabled || isEnabling ? 0.7 : 1,
                            }}
                          >
                            {isEnabled 
                              ? <><CheckCircle size={14} /> Enabled</> 
                              : isEnabling 
                                ? <>⏳ Enabling...</>
                                : <><ArrowRight size={14} /> Enable Recipe</>
                            }
                          </motion.button>
                        </div>
                      </GlassCard>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Next Steps */}
        <GlassCard noPad>
          <div style={{ padding: m ? 16 : 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.92)', marginBottom: 12 }}>
              What happens next?
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
              <p>• Your enabled recipes will run automatically on their schedules</p>
              <p>• Results are delivered to your configured announcement channel</p>
              <p>• You can view and manage all cron jobs in the <strong style={{ color: '#007AFF' }}>Cron Jobs</strong> page</p>
              <p>• Customize any recipe by editing its cron job after creation</p>
            </div>
          </div>
        </GlassCard>
      </div>
    </PageTransition>
  )
}