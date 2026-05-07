import { useState, useRef, useCallback, useId } from 'react'
import { useStore, ACTIONS, genId } from '../store'
import NoteField from '../components/NoteField'

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCOUNT_TYPES = [
  { value: 'trad_401k',  label: 'Traditional 401(k)',  tag: '401k',   taxLabel: 'Pre-tax' },
  { value: 'roth_401k',  label: 'Roth 401(k)',          tag: 'R401k',  taxLabel: 'After-tax' },
  { value: 'trad_ira',   label: 'Traditional IRA',      tag: 'IRA',    taxLabel: 'Pre-tax' },
  { value: 'roth_ira',   label: 'Roth IRA',             tag: 'RIRA',   taxLabel: 'After-tax' },
  { value: 'hsa',        label: 'HSA',                  tag: 'HSA',    taxLabel: 'Triple-tax' },
  { value: 'taxable',    label: 'Taxable Brokerage',    tag: 'Brok.',  taxLabel: 'Taxable' },
  { value: 'pension',    label: 'Pension',               tag: 'Pens.',  taxLabel: 'Pre-tax' },
  { value: 'other',      label: 'Other',                 tag: 'Other',  taxLabel: '' },
]

const TYPE_COLORS = {
  trad_401k: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  roth_401k: 'bg-violet-500/15 text-violet-400 border-violet-500/25',
  trad_ira:  'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
  roth_ira:  'bg-indigo-500/15 text-indigo-400 border-indigo-500/25',
  hsa:       'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  taxable:   'bg-amber-500/15 text-amber-400 border-amber-500/25',
  pension:   'bg-rose-500/15 text-rose-400 border-rose-500/25',
  other:     'bg-slate-500/15 text-slate-400 border-slate-500/25',
}

