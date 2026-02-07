import { DollarSign, TrendingUp, TrendingDown, Target } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
  CartesianGrid
} from 'recharts'
import PageTransition from '../components/PageTransition'
import GlassCard from '../components/GlassCard'
import AnimatedCounter from '../components/AnimatedCounter'
import { useApi } from '../lib/hooks'

const COLORS = ['#818cf8', '#c084fc', '#34d399', '#fbbf24', '#f87171', '#60a5fa']

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'rgba(30,30,32,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px' }}>
      <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginBottom: 4 }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: 'rgba(255,255,255,0.92)', fontSize: 14, fontWeight: 600 }}>${p.value?.toFixed(2)}</p>
      ))}
    </div>
  )
}

export default function Costs() {
  const { data, loading } = useApi<any>('/api/costs', 60000)

  if (loading || !data) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </PageTransition>
    )
  }

  const { daily, summary, byService } = data
  const budgetPct = ((summary.thisMonth / summary.budget.monthly) * 100).toFixed(1)

  return (
    <PageTransition>
      <div style={{ maxWidth: "1280px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "28px" }}>
        {/* Header */}
        <div>
          <h1 style={{ color: 'rgba(255,255,255,0.92)' }} className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <DollarSign size={24} className="text-emerald-300/60" strokeWidth={1.5} />
            Cost Tracker
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.45)' }} className="text-sm mt-1">Monitor spending across all services</p>
        </div>

        {/* Key Metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "20px" }}>
          {[
            { label: 'Today', value: summary.today, icon: DollarSign, prefix: '$', gradient: 'from-emerald-400/25 to-emerald-600/15' },
            { label: 'This Week', value: summary.thisWeek, icon: TrendingUp, prefix: '$', gradient: 'from-blue-400/25 to-blue-600/15' },
            { label: 'This Month', value: summary.thisMonth, icon: TrendingDown, prefix: '$', gradient: 'from-purple-400/25 to-purple-600/15' },
            { label: 'Budget Used', value: parseFloat(budgetPct), icon: Target, suffix: '%', gradient: 'from-amber-400/25 to-amber-600/15' },
          ].map((m, i) => (
            <GlassCard key={m.label} delay={i * 0.05} noPad>
              <div style={{ padding: 20 }}>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${m.gradient} border border-white/15 flex items-center justify-center shadow-lg`}>
                      <m.icon size={18} className="text-white/80" strokeWidth={1.5} />
                    </div>
                    <span style={{ color: 'rgba(255,255,255,0.45)' }} className="text-[9px] font-bold uppercase tracking-[0.15em]">{m.label}</span>
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.92)' }} className="text-2xl font-light tracking-tight">
                    <AnimatedCounter end={m.value} decimals={2} prefix={m.prefix || ''} suffix={m.suffix || ''} />
                  </p>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "24px" }}>
          {/* Spend Chart */}
          <GlassCard delay={0.15} hover={false} noPad>
            <div style={{ padding: 24 }}>
              <h3 style={{ color: 'rgba(255,255,255,0.65)' }} className="text-sm font-semibold mb-5">Monthly Spend</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={daily}>
                    <defs>
                      <linearGradient id="costGradientLG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#c084fc" stopOpacity={0.9} />
                        <stop offset="15%" stopColor="#a78bfa" stopOpacity={0.7} />
                        <stop offset="35%" stopColor="#e879f9" stopOpacity={0.5} />
                        <stop offset="60%" stopColor="#f472b6" stopOpacity={0.3} />
                        <stop offset="85%" stopColor="#fbbf24" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="costStroke" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1} />
                        <stop offset="50%" stopColor="#ec4899" stopOpacity={1} />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={1} />
                      </linearGradient>
                      <filter id="glow">
                        <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
                        <feMerge>
                          <feMergeNode in="coloredBlur"/>
                          <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                      </filter>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }}
                      tickFormatter={(v) => v.slice(5)}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }}
                      tickFormatter={(v) => `$${v}`}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke="url(#costStroke)"
                      strokeWidth={3}
                      fill="url(#costGradientLG)"
                      filter="url(#glow)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </GlassCard>

          {/* Service Breakdown */}
          <GlassCard delay={0.2} hover={false} noPad>
            <div style={{ padding: 24 }}>
              <h3 style={{ color: 'rgba(255,255,255,0.65)' }} className="text-sm font-semibold mb-5">By Service</h3>
              <div className="h-48 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byService}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={72}
                      dataKey="cost"
                      nameKey="name"
                      strokeWidth={0}
                    >
                      {byService.map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={0.8} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {byService.map((s: any, i: number) => (
                  <div key={s.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5" style={{ overflow: 'hidden' }}>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                      <span style={{ color: 'rgba(255,255,255,0.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    </div>
                    <span style={{ color: 'rgba(255,255,255,0.92)' }} className="font-semibold">${s.cost.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Budget Progress */}
        <GlassCard delay={0.25} hover={false} noPad>
          <div style={{ padding: 24 }}>
            <div className="flex items-center justify-between mb-3">
              <h3 style={{ color: 'rgba(255,255,255,0.65)' }} className="text-sm font-semibold">Budget Utilization</h3>
              <span style={{ color: 'rgba(255,255,255,0.45)' }} className="text-xs font-medium">
                ${summary.thisMonth.toFixed(2)} / ${summary.budget.monthly}
              </span>
            </div>
            <div className="macos-progress h-3.5">
              <div
                className={`macos-progress-fill h-full ${
                  parseFloat(budgetPct) > 75
                    ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-red-500'
                    : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500'
                }`}
                style={{ width: `${Math.min(parseFloat(budgetPct), 100)}%` }}
              />
            </div>
            {summary.thisMonth >= summary.budget.warning && (
              <p className="text-xs text-amber-300 mt-2.5 font-medium">⚠️ Approaching budget warning threshold</p>
            )}
          </div>
        </GlassCard>

        {/* Daily Cost Bars */}
        <GlassCard delay={0.3} hover={false} noPad>
          <div style={{ padding: 24 }}>
            <h3 style={{ color: 'rgba(255,255,255,0.65)' }} className="text-sm font-semibold mb-5">Daily Breakdown</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily.slice(-14)}>
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1} />
                      <stop offset="30%" stopColor="#a78bfa" stopOpacity={0.9} />
                      <stop offset="60%" stopColor="#6366f1" stopOpacity={0.7} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.5} />
                    </linearGradient>
                    <filter id="barGlow">
                      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                      <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }}
                    tickFormatter={(v) => v.slice(8)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }}
                    tickFormatter={(v) => `$${v}`}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="total" fill="url(#barGradient)" radius={[12, 12, 0, 0]} filter="url(#barGlow)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </GlassCard>
      </div>
    </PageTransition>
  )
}
