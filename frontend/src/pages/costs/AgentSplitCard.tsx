import { Loader2 } from 'lucide-react'
import GlassCard from '../../components/GlassCard'
import { formatCompactTokenValue, formatAgentCostValue, formatTokens } from './lib'
import type { AgentUsageData } from './types'

interface AgentSplitItem extends AgentUsageData {
  tokens: number
  cost: number
  costLabel: string
  topModel: string
}

interface AgentSplitCardProps {
  m: boolean
  agentSplit: AgentSplitItem[]
  agentSplitPending: boolean
  activePeriodLabel: string
  agentSplitPeriodLabel: string
  totalAgentTokens: number
  tokenDataRefreshing: boolean
}

export default function AgentSplitCard({
  m,
  agentSplit,
  agentSplitPending,
  activePeriodLabel,
  agentSplitPeriodLabel,
  totalAgentTokens,
  tokenDataRefreshing,
}: AgentSplitCardProps) {
  return (
    <GlassCard delay={0.12} noPad>
      <div style={{ padding: m ? '16px' : '22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: m ? 15 : 16, fontWeight: 700, color: 'rgba(255,255,255,0.94)', margin: 0 }}>
              Agent Split
            </h3>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.48)', marginTop: 4 }}>
              {agentSplitPending
                ? `Refreshing Agent Split for the selected ${activePeriodLabel.toLowerCase()} period…`
                : `Showing OpenClaw vs Hermes for the loaded ${agentSplitPeriodLabel.toLowerCase()} period.`}
            </div>
          </div>
          {!agentSplitPending && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {tokenDataRefreshing && <span className="macos-badge">Refreshing</span>}
              <span className="macos-badge macos-badge-blue">
                {formatCompactTokenValue(totalAgentTokens)} TOKENS
              </span>
            </div>
          )}
        </div>

        {agentSplitPending ? (
          <div
            style={{
              position: 'relative',
              overflow: 'hidden',
              padding: m ? '18px' : '22px',
              borderRadius: 20,
              border: '1px solid rgba(10,132,255,0.18)',
              background: 'radial-gradient(circle at 16% 18%, rgba(10,132,255,0.18), transparent 34%), radial-gradient(circle at 86% 8%, rgba(94,92,230,0.16), transparent 28%), rgba(255,255,255,0.035)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'rgba(10,132,255,0.14)', border: '1px solid rgba(10,132,255,0.22)' }}>
                  <Loader2 size={18} style={{ color: '#0A84FF', animation: 'spin 1s linear infinite' }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: 800 }}>
                    Loading {activePeriodLabel} split
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.52)', marginTop: 3 }}>
                    Fetching fresh OpenClaw vs Hermes usage — old {agentSplitPeriodLabel.toLowerCase()} values are hidden.
                  </div>
                </div>
              </div>
              <span className="macos-badge macos-badge-blue">Refreshing</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              {['OpenClaw', 'Hermes'].map((label, index) => (
                <div
                  key={label}
                  style={{
                    padding: m ? '14px' : '16px',
                    borderRadius: 18,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 13,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: index === 0 ? '#5E5CE6' : '#00C7BE', boxShadow: `0 0 18px ${index === 0 ? '#5E5CE6' : '#00C7BE'}` }} />
                      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', fontWeight: 800 }}>{label}</span>
                    </div>
                    <div style={{ width: 42, height: 10, borderRadius: 999, background: 'linear-gradient(90deg, rgba(255,255,255,0.12), rgba(255,255,255,0.22), rgba(255,255,255,0.12))', opacity: 0.72 }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[0, 1].map(item => (
                      <div key={item}>
                        <div style={{ width: item === 0 ? 36 : 48, height: 9, borderRadius: 999, background: 'rgba(255,255,255,0.10)', marginBottom: 9 }} />
                        <div style={{ width: item === 0 ? '72%' : '84%', height: 24, borderRadius: 10, background: 'linear-gradient(90deg, rgba(255,255,255,0.08), rgba(255,255,255,0.18), rgba(255,255,255,0.08))' }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    <div style={{ width: index === 0 ? '58%' : '42%', height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${index === 0 ? '#5E5CE6' : '#00C7BE'}, rgba(255,255,255,0.35))`, opacity: 0.58 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : `repeat(${agentSplit.length}, minmax(0, 1fr))`, gap: 12 }}>
            {agentSplit.map(agent => {
            const share = totalAgentTokens > 0 ? (agent.tokens / totalAgentTokens) * 100 : 0
            const accent = agent.accent || (agent.key === 'hermes' ? '#00C7BE' : '#5E5CE6')
            return (
              <div
                key={agent.key}
                style={{
                  padding: m ? '14px' : '18px',
                  borderRadius: 18,
                  border: `1px solid ${accent}55`,
                  background: `linear-gradient(145deg, ${accent}22 0%, rgba(255,255,255,0.035) 45%, rgba(255,255,255,0.02) 100%)`,
                  boxShadow: `0 14px 34px ${accent}18`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  minWidth: 0,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: accent, boxShadow: `0 0 18px ${accent}` }} />
                    <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: 800 }}>{agent.label}</span>
                  </div>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.58)', fontWeight: 700 }}>{share.toFixed(1)}%</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Cost</div>
                    <div style={{ fontSize: m ? 22 : 26, color: 'rgba(255,255,255,0.96)', fontWeight: 300, marginTop: 5 }}>
                      {formatAgentCostValue(agent.cost, agent.costLabel)}
                    </div>
                    <div style={{ fontSize: 10, color: agent.costLabel === 'Metered' ? 'rgba(255,255,255,0.42)' : '#FFCC00', fontWeight: 700, marginTop: 4 }}>
                      {agent.costLabel}
                    </div>
                  </div>
                  <div title={`${formatTokens(agent.tokens)} tokens`}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tokens</div>
                    <div style={{ fontSize: m ? 22 : 26, color: 'rgba(255,255,255,0.96)', fontWeight: 300, marginTop: 5, fontFeatureSettings: '"tnum"' }}>
                      {formatCompactTokenValue(agent.tokens)}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(share, agent.tokens > 0 ? 3 : 0)}%`, height: '100%', borderRadius: 999, background: accent }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.48)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={agent.topModel}>
                    Top model: {agent.topModel}
                  </div>
                </div>
              </div>
            )
          })}
          </div>
        )}
      </div>
    </GlassCard>
  )
}

// Re-export type for orchestrator
export type { AgentSplitItem }
