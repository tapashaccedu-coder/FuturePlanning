import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useStore, ACTIONS } from '../store'
import { simulate, summarize } from '../engine/simulate'

// ─── LocalStorage key for saved scenarios ─────────────────────────────────────
const LS_SCENARIOS = 'fwp_saved_scenarios'

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

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return iso }
}

function loadScenarios() {
  try {
    return JSON.parse(localStorage.getItem(LS_SCENARIOS) || '[]')
  } catch { return [] }
}

function saveScenarios(list) {
  try { localStorage.setItem(LS_SCENARIOS, JSON.stringify(list)) } catch {}
}

// ─── Comparison Line Chart (vanilla Canvas, no Chart.js dep here) ─────────────

function ComparisonChart({ scenarios }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || scenarios.length < 1) return

    const loadChart = async () => {
      const { Chart, registerables } = await import('chart.js')
      Chart.register(...registerables)

      // Destroy old
      const existing = Chart.getChart(canvas)
      if (existing) existing.destroy()

      const COLORS = ['#e8a800','#60a5fa','#f97316','#a78bfa','#34d399','#f472b6']

      const allAges = scenarios[0].ledger.map(r => r.age)

      const datasets = scenarios.map((sc, i) => ({
        label: sc.name,
        data: sc.ledger.map(r => r.totalPortfolioValue),
        borderColor: COLORS[i % COLORS.length],
        backgroundColor: 'transparent',
        borderWidth: i === 0 ? 2.5 : 1.75,
        pointRadius: 0,
        pointHoverRadius: 5,
        tension: 0.35,
        fill: false,
      }))

      new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels: allAges, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 400 },
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: {
                color: '#94a3b8',
                font: { family: 'DM Sans, sans-serif', size: 11 },
                boxWidth: 12,
                padding: 16,
              },
            },
            tooltip: {
              backgroundColor: '#0f172a',
              borderColor: '#334155',
              borderWidth: 1,
              titleColor: '#94a3b8',
              bodyColor: '#e2e8f0',
              callbacks: {
                title: items => `Age ${items[0].label}`,
                label: item => ` ${item.dataset.label}: ${fmtM(item.raw)}`,
              },
            },
          },
          scales: {
            x: {
              grid: { color: 'rgba(255,255,255,0.04)' },
              ticks: {
                color: '#475569',
                font: { family: 'DM Mono, monospace', size: 9 },
                maxTicksLimit: 14,
              },
              border: { color: 'rgba(255,255,255,0.06)' },
            },
            y: {
              grid: { color: 'rgba(255,255,255,0.04)' },
              ticks: {
                color: '#475569',
                font: { family: 'DM Mono, monospace', size: 9 },
                callback: v => fmtM(v),
                maxTicksLimit: 6,
              },
              border: { color: 'rgba(255,255,255,0.06)', dash: [3, 3] },
            },
          },
        },
      })
    }
    loadChart()
  }, [scenarios])

  return (
    <div style={{ height: 320, position: 'relative' }}>
      <canvas ref={canvasRef} />
    </div>
  )
}

// ─── Print styles injected into <head> ───────────────────────────────────────

