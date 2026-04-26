import { useMemo, useState, useEffect, useRef } from 'react'
import WealthBuildChart from '../charts/WealthBuildChart'
import CashFlowCharts   from '../charts/CashFlowCharts'
import SummaryMetrics   from '../charts/SummaryMetrics'
import WhatIfSliders    from '../charts/WhatIfSliders'
import Milestones       from '../charts/Milestones'
import HSAChart         from '../charts/HSAChart'
import { useStore }     from '../store'
import { useWhatIf, applyOverrides } from '../store/whatif'
import { simulate }     from '../engine/simulate'
import { useTilePrefs, TILES, GROUPS } from '../hooks/useTilePrefs'

export default function Dashboard() {
  const { state } = useStore()
  const { overrides, compareToBase, hasAnyOverride, realMode, setRealMode } = useWhatIf()
  const { isVisible, toggle, showAll, reset, hiddenCount, prefs } = useTilePrefs()

  const { profile } = state
  const hasProfile = profile.person1.age !== '' && profile.person1.retirementAge !== ''
  const p1Name = profile.person1.name || 'Person 1'

  const baseLedger     = useMemo(() => simulate(state), [state])
  const overrideState  = useMemo(() => applyOverrides(state, overrides), [state, overrides])
  const overrideLedger = useMemo(() => simulate(overrideState), [overrideState])
  const activeLedger   = hasAnyOverride ? overrideLedger : baseLedger

  const efDepletionAge = useMemo(
    () => activeLedger.find(r => (r.emergencyFundBalance ?? 1) <= 0 && r.p1Retired)?.age ?? null,
    [activeLedger]
  )
  const [dismissedAge, setDismissedAge] = useState(null)
  useEffect(() => {
    if (efDepletionAge !== dismissedAge) setDismissedAge(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [efDepletionAge])
  const showEfBanner = efDepletionAge !== null && dismissedAge !== efDepletionAge

  const [showCustomize, setShowCustomize] = useState(false)
  const panelRef = useRef(null)
  useEffect(() => {
    if (!showCustomize) return
    const h = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setShowCustomize(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showCustomize])

  return (
    <div className="page-enter space-y-8">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-medium text-gold-500 uppercase tracking-widest mb-1">Overview</p>
          <h1 className="font-display text-2xl font-semibold text-slate-100">
            {p1Name ? `${p1Name}'s Dashboard` : 'Dashboard'}
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Your retirement plan at a glance — updated live as you edit any input.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {/* Real / Nominal */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
              {[{ id: true, label: 'Real $' }, { id: false, label: 'Nominal $' }].map(opt => (
                <button key={String(opt.id)} onClick={() => setRealMode(opt.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    realMode === opt.id ? 'bg-slate-700 text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-300'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-700 pr-1">
              {realMode ? "All charts: today's dollars" : 'All charts: future dollars'}
            </p>
          </div>

          {/* Customize button + panel */}
          <div className="relative" ref={panelRef}>
            <button
              onClick={() => setShowCustomize(s => !s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                showCustomize || hiddenCount > 0
                  ? 'bg-violet-500/15 border-violet-500/40 text-violet-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
                <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"/>
              </svg>
              Customize
              {hiddenCount > 0 && (
                <span className="ml-0.5 bg-violet-500/30 text-violet-200 rounded-full px-1.5 py-0.5 text-xs font-bold leading-none">
                  {hiddenCount}
                </span>
              )}
            </button>

            {showCustomize && (
              <div className="absolute right-0 top-full mt-2 z-50 w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
                style={{ filter: 'drop-shadow(0 16px 48px rgba(0,0,0,0.7))' }}>

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                  <div>
                    <p className="text-sm font-semibold text-slate-200">Customize Dashboard</p>
                    <p className="text-xs text-slate-600 mt-0.5">Preferences saved automatically</p>
                  </div>
                  <button onClick={() => setShowCustomize(false)}
                    className="w-6 h-6 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors text-lg leading-none">
                    ×
                  </button>
                </div>

                {/* Tile groups */}
                <div className="px-4 py-3 space-y-4 max-h-96 overflow-y-auto"
                  style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}>
                  {Object.keys(GROUPS).map(grp => {
                    const tilesInGroup = TILES.filter(t => t.group === grp)
                    if (!tilesInGroup.length) return null
                    const gMeta = GROUPS[grp]
                    return (
                      <div key={grp}>
                        <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${gMeta.color}`}>
                          {gMeta.label}
                        </p>
                        <div className="space-y-1">
                          {tilesInGroup.map(tile => {
                            const on = isVisible(tile.key)
                            return (
                              <button key={tile.key} onClick={() => toggle(tile.key)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                                  on
                                    ? 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800'
                                    : 'bg-slate-900/40 border-slate-800/40 opacity-50 hover:opacity-70'
                                }`}>
                                {/* Toggle pill */}
                                <div className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${on ? 'bg-violet-500' : 'bg-slate-700'}`}>
                                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                </div>
                                <span className="text-base leading-none shrink-0">{tile.icon}</span>
                                <div className="min-w-0 flex-1">
                                  <p className={`text-xs font-medium leading-tight ${on ? 'text-slate-200' : 'text-slate-500'}`}>
                                    {tile.label}
                                  </p>
                                  <p className="text-xs text-slate-600 mt-0.5 leading-tight line-clamp-1">
                                    {tile.desc}
                                  </p>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-slate-800 space-y-2">
                  <div className="flex gap-2">
                    <button onClick={showAll}
                      className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors">
                      Show all
                    </button>
                    <button onClick={reset}
                      className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors">
                      Reset defaults
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <p className="text-xs text-slate-600">Saved to this browser · survives refresh</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {!hasProfile && (
            <div className="hidden sm:flex items-center gap-2 text-xs bg-gold-500/10 border border-gold-500/20 text-gold-400 rounded-lg px-3 py-2">
              <span>◈</span><span>Complete your profile to see projections</span>
            </div>
          )}
        </div>
      </div>

      {/* EF banner */}
      {showEfBanner && (
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3">
          <span className="text-amber-400 text-base shrink-0 mt-0.5">⚠</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-300">Emergency fund depletes at age {efDepletionAge}</p>
            <p className="text-xs text-amber-400/70 mt-0.5 leading-relaxed">
              Projected shortfall is modeled as external debt at 5% interest, repaid from future surpluses.
              Consider increasing your emergency fund balance or adjusting retirement spending.
            </p>
          </div>
          <button onClick={() => setDismissedAge(efDepletionAge)}
            className="text-amber-400/50 hover:text-amber-400 transition-colors shrink-0 mt-0.5 text-lg leading-none">×</button>
        </div>
      )}

      {/* Hidden tiles notice */}
      {hiddenCount > 0 && (
        <div className="flex items-center justify-between gap-3 bg-violet-500/8 border border-violet-500/20 rounded-xl px-4 py-2.5">
          <p className="text-xs text-violet-300/80">
            {hiddenCount} tile{hiddenCount > 1 ? 's' : ''} hidden:{' '}
            <span className="text-violet-400">
              {TILES.filter(t => !prefs[t.key]).map(t => t.label).join(', ')}
            </span>
          </p>
          <button onClick={showAll}
            className="text-xs text-violet-400 hover:text-violet-200 font-medium whitespace-nowrap transition-colors">
            Show all ↑
          </button>
        </div>
      )}

      {/* ── Tiles ── */}
      {isVisible('wealthChart') && (
        <WealthBuildChart
          overrideLedger={activeLedger}
          baseLedger={hasAnyOverride && compareToBase ? baseLedger : null}
          showBaseLine={hasAnyOverride && compareToBase}
        />
      )}

      {isVisible('whatIf')     && <WhatIfSliders />}
      {isVisible('milestones') && <Milestones ledger={activeLedger} />}
      {isVisible('summary')    && <SummaryMetrics />}
      {isVisible('cashFlow')   && <CashFlowCharts />}
      {isVisible('hsa')        && <HSAChart />}

    </div>
  )
}
