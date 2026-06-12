import { DollarSign } from 'lucide-react'
import GlassCard from '../../components/GlassCard'
import { formatCurrency, formatTokens, formatCompactTokenValue } from './lib'
import type { CodexBarCostData } from './types'

interface OverviewPill {
  label: string
  value: string
  accent: string
  title?: string
}

interface CostPulseHeaderProps {
  m: boolean
  period: 'day' | '7d' | 'month'
  setPeriod: (p: 'day' | '7d' | 'month') => void
  activePeriodLabel: string
  hasAwsData: boolean
  ledgerActive: boolean
  costSourceLabel: string
  overviewPills: OverviewPill[]
  codexbarActive: boolean
  codexbarCosts: CodexBarCostData | null
  codexbarPeriodTokens: number
  currentPeriodCost: number
  dailyAvg: number
  projectedMonthly: number
}

export default function CostPulseHeader({
  m,
  period,
  setPeriod,
  activePeriodLabel,
  hasAwsData,
  ledgerActive,
  costSourceLabel,
  overviewPills,
  codexbarActive,
  codexbarCosts,
  codexbarPeriodTokens,
  currentPeriodCost,
  dailyAvg,
  projectedMonthly,
}: CostPulseHeaderProps) {
  return (
    <GlassCard delay={0} noPad>
      <div
        style={{
          padding: m ? '18px' : '26px',
          display: 'grid',
          gridTemplateColumns: m ? '1fr' : 'minmax(0, 1.45fr) minmax(320px, 0.95fr)',
          gap: m ? '16px' : '24px',
          background: 'radial-gradient(circle at top left, rgba(50,215,75,0.12), transparent 34%), radial-gradient(circle at top right, rgba(94,92,230,0.16), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <h1 className="text-title" style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '0' }}>
                <DollarSign size={m ? 24 : 28} style={{ color: '#32D74B' }} />
                Cost Tracker
              </h1>
              <p className="text-body" style={{ margin: '8px 0 0 0', maxWidth: 620 }}>
                {activePeriodLabel} view with budget tracking, daily movement, and the biggest cost drivers.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: m ? 'flex-start' : 'flex-end', alignItems: 'center' }}>
              <span className="macos-badge macos-badge-blue">{activePeriodLabel}</span>
              <span className={`macos-badge ${hasAwsData ? 'macos-badge-green' : ledgerActive ? 'macos-badge-blue' : 'macos-badge-orange'}`}>
                {costSourceLabel}
              </span>
            </div>
          </div>

          <div style={{ display: 'inline-flex', gap: 6, padding: 4, borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', alignSelf: 'flex-start' }}>
            {([
              ['day', 'Daily'],
              ['7d', '7 Days'],
              ['month', 'Monthly'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                style={{
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: 9,
                  padding: '7px 12px',
                  background: period === key ? 'linear-gradient(180deg, rgba(10,132,255,0.32) 0%, rgba(10,132,255,0.18) 100%)' : 'transparent',
                  color: period === key ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.6)',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr 1fr' : `repeat(${overviewPills.length}, minmax(0, 1fr))`, gap: 10 }}>
            {overviewPills.map(pill => (
              <div
                key={pill.label}
                title={pill.title}
                style={{
                  padding: m ? '12px' : '14px',
                  borderRadius: 16,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 24px ${pill.accent}18`,
                  minHeight: m ? 72 : 76,
                  display: 'grid',
                  gridTemplateRows: '30px 1fr',
                  alignItems: 'start',
                }}
              >
                <div style={{ fontSize: 11, lineHeight: 1.2, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{pill.label}</div>
                <div style={{ alignSelf: 'end', fontSize: m ? 13 : 15, color: 'rgba(255,255,255,0.94)', fontWeight: 700, whiteSpace: 'nowrap', fontFeatureSettings: '"tnum"' }}>{pill.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {codexbarActive ? (
            <div
              style={{
                minHeight: 0,
                padding: m ? '14px' : '18px',
                borderRadius: 20,
                border: '1px solid rgba(255,149,0,0.28)',
                background: 'linear-gradient(155deg, rgba(255,149,0,0.2) 0%, rgba(27,33,54,0.82) 48%, rgba(43,28,13,0.78) 100%)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 18,
                boxShadow: '0 18px 40px rgba(255,149,0,0.16)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,214,153,0.85)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>CodexBar Cost Pulse</div>
                  <div style={{ fontSize: m ? 30 : 38, color: 'rgba(255,255,255,0.96)', fontWeight: 300, marginTop: 10 }}>
                    {formatCurrency(currentPeriodCost)}
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.62)', marginTop: 6 }}>
                    Current month tracked spend
                  </div>
                </div>
                <span className="macos-badge macos-badge-orange">
                  INVOICE DATA
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', minWidth: 0, minHeight: 70, display: 'grid', gridTemplateRows: '30px 1fr', alignItems: 'start' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Daily Pace</div>
                  <div style={{ alignSelf: 'end', fontSize: m ? 16 : 17, color: 'rgba(255,255,255,0.94)', fontWeight: 700, whiteSpace: 'nowrap' }}>{formatCurrency(dailyAvg)}</div>
                </div>
                <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', minWidth: 0, minHeight: 70, display: 'grid', gridTemplateRows: '30px 1fr', alignItems: 'start' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Projection</div>
                  <div style={{ alignSelf: 'end', fontSize: m ? 16 : 17, color: 'rgba(255,255,255,0.94)', fontWeight: 700, whiteSpace: 'nowrap' }}>{formatCurrency(projectedMonthly)}</div>
                </div>
                <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', minWidth: 0, minHeight: 70, display: 'grid', gridTemplateRows: '30px 1fr', alignItems: 'start' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Session Today</div>
                  <div style={{ alignSelf: 'end', fontSize: m ? 16 : 17, color: 'rgba(255,255,255,0.94)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {formatCurrency(codexbarCosts?.sessionCostUSD || 0)}
                  </div>
                </div>
                <div title={`${formatTokens(codexbarPeriodTokens)} tokens`} style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', minWidth: 0, minHeight: 70, display: 'grid', gridTemplateRows: '30px 1fr', alignItems: 'start' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Period Tokens</div>
                  <div style={{ alignSelf: 'end', fontSize: m ? 16 : 17, color: 'rgba(255,255,255,0.94)', fontWeight: 700, whiteSpace: 'nowrap', fontFeatureSettings: '"tnum"' }}>
                    {formatCompactTokenValue(codexbarPeriodTokens)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div
                style={{
                  minHeight: 0,
                  padding: m ? '14px' : '18px',
                  borderRadius: 20,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'linear-gradient(160deg, rgba(17,19,30,0.86) 0%, rgba(27,33,54,0.8) 58%, rgba(44,31,74,0.7) 100%)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 18,
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Current Pulse</div>
                  <div style={{ fontSize: m ? 28 : 36, color: 'rgba(255,255,255,0.96)', fontWeight: 300, marginTop: 10 }}>
                    {formatCurrency(currentPeriodCost)}
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.62)', marginTop: 6 }}>
                    {period === 'month' ? 'Current month tracked spend' : `${activePeriodLabel} spend in view`}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                  <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Daily Pace</div>
                    <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.94)', fontWeight: 700, marginTop: 8 }}>{formatCurrency(dailyAvg)}</div>
                  </div>
                  <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Projection</div>
                    <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.94)', fontWeight: 700, marginTop: 8 }}>{formatCurrency(projectedMonthly)}</div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  minHeight: 0,
                  padding: m ? '14px' : '18px',
                  borderRadius: 20,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                  opacity: 0.72,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      CodexBar Real Costs
                    </div>
                    <div style={{ fontSize: m ? 28 : 34, color: 'rgba(255,255,255,0.96)', fontWeight: 300, marginTop: 10 }}>
                      {formatCurrency(0)}
                    </div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.62)', marginTop: 6 }}>
                      {period === 'month' ? 'Current month invoice data' : `${activePeriodLabel} invoice data`}
                    </div>
                  </div>
                  <span className="macos-badge" style={{ opacity: 0.7 }}>
                    INVOICE DATA
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                  <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Session Today</div>
                    <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.94)', fontWeight: 700, marginTop: 8 }}>
                      {formatCurrency(codexbarCosts?.sessionCostUSD || 0)}
                    </div>
                  </div>
                  <div title="0 tokens" style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Period Tokens</div>
                    <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.94)', fontWeight: 700, marginTop: 8, fontFeatureSettings: '"tnum"' }}>
                      {formatCompactTokenValue(0)}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                  No CodexBar invoice data is active yet for this view.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </GlassCard>
  )
}
