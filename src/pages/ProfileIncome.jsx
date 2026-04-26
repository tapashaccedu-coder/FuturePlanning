import { useState, useCallback } from 'react'
import { useStore, ACTIONS } from '../store'

// ─── Currency helpers ─────────────────────────────────────────────────────────

function parseCurrency(str) {
  if (str === '' || str === null || str === undefined) return ''
  const n = parseFloat(String(str).replace(/[$,]/g, ''))
  return isNaN(n) ? '' : n
}

function formatCurrency(val) {
  if (val === '' || val === null || val === undefined) return ''
  const n = typeof val === 'string' ? parseFloat(val.replace(/[$,]/g, '')) : val
  if (isNaN(n)) return ''
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

// ─── Reusable field components ────────────────────────────────────────────────

function FieldError({ msg }) {
  if (!msg) return null
  return (
    <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
      <span>⚠</span> {msg}
    </p>
  )
}

function CurrencyInput({ value, onChange, placeholder = '$0', id, hasError }) {
  const [focused, setFocused] = useState(false)
  const displayValue = focused
    ? (value === '' ? '' : String(value))
    : formatCurrency(value)

  return (
    <input
      id={id}
      className={`input ${hasError ? 'border-red-500 focus:border-red-400 focus:ring-red-400/20' : ''}`}
      value={displayValue}
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

function PercentInput({ value, onChange, placeholder = '0', id }) {
  return (
    <div className="relative">
      <input
        id={id}
        className="input pr-7"
        type="number"
        step="0.1"
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

function Toggle({ checked, onChange, label, sublabel }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3 group text-left w-full">
      <div className={`w-11 h-6 rounded-full transition-colors duration-200 relative shrink-0 ${checked ? 'bg-gold-500' : 'bg-slate-700'}`}>
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </div>
      {(label || sublabel) && (
        <div>
          {label && <p className="text-sm font-medium text-slate-200 group-hover:text-slate-100">{label}</p>}
          {sublabel && <p className="text-xs text-slate-500">{sublabel}</p>}
        </div>
      )}
    </button>
  )
}

// ─── Bridge / Part-Time Income sub-section ───────────────────────────────────

function BridgeIncomeSection({ personKey }) {
  const { state, dispatch } = useStore()
  const p  = state.profile[personKey]
  const bi = p.bridgeIncome ?? { enabled: false, startAge: 62, endAge: 67, annualAmount: 0, growthRate: 0 }
  const [open, setOpen] = useState(false)

  const updateBridge = useCallback(
    (data) => dispatch({ type: ACTIONS.UPDATE_BRIDGE_INCOME, payload: { person: personKey, data } }),
    [dispatch, personKey]
  )

  // Preview text
  const previewText = (() => {
    if (!bi.enabled || !bi.annualAmount) return null
    const amt = formatCurrency(bi.annualAmount)
    return `Earns ${amt}/yr from age ${bi.startAge} to ${bi.endAge}${
      bi.growthRate > 0 ? `, growing ${bi.growthRate}%/yr` : ''
    }.`
  })()

  return (
    <div className="rounded-lg border border-slate-700/60 overflow-hidden">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
          bi.enabled
            ? 'bg-sky-500/10 hover:bg-sky-500/15'
            : 'bg-slate-800/50 hover:bg-slate-800/70'
        }`}
      >
        <div className="flex items-center gap-2.5">
          {/* Toggle pill */}
          <div
            onClick={e => { e.stopPropagation(); updateBridge({ enabled: !bi.enabled }) }}
            className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer shrink-0 ${
              bi.enabled ? 'bg-sky-500' : 'bg-slate-600'
            }`}
          >
            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
              bi.enabled ? 'translate-x-4' : 'translate-x-0.5'
            }`} />
          </div>
          <div>
            <span className={`text-xs font-medium ${bi.enabled ? 'text-sky-300' : 'text-slate-400'}`}>
              Bridge / part-time income
            </span>
            {previewText && (
              <p className="text-xs text-sky-400/70 mt-0.5">{previewText}</p>
            )}
          </div>
        </div>
        <svg
          viewBox="0 0 16 16"
          className={`w-3.5 h-3.5 fill-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M7.247 11.14L2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z"/>
        </svg>
      </button>

      {/* Expandable fields */}
      {open && (
        <div className="px-4 py-4 bg-slate-900/60 border-t border-slate-700/60 space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            Income earned after leaving your main career but before full retirement
            — e.g. consulting, freelance, or part-time work. This income is added
            on top of any existing salary during the specified age range.
          </p>

          {/* Start age + End age */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor={`${personKey}-bridge-start`}>Start Age</label>
              <input
                id={`${personKey}-bridge-start`}
                className="input"
                type="number"
                min="40" max="90"
                value={bi.startAge}
                onChange={e => updateBridge({ startAge: e.target.value === '' ? '' : parseInt(e.target.value) })}
                placeholder="62"
              />
            </div>
            <div>
              <label className="label" htmlFor={`${personKey}-bridge-end`}>End Age</label>
              <input
                id={`${personKey}-bridge-end`}
                className="input"
                type="number"
                min="40" max="95"
                value={bi.endAge}
                onChange={e => updateBridge({ endAge: e.target.value === '' ? '' : parseInt(e.target.value) })}
                placeholder="67"
              />
              {bi.startAge && bi.endAge && bi.endAge <= bi.startAge && (
                <p className="mt-1 text-xs text-red-400">End age must be after start age</p>
              )}
            </div>
          </div>

          {/* Annual amount + growth rate */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor={`${personKey}-bridge-amount`}>Annual Amount</label>
              <CurrencyInput
                id={`${personKey}-bridge-amount`}
                value={bi.annualAmount}
                onChange={v => updateBridge({ annualAmount: v })}
                placeholder="$0"
              />
              <p className="mt-1 text-xs text-slate-600">Today's dollars</p>
            </div>
            <div>
              <label className="label" htmlFor={`${personKey}-bridge-growth`}>Annual Growth</label>
              <PercentInput
                id={`${personKey}-bridge-growth`}
                value={bi.growthRate}
                onChange={v => updateBridge({ growthRate: v })}
                placeholder="0"
              />
              <p className="mt-1 text-xs text-slate-600">0% = flat amount</p>
            </div>
          </div>

          {/* Live preview */}
          {bi.annualAmount > 0 && bi.startAge && bi.endAge && bi.endAge > bi.startAge && (
            <div className="bg-sky-500/8 border border-sky-500/20 rounded-lg px-3 py-2.5">
              <p className="text-xs text-sky-300 font-medium">Preview</p>
              <p className="text-xs text-sky-400/80 mt-0.5">{previewText}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Person form section ──────────────────────────────────────────────────────

function PersonSection({ personKey, label, badge }) {
  const { state, dispatch } = useStore()
  const p = state.profile[personKey]

  const update = useCallback(
    (field, value) => dispatch({ type: ACTIONS.UPDATE_PERSON, payload: { person: personKey, data: { [field]: value } } }),
    [dispatch, personKey]
  )

  const errors = {}
  const age = parseInt(p.age)
  const retAge = parseInt(p.retirementAge)
  const startAge = parseInt(p.expectedStartAge)

  if (p.age !== '' && p.retirementAge !== '' && !isNaN(age) && !isNaN(retAge) && retAge <= age) {
    errors.retirementAge = `Retirement age must be greater than current age (${age})`
  }
  if (p.employmentStatus === 'not_yet_employed') {
    if (p.expectedStartAge !== '' && p.age !== '' && !isNaN(startAge) && !isNaN(age) && startAge <= age) {
      errors.expectedStartAge = `Start age must be greater than current age (${age})`
    }
    if (p.expectedStartAge !== '' && p.retirementAge !== '' && !isNaN(startAge) && !isNaN(retAge) && startAge >= retAge) {
      errors.expectedStartAge = `Start age must be less than retirement age (${retAge})`
    }
  }

  const yearsLeft = !isNaN(age) && !isNaN(retAge) && retAge > age ? retAge - age : null

  return (
    <div className="card space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gold-500/10 border border-gold-500/25 flex items-center justify-center shrink-0">
            <span className="text-gold-400 text-xs font-bold font-mono">{badge}</span>
          </div>
          <h2 className="section-title">{label}</h2>
        </div>
        {Object.keys(errors).length > 0 && (
          <span className="badge badge-red">Review required</span>
        )}
      </div>

      {/* Name + Age */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor={`${personKey}-name`}>Full Name</label>
          <input
            id={`${personKey}-name`}
            className="input"
            value={p.name}
            onChange={e => update('name', e.target.value)}
            placeholder="e.g. Alex Johnson"
          />
        </div>
        <div>
          <label className="label" htmlFor={`${personKey}-age`}>Current Age</label>
          <input
            id={`${personKey}-age`}
            className="input"
            type="number"
            min="16"
            max="100"
            value={p.age}
            onChange={e => update('age', e.target.value === '' ? '' : parseInt(e.target.value))}
            placeholder="e.g. 35"
          />
        </div>
      </div>

      {/* Employment Status */}
      <div>
        <label className="label">Employment Status</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: 'employed', label: 'Currently Employed' },
            { value: 'not_yet_employed', label: 'Not Yet Employed' },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update('employmentStatus', opt.value)}
              className={`py-2.5 px-4 rounded-lg border text-sm font-medium transition-all duration-150 ${
                p.employmentStatus === opt.value
                  ? 'bg-gold-500/15 border-gold-500/50 text-gold-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Employed: annual salary */}
      {p.employmentStatus === 'employed' && (
        <div>
          <label className="label" htmlFor={`${personKey}-income`}>Annual Gross Salary</label>
          <CurrencyInput
            id={`${personKey}-income`}
            value={p.income}
            onChange={v => update('income', v)}
            placeholder="$0"
          />
        </div>
      )}

      {/* Not yet employed: start age + starting salary */}
      {p.employmentStatus === 'not_yet_employed' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor={`${personKey}-startAge`}>Expected Start Age</label>
            <input
              id={`${personKey}-startAge`}
              className={`input ${errors.expectedStartAge ? 'border-red-500 focus:border-red-400 focus:ring-red-400/20' : ''}`}
              type="number"
              min="16"
              max="80"
              value={p.expectedStartAge}
              onChange={e => update('expectedStartAge', e.target.value === '' ? '' : parseInt(e.target.value))}
              placeholder="e.g. 22"
            />
            <FieldError msg={errors.expectedStartAge} />
          </div>
          <div>
            <label className="label" htmlFor={`${personKey}-startSalary`}>Expected Starting Salary</label>
            <CurrencyInput
              id={`${personKey}-startSalary`}
              value={p.expectedStartingSalary}
              onChange={v => update('expectedStartingSalary', v)}
              placeholder="$0"
            />
          </div>
        </div>
      )}

      {/* Growth rate + retirement age */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor={`${personKey}-growth`}>Annual Salary Growth Rate</label>
          <PercentInput
            id={`${personKey}-growth`}
            value={p.incomeGrowthRate}
            onChange={v => update('incomeGrowthRate', v)}
            placeholder="3"
          />
          <p className="mt-1 text-xs text-slate-600">Typical range: 1%–5%</p>
        </div>
        <div>
          <label className="label" htmlFor={`${personKey}-retAge`}>Planned Retirement Age</label>
          <input
            id={`${personKey}-retAge`}
            className={`input ${errors.retirementAge ? 'border-red-500 focus:border-red-400 focus:ring-red-400/20' : ''}`}
            type="number"
            min="40"
            max="90"
            value={p.retirementAge}
            onChange={e => update('retirementAge', e.target.value === '' ? '' : parseInt(e.target.value))}
            placeholder="e.g. 65"
          />
          <FieldError msg={errors.retirementAge} />
        </div>
      </div>

      {/* Life expectancy slider */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0" htmlFor={`${personKey}-lifeExp`}>Life Expectancy</label>
          <span className="font-mono text-sm font-semibold text-gold-400">
            Age {p.lifeExpectancy ?? 90}
          </span>
        </div>
        <input
          id={`${personKey}-lifeExp`}
          type="range"
          min={70}
          max={105}
          step={1}
          value={p.lifeExpectancy ?? 90}
          onChange={e => update('lifeExpectancy', parseInt(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
          style={{
            background: (() => {
              const val = p.lifeExpectancy ?? 90
              const pct = ((val - 70) / (105 - 70)) * 100
              return `linear-gradient(to right, #e8a800 ${pct}%, #334155 ${pct}%)`
            })(),
          }}
        />
        <div className="flex justify-between mt-1">
          <span className="text-xs text-slate-700 font-mono">70</span>
          <span className="text-xs text-slate-600 italic">
            Used to calculate how long your money needs to last.
          </span>
          <span className="text-xs text-slate-700 font-mono">105</span>
        </div>
      </div>

      {/* Bridge / Part-Time Income — collapsible */}
      <BridgeIncomeSection personKey={personKey} />

      {/* Summary pill */}
      {yearsLeft !== null && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-3 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm">
          <span className="text-gold-400 mr-1">◈</span>
          <span className="font-medium text-slate-100">{p.name || label}</span>
          <span className="text-slate-400"> has </span>
          <span className="font-semibold text-gold-400">{yearsLeft} years</span>
          <span className="text-slate-400"> until retirement</span>
          {p.employmentStatus === 'employed' && p.income !== '' && (
            <>
              <span className="text-slate-400"> · earns </span>
              <span className="font-semibold text-gold-400">{formatCurrency(p.income)}</span>
              <span className="text-slate-400">/yr</span>
            </>
          )}
          {p.employmentStatus === 'not_yet_employed' && p.expectedStartingSalary !== '' && (
            <>
              <span className="text-slate-400"> · starts at </span>
              <span className="font-semibold text-gold-400">{formatCurrency(p.expectedStartingSalary)}</span>
              <span className="text-slate-400"> at age {p.expectedStartAge}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Spending section ─────────────────────────────────────────────────────────

function SpendingSection() {
  const { state, dispatch } = useStore()
  const { spending } = state

  const update = useCallback(
    (field, value) => dispatch({ type: ACTIONS.UPDATE_SPENDING, payload: { [field]: value } }),
    [dispatch]
  )

  const living = parseCurrency(spending.annualRetirementLiving) || 0
  const healthcare = parseCurrency(spending.annualRetirementHealthcare) || 0
  const totalRetirement = living + healthcare
  const preRetirement = parseCurrency(spending.annualPreRetirement) || 0
  const replacementRate = preRetirement > 0 && totalRetirement > 0
    ? Math.round((totalRetirement / preRetirement) * 100)
    : null

  return (
    <div className="card space-y-6">
      <div>
        <h2 className="section-title">Household Spending</h2>
        <p className="text-xs text-slate-500 mt-1">Annual figures — projections will apply inflation automatically.</p>
      </div>

      {/* Pre-retirement */}
      <div>
        <label className="label" htmlFor="spend-pre">
          Current Annual Spending
          <span className="ml-1.5 normal-case font-normal text-slate-600">(pre-retirement)</span>
        </label>
        <CurrencyInput
          id="spend-pre"
          value={spending.annualPreRetirement}
          onChange={v => update('annualPreRetirement', v)}
          placeholder="$0"
        />
        <p className="mt-1 text-xs text-slate-600">All regular household expenses: housing, food, transport, entertainment, etc.</p>
      </div>

      {/* Section label */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-800" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-slate-900 px-3 text-xs text-slate-500 uppercase tracking-wider">
            Expected spending in retirement
          </span>
        </div>
      </div>

      {/* Post-retirement */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="spend-living">Living Expenses</label>
          <CurrencyInput
            id="spend-living"
            value={spending.annualRetirementLiving}
            onChange={v => update('annualRetirementLiving', v)}
            placeholder="$0"
          />
          <p className="mt-1 text-xs text-slate-600">Housing, food, travel, leisure</p>
        </div>
        <div>
          <label className="label" htmlFor="spend-health">Healthcare &amp; Insurance</label>
          <CurrencyInput
            id="spend-health"
            value={spending.annualRetirementHealthcare}
            onChange={v => update('annualRetirementHealthcare', v)}
            placeholder="$0"
          />
          <p className="mt-1 text-xs text-slate-600">Premiums, out-of-pocket, long-term care</p>
        </div>
      </div>

      {/* Summary */}
      {totalRetirement > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-3 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Total retirement spending</span>
            <span className="font-mono font-semibold text-slate-100">
              {formatCurrency(totalRetirement)}
              <span className="text-slate-500 font-normal">/yr</span>
            </span>
          </div>

          {replacementRate !== null && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Income replacement rate</span>
                <span className={`font-mono font-semibold ${
                  replacementRate >= 70 && replacementRate <= 90
                    ? 'text-emerald-400'
                    : replacementRate > 90 ? 'text-gold-400' : 'text-red-400'
                }`}>
                  {replacementRate}%
                  <span className="ml-1.5 text-xs font-normal text-slate-500">
                    {replacementRate >= 70 && replacementRate <= 90
                      ? '✓ on target'
                      : replacementRate < 70
                      ? '↓ below typical'
                      : '↑ above typical'}
                  </span>
                </span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    replacementRate >= 70 && replacementRate <= 90
                      ? 'bg-emerald-400'
                      : replacementRate > 90 ? 'bg-gold-400' : 'bg-red-400'
                  }`}
                  style={{ width: `${Math.min(replacementRate, 120) / 120 * 100}%` }}
                />
              </div>
              <p className="text-xs text-slate-600">
                Most planners target 70–90% of pre-retirement income.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Household settings ───────────────────────────────────────────────────────

function HouseholdSection() {
  const { state, dispatch } = useStore()
  const { profile } = state

  const updateProfile = useCallback(
    (field, value) => dispatch({ type: ACTIONS.UPDATE_PROFILE, payload: { [field]: value } }),
    [dispatch]
  )

  return (
    <div className="card space-y-5">
      <div>
        <h2 className="section-title">Household Settings</h2>
        <p className="text-xs text-slate-500 mt-1">Global assumptions used across all projections.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="inflation">Inflation Rate</label>
          <PercentInput
            id="inflation"
            value={profile.inflationRate}
            onChange={v => updateProfile('inflationRate', v)}
            placeholder="3"
          />
          <p className="mt-1 text-xs text-slate-600">Long-run US average ≈ 3.0%</p>
        </div>
        <div>
          <label className="label" htmlFor="horizon">Plan Until Age</label>
          <input
            id="horizon"
            className="input"
            type="number"
            min="70"
            max="110"
            value={profile.planningHorizonAge}
            onChange={e => updateProfile('planningHorizonAge', parseInt(e.target.value) || '')}
            placeholder="95"
          />
        </div>
      </div>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function ProfileIncome() {
  const { state, dispatch } = useStore()
  const { profile } = state

  const togglePerson2 = () => dispatch({ type: ACTIONS.TOGGLE_PERSON2 })

  return (
    <div className="page-enter space-y-8 max-w-4xl">
      {/* Page header */}
      <div>
        <p className="text-xs font-medium text-gold-500 uppercase tracking-widest mb-1">Setup</p>
        <h1 className="page-title">Profile &amp; Income</h1>
        <p className="text-slate-400 text-sm mt-1">
          Your personal and income details are the foundation of every projection.
        </p>
      </div>

      {/* Person 1 */}
      <PersonSection personKey="person1" label="Person 1" badge="P1" />

      {/* Add spouse toggle */}
      <div className="card py-4">
        <Toggle
          checked={profile.includePerson2}
          onChange={togglePerson2}
          label="Include a spouse or partner"
          sublabel="Add a second person's income and retirement timeline to the plan"
        />
      </div>

      {/* Person 2 */}
      {profile.includePerson2 && (
        <div className="relative pl-1">
          <div className="absolute left-0 top-4 bottom-4 w-0.5 bg-gold-500/20 rounded-full" />
          <PersonSection personKey="person2" label="Person 2" badge="P2" />
        </div>
      )}

      {/* Spending */}
      <SpendingSection />

      {/* Household */}
      <HouseholdSection />

      {/* Footer */}
      <div className="flex items-center gap-2 text-xs text-slate-600 pb-6">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
        All changes are saved automatically to your browser
      </div>
    </div>
  )
}
