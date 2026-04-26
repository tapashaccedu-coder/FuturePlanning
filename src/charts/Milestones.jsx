import { useMemo, useEffect, useState, useRef, useCallback } from 'react'
import { useStore } from '../store'
import { useWhatIf, applyOverrides } from '../store/whatif'

// ─── Constants ────────────────────────────────────────────────────────────────

const WEALTH_THRESHOLDS = [
  { value: 100_000,   label: '$100k'  },
  { value: 250_000,   label: '$250k'  },
  { value: 500_000,   label: '$500k'  },
  { value: 750_000,   label: '$750k'  },
  { value: 1_000_000, label: '$1M'    },
  { value: 1_500_000, label: '$1.5M'  },
  { value: 2_000_000, label: '$2M'    },
  { value: 3_000_000, label: '$3M'    },
  { value: 5_000_000, label: '$5M'    },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M'
  if (n >= 1_000)     return '$' + (n / 1_000).toFixed(0) + 'k'
  return '$' + n.toLocaleString()
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Milestones({ ledger: ledgerProp }) {
  const { state }     = useStore()
  const { overrides, realMode } = useWhatIf()

  // Accept ledger as prop (from Dashboard's activeLedger) or compute internally
  const effectiveState = useMemo(
    () => applyOverrides(state, overrides),
    [state, overrides]
  )

  const ledger = ledgerProp ?? []

  const [mounted, setMounted] = useState(false)
  const containerRef   = useRef(null)
  const [containerWidth, setContainerWidth] = useState(0)

  // Measure container width on mount and on resize
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width)
    })
    ro.observe(containerRef.current)
    setContainerWidth(containerRef.current.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    // Small delay so the animation triggers after the component paints
    const t = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(t)
  }, [])

  // Re-run animation when ledger changes (e.g. what-if slider moved)
  useEffect(() => {
    setMounted(false)
    const t = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(t)
  }, [ledger])

  const { profile } = state
  const p1CurrentAge = parseInt(profile.person1.age) || 0

  // ── Deflation helper — milestones shown in real $ when realMode is on ──────
  // We compare against real net worth thresholds by deflating each row's value.
  const deflate = (row, nominalVal) =>
    realMode ? Math.round(nominalVal / (row.inflationMultiplier ?? 1)) : nominalVal

  // ── 1. Wealth milestones ───────────────────────────────────────────────────
  const wealthMilestones = useMemo(() => {
    if (!ledger.length) return []
    const reached = []
    for (const thresh of WEALTH_THRESHOLDS) {
      const row = ledger.find(r => deflate(r, r.totalNetWorth ?? 0) >= thresh.value)
      if (row) reached.push({ kind: 'wealth', age: row.age, value: thresh.value, label: thresh.label })
    }
    return reached
  }, [ledger, realMode])

  // ── 2. Life event markers ──────────────────────────────────────────────────
  const eventMarkers = useMemo(() => {
    if (!ledger.length) return []
    const markers = []

    // P1 retirement
    const p1RetRow = ledger.find(r => r.p1Retired)
    if (p1RetRow) markers.push({
      kind: 'retirement', age: p1RetRow.age,
      label: `${profile.person1.name || 'P1'} retires`,
      color: '#e8a800', textColor: 'text-gold-400',
    })

    // P2 retirement (only if included and different age from P1)
    if (profile.includePerson2) {
      const p2RetRow = ledger.find(r => r.p2Retired && !ledger[ledger.indexOf(r) - 1]?.p2Retired)
      if (p2RetRow && p2RetRow.age !== p1RetRow?.age) {
        markers.push({
          kind: 'retirement2', age: p2RetRow.age,
          label: `${profile.person2.name || 'P2'} retires`,
          color: '#a78bfa', textColor: 'text-violet-400',
        })
      }
    }

    // P1 SS start
    const p1SSRow = ledger.find(r => r.socialSecurityPerson1 > 0)
    if (p1SSRow) markers.push({
      kind: 'ss1', age: p1SSRow.age,
      label: `${profile.person1.name || 'P1'} SS`,
      color: '#4ade80', textColor: 'text-emerald-400',
    })

    // P2 SS start (if included)
    if (profile.includePerson2) {
      const p2SSRow = ledger.find(r => r.socialSecurityPerson2 > 0)
      if (p2SSRow) markers.push({
        kind: 'ss2', age: p2SSRow.age,
        label: `${profile.person2.name || 'P2'} SS`,
        color: '#86efac', textColor: 'text-emerald-300',
      })
    }

    // First RMD year
    const rmdRow = ledger.find(r => r.rmdIncome > 0)
    if (rmdRow) markers.push({
      kind: 'rmd', age: rmdRow.age,
      label: 'RMDs start',
      color: '#fb923c', textColor: 'text-orange-400',
    })

    return markers
  }, [ledger, profile])

  // ── 3. Portfolio peak ──────────────────────────────────────────────────────
  const peakMarker = useMemo(() => {
    if (!ledger.length) return null
    let peakRow = ledger[0]
    for (const r of ledger) {
      if (deflate(r, r.totalNetWorth ?? 0) > deflate(peakRow, peakRow.totalNetWorth ?? 0)) {
        peakRow = r
      }
    }
    return peakRow.totalNetWorth > 0
      ? { kind: 'peak', age: peakRow.age, value: deflate(peakRow, peakRow.totalNetWorth),
          label: 'Peak', color: '#e8a800' }
      : null
  }, [ledger, realMode])

  // ── 4. Merge + sort all items ──────────────────────────────────────────────
  const allItems = useMemo(() => {
    const items = [...wealthMilestones, ...eventMarkers]
    if (peakMarker) items.push(peakMarker)
    // Deduplicate by age+kind (keep first)
    const seen = new Set()
    return items
      .filter(item => { const k = `${item.kind}-${item.age}`; if (seen.has(k)) return false; seen.add(k); return true })
      .sort((a, b) => a.age - b.age)
  }, [wealthMilestones, eventMarkers, peakMarker])

  // Nothing to show
  if (!ledger.length || (!wealthMilestones.length && !eventMarkers.length)) {
    return null
  }

  const minAge = ledger[0]?.age ?? p1CurrentAge
  const maxAge = ledger[ledger.length - 1]?.age ?? p1CurrentAge + 40
  const span   = Math.max(maxAge - minAge, 1)

  // Position as percentage along timeline
  const pct = (age) => Math.max(0, Math.min(100, ((age - minAge) / span) * 100))

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div>
        <p className="text-xs font-medium text-gold-500 uppercase tracking-widest mb-0.5">Journey</p>
        <h2 className="font-display text-lg font-semibold text-slate-100">Net Worth Milestones</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Key ages on your financial journey ·{' '}
          {realMode ? "today's dollars" : 'nominal dollars'}
        </p>
      </div>

      {/* ── Desktop: horizontal timeline (≥768px) ── */}
      <div className="card hidden md:block overflow-hidden">
        {/* Measured container — all positions computed from its pixel width */}
        <div ref={containerRef} className="relative" style={{ height: 140 }}>
          <style>{`
            @keyframes fwp-pop {
              0%   { opacity: 0; transform: translateX(-50%) scale(0.3); }
              60%  { opacity: 1; transform: translateX(-50%) scale(1.15); }
              100% { opacity: 1; transform: translateX(-50%) scale(1); }
            }
            @keyframes fwp-fade-up {
              0%   { opacity: 0; transform: translateY(6px); }
              100% { opacity: 1; transform: translateY(0); }
            }
            .fwp-dot  { opacity: 0; transform: translateX(-50%) scale(0); }
            .fwp-dot.mounted  { animation: fwp-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards; }
            .fwp-lbl  { opacity: 0; }
            .fwp-lbl.mounted  { animation: fwp-fade-up 0.3s ease-out forwards; }
          `}</style>

          {/* Only render items once we know the container width */}
          {containerWidth > 0 && (() => {
            const PAD  = 36          // px inset on each side
            const LINE_Y = 72        // px from top of container to the horizontal line
            const usable = containerWidth - PAD * 2   // drawable pixels between pads

            // Convert an age to an absolute pixel x position within the container
            const ageToX = (age) =>
              PAD + ((age - minAge) / span) * usable

            return (
              <>
                {/* Timeline track */}
                <div className="absolute h-px bg-slate-700"
                  style={{ left: PAD, width: usable, top: LINE_Y }} />

                {/* Age labels at each end */}
                <div className="absolute text-xs font-mono text-slate-600"
                  style={{ left: PAD, top: LINE_Y + 10 }}>{minAge}</div>
                <div className="absolute text-xs font-mono text-slate-600"
                  style={{ left: PAD + usable - 20, top: LINE_Y + 10 }}>{maxAge}</div>

                {/* "You are here" marker */}
                {p1CurrentAge >= minAge && p1CurrentAge <= maxAge && (() => {
                  const x = ageToX(p1CurrentAge)
                  return (
                    <div className="absolute" style={{ left: x }}>
                      <div className="absolute w-px bg-slate-600"
                        style={{ height: 14, top: LINE_Y - 14, transform: 'translateX(-50%)' }} />
                      <div className="absolute w-3 h-3 rounded-full bg-slate-300 border-2 border-slate-950"
                        style={{ top: LINE_Y - 6, transform: 'translateX(-50%)' }} />
                      <div className="absolute text-xs font-mono text-slate-500 whitespace-nowrap"
                        style={{ top: LINE_Y + 8, transform: 'translateX(-50%)' }}>
                        You
                      </div>
                    </div>
                  )
                })()}

                {/* All milestone + event dots and labels */}
                {allItems.map((item, idx) => {
                  const x        = ageToX(item.age)
                  const isWealth = item.kind === 'wealth'
                  const isPeak   = item.kind === 'peak'
                  const isEvent  = !isWealth && !isPeak
                  const delay    = `${idx * 80}ms`
                  const above    = idx % 2 === 0
                  const color    = isEvent ? item.color : '#e8a800'
                  const text     = isWealth ? item.label : isPeak ? fmt(item.value) : item.label

                  return (
                    <div key={`${item.kind}-${item.age}`}>
                      {/* Dot */}
                      <div
                        className={`fwp-dot ${mounted ? 'mounted' : ''} absolute z-10`}
                        style={{ left: x, top: LINE_Y - 6, animationDelay: delay }}
                      >
                        {isPeak ? (
                          <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
                            style={{ backgroundColor: '#1e293b', borderColor: '#e8a800' }}>
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#e8a800' }} />
                          </div>
                        ) : (
                          <div className={`rounded-full border-2 border-slate-950 ${isWealth ? 'w-3 h-3' : 'w-3.5 h-3.5'}`}
                            style={{ backgroundColor: color }} />
                        )}
                      </div>

                      {/* Label above the line */}
                      {above && (
                        <div
                          className={`fwp-lbl ${mounted ? 'mounted' : ''} absolute flex flex-col items-center`}
                          style={{ left: x, animationDelay: delay, width: 0, top: 0 }}
                        >
                          <div className="flex flex-col items-center"
                            style={{ transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>
                            <span className="text-xs font-bold leading-tight"
                              style={{ color }}>{text}</span>
                            <span className="text-xs text-slate-600 font-mono">age {item.age}</span>
                          </div>
                          {/* Connector to dot */}
                          <div className="w-px bg-slate-700"
                            style={{ height: LINE_Y - 38, marginTop: 2 }} />
                        </div>
                      )}

                      {/* Label below the line */}
                      {!above && (
                        <div
                          className={`fwp-lbl ${mounted ? 'mounted' : ''} absolute flex flex-col items-center`}
                          style={{ left: x, top: LINE_Y + 8, animationDelay: delay, width: 0 }}
                        >
                          <div className="flex flex-col items-center"
                            style={{ transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>
                            <span className="text-xs text-slate-600 font-mono">age {item.age}</span>
                            <span className="text-xs font-bold leading-tight"
                              style={{ color }}>{text}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )
          })()}
        </div>

        {/* Legend */}
        <div className="border-t border-slate-800/60 bg-slate-950/40 px-5 py-3 flex flex-wrap gap-x-5 gap-y-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-gold-400" />
            <span className="text-xs text-slate-500">Net worth milestone</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#e8a800' }} />
            <span className="text-xs text-slate-500">Retirement</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="text-xs text-slate-500">Social Security</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-orange-400" />
            <span className="text-xs text-slate-500">RMDs</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full border-2 border-gold-400 bg-slate-900" />
            <span className="text-xs text-slate-500">Portfolio peak</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
            <span className="text-xs text-slate-500">You are here (age {p1CurrentAge})</span>
          </div>
        </div>
      </div>

      {/* ── Mobile: vertical two-column card list (<768px) ── */}
      <div className="card md:hidden">
        <div className="grid grid-cols-2 gap-2">
          {allItems.map((item, idx) => {
            const isWealth = item.kind === 'wealth'
            const isPeak   = item.kind === 'peak'
            const delay    = `${idx * 80}ms`

            return (
              <div
                key={`${item.kind}-${item.age}-m`}
                className={`fwp-item ${mounted ? 'mounted' : ''} flex items-center gap-2.5 rounded-lg px-3 py-2.5 bg-slate-800/50`}
                style={{ animationDelay: delay }}
              >
                {/* Color dot */}
                {isPeak ? (
                  <div className="w-3 h-3 rounded-full border-2 shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: '#1e293b', borderColor: '#e8a800' }}>
                    <div className="w-1 h-1 rounded-full bg-gold-400" />
                  </div>
                ) : (
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: isWealth ? '#e8a800' : item.color }}
                  />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-200 leading-tight">
                    {isWealth ? item.label : isPeak ? fmt(item.value) : item.label}
                  </p>
                  <p className="text-xs text-slate-600 font-mono">age {item.age}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Current age note */}
        <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0" />
          <span className="text-xs text-slate-500">
            You are here — age {p1CurrentAge}
            {realMode ? " · today's dollars" : ' · nominal dollars'}
          </span>
        </div>
      </div>
    </div>
  )
}
