/**
 * useTilePrefs — manages which dashboard tiles are visible.
 * Persisted to localStorage under 'fwp_tiles' (separate from plan state).
 */
import { useState, useCallback, useEffect } from 'react'

const LS_KEY = 'fwp_tiles'

// Master tile registry — order here = order in the dashboard
export const TILES = [
  {
    key:     'wealthChart',
    label:   'Wealth Build Curve',
    desc:    'Portfolio value by age — all accounts + total',
    icon:    '📈',
    group:   'charts',
    default: true,
  },
  {
    key:     'whatIf',
    label:   'What-If Sliders',
    desc:    'Explore how changes to rates, ages, and spending affect your plan',
    icon:    '🎛',
    group:   'tools',
    default: true,
  },
  {
    key:     'milestones',
    label:   'Net Worth Milestones',
    desc:    'Timeline of milestone ages — $100k, $1M, retirement, SS, RMDs',
    icon:    '🏁',
    group:   'charts',
    default: true,
  },
  {
    key:     'summary',
    label:   'Summary Metrics',
    desc:    '6 KPI cards + portfolio donuts + Monte Carlo',
    icon:    '📊',
    group:   'metrics',
    default: true,
  },
  {
    key:     'cashFlow',
    label:   'Cash Flow Charts',
    desc:    'Annual income by source + spending by category',
    icon:    '💵',
    group:   'charts',
    default: true,
  },
  {
    key:     'hsa',
    label:   'HSA Projection',
    desc:    'HSA balance curve + annual healthcare withdrawals (only if you have an HSA)',
    icon:    '🏥',
    group:   'charts',
    default: true,
  },
]

export const GROUPS = {
  charts:  { label: 'Charts',  color: 'text-sky-400' },
  metrics: { label: 'Metrics', color: 'text-gold-400' },
  tools:   { label: 'Tools',   color: 'text-violet-400' },
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return JSON.parse(raw)   // { [key]: boolean }
  } catch { return null }
}

function savePrefs(prefs) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(prefs)) } catch {}
}

export function useTilePrefs() {
  const [prefs, setPrefs] = useState(() => {
    const saved = loadPrefs()
    // Merge saved with defaults — new tiles default to true even if not in saved
    const result = {}
    for (const t of TILES) {
      result[t.key] = saved ? (saved[t.key] ?? t.default) : t.default
    }
    return result
  })

  // Persist on every change
  useEffect(() => { savePrefs(prefs) }, [prefs])

  const isVisible = useCallback((key) => prefs[key] ?? true, [prefs])

  const toggle = useCallback((key) => {
    setPrefs(p => ({ ...p, [key]: !p[key] }))
  }, [])

  const showAll = useCallback(() => {
    setPrefs(Object.fromEntries(TILES.map(t => [t.key, true])))
  }, [])

  const reset = useCallback(() => {
    setPrefs(Object.fromEntries(TILES.map(t => [t.key, t.default])))
  }, [])

  const hiddenCount = TILES.filter(t => !prefs[t.key]).length

  return { prefs, isVisible, toggle, showAll, reset, hiddenCount }
}
