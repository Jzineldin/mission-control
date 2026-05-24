/* eslint-disable react-refresh/only-export-components */
import { lazy } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Hammer,
  DollarSign,
  Clock,
  Radar,
  Bot,
  MessageCircle,
  Settings,
  Puzzle,
  Cloud,
  CalendarDays,
  Brain,
  Building2,
  Landmark,
  Users2,
  Kanban,
  GitBranch,
} from 'lucide-react'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Chat = lazy(() => import('./pages/Chat'))
const Workshop = lazy(() => import('./pages/Workshop'))
const HermesKanban = lazy(() => import('./pages/HermesKanban'))
const Costs = lazy(() => import('./pages/Costs'))
const Cron = lazy(() => import('./pages/Cron'))
const Scout = lazy(() => import('./pages/Scout'))
const Agents = lazy(() => import('./pages/Agents'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const Skills = lazy(() => import('./pages/Skills'))
const AWS = lazy(() => import('./pages/AWS'))
const Setup = lazy(() => import('./pages/Setup'))
const Calendar = lazy(() => import('./pages/Calendar'))
const OllamaMonitor = lazy(() => import('./pages/OllamaMonitor'))
const Councils = lazy(() => import('./pages/Councils'))
const TeamStructure = lazy(() => import('./pages/TeamStructure'))
const DigitalOffice = lazy(() => import('./pages/DigitalOffice'))
const Memory = lazy(() => import('./pages/Memory'))
const GBrain = lazy(() => import('./pages/GBrain'))

type RouteComponent = LazyExoticComponent<ComponentType>

export interface AppRouteDefinition {
  path: string
  label: string
  module: string
  component: RouteComponent
  icon?: LucideIcon
  nav?: boolean
  section?: 'operate' | 'intelligence' | 'system' | 'audit'
  description?: string
}

export const appRoutes: AppRouteDefinition[] = [
  { path: '/setup', label: 'Setup', module: 'settings', component: Setup, nav: false },
  { path: '/', label: 'Operator Briefing', module: 'dashboard', component: Dashboard, icon: LayoutDashboard, section: 'operate', description: 'Current call' },
  { path: '/office', label: 'Digital Office', module: 'office', component: DigitalOffice, icon: Building2, section: 'operate', description: 'Live desks' },
  { path: '/cron', label: 'Cron Jobs', module: 'cron', component: Cron, icon: Clock, section: 'operate', description: 'Automations' },
  { path: '/conversations', label: 'Conversations', module: 'chat', component: Chat, icon: MessageCircle, section: 'operate', description: 'Sessions' },
  { path: '/workshop', label: 'Workshop', module: 'workshop', component: Workshop, icon: Hammer, section: 'operate', description: 'Tasks' },
  { path: '/kanban', label: 'Hermes Kanban', module: 'workshop', component: HermesKanban, icon: Kanban, section: 'operate', description: 'Hermes board' },
  { path: '/costs', label: 'Cost Tracker', module: 'costs', component: Costs, icon: DollarSign, section: 'intelligence', description: 'Spend and model mix' },
  { path: '/calendar', label: 'Calendar', module: 'calendar', component: Calendar, icon: CalendarDays, section: 'intelligence', description: 'Schedule' },
  { path: '/memory', label: 'Memory', module: 'docs', component: Memory, icon: Brain, section: 'intelligence', description: 'Knowledge state' },
  { path: '/gbrain', label: 'GBrain', module: 'docs', component: GBrain, icon: GitBranch, section: 'intelligence', description: 'Shared brain' },
  { path: '/scout', label: 'Scout', module: 'scout', component: Scout, icon: Radar, section: 'intelligence', description: 'External watch' },
  { path: '/ollama', label: 'Ollama Monitor', module: 'ollamaMonitor', component: OllamaMonitor, icon: Brain, section: 'system', description: 'Local models' },
  { path: '/team', label: 'Team Structure', module: 'team', component: TeamStructure, icon: Users2, section: 'system', description: 'Agent map' },
  { path: '/agents', label: 'Agent Hub', module: 'agents', component: Agents, icon: Bot, section: 'system', description: 'Runtime controls' },
  { path: '/settings', label: 'Settings', module: 'settings', component: SettingsPage, icon: Settings, section: 'system', description: 'Configuration' },
  { path: '/councils', label: 'Governance Archive', module: 'councils', component: Councils, icon: Landmark, section: 'audit', description: 'Decision audit' },
  { path: '/skills', label: 'Skills', module: 'skills', component: Skills, icon: Puzzle, nav: false },
  { path: '/aws', label: 'AWS', module: 'aws', component: AWS, icon: Cloud },
]

export const sidebarRoutes = appRoutes.filter((route) => route.nav !== false && route.icon)
