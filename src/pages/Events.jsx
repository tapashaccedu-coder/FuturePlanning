import { useState, useCallback } from 'react'
import { useStore, ACTIONS, genId } from '../store'
import NoteField from '../components/NoteField'

// ─── Constants ────────────────────────────────────────────────────────────────

const EVENT_TYPES = [
  {
    value: 'large_expense',
    label: 'Large Expense',
    description: 'One-time cost (home repair, tuition, medical)',
    defaultSign: -1,
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/25',
    badgeBg: 'bg-red-500/15 text-red-400',
    dot: 'bg-red-400',
    icon: '↓',
  },
  {
    value: 'windfall',
    label: 'Windfall',
    description: 'Inheritance, bonus, insurance payout, asset sale',
    defaultSign: 1,
    color: 'text-gold-400',
    bg: 'bg-gold-500/10 border-gold-500/25',
    badgeBg: 'bg-gold-500/15 text-gold-400',
    dot: 'bg-gold-400',
    icon: '↑',
  },
  {
    value: 'income_change',
    label: 'Income Change',
    description: 'Career break, part-time shift, new job (use +/−)',
    defaultSign: 1,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10 border-cyan-500/25',
    badgeBg: 'bg-cyan-500/15 text-cyan-400',
    dot: 'bg-cyan-400',
    icon: '⇄',
  },
]

function getTypeMeta(value) {
  return EVENT_TYPES.find(t => t.value === value) || EVENT_TYPES[0]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCurrency(val) {
  if (val === '' || val === null || val === undefined) return ''
  const n = parseFloat(String(val).replace(/[$,\-]/g, ''))
  return isNaN(n) ? '' : n
}

function formatCurrency(val, { signed = false } = {}) {
  if (val === '' || val === null || val === undefined) return ''
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[$,]/g, ''))
  if (isNaN(n)) return ''
  const abs = Math.abs(n)
  const fmt = '$' + abs.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (signed) return n >= 0 ? '+' + fmt : '−' + fmt
  return fmt
}

function formatMonthly(val) {
  if (val === '' || val === null || val === undefined) return ''
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[$,]/g, ''))
  if (isNaN(n)) return ''
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }) + '/mo'
}