const NEW_ACCOUNT_DEFAULTS = {
  name: '',
  type: 'trad_401k',
  balance: '',
  monthlyContribution: '',
  monthlyEmployerMatch: '',
  stopContributingYearsBefore: 0,
  annualGrowthRate: 7,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCurrency(val) {
  if (val === '' || val === null || val === undefined) return ''
  const n = parseFloat(String(val).replace(/[$,]/g, ''))
  return isNaN(n) ? '' : n
}

function formatCurrency(val) {
  if (val === '' || val === null || val === undefined) return ''
  const n = typeof val === 'string' ? parseFloat(val.replace(/[$,]/g, '')) : val
  if (isNaN(n)) return ''
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function getTypeMeta(value) {
  return ACCOUNT_TYPES.find(t => t.value === value) || ACCOUNT_TYPES[ACCOUNT_TYPES.length - 1]
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CurrencyInput({ value, onChange, placeholder = '$0', id, className = '' }) {
  const [focused, setFocused] = useState(false)
  const display = focused ? (value === '' ? '' : String(value)) : formatCurrency(value)
  return (
    <input
      id={id}
      className={`input ${className}`}
      value={display}
      placeholder={focused ? '0' : placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={e => {
        const raw = e.target.value.replace(/[$,]/g, '')
        if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
          onChange(raw === '' ? '' : (parseFloat(raw) || raw))
        }
      }}
    />
  )
}

function PercentInput({ value, onChange, placeholder = '0', id, step = '0.1' }) {
  return (
    <div className="relative">
      <input
        id={id}
        className="input pr-7"
        type="number"
        step={step}
        min="0"
        max="100"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">%</span>
    </div>
  )
}

/** Tooltip that appears on hover */
function Tooltip({ children, tip }) {
  const [visible, setVisible] = useState(false)
  return (
    <span className="relative inline-flex items-center">
      <span
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        tabIndex={0}
        className="cursor-help"
      >
        {children}
      </span>
      {visible && (
        <span
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-slate-800 border border-slate-700 
                     text-slate-300 text-xs leading-relaxed rounded-lg px-3 py-2.5 shadow-xl z-50 pointer-events-none"
          style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))' }}
        >
          {tip}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-700" />
        </span>
      )}
    </span>
  )
}

// ─── Account Card ─────────────────────────────────────────────────────────────

function AccountCard({ account, index, total, onMoveUp, onMoveDown, onDelete }) {
  const [expanded, setExpanded] = useState(account.name === '')  // new accounts start open
  const { dispatch } = useStore()

  const update = useCallback(
    (field, value) =>
      dispatch({ type: ACTIONS.UPDATE_ACCOUNT, payload: { id: account.id, [field]: value } }),
    [dispatch, account.id]
  )

  const typeMeta = getTypeMeta(account.type)
  const tagColor = TYPE_COLORS[account.type] || TYPE_COLORS.other

  const annualContrib = (parseCurrency(account.monthlyContribution) || 0) * 12
  const annualMatch   = (parseCurrency(account.monthlyEmployerMatch) || 0) * 12

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden transition-all duration-150 hover:border-slate-700">
      {/* Card header — always visible */}
      <div className="flex items-center gap-3 px-5 py-4">
        {/* Drag handle / reorder */}
        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-0.5 text-slate-600 hover:text-slate-400 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            title="Move up"
          >
            <svg viewBox="0 0 10 6" className="w-2.5 h-2.5 fill-current"><path d="M5 0L10 6H0z"/></svg>
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="p-0.5 text-slate-600 hover:text-slate-400 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            title="Move down"
          >
            <svg viewBox="0 0 10 6" className="w-2.5 h-2.5 fill-current"><path d="M5 6L0 0H10z"/></svg>
          </button>
        </div>

        {/* Type badge */}
        <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded border text-xs font-mono font-medium ${tagColor}`}>
          {typeMeta.tag}
        </span>

        {/* Name / placeholder */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${account.name ? 'text-slate-100' : 'text-slate-600 italic'}`}>
            {account.name || 'Unnamed account'}
          </p>
          {!expanded && account.balance !== '' && (
            <p className="text-xs text-slate-500 mt-0.5">
              Balance: <span className="text-slate-400 font-mono">{formatCurrency(account.balance)}</span>
              {annualContrib > 0 && (
                <span> · Contrib: <span className="text-slate-400 font-mono">{formatCurrency(annualContrib)}/yr</span></span>
              )}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setExpanded(e => !e)}
            className="btn-ghost py-1.5 px-2.5 text-xs"
          >
            {expanded ? 'Collapse' : 'Edit'}
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            title="Delete account"
          >
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
              <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66H14.5a.5.5 0 0 0 0-1h-.996a.59.59 0 0 0-.01 0H11Zm1.958 1-.846 10.58a1 1 0 0 1-.997.92H4.885a1 1 0 0 1-.997-.92L3.042 3.5h9.916Z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded form */}
      {expanded && (
        <div className="border-t border-slate-800 px-5 py-5 space-y-5">
          {/* Row 1: Name + Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Account Name</label>
              <input
                className="input"
                value={account.name}
                onChange={e => update('name', e.target.value)}
                placeholder="e.g. Fidelity 401(k)"
              />
            </div>
            <div>
              <label className="label">Account Type</label>
              <select
                className="input"
                value={account.type}
                onChange={e => update('type', e.target.value)}
              >
                {ACCOUNT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Balance + Growth Rate */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Current Balance</label>
              <CurrencyInput
                value={account.balance}
                onChange={v => update('balance', v)}
                placeholder="$0"
              />
            </div>
            <div>
              <label className="label">Estimated Annual Growth Rate</label>
              <PercentInput
                value={account.annualGrowthRate}
                onChange={v => update('annualGrowthRate', v)}
                placeholder="7"
              />
            </div>
          </div>

          {/* Row 3: Monthly contributions */}
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Monthly Contributions</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Employee Contribution</label>
                <CurrencyInput
                  value={account.monthlyContribution}
                  onChange={v => update('monthlyContribution', v)}
                  placeholder="$0"
                />
                {annualContrib > 0 && (
                  <p className="mt-1 text-xs text-slate-600">
                    = <span className="text-slate-500">{formatCurrency(annualContrib)}/yr</span>
                  </p>
                )}
              </div>
              <div>
                <label className="label">Employer Match</label>
                <CurrencyInput
                  value={account.monthlyEmployerMatch}
                  onChange={v => update('monthlyEmployerMatch', v)}
                  placeholder="$0"
                />
                {annualMatch > 0 && (
                  <p className="mt-1 text-xs text-slate-600">
                    = <span className="text-slate-500">{formatCurrency(annualMatch)}/yr</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Row 4: Stop contributing */}
          <div className="max-w-xs">
            <label className="label">
              Stop Contributing
              <span className="ml-1 normal-case font-normal text-slate-600">(years before retirement)</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                className="input"
                type="number"
                min="0"
                max="40"
                step="1"
                value={account.stopContributingYearsBefore}
                onChange={e => update('stopContributingYearsBefore', parseInt(e.target.value) || 0)}
              />
              <span className="text-xs text-slate-500 shrink-0">
                {account.stopContributingYearsBefore === 0
                  ? 'Contribute until retirement'
                  : `Stop ${account.stopContributingYearsBefore} yr${account.stopContributingYearsBefore !== 1 ? 's' : ''} before`}
              </span>
            </div>
          </div>

          {/* Tax treatment reminder */}
          {typeMeta.taxLabel && (
            <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-800/40 rounded-lg px-3 py-2">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                typeMeta.taxLabel === 'After-tax' ? 'bg-violet-400' :
                typeMeta.taxLabel === 'Triple-tax' ? 'bg-emerald-400' :
                typeMeta.taxLabel === 'Taxable' ? 'bg-amber-400' : 'bg-blue-400'
              }`} />
              <span className="text-slate-500">Tax treatment:</span>
              <span className="text-slate-400">{typeMeta.taxLabel}</span>
              {typeMeta.taxLabel === 'Triple-tax' && (
                <span className="text-slate-600 ml-1">— contributions, growth &amp; qualified withdrawals all tax-free</span>
              )}
            </div>
          )}

          {/* Note */}
          <NoteField noteKey={`account_${account.id}`} placeholder={`Notes about ${account.name || 'this account'}…`} />
        </div>
      )}
    </div>
  )
}

// ─── Emergency Fund Section ───────────────────────────────────────────────────

function EmergencyFundSection() {
  const { state, dispatch } = useStore()
  const { emergencyFund } = state

  const update = useCallback(
    (field, value) =>
      dispatch({ type: ACTIONS.UPDATE_EMERGENCY_FUND, payload: { [field]: value } }),
    [dispatch]
  )

  const TIP_TEXT =
    'Each year, any income surplus after spending is added to this fund. ' +
    'Large future expenses draw from it first. ' +
    'If the fund goes negative, the deficit is treated as a short-term loan ' +
    'repaid over 3 years at 5% interest.'

  return (
    <div className="rounded-xl border border-dashed border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 20 20" className="w-4 h-4 fill-emerald-400">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v4.59L7.3 9.24a.75.75 0 00-1.1 1.02l3.25 3.5a.75.75 0 001.1 0l3.25-3.5a.75.75 0 10-1.1-1.02l-1.95 2.1V6.75z" clipRule="evenodd"/>
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-slate-100">Emergency Fund</h3>
              <Tooltip tip={TIP_TEXT}>
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-700 text-slate-400 text-xs font-bold hover:bg-slate-600 hover:text-slate-200 transition-colors">?</span>
              </Tooltip>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Cash buffer — used before selling investments</p>
          </div>
        </div>
        <span className="badge bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 text-xs">Always included</span>
      </div>

      {/* Fields */}
      <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Current Balance</label>
          <CurrencyInput
            value={emergencyFund.currentBalance}
            onChange={v => update('currentBalance', v)}
            placeholder="$0"
          />
          <p className="mt-1 text-xs text-slate-600">Cash in savings / money market</p>
        </div>
        <div>
          <label className="label">Annual Growth Rate</label>
          <PercentInput
            value={emergencyFund.growthRate}
            onChange={v => update('growthRate', v)}
            placeholder="4"
          />
          <p className="mt-1 text-xs text-slate-600">Typical HYSA rate: 4–5%</p>
        </div>
      </div>

      {/* Note */}
      <NoteField noteKey="emergencyFund" placeholder="Notes about your emergency fund strategy or target…" />
    </div>
  )
}

// ─── Portfolio Summary Bar ────────────────────────────────────────────────────

function PortfolioSummary({ accounts }) {
  const totalBalance = accounts.reduce((sum, a) => sum + (parseCurrency(a.balance) || 0), 0)
  const totalMonthlyContrib = accounts.reduce((sum, a) =>
    sum + (parseCurrency(a.monthlyContribution) || 0) + (parseCurrency(a.monthlyEmployerMatch) || 0), 0)

  if (accounts.length === 0) return null

  const byType = accounts.reduce((acc, a) => {
    const bal = parseCurrency(a.balance) || 0
    acc[a.type] = (acc[a.type] || 0) + bal
    return acc
  }, {})

  const segments = Object.entries(byType)
    .map(([type, bal]) => ({ type, bal, pct: totalBalance > 0 ? (bal / totalBalance) * 100 : 0 }))
    .sort((a, b) => b.bal - a.bal)

  const BAR_COLORS = {
    trad_401k: 'bg-blue-500',
    roth_401k: 'bg-violet-500',
    trad_ira:  'bg-cyan-500',
    roth_ira:  'bg-indigo-500',
    hsa:       'bg-emerald-500',
    taxable:   'bg-amber-500',
    pension:   'bg-rose-500',
    other:     'bg-slate-500',
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Portfolio Summary</h3>
        <span className="font-display text-2xl font-semibold text-slate-100">
          {formatCurrency(totalBalance)}
        </span>
      </div>

      {/* Stacked bar */}
      {totalBalance > 0 && (
        <div className="w-full h-2.5 rounded-full overflow-hidden flex gap-px bg-slate-800">
          {segments.map(s => (
            <div
              key={s.type}
              className={`h-full transition-all duration-500 ${BAR_COLORS[s.type] || 'bg-slate-500'}`}
              style={{ width: `${s.pct}%` }}
              title={`${getTypeMeta(s.type).label}: ${formatCurrency(s.bal)}`}
            />
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map(s => (
          <div key={s.type} className="flex items-center gap-1.5 text-xs">
            <div className={`w-2 h-2 rounded-full ${BAR_COLORS[s.type] || 'bg-slate-500'}`} />
            <span className="text-slate-500">{getTypeMeta(s.type).label}</span>
            <span className="text-slate-400 font-mono">{formatCurrency(s.bal)}</span>
          </div>
        ))}
      </div>

      {totalMonthlyContrib > 0 && (
        <div className="pt-1 border-t border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-500">Total monthly contributions (incl. employer)</span>
          <span className="text-slate-300 font-mono font-medium">{formatCurrency(totalMonthlyContrib)}/mo</span>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Accounts() {
  const { state, dispatch } = useStore()
  const { accounts } = state

  const addAccount = () => {
    dispatch({
      type: ACTIONS.ADD_ACCOUNT,
      payload: { id: genId('acct'), ...NEW_ACCOUNT_DEFAULTS },
    })
  }

  const removeAccount = (id) => {
    dispatch({ type: ACTIONS.REMOVE_ACCOUNT, payload: id })
  }

  const moveAccount = (index, direction) => {
    const next = [...accounts]
    const swapIdx = index + direction
    if (swapIdx < 0 || swapIdx >= next.length) return
    ;[next[index], next[swapIdx]] = [next[swapIdx], next[index]]
    dispatch({ type: ACTIONS.REORDER_ACCOUNTS, payload: next })
  }

  return (
    <div className="page-enter space-y-8 max-w-4xl">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-gold-500 uppercase tracking-widest mb-1">Assets</p>
          <h1 className="page-title">Accounts</h1>
          <p className="text-slate-400 text-sm mt-1">
            Add all investment and savings accounts. Order doesn't affect projections.
          </p>
        </div>
        <button onClick={addAccount} className="btn-primary shrink-0 mt-1">
          + Add Account
        </button>
      </div>

      {/* Portfolio summary */}
      <PortfolioSummary accounts={accounts} />

      {/* Account list */}
      {accounts.length === 0 ? (
        <div className="border border-dashed border-slate-700 rounded-xl flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-slate-600">
              <path d="M11.5 2C6.81 2 3 5.81 3 10.5S6.81 19 11.5 19h.5v3c4.86-2.34 8-7 8-11.5C20 5.81 16.19 2 11.5 2zm1 14.5h-2v-2h2v2zm0-4h-2c0-3.25 3-3 3-5 0-1.1-.9-2-2-2s-2 .9-2 2h-2c0-2.21 1.79-4 4-4s4 1.79 4 4c0 2.5-3 2.75-3 5z"/>
            </svg>
          </div>
          <p className="text-slate-400 font-medium">No accounts yet</p>
          <p className="text-slate-600 text-sm text-center max-w-xs">
            Add your 401(k), IRA, brokerage accounts, and other investments to build your projection.
          </p>
          <button onClick={addAccount} className="btn-primary mt-1">
            + Add your first account
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account, idx) => (
            <AccountCard
              key={account.id}
              account={account}
              index={idx}
              total={accounts.length}
              onMoveUp={() => moveAccount(idx, -1)}
              onMoveDown={() => moveAccount(idx, 1)}
              onDelete={() => removeAccount(account.id)}
            />
          ))}

          <button
            onClick={addAccount}
            className="w-full py-3 border border-dashed border-slate-700 hover:border-slate-500 
                       rounded-xl text-sm text-slate-500 hover:text-slate-300 transition-colors duration-150"
          >
            + Add another account
          </button>
        </div>
      )}

      {/* Divider */}
      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-800" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-slate-950 px-3 text-xs text-slate-600 uppercase tracking-wider">Liquidity buffer</span>
        </div>
      </div>

      {/* Emergency fund */}
      <EmergencyFundSection />

      {/* Footer */}
      <div className="flex items-center gap-2 text-xs text-slate-600 pb-6">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
        All changes are saved automatically to your browser
      </div>
    </div>
  )
}
