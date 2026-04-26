import { useRef, useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { useWhatIf } from '../store/whatif'
import { simulate, summarize } from '../engine/simulate'

// ─── Color palette for account lines ─────────────────────────────────────────
// Keyed by account type; fallback palette for overflow accounts of the same type

const TYPE_PALETTE = {
  trad_401k: { line: '#60a5fa', fill: 'rgba(96,165,250,0.08)',  label: 'Trad. 401(k)' },
  roth_401k: { line: '#a78bfa', fill: 'rgba(167,139,250,0.08)', label: 'Roth 401(k)'  },
  trad_ira:  { line: '#22d3ee', fill: 'rgba(34,211,238,0.08)',  label: 'Trad. IRA'    },
  roth_ira:  { line: '#818cf8', fill: 'rgba(129,140,248,0.08)', label: 'Roth IRA'     },
  hsa:       { line: '#34d399', fill: 'rgba(52,211,153,0.08)',  label: 'HSA'           },
  taxable:   { line: '#fbbf24', fill: 'rgba(251,191,36,0.08)',  label: 'Taxable'       },
  pension:   { line: '#f87171', fill: 'rgba(248,113,113,0.08)', label: 'Pension'       },
  other:     { line: '#94a3b8', fill: 'rgba(148,163,184,0.08)', label: 'Other'         },
}

// Fallback colors for multiple accounts of the same type
const OVERFLOW_COLORS = [
  '#fb923c','#e879f9','#2dd4bf','#facc15','#f472b6',
  '#4ade80','#38bdf8','#c084fc','#a3e635','#fb7185',
]

const TOTAL_COLOR = {
  line: '#e8a800',
  fill: 'rgba(232,168,0,0.06)',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  if (Math.abs(n) >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M'
  if (Math.abs(n) >= 1_000)    return '$' + (n / 1_000).toFixed(0) + 'k'
  return '$' + Math.round(n).toLocaleString()
}

function fmtFull(n) {
  if (n == null || isNaN(n)) return '—'
  return '$' + Math.round(n).toLocaleString('en-US')
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WealthBuildChart({ overrideLedger = null, baseLedger = null, showBaseLine = false }) {
  const { state } = useStore()
  const { realMode } = useWhatIf()
  const canvasRef    = useRef(null)
  const chartRef     = useRef(null)
  const [hoveredAge, setHoveredAge]       = useState(null)
  const [tooltipData, setTooltipData]     = useState(null)
  const [showInfoStrip, setShowInfoStrip] = useState(true)

  // ── Run simulation — use override ledger if provided ────────────────────
  const baseSim   = useMemo(() => simulate(state), [state])
  const ledger    = overrideLedger ?? baseSim
  const stats     = useMemo(() => summarize(ledger), [ledger])

  // ── Derive retirement age annotations from active ledger ────────────────
  // Use the first p1Retired row to find the actual retirement age in play
  const activeRetirementRow = ledger.find(r => r.p1Retired)
  const activeP1RetAge = activeRetirementRow?.age ?? (parseInt(state.profile.person1.retirementAge) || null)

  // ── Derived chart inputs ────────────────────────────────────────────────
  const { profile, accounts } = state

  const p1RetAge = activeP1RetAge
  const p2RetAge = (() => {
    if (!profile.includePerson2) return null
    // Find first row where p2 is retired to get P2's effective retirement age in the ledger
    const p2RetRow = ledger.find(r => r.p2Retired && !ledger[ledger.indexOf(r) - 1]?.p2Retired)
    if (p2RetRow) return p2RetRow.age
    // Fallback to state calculation
    const p2Ret = parseInt(profile.person2.retirementAge) || null
    const p2Cur = parseInt(profile.person2.age) || null
    const p1Cur = parseInt(profile.person1.age) || null
    if (!p2Ret || !p2Cur || !p1Cur) return null
    return p1Cur + (p2Ret - p2Cur)
  })()

  const earlierRetAge = p2RetAge != null
    ? Math.min(p1RetAge ?? 999, p2RetAge)
    : p1RetAge

  const ages = ledger.map(r => r.age)

  // Build account datasets
  const usedColors = {}
  const accountDatasets = accounts
    .filter(a => a.id)
    .map((acct, i) => {
      const palette = TYPE_PALETTE[acct.type] || TYPE_PALETTE.other
      let color = palette.line
      if (usedColors[acct.type] !== undefined) {
        color = OVERFLOW_COLORS[usedColors[acct.type] % OVERFLOW_COLORS.length]
        usedColors[acct.type]++
      } else {
        usedColors[acct.type] = 1
      }

      const data = ledger.map(r => {
        const val = r[acct.id] ?? 0
        return realMode ? Math.round(val / r.inflationMultiplier) : val
      })

      return {
        id:    acct.id,
        label: acct.name || palette.label,
        type:  acct.type,
        color,
        data,
        hidden: false,
      }
    })

  // Total line = investment portfolio only (individual lines show account breakdown)
  // Net Worth line = portfolio + EF (the complete household balance sheet)
  const totalData = ledger.map(r => {
    // Total includes investment accounts + emergency fund for a true net worth picture
    const val = r.totalNetWorth ?? r.totalPortfolioValue ?? 0
    return realMode ? Math.round(val / r.inflationMultiplier) : val
  })

  // Emergency fund — shows actual signed balance (can go negative)
  const efData = ledger.map(r => {
    const val = r.emergencyFundBalance ?? 0
    return realMode ? Math.round(val / r.inflationMultiplier) : val
  })

  // Find first age where EF goes negative
  const efDepletionIdx = ledger.findIndex(r => (r.emergencyFundBalance ?? 0) < 0)
  const efDepletionAge = efDepletionIdx !== -1 ? ledger[efDepletionIdx].age : null

  // Find age when surviving-spouse scenario activates
  const spousePassesAge = ledger.find(r => r.survivingSpouseActive)?.age ?? null

  // ── Chart.js build/update ───────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current || ledger.length === 0) return

    const loadChart = async () => {
      const { Chart, registerables } = await import('chart.js')
      Chart.register(...registerables)

      const ctx = canvasRef.current.getContext('2d')

      // Build per-account Chart.js datasets
      const cjsDatasets = accountDatasets.map(ds => ({
        label: ds.label,
        data: ds.data,
        borderColor: ds.color,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: ds.color,
        pointHoverBorderColor: '#0a1120',
        pointHoverBorderWidth: 2,
        tension: 0.35,
        fill: false,
        order: 2,
        _acctId: ds.id,
      }))

      // Total line on top
      cjsDatasets.push({
        label: 'Total Portfolio',
        data: totalData,
        borderColor: TOTAL_COLOR.line,
        backgroundColor: (context) => {
          const chart = context.chart
          const { ctx: c, chartArea } = chart
          if (!chartArea) return 'transparent'
          const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
          gradient.addColorStop(0,   'rgba(232,168,0,0.18)')
          gradient.addColorStop(0.6, 'rgba(232,168,0,0.04)')
          gradient.addColorStop(1,   'rgba(232,168,0,0)')
          return gradient
        },
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: TOTAL_COLOR.line,
        pointHoverBorderColor: '#0a1120',
        pointHoverBorderWidth: 2,
        tension: 0.35,
        fill: 'origin',
        order: 1,
        _isTotal: true,
      })

      // Baseline comparison line (faint dashed)
      if (showBaseLine && baseLedger && baseLedger.length > 0) {
        const baseAligned = ages.map((age) => {
          const row = baseLedger.find(r => r.age === age)
          if (!row) return null
          const val = row.totalPortfolioValue ?? 0
          return realMode ? Math.round(val / row.inflationMultiplier) : val
        })
        cjsDatasets.push({
          label: 'Base Case',
          data: baseAligned,
          borderColor: 'rgba(148,163,184,0.35)',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [6, 4],
          pointRadius: 0,
          pointHoverRadius: 0,
          tension: 0.35,
          fill: false,
          order: 3,
          _isBase: true,
        })
      }

      // Emergency fund line — teal dashed, behind everything else
      cjsDatasets.push({
        label: 'Emergency Fund',
        data: efData,
        borderColor: '#2dd4bf',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [4, 3],
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#2dd4bf',
        pointHoverBorderColor: '#0a1120',
        pointHoverBorderWidth: 2,
        tension: 0.35,
        fill: false,
        order: 4,
        _isEF: true,
      })

      // Retirement zone plugin — shades background after earlierRetAge
      const retirementZonePlugin = {
        id: 'retirementZone',
        beforeDraw(chart) {
          if (!earlierRetAge) return
          const { ctx: c, chartArea, scales } = chart
          if (!chartArea || !scales.x) return

          const xScale = scales.x
          const retirementIdx = ages.indexOf(earlierRetAge)
          if (retirementIdx === -1) return

          const xStart = xScale.getPixelForValue(retirementIdx)
          const xEnd   = chartArea.right

          c.save()
          c.fillStyle = 'rgba(232,168,0,0.04)'
          c.fillRect(xStart, chartArea.top, xEnd - xStart, chartArea.bottom - chartArea.top)
          c.restore()
        },
        afterDraw(chart) {
          if (!earlierRetAge && !p1RetAge && !p2RetAge && spousePassesAge === null) return
          const { ctx: c, chartArea, scales } = chart
          if (!chartArea || !scales.x) return

          const drawRetLine = (retAge, color, label) => {
            if (!retAge) return
            const idx = ages.indexOf(retAge)
            if (idx === -1) return
            const x = scales.x.getPixelForValue(idx)

            c.save()
            c.strokeStyle = color
            c.lineWidth = 1.5
            c.setLineDash([5, 4])
            c.globalAlpha = 0.7
            c.beginPath()
            c.moveTo(x, chartArea.top)
            c.lineTo(x, chartArea.bottom)
            c.stroke()

            // Label
            c.setLineDash([])
            c.globalAlpha = 1
            c.font = '10px DM Mono, monospace'
            c.fillStyle = color
            c.textAlign = 'left'
            const labelText = `${label} (${retAge})`
            const textX = x + 5
            const textY = chartArea.top + 14
            c.fillText(labelText, textX, textY)
            c.restore()
          }

          // Draw P2's line first (it may be behind P1's)
          if (p2RetAge && p2RetAge !== p1RetAge) {
            drawRetLine(p2RetAge, 'rgba(167,139,250,0.8)',
              profile.person2.name || 'P2 Retires')
          }
          if (p1RetAge) {
            drawRetLine(p1RetAge, 'rgba(232,168,0,0.9)',
              profile.person1.name || 'P1 Retires')
          }

          // Spouse passes line (surviving-spouse scenario)
          if (spousePassesAge !== null) {
            drawRetLine(spousePassesAge, 'rgba(252,165,165,0.8)', 'Spouse passes')
          }

          // EF depletion triangle marker
          if (efDepletionAge !== null) {
            const efIdx = ages.indexOf(efDepletionAge)
            if (efIdx !== -1) {
              const x = scales.x.getPixelForValue(efIdx)
              // Draw downward-pointing triangle
              const triSize = 7
              const triY    = chartArea.bottom - 12
              c.save()
              c.fillStyle   = '#f87171'
              c.globalAlpha = 0.9
              c.beginPath()
              c.moveTo(x, triY + triSize)          // bottom point
              c.lineTo(x - triSize, triY)           // top-left
              c.lineTo(x + triSize, triY)           // top-right
              c.closePath()
              c.fill()
              // Label
              c.globalAlpha = 1
              c.font        = '9px DM Mono, monospace'
              c.fillStyle   = '#f87171'
              c.textAlign   = 'center'
              c.fillText(`EF ⬇ ${efDepletionAge}`, x, triY - 4)
              c.restore()
            }
          }
        },   // end afterDraw
      }      // end retirementZonePlugin

      // Destroy old chart if it exists
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }

      chartRef.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels: ages,
          datasets: cjsDatasets,
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 400, easing: 'easeInOutQuart' },
          interaction: {
            mode: 'index',
            intersect: false,
          },
          onHover: (event, elements, chart) => {
            if (!elements.length) {
              setHoveredAge(null)
              setTooltipData(null)
              return
            }
            const idx = elements[0].index
            const age = ages[idx]
            const row = ledger[idx]
            if (!row) return
            setHoveredAge(age)

            const acctValues = accountDatasets.map(ds => ({
              id:    ds.id,
              label: ds.label,
              color: ds.color,
              value: realMode
                ? Math.round((row[ds.id] ?? 0) / row.inflationMultiplier)
                : (row[ds.id] ?? 0),
            }))
            const total = realMode
              ? Math.round(row.totalPortfolioValue / row.inflationMultiplier)
              : row.totalPortfolioValue
            const efBal = realMode
              ? Math.round((row.emergencyFundBalance ?? 0) / row.inflationMultiplier)
              : (row.emergencyFundBalance ?? 0)

            setTooltipData({ age, year: row.year, acctValues, total, efBal, row })
          },
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false },  // we render our own
          },
          scales: {
            x: {
              type: 'category',
              grid: {
                color: 'rgba(255,255,255,0.04)',
                drawBorder: false,
              },
              ticks: {
                color: '#64748b',
                font: { family: 'DM Mono, monospace', size: 10 },
                maxTicksLimit: 14,
                maxRotation: 0,
                callback: (val, idx) => ages[idx],
              },
              border: { color: 'rgba(255,255,255,0.06)' },
            },
            y: {
              grid: {
                color: 'rgba(255,255,255,0.04)',
                drawBorder: false,
              },
              ticks: {
                color: '#64748b',
                font: { family: 'DM Mono, monospace', size: 10 },
                callback: (v) => fmt(v),
                maxTicksLimit: 7,
              },
              border: { color: 'rgba(255,255,255,0.06)', dash: [3, 3] },
            },
          },
        },
        plugins: [retirementZonePlugin],
      })
    }

    loadChart()

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledger, realMode, state.accounts, showBaseLine, baseLedger])

  // ── Keyboard: hide tooltip on Escape ───────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { setTooltipData(null); setHoveredAge(null) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Empty state ─────────────────────────────────────────────────────────
  const hasData = ledger.length > 0 && accounts.length > 0

  // ── Stat cards ──────────────────────────────────────────────────────────
  const p1CurAge  = parseInt(profile.person1.age) || null
  const yearsToRet = p1CurAge && p1RetAge ? p1RetAge - p1CurAge : null

  const totalCurrentBalance = accounts.reduce((s, a) => {
    const b = parseFloat(String(a.balance || '').replace(/[$,]/g, ''))
    return s + (isNaN(b) ? 0 : b)
  }, 0)

  const monthlyContribs = accounts.reduce((s, a) => {
    const mc = parseFloat(String(a.monthlyContribution || '').replace(/[$,]/g, ''))
    const mm = parseFloat(String(a.monthlyEmployerMatch || '').replace(/[$,]/g, ''))
    return s + (isNaN(mc) ? 0 : mc) + (isNaN(mm) ? 0 : mm)
  }, 0)

  const p1Income   = parseFloat(String(profile.person1.income || '').replace(/[$,]/g, '')) || 0
  const p2Income   = profile.includePerson2
    ? parseFloat(String(profile.person2.income || '').replace(/[$,]/g, '')) || 0
    : 0
  const totalIncome = p1Income + p2Income
  const savingsRate = totalIncome > 0
    ? Math.round((monthlyContribs * 12 / totalIncome) * 100)
    : null

  const statCards = [
    {
      label: 'Total Portfolio',
      value: totalCurrentBalance > 0 ? fmtFull(totalCurrentBalance) : '—',
      sub: `across ${accounts.length} account${accounts.length !== 1 ? 's' : ''}`,
      accent: false,
    },
    {
      label: 'Years to Retirement',
      value: yearsToRet != null ? String(yearsToRet) : '—',
      sub: p1RetAge ? `${profile.person1.name || 'Person 1'} retires at ${p1RetAge}` : 'Set retirement age',
      accent: false,
    },
    {
      label: 'Savings Rate',
      value: savingsRate != null ? `${savingsRate}%` : '—',
      sub: 'of combined gross income',
      accent: savingsRate != null && savingsRate >= 15,
    },
    {
      label: 'Projected at Retirement',
      value: stats.portfolioAtRetirement != null ? fmt(stats.portfolioAtRetirement) : '—',
      sub: realMode ? "today's dollars (incl. emergency fund)" : 'nominal dollars (incl. emergency fund)',
      accent: true,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Stat cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map(card => (
          <div key={card.label} className="stat-card">
            <span className="text-xs text-slate-500 uppercase tracking-wider font-medium leading-tight">
              {card.label}
            </span>
            <span className={`font-display text-2xl font-semibold leading-tight mt-1 ${
              card.accent ? 'text-gold-400 glow-gold' : 'text-slate-100'
            }`}>
              {card.value}
            </span>
            <span className="text-xs text-slate-600 mt-0.5">{card.sub}</span>
          </div>
        ))}
      </div>

      {/* Chart card */}
      <div className="card !p-0 overflow-hidden">
        {/* Chart header — with Values on/off toggle */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-800">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">Wealth Build Curve</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Portfolio value by age · individual accounts + total ·{' '}
              <span className="text-slate-600">{realMode ? "today's $" : 'nominal $'}</span>
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

        {/* ── Info strip: ABOVE the canvas, wraps to multiple rows, never overlaps ── */}
        {showInfoStrip && (
          <div
            className="border-b border-slate-800/60 bg-slate-900/80 shrink-0"
            style={{ minHeight: 36, maxHeight: 96, overflowY: 'auto',
                     scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}
          >
            {tooltipData ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2">
                <span className="font-mono text-xs font-semibold text-slate-300 shrink-0">
                  Age {tooltipData.age} · {tooltipData.year}
                </span>
                <span className="text-slate-700 shrink-0">|</span>

                {tooltipData.acctValues.map(av => (
                  <span key={av.id} className="flex items-center gap-1.5 shrink-0">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: av.color }} />
                    <span className="text-xs text-slate-500">{av.label}</span>
                    <span className="font-mono text-xs text-slate-200">{fmt(av.value)}</span>
                  </span>
                ))}

                {tooltipData.efBal != null && (
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className="inline-block w-3 border-t-2 border-dashed" style={{ borderColor: '#2dd4bf' }} />
                    <span className="text-xs text-slate-500">EF</span>
                    <span className="font-mono text-xs shrink-0"
                      style={{ color: tooltipData.efBal >= 0 ? '#2dd4bf' : '#f87171' }}>
                      {fmt(tooltipData.efBal)}
                    </span>
                  </span>
                )}

                <span className="text-slate-700 shrink-0">|</span>

                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: TOTAL_COLOR.line }} />
                  <span className="text-xs text-slate-400">Total</span>
                  <span className="font-mono text-sm font-bold text-gold-400">{fmtFull(tooltipData.total)}</span>
                </span>

                {tooltipData.row?.debtBalance > 0 && (
                  <span className="text-xs text-red-400 shrink-0">
                    ⚠ Debt {fmt(tooltipData.row.debtBalance)}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center px-4 py-2.5">
                <span className="text-xs text-slate-600 italic">
                  Move cursor over the chart to see values for each age
                </span>
              </div>
            )}
          </div>
        )}

        {/* Chart canvas — fixed height, never affected by info strip */}
        <div className="relative px-2 pt-3 pb-2" style={{ height: 340 }}>
          {!hasData ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <div className="text-5xl opacity-10 font-display">◈</div>
              <p className="text-slate-500 text-sm font-medium">No data to display</p>
              <p className="text-slate-600 text-xs text-center max-w-xs px-4">
                Complete your profile and add at least one account to see your wealth projection
              </p>
            </div>
          ) : (
            <canvas ref={canvasRef} />
          )}
        </div>

        {/* Legend */}
        {hasData && (
          <div className="px-6 py-4 border-t border-slate-800/60 bg-slate-950/40">
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {accountDatasets.map(ds => (
                <div key={ds.id} className="flex items-center gap-1.5">
                  <span
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{ backgroundColor: ds.color }}
                  />
                  <span className="text-xs text-slate-400">{ds.label}</span>
                </div>
              ))}
              {/* Total legend entry */}
              <div className="flex items-center gap-1.5">
                <span
                  className="w-3 h-2 rounded-sm shrink-0"
                  style={{ backgroundColor: TOTAL_COLOR.line, height: 3, marginTop: 1 }}
                />
                <span className="w-3 h-0.5 rounded shrink-0" style={{ backgroundColor: TOTAL_COLOR.line }}/>
                <span className="text-xs font-medium text-gold-400">Total</span>
              </div>
              {/* Base case legend entry */}
              {showBaseLine && baseLedger && (
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-4 border-t-2 border-dashed border-slate-500/50" />
                  <span className="text-xs text-slate-500">Base Case</span>
                </div>
              )}
              {/* Emergency fund legend entry */}
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: '#2dd4bf', opacity: 0.85 }} />
                <span className="text-xs" style={{ color: '#2dd4bf' }}>Emergency Fund</span>
              </div>
              {/* Spouse passes legend entry — only when scenario is active */}
              {spousePassesAge !== null && (
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: '#fca5a5', opacity: 0.85 }} />
                  <span className="text-xs" style={{ color: '#fca5a5' }}>Spouse passes (age {spousePassesAge})</span>
                </div>
              )}
            </div>

            {/* Retirement zone legend */}
            {earlierRetAge && (
              <div className="mt-2 flex items-center gap-4 text-xs text-slate-600">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 border-t border-dashed border-gold-500/70 inline-block" />
                  <span>{profile.person1.name || 'P1'} retirement (age {p1RetAge})</span>
                </div>
                {p2RetAge && p2RetAge !== p1RetAge && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 border-t border-dashed border-violet-400/70 inline-block" />
                    <span>{profile.person2.name || 'P2'} retirement (P1 age {p2RetAge})</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-2 rounded-sm bg-gold-500/20 inline-block" />
                  <span>Retirement zone</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Portfolio depletion warning */}
      {stats.depletionAge && (
        <div className="flex items-start gap-3 bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3">
          <span className="text-red-400 text-lg shrink-0">⚠</span>
          <div>
            <p className="text-sm font-semibold text-red-300">Portfolio depletes at age {stats.depletionAge}</p>
            <p className="text-xs text-red-400/70 mt-0.5">
              Based on current contributions and spending, your portfolio runs out before your planning horizon.
              Consider increasing contributions, reducing retirement spending, or delaying retirement.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
