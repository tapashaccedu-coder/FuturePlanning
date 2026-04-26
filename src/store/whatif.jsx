import { createContext, useContext, useState, useMemo, useCallback } from 'react'

// ─── Context ──────────────────────────────────────────────────────────────────

const WhatIfContext = createContext(null)

// ─── Defaults (null = "use real setting") ────────────────────────────────────

export const WHATIF_DEFAULTS = {
  growthRateOverride:      null,   // % override for all accounts (null = off)
  p1RetirementAge:         null,   // absolute age
  p2RetirementAge:         null,
  contributionFactor:      null,   // multiplier e.g. 1.5 = +50%, null = off
  preRetirementSpendFactor:null,   // multiplier e.g. 0.8 = -20%, null = off
  postRetirementSpendFactor:null,
  inflationRate:           null,   // % e.g. 3.5
  lifeExpectancy:          null,   // override P1 life expectancy (absolute age)
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function WhatIfProvider({ children }) {
  const [overrides, setOverrides] = useState(WHATIF_DEFAULTS)
  const [compareToBase, setCompareToBase] = useState(false)
  const [realMode, setRealMode] = useState(true)   // shared across all charts

  const setOverride = useCallback((key, value) => {
    setOverrides(prev => ({ ...prev, [key]: value }))
  }, [])

  const resetAll = useCallback(() => {
    setOverrides(WHATIF_DEFAULTS)
    setCompareToBase(false)
  }, [])

  const hasAnyOverride = useMemo(
    () => Object.values(overrides).some(v => v !== null),
    [overrides]
  )

  const value = {
    overrides,
    setOverride,
    resetAll,
    compareToBase,
    setCompareToBase,
    hasAnyOverride,
    realMode,
    setRealMode,
  }

  return (
    <WhatIfContext.Provider value={value}>
      {children}
    </WhatIfContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWhatIf() {
  const ctx = useContext(WhatIfContext)
  if (!ctx) throw new Error('useWhatIf must be used inside <WhatIfProvider>')
  return ctx
}

// ─── Derive overridden state from base state + overrides ─────────────────────

/**
 * applyOverrides(baseState, overrides) → derivedState
 *
 * Returns a deep-ish clone of baseState with override values patched in.
 * Does not mutate baseState.
 */
export function applyOverrides(baseState, overrides) {
  if (!baseState) return baseState

  // Quick check — if all null, return base unchanged
  if (Object.values(overrides).every(v => v === null)) return baseState

  const s = structuredClone ? structuredClone(baseState) : JSON.parse(JSON.stringify(baseState))

  // 1. Growth rate override — apply to all accounts
  if (overrides.growthRateOverride !== null) {
    s.accounts = s.accounts.map(a => ({
      ...a,
      annualGrowthRate: overrides.growthRateOverride,
    }))
  }

  // 2. Retirement ages
  if (overrides.p1RetirementAge !== null) {
    s.profile = {
      ...s.profile,
      person1: { ...s.profile.person1, retirementAge: overrides.p1RetirementAge },
    }
  }
  if (overrides.p2RetirementAge !== null && s.profile.includePerson2) {
    s.profile = {
      ...s.profile,
      person2: { ...s.profile.person2, retirementAge: overrides.p2RetirementAge },
    }
  }

  // 3. Contribution factor — scale monthly contributions proportionally
  if (overrides.contributionFactor !== null) {
    const factor = overrides.contributionFactor
    s.accounts = (s.accounts || []).map(a => ({
      ...a,
      monthlyContribution: Math.max(0,
        (parseFloat(String(a.monthlyContribution || 0).replace(/[$,]/g, '')) || 0) * factor
      ),
    }))
  }

  // 4. Pre-retirement spending factor
  if (overrides.preRetirementSpendFactor !== null) {
    const base = parseFloat(String(s.spending?.annualPreRetirement || 0).replace(/[$,]/g, '')) || 0
    s.spending = {
      ...s.spending,
      annualPreRetirement: base * overrides.preRetirementSpendFactor,
    }
  }

  // 5. Post-retirement spending factor
  if (overrides.postRetirementSpendFactor !== null) {
    const factor = overrides.postRetirementSpendFactor
    const living = parseFloat(String(s.spending?.annualRetirementLiving || 0).replace(/[$,]/g, '')) || 0
    const health = parseFloat(String(s.spending?.annualRetirementHealthcare || 0).replace(/[$,]/g, '')) || 0
    s.spending = {
      ...s.spending,
      annualRetirementLiving:      living * factor,
      annualRetirementHealthcare:  health * factor,
    }
  }

  // 6. Inflation rate override
  if (overrides.inflationRate !== null) {
    s.profile = {
      ...s.profile,
      inflationRate: overrides.inflationRate,
    }
  }

  // 7. Life expectancy override — applies to Person 1
  if (overrides.lifeExpectancy !== null) {
    s.profile = {
      ...s.profile,
      person1: { ...s.profile.person1, lifeExpectancy: overrides.lifeExpectancy },
    }
  }

  return s
}
