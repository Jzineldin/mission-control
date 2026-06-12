import type { CSSProperties } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import GlassCard from '../../components/GlassCard'
import {
  formatCurrency,
  formatTokens,
  formatPreciseCurrency,
  estimateCost,
  canonicalModelName,
  isLocalModel,
} from './lib'
import type { ChartDataRow, ChartSeriesItem, AWSSCostData } from './types'

// Internal tooltip — shared between this file and MobileDailySpendChart which lives in Costs.tsx
// We re-declare it here locally because we can't import it from Costs.tsx (would create circular dep).
interface TooltipPayloadItem {
  value?: string | number
  name?: string
  dataKey?: string | number
  color?: string
  payload?: Record<string, string | number | undefined>
}

function CustomChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const rows = payload
    .filter((entry) => Number(entry.value || 0) > 0)
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
  if (!rows.length) return null
  const data = payload[0]?.payload || {}
  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 12,
        background: 'rgba(22,22,24,0.96)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
        minWidth: 220,
      }}
    >
      <div style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 10 }}>
        Total: {formatCurrency(Number(data.total || 0))} · Tokens: {formatTokens(Number(data.totalTokens || 0))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {rows.map((entry) => {
          const dataKey = String(entry.dataKey || '')
          const model = String(entry.name || dataKey)
          const tokenKey = `${dataKey}__tokens`
          const tokens = Number(data[tokenKey] || 0)
          const local = isLocalModel(model)
          return (
            <div key={dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: entry.color || '#8E8E93', flexShrink: 0 }} />
                <span style={{ color: 'rgba(255,255,255,0.78)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {canonicalModelName(model)}
                </span>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.96)', fontSize: 11, fontWeight: 600, textAlign: 'right' }}>
                {local ? `${formatTokens(tokens)} tok` : `${formatCurrency(Number(entry.value || 0))} · ${formatTokens(tokens)} tok`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface SessionEstimateDay {
  day: string
  fullDate: string
  estimatedCost: number
  tokens: number
  intensity: number
}

interface SessionEstimateChartLocal {
  data: SessionEstimateDay[]
  activeDate: string | null
  onSelect: (date: string) => void
}

function SessionEstimateChartLocal({ data, activeDate, onSelect }: SessionEstimateChartLocal) {
  const activeDay = data.find(day => day.fullDate === activeDate) || data[data.length - 1] || null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))`,
          gap: 10,
          alignItems: 'end',
          minHeight: 248,
        }}
      >
        {data.map(day => {
          const isActive = day.fullDate === activeDay?.fullDate
          const height = Math.max(day.intensity * 168, day.tokens > 0 ? 18 : 12)
          return (
            <button
              key={day.fullDate}
              type="button"
              onClick={() => onSelect(day.fullDate)}
              aria-pressed={isActive}
              style={{
                border: isActive ? '1px solid rgba(94,92,230,0.55)' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: 18,
                background: isActive
                  ? 'linear-gradient(180deg, rgba(94,92,230,0.22) 0%, rgba(20,24,38,0.86) 100%)'
                  : 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(12,14,22,0.7) 100%)',
                padding: '12px 6px 10px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: 10,
                boxShadow: isActive ? '0 18px 44px rgba(94,92,230,0.24)' : 'none',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.92)', fontWeight: 700 }}>
                {day.estimatedCost > 0 ? formatCurrency(day.estimatedCost) : 'idle'}
              </div>
              <div
                style={{
                  width: '100%',
                  maxWidth: 30,
                  height,
                  minHeight: 12,
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.05)',
                  display: 'flex',
                  alignItems: 'flex-end',
                  overflow: 'hidden',
                  padding: 3,
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: 999,
                    background: day.tokens > 0
                      ? 'linear-gradient(180deg, rgba(94,92,230,0.95) 0%, rgba(191,90,242,0.92) 52%, rgba(255,149,0,0.92) 100%)'
                      : 'rgba(255,255,255,0.12)',
                    opacity: day.tokens > 0 ? 1 : 0.4,
                  }}
                />
              </div>
              <span style={{ fontSize: 10, color: isActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)', fontWeight: isActive ? 700 : 500 }}>
                {day.day}
              </span>
            </button>
          )
        })}
      </div>
      {activeDay && (
        <div
          style={{
            padding: 16,
            borderRadius: 16,
            background: 'linear-gradient(135deg, rgba(94,92,230,0.14) 0%, rgba(255,149,0,0.08) 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Date</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.92)', fontWeight: 700, marginTop: 6 }}>{activeDay.fullDate}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Estimated Spend</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.92)', fontWeight: 700, marginTop: 6 }}>{formatCurrency(activeDay.estimatedCost)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tokens</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.92)', fontWeight: 700, marginTop: 6 }}>{formatTokens(activeDay.tokens)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function buildDaySegments(day: ChartDataRow, chartSeries: ChartSeriesItem[]) {
  return chartSeries
    .map(series => ({
      key: series.key,
      label: series.model,
      value: Number(day[series.key] || 0),
      tokens: Number(day[`${series.key}__tokens`] || 0),
      color: series.color,
      local: isLocalModel(series.model),
    }))
    .filter(segment => segment.value > 0 || segment.tokens > 0)
}

function MobileDailySpendChartLocal({
  chartData,
  chartSeries,
  activeDate,
  onSelect,
}: {
  chartData: ChartDataRow[]
  chartSeries: ChartSeriesItem[]
  activeDate: string | null
  onSelect: (date: string) => void
}) {
  const maxTotal = Math.max(...chartData.map(day => Number(day.total || 0)), 1)
  const activeDay = chartData.find(day => day.fullDate === activeDate) || chartData[chartData.length - 1] || null
  const activeSegments = activeDay ? buildDaySegments(activeDay, chartSeries) : []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
        Mobile uses a touch-first stacked view to avoid Safari/Recharts blank bars.
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${chartData.length}, minmax(0, 1fr))`,
          gap: 8,
          alignItems: 'end',
          height: 244,
          padding: '12px 0 4px',
        }}
      >
        {chartData.map(day => {
          const total = Number(day.total || 0)
          const segments = buildDaySegments(day, chartSeries)
          const isActive = day.fullDate === activeDay?.fullDate
          const columnHeight = total > 0 ? Math.max((total / maxTotal) * 168, 18) : 14
          return (
            <button
              key={day.fullDate}
              type="button"
              onClick={() => onSelect(day.fullDate)}
              aria-pressed={isActive}
              aria-label={`Select ${day.fullDate} daily spend`}
              style={{
                border: isActive ? '1px solid rgba(10,132,255,0.5)' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: 14,
                background: isActive ? 'rgba(10,132,255,0.14)' : 'rgba(255,255,255,0.03)',
                padding: '10px 4px 8px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: 8,
                minHeight: 0,
                WebkitTapHighlightColor: 'transparent',
                boxShadow: isActive ? '0 10px 28px rgba(10,132,255,0.18)' : 'none',
              }}
            >
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.92)', fontWeight: 700 }}>
                {formatCurrency(total)}
              </span>
              <div
                style={{
                  width: '100%',
                  maxWidth: 30,
                  height: columnHeight,
                  minHeight: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  borderRadius: 10,
                  overflow: 'hidden',
                  background: 'rgba(255,255,255,0.05)',
                }}
              >
                {segments.length > 0 ? (
                  segments.map(segment => {
                    const style: CSSProperties = {
                      height: `${Math.max((segment.value / total) * 100, 14)}%`,
                      background: segment.color,
                      minHeight: 8,
                    }
                    return <div key={segment.key} style={style} />
                  })
                ) : (
                  <div style={{ height: '100%', background: 'rgba(255,255,255,0.08)' }} />
                )}
              </div>
              <span style={{ fontSize: 10, color: isActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)', fontWeight: isActive ? 700 : 500 }}>
                {String(day.day)}
              </span>
            </button>
          )
        })}
      </div>
      {activeDay && (
        <div
          style={{
            padding: '14px',
            borderRadius: 14,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: 700 }}>{activeDay.fullDate}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>Tap another bar to inspect that day.</div>
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.95)', fontWeight: 700 }}>{formatCurrency(Number(activeDay.total || 0))}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeSegments.map(segment => (
              <div key={segment.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: segment.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.76)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {segment.label}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.95)', fontWeight: 600, textAlign: 'right' }}>
                  {segment.local ? `${formatCurrency(0)} · ${formatTokens(segment.tokens)} tokens` : formatCurrency(segment.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {chartSeries.map(series => (
          <div
            key={series.key}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 999, background: series.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)' }}>{series.model}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

interface BlendedCostItem {
  name: string
  amount: number
  share: number
  color: string
  secondary: string
  local?: boolean
}

export interface DailySpendSectionProps {
  m: boolean
  chartData: ChartDataRow[]
  chartSeries: ChartSeriesItem[]
  hasChartBars: boolean
  useMobileDailyChart: boolean
  activeChartDate: string | null
  setActiveChartDate: (d: string) => void
  chartDayCount: number
  codexbarActive: boolean
  ledgerActive: boolean
  hasAwsData: boolean
  activePeriodLabel: string
  awsCosts: AWSSCostData | null
  hasSessionEstimateChart: boolean
  sessionEstimateData: SessionEstimateDay[]
  projectedMonthly: number
  totalTokens: number
  tokenBasedCost: number
  blendedCostBreakdown: BlendedCostItem[]
}

export default function DailySpendSection({
  m,
  chartData,
  chartSeries,
  hasChartBars,
  useMobileDailyChart,
  activeChartDate,
  setActiveChartDate,
  chartDayCount,
  codexbarActive,
  ledgerActive,
  hasAwsData,
  activePeriodLabel,
  awsCosts,
  hasSessionEstimateChart,
  sessionEstimateData,
  projectedMonthly,
  totalTokens,
  tokenBasedCost,
  blendedCostBreakdown,
}: DailySpendSectionProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '2fr 1fr', gap: m ? '16px' : '24px' }}>
      <GlassCard delay={0.2} noPad>
        <div style={{ padding: m ? '16px' : '24px' }}>
          <div style={{ marginBottom: m ? '16px' : '24px' }}>
            <h3 style={{ fontSize: m ? '15px' : '16px', fontWeight: '600', color: 'rgba(255,255,255,0.92)', margin: 0 }}>
              Daily Spend
            </h3>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
              {chartDayCount > 0
                ? codexbarActive
                  ? `${chartDayCount}-day CodexBar invoice spend; bars reconcile with the ${activePeriodLabel.toLowerCase()} cards.`
                  : hasSessionEstimateChart && !ledgerActive && !hasAwsData
                    ? `${chartDayCount}-day activity view estimated from session token flow.`
                    : `${chartDayCount}-day usage-ledger spend movement; unknown/included costs are excluded from billable bars.`
                : 'Waiting for daily spend history.'}
            </div>
          </div>

          {chartData.length > 0 ? (
            useMobileDailyChart ? (
              <MobileDailySpendChartLocal
                chartData={chartData}
                chartSeries={chartSeries}
                activeDate={activeChartDate}
                onSelect={setActiveChartDate}
              />
            ) : hasChartBars ? (
              <div style={{ height: m ? 300 : 360, minHeight: m ? 300 : 360, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={m ? 300 : 360}>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: m ? -24 : -8, bottom: m ? 28 : 12 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="fullDate" tickFormatter={val => { const d = new Date(val); return `${d.getMonth()+1}/${d.getDate()}` }} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: m ? 10 : 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={value => formatPreciseCurrency(Number(value || 0))} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: m ? 10 : 11 }} axisLine={false} tickLine={false} width={m ? 52 : 70} />
                    <Tooltip content={<CustomChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    <Legend
                      verticalAlign="bottom"
                      align="center"
                      formatter={value => <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>{canonicalModelName(value)}</span>}
                      iconType="circle"
                      wrapperStyle={{ paddingTop: 12, fontSize: 11 }}
                    />
                    {chartSeries.map(series => (
                      <Bar
                        key={series.key}
                        dataKey={series.key}
                        name={series.model}
                        stackId="daily"
                        fill={series.color}
                        radius={[4, 4, 0, 0]}
                        minPointSize={3}
                        stroke="rgba(255,255,255,0.18)"
                        strokeWidth={0.6}
                      >
                        {chartData.map((_, index) => (
                          <Cell key={`${series.key}-${index}`} fill={series.color} />
                        ))}
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>
                  Recharts received data but visible bar height resolved to zero. Showing guaranteed CSS fallback.
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: m ? 4 : 6, height: m ? 220 : 260, paddingTop: 12 }}>
                  {(() => {
                    const maxTotal = Math.max(...chartData.map(day => Number(day.total || 0)), 1)
                    return chartData.map(day => {
                      const total = Number(day.total || 0)
                      const segments = chartSeries
                        .map(series => ({
                          key: series.key,
                          label: series.model,
                          value: Number(day[series.key] || 0),
                          color: series.color,
                        }))
                        .filter(segment => segment.value > 0)
                      const columnHeight = total > 0 ? Math.max((total / maxTotal) * (m ? 180 : 220), 8) : 0
                      return (
                        <div key={String(day.fullDate)} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                          <div style={{ width: '100%', maxWidth: 28, height: columnHeight, minHeight: total > 0 ? 8 : 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', borderRadius: 8, overflow: 'hidden', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            {segments.map(segment => {
                              const style: CSSProperties = {
                                height: `${Math.max((segment.value / total) * 100, 14)}%`,
                                background: segment.color,
                                minHeight: 6,
                              }
                              return <div key={segment.key} style={style} title={`${segment.label}: ${formatCurrency(segment.value)}`} />
                            })}
                          </div>
                          <span style={{ fontSize: m ? 9 : 10, color: 'rgba(255,255,255,0.45)' }}>{String(day.day)}</span>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>
            )
          ) : hasSessionEstimateChart ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: m ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                  gap: 10,
                }}
              >
                <div style={{ padding: '14px 16px', borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Fallback Mode</div>
                  <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.92)', fontWeight: 700, marginTop: 8 }}>Session activity estimate</div>
                </div>
                <div style={{ padding: '14px 16px', borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Monthly Estimate</div>
                  <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.92)', fontWeight: 700, marginTop: 8 }}>{formatCurrency(projectedMonthly)}</div>
                </div>
                <div style={{ padding: '14px 16px', borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Observed Tokens</div>
                  <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.92)', fontWeight: 700, marginTop: 8 }}>{formatTokens(totalTokens)}</div>
                </div>
              </div>
              <SessionEstimateChartLocal
                data={sessionEstimateData}
                activeDate={activeChartDate}
                onSelect={setActiveChartDate}
              />
            </div>
          ) : hasAwsData && awsCosts ? (
            <div style={{ height: m ? '180px' : '240px', display: 'flex', alignItems: 'flex-end', gap: m ? '2px' : '4px', paddingTop: '20px' }}>
              {awsCosts.daily.map(day => {
                const maxCost = Math.max(...awsCosts.daily.map(d => d.cost), 10)
                const height = Math.max((day.cost / maxCost) * (m ? 140 : 200), 2)
                return (
                  <div key={day.date} style={{ flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '100%', height: `${height}px`, background: '#007AFF', borderRadius: '4px 4px 0 0', opacity: '0.8', transition: 'all 0.3s ease' }} title={`${day.date}: ${formatCurrency(day.cost)}`} />
                    <span style={{ fontSize: m ? '7px' : '10px', color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 1.1 }}>
                      {new Date(day.date).toLocaleDateString('en-US', { day: 'numeric' })}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ height: m ? '180px' : '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.65)' }}>Using token-based cost estimation</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', textAlign: 'center' }}>
                Daily model history is not available yet.<br />
                Estimated {formatCurrency(tokenBasedCost)} this month from {formatTokens(totalTokens)} tokens.
              </div>
            </div>
          )}
        </div>
      </GlassCard>

      <GlassCard delay={0.25} noPad>
        <div style={{ padding: m ? '16px' : '24px' }}>
          <div style={{ marginBottom: m ? '16px' : '24px' }}>
            <h3 style={{ fontSize: m ? '15px' : '16px', fontWeight: '600', color: 'rgba(255,255,255,0.92)', margin: 0 }}>
              Spend Composition
            </h3>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
              {codexbarActive ? 'Ranked from the latest CodexBar invoice snapshot.' : 'Ranked view of the biggest drivers in the current view.'}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: m ? '12px' : '16px' }}>
            {blendedCostBreakdown.length > 0 ? (
              blendedCostBreakdown.slice(0, m ? 5 : 7).map(item => (
                <div key={item.name} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: item.color, flexShrink: 0 }} />
                      <span style={{ fontSize: m ? '12px' : '14px', color: 'rgba(255,255,255,0.75)', fontWeight: '600' }}>
                        {item.name}
                      </span>
                      {item.local ? <span className="macos-badge macos-badge-blue">Local</span> : null}
                    </div>
                    <span style={{ fontSize: m ? '12px' : '13px', color: 'rgba(255,255,255,0.92)', fontWeight: 700 }}>
                      {item.secondary}
                    </span>
                  </div>
                  <div style={{ height: '7px', background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(item.share, 2)}%`, height: '100%', background: item.color, borderRadius: 999, transition: 'width 0.6s ease' }} />
                  </div>
                  <div style={{ fontSize: 11, color: codexbarActive ? 'rgba(255,149,0,0.8)' : 'rgba(255,255,255,0.4)' }}>{item.share.toFixed(1)}% of current mix</div>
                </div>
              ))
            ) : totalTokens > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: m ? '12px' : '14px', color: 'rgba(255,255,255,0.65)', fontWeight: '500' }}>OpenClaw Sessions</span>
                  <span style={{ fontSize: m ? '12px' : '14px', color: 'rgba(255,255,255,0.92)', fontWeight: '600', fontFamily: 'system-ui', fontFeatureSettings: '"tnum"' }}>
                    {formatCurrency(estimateCost(totalTokens, 'sonnet'))}
                  </span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: '100%', background: '#BF5AF2', borderRadius: '3px', transition: 'width 0.6s ease' }} />
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)' }}>No usage data yet</div>
            )}
          </div>
        </div>
      </GlassCard>
    </div>
  )
}

export type { SessionEstimateDay, BlendedCostItem }
