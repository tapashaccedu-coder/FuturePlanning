import { useRef, useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { useWhatIf, applyOverrides } from '../store/whatif'
import { simulate, summarize, monteCarlo } from '../engine/simulate'

// ─── Color tokens ─────────────────────────────────────────────────────────────

const ACCOUNT_TYPE_COLORS = {
  trad_401k: '#60a5fa',
  roth_401k: '#a78bfa',
  trad_ira:  '#22d3ee',
  roth_ira:  '#818cf8',
  hsa:       '#34d399',
  taxable:   '#fbbf24',
  pension:   '#f87171',
  other:     '#94a3b8',
}

const ACCOUNT_TYPE_LABELS = {
  trad_401k: 'Trad. 401(k)',
  roth_401k: 'Roth 401(k)',
  trad_ira:  'Traditional IRA',
  roth_ira:  'Roth IRA',
  hsa:       'HSA',
  taxable:   'Taxable Brokerage',
  pension:   'Pension',
  other:     'Other',
}

const SPEND_COLORS = {
  living:    '#f97316',
  health:    '#f472b6',
  taxes:     '#94a3b8',
}

const OVERFLOW_COLORS = [
  '#fb923c','#e879f9','#2dd4bf','#facc15',
  '#f472b6','#4ade80','#38bdf8','#c084fc',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtM(n) {
  if (n == null || isNaN(n)) return '—'
  if (Math.abs(n) >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M'
  if (Math.abs(n) >= 1_000)    return '$' + (n / 1_000).toFixed(0) + 'k'
  return '$' + Math.round(n).toLocaleString()
}

function fmtFull(n) {
  if (n == null || isNaN(n)) return '—'
  return '$' + Math.round(n).toLocaleString('en-US')
}

function num(val, fallback = 0) {
  if (val === '' || val === null || val === undefined) return fallback
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[$,]/g, ''))
  return isNaN(n) ? fallback : n
}

// ─── Donut chart (pure Canvas, no Chart.js dependency needed) ─────────────────

function DonutChart({ slices, size = 180, strokeWidth = 32 }) {
  const canvasRef = useRef(null)
  const r = (size - strokeWidth) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const total = slices.reduce((s, sl) => s + sl.value, 0)
  const GAP = 0.018  // radians gap between slices

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    canvas.width  = size * dpr
    canvas.height = size * dpr
    canvas.style.width  = size + 'px'
    canvas.style.height = size + 'px'
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, size, size)

    if (!total || slices.length === 0) {
      // Empty ring
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.strokeStyle = '#1e293b'
      ctx.lineWidth = strokeWidth
      ctx.stroke()
      return
    }

    let angle = -Math.PI / 2  // start at top

    slices.forEach((sl, i) => {
      const sweep = (sl.value / total) * (Math.PI * 2) - GAP
      if (sweep <= 0) return

      ctx.beginPath()
      ctx.arc(cx, cy, r, angle + GAP / 2, angle + GAP / 2 + sweep)
      ctx.strokeStyle = sl.color
      ctx.lineWidth = strokeWidth
      ctx.lineCap = 'butt'
      ctx.stroke()

      angle += (sl.value / total) * (Math.PI * 2)
    })
  }, [slices, size, strokeWidth])

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <canvas ref={canvasRef} />
    </div>
  )
}

// ─── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, trend, icon, highlight, loading }) {
  const trendColor = trend === 'good' ? 'text-emerald-400' :
                     trend === 'warn' ? 'text-gold-400'    :
                     trend === 'bad'  ? 'text-red-400'     : 'text-slate-400'

  return (
    <div className={`
      relative overflow-hidden rounded-xl border p-5 flex flex-col gap-2 transition-all duration-200
      ${highlight
        ? 'bg-gold-500/8 border-gold-500/25 hover:border-gold-500/40'
        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
      }
    `}>
      {/* Icon + label row */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider leading-tight">
          {label}
        </span>
        {icon && (
          <span className="text-base opacity-40">{icon}</span>
        )}
      </div>

      {/* Value */}
      {loading ? (
        <div className="h-8 w-24 bg-slate-800 rounded-md animate-pulse" />
      ) : (
        <span className={`font-display text-2xl font-bold leading-none ${
          highlight ? 'text-gold-400 glow-gold' : 'text-slate-100'
        }`}>
          {value}
        </span>
      )}

      {/* Sub-label */}
      {sub && (
        <span className={`text-xs leading-snug ${trendColor}`}>
          {sub}
        </span>
      )}

      {/* Highlight accent bar */}
      {highlight && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-gold-500/60 via-gold-400/40 to-transparent" />
      )}
    </div>
  )
}

