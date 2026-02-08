import { useState, useEffect } from 'react'
import { DollarSign, TrendingUp, TrendingDown, Target, Calendar, Zap, Settings, AlertCircle } from 'lucide-react'
import PageTransition from '../components/PageTransition'
import GlassCard from '../components/GlassCard'
import AnimatedCounter from '../components/AnimatedCounter'
import { useIsMobile } from '../lib/useIsMobile'

interface AWSSCostData {
  period: { start: string; end: string }
  total: number
  daily: Array<{ date: string; cost: number }>
  services: Array<{ name: string; cost: number }>
  credits: number
  remaining: number
}

interface TokenData {
  daily: Array<{ date: string; total: number }>
  summary: any
  byService: Array<{ name: string; cost: number }>
  sessions: Array<{ sessionId: string; cost: number; model: string; tokens: number; timestamp: number }>
  budget?: { monthly: number }
}

interface SessionData {
  key: string
  model: string
  totalTokens: number
  updatedAt: string | null
  displayName?: string
  usage?: {
    input?: number
    output?: number
    cacheRead?: number
    cacheWrite?: number
  }
}

interface ConfigData {
  modules: {
    aws?: boolean
    [key: string]: any
  }
}

// Estimate cost from tokens based on model with precise Bedrock pricing
function estimateCost(tokens: number, model?: string, usage?: any) {
  // Real Bedrock pricing (per 1M tokens)
  const rates = {
    'opus-input': 15.00,     // $15/M input 
    'opus-output': 75.00,    // $75/M output
    'opus-cache-read': 1.50,  // $1.50/M cache read
    'opus-cache-write': 18.75, // $18.75/M cache write (25% of output)
    'sonnet-input': 3.00,
    'sonnet-output': 15.00, 
    'sonnet-cache-read': 0.30,
    'sonnet-cache-write': 3.75,
    'haiku-input': 0.25,
    'haiku-output': 1.25,
    'haiku-cache-read': 0.03,
    'haiku-cache-write': 0.31,
  };
  
  const modelType = (model || '').toLowerCase().includes('opus') ? 'opus' 
    : (model || '').toLowerCase().includes('sonnet') ? 'sonnet' 
    : 'haiku';
  
  // If we have usage breakdown, use precise calculation
  if (usage) {
    const input = (usage.input || 0) / 1000000 * rates[`${modelType}-input`];
    const output = (usage.output || 0) / 1000000 * rates[`${modelType}-output`];
    const cacheRead = (usage.cacheRead || 0) / 1000000 * rates[`${modelType}-cache-read`];
    const cacheWrite = (usage.cacheWrite || 0) / 1000000 * rates[`${modelType}-cache-write`];
    return input + output + cacheRead + cacheWrite;
  }
  
  // Fallback: assume 50/50 input/output split (no cache)
  const input = tokens * 0.5 / 1000000 * rates[`${modelType}-input`];
  const output = tokens * 0.5 / 1000000 * rates[`${modelType}-output`];
  return input + output;
}

// Format session name for better display
function formatSessionName(key: string, displayName?: string): string {
  if (key.includes('#')) {
    const channelName = key.split('#')[1];
    return `#${channelName}`;
  }
  if (key === 'agent:main:main') return 'Main Session';
  if (key.includes(':subagent:')) return 'Sub-Agent';
  if (displayName) return displayName;
  return key.split(':').pop()?.substring(0, 12) || 'Unknown';
}

