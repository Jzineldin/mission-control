import { Cpu, Zap } from 'lucide-react'
import GlassCard from '../../components/GlassCard'
import { formatCurrency, formatTokens, formatSessionTimestamp } from './lib'
import type { AWSSCostData, AggregatedBreakdownItem, CodexBarCostData } from './types'

interface TopSession {
  sessionId: string
  sessionName: string
  model: string
  tokens: number
  cost: number
  timestamp: number
  color: string
  channel: string
}

interface CostSignal {
  title: string
  body: string
  accent: string
  icon: typeof Cpu
}

interface CodexBarLatest {
  date: string
  models: Array<{
    model: string
    cost: number
    totalTokens: number
  }>
}

export interface CostDriversSectionProps {
  m: boolean
  isAwsEnabled: boolean
  hasAwsData: boolean
  awsCosts: AWSSCostData | null
  codexbarActive: boolean
  codexbarCosts: CodexBarCostData | null
  codexbarLatest: CodexBarLatest | null
  driverView: 'models' | 'sessions' | 'codexbar' | 'notes'
  setDriverView: (v: 'models' | 'sessions' | 'codexbar' | 'notes') => void
  tokenBreakdown: AggregatedBreakdownItem[]
  topSessions: TopSession[]
  sessionPressureMax: number
  costSignals: CostSignal[]
  creditsUsed: number
  burnRate: number
  dailyAvg: number
  ledgerActive: boolean
  tokenDataSource?: string
}