// ─── Chart + Legend combo ─────────────────────────────────────────────────────

function DonutWithLegend({ title, subtitle, slices, centerLabel, centerSub }) {
  const total = slices.reduce((s, sl) => s + sl.value, 0)

  if (!total || slices.every(s => s.value === 0)) {
    return (
      <div className="card space-y-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-slate-100">{title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center justify-center h-36">
          <p className="text-xs text-slate-600">No data yet</p>
        </div>
      </div>
    )
  }

  return (
    <div className="card space-y-4">
      <div>
        <h3 className="font-display text-sm font-semibold text-slate-100">{title}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      </div>

      <div className="flex items-center gap-6">
        {/* Donut */}
        <div className="relative shrink-0" style={{ width: 160, height: 160 }}>
          <DonutChart slices={slices} size={160} strokeWidth={28} />
          {/* Center label — fits the 104px inner hole */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
            style={{ padding: '0 12px' }}>
            <span
              className="font-mono font-bold text-slate-100 text-center leading-none block w-full truncate"
              style={{ fontSize: centerLabel && centerLabel.length > 5 ? '0.7rem' : '0.85rem' }}
            >
              {centerLabel}
            </span>
            {centerSub && (
              <span className="text-slate-500 text-center leading-tight block w-full truncate mt-1"
                style={{ fontSize: '0.6rem' }}>
                {centerSub}
              </span>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-2 min-w-0">
          {slices.map((sl, i) => {
            const pct = total > 0 ? ((sl.value / total) * 100).toFixed(1) : '0.0'
            return (
              <div key={sl.label} className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: sl.color }}
                />
                <span className="text-xs text-slate-400 truncate flex-1 min-w-0">
                  {sl.label}
                </span>
                <span className="font-mono text-xs text-slate-300 shrink-0">
                  {pct}%
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Value breakdown below legend */}
      <div className="pt-2 border-t border-slate-800 space-y-1">
        {slices.map(sl => (
          <div key={sl.label} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: sl.color }} />
              <span className="text-slate-500">{sl.label}</span>
            </div>
            <span className="font-mono text-slate-300">{fmtFull(sl.value)}</span>
          </div>
        ))}
        <div className="flex justify-between text-xs pt-1 border-t border-slate-800/60">
          <span className="text-slate-500 font-medium">Total</span>
          <span className="font-mono font-semibold text-slate-200">{fmtFull(total)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Monte Carlo probability gauge ───────────────────────────────────────────

function SurvivalGauge({ pct }) {
  const color = pct >= 85 ? '#4ade80' : pct >= 70 ? '#fbbf24' : '#f87171'
  const trend = pct >= 85 ? 'good'    : pct >= 70 ? 'warn'    : 'bad'
  const label = pct >= 90 ? 'Excellent — on track'
               : pct >= 80 ? 'Good — minor adjustments may help'
               : pct >= 70 ? 'Fair — consider saving more'
               :              'At risk — review your plan'

  return (
    <div>
      <div className="flex items-end gap-1 mb-1">
        <span className="font-display text-2xl font-bold leading-none"
          style={{ color }}>{pct}%</span>
        <span className="text-xs text-slate-500 mb-0.5">of 500 runs</span>
      </div>
      {/* Segmented bar */}
      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mb-1.5">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className={`text-xs ${
        trend === 'good' ? 'text-emerald-400' :
        trend === 'warn' ? 'text-gold-400' : 'text-red-400'
      }`}>{label}</span>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function SummaryMetrics() {
  const { state } = useStore()
  const { overrides, realMode } = useWhatIf()
  const effectiveState = useMemo(() => applyOverrides(state, overrides), [state, overrides])
  const [mcLoading, setMcLoading] = useState(false)
  const [mcResult,  setMcResult]  = useState(null)

  // ── Run base simulation ──────────────────────────────────────────────────
  const ledger = useMemo(() => simulate(effectiveState), [effectiveState])
  const stats  = useMemo(() => summarize(ledger), [ledger])

  // ── Run Monte Carlo (debounced, in effect) ──────────────────────────────
  useEffect(() => {
    if (ledger.length === 0) { setMcResult(null); return }
    setMcLoading(true)
    const timer = setTimeout(() => {
      try {
        const result = monteCarlo(effectiveState, 500, 90)
        setMcResult(result)
      } catch (e) {
        console.error('MC error', e)
      } finally {
        setMcLoading(false)
      }
    }, 120)  // slight delay so UI doesn't stutter on rapid typing
    return () => clearTimeout(timer)
  }, [effectiveState, ledger.length])

  // ── Compound interest breakdown ─────────────────────────────────────────
  const totalContributed = useMemo(() => {
    const { accounts, profile } = effectiveState
    const p1CurAge  = num(profile.person1.age)
    const p1RetAge  = num(profile.person1.retirementAge, 65)
    const yearsWork = Math.max(0, p1RetAge - p1CurAge)

    return accounts.reduce((sum, a) => {
      const stopYrs  = num(a.stopContributingYearsBefore, 0)
      const yrsContrib = Math.max(0, yearsWork - stopYrs)
      const annualC  = (num(a.monthlyContribution) + num(a.monthlyEmployerMatch)) * 12
      const initial  = num(a.balance)
      return sum + initial + annualC * yrsContrib
    }, 0)
  }, [state])

  // ── Retirement portfolio donut slices ───────────────────────────────────
  const retirementRow = ledger.find(r => r.p1Retired)

  const portfolioSlices = useMemo(() => {
    if (!retirementRow) return []
    const usedTypeColors = {}
    const inflMult = retirementRow.inflationMultiplier ?? 1
    return state.accounts
      .filter(a => a.id)
      .map((a) => {
        const val = retirementRow[a.id] ?? 0
        const displayVal = realMode ? Math.round(val / inflMult) : val
        let color = ACCOUNT_TYPE_COLORS[a.type] ?? '#94a3b8'
        if (usedTypeColors[a.type] !== undefined) {
          color = OVERFLOW_COLORS[usedTypeColors[a.type] % OVERFLOW_COLORS.length]
          usedTypeColors[a.type]++
        } else {
          usedTypeColors[a.type] = 1
        }
        return {
          label: a.name || ACCOUNT_TYPE_LABELS[a.type] || 'Account',
          value: Math.max(0, displayVal),
          color,
        }
      })
      .filter(s => s.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [retirementRow, state.accounts, realMode])

  // ── Retirement-year spending donut ──────────────────────────────────────
  const spendingSlices = useMemo(() => {
    if (!retirementRow) return []
    const inflMult = retirementRow.inflationMultiplier ?? 1
    const d = (v) => realMode ? Math.round(v / inflMult) : v

    const living = d(retirementRow.livingSpending ?? 0)
    const health = d(retirementRow.healthSpending  ?? 0)
    const taxableIncome = d((retirementRow.portfolioDrawdown ?? 0) * 0.6)
    const estimatedTax  = Math.round(taxableIncome * 0.15)

    return [
      { label: 'Living Expenses', value: living,       color: SPEND_COLORS.living },
      { label: 'Healthcare',      value: health,        color: SPEND_COLORS.health },
      { label: 'Est. Taxes',      value: estimatedTax,  color: SPEND_COLORS.taxes },
    ].filter(s => s.value > 0)
  }, [retirementRow, realMode])

  // ── Real-mode deflation helpers ──────────────────────────────────────────
  // stats values are nominal; divide by inflation multiplier at retirement to get real
  const retirementInflMult = retirementRow?.inflationMultiplier ?? 1

  const toReal = (nominalVal) =>
    (nominalVal != null && realMode) ? Math.round(nominalVal / retirementInflMult) : nominalVal

  // SS lifetime uses avg multiplier across all retirement years
  const retiredRows = ledger.filter(r => r.p1Retired)
  const avgRetInflMult = retiredRows.length > 0
    ? retiredRows.reduce((s, r) => s + r.inflationMultiplier, 0) / retiredRows.length
    : 1
  const toRealAvg = (val) => (val != null && realMode) ? Math.round(val / avgRetInflMult) : val

  const hasData = ledger.length > 0

  // ── Lifetime estimated tax (retirement years only) ──────────────────────
  const lifetimeTaxNominal = retiredRows.reduce((s, r) => s + (r.estimatedTax ?? 0), 0)
  const lifetimeTax = toRealAvg(lifetimeTaxNominal)

  // ── Metric card values — all deflated when realMode is on ───────────────
  const portAtRet    = toReal(stats.portfolioAtRetirement)
  const ssLifetime   = toRealAvg(stats.totalSSLifetime)

  // ── Contributed vs Growth — compare in same dollar basis ────────────────
  // totalContributed is already in today's dollars (today's balances + flat contribution amounts)
  // portAtRet is already deflated to today's dollars when realMode is on
  // So we compare them in the same basis: both real if realMode, both nominal if not.
  const portAtRetNominal = stats.portfolioAtRetirement
  const portAtRetForRatio = realMode ? portAtRet : portAtRetNominal

  const growthMultiple = totalContributed > 0 && portAtRetForRatio != null
    ? (portAtRetForRatio / totalContributed).toFixed(1)
    : null

  const totalGrowthReal = portAtRetForRatio != null
    ? Math.max(0, portAtRetForRatio - totalContributed)
    : null

  // ── Life expectancy gap ─────────────────────────────────────────────────
  const p1LifeExp = num(state.profile.person1?.lifeExpectancy, 90)

  const depletionDisplay = stats.depletionAge
    ? `Age ${stats.depletionAge}`
    : hasData ? '100+' : '—'

  const depletionTrend = (() => {
    if (!hasData) return null
    if (!stats.depletionAge) return 'good'                         // outlasts horizon
    if (stats.depletionAge < p1LifeExp) return 'bad'              // depletes before life exp
    return 'warn'                                                   // depletes but after life exp
  })()

  const depletionSub = (() => {
    if (!hasData) return 'Set up your profile to see this'
    if (!stats.depletionAge) {
      // Portfolio outlasts the horizon
      const surplusYears = stats.finalAge
        ? Math.max(0, stats.finalAge - p1LifeExp)
        : null
      return surplusYears != null && surplusYears > 0
        ? `Life expectancy: age ${p1LifeExp} — portfolio lasts ${surplusYears}+ more years ✓`
        : `Life expectancy: age ${p1LifeExp} — portfolio outlasts plan horizon ✓`
    }
    // Portfolio depletes at some age
    const gap = stats.depletionAge - p1LifeExp
    if (gap < 0) {
      // Depletes BEFORE life expectancy — bad
      return `⚠ Runs out ${Math.abs(gap)} years before life expectancy (age ${p1LifeExp})`
    }
    // Depletes AFTER life expectancy — technically ok
    return `Depletes at age ${stats.depletionAge} · ${gap} years after life expectancy`
  })()

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div>
        <p className="text-xs font-medium text-gold-500 uppercase tracking-widest mb-0.5">Outcomes</p>
        <h2 className="font-display text-lg font-semibold text-slate-100">Summary Metrics</h2>
        <p className="text-xs text-slate-500 mt-0.5">Key numbers derived from your projection</p>
      </div>

      {/* 6 metric cards — 3+3 grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {/* Card 1: Net worth at retirement */}
        <MetricCard
          label="Net Worth at Retirement"
          value={portAtRet != null ? fmtM(portAtRet) : '—'}
          sub={stats.retirementAge
            ? `At age ${stats.retirementAge} · ${realMode ? "today's $" : 'nominal $'}`
            : 'Set retirement age'}
          trend={portAtRet > 0 ? 'good' : portAtRet === 0 ? 'bad' : null}
          icon="🏦"
          highlight
        />

        {/* Card 2: Depletion age */}
        <MetricCard
          label="Money Runs Out At"
          value={depletionDisplay}
          sub={depletionSub}
          trend={depletionTrend}
          icon="⏳"
        />

        {/* Card 3: Total SS lifetime */}
        <MetricCard
          label="Lifetime SS Income"
          value={ssLifetime ? fmtM(ssLifetime) : '—'}
          sub={ssLifetime
            ? `${realMode ? "Today's dollars" : 'Nominal'} across all SS income`
            : 'Enter SS benefits on Events tab'}
          trend={ssLifetime > 0 ? 'good' : null}
          icon="🏛"
        />

        {/* Card 4: Contributions vs growth */}
        <MetricCard
          label="Contributed vs Growth"
          value={growthMultiple ? `${growthMultiple}×` : '—'}
          sub={
            totalGrowthReal != null && totalContributed > 0
              ? `${fmtM(totalContributed)} in → ${fmtM(portAtRetForRatio ?? 0)} out · ${realMode ? "today's $" : 'nominal $'}`
              : 'Compound leverage ratio at retirement'
          }
          trend={growthMultiple >= 2 ? 'good' : growthMultiple >= 1.5 ? 'warn' : null}
          icon="📈"
        />

        {/* Card 5: Lifetime estimated tax */}
        <MetricCard
          label="Lifetime Est. Tax"
          value={lifetimeTax ? fmtM(lifetimeTax) : hasData ? '$0' : '—'}
          sub="Rough federal tax on withdrawals — see a tax advisor for actual planning."
          trend={lifetimeTax > 0 ? 'warn' : null}
          icon="🧾"
        />

        {/* Card 6: Monte Carlo */}
        <div className="relative overflow-hidden rounded-xl border bg-slate-900 border-slate-800 hover:border-slate-700 p-5 flex flex-col gap-2 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Monte Carlo (age 90)
            </span>
            <span className="text-base opacity-40">🎲</span>
          </div>
          {mcLoading ? (
            <div className="space-y-2">
              <div className="h-7 w-20 bg-slate-800 rounded animate-pulse" />
              <div className="h-1.5 w-full bg-slate-800 rounded animate-pulse" />
              <div className="h-3 w-32 bg-slate-800 rounded animate-pulse" />
            </div>
          ) : mcResult?.survivalRate != null ? (
            <SurvivalGauge pct={mcResult.survivalRate} />
          ) : (
            <span className="font-display text-2xl font-bold text-slate-600">—</span>
          )}
          {mcResult && !mcLoading && (
            <div className="mt-1 grid grid-cols-3 gap-1 text-center">
              {[
                { label: 'P10', val: mcResult.p10 },
                { label: 'P50', val: mcResult.p50 },
                { label: 'P90', val: mcResult.p90 },
              ].map(p => (
                <div key={p.label} className="bg-slate-800/60 rounded px-1.5 py-1">
                  <div className="text-xs text-slate-600">{p.label}</div>
                  <div className="font-mono text-xs text-slate-400">{fmtM(p.val)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Contribution vs growth visual breakdown */}
      {totalContributed > 0 && portAtRet != null && (
        <div className="card !py-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Compound interest leverage
            </span>
            <span className="text-xs text-slate-600">
              at retirement · {realMode ? "today's $" : 'nominal $'}
            </span>
          </div>
          <div className="flex h-4 rounded-full overflow-hidden gap-px">
            <div
              className="bg-blue-500/70 flex items-center justify-center text-xs text-blue-200 font-medium transition-all duration-700"
              style={{ width: `${(totalContributed / ((portAtRet || totalContributed) || 1)) * 100}%` }}
              title={`Contributed: ${fmtM(totalContributed)}`}
            />
            <div
              className="bg-emerald-500/70 flex-1 transition-all duration-700"
              title={`Growth: ${fmtM(Math.max(0, (portAtRet ?? 0) - totalContributed))}`}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-500/70" />
              <span className="text-slate-500">You contributed</span>
              <span className="font-mono text-slate-300">{fmtM(totalContributed)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/70" />
              <span className="text-slate-500">Market grew it by</span>
              <span className="font-mono text-emerald-400">
                {fmtM(Math.max(0, (portAtRet ?? 0) - totalContributed))}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Two donut charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DonutWithLegend
          title="Portfolio at Retirement"
          subtitle={`Account breakdown at age ${stats.retirementAge ?? '—'} · ${realMode ? "today's $" : 'nominal $'}`}
          slices={portfolioSlices}
          centerLabel={portAtRet != null ? fmtM(portAtRet) : '—'}
          centerSub="total"
        />
        <DonutWithLegend
          title="Year-1 Retirement Spending"
          subtitle={`First year of retirement · ${realMode ? "today's $" : 'nominal $'}`}
          slices={spendingSlices}
          centerLabel={fmtM(retirementRow
            ? (realMode
                ? Math.round(((retirementRow.livingSpending ?? 0) + (retirementRow.healthSpending ?? 0)) / (retirementRow.inflationMultiplier ?? 1))
                : (retirementRow.livingSpending ?? 0) + (retirementRow.healthSpending ?? 0))
            : null)}
          centerSub="spending"
        />
      </div>
    </div>
  )
}
