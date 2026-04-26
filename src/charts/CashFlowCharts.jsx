import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { useStore } from '../store'
import { useWhatIf, applyOverrides } from '../store/whatif'
import { simulate } from '../engine/simulate'

// ─── Color tokens ─────────────────────────────────────────────────────────────

// Income chart: salary, SS, employer match, RMD, drawdown — all separate segments
// portfolioDrawdown is non-RMD only (RMD is separately tracked)
const INCOME_COLORS = {
  person1Salary:         { color: '#60a5fa', label: 'P1 Salary'           },
  person2Salary:         { color: '#2dd4bf', label: 'P2 Salary'           },
  bridgeIncomePerson1:   { color: '#38bdf8', label: 'P1 Bridge Income'    },
  bridgeIncomePerson2:   { color: '#7dd3fc', label: 'P2 Bridge Income'    },
  socialSecurityPerson1: { color: '#4ade80', label: 'SS – Person 1'       },
  socialSecurityPerson2: { color: '#86efac', label: 'SS – Person 2'       },
  employerContributions: { color: '#c084fc', label: 'Employer Match'      },
  rmdIncome:             { color: '#fb923c', label: 'RMD Income'          },
  portfolioDrawdown:     { color: '#fbbf24', label: 'Portfolio Drawdown'  },
}

// Spending chart: living, health (split: HSA-covered vs cash), contributions, EF, events
const SPENDING_COLORS = {
  livingSpending:       { color: '#f97316', label: 'Living Expenses'        },
  healthFromHSA:        { color: '#34d399', label: 'Healthcare (HSA)'       },
  healthFromCash:       { color: '#f472b6', label: 'Healthcare (cash)'      },
  accountContributions: { color: '#60a5fa', label: 'Account Contributions'  },
  emergencyFundContrib: { color: '#2dd4bf', label: 'Emergency Fund Savings' },
  largeEventSpend:      { color: '#f87171', label: 'Large Events'           },
  estimatedTax:         { color: '#94a3b8', label: 'Est. Federal Tax'       },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null || isNaN(n) || n === 0) return '$0'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000)     return '$' + (n / 1_000).toFixed(0) + 'k'
  return '$' + Math.round(n).toLocaleString()
}

function fmtFull(n) {
  if (n == null || isNaN(n)) return '—'
  return '$' + Math.round(Math.abs(n)).toLocaleString('en-US')
}

/** Deflate a nominal value to real (today's) dollars */
function toReal(value, inflationMultiplier) {
  if (!inflationMultiplier || inflationMultiplier === 0) return value
  return value / inflationMultiplier
}

// ─── Info tooltip ─────────────────────────────────────────────────────────────

function InfoIcon({ text }) {
  const [visible, setVisible] = useState(false)
  return (
    <span className="relative inline-flex items-center">
      <button
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="w-4 h-4 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors text-xs font-bold leading-none cursor-help shrink-0"
        aria-label="Chart information"
      >
        i
      </button>
      {visible && (
        <span
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-slate-800 border border-slate-700
                     text-slate-300 text-xs leading-relaxed rounded-lg px-3 py-2.5 shadow-xl z-50 pointer-events-none"
          style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))' }}
        >
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-700" />
        </span>
      )}
    </span>
  )
}

// ─── Bar chart hover tooltip ──────────────────────────────────────────────────