export default function Costs() {
  const m = useIsMobile()

  // Shorter labels on mobile
  const labels = {
    thisMonth: m ? 'Month' : 'This Month',
    creditsLeft: m ? 'Credits' : 'Credits Left',
    dailyAvg: m ? 'Daily Avg' : 'Daily Average',
    projected: m ? 'Projected' : 'Projected Monthly',
  }
  const [awsCosts, setAwsCosts] = useState<AWSSCostData | null>(null)
  const [tokenData, setTokenData] = useState<TokenData | null>(null)
  const [config, setConfig] = useState<ConfigData | null>(null)
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [budget, setBudget] = useState<number>(0)
  const [budgetInput, setBudgetInput] = useState<string>('')
  const [savingBudget, setSavingBudget] = useState(false)

  useEffect(() => {
    const fetchData = () => {
      Promise.all([
        fetch('/api/aws/costs').then(r => r.json()).catch(() => null),
        fetch('/api/costs').then(r => r.json()).catch(() => null),
        fetch('/api/config').then(r => r.json()).catch(() => ({ modules: {} })),
        fetch('/api/sessions').then(r => r.json()).catch(() => ({ sessions: [] }))
      ])
      .then(([aws, tokens, configData, sessionsData]) => {
        setAwsCosts(aws)
        setTokenData(tokens)
        setConfig(configData)
        setSessions(sessionsData.sessions || [])
        setBudget(tokens?.budget?.monthly || 0)
        setBudgetInput((tokens?.budget?.monthly || 0).toString())
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
    }
    
    fetchData()
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchData, 300000)
    return () => clearInterval(interval)
  }, [])

  const saveBudget = async () => {
    if (!budgetInput.trim()) return
    setSavingBudget(true)
    try {
      const response = await fetch('/api/settings/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthly: parseFloat(budgetInput) || 0 })
      })
      if (response.ok) {
        setBudget(parseFloat(budgetInput) || 0)
      }
    } catch (err) {
      console.error('Failed to save budget:', err)
    }
    setSavingBudget(false)
  }

  if (loading) {
    return (
      <PageTransition>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
          <div style={{ 
            width: '32px', height: '32px', 
            border: '2px solid #007AFF', 
            borderTopColor: 'transparent', 
            borderRadius: '50%', 
            animation: 'spin 1s linear infinite' 
          }} />
        </div>
      </PageTransition>
    )
  }

  if (error || (!awsCosts && !tokenData)) {
    return (
      <PageTransition>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px', flexDirection: 'column', gap: '16px' }}>
          <AlertCircle size={48} style={{ color: '#FF453A' }} />
          <p style={{ color: 'rgba(255,255,255,0.65)' }}>Failed to load cost data</p>
        </div>
      </PageTransition>
    )
  }

  // Check if AWS module is enabled
  const isAwsEnabled = config?.modules?.aws === true
  
  // Calculate metrics with fallback to token-based estimates
  const hasAwsData = awsCosts && awsCosts.total > 0
  const totalTokens = sessions.reduce((sum, s) => sum + (s.totalTokens || 0), 0)
  const tokenBasedCost = estimateCost(totalTokens, 'sonnet')
  
  const currentMonthCost = hasAwsData ? awsCosts.total : tokenBasedCost
  const dailyAvg = hasAwsData 
    ? awsCosts.daily.reduce((sum, d) => sum + d.cost, 0) / Math.max(awsCosts.daily.length, 1)
    : tokenBasedCost / 30
  const projectedMonthly = dailyAvg * 30
  
  // Credits data - only show if AWS enabled
  const creditsUsed = hasAwsData ? awsCosts.credits - awsCosts.remaining : 0
  const burnRate = hasAwsData && creditsUsed > 0 
    ? awsCosts.remaining / (creditsUsed / awsCosts.daily.length) 
    : Infinity
  // Color bars for daily chart
  const getBarColor = (cost: number) => {
    if (cost < 10) return '#32D74B'
    if (cost < 50) return '#FF9500'
    return '#FF453A'
  }

  // Service colors
  const getServiceColor = (name: string) => {
    const lowerName = name.toLowerCase()
    if (lowerName.includes('compute') || lowerName.includes('ec2') || lowerName.includes('lambda')) return '#007AFF'
    if (lowerName.includes('claude') || lowerName.includes('ai') || lowerName.includes('bedrock')) return '#BF5AF2'
    if (lowerName.includes('s3') || lowerName.includes('storage')) return '#32D74B'
    return '#32D74B'
  }

  // Get top 5 sessions by token usage for display with enhanced cost breakdown
  const topSessions = sessions
    .filter(s => s.totalTokens > 0)
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, 5)
    .map(s => {
      // Try to parse usage data if available
      let usage = null;
      try {
        if (s.usage && typeof s.usage === 'string') {
          usage = JSON.parse(s.usage);
        } else if (s.usage && typeof s.usage === 'object') {
          usage = s.usage;
        }
      } catch (e) {
        // Ignore parsing errors
      }

      const cost = estimateCost(s.totalTokens, s.model, usage);
      
      // Calculate cache hit ratio if cache data available
      let cacheHitRatio = null;
      if (usage && usage.cacheRead && usage.input) {
        cacheHitRatio = (usage.cacheRead / (usage.input + usage.cacheRead)) * 100;
      }

      return {
        sessionId: s.key,
        sessionName: formatSessionName(s.key, s.displayName),
        model: s.model?.replace('us.anthropic.', '')?.replace(/claude-(\w+)-[\d-]+.*/, 'Claude $1') || 'Unknown',
        tokens: s.totalTokens,
        cost,
        timestamp: s.updatedAt ? new Date(s.updatedAt).getTime() / 1000 : Date.now() / 1000,
        usage,
        cacheHitRatio
      };
    })

  return (
    <PageTransition>
      <div style={{ 
        maxWidth: '1280px', 
        margin: '0 auto', 
        padding: m ? '16px' : '0',
        display: 'flex', 
        flexDirection: 'column', 
        gap: m ? '20px' : '28px' 
      }}>
        {/* Header */}
        <div>
          <h1 style={{ 
            fontSize: m ? '20px' : '28px', 
            fontWeight: '600', 
            color: 'rgba(255,255,255,0.92)', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px', 
            margin: '0' 
          }}>
            <DollarSign size={m ? 24 : 28} style={{ color: '#32D74B' }} />
            Cost Tracker
          </h1>
          <p style={{ 
            fontSize: m ? '14px' : '16px', 
            color: 'rgba(255,255,255,0.65)', 
            marginTop: '4px', 
            margin: '4px 0 0 0' 
          }}>
            Track AI spending, token usage & optimize costs
          </p>
        </div>

        {/* Cost Alert Banner */}
        {budget > 0 && currentMonthCost && (currentMonthCost / budget) > 0.8 && (
          <div style={{
            padding: m ? '12px 16px' : '16px 20px',
            background: 'rgba(255, 149, 0, 0.15)',
            border: '1px solid rgba(255, 149, 0, 0.3)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <AlertCircle size={20} style={{ color: '#FF9500' }} />
            <span style={{ 
              fontSize: m ? '13px' : '14px', 
              color: 'rgba(255,255,255,0.92)', 
              fontWeight: '500' 
            }}>
              ⚠️ You've used {Math.round((currentMonthCost / budget) * 100)}% of your ${budget} monthly budget
            </span>
          </div>
        )}

        {/* Row 1: Key Metrics */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: isAwsEnabled && hasAwsData ? (m ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)') : (m ? '1fr' : 'repeat(3, 1fr)'), 
          gap: m ? '12px' : '20px' 
        }}>
          <GlassCard delay={0} noPad>
            <div style={{ padding: m ? '16px' : '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ 
                  width: m ? '40px' : '48px', 
                  height: m ? '40px' : '48px', 
                  borderRadius: '12px', 
                  background: currentMonthCost > 100 ? 'rgba(255,149,0,0.15)' : 'rgba(50,215,75,0.15)',
                  border: '1px solid rgba(255,255,255,0.1)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center' 
                }}>
                  <DollarSign size={m ? 16 : 20} style={{ color: currentMonthCost > 100 ? '#FF9500' : '#32D74B' }} />
                </div>
                <span style={{ 
                  fontSize: m ? '10px' : '11px', 
                  fontWeight: '700', 
                  color: 'rgba(255,255,255,0.45)', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.1em' 
                }}>
                  {labels.thisMonth}
                </span>
              </div>
              <p style={{ 
                fontSize: m ? '24px' : '32px', 
                fontWeight: '300', 
                color: 'rgba(255,255,255,0.92)', 
                fontFamily: 'system-ui', 
                fontFeatureSettings: '"tnum"', 
                margin: '0' 
              }}>
                <AnimatedCounter end={currentMonthCost} decimals={2} prefix="$" />
              </p>
              {!hasAwsData && (
                <div style={{ 
                  fontSize: '11px', 
                  color: 'rgba(255,255,255,0.45)', 
                  marginTop: '8px' 
                }}>
                  Token-based estimate
                </div>
              )}
            </div>
          </GlassCard>

          {/* Credits Left - only show if AWS module is enabled and has data */}
          {isAwsEnabled && hasAwsData && awsCosts && (
            <GlassCard delay={0.05} noPad>
              <div style={{ padding: m ? '16px' : '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ 
                    width: m ? '40px' : '48px', 
                    height: m ? '40px' : '48px', 
                    borderRadius: '12px', 
                    background: 'rgba(50,215,75,0.15)',
                    border: '1px solid rgba(255,255,255,0.1)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center' 
                  }}>
                    <Target size={m ? 16 : 20} style={{ color: '#32D74B' }} />
                  </div>
                  <span style={{ 
                    fontSize: m ? '10px' : '11px', 
                    fontWeight: '700', 
                    color: 'rgba(255,255,255,0.45)', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.1em' 
                  }}>
                    {labels.creditsLeft}
                  </span>
                </div>
                <p style={{ 
                  fontSize: m ? '24px' : '32px', 
                  fontWeight: '300', 
                  color: 'rgba(255,255,255,0.92)', 
                  fontFamily: 'system-ui', 
                  fontFeatureSettings: '"tnum"', 
                  margin: '0' 
                }}>
                  <AnimatedCounter end={awsCosts.remaining} decimals={0} prefix="$" />
                </p>
              </div>
            </GlassCard>
          )}

          <GlassCard delay={0.1} noPad>
            <div style={{ padding: m ? '16px' : '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ 
                  width: m ? '40px' : '48px', 
                  height: m ? '40px' : '48px', 
                  borderRadius: '12px', 
                  background: 'rgba(0,122,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.1)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center' 
                }}>
                  <Calendar size={m ? 16 : 20} style={{ color: '#007AFF' }} />
                </div>
                <span style={{ 
                  fontSize: m ? '10px' : '11px', 
                  fontWeight: '700', 
                  color: 'rgba(255,255,255,0.45)', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.1em' 
                }}>
                  {labels.dailyAvg}
                </span>
              </div>
              <p style={{ 
                fontSize: m ? '24px' : '32px', 
                fontWeight: '300', 
                color: 'rgba(255,255,255,0.92)', 
                fontFamily: 'system-ui', 
                fontFeatureSettings: '"tnum"', 
                margin: '0' 
              }}>
                <AnimatedCounter end={dailyAvg} decimals={2} prefix="$" />
              </p>
            </div>
          </GlassCard>

          <GlassCard delay={0.15} noPad>
            <div style={{ padding: m ? '16px' : '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ 
                  width: m ? '40px' : '48px', 
                  height: m ? '40px' : '48px', 
                  borderRadius: '12px', 
                  background: 'rgba(255,149,0,0.15)',
                  border: '1px solid rgba(255,255,255,0.1)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center' 
                }}>
                  <TrendingUp size={m ? 16 : 20} style={{ color: '#FF9500' }} />
                </div>
                <span style={{ 
                  fontSize: m ? '10px' : '11px', 
                  fontWeight: '700', 
                  color: 'rgba(255,255,255,0.45)', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.1em' 
                }}>
                  {labels.projected}
                </span>
              </div>
              <p style={{ 
                fontSize: m ? '24px' : '32px', 
                fontWeight: '300', 
                color: 'rgba(255,255,255,0.92)', 
                fontFamily: 'system-ui', 
                fontFeatureSettings: '"tnum"', 
                margin: '0' 
              }}>
                <AnimatedCounter end={projectedMonthly} decimals={0} prefix="$" />
              </p>
            </div>
          </GlassCard>
        </div>

        {/* Budget Setting Card */}
        <GlassCard delay={0.18} noPad>
          <div style={{ padding: m ? '16px' : '24px' }}>
            <h3 style={{ 
              fontSize: m ? '14px' : '16px', 
              fontWeight: '600', 
              color: 'rgba(255,255,255,0.65)', 
              marginBottom: m ? '16px' : '20px', 
              margin: `0 0 ${m ? '16px' : '20px'} 0` 
            }}>
              Monthly Budget
            </h3>
            
            <div style={{ display: 'flex', flexDirection: m ? 'column' : 'row', gap: '12px', alignItems: m ? 'stretch' : 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ 
                  display: 'block', 
                  fontSize: '12px', 
                  fontWeight: '600', 
                  color: 'rgba(255,255,255,0.65)', 
                  marginBottom: '8px' 
                }}>
                  Monthly budget ($)
                </label>
                <input
                  type="number"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  placeholder="Enter budget amount"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: 'rgba(255,255,255,0.92)',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              
              <button
                onClick={saveBudget}
                disabled={savingBudget || !budgetInput.trim()}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: (savingBudget || !budgetInput.trim()) ? 'not-allowed' : 'pointer',
                  background: (savingBudget || !budgetInput.trim()) ? 'rgba(255,255,255,0.08)' : '#007AFF',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: '600',
                  opacity: (savingBudget || !budgetInput.trim()) ? 0.5 : 1,
                  minWidth: '80px'
                }}
              >
                {savingBudget ? 'Saving...' : 'Save'}
              </button>
            </div>

            {budget > 0 && (
              <div style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)' }}>
                    Current spend vs budget
                  </span>
                  <span style={{ 
                    fontSize: '12px', 
                    color: 'rgba(255,255,255,0.92)', 
                    fontFamily: 'system-ui', 
                    fontFeatureSettings: '"tnum"' 
                  }}>
                    ${currentMonthCost.toFixed(2)} / ${budget}
                  </span>
                </div>
                
                <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min((currentMonthCost / budget) * 100, 100)}%`,
                      height: '100%',
                      background: (currentMonthCost / budget) > 0.9 ? '#FF453A' : (currentMonthCost / budget) > 0.7 ? '#FF9500' : '#32D74B',
                      borderRadius: '4px',
                      transition: 'all 0.6s ease'
                    }}
                  />
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>
                    {Math.round((currentMonthCost / budget) * 100)}% used
                  </span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>
                    ${(budget - currentMonthCost).toFixed(2)} remaining
                  </span>
                </div>
              </div>
            )}
          </div>
        </GlassCard>

        {/* Row 2: Two-column layout */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: m ? '1fr' : '2fr 1fr', 
          gap: m ? '16px' : '24px' 
        }}>
          {/* Left: Daily Spend Chart */}
          <GlassCard delay={0.2} noPad>
            <div style={{ padding: m ? '16px' : '24px' }}>
              <h3 style={{ 
                fontSize: m ? '14px' : '16px', 
                fontWeight: '600', 
                color: 'rgba(255,255,255,0.65)', 
                marginBottom: m ? '16px' : '24px', 
                margin: `0 0 ${m ? '16px' : '24px'} 0` 
              }}>
                Daily Spend Chart
              </h3>
              {hasAwsData && awsCosts ? (
                <div style={{ 
                  height: m ? '180px' : '240px', 
                  display: 'flex', 
                  alignItems: 'flex-end', 
                  gap: m ? '2px' : '4px', 
                  paddingTop: '20px' 
                }}>
                  {awsCosts.daily.map((day, i) => {
                    const maxCost = Math.max(...awsCosts.daily.map(d => d.cost), 10)
                    const height = Math.max((day.cost / maxCost) * (m ? 140 : 200), 2)
                    return (
                      <div key={day.date} style={{ 
                        flex: '1', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        gap: '8px' 
                      }}>
                        <div
                          style={{
                            width: '100%',
                            height: `${height}px`,
                            background: getBarColor(day.cost),
                            borderRadius: '4px 4px 0 0',
                            opacity: '0.8',
                            transition: 'all 0.3s ease'
                          }}
                          title={`${day.date}: $${day.cost.toFixed(2)}`}
                        />
                        <span style={{ 
                          fontSize: m ? '7px' : '10px', 
                          color: 'rgba(255,255,255,0.45)',
                          textAlign: 'center',
                          lineHeight: 1.1,
                        }}>
                          {new Date(day.date).toLocaleDateString('en-US', { day: 'numeric' })}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ 
                  height: m ? '180px' : '240px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.65)' }}>
                    Using token-based cost estimation
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', textAlign: 'center' }}>
                    Daily AWS cost data not available.<br />
                    Estimated ${tokenBasedCost.toFixed(2)} this month from {totalTokens.toLocaleString()} tokens.
                  </div>
                </div>
              )}
            </div>
          </GlassCard>

          {/* Right: Service Breakdown */}
          <GlassCard delay={0.25} noPad>
            <div style={{ padding: m ? '16px' : '24px' }}>
              <h3 style={{ 
                fontSize: m ? '14px' : '16px', 
                fontWeight: '600', 
                color: 'rgba(255,255,255,0.65)', 
                marginBottom: m ? '16px' : '24px', 
                margin: `0 0 ${m ? '16px' : '24px'} 0` 
              }}>
                Service Breakdown
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: m ? '12px' : '16px' }}>
                {hasAwsData && awsCosts ? (
                  awsCosts.services.slice(0, m ? 5 : 8).map((service, i) => {
                    const percentage = (service.cost / awsCosts.total) * 100
                    return (
                      <div key={service.name} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ 
                            fontSize: m ? '12px' : '14px', 
                            color: 'rgba(255,255,255,0.65)', 
                            fontWeight: '500' 
                          }}>
                            {service.name.length > (m ? 20 : 25) 
                              ? service.name.substring(0, m ? 20 : 25) + '...' 
                              : service.name}
                          </span>
                          <span style={{ 
                            fontSize: m ? '12px' : '14px', 
                            color: 'rgba(255,255,255,0.92)', 
                            fontWeight: '600', 
                            fontFamily: 'system-ui', 
                            fontFeatureSettings: '"tnum"' 
                          }}>
                            ${service.cost.toFixed(2)}
                          </span>
                        </div>
                        <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${percentage}%`,
                              height: '100%',
                              background: getServiceColor(service.name),
                              borderRadius: '3px',
                              transition: 'width 0.6s ease'
                            }}
                          />
                        </div>
                      </div>
                    )
                  })
                ) : (
                  // Token-based breakdown by channel/session type
                  Object.entries({
                    'OpenClaw Sessions': totalTokens > 0 ? estimateCost(totalTokens, 'sonnet') : 0
                  }).map(([name, cost], i) => {
                    if (cost === 0) return null
                    return (
                      <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ 
                            fontSize: m ? '12px' : '14px', 
                            color: 'rgba(255,255,255,0.65)', 
                            fontWeight: '500' 
                          }}>
                            {name}
                          </span>
                          <span style={{ 
                            fontSize: m ? '12px' : '14px', 
                            color: 'rgba(255,255,255,0.92)', 
                            fontWeight: '600', 
                            fontFamily: 'system-ui', 
                            fontFeatureSettings: '"tnum"' 
                          }}>
                            ${cost.toFixed(2)}
                          </span>
                        </div>
                        <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: '100%',
                              height: '100%',
                              background: '#BF5AF2',
                              borderRadius: '3px',
                              transition: 'width 0.6s ease'
                            }}
                          />
                        </div>
                      </div>
                    )
                  }).filter(Boolean)
                )}
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Row 3: Token Usage by Session */}
        <GlassCard delay={0.3} noPad>
          <div style={{ padding: m ? '16px' : '24px' }}>
            <h3 style={{ 
              fontSize: m ? '14px' : '16px', 
              fontWeight: '600', 
              color: 'rgba(255,255,255,0.65)', 
              marginBottom: m ? '16px' : '24px', 
              margin: `0 0 ${m ? '16px' : '24px'} 0` 
            }}>
              Token Usage by Session
            </h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: m ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))', 
              gap: m ? '12px' : '16px' 
            }}>
              {topSessions.length > 0 ? topSessions.map((session, i) => (
                <div key={session.sessionId} style={{ 
                  padding: m ? '12px' : '16px', 
                  background: 'rgba(255,255,255,0.05)', 
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <div style={{ 
                        fontSize: m ? '12px' : '13px', 
                        color: 'rgba(255,255,255,0.92)', 
                        fontWeight: '500',
                        marginBottom: '4px'
                      }}>
                        {session.sessionName}
                      </div>
                      <div style={{ 
                        fontSize: m ? '11px' : '12px', 
                        color: 'rgba(255,255,255,0.65)'
                      }}>
                        {session.model}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ 
                        fontSize: m ? '14px' : '16px', 
                        fontWeight: '600', 
                        color: 'rgba(255,255,255,0.92)', 
                        fontFamily: 'system-ui', 
                        fontFeatureSettings: '"tnum"' 
                      }}>
                        ${session.cost.toFixed(2)}
                      </div>
                      <div style={{ 
                        fontSize: m ? '11px' : '12px', 
                        color: 'rgba(255,255,255,0.45)' 
                      }}>
                        {session.tokens.toLocaleString()} tokens
                      </div>
                    </div>
                  </div>
                  <div style={{ 
                    fontSize: m ? '10px' : '11px', 
                    color: 'rgba(255,255,255,0.35)' 
                  }}>
                    {new Date(session.timestamp * 1000).toLocaleString()}
                  </div>
                </div>
              )) : (
                <div style={{
                  padding: m ? '32px 16px' : '48px 24px',
                  textAlign: 'center',
                  color: 'rgba(255,255,255,0.45)',
                  gridColumn: '1 / -1'
                }}>
                  <div style={{ fontSize: m ? '14px' : '16px', marginBottom: '8px' }}>
                    No token usage data yet
                  </div>
                  <div style={{ fontSize: m ? '12px' : '14px' }}>
                    Start using OpenClaw to see session statistics here
                  </div>
                </div>
              )}
            </div>
          </div>
        </GlassCard>

        {/* Row 4: Budget & Projections */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: m ? '1fr' : '1fr 1fr', 
          gap: m ? '16px' : '24px' 
        }}>
          {/* Credits Burn Rate - only show if AWS data available */}
          {isAwsEnabled && hasAwsData && awsCosts && (
            <GlassCard delay={0.35} noPad>
              <div style={{ padding: m ? '16px' : '24px' }}>
                <h3 style={{ 
                  fontSize: m ? '14px' : '16px', 
                  fontWeight: '600', 
                  color: 'rgba(255,255,255,0.65)', 
                  marginBottom: m ? '16px' : '24px', 
                  margin: `0 0 ${m ? '16px' : '24px'} 0` 
                }}>
                  Credits Burn Rate
                </h3>
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ 
                      fontSize: m ? '12px' : '14px', 
                      color: 'rgba(255,255,255,0.65)' 
                    }}>
                      Used
                    </span>
                    <span style={{ 
                      fontSize: m ? '12px' : '14px', 
                      color: 'rgba(255,255,255,0.92)', 
                      fontFamily: 'system-ui', 
                      fontFeatureSettings: '"tnum"' 
                    }}>
                      ${creditsUsed.toFixed(0)} / ${awsCosts.credits.toLocaleString()}
                    </span>
                  </div>
                  <div style={{ height: '12px', background: 'rgba(255,255,255,0.1)', borderRadius: '6px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${(creditsUsed / awsCosts.credits) * 100}%`,
                        height: '100%',
                        background: creditsUsed / awsCosts.credits > 0.75 ? '#FF453A' : creditsUsed / awsCosts.credits > 0.5 ? '#FF9500' : '#32D74B',
                        borderRadius: '6px',
                        transition: 'width 0.6s ease'
                      }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ 
                      fontSize: m ? '12px' : '13px', 
                      color: 'rgba(255,255,255,0.45)' 
                    }}>
                      At current rate, credits last:
                    </span>
                    <span style={{ 
                      fontSize: m ? '12px' : '13px', 
                      color: 'rgba(255,255,255,0.92)', 
                      fontWeight: '600' 
                    }}>
                      {burnRate === Infinity ? '∞' : `${Math.round(burnRate)} days`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ 
                      fontSize: m ? '12px' : '13px', 
                      color: 'rgba(255,255,255,0.45)' 
                    }}>
                      Daily burn rate:
                    </span>
                    <span style={{ 
                      fontSize: m ? '12px' : '13px', 
                      color: 'rgba(255,255,255,0.92)', 
                      fontWeight: '600' 
                    }}>
                      ${dailyAvg.toFixed(2)}/day
                    </span>
                  </div>
                </div>
              </div>
            </GlassCard>
          )}

          {/* Cost Optimization Tips */}
          <GlassCard delay={0.4} noPad>
            <div style={{ padding: m ? '16px' : '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: m ? '16px' : '24px' }}>
                <h3 style={{ 
                  fontSize: m ? '14px' : '16px', 
                  fontWeight: '600', 
                  color: 'rgba(255,255,255,0.65)', 
                  margin: '0' 
                }}>
                  Cost Optimization Tips
                </h3>
                <Zap size={16} style={{ color: '#FF9500' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: m ? '12px' : '16px' }}>
                <div style={{ 
                  padding: m ? '12px' : '16px', 
                  background: 'rgba(50,215,75,0.1)', 
                  borderRadius: '8px',
                  border: '1px solid rgba(50,215,75,0.2)'
                }}>
                  <div style={{ 
                    fontSize: m ? '12px' : '14px', 
                    color: 'rgba(255,255,255,0.92)', 
                    fontWeight: '500', 
                    marginBottom: '4px' 
                  }}>
                    🎯 Heartbeats: Haiku
                  </div>
                  <div style={{ 
                    fontSize: m ? '11px' : '12px', 
                    color: 'rgba(255,255,255,0.65)' 
                  }}>
                    Saving ~$8/day on routine checks
                  </div>
                </div>
                <div style={{ 
                  padding: m ? '12px' : '16px', 
                  background: 'rgba(191,90,242,0.1)', 
                  borderRadius: '8px',
                  border: '1px solid rgba(191,90,242,0.2)'
                }}>
                  <div style={{ 
                    fontSize: m ? '12px' : '14px', 
                    color: 'rgba(255,255,255,0.92)', 
                    fontWeight: '500', 
                    marginBottom: '4px' 
                  }}>
                    🤖 Sub-agents: Sonnet
                  </div>
                  <div style={{ 
                    fontSize: m ? '11px' : '12px', 
                    color: 'rgba(255,255,255,0.65)' 
                  }}>
                    Saving ~$15/day vs Opus for tasks
                  </div>
                </div>
                {!hasAwsData && (
                  <div style={{ 
                    padding: m ? '12px' : '16px', 
                    background: 'rgba(0,122,255,0.1)', 
                    borderRadius: '8px',
                    border: '1px solid rgba(0,122,255,0.2)'
                  }}>
                    <div style={{ 
                      fontSize: m ? '12px' : '14px', 
                      color: 'rgba(255,255,255,0.92)', 
                      fontWeight: '500', 
                      marginBottom: '4px' 
                    }}>
                      ☁️ AWS Bedrock: $0
                    </div>
                    <div style={{ 
                      fontSize: m ? '11px' : '12px', 
                      color: 'rgba(255,255,255,0.65)' 
                    }}>
                      Using included AWS credits
                    </div>
                  </div>
                )}
                <div style={{ 
                  padding: m ? '10px 12px' : '12px 16px', 
                  background: 'rgba(255,255,255,0.05)', 
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer'
                }}>
                  <Settings size={14} style={{ color: 'rgba(255,255,255,0.65)' }} />
                  <span style={{ 
                    fontSize: m ? '12px' : '13px', 
                    color: 'rgba(255,255,255,0.65)' 
                  }}>
                    Configure model routing →
                  </span>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </PageTransition>
  )
}