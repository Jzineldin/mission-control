import GlassCard from '../../components/GlassCard'
import { formatCurrency } from './lib'

interface BudgetCardProps {
  m: boolean
  budget: number
  budgetInput: string
  setBudgetInput: (v: string) => void
  saveBudget: () => void
  savingBudget: boolean
  budgetUsagePct: number
  budgetUsage: number
  budgetRemaining: number
  budgetBadgeClass: string
  monthlyBudgetBase: number
}

export default function BudgetCard({
  m,
  budget,
  budgetInput,
  setBudgetInput,
  saveBudget,
  savingBudget,
  budgetUsagePct,
  budgetUsage,
  budgetRemaining,
  budgetBadgeClass,
  monthlyBudgetBase,
}: BudgetCardProps) {
  return (
    <GlassCard delay={0.18} noPad>
      <div style={{ padding: m ? '16px' : '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: m ? '16px' : '20px' }}>
          <div>
            <h3 style={{ fontSize: m ? '15px' : '16px', fontWeight: '600', color: 'rgba(255,255,255,0.92)', margin: 0 }}>
              Budget Guardrail
            </h3>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
              Set a monthly cap to keep alerts and runway tracking grounded.
            </div>
          </div>
          <span className={`macos-badge ${budgetBadgeClass}`}>
            {budget > 0 ? `${budgetUsagePct}% used` : 'No cap set'}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: m ? 'column' : 'row', gap: '12px', alignItems: m ? 'stretch' : 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'rgba(255,255,255,0.65)', marginBottom: '8px' }}>
              Monthly budget (USD)
            </label>
            <input
              type="number"
              value={budgetInput}
              onChange={e => setBudgetInput(e.target.value)}
              placeholder="Enter budget amount"
              className="macos-input"
              style={{ width: '100%', padding: '10px 14px' }}
            />
          </div>

          <button
            onClick={saveBudget}
            disabled={savingBudget || !budgetInput.trim()}
            className={`macos-button ${!savingBudget && budgetInput.trim() ? 'macos-button-primary' : ''}`}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              cursor: savingBudget || !budgetInput.trim() ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: '600',
              opacity: savingBudget || !budgetInput.trim() ? 0.5 : 1,
              minWidth: '80px',
            }}
          >
            {savingBudget ? 'Saving...' : 'Save'}
          </button>
        </div>

        {budget > 0 ? (
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)' }}>Current spend vs budget</span>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.92)', fontFamily: 'system-ui', fontFeatureSettings: '"tnum"' }}>
                {formatCurrency(monthlyBudgetBase)} / {formatCurrency(budget)}
              </span>
            </div>

            <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.min((monthlyBudgetBase / budget) * 100, 100)}%`,
                  height: '100%',
                  background: budgetUsage > 0.9 ? '#FF453A' : budgetUsage > 0.7 ? '#FF9500' : '#32D74B',
                  borderRadius: '4px',
                  transition: 'all 0.6s ease',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>{budgetUsagePct}% used</span>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>{formatCurrency(budgetRemaining)} remaining</span>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: '16px', padding: m ? '14px' : '16px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.82)', fontWeight: '500' }}>No monthly cap configured</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
              Add a budget to get progress tracking and early spend alerts.
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  )
}
