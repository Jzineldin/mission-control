import { Calendar, DollarSign, Target, TrendingDown, TrendingUp } from 'lucide-react'
import GlassCard from '../../components/GlassCard'
import AnimatedCounter from '../../components/AnimatedCounter'
import { formatCurrency, formatComparisonValue, calculateTrend } from './lib'
import type { AWSSCostData } from './types'

function TrendBadge({ trend }: { trend: ReturnType<typeof calculateTrend> }) {
  if (!trend) return null
  const positiveIsBad = trend.direction === 'up'
  const Icon = trend.direction === 'up' ? TrendingUp : TrendingDown
  const color = positiveIsBad ? '#FF453A' : '#32D74B'
  const bg = positiveIsBad ? 'rgba(255,69,58,0.14)' : 'rgba(50,215,75,0.14)'
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        borderRadius: 999,
        background: bg,
        color,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      <Icon size={12} />
      {trend.label || `${trend.percentage!.toFixed(trend.percentage! >= 100 ? 0 : 1)}%`}
    </div>
  )
}

interface MetricCardsProps {
  m: boolean
  isAwsEnabled: boolean
  hasAwsData: boolean
  awsCosts: AWSSCostData | null
  currentPeriodCost: number
  dailyAvg: number
  projectedMonthly: number
  previousPeriodCost: number | null
  previousDailyAvg: number | null
  monthlyTrend: ReturnType<typeof calculateTrend>
  dailyTrend: ReturnType<typeof calculateTrend>
  compareLabel: { period: string; daily: string }
  period: 'day' | '7d' | 'month'
  labels: { thisMonth: string; creditsLeft: string; dailyAvg: string; projected: string }
  activePeriodLabel: string
}

export default function MetricCards({
  m,
  isAwsEnabled,
  hasAwsData,
  awsCosts,
  currentPeriodCost,
  dailyAvg,
  projectedMonthly,
  previousPeriodCost,
  previousDailyAvg,
  monthlyTrend,
  dailyTrend,
  compareLabel,
  period,
  labels,
  activePeriodLabel,
}: MetricCardsProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isAwsEnabled && hasAwsData ? (m ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)') : (m ? '1fr' : 'repeat(3, 1fr)'),
        gap: m ? '12px' : '20px',
      }}
    >
      <GlassCard delay={0} noPad>
        <div style={{ padding: m ? '16px' : '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div
              style={{
                width: m ? '40px' : '48px',
                height: m ? '40px' : '48px',
                borderRadius: '12px',
                background: currentPeriodCost > 100 ? 'rgba(255,149,0,0.15)' : 'rgba(50,215,75,0.15)',
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <DollarSign size={m ? 16 : 20} style={{ color: currentPeriodCost > 100 ? '#FF9500' : '#32D74B' }} />
            </div>
            <span style={{ fontSize: m ? '10px' : '11px', fontWeight: '700', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {period === 'month' ? labels.thisMonth : activePeriodLabel}
            </span>
          </div>
          <p style={{ fontSize: m ? '24px' : '32px', fontWeight: '300', color: 'rgba(255,255,255,0.92)', fontFamily: 'system-ui', fontFeatureSettings: '"tnum"', margin: '0' }}>
            <AnimatedCounter end={currentPeriodCost} formatter={formatCurrency} />
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: '10px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>
              {compareLabel.period} {formatComparisonValue(previousPeriodCost)}
            </div>
            <TrendBadge trend={monthlyTrend} />
          </div>
        </div>
      </GlassCard>

      {isAwsEnabled && hasAwsData && awsCosts && (
        <GlassCard delay={0.05} noPad>
          <div style={{ padding: m ? '16px' : '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ width: m ? '40px' : '48px', height: m ? '40px' : '48px', borderRadius: '12px', background: 'rgba(50,215,75,0.15)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Target size={m ? 16 : 20} style={{ color: '#32D74B' }} />
              </div>
              <span style={{ fontSize: m ? '10px' : '11px', fontWeight: '700', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {labels.creditsLeft}
              </span>
            </div>
            <p style={{ fontSize: m ? '24px' : '32px', fontWeight: '300', color: 'rgba(255,255,255,0.92)', fontFamily: 'system-ui', fontFeatureSettings: '"tnum"', margin: '0' }}>
              <AnimatedCounter end={awsCosts.remaining} formatter={formatCurrency} />
            </p>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginTop: '8px' }}>
              Remaining AWS credit balance
            </div>
          </div>
        </GlassCard>
      )}

      <GlassCard delay={0.1} noPad>
        <div style={{ padding: m ? '16px' : '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ width: m ? '40px' : '48px', height: m ? '40px' : '48px', borderRadius: '12px', background: 'rgba(0,122,255,0.15)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={m ? 16 : 20} style={{ color: '#007AFF' }} />
            </div>
            <span style={{ fontSize: m ? '10px' : '11px', fontWeight: '700', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {labels.dailyAvg}
            </span>
          </div>
          <p style={{ fontSize: m ? '24px' : '32px', fontWeight: '300', color: 'rgba(255,255,255,0.92)', fontFamily: 'system-ui', fontFeatureSettings: '"tnum"', margin: '0' }}>
            <AnimatedCounter end={dailyAvg} formatter={formatCurrency} />
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: '10px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>
              {compareLabel.daily} {formatComparisonValue(previousDailyAvg)}
            </div>
            <TrendBadge trend={dailyTrend} />
          </div>
        </div>
      </GlassCard>

      <GlassCard delay={0.15} noPad>
        <div style={{ padding: m ? '16px' : '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ width: m ? '40px' : '48px', height: m ? '40px' : '48px', borderRadius: '12px', background: 'rgba(255,149,0,0.15)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={m ? 16 : 20} style={{ color: '#FF9500' }} />
            </div>
            <span style={{ fontSize: m ? '10px' : '11px', fontWeight: '700', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {labels.projected}
            </span>
          </div>
          <p style={{ fontSize: m ? '24px' : '32px', fontWeight: '300', color: 'rgba(255,255,255,0.92)', fontFamily: 'system-ui', fontFeatureSettings: '"tnum"', margin: '0' }}>
            <AnimatedCounter end={projectedMonthly} formatter={formatCurrency} />
          </p>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginTop: '8px' }}>
            Projected if the current pace holds
          </div>
        </div>
      </GlassCard>
    </div>
  )
}