const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 15mm 15mm 15mm 15mm; }
  body { background: white !important; color: #111 !important; font-family: 'DM Sans', sans-serif; font-size: 11pt; }
  .no-print { display: none !important; }
  .print-only { display: block !important; }
  .print-page { display: block !important; page-break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  thead tr { background: #f1f5f9; }
  th, td { border: 1px solid #e2e8f0; padding: 4px 8px; text-align: right; }
  th:first-child, td:first-child { text-align: left; }
  .metric-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px; }
  .metric-box { border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px 12px; }
  .metric-label { font-size: 8pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
  .metric-value { font-size: 16pt; font-weight: 700; color: #0f172a; margin-top: 2px; }
  .metric-sub { font-size: 8pt; color: #94a3b8; }
  .print-header { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 16px; }
  .print-title { font-size: 20pt; font-weight: 700; color: #0f172a; }
  .print-subtitle { font-size: 10pt; color: #64748b; margin-top: 2px; }
  .section-heading { font-size: 11pt; font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin: 14px 0 8px 0; }
  .chart-img { width: 100%; max-height: 220px; object-fit: contain; margin-bottom: 8px; }
  tr:nth-child(even) { background: #f8fafc; }
}
`

// ─── Print preview builder ────────────────────────────────────────────────────

function buildPrintDocument(state, ledger, stats, chartImageUrl) {
  const p1 = state.profile.person1
  const p2 = state.profile.includePerson2 ? state.profile.person2 : null
  const householdName = [p1.name, p2?.name].filter(Boolean).join(' & ') || 'My Household'
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const metrics = [
    { label: 'Portfolio at Retirement', value: fmtM(stats.portfolioAtRetirement), sub: `Age ${stats.retirementAge ?? '—'}` },
    { label: 'Money Runs Out At',       value: stats.depletionAge ? `Age ${stats.depletionAge}` : '100+', sub: stats.depletionAge ? 'Plan review recommended' : 'Outlasts planning horizon' },
    { label: 'Peak Portfolio',          value: fmtM(stats.peakPortfolio), sub: 'Nominal dollars' },
    { label: 'Lifetime SS Income',      value: fmtM(stats.totalSSLifetime), sub: 'Combined, nominal' },
    { label: 'Person 1',                value: p1.name || '—', sub: `Age ${p1.age} · Retires ${p1.retirementAge}` },
    { label: p2 ? 'Person 2' : 'Status', value: p2 ? p2.name : 'Single', sub: p2 ? `Age ${p2.age} · Retires ${p2.retirementAge}` : '' },
  ]

  const tableRows = ledger
    .filter(r => r.age % 2 === 0 || r.p1Retired !== ledger[ledger.indexOf(r) - 1]?.p1Retired)  // every 2 years + transition
    .slice(0, 50)
    .map(r => `
      <tr>
        <td>${r.age}</td>
        <td>${r.year}</td>
        <td>${r.p1Retired ? 'Retired' : 'Working'}</td>
        <td>${fmtFull(r.person1Salary + r.person2Salary)}</td>
        <td>${fmtFull(r.socialSecurityPerson1 + r.socialSecurityPerson2)}</td>
        <td>${fmtFull(r.livingSpending + r.healthSpending)}</td>
        <td>${fmtFull(r.portfolioDrawdown)}</td>
        <td>${fmtFull(r.totalPortfolioValue)}</td>
        <td>${fmtFull(r.emergencyFundBalance)}</td>
      </tr>
    `).join('')

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>FamilyWealthPlanner — ${householdName}</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=DM+Mono:wght@400&display=swap" rel="stylesheet"/>
  <style>
    body { font-family: 'DM Sans', sans-serif; font-size: 11pt; color: #111; background: white; margin: 0; padding: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    thead tr { background: #f1f5f9; }
    th, td { border: 1px solid #e2e8f0; padding: 4px 8px; text-align: right; }
    th:first-child, td:first-child { text-align: left; }
    tr:nth-child(even) { background: #f8fafc; }
    .metric-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 16px; }
    .metric-box { border: 1px solid #e2e8f0; border-radius: 4px; padding: 10px 14px; }
    .metric-label { font-size: 8pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
    .metric-value { font-size: 15pt; font-weight: 700; color: #0f172a; }
    .metric-sub { font-size: 8pt; color: #94a3b8; margin-top: 1px; }
    .print-header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-end; }
    .print-title { font-size: 20pt; font-weight: 700; color: #0f172a; }
    .print-subtitle { font-size: 10pt; color: #64748b; }
    .section-heading { font-size: 11pt; font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin: 16px 0 10px 0; }
    .chart-img { width: 100%; max-height: 240px; object-fit: contain; display: block; margin-bottom: 12px; border: 1px solid #e2e8f0; border-radius: 4px; }
    .footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 8pt; color: #94a3b8; display: flex; justify-content: space-between; }
    @media print { @page { size: A4 portrait; margin: 12mm; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="print-header">
    <div>
      <div class="print-title">FamilyWealthPlanner</div>
      <div class="print-subtitle">${householdName} · Retirement Plan Summary</div>
    </div>
    <div style="text-align:right; font-size:9pt; color:#64748b;">
      Generated ${today}<br/>
      Planning horizon: age ${state.profile.planningHorizonAge}
    </div>
  </div>

  <div class="section-heading">Key Metrics</div>
  <div class="metric-grid">
    ${metrics.map(m => `
      <div class="metric-box">
        <div class="metric-label">${m.label}</div>
        <div class="metric-value">${m.value}</div>
        <div class="metric-sub">${m.sub}</div>
      </div>
    `).join('')}
  </div>

  ${chartImageUrl ? `
    <div class="section-heading">Wealth Build Curve</div>
    <img src="${chartImageUrl}" class="chart-img" alt="Portfolio projection chart"/>
  ` : ''}

  <div class="section-heading">Annual Projection (every 2 years)</div>
  <table>
    <thead>
      <tr>
        <th>Age</th><th>Year</th><th>Phase</th>
        <th>Salary</th><th>SS Income</th><th>Spending</th>
        <th>Drawdown</th><th>Portfolio</th><th>Emerg. Fund</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>

  <div class="footer">
    <span>FamilyWealthPlanner · Projections are estimates, not financial advice</span>
    <span>Inflation rate: ${state.profile.inflationRate}% · All values nominal dollars</span>
  </div>
</body>
</html>`
}

// ─── Scenario Card ────────────────────────────────────────────────────────────

function ScenarioCard({ scenario, isSelected, onSelect, onLoad, onDelete, selectionMode }) {
  const { stats } = scenario

  return (
    <div className={`
      relative rounded-xl border transition-all duration-150 overflow-hidden
      ${isSelected
        ? 'border-gold-500/50 bg-gold-500/8'
        : 'border-slate-800 bg-slate-900 hover:border-slate-700'
      }
    `}>
      {/* Selection checkbox for compare mode */}
      {selectionMode && (
        <button
          onClick={onSelect}
          className={`absolute top-3 right-3 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
            isSelected
              ? 'bg-gold-500 border-gold-500'
              : 'border-slate-600 hover:border-gold-500'
          }`}
        >
          {isSelected && (
            <svg viewBox="0 0 10 8" className="w-3 h-3 fill-slate-950">
              <path d="M1 4l3 3 5-6" stroke="#0a1120" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
            </svg>
          )}
        </button>
      )}

      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0 pr-8">
            <h3 className="font-semibold text-slate-100 truncate">{scenario.name}</h3>
            <p className="text-xs text-slate-600 mt-0.5">{fmtDate(scenario.savedAt)}</p>
          </div>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="bg-slate-800/60 rounded-lg p-3">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">At Retirement</div>
            <div className="font-mono text-sm font-semibold text-gold-400">
              {fmtM(stats.portfolioAtRetirement)}
            </div>
          </div>
          <div className="bg-slate-800/60 rounded-lg p-3">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Lasts Until</div>
            <div className={`font-mono text-sm font-semibold ${
              stats.depletionAge ? 'text-red-400' : 'text-emerald-400'
            }`}>
              {stats.depletionAge ? `Age ${stats.depletionAge}` : '100+'}
            </div>
          </div>
        </div>

        {/* Profile snapshot */}
        <div className="text-xs text-slate-600 mb-4 space-y-0.5">
          <div>
            {scenario.state.profile.person1.name || 'Person 1'} ·
            age {scenario.state.profile.person1.age} →
            retires {scenario.state.profile.person1.retirementAge}
          </div>
          {scenario.state.profile.includePerson2 && (
            <div>
              {scenario.state.profile.person2.name || 'Person 2'} ·
              age {scenario.state.profile.person2.age} →
              retires {scenario.state.profile.person2.retirementAge}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onLoad}
            className="flex-1 btn-primary text-xs py-1.5"
          >
            Load
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1.5 rounded-lg text-xs border border-slate-700 text-slate-500 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/8 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Scenarios() {
  const { state, dispatch } = useStore()
  const [scenarios, setScenarios]             = useState(() => loadScenarios())
  const [saveModalOpen, setSaveModalOpen]      = useState(false)
  const [saveName, setSaveName]                = useState('')
  const [compareMode, setCompareMode]          = useState(false)
  const [selectedIds, setSelectedIds]          = useState([])
  const [importError, setImportError]          = useState('')
  const [importSuccess, setImportSuccess]      = useState(false)
  const [exportingPdf, setExportingPdf]        = useState(false)
  const fileInputRef = useRef(null)

  // Current ledger + stats
  const ledger = useMemo(() => simulate(state), [state])
  const stats  = useMemo(() => summarize(ledger), [ledger])

  // ── Save scenario ─────────────────────────────────────────────────────────
  const handleSave = () => {
    if (!saveName.trim()) return
    const { _ui, ...persistState } = state
    const entry = {
      id:      `sc_${Date.now()}`,
      name:    saveName.trim(),
      savedAt: new Date().toISOString(),
      state:   persistState,
      stats: {
        portfolioAtRetirement: stats.portfolioAtRetirement,
        depletionAge:          stats.depletionAge,
        retirementAge:         stats.retirementAge,
        peakPortfolio:         stats.peakPortfolio,
        totalSSLifetime:       stats.totalSSLifetime,
      },
      ledger,
    }
    const updated = [entry, ...scenarios]
    setScenarios(updated)
    saveScenarios(updated.map(s => ({ ...s, ledger: undefined })))  // don't bloat LS with full ledger
    setSaveName('')
    setSaveModalOpen(false)
  }

  // Re-hydrate ledgers for saved scenarios (recompute from stored state)
  const scenariosWithLedger = useMemo(() =>
    scenarios.map(s => ({
      ...s,
      ledger: s.ledger || simulate(s.state),
    })),
    [scenarios]
  )

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = (id) => {
    const updated = scenarios.filter(s => s.id !== id)
    setScenarios(updated)
    saveScenarios(updated)
    setSelectedIds(prev => prev.filter(sid => sid !== id))
  }

  // ── Load scenario into active state ──────────────────────────────────────
  const handleLoad = (scenario) => {
    dispatch({ type: ACTIONS.LOAD_STATE, payload: scenario.state })
  }

  // ── Compare selection ─────────────────────────────────────────────────────
  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(sid => sid !== id)
        : prev.length < 2 ? [...prev, id] : [prev[1], id]
    )
  }

  const comparisonScenarios = scenariosWithLedger.filter(s => selectedIds.includes(s.id))

  // ── JSON Export ───────────────────────────────────────────────────────────
  const handleExportJSON = () => {
    const { _ui, ...exportState } = state
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), state: exportState }, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `fwp_plan_${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── JSON Import ───────────────────────────────────────────────────────────
  const handleImportJSON = (e) => {
    setImportError('')
    setImportSuccess(false)
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result)
        const importedState = parsed.state ?? parsed
        if (!importedState.profile?.person1) {
          setImportError('Invalid file: missing profile data.')
          return
        }
        dispatch({ type: ACTIONS.LOAD_STATE, payload: importedState })
        setImportSuccess(true)
        setTimeout(() => setImportSuccess(false), 3000)
      } catch {
        setImportError('Could not parse file. Make sure it is a valid FWP JSON export.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // ── PDF Export ────────────────────────────────────────────────────────────
  const handleExportPDF = async () => {
    setExportingPdf(true)
    try {
      // Try to capture the wealth chart canvas as a base64 image
      let chartImageUrl = null
      try {
        const { Chart } = await import('chart.js')
        const charts = Object.values(Chart.instances)
        if (charts.length > 0) {
          chartImageUrl = charts[0].toBase64Image('image/png', 1)
        }
      } catch {}

      const htmlContent = buildPrintDocument(state, ledger, stats, chartImageUrl)
      const printWin = window.open('', '_blank', 'width=900,height=700')
      if (!printWin) {
        alert('Please allow popups for this page to use PDF export.')
        return
      }
      printWin.document.write(htmlContent)
      printWin.document.close()
      printWin.onload = () => {
        setTimeout(() => {
          printWin.print()
          printWin.close()
        }, 600)
      }
    } finally {
      setExportingPdf(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const p1Name = state.profile.person1.name || 'Person 1'

  return (
    <div className="page-enter space-y-10 w-full">

      {/* ── PAGE HEADER ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-gold-500 uppercase tracking-widest mb-1">Planning</p>
          <h1 className="page-title">Scenarios</h1>
          <p className="text-slate-400 text-sm mt-1">
            Save snapshots of your plan, compare scenarios, and export for your records.
          </p>
        </div>

        {/* Export / Import cluster */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <button
            onClick={handleExportJSON}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>
            Export JSON
          </button>

          <label className="btn-secondary text-xs flex items-center gap-1.5 cursor-pointer">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V10.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 0-.708.708l-3-3z" transform="scale(1,-1) translate(0,-12)"/><path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V10.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z"/></svg>
            Import JSON
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportJSON}
            />
          </label>

          <button
            onClick={handleExportPDF}
            disabled={exportingPdf || ledger.length === 0}
            className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2zM9.5 3A1.5 1.5 0 0 0 11 4.5h2V9H3V2a1 1 0 0 1 1-1h5.5v2zM3 12v-2h2v2H3zm0 1h2v1H4a1 1 0 0 1-1-1zm3 1v-2h3v2H6zm4 0v-2h2v1a1 1 0 0 1-1 1h-1zm2-3h-2v-2h2v2zm-4 0H6v-2h3v2z"/></svg>
            {exportingPdf ? 'Preparing…' : 'Export PDF'}
          </button>
        </div>
      </div>

      {/* Import feedback */}
      {importError && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          <span>⚠</span> {importError}
        </div>
      )}
      {importSuccess && (
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3 text-sm text-emerald-400">
          <span>✓</span> Plan imported successfully and loaded into the app.
        </div>
      )}

      {/* ── SAVE CURRENT SCENARIO ── */}
      <section className="card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="section-title">Save Current Scenario</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Snapshots the current plan with all accounts, settings, and projections.
            </p>
          </div>
          <button
            onClick={() => setSaveModalOpen(o => !o)}
            className="btn-primary text-sm"
          >
            + Save Snapshot
          </button>
        </div>

        {saveModalOpen && (
          <div className="flex gap-2 items-start pt-1">
            <div className="flex-1">
              <input
                autoFocus
                className="input"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder='e.g. "Base case 2025" or "Early retirement scenario"'
              />
            </div>
            <button onClick={handleSave} disabled={!saveName.trim()} className="btn-primary disabled:opacity-40">
              Save
            </button>
            <button onClick={() => { setSaveModalOpen(false); setSaveName('') }} className="btn-secondary">
              Cancel
            </button>
          </div>
        )}

        {/* Current plan quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-slate-800">
          {[
            { label: 'At Retirement', val: fmtM(stats.portfolioAtRetirement), accent: true },
            { label: 'Lasts Until',   val: stats.depletionAge ? `Age ${stats.depletionAge}` : '100+', warn: !!stats.depletionAge },
            { label: 'Peak Portfolio',val: fmtM(stats.peakPortfolio), accent: false },
            { label: 'Retirement Age', val: stats.retirementAge ? `Age ${stats.retirementAge}` : '—', accent: false },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-xs text-slate-600 uppercase tracking-wider mb-1">{s.label}</div>
              <div className={`font-mono text-sm font-bold ${
                s.accent ? 'text-gold-400' : s.warn ? 'text-red-400' : 'text-slate-300'
              }`}>{s.val}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── SAVED SCENARIOS ── */}
      {scenariosWithLedger.length === 0 ? (
        <div className="border border-dashed border-slate-700 rounded-xl flex flex-col items-center justify-center py-14 gap-3">
          <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-2xl text-slate-700">◎</div>
          <p className="text-slate-400 font-medium">No saved scenarios yet</p>
          <p className="text-slate-600 text-sm text-center max-w-xs">
            Save your current plan to create a snapshot you can return to or compare against future changes.
          </p>
        </div>
      ) : (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="section-title">
              Saved Scenarios
              <span className="ml-2 text-sm font-normal text-slate-500">({scenariosWithLedger.length})</span>
            </h2>
            <button
              onClick={() => { setCompareMode(m => !m); setSelectedIds([]) }}
              className={`text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all ${
                compareMode
                  ? 'bg-gold-500/15 border-gold-500/40 text-gold-400'
                  : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
                <path d="M1 11a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-3zm5-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7zm5-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V2z"/>
              </svg>
              {compareMode ? 'Exit compare' : 'Compare two'}
            </button>
          </div>

          {compareMode && (
            <div className="flex items-center gap-2 bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-400">
              <span className="text-gold-400">◈</span>
              Select up to 2 scenarios to overlay their wealth curves.
              <span className="ml-auto text-xs text-slate-600">{selectedIds.length}/2 selected</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {scenariosWithLedger.map(sc => (
              <ScenarioCard
                key={sc.id}
                scenario={sc}
                isSelected={selectedIds.includes(sc.id)}
                onSelect={() => toggleSelect(sc.id)}
                onLoad={() => handleLoad(sc)}
                onDelete={() => handleDelete(sc.id)}
                selectionMode={compareMode}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── COMPARISON CHART ── */}
      {compareMode && comparisonScenarios.length >= 1 && (
        <section className="card space-y-4">
          <div>
            <h2 className="section-title">Scenario Comparison</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Wealth build curves overlaid — {comparisonScenarios.map(s => s.name).join(' vs. ')}
            </p>
          </div>

          <ComparisonChart scenarios={comparisonScenarios} />

          {/* Delta table */}
          {comparisonScenarios.length === 2 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left py-2 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Metric</th>
                    {comparisonScenarios.map(sc => (
                      <th key={sc.id} className="text-right py-2 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                        {sc.name}
                      </th>
                    ))}
                    <th className="text-right py-2 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Δ Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Portfolio at Retirement', key: 'portfolioAtRetirement', fmt: fmtM },
                    { label: 'Peak Portfolio',          key: 'peakPortfolio',          fmt: fmtM },
                    { label: 'Lasts Until',             key: 'depletionAge',           fmt: v => v ? `Age ${v}` : '100+' },
                    { label: 'Lifetime SS',             key: 'totalSSLifetime',        fmt: fmtM },
                  ].map(row => {
                    const [a, b] = comparisonScenarios.map(s => s.stats[row.key])
                    const delta  = (a ?? 0) - (b ?? 0)
                    return (
                      <tr key={row.key} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                        <td className="py-2.5 px-3 text-slate-300">{row.label}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-200">{row.fmt(a)}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-200">{row.fmt(b)}</td>
                        <td className={`py-2.5 px-3 text-right font-mono font-semibold ${
                          delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-slate-500'
                        }`}>
                          {row.key === 'depletionAge'
                            ? (delta === 0 ? '—' : delta > 0 ? `+${delta} yrs` : `${delta} yrs`)
                            : (delta === 0 ? '—' : (delta > 0 ? '+' : '') + fmtM(delta))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── AGE-BY-AGE TABLE ── */}
      {ledger.length > 0 && (
        <ProjectionTable ledger={ledger} accounts={state.accounts} />
      )}
    </div>
  )
}

// ─── Projection Table with column toggles + CSV/Excel export ─────────────────

function ProjectionTable({ ledger, accounts }) {
  // ── Real vs Nominal toggle ────────────────────────────────────────────────
  const [realMode, setRealMode] = useState(false)

  // Deflate a nominal value using the row's inflationMultiplier
  const d = (nominalVal, row) =>
    realMode ? Math.round(nominalVal / (row.inflationMultiplier ?? 1)) : nominalVal

  // ── Column definitions ───────────────────────────────────────────────────
  // Each entry: { key, label, group, defaultOn, getValue, fmt, colorFn, monetary }
  // monetary=true → value gets deflated when realMode is on
  const CORE_COLS = [
    { key: 'age',   label: 'Age',   group: 'core', defaultOn: true, monetary: false,
      getValue: r => r.age,  fmt: v => v, align: 'left',
      colorFn: () => 'text-slate-300 font-medium' },
    { key: 'year',  label: 'Year',  group: 'core', defaultOn: true, monetary: false,
      getValue: r => r.year, fmt: v => v, align: 'left',
      colorFn: () => 'text-slate-500' },
    { key: 'phase', label: 'Phase', group: 'core', defaultOn: true, monetary: false,
      getValue: r => r.p1Retired ? 'Retired' : 'Working', fmt: v => v, align: 'left',
      colorFn: () => '' },
    { key: 'salary',   label: 'Salary',    group: 'income',  defaultOn: true, monetary: true,
      getValue: r => (r.person1Salary ?? 0) + (r.person2Salary ?? 0) + (r.bridgeIncomePerson1 ?? 0) + (r.bridgeIncomePerson2 ?? 0),
      fmt: fmtM, align: 'right', colorFn: () => 'text-slate-300' },
    { key: 'ss',       label: 'SS Income', group: 'income',  defaultOn: true, monetary: true,
      getValue: r => (r.socialSecurityPerson1 ?? 0) + (r.socialSecurityPerson2 ?? 0),
      fmt: fmtM, align: 'right', colorFn: v => v > 0 ? 'text-emerald-400/80' : 'text-slate-700' },
    { key: 'rmd',      label: 'RMD',       group: 'income',  defaultOn: false, monetary: true,
      getValue: r => r.rmdIncome ?? 0,
      fmt: fmtM, align: 'right', colorFn: v => v > 0 ? 'text-orange-400/80' : 'text-slate-700' },
    { key: 'spending', label: 'Spending',  group: 'spending', defaultOn: true, monetary: true,
      getValue: r => (r.livingSpending ?? 0) + (r.healthSpending ?? 0),
      fmt: fmtM, align: 'right', colorFn: () => 'text-slate-300' },
    { key: 'largeEvents', label: 'Large Events', group: 'spending', defaultOn: true, monetary: true,
      getValue: r => Math.abs(Math.min(r.largeEvents ?? 0, 0)),  // outflows only, positive number
      fmt: v => v > 0 ? fmtM(v) : '—', align: 'right',
      colorFn: v => v > 0 ? 'text-red-400' : 'text-slate-700' },
    { key: 'contributions', label: 'Contributions', group: 'portfolio', defaultOn: true, monetary: true,
      getValue: r => (r.accountContributions ?? 0) + (r.employerContributions ?? 0),
      fmt: v => v > 0 ? fmtM(v) : '—', align: 'right',
      colorFn: v => v > 0 ? 'text-sky-400' : 'text-slate-700' },
    { key: 'tax',      label: 'Est. Tax',  group: 'spending', defaultOn: false, monetary: true,
      getValue: r => r.estimatedTax ?? 0,
      fmt: fmtM, align: 'right', colorFn: v => v > 0 ? 'text-slate-400' : 'text-slate-700' },
    { key: 'drawdown', label: 'Drawdown',  group: 'portfolio', defaultOn: true, monetary: true,
      getValue: r => r.portfolioDrawdown ?? 0,
      fmt: fmtM, align: 'right', colorFn: v => v > 0 ? 'text-amber-400/80' : 'text-slate-700' },
    { key: 'portfolio', label: 'Portfolio', group: 'portfolio', defaultOn: true, monetary: true,
      getValue: r => r.totalPortfolioValue ?? 0,
      fmt: fmtM, align: 'right',
      colorFn: v => v > 0 ? 'text-gold-400 font-semibold' : 'text-red-400 font-semibold' },
    { key: 'networth',  label: 'Net Worth', group: 'portfolio', defaultOn: false, monetary: true,
      getValue: r => r.totalNetWorth ?? 0,
      fmt: fmtM, align: 'right',
      colorFn: v => v > 0 ? 'text-gold-300' : 'text-red-400' },
    { key: 'ef',   label: 'Emerg. Fund', group: 'portfolio', defaultOn: true, monetary: true,
      getValue: r => r.emergencyFundBalance ?? 0,
      fmt: fmtM, align: 'right', colorFn: () => 'text-slate-400' },
    { key: 'debt', label: 'Debt',        group: 'portfolio', defaultOn: true, monetary: true,
      getValue: r => r.debtBalance ?? 0,
      fmt: v => v > 0 ? fmtM(v) : '—', align: 'right',
      colorFn: v => v > 0 ? 'text-red-400' : 'text-slate-700' },
    { key: 'effRate', label: 'Tax Rate', group: 'spending', defaultOn: false, monetary: false,
      getValue: r => r.effectiveTaxRate ?? 0,
      fmt: v => v > 0 ? (v * 100).toFixed(1) + '%' : '—', align: 'right',
      colorFn: () => 'text-slate-400' },
  ]

  // Per-account columns — one per account
  const acctCols = useMemo(() => accounts.map(a => ({
    key:      `acct_${a.id}`,
    label:    a.name || a.type,
    group:    'accounts',
    defaultOn: false,
    monetary: true,
    getValue: r => r[a.id] ?? 0,
    fmt:      fmtFull,
    align:    'right',
    colorFn:  v => v > 0 ? 'text-sky-300' : 'text-slate-700',
    acctType: a.type,
  })), [accounts])

  const ALL_COLS = [...CORE_COLS, ...acctCols]

  // ── Toggle state — starts with defaults ──────────────────────────────────
  const [visibleKeys, setVisibleKeys] = useState(() =>
    new Set(ALL_COLS.filter(c => c.defaultOn).map(c => c.key))
  )

  const toggle = (key) => setVisibleKeys(prev => {
    const next = new Set(prev)
    if (next.has(key)) { if (next.size > 1) next.delete(key) } // always keep at least 1
    else next.add(key)
    return next
  })

  const activeCols = ALL_COLS.filter(c => visibleKeys.has(c.key))

  // Group labels for the toggle panel
  const GROUP_META = {
    core:      { label: 'Core',           color: 'text-slate-400' },
    income:    { label: 'Income',         color: 'text-blue-400' },
    spending:  { label: 'Spending',       color: 'text-orange-400' },
    portfolio: { label: 'Portfolio',      color: 'text-gold-400' },
    accounts:  { label: 'Account Balances', color: 'text-sky-400' },
  }

  // ── CSV export ───────────────────────────────────────────────────────────
  const exportCSV = () => {
    const header = activeCols.map(c => c.label).join(',')
    const rows   = ledger.map(r =>
      activeCols.map(c => {
        const nominal = c.getValue(r)
        const v = (c.monetary && realMode)
          ? Math.round(nominal / (r.inflationMultiplier ?? 1))
          : nominal
        const s = typeof v === 'string' ? `"${v}"` : String(v)
        return s
      }).join(',')
    )
    const modeLabel = realMode ? "Today's dollars (inflation-adjusted)" : "Nominal dollars (future value)"
    const meta  = `"FamilyWealthPlanner Age-by-Age Projection","${modeLabel}"\n`
    const csv   = meta + [header, ...rows].join('\n')
    const blob  = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url   = URL.createObjectURL(blob)
    const a     = document.createElement('a')
    a.href      = url
    a.download  = `FWP_projection_${realMode ? 'real' : 'nominal'}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Excel export (XLSX via SheetJS CDN) ──────────────────────────────────
  const exportXLSX = async () => {
    // Dynamically load SheetJS
    if (!window.XLSX) {
      await new Promise((resolve, reject) => {
        const s  = document.createElement('script')
        s.src    = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
        s.onload = resolve
        s.onerror = reject
        document.head.appendChild(s)
      })
    }
    const XLSX = window.XLSX

    // Build worksheet data
    const wsData = [
      // Header row
      activeCols.map(c => c.label),
      // Data rows
      ...ledger.map(r => activeCols.map(c => {
        const nominal = c.getValue(r)
        const v = (c.monetary && realMode)
          ? Math.round(nominal / (r.inflationMultiplier ?? 1))
          : nominal
        return (typeof v === 'number' && isFinite(v)) ? v : String(v)
      })),
    ]

    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Column widths
    ws['!cols'] = activeCols.map(c => ({ wch: Math.max(c.label.length + 2, 10) }))

    // Style header row bold (basic styling)
    const range = XLSX.utils.decode_range(ws['!ref'])
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c: C })
      if (!ws[addr]) continue
      ws[addr].s = { font: { bold: true }, fill: { fgColor: { rgb: 'F1F5F9' } } }
    }

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Projection')

    // Summary sheet
    const summaryData = [
      ['FamilyWealthPlanner Export'],
      ['Generated',       new Date().toLocaleDateString()],
      ['Dollar mode',     realMode ? "Today's dollars (inflation-adjusted)" : "Nominal dollars (future value)"],
      [],
      ['Total rows',      ledger.length],
      ['Age range',       `${ledger[0].age} – ${ledger[ledger.length - 1].age}`],
      ['Columns exported', activeCols.length],
    ]
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Info')

    XLSX.writeFile(wb, `FWP_projection_${realMode ? 'real' : 'nominal'}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ── Column toggle panel open/close ────────────────────────────────────────
  const [showToggles, setShowToggles] = useState(false)

  const groups = Object.keys(GROUP_META)

  return (
    <section className="space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="section-title">Age-by-Age Projection</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Current plan ·{' '}
            <span className={realMode ? 'text-gold-500' : 'text-slate-500'}>
              {realMode ? "today's dollars (inflation-adjusted)" : 'nominal dollars (future value)'}
            </span>
            {' '}· {activeCols.length} columns visible
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">

          {/* Real / Nominal toggle */}
          <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5">
            {[
              { val: false, label: 'Nominal $' },
              { val: true,  label: "Today's $"  },
            ].map(opt => (
              <button
                key={String(opt.val)}
                onClick={() => setRealMode(opt.val)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  realMode === opt.val
                    ? 'bg-gold-500/20 text-gold-300 border border-gold-500/30'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Column toggle button */}
          <button
            onClick={() => setShowToggles(s => !s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              showToggles
                ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
            }`}
          >
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
              <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"/>
            </svg>
            Columns
          </button>

          {/* CSV download */}
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-emerald-300 hover:border-emerald-500/40 text-xs font-medium transition-all"
          >
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
              <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
              <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
            </svg>
            CSV
          </button>

          {/* Excel download */}
          <button
            onClick={exportXLSX}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-emerald-300 hover:border-emerald-500/40 text-xs font-medium transition-all"
          >
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
              <path d="M14 4.5V11h-1V4.5h-2A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v9H2V2a2 2 0 0 1 2-2h5.5L14 4.5z"/>
              <path d="M7.86 14.841a1.13 1.13 0 0 0 .401.823c.13.108.29.192.479.252.19.061.411.091.665.091.338 0 .624-.053.858-.158.237-.105.416-.252.54-.44a1.17 1.17 0 0 0 .187-.656c0-.224-.045-.41-.135-.56a1.002 1.002 0 0 0-.375-.357 2.028 2.028 0 0 0-.565-.21l-.621-.144a.97.97 0 0 1-.405-.176.37.37 0 0 1-.143-.299 .372.372 0 0 1 .138-.3c.092-.074.22-.111.384-.111.117 0 .219.02.307.061a.501.501 0 0 1 .208.168.737.737 0 0 1 .112.31h.765a1.085 1.085 0 0 0-.395-.791 1.297 1.297 0 0 0-.466-.238 1.858 1.858 0 0 0-.577-.086c-.331 0-.612.053-.843.159-.228.105-.402.252-.524.44a1.182 1.182 0 0 0-.18.644c0 .298.086.54.26.727.172.185.43.32.773.404l.564.13a1.023 1.023 0 0 1 .457.23c.12.102.175.234.175.396a.424.424 0 0 1-.155.328c-.103.087-.254.13-.452.13a.907.907 0 0 1-.338-.06.558.558 0 0 1-.229-.177.578.578 0 0 1-.1-.316H7.86zm-3.726-2.909h.893l-1.274 2h-.035l-1.36-2h.926l.849 1.365.001.002L4.134 11.932zm7.323 0v2h-1.067v-2H11.457z"/>
            </svg>
            Excel
          </button>
        </div>
      </div>

      {/* Column toggle panel */}
      {showToggles && (
        <div className="card !py-4 space-y-4 bg-slate-900/80 border border-slate-700/60">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-300">Toggle Columns</p>
            <div className="flex gap-2">
              <button
                onClick={() => setVisibleKeys(new Set(ALL_COLS.map(c => c.key)))}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >show all</button>
              <span className="text-slate-700">·</span>
              <button
                onClick={() => setVisibleKeys(new Set(CORE_COLS.filter(c => c.defaultOn).map(c => c.key)))}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >reset</button>
            </div>
          </div>

          {groups.map(grp => {
            const cols = ALL_COLS.filter(c => c.group === grp)
            if (cols.length === 0) return null
            const meta = GROUP_META[grp]
            return (
              <div key={grp}>
                <p className={`text-xs font-medium uppercase tracking-wider mb-2 ${meta.color}`}>
                  {meta.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {cols.map(col => {
                    const on = visibleKeys.has(col.key)
                    return (
                      <button
                        key={col.key}
                        onClick={() => toggle(col.key)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all ${
                          on
                            ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                            : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        {on && (
                          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current shrink-0">
                            <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                          </svg>
                        )}
                        {col.label}
                        {col.acctType && (
                          <span className="text-slate-600 ml-0.5">({col.acctType})</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-xs" style={{ minWidth: Math.max(600, activeCols.length * 90) }}>
          <thead className="bg-slate-900 sticky top-0 z-10">
            <tr className="border-b border-slate-800">
              {activeCols.map(col => (
                <th
                  key={col.key}
                  className={`py-2.5 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap ${
                    col.align === 'left' ? 'text-left' : 'text-right'
                  }`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ledger.map((r, i) => (
              <tr
                key={r.age}
                className={`
                  border-b border-slate-800/60 transition-colors
                  ${r.p1Retired && !ledger[i - 1]?.p1Retired ? 'border-l-2 border-l-gold-500/40 bg-gold-500/4' : ''}
                  ${r.survivingSpouseActive && !ledger[i - 1]?.survivingSpouseActive ? 'border-l-2 border-l-red-400/40 bg-red-500/4' : ''}
                  ${i % 2 === 0 ? '' : 'bg-slate-900/30'}
                  hover:bg-slate-800/40
                `}
              >
                {activeCols.map(col => {
                  const nominalVal = col.getValue(r)
                  // Deflate monetary values when realMode is on
                  const v = (col.monetary && realMode)
                    ? Math.round(nominalVal / (r.inflationMultiplier ?? 1))
                    : nominalVal
                  const txt = col.key === 'phase' ? null : col.fmt(v)
                  const colorClass = col.colorFn(v)

                  return (
                    <td
                      key={col.key}
                      className={`py-2 px-3 font-mono ${col.align === 'right' ? 'text-right' : ''}`}
                    >
                      {col.key === 'phase' ? (
                        <span className={`badge text-xs ${r.p1Retired ? 'badge-gold' : 'bg-slate-800 text-slate-500'}`}>
                          {v}
                        </span>
                      ) : (
                        <span className={colorClass}>{txt}</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
