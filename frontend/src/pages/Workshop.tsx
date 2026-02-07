import { motion } from 'framer-motion'
import { Plus, Clock, Zap, CheckCircle } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import { useApi, timeAgo } from '../lib/hooks'

const priorityConfig: Record<string, { dot: string; color: string }> = {
  high: { dot: 'status-dot-red', color: '#FF453A' },
  medium: { dot: 'status-dot-orange', color: '#FF9500' },
  low: { dot: 'bg-[#007AFF]', color: '#007AFF' },
}

const columnConfig: Record<string, { title: string; color: string; icon: any }> = {
  queue: { title: 'Queue', color: '#8E8E93', icon: Clock },
  inProgress: { title: 'In Progress', color: '#007AFF', icon: Zap },
  done: { title: 'Done', color: '#32D74B', icon: CheckCircle },
}

interface Task {
  id: string
  title: string
  description: string
  priority: string
  created?: string
  completed?: string
  tags: string[]
  assignee?: string
}

export default function Workshop() {
  const { data, loading } = useApi<any>('/api/tasks', 60000)

  if (loading || !data) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-[#007AFF] border-t-transparent rounded-full animate-spin" />
        </div>
      </PageTransition>
    )
  }

  const columns = data.columns

  return (
    <PageTransition>
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
          <div>
            <h1 className="text-title">Workshop</h1>
            <p className="text-body" style={{ marginTop: '8px' }}>Task management & project tracking</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="macos-button-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', fontSize: '14px' }}
          >
            <Plus size={14} /> Add Task
          </motion.button>
        </div>

        {/* Kanban Board */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px' }}>
          {(['queue', 'inProgress', 'done'] as const).map((col, ci) => {
            const tasks: Task[] = columns[col] || []
            const config = columnConfig[col]
            const Icon = config.icon
            return (
              <div key={col} style={{ minWidth: 0 }}>
                {/* Column Header */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: ci * 0.1 }}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', paddingLeft: '4px' }}
                >
                  <Icon size={16} style={{ color: config.color }} />
                  <h3 className="text-heading">{config.title}</h3>
                  <span className="macos-badge" style={{ fontSize: '11px' }}>
                    {tasks.length}
                  </span>
                </motion.div>

                {/* Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {tasks.map((task, i) => (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + ci * 0.1 + i * 0.05 }}
                      whileHover={{ y: -3, scale: 1.01 }}
                      className="macos-panel"
                      style={{ padding: '20px', cursor: 'pointer', overflow: 'hidden' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span className={`status-dot ${priorityConfig[task.priority]?.dot || 'bg-[#8E8E93]'}`} />
                        <h4 className="text-body" style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</h4>
                      </div>
                      <p className="text-caption" style={{ marginBottom: '16px', lineHeight: '1.6', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {task.description}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', minWidth: 0, flex: 1, overflow: 'hidden' }}>
                          {task.tags.map(tag => (
                            <span key={tag} className="macos-badge" style={{ fontSize: '10px', whiteSpace: 'nowrap' }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                        <span className="text-caption" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {task.completed ? timeAgo(task.completed) : task.created ? timeAgo(task.created) : ''}
                        </span>
                      </div>
                      {task.assignee && (
                        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                          <span className="text-caption">
                            Assigned to <span style={{ color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>{task.assignee}</span>
                          </span>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </PageTransition>
  )
}