export default function CostDriversSection({
  m,
  isAwsEnabled,
  hasAwsData,
  awsCosts,
  codexbarActive,
  codexbarCosts,
  codexbarLatest,
  driverView,
  setDriverView,
  tokenBreakdown,
  topSessions,
  sessionPressureMax,
  costSignals,
  creditsUsed,
  burnRate,
  dailyAvg,
  ledgerActive,
  tokenDataSource,
}: CostDriversSectionProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : (isAwsEnabled && hasAwsData ? '1.45fr 0.8fr' : '1fr'), gap: m ? '16px' : '24px' }}>
      <GlassCard delay={0.28} noPad>
        <div style={{ padding: m ? '16px' : '24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ fontSize: m ? '15px' : '16px', fontWeight: '600', color: 'rgba(255,255,255,0.92)', margin: 0 }}>
                Cost Drivers
              </h3>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
                One surface for model mix, session pressure, and methodology.
              </div>
            </div>

            <div style={{ display: 'inline-flex', gap: 6, padding: 4, borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {([
                ['models', 'By model'],
                ['sessions', 'By session'],
                ['codexbar', '🟠 CodexBar'],
                ['notes', 'Notes'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setDriverView(key)}
                  style={{
                    border: 'none',
                    cursor: 'pointer',
                    borderRadius: 9,
                    padding: '7px 12px',
                    background: driverView === key ? 'linear-gradient(180deg, rgba(94,92,230,0.34) 0%, rgba(94,92,230,0.18) 100%)' : 'transparent',
                    color: driverView === key ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.58)',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {driverView === 'models' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
              {tokenBreakdown.length > 0 ? tokenBreakdown.map((item, index) => (
                <div
                  key={item.name}
                  style={{
                    padding: m ? '14px' : '16px',
                    borderRadius: 18,
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    display: 'grid',
                    gridTemplateColumns: m ? '1fr' : 'minmax(0, 1.2fr) minmax(220px, 0.8fr)',
                    gap: 14,
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span className="macos-badge">#{index + 1}</span>
                        <span style={{ width: 10, height: 10, borderRadius: 999, background: item.color, flexShrink: 0 }} />
                        <span style={{ fontSize: m ? '13px' : '15px', color: 'rgba(255,255,255,0.92)', fontWeight: 700 }}>{item.name}</span>
                        {item.local ? <span className="macos-badge macos-badge-blue">Local</span> : null}
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{item.share.toFixed(1)}% share</div>
                    </div>

                    <div style={{ height: 10, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(item.share, 2)}%`, height: '100%', background: item.color, borderRadius: 999 }} />
                    </div>

                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                      {item.rawNames.length > 1 ? `${item.rawNames.length} model variants merged into one family.` : 'Single model family.'}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tokens</div>
                      <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.94)', fontWeight: 700, marginTop: 6 }}>{formatTokens(item.tokens)}</div>
                    </div>
                    <div style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Estimated Cost</div>
                      <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.94)', fontWeight: 700, marginTop: 6 }}>{item.local ? '$0.00' : formatCurrency(item.cost)}</div>
                    </div>
                  </div>
                </div>
              )) : (
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)' }}>No model breakdown data yet</div>
              )}
            </div>
          ) : driverView === 'sessions' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
              {topSessions.length > 0 ? topSessions.map((session, i) => (
                <div
                  key={session.sessionId}
                  style={{
                    padding: m ? '14px' : '16px',
                    borderRadius: 18,
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="macos-badge">#{i + 1}</span>
                      <span className="macos-badge macos-badge-blue">{session.channel}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>Updated {formatSessionTimestamp(session.timestamp)}</div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : 'minmax(0, 1.2fr) minmax(180px, 0.8fr)', gap: 12, alignItems: 'start' }}>
                    <div>
                      <div style={{ fontSize: m ? '14px' : '15px', color: 'rgba(255,255,255,0.94)', fontWeight: 700 }}>{session.sessionName}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>{session.model}</div>
                    </div>
                    <div style={{ textAlign: m ? 'left' : 'right' }}>
                      <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.95)', fontWeight: 700 }}>{formatCurrency(session.cost)}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{formatTokens(session.tokens)} tokens</div>
                    </div>
                  </div>

                  <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max((session.tokens / sessionPressureMax) * 100, 8)}%`, height: '100%', background: session.color, borderRadius: 999 }} />
                  </div>
                </div>
              )) : (
                <div style={{ padding: m ? '32px 16px' : '48px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.45)' }}>
                  <div style={{ fontSize: m ? '14px' : '16px', marginBottom: '8px' }}>No session load data yet</div>
                  <div style={{ fontSize: m ? '12px' : '14px' }}>Start using OpenClaw to see session pressure here</div>
                </div>
              )}
            </div>
          ) : driverView === 'codexbar' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
              {codexbarActive && codexbarCosts ? (
                <>
                  {/* Summary stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 10 }}>
                    {[
                      { label: 'Last 30 Days', value: formatCurrency(codexbarCosts.last30DaysCostUSD), sub: formatTokens(codexbarCosts.last30DaysTokens) + ' tokens', accent: '#FF9500' },
                      { label: 'Session Today', value: formatCurrency(codexbarCosts.sessionCostUSD), sub: formatTokens(codexbarCosts.sessionTokens) + ' tokens', accent: '#FF9500' },
                      { label: 'Input', value: formatTokens(codexbarCosts.totals.inputTokens), sub: 'total', accent: '#007AFF' },
                      { label: 'Output', value: formatTokens(codexbarCosts.totals.outputTokens), sub: 'total', accent: '#32D74B' },
                    ].map(stat => (
                      <div key={stat.label} style={{ padding: m ? '12px' : '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{stat.label}</div>
                        <div style={{ fontSize: m ? 16 : 18, color: stat.accent, fontWeight: 700, marginTop: 6 }}>{stat.value}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{stat.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Model breakdown from latest day */}
                  {codexbarLatest?.models && codexbarLatest.models.length > 0 && (
                    <>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: 600, marginBottom: -4 }}>
                        {codexbarLatest.date} — Latest Day Breakdown
                      </div>
                      {codexbarLatest.models.map((model, index) => {
                        const dayTotal = codexbarLatest.models.reduce((s, mo) => s + (mo.cost || 0), 0)
                        const share = dayTotal > 0 ? ((model.cost || 0) / dayTotal) * 100 : 0
                        return (
                          <div key={model.model} style={{ padding: m ? '14px' : '16px', borderRadius: 18, background: 'linear-gradient(180deg, rgba(255,149,0,0.06) 0%, rgba(255,149,0,0.02) 100%)', border: '1px solid rgba(255,149,0,0.15)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span className="macos-badge">#{index + 1}</span>
                                <span style={{ fontSize: m ? 13 : 15, color: 'rgba(255,255,255,0.92)', fontWeight: 700 }}>{model.model}</span>
                                <span className="macos-badge macos-badge-orange">INVOICE</span>
                              </div>
                              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{share.toFixed(1)}% share</div>
                            </div>
                            <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden', marginBottom: 12 }}>
                              <div style={{ width: Math.max(share, 3) + '%', height: '100%', background: '#FF9500', borderRadius: 999 }} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                              <div style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Cost</div>
                                <div style={{ fontSize: 14, color: '#FF9500', fontWeight: 700, marginTop: 6 }}>{formatCurrency(model.cost)}</div>
                              </div>
                              <div style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tokens</div>
                                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.94)', fontWeight: 700, marginTop: 6 }}>{formatTokens(model.totalTokens)}</div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </>
                  )}

                  {/* Daily history */}
                  {codexbarCosts.daily.length > 0 && (
                    <>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: 600, marginBottom: -4 }}>Daily History</div>
                      {codexbarCosts.daily.slice().reverse().map((day) => {
                        const dayTotal = day.totalCost || 0
                        const dayTokens = day.totalTokens || 0
                        const isLatest = day.date === codexbarLatest?.date
                        return (
                          <div key={day.date} style={{ padding: m ? '12px 14px' : '12px 16px', borderRadius: 14, background: isLatest ? 'rgba(255,149,0,0.06)' : 'rgba(255,255,255,0.03)', border: '1px solid ' + (isLatest ? 'rgba(255,149,0,0.18)' : 'rgba(255,255,255,0.07)' ) }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>{day.date}</span>
                                {isLatest && <span className="macos-badge macos-badge-orange">TODAY</span>}
                              </div>
                              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: '#FF9500', fontWeight: 700 }}>{formatCurrency(dayTotal)}</span>
                                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{formatTokens(dayTokens)} tok</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </>
                  )}

                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 4 }}>
                    Source: CodexBar · {codexbarCosts.updatedAt ? 'Updated ' + new Date(codexbarCosts.updatedAt).toLocaleString() : 'Loading...'}
                  </div>
                </>
              ) : (
                <div style={{ padding: '48px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.45)' }}>
                  <div style={{ fontSize: 14, marginBottom: 8 }}>CodexBar verisi yok</div>
                  <div style={{ fontSize: 12 }}>Mission Control + CodexBar entegrasyonu aktif değil</div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: 14 }}>
              {costSignals.map(signal => {
                const Icon = signal.icon
                return (
                  <div
                    key={signal.title}
                    style={{
                      padding: m ? '14px' : '16px',
                      borderRadius: 18,
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 12px 30px ${signal.accent}18`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.94)', fontWeight: 700 }}>
                      <Icon size={15} style={{ color: signal.accent }} />
                      {signal.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)', lineHeight: 1.6, marginTop: 10 }}>{signal.body}</div>
                  </div>
                )
              })}

              <div
                style={{
                  padding: m ? '14px' : '16px',
                  borderRadius: 18,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  gridColumn: m ? 'auto' : '1 / -1',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.9)', fontWeight: 700 }}>
                  <Zap size={15} style={{ color: '#FF9500' }} />
                  Methodology
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, marginTop: 10 }}>
                  {codexbarActive
                    ? 'This view is backed by CodexBar invoice data from OpenAI — the authoritative source.'
                    : hasAwsData
                    ? 'This view is backed by AWS billing data.'
                    : ledgerActive
                      ? tokenDataSource === 'openclaw.usage'
                        ? 'This view is backed by OpenClaw usage summaries extracted from session transcripts.'
                        : 'This view is backed by token ledger rows and estimated model pricing.'
                      : 'This view is currently using session token fallback, so spend is estimated from token volume rather than model-resolved ledger data.'}
                </div>
              </div>
            </div>
          )}
        </div>
      </GlassCard>

      {isAwsEnabled && hasAwsData && awsCosts && (
        <GlassCard delay={0.35} noPad>
          <div style={{ padding: m ? '16px' : '24px' }}>
            <div style={{ marginBottom: m ? '16px' : '24px' }}>
              <h3 style={{ fontSize: m ? '15px' : '16px', fontWeight: '600', color: 'rgba(255,255,255,0.92)', margin: 0 }}>Credits Runway</h3>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
                How long the remaining AWS credit balance can support current usage.
              </div>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: m ? '12px' : '14px', color: 'rgba(255,255,255,0.65)' }}>Used</span>
                <span style={{ fontSize: m ? '12px' : '14px', color: 'rgba(255,255,255,0.92)', fontFamily: 'system-ui', fontFeatureSettings: '"tnum"' }}>
                  {formatCurrency(creditsUsed)} / {formatCurrency(awsCosts.credits)}
                </span>
              </div>
              <div style={{ height: '12px', background: 'rgba(255,255,255,0.1)', borderRadius: '6px', overflow: 'hidden' }}>
                <div style={{ width: `${(creditsUsed / awsCosts.credits) * 100}%`, height: '100%', background: creditsUsed / awsCosts.credits > 0.75 ? '#FF453A' : creditsUsed / awsCosts.credits > 0.5 ? '#FF9500' : '#32D74B', borderRadius: '6px', transition: 'width 0.6s ease' }} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: m ? '12px' : '13px', color: 'rgba(255,255,255,0.45)' }}>At current rate, credits last:</span>
                <span style={{ fontSize: m ? '12px' : '13px', color: 'rgba(255,255,255,0.92)', fontWeight: '600' }}>{burnRate === Infinity ? '∞' : `${Math.round(burnRate)} days`}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: m ? '12px' : '13px', color: 'rgba(255,255,255,0.45)' }}>Daily burn rate:</span>
                <span style={{ fontSize: m ? '12px' : '13px', color: 'rgba(255,255,255,0.92)', fontWeight: '600' }}>{formatCurrency(dailyAvg)}/day</span>
              </div>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  )
}

