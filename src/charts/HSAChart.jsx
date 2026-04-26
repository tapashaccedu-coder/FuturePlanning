import { useRef, useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { useWhatIf, applyOverrides } from '../store/whatif'
import { simulate } from '../engine/simulate'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M'
  if (abs >= 1_000)     return '$' + (n / 1_000).toFixed(0) + 'k'
  return '$' + Math.round(n).toLocaleString()
}

function fmtFull(n) {
  if (n == null || isNaN(n)) return '—'
  return '$' + Math.round(Math.abs(n)).toLocaleString('en-US')
}

// ─── HSAChart ─────────────────────────────────────────────────────────────────

export default function HSAChart() {
  const { state }     = useStore()
  const { overrides, realMode } = useWhatIf()

  const effectiveState = useMemo(() => applyOverrides(state, overrides), [state, overrides])
  const ledger         = useMemo(() => simulate(effectiveState), [effectiveState])

  const canvasRef  = useRef(null)
  const chartRef   = useRef(null)

  const [tooltipData,   setTooltipData]   = useState(null)
  const [showInfoStrip, setShowInfoStrip] = useState(true)

  // ── Find all HSA accounts ──────────────────────────────────────────────────
  const hsaAccounts = useMemo(
    () => state.accounts.filter(a => a.id && a.type === 'hsa'),
    [state.accounts]
  )

  // ── Aggregate HSA balance across all HSA accounts per ledger row ──────────
  const hsaData = useMemo(() => {
    if (ledger.length === 0 || hsaAccounts.length === 0) return []
    return ledger.map(r => {
      const nominalBalance = hsaAccounts.reduce((s, a) => s + Math.max(0, r[a.id] ?? 0), 0)
      const nominalWithdrawal = r.hsaWithdrawal ?? 0
      return {
        age:         r.age,
        year:        r.year,
        balance:     realMode ? Math.round(nominalBalance    / r.inflationMultiplier) : nominalBalance,
        withdrawal:  realMode ? Math.round(nominalWithdrawal / r.inflationMultiplier) : nominalWithdrawal,
        healthSpend: realMode ? Math.round((r.healthSpending ?? 0) / r.inflationMultiplier) : (r.healthSpending ?? 0),
        p1Retired:   r.p1Retired,
        inflMult:    r.inflationMultiplier,
        row:         r,
      }
    })
  }, [ledger, hsaAccounts, realMode])

  // ── Derived summary stats ─────────────────────────────────────────────────
  const retirementRow  = hsaData.find(d => d.p1Retired)
  const depletionRow   = hsaData.find(d => d.p1Retired && d.balance <= 0)
  const peakRow        = hsaData.reduce((best, d) => (!best || d.balance > best.balance ? d : best), null)

  const retirementBalance = retirementRow?.balance ?? null
  const depletionAge      = depletionRow?.age ?? null
  const yearsOfCoverage   = retirementRow && depletionRow
    ? depletionRow.age - retirementRow.age
    : retirementRow ? '∞ (not depleted)' : null

  const totalHsaWithdrawn = hsaData.reduce((s, d) => s + d.withdrawal, 0)

  const ages = hsaData.map(d => d.age)

  // ── Chart build ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current || hsaData.length === 0) return

    const buildChart = async () => {
      const { Chart, registerables } = await import('chart.js')
      Chart.register(...registerables)

      const ctx = canvasRef.current.getContext('2d')

      // Balance line dataset
      const balanceDataset = {
        label:                'HSA Balance',
        data:                 hsaData.map(d => d.balance),
        borderColor:          '#34d399',
        backgroundColor:      (context) => {
          const chart = context.chart
          const { ctx: c, chartArea } = chart
          if (!chartArea) return 'rgba(52,211,153,0.08)'
          const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
          gradient.addColorStop(0,   'rgba(52,211,153,0.20)')
          gradient.addColorStop(0.5, 'rgba(52,211,153,0.06)')
          gradient.addColorStop(1,   'rgba(52,211,153,0.00)')
          return gradient
        },
        borderWidth:          2.5,
        pointRadius:          0,
        pointHoverRadius:     5,
        pointHoverBackgroundColor: '#34d399',
        pointHoverBorderColor:     '#0a1120',
        pointHoverBorderWidth:     2,
        tension:              0.35,
        fill:                 'origin',
        order:                1,
        yAxisID:              'yBalance',
      }

      // Annual HSA withdrawal bars (shown as thin bars on secondary axis)
      const withdrawalDataset = {
        type:             'bar',
        label:            'Annual Withdrawal',
        data:             hsaData.map(d => d.withdrawal),
        backgroundColor:  'rgba(251,191,36,0.35)',
        borderColor:      'rgba(251,191,36,0.7)',
        borderWidth:      1,
        borderRadius:     2,
        order:            2,
        yAxisID:          'yWithdrawal',
      }

      // Retirement zone + depletion plugin
      const annotationPlugin = {
        id: 'hsaAnnotations',
        beforeDraw(chart) {
          if (!retirementRow) return
          const { ctx: c, chartArea, scales } = chart
          if (!chartArea || !scales.x) return
          const retIdx = ages.indexOf(retirementRow.age)
          if (retIdx === -1) return
          const xStart = scales.x.getPixelForValue(retIdx)
          c.save()
          c.fillStyle = 'rgba(232,168,0,0.04)'
          c.fillRect(xStart, chartArea.top, chartArea.right - xStart, chartArea.bottom - chartArea.top)
          c.restore()
        },
        afterDraw(chart) {
          const { ctx: c, chartArea, scales } = chart
          if (!chartArea || !scales.x) return

          // Retirement line
          if (retirementRow) {
            const retIdx = ages.indexOf(retirementRow.age)
            if (retIdx !== -1) {
              const x = scales.x.getPixelForValue(retIdx)
              c.save()
              c.strokeStyle = 'rgba(232,168,0,0.85)'
              c.lineWidth   = 1.5
              c.setLineDash([5, 4])
              c.globalAlpha = 0.8
              c.beginPath(); c.moveTo(x, chartArea.top); c.lineTo(x, chartArea.bottom); c.stroke()
              c.setLineDash([])
              c.globalAlpha = 1
              c.font = '9px DM Mono, monospace'
              c.fillStyle = 'rgba(232,168,0,0.9)'
              c.textAlign = 'center'
              c.fillText('Retirement', x, chartArea.top + 10)
              c.restore()
            }
          }

          // Depletion marker — red downward triangle
          if (depletionAge !== null) {
            const depIdx = ages.indexOf(depletionAge)
            if (depIdx !== -1) {
              const x   = scales.x.getPixelForValue(depIdx)
              const triSize = 7
              const triY    = chartArea.bottom - 14
              c.save()
              c.fillStyle   = '#f87171'
              c.globalAlpha = 0.9
              c.beginPath()
              c.moveTo(x,           triY + triSize)
              c.lineTo(x - triSize, triY)
              c.lineTo(x + triSize, triY)
              c.closePath()
              c.fill()
              c.globalAlpha = 1
              c.font        = '9px DM Mono, monospace'
              c.fillStyle   = '#f87171'
              c.textAlign   = 'center'
              c.fillText(`Depleted ${depletionAge}`, x, triY - 4)
              c.restore()
            }
          }
        },
      }

      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }

      chartRef.current = new Chart(ctx, {
        type: 'line',
        data: { labels: ages, datasets: [balanceDataset, withdrawalDataset] },
        options: {
          responsive:          true,
          maintainAspectRatio: false,
          animation:           { duration: 350, easing: 'easeInOutQuart' },
          interaction:         { mode: 'index', intersect: false },
          onHover: (_, elements, chart) => {
            if (!elements.length) { setTooltipData(null); return }
            const idx = elements[0].index
            const d   = hsaData[idx]
            if (!d) { setTooltipData(null); return }
            setTooltipData(d)
          },
          plugins: {
            legend:  { display: false },
            tooltip: { enabled: false },
          },
          scales: {
            x: {
              type: 'category',
              grid:   { color: 'rgba(255,255,255,0.04)' },
              border: { color: 'rgba(255,255,255,0.06)' },
              ticks:  {
                color: '#64748b',
                font:  { family: 'DM Mono, monospace', size: 10 },
                maxTicksLimit: 14,
                maxRotation: 0,
                callback: (_, idx) => ages[idx],
              },
            },
            yBalance: {
              type:        'linear',
              position:    'left',
              beginAtZero: true,
              grid:        { color: 'rgba(255,255,255,0.04)' },
              border:      { color: 'rgba(255,255,255,0.06)', dash: [3, 3] },
              ticks:       {
                color: '#34d399',
                font:  { family: 'DM Mono, monospace', size: 10 },
                callback: v => fmt(v),
                maxTicksLimit: 6,
              },
              title: {
                display: true,
                text: 'HSA Balance',
                color: '#34d399',
                font: { family: 'DM Mono, monospace', size: 9 },
              },
            },
            yWithdrawal: {
              type:        'linear',
              position:    'right',
              beginAtZero: true,
              grid:        { drawOnChartArea: false },
              ticks:       {
                color: '#fbbf24',
                font:  { family: 'DM Mono, monospace', size: 10 },
                callback: v => fmt(v),
                maxTicksLimit: 5,
              },
              title: {
                display: true,
                text: 'Annual Withdrawal',
                color: '#fbbf24',
                font: { family: 'DM Mono, monospace', size: 9 },
              },
            },
          },
        },
        plugins: [annotationPlugin],
      })
    }

    buildChart()
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hsaData])

  // ── No HSA accounts ───────────────────────────────────────────────────────
  if (hsaAccounts.length === 0) return null

  // ── No ledger data ────────────────────────────────────────────────────────
  if (hsaData.length === 0) return null

  return (
    <div className="space-y-4">
      {/* Section heading */}
      <div>
        <p className="text-xs font-medium text-gold-500 uppercase tracking-widest mb-0.5">Health Savings</p>
        <h2 className="font-display text-lg font-semibold text-slate-100">HSA Account Projection</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Balance curve + annual healthcare withdrawals ·{' '}
          {realMode ? "today's dollars" : 'nominal dollars'}
        </p>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="stat-card">
          <span className="text-xs text-slate-500 uppercase tracking-wider font-medium">At Retirement</span>
          <span className="font-display text-xl font-semibold text-emerald-400 mt-1">
            {retirementBalance != null ? fmt(retirementBalance) : '—'}
          </span>
          <span className="text-xs text-slate-600 mt-0.5">
            {retirementRow ? `Age ${retirementRow.age}` : 'Set retirement age'}
          </span>
        </div>

        <div className="stat-card">
          <span className="text-xs text-slate-500 uppercase tracking-wider font-medium">Depletes At</span>
          <span className={`font-display text-xl font-semibold mt-1 ${depletionAge ? 'text-red-400' : 'text-emerald-400'}`}>
            {depletionAge ? `Age ${depletionAge}` : '100+'}
          </span>
          <span className="text-xs text-slate-600 mt-0.5">
            {depletionAge ? 'HSA exhausted' : 'Outlasts plan horizon'}
          </span>
        </div>

        <div className="stat-card">
          <span className="text-xs text-slate-500 uppercase tracking-wider font-medium">Years of Coverage</span>
          <span className="font-display text-xl font-semibold text-slate-100 mt-1">
            {typeof yearsOfCoverage === 'number' ? yearsOfCoverage : yearsOfCoverage ?? '—'}
          </span>
          <span className="text-xs text-slate-600 mt-0.5">From retirement to depletion</span>
        </div>

        <div className="stat-card">
          <span className="text-xs text-slate-500 uppercase tracking-wider font-medium">Total Withdrawn</span>
          <span className="font-display text-xl font-semibold text-amber-400 mt-1">
            {fmt(totalHsaWithdrawn)}
          </span>
          <span className="text-xs text-slate-600 mt-0.5">Tax-free healthcare payments</span>
        </div>
      </div>

      {/* Chart card */}
      <div className="card !p-0 overflow-hidden">
        {/* Card header with Values toggle */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-800">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-100">HSA Balance &amp; Withdrawals</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {hsaAccounts.length === 1
                ? hsaAccounts[0].name || 'HSA Account'
                : `${hsaAccounts.length} HSA accounts combined`}
              {depletionAge
                ? ` · depletes at age ${depletionAge}`
                : ' · outlasts planning horizon'}
            </p>
          </div>
          <button
            onClick={() => setShowInfoStrip(s => !s)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              showInfoStrip
                ? 'bg-gold-500/15 border-gold-500/30 text-gold-400'
                : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
            }`}
          >
            {showInfoStrip ? 'Values on' : 'Values off'}
          </button>
        </div>

        {/* Info strip — above canvas, wraps if needed */}
        {showInfoStrip && (
          <div
            className="border-b border-slate-800/60 bg-slate-900/80 shrink-0"
            style={{ minHeight: 36, maxHeight: 88, overflowY: 'auto',
                     scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}
          >
            {tooltipData ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2">
                <span className="font-mono text-xs font-semibold text-slate-300 shrink-0">
                  Age {tooltipData.age} · {tooltipData.year}
                </span>
                <span className="text-slate-700 shrink-0">|</span>

                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="w-2 h-2 rounded-full inline-block bg-emerald-400" />
                  <span className="text-xs text-slate-500">Balance</span>
                  <span className="font-mono text-xs text-emerald-300">{fmtFull(tooltipData.balance)}</span>
                </span>

                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="w-2 h-2 rounded-sm inline-block bg-amber-400/70" />
                  <span className="text-xs text-slate-500">Withdrawal</span>
                  <span className="font-mono text-xs text-amber-300">{fmtFull(tooltipData.withdrawal)}</span>
                </span>

                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-slate-500">Health Spend</span>
                  <span className="font-mono text-xs text-pink-300">{fmtFull(tooltipData.healthSpend)}</span>
                </span>

                {tooltipData.withdrawal > 0 && tooltipData.healthSpend > 0 && (
                  <span className="text-xs text-slate-600 shrink-0">
                    ({Math.round((tooltipData.withdrawal / tooltipData.healthSpend) * 100)}% from HSA)
                  </span>
                )}

                <span className="text-slate-700 shrink-0">|</span>
                <span className="text-xs text-slate-600 shrink-0">
                  {tooltipData.p1Retired ? '🏖 Retired' : '💼 Working'}
                </span>
              </div>
            ) : (
              <div className="flex items-center px-4 py-2.5">
                <span className="text-xs text-slate-600 italic">
                  Move cursor over chart to see HSA values for each age
                </span>
              </div>
            )}
          </div>
        )}

        {/* Canvas */}
        <div className="relative px-2 pt-3 pb-2" style={{ height: 280 }}>
          <canvas ref={canvasRef} />
        </div>

        {/* Legend */}
        <div className="px-6 py-3 border-t border-slate-800/60 bg-slate-950/40 flex flex-wrap gap-x-5 gap-y-2">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded inline-block bg-emerald-400" />
            <span className="text-xs text-slate-400">HSA Balance (left axis)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-2.5 rounded-sm inline-block bg-amber-400/50" />
            <span className="text-xs text-slate-400">Annual Withdrawal (right axis)</span>
          </div>
          {retirementRow && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-2 border-dashed border-gold-500/70" />
              <span className="text-xs text-slate-500">Retirement starts</span>
            </div>
          )}
          {depletionAge && (
            <div className="flex items-center gap-1.5">
              <span className="text-red-400 text-xs">▼</span>
              <span className="text-xs text-slate-500">HSA depleted — portfolio takes over</span>
            </div>
          )}
        </div>

        {/* Depletion callout */}
        {depletionAge && (
          <div className="mx-6 mb-4 px-4 py-3 bg-amber-500/8 border border-amber-500/20 rounded-xl">
            <p className="text-xs text-amber-400/80 leading-relaxed">
              <span className="font-semibold text-amber-300">After age {depletionAge}:</span>{' '}
              HSA is fully depleted. Healthcare costs (
              {realMode
                ? fmt((hsaData.find(d => d.age === depletionAge)?.healthSpend ?? 0))
                : fmt((hsaData.find(d => d.age === depletionAge)?.row.healthSpending ?? 0))
              }/yr at that age) will be drawn from your taxable or investment accounts
              in the standard withdrawal order.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