// Derive calendar year from person1 age at event
function ageToYear(currentAge, currentYear, eventAge) {
  if (currentAge === '' || eventAge === '') return null
  return currentYear + (eventAge - currentAge)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CurrencyInput({ value, onChange, placeholder = '$0', id, allowNegative = false }) {
  const [focused, setFocused] = useState(false)

  const numVal = typeof value === 'number' ? value : parseFloat(String(value || '').replace(/[$,]/g, ''))
  const display = focused
    ? (value === '' || value === null ? '' : String(value))
    : (isNaN(numVal) || value === '' ? '' : formatCurrency(numVal, { signed: allowNegative && numVal !== 0 }))

  return (
    <input
      id={id}
      className="input"
      value={display}
      placeholder={focused ? (allowNegative ? 'e.g. −50000 or 50000' : '0') : placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={e => {
        const raw = e.target.value.replace(/[$,+]/g, '').replace('−', '-')
        if (raw === '' || raw === '-' || /^-?\d*\.?\d*$/.test(raw)) {
          const n = parseFloat(raw)
          onChange(isNaN(n) ? (raw === '-' ? '-' : '') : n)
        }
      }}
    />
  )
}

function AgeSlider({ value, onChange, min, max, label }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="label mb-0">{label}</label>
        <span className="font-mono text-gold-400 font-semibold text-sm">Age {value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-gold-500"
        style={{
          background: `linear-gradient(to right, #e8a800 0%, #e8a800 ${((value - min) / (max - min)) * 100}%, #334155 ${((value - min) / (max - min)) * 100}%, #334155 100%)`
        }}
      />
      <div className="flex justify-between text-xs text-slate-600">
        <span>{min}</span>
        <span className="text-slate-700">|</span>
        <span>Full retirement age</span>
        <span className="text-slate-700">|</span>
        <span>{max}</span>
      </div>
    </div>
  )
}

// SS benefit at a given claiming age using SSA bend-point approximation
function estimateBenefitAtAge(monthlyBenefit, claimingAge) {
  if (!monthlyBenefit || monthlyBenefit === '') return null
  const base = parseFloat(monthlyBenefit)
  if (isNaN(base) || base <= 0) return null
  // FRA assumed at 67; -5%/yr before, +8%/yr after
  const delta = claimingAge - 67
  const factor = delta < 0 ? 1 + delta * 0.05 : 1 + delta * 0.08
  return Math.round(base * factor)
}

// ─── Social Security Person Card ──────────────────────────────────────────────

function SSPersonCard({ personKey, label }) {
  const { state, dispatch } = useStore()
  const ss = state.socialSecurity[personKey]
  const profile = state.profile[personKey]

  const update = useCallback(
    (data) => dispatch({ type: ACTIONS.UPDATE_SOCIAL_SECURITY, payload: { person: personKey, data } }),
    [dispatch, personKey]
  )

  const [benefitFocused, setBenefitFocused] = useState(false)

  const adjustedBenefit = estimateBenefitAtAge(ss.monthlyBenefit, ss.claimingAge)
  const fraAdjusted = estimateBenefitAtAge(ss.monthlyBenefit, 67)
  const annualBenefit = adjustedBenefit ? adjustedBenefit * 12 : null

  const benefitDisplay = benefitFocused
    ? (ss.monthlyBenefit === '' ? '' : String(ss.monthlyBenefit))
    : formatMonthly(ss.monthlyBenefit)

  // Break-even hint
  const breakEvenHint = (() => {
    if (ss.claimingAge === 67) return null
    if (ss.claimingAge < 67) {
      const monthsEarly = (67 - ss.claimingAge) * 12
      const extraMonthly = (fraAdjusted || 0) - (adjustedBenefit || 0)
      if (extraMonthly <= 0) return null
      const breakEvenMonths = Math.round(((fraAdjusted || 0) * monthsEarly) / extraMonthly)
      const breakEvenAge = Math.round(ss.claimingAge + breakEvenMonths / 12)
      return `Claiming early breaks even at approximately age ${breakEvenAge}`
    }
    if (ss.claimingAge > 67) {
      const monthsDelayed = (ss.claimingAge - 67) * 12
      const extraMonthly = (adjustedBenefit || 0) - (fraAdjusted || 0)
      if (extraMonthly <= 0) return null
      const breakEvenMonths = Math.round(((fraAdjusted || 0) * monthsDelayed) / extraMonthly)
      const breakEvenAge = Math.round(ss.claimingAge + breakEvenMonths / 12)
      return `Delaying to ${ss.claimingAge} breaks even at approximately age ${breakEvenAge}`
    }
    return null
  })()

  return (
    <div className="card space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gold-500/10 border border-gold-500/25 flex items-center justify-center shrink-0">
          <span className="text-gold-400 text-xs font-bold font-mono">{personKey === 'person1' ? 'P1' : 'P2'}</span>
        </div>
        <h3 className="section-title">{profile.name || label}</h3>
      </div>

      {/* Estimated benefit input */}
      <div>
        <label className="label" htmlFor={`${personKey}-ss-benefit`}>
          Estimated Monthly Benefit
          <span className="ml-1.5 normal-case font-normal text-slate-600">(today's dollars, at full retirement age)</span>
        </label>
        <input
          id={`${personKey}-ss-benefit`}
          className="input"
          value={benefitDisplay}
          placeholder="$0/mo"
          onFocus={() => setBenefitFocused(true)}
          onBlur={() => setBenefitFocused(false)}
          onChange={e => {
            const raw = e.target.value.replace(/[$,\/a-zA-Z\s]/g, '')
            if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
              update({ monthlyBenefit: raw === '' ? '' : parseFloat(raw) || raw })
            }
          }}
        />
        <p className="mt-1 text-xs text-slate-600">
          Find this on your{' '}
          <a
            href="https://www.ssa.gov/myaccount/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gold-500/70 hover:text-gold-400 underline underline-offset-2"
          >
            SSA.gov My Account
          </a>
          {' '}statement under "Your Benefits at Full Retirement Age"
        </p>
      </div>

      {/* Claiming age slider */}
      <AgeSlider
        label="Claiming Age"
        value={ss.claimingAge}
        min={62}
        max={70}
        onChange={v => update({ claimingAge: v })}
      />

      {/* Adjusted benefit preview */}
      {adjustedBenefit !== null && (
        <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg px-4 py-3 space-y-2.5">
          {/* Comparison row */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {[62, 67, 70].map(age => {
              const benefit = estimateBenefitAtAge(ss.monthlyBenefit, age)
              const isSelected = ss.claimingAge === age
              return (
                <button
                  key={age}
                  onClick={() => update({ claimingAge: age })}
                  className={`rounded-lg py-2 px-1 text-xs transition-all duration-150 border ${
                    isSelected
                      ? 'bg-gold-500/20 border-gold-500/40 text-gold-400'
                      : 'bg-slate-900/60 border-slate-700/50 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <div className={`font-mono font-semibold text-sm mb-0.5 ${isSelected ? 'text-gold-400' : 'text-slate-400'}`}>
                    {formatMonthly(benefit)}
                  </div>
                  <div>Age {age}{age === 67 ? ' (FRA)' : ''}</div>
                </button>
              )
            })}
          </div>

          {/* Selected summary */}
          <div className="pt-1 border-t border-slate-700/40 flex items-center justify-between text-xs">
            <span className="text-slate-500">
              At age {ss.claimingAge}:{' '}
              <span className={ss.claimingAge < 67 ? 'text-red-400' : ss.claimingAge > 67 ? 'text-emerald-400' : 'text-slate-400'}>
                {ss.claimingAge < 67
                  ? `${Math.round((1 - adjustedBenefit / (fraAdjusted || 1)) * 100)}% less than FRA`
                  : ss.claimingAge > 67
                  ? `${Math.round((adjustedBenefit / (fraAdjusted || 1) - 1) * 100)}% more than FRA`
                  : 'Full retirement age'}
              </span>
            </span>
            <span className="text-slate-400 font-medium">
              {formatCurrency(annualBenefit)}/yr
            </span>
          </div>

          {/* Break-even hint */}
          {breakEvenHint && (
            <p className="text-xs text-slate-600 italic">{breakEvenHint}</p>
          )}
        </div>
      )}

      {/* Note */}
      <NoteField noteKey={`ss_${personKey}`} placeholder={`Notes about ${label}'s Social Security strategy or claiming decision…`} />
    </div>
  )
}

// ─── Event Card ───────────────────────────────────────────────────────────────

function EventCard({ event, onDelete }) {
  const [expanded, setExpanded] = useState(event.name === '')
  const { state, dispatch } = useStore()

  const update = useCallback(
    (field, value) =>
      dispatch({ type: ACTIONS.UPDATE_EVENT, payload: { id: event.id, [field]: value } }),
    [dispatch, event.id]
  )

  const typeMeta = getTypeMeta(event.type)
  const person1Age = state.profile.person1.age
  const currentYear = new Date().getFullYear()
  const eventYear = ageToYear(person1Age, currentYear, event.person1Age)

  const amountIsNegative = typeof event.amount === 'number' && event.amount < 0
  const amountAbs = event.amount !== '' && event.amount !== null ? Math.abs(event.amount) : ''

  return (
    <div className={`rounded-xl border overflow-hidden transition-all duration-150 bg-slate-900 hover:border-slate-700 ${
      expanded ? 'border-slate-700' : 'border-slate-800'
    }`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4">
        {/* Type icon */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border shrink-0 ${typeMeta.bg}`}>
          <span className={typeMeta.color}>{typeMeta.icon}</span>
        </div>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${event.name ? 'text-slate-100' : 'text-slate-600 italic'}`}>
            {event.name || 'Unnamed event'}
          </p>
          {!expanded && (
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {event.person1Age !== '' && (
                <span className="text-xs text-slate-500">
                  Age {event.person1Age}
                  {eventYear && <span className="text-slate-600"> ({eventYear})</span>}
                </span>
              )}
              {event.amount !== '' && event.amount !== null && (
                <span className={`text-xs font-mono font-medium ${
                  (typeof event.amount === 'number' ? event.amount : 0) >= 0
                    ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {formatCurrency(event.amount, { signed: true })}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className={`badge text-xs ${typeMeta.badgeBg}`}>{typeMeta.label}</span>
          <button onClick={() => setExpanded(e => !e)} className="btn-ghost py-1.5 px-2.5 text-xs ml-1">
            {expanded ? 'Collapse' : 'Edit'}
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            title="Delete event"
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
              <label className="label">Event Name</label>
              <input
                className="input"
                value={event.name}
                onChange={e => update('name', e.target.value)}
                placeholder="e.g. Roof replacement"
              />
            </div>
            <div>
              <label className="label">Event Type</label>
              <div className="flex flex-col gap-1.5">
                {EVENT_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => update('type', t.value)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs text-left transition-all duration-150 ${
                      event.type === t.value
                        ? `${t.bg} ${t.color}`
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                    }`}
                  >
                    <span className="font-bold w-3 text-center">{t.icon}</span>
                    <div>
                      <div className="font-medium">{t.label}</div>
                      <div className="text-slate-600 text-xs">{t.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Age + Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">
                {event.type === 'income_change' ? 'Start Age (P1)' : 'Person 1\'s Age When This Occurs'}
              </label>
              <input
                className="input"
                type="number"
                min="1"
                max="120"
                value={event.person1Age}
                onChange={e => update('person1Age', e.target.value === '' ? '' : parseInt(e.target.value))}
                placeholder="e.g. 55"
              />
              {eventYear && event.person1Age !== '' && (
                <p className="mt-1 text-xs text-slate-600">
                  Calendar year: <span className="text-slate-500">{eventYear}</span>
                </p>
              )}
            </div>
            <div>
              <label className="label">
                Amount
                <span className="ml-1.5 normal-case font-normal text-slate-600">
                  {event.type === 'income_change' ? '(per year, today\'s dollars)' : '(today\'s dollars)'}
                </span>
              </label>
              <div className="space-y-2">
                {/* Sign toggle */}
                <div className="flex gap-2">
                  {[
                    { sign: 1, label: event.type === 'income_change' ? '+ Extra Income' : '+ Money In', cls: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
                    { sign: -1, label: event.type === 'income_change' ? '− Pay Cut' : '− Money Out', cls: 'text-red-400 border-red-500/30 bg-red-500/10' },
                  ].map(opt => {
                    const isActive = amountIsNegative ? opt.sign === -1 : opt.sign === 1
                    return (
                      <button
                        key={opt.sign}
                        type="button"
                        onClick={() => {
                          if (amountAbs !== '') {
                            update('amount', opt.sign * Math.abs(amountAbs))
                          }
                          if (typeof event.amount === 'number') {
                            update('amount', opt.sign * Math.abs(event.amount))
                          }
                        }}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all duration-150 ${
                          isActive ? opt.cls : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
                <input
                  className="input"
                  type="text"
                  value={amountAbs === '' ? '' : formatCurrency(amountAbs)}
                  placeholder="$0"
                  onFocus={e => { e.target.value = amountAbs === '' ? '' : String(amountAbs) }}
                  onBlur={e => {}}
                  onChange={e => {
                    const raw = e.target.value.replace(/[$,]/g, '')
                    if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
                      const n = raw === '' ? '' : parseFloat(raw)
                      const sign = amountIsNegative ? -1 : 1
                      update('amount', n === '' ? '' : sign * n)
                    }
                  }}
                />
              </div>
              {event.amount !== '' && event.amount !== null && (
                <p className={`mt-1.5 text-xs font-medium ${
                  (typeof event.amount === 'number' ? event.amount : 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {formatCurrency(event.amount, { signed: true })} {event.type === 'income_change' ? 'per year' : 'in today\'s dollars'}
                </p>
              )}
            </div>
          </div>

          {/* End Age — only for income_change */}
          {event.type === 'income_change' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">
                  End Age (P1)
                  <span className="ml-1.5 normal-case font-normal text-slate-600">optional</span>
                </label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="120"
                  value={event.endAge ?? ''}
                  onChange={e => update('endAge', e.target.value === '' ? null : parseInt(e.target.value))}
                  placeholder="Leave blank = until retirement"
                />
                <p className="mt-1 text-xs text-slate-600">
                  Leave blank to apply until retirement
                </p>
              </div>
              <div className="flex items-end pb-1">
                {event.person1Age !== '' && event.amount !== '' && event.amount !== null && (
                  <div className="w-full bg-cyan-500/8 border border-cyan-500/20 rounded-lg px-3 py-2.5">
                    <p className="text-xs text-cyan-400/80 font-medium">Recurring every year</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      {formatCurrency(event.amount, { signed: true })}/yr from age {event.person1Age}
                      {event.endAge ? ` to age ${event.endAge}` : ' until retirement'}
                      {', inflating with CPI'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Note */}
          <NoteField noteKey={`event_${event.id}`} placeholder={`Notes about "${event.name || 'this event'}" — purpose, assumptions, source…`} />
        </div>
      )}
    </div>
  )
}

// ─── Events Summary Table ─────────────────────────────────────────────────────

function EventsSummaryTable({ events }) {
  const { state } = useStore()
  const person1Age = state.profile.person1.age
  const currentYear = new Date().getFullYear()

  if (events.length === 0) return null

  const sorted = [...events]
    .filter(e => e.name || e.amount !== '')
    .sort((a, b) => {
      const aAge = parseInt(a.person1Age) || 999
      const bAge = parseInt(b.person1Age) || 999
      return aAge - bAge
    })

  if (sorted.length === 0) return null

  const netTotal = sorted.reduce((sum, e) => sum + (typeof e.amount === 'number' ? e.amount : 0), 0)

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="section-title">Chronological Summary</h3>
        <span className="text-xs text-slate-500">{sorted.length} event{sorted.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm min-w-[420px]">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left py-2 px-2 text-xs font-medium text-slate-500 uppercase tracking-wider w-20">Age / Year</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Event</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-slate-500 uppercase tracking-wider w-28">Type</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-slate-500 uppercase tracking-wider w-32">Amount</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((evt, i) => {
              const typeMeta = getTypeMeta(evt.type)
              const evtYear = ageToYear(person1Age, currentYear, evt.person1Age)
              const amt = typeof evt.amount === 'number' ? evt.amount : null
              return (
                <tr
                  key={evt.id}
                  className={`border-b border-slate-800/60 transition-colors hover:bg-slate-800/30 ${
                    i === sorted.length - 1 ? 'border-b-0' : ''
                  }`}
                >
                  <td className="py-3 px-2">
                    <div className="font-mono text-slate-300 text-xs font-medium">
                      {evt.person1Age !== '' ? `Age ${evt.person1Age}` : '—'}
                    </div>
                    {evtYear && (
                      <div className="font-mono text-slate-600 text-xs">{evtYear}</div>
                    )}
                  </td>
                  <td className="py-3 px-2">
                    <div className="text-slate-200 text-sm">{evt.name || <em className="text-slate-600">Unnamed</em>}</div>
                    {evt.type === 'income_change' && evt.person1Age !== '' && (
                      <div className="text-xs text-cyan-400/60 mt-0.5">
                        age {evt.person1Age}{evt.endAge ? `–${evt.endAge}` : ' → retirement'}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-2">
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${typeMeta.dot}`} />
                      <span className="text-slate-400">{typeMeta.label}</span>
                    </span>
                  </td>
                  <td className={`py-3 px-2 text-right font-mono text-sm font-semibold ${
                    amt === null ? 'text-slate-600' :
                    amt >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {amt !== null ? formatCurrency(amt, { signed: true }) : '—'}
                    {evt.type === 'income_change' && amt !== null && (
                      <div className="text-xs font-normal text-cyan-400/60">/yr</div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {sorted.length > 1 && (
            <tfoot>
              <tr className="border-t border-slate-700">
                <td colSpan={3} className="py-2.5 px-2 text-xs text-slate-500 font-medium">Net total (today's dollars)</td>
                <td className={`py-2.5 px-2 text-right font-mono text-sm font-bold ${
                  netTotal >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {formatCurrency(netTotal, { signed: true })}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// ─── Surviving Spouse Scenario ────────────────────────────────────────────────

function SurvivingSpouseSection() {
  const { state, dispatch } = useStore()
  const { survivingSpouse, profile } = state
  const ss = survivingSpouse ?? {
    enabled: false, whoPassesKey: 'person2',
    ageOfPerson1WhenItOccurs: 75, spendingFactor: 0.75,
  }

  const [open, setOpen] = useState(false)

  const update = useCallback(
    (data) => dispatch({ type: ACTIONS.UPDATE_SURVIVING_SPOUSE, payload: data }),
    [dispatch]
  )

  const p1Name   = profile.person1.name || 'Person 1'
  const p2Name   = profile.person2.name || 'Person 2'
  const p1Age    = parseInt(profile.person1.age) || 40
  const minAge   = Math.min(p1Age + 5, 95)
  const eventAge = ss.ageOfPerson1WhenItOccurs ?? 75
  const factor   = ss.spendingFactor ?? 0.75
  const factorPct = Math.round(factor * 100)

  // Survivor is the person who does NOT pass
  const survivorName = ss.whoPassesKey === 'person2' ? p1Name : p2Name

  return (
    <div className="rounded-xl border border-slate-700/60 overflow-hidden">
      {/* Header / toggle */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors ${
          ss.enabled
            ? 'bg-red-500/8 hover:bg-red-500/12'
            : 'bg-slate-800/50 hover:bg-slate-800/70'
        }`}
      >
        <div className="flex items-center gap-3">
          {/* Toggle pill */}
          <div
            onClick={e => { e.stopPropagation(); update({ enabled: !ss.enabled }) }}
            className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer shrink-0 ${
              ss.enabled ? 'bg-red-500/80' : 'bg-slate-600'
            }`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              ss.enabled ? 'translate-x-4' : 'translate-x-0.5'
            }`} />
          </div>
          <div>
            <span className={`text-sm font-semibold ${ss.enabled ? 'text-red-300' : 'text-slate-300'}`}>
              Surviving Spouse Scenario
            </span>
            {ss.enabled && (
              <p className="text-xs text-slate-500 mt-0.5">
                {ss.whoPassesKey === 'person2' ? p2Name : p1Name} passes at P1 age {eventAge} ·{' '}
                {survivorName} spends {factorPct}% of couple's budget
              </p>
            )}
          </div>
        </div>
        <svg
          viewBox="0 0 16 16"
          className={`w-4 h-4 fill-slate-500 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M7.247 11.14L2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z"/>
        </svg>
      </button>

      {/* Expandable body */}
      {open && (
        <div className="px-5 py-5 bg-slate-900/70 border-t border-slate-700/60 space-y-5">
          {/* SS survivor benefit callout */}
          <div className="flex items-start gap-3 bg-slate-800/70 border border-slate-700/50 rounded-lg px-4 py-3">
            <span className="text-emerald-400 shrink-0 mt-0.5">ℹ</span>
            <p className="text-xs text-slate-400 leading-relaxed">
              The surviving spouse receives the <strong className="text-slate-300">higher</strong> of the two
              Social Security benefits — the lower benefit stops. This follows the IRS survivor benefit rule.
            </p>
          </div>

          {/* Who passes radio */}
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
              Who passes away
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'person1', label: p1Name },
                { key: 'person2', label: p2Name },
              ].map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => update({ whoPassesKey: opt.key })}
                  className={`py-2.5 px-4 rounded-lg border text-sm font-medium transition-all ${
                    ss.whoPassesKey === opt.key
                      ? 'bg-red-500/15 border-red-500/40 text-red-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {!profile.includePerson2 && (
              <p className="mt-1.5 text-xs text-amber-400/70">
                ⚠ Person 2 is not included in the plan. Enable them on the Profile tab first.
              </p>
            )}
          </div>

          {/* Age slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                When it occurs (P1's age)
              </label>
              <span className="font-mono text-sm font-semibold text-slate-200">
                Age {eventAge}
              </span>
            </div>
            <input
              type="range"
              min={minAge}
              max={95}
              step={1}
              value={eventAge}
              onChange={e => update({ ageOfPerson1WhenItOccurs: parseInt(e.target.value) })}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{
                background: (() => {
                  const p = ((eventAge - minAge) / (95 - minAge)) * 100
                  return `linear-gradient(to right, #f87171 ${p}%, #334155 ${p}%)`
                })(),
              }}
            />
            <div className="flex justify-between mt-1 text-xs text-slate-700 font-mono">
              <span>{minAge}</span>
              <span>95</span>
            </div>
          </div>

          {/* Spending factor slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Surviving spouse spending
              </label>
              <span className="font-mono text-sm font-semibold text-slate-200">
                {factorPct}% of couple's budget
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={100}
              step={5}
              value={factorPct}
              onChange={e => update({ spendingFactor: parseInt(e.target.value) / 100 })}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{
                background: (() => {
                  const p = ((factorPct - 50) / 50) * 100
                  return `linear-gradient(to right, #e8a800 ${p}%, #334155 ${p}%)`
                })(),
              }}
            />
            <div className="flex justify-between mt-1 text-xs text-slate-600">
              <span className="font-mono">50%</span>
              <span className="italic">Typical range: 70–80%</span>
              <span className="font-mono">100%</span>
            </div>
          </div>

          {/* Live preview */}
          {ss.enabled && (
            <div className="bg-red-500/8 border border-red-500/20 rounded-lg px-4 py-3">
              <p className="text-xs font-semibold text-red-300 mb-1">Scenario active — impact on projection</p>
              <ul className="text-xs text-slate-400 space-y-1 leading-relaxed">
                <li>• From P1 age {eventAge}: {ss.whoPassesKey === 'person2' ? p2Name : p1Name}'s salary and SS stop</li>
                <li>• {survivorName} keeps the higher of the two SS benefits</li>
                <li>• Household spending reduced to {factorPct}% of current budget</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Events() {
  const { state, dispatch } = useStore()
  const { futureEvents, profile } = state

  const addEvent = () => {
    dispatch({
      type: ACTIONS.ADD_EVENT,
      payload: {
        id: genId('evt'),
        name: '',
        type: 'large_expense',
        person1Age: '',
        amount: '',
      },
    })
  }

  const removeEvent = (id) => dispatch({ type: ACTIONS.REMOVE_EVENT, payload: id })

  const sortedEvents = [...futureEvents].sort((a, b) => {
    const aAge = parseInt(a.person1Age) || 9999
    const bAge = parseInt(b.person1Age) || 9999
    return aAge - bAge
  })

  const p2Included = profile.includePerson2

  return (
    <div className="page-enter space-y-10 max-w-4xl mx-auto">

      {/* ── SOCIAL SECURITY ─────────────────────────────────────── */}
      <section className="space-y-6">
        <div>
          <p className="text-xs font-medium text-gold-500 uppercase tracking-widest mb-1">Guaranteed Income</p>
          <h1 className="page-title">Social Security</h1>
          <p className="text-slate-400 text-sm mt-1">
            Enter your estimated benefit in today's dollars.{' '}
            <span className="text-slate-500">Projections automatically adjust for inflation over time.</span>
          </p>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-3 bg-slate-800/60 border border-slate-700/60 rounded-lg px-4 py-3">
          <span className="text-gold-500 mt-0.5 shrink-0">ℹ</span>
          <p className="text-xs text-slate-400 leading-relaxed">
            Benefits shown are in <strong className="text-slate-300">today's dollars</strong> — find your estimate on{' '}
            <a href="https://www.ssa.gov/myaccount/" target="_blank" rel="noopener noreferrer" className="text-gold-500/80 hover:text-gold-400 underline underline-offset-2">
              SSA.gov
            </a>{' '}
            under "Your Benefits at Full Retirement Age (67)." The comparison cards below show how your monthly amount changes based on when you claim.
          </p>
        </div>

        <SSPersonCard personKey="person1" label="Person 1" />
        {p2Included && <SSPersonCard personKey="person2" label="Person 2" />}
        {!p2Included && (
          <div className="flex items-center gap-2 text-xs text-slate-600 px-1">
            <span>◦</span>
            <span>To add Person 2's Social Security, first enable them on the <strong className="text-slate-500">Profile &amp; Income</strong> tab.</span>
          </div>
        )}
      </section>

      {/* ── FUTURE EVENTS ───────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-gold-500 uppercase tracking-widest mb-1">Planning</p>
            <h2 className="page-title">Future Events</h2>
            <p className="text-slate-400 text-sm mt-1">
              Major one-time events that will affect your cash flow. All amounts in today's dollars.
            </p>
          </div>
          <button onClick={addEvent} className="btn-primary shrink-0 mt-1">
            + Add Event
          </button>
        </div>

        {/* Event cards */}
        {futureEvents.length === 0 ? (
          <div className="border border-dashed border-slate-700 rounded-xl flex flex-col items-center justify-center py-14 gap-3">
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-2xl text-slate-700">◐</div>
            <p className="text-slate-400 font-medium">No events added yet</p>
            <p className="text-slate-600 text-sm text-center max-w-xs">
              Add college tuition, home purchases, inheritances, sabbaticals, medical costs, and more.
            </p>
            <button onClick={addEvent} className="btn-primary mt-1">+ Add your first event</button>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedEvents.map(evt => (
              <EventCard key={evt.id} event={evt} onDelete={() => removeEvent(evt.id)} />
            ))}
            <button
              onClick={addEvent}
              className="w-full py-3 border border-dashed border-slate-700 hover:border-slate-500 rounded-xl text-sm text-slate-500 hover:text-slate-300 transition-colors duration-150"
            >
              + Add another event
            </button>
          </div>
        )}

        {/* Summary table */}
        <EventsSummaryTable events={futureEvents} />
      </section>

      {/* ── SURVIVING SPOUSE SCENARIO ───────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <p className="text-xs font-medium text-gold-500 uppercase tracking-widest mb-1">Risk Scenario</p>
          <h2 className="page-title">Surviving Spouse</h2>
          <p className="text-slate-400 text-sm mt-1">
            Model the financial impact if one partner passes away — adjusts income, Social Security, and spending automatically.
          </p>
        </div>
        <SurvivingSpouseSection />
      </section>

      {/* Footer */}
      <div className="flex items-center gap-2 text-xs text-slate-600 pb-6">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
        All changes are saved automatically to your browser
      </div>
    </div>
  )
}