function BarTooltip({ data, title, colorMap, side, realMode, row }) {
  if (!data) return null

  const entries = Object.entries(colorMap)
    .map(([key, meta]) => ({ key, ...meta, value: data[key] ?? 0 }))
    .filter(e => e.value > 0.5)

  const total = entries.reduce((s, e) => s + e.value, 0)

  // Raw ledger row values (already real/nominal based on mode via mapper)
  const rowTotalIncome  = row ? (realMode
    ? Math.round(row.totalIncome / row.inflationMultiplier)
    : row.totalIncome) : null
  const rowTotalSpend   = row ? (realMode
    ? Math.round(row.totalSpending / row.inflationMultiplier)
    : row.totalSpending) : null
  const surplus = (rowTotalIncome != null && rowTotalSpend != null)
    ? rowTotalIncome - rowTotalSpend
    : null

  return (
    <div
      className={`absolute top-2 ${side === 'left' ? 'left-2' : 'right-2'}
        bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-xl
        shadow-2xl p-3 min-w-[210px] max-w-[250px] z-20 pointer-events-none`}
      style={{ filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.5))' }}
    >
      {/* Header */}
      <div className="flex items-baseline justify-between mb-2 pb-1.5 border-b border-slate-800">
        <span className="text-xs font-semibold text-slate-200">{title}</span>
        <span className="font-mono text-xs text-slate-400">Age {data.age}</span>
      </div>

      {/* Stack breakdown */}
      <div className="space-y-1.5">
        {entries.map(e => (
          <div key={e.key} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: e.color }} />
              <span className="text-xs text-slate-400 truncate">{e.label}</span>
            </div>
            <span className="font-mono text-xs text-slate-200 shrink-0">{fmt(e.value)}</span>
          </div>
        ))}
      </div>

      {/* Total for this chart */}
      <div className="mt-2 pt-1.5 border-t border-slate-800 flex justify-between items-center">
        <span className="text-xs font-semibold text-slate-300">Chart total</span>
        <span className="font-mono text-sm font-bold text-slate-100">{fmt(total)}</span>
      </div>

      {/* Cross-chart summary: income / spending / net */}
      {(rowTotalIncome != null || rowTotalSpend != null) && (
        <div className="mt-2 pt-1.5 border-t border-slate-700/50 space-y-1">
          {rowTotalIncome != null && (
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Total income</span>
              <span className="font-mono text-emerald-400">{fmt(rowTotalIncome)}</span>
            </div>
          )}
          {rowTotalSpend != null && (
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Total spending</span>
              <span className="font-mono text-slate-300">{fmt(rowTotalSpend)}</span>
            </div>
          )}
          {surplus != null && (
            <div className="flex justify-between text-xs pt-0.5 border-t border-slate-800">
              <span className="text-slate-500 font-medium">Net surplus</span>
              <span className={`font-mono font-semibold ${surplus >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {surplus >= 0 ? '+' : ''}{fmt(surplus)}
              </span>
            </div>
          )}
        </div>
      )}

      <p className="mt-1.5 text-xs text-slate-700 text-right">
        {realMode ? "today's $" : 'nominal $'}
      </p>
    </div>
  )
}

// ─── Stacked bar chart component ──────────────────────────────────────────────

function StackedBarChart({
  title,
  subtitle,
  infoText,
  colorMap,
  ledger,
  dataMapper,
  ageRange,
  realMode,
  retirementAges,
  retirementAgeForShading,
}) {
  const canvasRef   = useRef(null)
  const chartRef    = useRef(null)
  const scrollRef   = useRef(null)

  // Tooltip state lives HERE — changes never cause parent to re-render
  const [tooltipData, setTooltipData]     = useState(null)   // { data, row }
  const [showInfoStrip, setShowInfoStrip] = useState(true)   // on/off toggle

  // Stable refs — Chart.js closures always call the latest version
  // without triggering a chart rebuild when these change.
  const setTooltipRef  = useRef(setTooltipData)
  const datamapperRef  = useRef(dataMapper)
  const realModeRef    = useRef(realMode)
  const slicedRef      = useRef([])

  // Keep refs current every render
  setTooltipRef.current  = setTooltipData
  datamapperRef.current  = dataMapper
  realModeRef.current    = realMode

  // Slice ledger to visible age range
  // Use a stable string key so the memoized array doesn't change identity
  // when parent re-renders due to tooltip state changes.
  const ageRangeKey = `${ageRange[0]}-${ageRange[1]}`
  const ledgerKey   = ledger.length + '-' + (ledger[0]?.age ?? 0) + '-' + (ledger[ledger.length - 1]?.age ?? 0)

  const sliced = useMemo(
    () => ledger.filter(r => r.age >= ageRange[0] && r.age <= ageRange[1]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ageRangeKey, ledgerKey]
  )
  slicedRef.current = sliced

  const ages = sliced.map(r => r.age)
  const totalWidth = Math.max(ages.length * 10, 600)

  useEffect(() => {
    if (!canvasRef.current || sliced.length === 0) return

    const loadChart = async () => {
      const { Chart, registerables } = await import('chart.js')
      Chart.register(...registerables)

      const datasets = Object.entries(colorMap).map(([key, meta]) => ({
        label: meta.label,
        data:  sliced.map(r => {
          const mapped = dataMapper(r, realMode)
          return Math.max(0, mapped[key] ?? 0)
        }),
        backgroundColor:      meta.color,
        hoverBackgroundColor: meta.color,
        borderColor:  'transparent',
        borderWidth:  0,
        borderSkipped: false,
        _key: key,
      }))

      const chartAnnotationsPlugin = {
        id: 'chartAnnotations',
        beforeDraw(chart) {
          if (!retirementAgeForShading) return
          const { ctx, chartArea, scales } = chart
          if (!chartArea || !scales.x) return
          const retIdx = ages.indexOf(retirementAgeForShading)
          if (retIdx === -1) return
          const xStart = scales.x.getPixelForValue(retIdx)
          ctx.save()
          ctx.fillStyle = 'rgba(232,168,0,0.04)'
          ctx.fillRect(xStart, chartArea.top, chartArea.right - xStart, chartArea.bottom - chartArea.top)
          ctx.restore()
        },
        afterDraw(chart) {
          if (!retirementAges?.length) return
          const { ctx, chartArea, scales } = chart
          if (!chartArea || !scales.x) return
          retirementAges.forEach(({ age, label, color }) => {
            const idx = ages.indexOf(age)
            if (idx === -1) return
            const x = scales.x.getPixelForValue(idx)
            ctx.save()
            ctx.strokeStyle = color
            ctx.lineWidth   = 1.5
            ctx.setLineDash([4, 3])
            ctx.globalAlpha = 0.7
            ctx.beginPath()
            ctx.moveTo(x, chartArea.top)
            ctx.lineTo(x, chartArea.bottom)
            ctx.stroke()
            ctx.setLineDash([])
            ctx.globalAlpha = 1
            ctx.font      = '9px DM Mono, monospace'
            ctx.fillStyle = color
            ctx.textAlign = 'center'
            ctx.fillText(label, x, chartArea.top + 9)
            ctx.restore()
          })
        },
      }

      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }

      const canvas = canvasRef.current
      canvas.width  = totalWidth
      canvas.height = 220

      chartRef.current = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: { labels: ages, datasets },
        options: {
          responsive:          false,
          maintainAspectRatio: false,
          animation:    { duration: 250, easing: 'easeOutQuart' },
          interaction:  { mode: 'index', intersect: false },
          // All callbacks use refs — zero chart rebuilds on hover
          onHover: (_evt, elements) => {
            if (!elements.length) { setTooltipRef.current(null); return }
            const idx = elements[0].index
            const row = slicedRef.current[idx]
            if (!row) { setTooltipRef.current(null); return }
            const mapped = datamapperRef.current(row, realModeRef.current)
            setTooltipRef.current({ data: { age: row.age, ...mapped }, row })
          },
          plugins: {
            legend:  { display: false },
            tooltip: { enabled: false },
          },
          scales: {
            x: {
              stacked: true,
              grid:   { display: false },
              border: { color: 'rgba(255,255,255,0.06)' },
              ticks:  {
                color: '#64748b',
                font:  { family: 'DM Mono, monospace', size: 9 },
                maxRotation:  0,
                autoSkip:     true,
                maxTicksLimit: 20,
                callback: (_, idx) => ages[idx],
              },
            },
            y: {
              stacked:     true,
              beginAtZero: true,
              grid:  { color: 'rgba(255,255,255,0.04)' },
              border:{ color: 'rgba(255,255,255,0.06)', dash: [3, 3] },
              ticks: {
                color: '#64748b',
                font:  { family: 'DM Mono, monospace', size: 9 },
                callback:    v => fmt(v),
                maxTicksLimit: 6,
              },
            },
          },
          layout: { padding: { top: 14, right: 8, bottom: 0, left: 0 } },
          barPercentage:      0.85,
          categoryPercentage: 0.9,
        },
        plugins: [chartAnnotationsPlugin],
      })
    }

    loadChart()

    return () => {
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sliced, realMode])

  return (
    <div className="card !p-0 overflow-hidden flex flex-col">
      {/* Header — with Values on/off toggle */}
      <div className="px-5 pt-4 pb-3 border-b border-slate-800 shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0">
            <h3 className="font-display text-sm font-semibold text-slate-100">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          </div>
          <InfoIcon text={infoText} />
        </div>
        <button
          onClick={() => setShowInfoStrip(s => !s)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-medium transition-all shrink-0 ${
            showInfoStrip
              ? 'bg-gold-500/15 border-gold-500/30 text-gold-400'
              : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
          }`}
        >
          {showInfoStrip ? 'Values on' : 'Values off'}
        </button>
      </div>

      {/* ── Info strip: ABOVE canvas, wraps to multiple rows, never overlaps bars ── */}
      {showInfoStrip && (
        <div
          className="border-b border-slate-800/60 bg-slate-900/80 shrink-0"
          style={{ minHeight: 36, maxHeight: 88, overflowY: 'auto',
                   scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}
        >
          {tooltipData?.data ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2">
              <span className="font-mono text-xs font-semibold text-slate-300 shrink-0">
                Age {tooltipData.data.age}
              </span>
              <span className="text-slate-700 shrink-0">|</span>

              {Object.entries(colorMap).map(([key, meta]) => {
                const val = tooltipData.data[key] ?? 0
                if (val < 1) return null
                return (
                  <span key={key} className="inline-flex items-center gap-1 shrink-0">
                    <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: meta.color }} />
                    <span className="text-xs text-slate-500">{meta.label}</span>
                    <span className="font-mono text-xs text-slate-200">{fmt(val)}</span>
                  </span>
                )
              })}

              {tooltipData.row && (() => {
                const inflMult = tooltipData.row.inflationMultiplier ?? 1
                const inc     = realMode ? Math.round(tooltipData.row.totalIncome   / inflMult) : tooltipData.row.totalIncome
                const sp      = realMode ? Math.round(tooltipData.row.totalSpending / inflMult) : tooltipData.row.totalSpending
                const surplus = inc - sp
                return (
                  <>
                    <span className="text-slate-700 shrink-0">|</span>
                    <span className="text-xs text-slate-500 shrink-0">
                      Inc <span className="font-mono text-emerald-400">{fmt(inc)}</span>
                    </span>
                    <span className="text-xs text-slate-500 shrink-0">
                      Spend <span className="font-mono text-slate-300">{fmt(sp)}</span>
                    </span>
                    <span className={`font-mono text-xs font-semibold shrink-0 ${surplus >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {surplus >= 0 ? '+' : ''}{fmt(surplus)}
                    </span>
                  </>
                )
              })()}
            </div>
          ) : (
            <div className="flex items-center px-4 py-2.5">
              <span className="text-xs text-slate-600 italic">Move cursor over bars to see values</span>
            </div>
          )}
        </div>
      )}

      {/* Canvas — fixed height, never compressed by info strip */}
      <div className="relative shrink-0" style={{ height: 220 }}>
        <div
          ref={scrollRef}
          className="overflow-x-auto overflow-y-hidden w-full h-full"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}
        >
          <div style={{ width: totalWidth, height: 220 }}>
            <canvas ref={canvasRef} style={{ display: 'block', width: totalWidth, height: 220 }} />
          </div>
        </div>
        {ages.length > 30 && (
          <div className="absolute bottom-1 right-2 text-slate-700 text-xs pointer-events-none select-none">
            scroll →
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="px-5 py-3 border-t border-slate-800/60 bg-slate-950/40 shrink-0">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {Object.entries(colorMap).map(([key, meta]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: meta.color }} />
              <span className="text-xs text-slate-500">{meta.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Zoom Slider ──────────────────────────────────────────────────────────────

function ZoomSlider({ minAge, maxAge, value, onChange }) {
  const trackRef = useRef(null)
  const pct = (v) => ((v - minAge) / (maxAge - minAge)) * 100

  const handleTrackClick = (e) => {
    if (!trackRef.current) return
    const rect  = trackRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const age   = Math.round(minAge + ratio * (maxAge - minAge))
    const distL = Math.abs(age - value[0])
    const distR = Math.abs(age - value[1])
    if (distL <= distR) onChange([Math.min(age, value[1] - 5), value[1]])
    else                onChange([value[0], Math.max(age, value[0] + 5)])
  }

  return (
    <div className="card !py-4 !px-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-slate-400">
            <path d="M6 10.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z"/>
          </svg>
          <span className="text-xs font-medium text-slate-400">Age Range Focus</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-gold-400 font-semibold">{value[0]} – {value[1]}</span>
          <span className="text-xs text-slate-600">({value[1] - value[0] + 1} years)</span>
          <button
            onClick={() => onChange([minAge, maxAge])}
            className="text-xs text-slate-600 hover:text-slate-400 transition-colors ml-1"
            title="Reset zoom"
          >reset</button>
        </div>
      </div>

      <div className="relative h-6 flex items-center" ref={trackRef} onClick={handleTrackClick}>
        {/* Track background */}
        <div className="absolute inset-x-0 h-1.5 bg-slate-800 rounded-full" />
        {/* Active range fill */}
        <div
          className="absolute h-1.5 bg-gold-500/40 rounded-full pointer-events-none"
          style={{ left: `${pct(value[0])}%`, right: `${100 - pct(value[1])}%` }}
        />
        {/* Tick marks */}
        {Array.from({ length: Math.floor((maxAge - minAge) / 5) + 1 }, (_, i) => {
          const age = minAge + i * 5
          if (age > maxAge) return null
          return (
            <div
              key={age}
              className="absolute w-px h-2 bg-slate-700 -translate-x-0.5 pointer-events-none"
              style={{ left: `${pct(age)}%`, top: 'calc(50% + 5px)' }}
            />
          )
        })}

        {/*
          Two full-width range inputs stacked on top of each other.
          The one whose thumb is CLOSER to the pointer gets z-index priority,
          so either thumb is always reachable no matter where the other sits.
          This is the standard dual-range pattern that works at all positions.
        */}
        {/* Left (start) input — full width, controls value[0] */}
        <input
          type="range"
          min={minAge}
          max={maxAge - 1}
          step={1}
          value={value[0]}
          onChange={e => {
            const v = parseInt(e.target.value)
            onChange([Math.min(v, value[1] - 1), value[1]])
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          style={{ zIndex: value[0] >= (value[1] - minAge) / 2 + minAge ? 5 : 4, pointerEvents: 'auto' }}
        />
        {/* Right (end) input — full width, controls value[1] */}
        <input
          type="range"
          min={minAge + 1}
          max={maxAge}
          step={1}
          value={value[1]}
          onChange={e => {
            const v = parseInt(e.target.value)
            onChange([value[0], Math.max(v, value[0] + 1)])
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          style={{ zIndex: value[1] <= (value[0] + maxAge) / 2 ? 5 : 4, pointerEvents: 'auto' }}
        />

        {/* Visual thumb — left */}
        <div
          className="absolute w-4 h-4 bg-gold-400 border-2 border-slate-950 rounded-full shadow-lg -translate-x-1/2 pointer-events-none"
          style={{ left: `${pct(value[0])}%`, zIndex: 6 }}
        />
        {/* Visual thumb — right */}
        <div
          className="absolute w-4 h-4 bg-gold-400 border-2 border-slate-950 rounded-full shadow-lg -translate-x-1/2 pointer-events-none"
          style={{ left: `${pct(value[1])}%`, zIndex: 6 }}
        />
      </div>

      <div className="flex justify-between mt-1 text-xs text-slate-700 font-mono select-none">
        <span>{minAge}</span>
        {Array.from({ length: Math.floor((maxAge - minAge) / 10) }, (_, i) => (
          <span key={i}>{minAge + (i + 1) * 10}</span>
        ))}
        <span>{maxAge}</span>
      </div>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function CashFlowCharts() {
  const { state }     = useStore()
  const { overrides } = useWhatIf()

  const effectiveState = useMemo(() => applyOverrides(state, overrides), [state, overrides])
  const ledger         = useMemo(() => simulate(effectiveState),          [effectiveState])

  const { profile } = effectiveState
  const minAge = parseInt(profile.person1.age)           || 25
  const maxAge = parseInt(profile.planningHorizonAge)    || 100

  // Shared real/nominal mode from context (controlled by Dashboard header toggle)
  const { realMode } = useWhatIf()

  const [ageRange, setAgeRange] = useState(() => [minAge, Math.min(minAge + 50, maxAge)])

  const stableMinAge = Math.max(minAge, ledger[0]?.age   ?? minAge)
  const stableMaxAge = Math.min(maxAge, ledger[ledger.length - 1]?.age ?? maxAge)
  const clampedRange = [
    Math.max(ageRange[0], stableMinAge),
    Math.min(ageRange[1], stableMaxAge),
  ]

  // Retirement line annotations (use effective state to reflect overrides)
  const p1RetAge = parseInt(profile.person1.retirementAge) || null
  const p1CurAge = parseInt(profile.person1.age)           || null
  const p2CurAge = parseInt(profile.person2.age)           || null
  const p2RetAge = profile.includePerson2 && p2CurAge && p1CurAge
    ? p1CurAge + (parseInt(profile.person2.retirementAge) - p2CurAge)
    : null

  const retirementAges = [
    p1RetAge && { age: p1RetAge, label: `${profile.person1.name || 'P1'} ret.`, color: 'rgba(232,168,0,0.85)' },
    p2RetAge && p2RetAge !== p1RetAge && { age: p2RetAge, label: `${profile.person2.name || 'P2'} ret.`, color: 'rgba(167,139,250,0.85)' },
  ].filter(Boolean)

  // ── Data mappers ──────────────────────────────────────────────────────────
  // Each mapper reads directly from ledger row fields — no recalculation.
  // The `realMode` flag is passed in so the mapper can deflate values once.
  //
  // INCOME mapper:
  //   - portfolioDrawdown = non-RMD drawdown only (RMD is its own segment)
  //   - employerContributions = 0 post-retirement (engine fix already ensures this)
  const incomeMapper = useCallback((row, rm) => {
    const d = rm ? (v => toReal(v, row.inflationMultiplier)) : (v => v)
    return {
      person1Salary:          d(row.person1Salary         ?? 0),
      person2Salary:          d(row.person2Salary         ?? 0),
      bridgeIncomePerson1:    d(row.bridgeIncomePerson1   ?? 0),
      bridgeIncomePerson2:    d(row.bridgeIncomePerson2   ?? 0),
      socialSecurityPerson1:  d(row.socialSecurityPerson1 ?? 0),
      socialSecurityPerson2:  d(row.socialSecurityPerson2 ?? 0),
      employerContributions:  d(row.employerContributions ?? 0),
      rmdIncome:              d(row.rmdIncome             ?? 0),
      portfolioDrawdown:      d(row.portfolioDrawdown     ?? 0),
    }
  }, [])

  // SPENDING mapper:
  //   - Split healthcare into HSA-covered vs cash portions
  //   - accountContributions = 0 post-retirement (engine fix already ensures this)
  //   - emergencyFundContrib only when positive (saving, not drawing)
  //   - largeEventSpend = abs of negative events only (expenses, not windfalls)
  const spendMapper = useCallback((row, rm) => {
    const d = rm ? (v => toReal(v, row.inflationMultiplier)) : (v => v)
    const hsaUsed     = row.hsaWithdrawal ?? 0
    const totalHealth = row.healthSpending ?? 0
    return {
      livingSpending:       d(row.livingSpending      ?? 0),
      healthFromHSA:        d(Math.min(hsaUsed, totalHealth)),
      healthFromCash:       d(Math.max(0, totalHealth - hsaUsed)),
      accountContributions: d(row.accountContributions ?? 0),
      emergencyFundContrib: d(Math.max(0, row.emergencyFundContribution ?? 0)),
      largeEventSpend:      d(Math.max(0, -(row.largeEvents ?? 0))),
      // Tax shown only post-retirement (pre-retirement payroll taxes are outside scope)
      estimatedTax:         row.p1Retired ? d(row.estimatedTax ?? 0) : 0,
    }
  }, [])

  if (ledger.length === 0) {
    return (
      <div className="card flex items-center justify-center h-48">
        <div className="text-center">
          <div className="text-3xl opacity-10 mb-2">◑</div>
          <p className="text-slate-600 text-sm">Complete your profile to see cash flow charts</p>
        </div>
      </div>
    )
  }

  // ── Data validity guard ──────────────────────────────────────────────────
  // Warn if values look impossibly large (indicates a calculation bug)
  const hasUnreasonableValues = ledger.some(
    r => r.totalIncome > 10_000_000 || r.livingSpending > 5_000_000
  )
  if (hasUnreasonableValues) {
    const firstFive = ledger.slice(0, 5)
    console.warn('[FWP] Unusually large projection values detected. First 5 rows:',
      firstFive.map(r => ({
        age: r.age,
        totalIncome: r.totalIncome,
        totalSpending: r.totalSpending,
        livingSpending: r.livingSpending,
        inflationMultiplier: r.inflationMultiplier,
      }))
    )
  }

  const INFO_INCOME = realMode
    ? "Values shown in today's dollars (inflation-adjusted). Each bar shows what that future income is worth in purchasing power relative to today. Toggle to Nominal to see the actual future dollar amounts."
    : "Values shown in nominal (future) dollars — the actual amount received in that year, not adjusted for inflation. Toggle to Real to see purchasing-power-adjusted values."

  const INFO_SPEND = realMode
    ? "Values shown in today's dollars (inflation-adjusted). Bars should grow slowly and smoothly — rapid growth indicates an issue. Toggle to Nominal to see future dollar amounts."
    : "Values shown in nominal (future) dollars. Bars grow with inflation each year, which is why they increase over time even if your real spending is flat."

  return (
    <div className="space-y-4">
      {/* Data validity warning banner */}
      {hasUnreasonableValues && (
        <div className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/25 rounded-xl px-4 py-3">
          <span className="text-yellow-400 shrink-0 mt-0.5">⚠</span>
          <p className="text-xs text-yellow-400/90 leading-relaxed">
            Projection values look unusually high — please check your account balances and growth rates.
            Values above $10M/year income or $5M/year spending may indicate a data entry issue.
          </p>
        </div>
      )}

      {/* Section header — no local toggle; controlled by Dashboard header */}
      <div>
        <p className="text-xs font-medium text-gold-500 uppercase tracking-widest mb-0.5">Cash Flow</p>
        <h2 className="font-display text-lg font-semibold text-slate-100">Income &amp; Spending Over Time</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {realMode ? "Today's dollars (inflation-adjusted)" : 'Nominal dollars (future amounts)'}
          {' · '}use the zoom slider to focus on any age range
        </p>
      </div>

      {/* Dual charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <StackedBarChart
          title="Income by Source"
          subtitle={realMode ? "Annual income · today's dollars" : "Annual income · nominal dollars"}
          infoText={INFO_INCOME}
          colorMap={INCOME_COLORS}
          ledger={ledger}
          dataMapper={incomeMapper}
          ageRange={clampedRange}
          realMode={realMode}
          retirementAges={retirementAges}
          retirementAgeForShading={p1RetAge}
        />
        <StackedBarChart
          title="Spending by Category"
          subtitle={realMode ? "Annual spending · today's dollars" : "Annual spending · nominal dollars"}
          infoText={INFO_SPEND}
          colorMap={SPENDING_COLORS}
          ledger={ledger}
          dataMapper={spendMapper}
          ageRange={clampedRange}
          realMode={realMode}
          retirementAges={retirementAges}
          retirementAgeForShading={p1RetAge}
        />
      </div>

      {/* Shared zoom slider */}
      <ZoomSlider
        minAge={stableMinAge}
        maxAge={stableMaxAge}
        value={clampedRange}
        onChange={setAgeRange}
      />

      {/* Quick zoom presets */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-600">Quick zoom:</span>
        {[
          { label: 'Working years', range: () => [stableMinAge, Math.min(p1RetAge ?? stableMinAge + 30, stableMaxAge)] },
          { label: 'Retirement',    range: () => [Math.max(p1RetAge ?? stableMinAge, stableMinAge), stableMaxAge] },
          { label: 'Age 50–75',     range: () => [Math.max(50, stableMinAge), Math.min(75, stableMaxAge)] },
          { label: 'All ages',      range: () => [stableMinAge, stableMaxAge] },
        ].map(preset => (
          <button
            key={preset.label}
            onClick={() => setAgeRange(preset.range())}
            className="text-xs px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors border border-slate-700"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  )
}
