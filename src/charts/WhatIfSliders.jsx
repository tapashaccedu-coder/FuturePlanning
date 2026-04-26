import { useState, useMemo, useCallback } from 'react'
import { useStore } from '../store'
import { useWhatIf, applyOverrides } from '../store/whatif'
import { simulate, summarize } from '../engine/simulate'
import WealthBuildChart from './WealthBuildChart'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function num(val, fallback = 0) {
  if (val === '' || val === null || val === undefined) return fallback
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[$,%]/g, ''))
  return isNaN(n) ? fallback : n
}

function fmtPct(v) {
  return v % 1 === 0 ? `${v}%` : `${v.toFixed(1)}%`
}

function fmtAge(v) { return `Age ${v}` }

function fmtFactor(v) {
  if (v === 1) return 'No change'
  const pct = Math.round((v - 1) * 100)
  return pct > 0 ? `+${pct}%` : `${pct}%`
}

function fmtContrib(v) {
  if (v === 1) return 'No change'
  const pct = Math.round((v - 1) * 100)
  return pct > 0 ? `+${pct}% contributions` : `${pct}% contributions`
}

// ─── Slider row ───────────────────────────────────────────────────────────────

function SliderRow({ label, sublabel, min, max, step, value, onChange, format, defaultValue, accent }) {
  const isOverridden = value !== null && value !== defaultValue
  const displayVal   = value !== null ? value : defaultValue
  const trackPct     = ((displayVal - min) / (max - min)) * 100

  return (
    <div className={`rounded-lg px-4 py-3 transition-colors ${
      isOverridden
        ? 'bg-gold-500/8 border border-gold-500/20'
        : 'bg-slate-800/50 border border-slate-800'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isOverridden && (
            <span className="w-1.5 h-1.5 rounded-full bg-gold-400 shrink-0" />
          )}
          <div>
            <span className="text-sm font-medium text-slate-200">{label}</span>
            {sublabel && <span className="ml-1.5 text-xs text-slate-600">{sublabel}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`font-mono text-sm font-semibold tabular-nums ${
            isOverridden ? 'text-gold-400' : 'text-slate-400'
          }`}>
            {format(displayVal)}
          </span>
          {isOverridden && (
            <button
              onClick={() => onChange(null)}
              className="text-slate-600 hover:text-slate-400 transition-colors text-xs leading-none"
              title="Reset this slider"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Track */}
      <div className="relative h-5 flex items-center">
        {/* Background track */}
        <div className="absolute inset-x-0 h-1.5 bg-slate-700 rounded-full" />

        {/* Default marker */}
        {defaultValue !== null && (
          <div
            className="absolute w-0.5 h-3 bg-slate-500 rounded-full -translate-x-px pointer-events-none z-10"
            style={{ left: `${((defaultValue - min) / (max - min)) * 100}%` }}
            title={`Default: ${format(defaultValue)}`}
          />
        )}

        {/* Active fill */}
        <div
          className={`absolute h-1.5 rounded-full transition-all pointer-events-none ${
            isOverridden ? 'bg-gold-500' : 'bg-slate-600'
          }`}
          style={{ width: `${trackPct}%` }}
        />

        {/* Range input */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={displayVal}
          onChange={e => {
            const v = parseFloat(e.target.value)
            onChange(v === defaultValue ? null : v)
          }}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full z-20"
        />

        {/* Thumb visual */}
        <div
          className={`absolute w-4 h-4 rounded-full border-2 border-slate-950 shadow-lg -translate-x-1/2 pointer-events-none transition-colors ${
            isOverridden ? 'bg-gold-400' : 'bg-slate-500'
          }`}
          style={{ left: `${trackPct}%`, zIndex: 21 }}
        />
      </div>

      {/* Min/max labels */}
      <div className="flex justify-between mt-0.5">
        <span className="text-xs text-slate-700 font-mono">{format(min)}</span>
        <span className="text-xs text-slate-700 font-mono">{format(max)}</span>
      </div>
    </div>
  )
}

// ─── Impact delta badge ───────────────────────────────────────────────────────

function ImpactBadge({ baseValue, overrideValue, label }) {
  if (baseValue == null || overrideValue == null || baseValue === overrideValue) return null
  const delta = overrideValue - baseValue
  const pct   = baseValue !== 0 ? (delta / baseValue) * 100 : 0
  const isPos = delta > 0
  const fmt   = (n) => {
    if (Math.abs(n) >= 1_000_000) return (isPos ? '+' : '') + '$' + (n / 1_000_000).toFixed(1) + 'M'
    if (Math.abs(n) >= 1_000)    return (isPos ? '+' : '') + '$' + (n / 1_000).toFixed(0) + 'k'
    return (isPos ? '+' : '') + '$' + Math.round(n).toLocaleString()
  }
  return (
    <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${
      isPos
        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
        : 'bg-red-500/10 border-red-500/20 text-red-400'
    }`}>
      <span>{isPos ? '▲' : '▼'}</span>
      <span className="font-medium">{label}: {fmt(delta)}</span>
      <span className="opacity-60">({isPos ? '+' : ''}{pct.toFixed(1)}%)</span>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function WhatIfSliders() {
  const { state } = useStore()
  const { overrides, setOverride, resetAll, compareToBase, setCompareToBase, hasAnyOverride } = useWhatIf()
  const [open, setOpen] = useState(false)

  // ── Base values from state ────────────────────────────────────────────────
  const p1Age       = num(state.profile.person1.age, 30)
  const p1RetAge    = num(state.profile.person1.retirementAge, 65)
  const p1LifeExp   = num(state.profile.person1.lifeExpectancy, 90)
  const p2Age       = num(state.profile.person2.age, 28)
  const p2RetAge    = num(state.profile.person2.retirementAge, 65)
  const inflRate    = num(state.profile.inflationRate, 3)

  // Weighted average growth rate across accounts
  const totalBal = state.accounts.reduce((s, a) => s + num(a.balance), 0)
  const weightedGrowth = totalBal > 0
    ? state.accounts.reduce((s, a) => s + (num(a.balance) / totalBal) * num(a.annualGrowthRate, 7), 0)
    : 7

  // ── Build override state ──────────────────────────────────────────────────
  const overrideState = useMemo(
    () => applyOverrides(state, overrides),
    [state, overrides]
  )

  // ── Simulate both ─────────────────────────────────────────────────────────
  const baseLedger     = useMemo(() => simulate(state), [state])
  const overrideLedger = useMemo(() => simulate(overrideState), [overrideState])
  const baseStats      = useMemo(() => summarize(baseLedger), [baseLedger])
  const overrideStats  = useMemo(() => summarize(overrideLedger), [overrideLedger])

  // ── Slider config ─────────────────────────────────────────────────────────
  const sliders = [
    {
      key:     'growthRateOverride',
      label:   'Portfolio Growth Rate',
      sublabel: 'applies to all accounts',
      min: 0, max: 12, step: 0.25,
      defaultValue: parseFloat(weightedGrowth.toFixed(2)),
      format:  fmtPct,
    },
    {
      key:     'p1RetirementAge',
      label:   `${state.profile.person1.name || 'Person 1'} Retirement Age`,
      min:     p1Age + 1, max: 80, step: 1,
      defaultValue: p1RetAge,
      format:  fmtAge,
    },
    ...(state.profile.includePerson2 ? [{
      key:     'p2RetirementAge',
      label:   `${state.profile.person2.name || 'Person 2'} Retirement Age`,
      min:     p2Age + 1, max: 80, step: 1,
      defaultValue: p2RetAge,
      format:  fmtAge,
    }] : []),
    {
      key:     'contributionFactor',
      label:   'Monthly Contributions',
      sublabel: 'all accounts proportionally',
      min: 0.5, max: 2.0, step: 0.05,
      defaultValue: 1.0,
      format:  fmtContrib,
    },
    {
      key:     'preRetirementSpendFactor',
      label:   'Pre-Retirement Spending',
      sublabel: '±50% of current',
      min: 0.5, max: 1.5, step: 0.05,
      defaultValue: 1.0,
      format:  fmtFactor,
    },
    {
      key:     'postRetirementSpendFactor',
      label:   'Post-Retirement Spending',
      sublabel: '±50% of current',
      min: 0.5, max: 1.5, step: 0.05,
      defaultValue: 1.0,
      format:  fmtFactor,
    },
    {
      key:     'inflationRate',
      label:   'Inflation Rate',
      min: 1, max: 8, step: 0.25,
      defaultValue: inflRate,
      format:  fmtPct,
    },
    {
      key:      'lifeExpectancy',
      label:    `${state.profile.person1.name || 'Person 1'} Life Expectancy`,
      sublabel: 'how long your money must last',
      min: 75, max: 100, step: 1,
      defaultValue: p1LifeExp,
      format:   fmtAge,
    },
  ]

  return (
    <div className={`rounded-xl border transition-all duration-200 ${
      open
        ? hasAnyOverride
          ? 'border-gold-500/30 bg-gold-500/4'
          : 'border-slate-700 bg-slate-900/60'
        : hasAnyOverride
          ? 'border-gold-500/30 bg-gold-500/4'
          : 'border-slate-800 bg-slate-900/40'
    }`}>

      {/* Header / toggle row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left group"
      >
        <div className="flex items-center gap-3">
          {/* Animated icon */}
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            hasAnyOverride ? 'bg-gold-500/20' : 'bg-slate-800'
          }`}>
            <svg viewBox="0 0 16 16" className={`w-4 h-4 transition-colors ${hasAnyOverride ? 'fill-gold-400' : 'fill-slate-500'}`}>
              <path d="M11.5 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM9.05 3a2.5 2.5 0 0 1 4.9 0H16v1h-2.05a2.5 2.5 0 0 1-4.9 0H0V3h9.05ZM4.5 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM2.05 8a2.5 2.5 0 0 1 4.9 0H16v1H6.95a2.5 2.5 0 0 1-4.9 0H0V8h2.05ZM11.5 12a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm-2.45 1a2.5 2.5 0 0 1 4.9 0H16v1h-2.05a2.5 2.5 0 0 1-4.9 0H0v-1h9.05Z"/>
            </svg>
          </div>
          <div>
            <span className="text-sm font-semibold text-slate-200 group-hover:text-slate-100">
              What-If Sliders
            </span>
            {hasAnyOverride ? (
              <span className="ml-2 text-xs font-medium text-gold-400 bg-gold-500/15 px-1.5 py-0.5 rounded">
                {sliders.filter(s => overrides[s.key] !== null).length} active
              </span>
            ) : (
              <span className="ml-2 text-xs text-slate-600">explore scenarios without saving</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {hasAnyOverride && (
            <span
              onClick={e => { e.stopPropagation(); resetAll() }}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer px-2 py-1 rounded hover:bg-slate-800"
            >
              Reset all
            </span>
          )}
          <svg
            viewBox="0 0 16 16"
            className={`w-4 h-4 fill-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          >
            <path d="M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z"/>
          </svg>
        </div>
      </button>

      {/* Collapsed preview strip — only when overrides active and panel closed */}
      {!open && hasAnyOverride && (
        <div className="px-5 pb-3 flex flex-wrap gap-1.5">
          {sliders
            .filter(s => overrides[s.key] !== null)
            .map(s => (
              <span key={s.key} className="text-xs bg-gold-500/10 text-gold-400 border border-gold-500/20 rounded px-2 py-0.5 font-mono">
                {s.label.split(' ')[0]}: {s.format(overrides[s.key])}
              </span>
            ))}
        </div>
      )}

      {/* Expanded panel */}
      {open && (
        <div className="px-5 pb-5 space-y-5 border-t border-slate-800/60">
          <div className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {sliders.map(s => (
              <SliderRow
                key={s.key}
                label={s.label}
                sublabel={s.sublabel}
                min={s.min}
                max={s.max}
                step={s.step}
                value={overrides[s.key]}
                onChange={v => setOverride(s.key, v)}
                format={s.format}
                defaultValue={s.defaultValue}
              />
            ))}
          </div>

          {/* Impact summary */}
          {hasAnyOverride && (
            <div className="space-y-3">
              <div className="border-t border-slate-800 pt-4">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
                  Scenario Impact vs. Base Case
                </p>
                <div className="flex flex-wrap gap-2">
                  <ImpactBadge
                    baseValue={baseStats.portfolioAtRetirement}
                    overrideValue={overrideStats.portfolioAtRetirement}
                    label="Portfolio at retirement"
                  />
                  <ImpactBadge
                    baseValue={baseStats.peakPortfolio}
                    overrideValue={overrideStats.peakPortfolio}
                    label="Peak portfolio"
                  />
                  {(baseStats.depletionAge || overrideStats.depletionAge) && (
                    <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${
                      overrideStats.depletionAge && (!baseStats.depletionAge || overrideStats.depletionAge < baseStats.depletionAge)
                        ? 'bg-red-500/10 border-red-500/20 text-red-400'
                        : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    }`}>
                      <span>⏳</span>
                      <span className="font-medium">
                        {overrideStats.depletionAge
                          ? `Depletes at ${overrideStats.depletionAge}`
                          : 'Outlasts horizon'}
                        {baseStats.depletionAge !== overrideStats.depletionAge && (
                          <span className="opacity-60">
                            {' '}(was {baseStats.depletionAge ? `${baseStats.depletionAge}` : '100+'})
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Compare to base toggle */}
              <div className="flex items-center justify-between bg-slate-800/50 rounded-lg px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-slate-200">Show base case on chart</p>
                  <p className="text-xs text-slate-600">Draws a faint dashed line for the original scenario</p>
                </div>
                <button
                  onClick={() => setCompareToBase(b => !b)}
                  className={`w-11 h-6 rounded-full transition-colors duration-200 relative shrink-0 ${
                    compareToBase ? 'bg-gold-500' : 'bg-slate-700'
                  }`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                    compareToBase ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* Override wealth chart */}
              <div className="rounded-xl border border-slate-800 overflow-hidden">
                <WealthBuildChart
                  overrideLedger={overrideLedger}
                  baseLedger={compareToBase ? baseLedger : null}
                  showBaseLine={compareToBase}
                />
              </div>
            </div>
          )}

          {/* Reset + hint footer */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <p className="text-xs text-slate-600">
              Overrides affect charts above. Nothing is saved to your profile.
            </p>
            {hasAnyOverride && (
              <button
                onClick={resetAll}
                className="text-xs text-red-400/70 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
              >
                ↺ Reset all overrides
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
