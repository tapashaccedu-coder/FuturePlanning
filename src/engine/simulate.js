/**
 * FamilyWealthPlanner — Core Simulation Engine  v2.1
 * simulate(state) → LedgerRow[]
 *
 * Pure function. No side-effects.
 *
 * ── Fixed in v2.0 ──────────────────────────────────────────────────────────
 * Bug 3: accountContributions / employerContributions are now 0 when p1Retired.
 * Bug 4: cashAfterDrawdown includes portfolioDrawdown and rmdIncome.
 * Bug 5: RMD deducted from balances before drawdown loop; credited in gap calc.
 * Order: accounts compound AFTER drawdown.
 *
 * ── Fixed in v2.1 ──────────────────────────────────────────────────────────
 * Withdrawal order: corrected to taxable → trad_401k → trad_ira → pension
 *                   → HSA (health only) → roth_401k → roth_ira → other.
 * HSA special routing: healthSpending drawn from HSA first before the main
 *   drawdown loop; reduces drawdownNeeded by hsaWithdrawal amount.
 * Gap formula: uses (livingSpending + healthSpending - hsaWithdrawal) minus
 *   all non-portfolio income, so SS credit is applied before any account draw.
 * hsaWithdrawal added to every ledger row.
 */

// ─── IRS RMD Uniform Lifetime Table ──────────────────────────────────────────
const RMD_TABLE = {
   72: 27.4,  73: 26.5,  74: 25.5,  75: 24.6,  76: 23.7,  77: 22.9,
   78: 22.0,  79: 21.1,  80: 20.2,  81: 19.4,  82: 18.5,  83: 17.7,
   84: 16.8,  85: 16.0,  86: 15.2,  87: 14.4,  88: 13.7,  89: 12.9,
   90: 12.2,  91: 11.5,  92: 10.8,  93: 10.1,  94:  9.5,  95:  8.9,
   96:  8.4,  97:  7.8,  98:  7.3,  99:  6.8, 100:  6.4, 101:  6.0,
  102:  5.6, 103:  5.2, 104:  4.9, 105:  4.6, 106:  4.3, 107:  4.1,
  108:  3.9, 109:  3.7, 110:  3.5, 111:  3.4, 112:  3.3, 113:  3.1,
  114:  3.0, 115:  2.9,
}

// ─── Withdrawal order (tax-efficient) ────────────────────────────────────────
// HSA is NOT in this list — it is handled separately before this loop
// (health spending is routed through HSA first, then remaining gap uses this order).
const WITHDRAWAL_ORDER = [
  'taxable',    // 1. Taxable brokerage (cap-gains rate — cheapest tax cost)
  'trad_401k',  // 2. Traditional 401k / 403b (ordinary income tax)
  'trad_ira',   // 3. Traditional IRA
  'pension',    // 4. Pension
  'roth_401k',  // 5. Roth 401k / 457b (tax-free — preserve as long as possible)
  'roth_ira',   // 6. Roth IRA (tax-free — last resort)
  'other',      // 7. Other / catch-all
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function num(val, fallback = 0) {
  if (val === '' || val === null || val === undefined) return fallback
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[$,%]/g, ''))
  return isNaN(n) ? fallback : n
}

function pct(val, fallback = 0) {
  return num(val, fallback) / 100
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function rmdDivisor(age) {
  if (age < 73) return Infinity
  return RMD_TABLE[clamp(age, 73, 115)] ?? 2.9
}

// ─── Federal tax estimator ────────────────────────────────────────────────────
// Uses 2024 tax brackets inflated forward by inflMultiplier.
// Ordinary brackets: 10 / 12 / 22 / 24% (we stop at 24% for simplicity).
// Capital gains: 0% below the 15% threshold; 15% above.
// NOT a substitute for professional tax advice.

function computeTax(taxableOrdinary, capitalGainsIncome, isMFJ, inflMult) {
  // 2024 bracket thresholds (nominal). We inflate them each year so real
  // bracket creep doesn't artifically push retirees into higher brackets.
  const m = inflMult  // shorthand
  const brackets = isMFJ
    ? [
        { rate: 0.10, ceiling: 23200  * m },
        { rate: 0.12, ceiling: 94300  * m },
        { rate: 0.22, ceiling: 201050 * m },
        { rate: 0.24, ceiling: Infinity },
      ]
    : [
        { rate: 0.10, ceiling: 11600  * m },
        { rate: 0.12, ceiling: 47150  * m },
        { rate: 0.22, ceiling: 100525 * m },
        { rate: 0.24, ceiling: Infinity },
      ]

  // Ordinary income tax via bracket stacking
  let ordinaryTax = 0
  let prev = 0
  for (const { rate, ceiling } of brackets) {
    if (taxableOrdinary <= prev) break
    const slice = Math.min(taxableOrdinary, ceiling) - prev
    ordinaryTax += slice * rate
    prev = ceiling
    if (ceiling === Infinity) break
  }

  // Capital gains tax: 0% if total income below threshold, else 15%
  const cgThreshold = isMFJ ? 94050 * m : 47025 * m
  const cgRate = (taxableOrdinary + capitalGainsIncome) > cgThreshold ? 0.15 : 0.00
  const capitalGainsTax = capitalGainsIncome * cgRate

  return Math.max(0, ordinaryTax + capitalGainsTax)
}

// ─── simulate ────────────────────────────────────────────────────────────────

export function simulate(state) {
  const { profile, spending, accounts, socialSecurity, futureEvents, emergencyFund, survivingSpouse } = state

  // Surviving spouse defaults — safe if the slice is missing (old saved state)
  const ss_scenario = survivingSpouse ?? { enabled: false }
  const ss_enabled     = ss_scenario.enabled === true
  const ss_whoPassesKey = ss_scenario.whoPassesKey ?? 'person2'
  const ss_eventAge    = num(ss_scenario.ageOfPerson1WhenItOccurs, 75)
  const ss_spendFactor = num(ss_scenario.spendingFactor, 0.75)

  const p1CurrentAge = num(profile.person1.age, 0)
  if (p1CurrentAge < 1) return []

  const currentYear   = new Date().getFullYear()
  const inflationRate = pct(profile.inflationRate, 0.03)

  // ── Person 1 params ───────────────────────────────────────────────────────
  const p1 = {
    currentAge:       p1CurrentAge,
    retirementAge:    num(profile.person1.retirementAge, 65),
    employmentStatus: profile.person1.employmentStatus,
    income:           num(profile.person1.income, 0),
    startAge:         num(profile.person1.expectedStartAge, p1CurrentAge),
    startSalary:      num(profile.person1.expectedStartingSalary, 0),
    growthRate:       pct(profile.person1.incomeGrowthRate, 0.03),
    ssMonthly:        num(socialSecurity.person1.monthlyBenefit, 0),
    ssClaimAge:       num(socialSecurity.person1.claimingAge, 67),
    bridge:           profile.person1.bridgeIncome ?? null,
  }

  // ── Person 2 params ───────────────────────────────────────────────────────
  const p2Included   = profile.includePerson2
  const p2CurrentAge = num(profile.person2.age, 0)

  // ── Horizon: furthest of P1 life expectancy, P2 life expectancy (as P1-age),
  //            or the manual planningHorizonAge override ──────────────────────
  const p1LifeExp = num(profile.person1.lifeExpectancy, 90)
  const p2LifeExp = p2Included ? num(profile.person2.lifeExpectancy, 90) : 0
  // Express P2's life expectancy as an equivalent P1 age so the loop (which
  // increments P1's age) runs long enough to cover P2's full lifetime.
  const p2LifeExpAsP1Age = p2Included && p2CurrentAge > 0
    ? p1CurrentAge + (p2LifeExp - p2CurrentAge)
    : 0
  const horizonAge = Math.max(
    p1LifeExp,
    p2LifeExpAsP1Age,
    num(profile.planningHorizonAge, 90)
  )

  const p2 = p2Included ? {
    currentAge:       p2CurrentAge,
    retirementAge:    num(profile.person2.retirementAge, 65),
    employmentStatus: profile.person2.employmentStatus,
    income:           num(profile.person2.income, 0),
    startAge:         num(profile.person2.expectedStartAge, p2CurrentAge),
    startSalary:      num(profile.person2.expectedStartingSalary, 0),
    growthRate:       pct(profile.person2.incomeGrowthRate, 0.03),
    ssMonthly:        num(socialSecurity.person2.monthlyBenefit, 0),
    ssClaimAge:       num(socialSecurity.person2.claimingAge, 67),
    bridge:           profile.person2.bridgeIncome ?? null,
  } : null

  // ── Spending base values — today's dollars, NEVER mutated in loop ─────────
  const BASE_PRE_RETIREMENT = num(spending.annualPreRetirement, 0)
  const BASE_RET_LIVING     = num(spending.annualRetirementLiving, 0)
  const BASE_RET_HEALTH     = num(spending.annualRetirementHealthcare, 0)
  // Effective fallbacks when retirement fields blank
  const BASE_RET_LIVING_EFF = BASE_RET_LIVING > 0 ? BASE_RET_LIVING : BASE_PRE_RETIREMENT * 0.75
  const BASE_RET_HEALTH_EFF = BASE_RET_HEALTH > 0 ? BASE_RET_HEALTH : BASE_PRE_RETIREMENT * 0.10

  // ── Accounts: mutable working copies ─────────────────────────────────────
  const workingAccounts = accounts.filter(a => a.id).map(a => ({
    id:              a.id,
    name:            a.name || 'Account',
    type:            a.type || 'other',
    balance:         num(a.balance, 0),
    annualContrib:   num(a.monthlyContribution, 0) * 12,
    annualMatch:     num(a.monthlyEmployerMatch, 0) * 12,
    growthRate:      pct(a.annualGrowthRate, 0.07),
    stopYearsBefore: num(a.stopContributingYearsBefore, 0),
  }))

  // ── Emergency fund ────────────────────────────────────────────────────────
  // EF balance can go negative (reflects money owed / borrowed)
  let efBalance = num(emergencyFund.currentBalance, 0)
  const efRate  = pct(emergencyFund.growthRate, 0.04)

  // ── Debt tracking ─────────────────────────────────────────────────────────
  const DEBT_RATE  = 0.05
  const DEBT_YEARS = 3
  const debtTranches = []
  let debtBalance = 0

  // ── Future events index ───────────────────────────────────────────────────
  // One-time events (large_expense, windfall): indexed by the exact age they occur.
  // Income-change events: stored separately and applied every year in [startAge, endAge).
  const eventsByAge = {}
  const incomeChangeEvents = []

  for (const evt of (futureEvents ?? [])) {
    const age = num(evt.person1Age, 0)
    if (age < 1) continue
    if (evt.type === 'income_change') {
      incomeChangeEvents.push(evt)
    } else {
      if (!eventsByAge[age]) eventsByAge[age] = []
      eventsByAge[age].push(evt)
    }
  }

  // Pre-compute retirement age for income_change endAge default
  const p1RetirementAge = num(profile.person1.retirementAge, 65)

  // ── Helpers ───────────────────────────────────────────────────────────────

  function getSalary(p, ageNow, yearsElapsed) {
    if (!p || ageNow >= p.retirementAge) return 0
    let salary = 0
    if (p.employmentStatus === 'employed') {
      salary = p.income > 0 ? p.income * Math.pow(1 + p.growthRate, yearsElapsed) : 0
    } else if (p.employmentStatus === 'not_yet_employed') {
      if (ageNow >= p.startAge) {
        salary = p.startSalary * Math.pow(1 + p.growthRate, ageNow - p.startAge)
      }
    }
    return salary
  }

  /**
   * Returns bridge/part-time income for a person in a given year.
   * Bridge income is active if enabled AND ageNow is in [startAge, endAge).
   * It supplements (adds to) the main salary — works before or after retirement.
   * Grows at its own rate from startAge.
   */
  function getBridgeIncome(p, ageNow) {
    const bi = p?.bridge
    if (!bi || !bi.enabled) return 0
    const startAge = num(bi.startAge, 62)
    const endAge   = num(bi.endAge, 67)
    if (ageNow < startAge || ageNow >= endAge) return 0
    const amount    = num(bi.annualAmount, 0)
    const growthRate = pct(bi.growthRate, 0)
    return amount * Math.pow(1 + growthRate, ageNow - startAge)
  }

  function getSS(p, ageNow, inflMult) {
    if (!p || p.ssMonthly <= 0 || ageNow < p.ssClaimAge) return 0
    return p.ssMonthly * 12 * inflMult
  }

  // ─── MAIN LOOP ────────────────────────────────────────────────────────────

  const ledger = []

  for (let yr = 0; yr <= horizonAge - p1CurrentAge; yr++) {
    const p1Age = p1CurrentAge + yr
    const p2Age = p2Included ? p2CurrentAge + yr : null
    const year  = currentYear + yr

    // 1. Inflation multiplier — applied once to all base spending values
    const inflMultiplier = Math.pow(1 + inflationRate, yr)

    // 2. Life phase
    const p1Retired  = p1Age >= p1.retirementAge
    const p2Retired  = p2 ? (p2Age >= p2.retirementAge) : true
    const bothRetired = p1Retired && p2Retired

    // 3. Salaries + bridge income
    const person1Salary       = getSalary(p1, p1Age, yr)
    const person2Salary       = p2 ? getSalary(p2, p2Age, yr) : 0
    const bridgeIncomePerson1 = getBridgeIncome(p1, p1Age)
    const bridgeIncomePerson2 = p2 ? getBridgeIncome(p2, p2Age) : 0
    const totalSalary = person1Salary + person2Salary + bridgeIncomePerson1 + bridgeIncomePerson2

    // 4. Contributions — FIX BUG 3: entire block skipped when retired
    let accountContributions = 0
    let totalEmployerContrib = 0
    if (!p1Retired) {
      for (const acct of workingAccounts) {
        const stopAge = p1.retirementAge - acct.stopYearsBefore
        if (p1Age < stopAge) {
          accountContributions += acct.annualContrib
          totalEmployerContrib += acct.annualMatch
        }
      }
    }

    // 5. Social Security
    const socialSecurityPerson1 = getSS(p1, p1Age, inflMultiplier)
    const socialSecurityPerson2 = p2 ? getSS(p2, p2Age, inflMultiplier) : 0
    const totalSS = socialSecurityPerson1 + socialSecurityPerson2

    // 6. Spending — inflation applied once from immutable BASE constants
    let livingSpending, healthSpending
    if (!p1Retired) {
      livingSpending = BASE_PRE_RETIREMENT * inflMultiplier
      healthSpending = 0
    } else {
      livingSpending = BASE_RET_LIVING_EFF * inflMultiplier
      healthSpending = BASE_RET_HEALTH_EFF * inflMultiplier
    }

    // 6b. Surviving-spouse adjustments
    //     When the scenario is active, zero the deceased person's salary and
    //     apply the survivor SS rule (keep only the higher benefit).
    //     Spending is reduced to reflect a single-person household.
    const survivingSpouseActive = ss_enabled && p1Age >= ss_eventAge

    let adjPerson1Salary       = person1Salary
    let adjPerson2Salary       = person2Salary
    let adjBridgeIncomePerson1 = bridgeIncomePerson1
    let adjBridgeIncomePerson2 = bridgeIncomePerson2
    let adjSS1 = socialSecurityPerson1
    let adjSS2 = socialSecurityPerson2

    if (survivingSpouseActive) {
      if (ss_whoPassesKey === 'person1') {
        // P1 passes — zero all P1 income
        adjPerson1Salary       = 0
        adjBridgeIncomePerson1 = 0
        // Survivor (P2) keeps the higher SS benefit
        const higherSS = Math.max(socialSecurityPerson1, socialSecurityPerson2)
        adjSS1 = higherSS
        adjSS2 = 0
      } else {
        // P2 passes — zero all P2 income
        adjPerson2Salary       = 0
        adjBridgeIncomePerson2 = 0
        // Survivor (P1) keeps the higher SS benefit
        const higherSS = Math.max(socialSecurityPerson1, socialSecurityPerson2)
        adjSS1 = higherSS
        adjSS2 = 0
      }
      // Single-person household spending
      livingSpending = livingSpending * ss_spendFactor
      healthSpending = healthSpending * ss_spendFactor
    }

    // Resolve the final salary and SS totals used for the rest of the loop
    const effectivePerson1Salary = adjPerson1Salary
    const effectivePerson2Salary = adjPerson2Salary
    const effectiveBridge1       = adjBridgeIncomePerson1
    const effectiveBridge2       = adjBridgeIncomePerson2
    const effectiveSS1           = adjSS1
    const effectiveSS2           = adjSS2
    const effectiveTotalSalary   = effectivePerson1Salary + effectivePerson2Salary
                                   + effectiveBridge1 + effectiveBridge2
    const effectiveTotalSS       = effectiveSS1 + effectiveSS2

    const baseSpending = livingSpending + healthSpending

    // 7. Future events (today's dollars × inflation)
    //    One-time: large_expense / windfall — only in the exact year they occur.
    //    Recurring: income_change — added every year from startAge until endAge
    //               (or retirement if endAge not specified).
    const eventsThisYear = eventsByAge[p1Age] || []
    const oneTimeNet = eventsThisYear.reduce(
      (sum, e) => sum + num(e.amount, 0) * inflMultiplier, 0
    )

    // Sum all active income_change events for this age
    const recurringIncome = incomeChangeEvents.reduce((sum, e) => {
      const startAge = num(e.person1Age, 0)
      // endAge: use event.endAge if set, otherwise stop at P1 retirement
      const endAge = e.endAge && num(e.endAge, 0) > 0
        ? num(e.endAge, 0)
        : p1RetirementAge
      if (p1Age < startAge || p1Age >= endAge) return sum
      // Inflate from the year the event starts
      const yearsActive = p1Age - startAge
      return sum + num(e.amount, 0) * Math.pow(1 + inflationRate, startAge - p1CurrentAge + yearsActive)
    }, 0)

    const largeEventsNet  = oneTimeNet  // one-time net (can be + or −)
    const eventExpenses   = Math.abs(Math.min(largeEventsNet, 0))
    // Positive one-time windfalls + recurring income changes both flow as income
    const eventIncome     = Math.max(largeEventsNet, 0) + Math.max(recurringIncome, 0)
    // Negative income changes (pay cuts) reduce effective salary via spending gap,
    // represented as an additional expense so drawdown/EF absorbs the shortfall
    const recurringExpense = Math.abs(Math.min(recurringIncome, 0))

    // 8. Debt service
    const debtInterest = debtBalance * DEBT_RATE
    let debtPrincipalRepayment = 0
    for (const t of debtTranches) {
      if (t.yearsLeft > 0) {
        debtPrincipalRepayment += Math.min(t.original / DEBT_YEARS, t.principal)
      }
    }

    // 9. RMDs — FIX BUG 5: withdraw from accounts BEFORE drawdown loop
    //    These are CREDITED in nonPortfolioIncome below, so they reduce the
    //    drawdown gap without being touched again in the drawdown loop.
    let totalRmdThisYear = 0
    const rmdDiv = rmdDivisor(p1Age)
    if (isFinite(rmdDiv)) {
      for (const acct of workingAccounts) {
        if (!['trad_401k', 'trad_ira', 'pension'].includes(acct.type)) continue
        if (acct.balance <= 0) continue
        const rmd = acct.balance / rmdDiv
        totalRmdThisYear += rmd
        acct.balance = Math.max(0, acct.balance - rmd)
      }
    }

    // 10. HSA special routing — cover healthSpending from HSA BEFORE the main loop
    //     HSA withdrawals for qualified medical expenses are tax-free.
    //     We route healthSpending through HSA first, then handle remaining costs.
    let hsaWithdrawal = 0
    if (p1Retired && healthSpending > 0) {
      for (const acct of workingAccounts) {
        if (acct.type !== 'hsa' || acct.balance <= 0) continue
        const take    = Math.min(acct.balance, healthSpending - hsaWithdrawal)
        acct.balance -= take
        hsaWithdrawal += take
        if (hsaWithdrawal >= healthSpending) break
      }
    }

    // 11. Drawdown gap
    //     Gap = (spending net of HSA coverage) − all non-portfolio income.
    //     SS credit is applied BEFORE any account is touched.
    //     If SS + salary + RMD + eventIncome ≥ remaining costs → drawdown = 0.
    let drawdownNeeded    = 0
    let portfolioDrawdown = 0

    if (p1Retired) {
      const nonPortfolioIncome =
        effectiveTotalSalary + effectiveTotalSS + totalRmdThisYear + eventIncome
        - recurringExpense

      // healthSpending already partially/fully covered by hsaWithdrawal
      const remainingHealthCost = healthSpending - hsaWithdrawal
      const totalCosts =
        livingSpending + remainingHealthCost + eventExpenses
        + debtInterest + debtPrincipalRepayment

      drawdownNeeded = Math.max(0, totalCosts - nonPortfolioIncome)
    }

    // Execute drawdown in tax-efficient order (HSA already excluded from list)
    // Track withdrawals by tax treatment for the tax estimator.
    let withdrawalsFromTrad    = 0   // trad_401k, trad_ira, pension → ordinary income
    let withdrawalsFromTaxable = 0   // taxable brokerage → capital gains
    let withdrawalsFromRoth    = 0   // roth_401k, roth_ira → tax-free

    if (drawdownNeeded > 0) {
      let remaining = drawdownNeeded
      for (const typeKey of WITHDRAWAL_ORDER) {
        if (remaining <= 0) break
        for (const acct of workingAccounts) {
          if (acct.type !== typeKey || acct.balance <= 0) continue
          const take    = Math.min(acct.balance, remaining)
          acct.balance -= take
          remaining    -= take
          portfolioDrawdown += take
          // Classify by tax treatment
          if (['trad_401k', 'trad_ira', 'pension'].includes(typeKey)) withdrawalsFromTrad    += take
          else if (typeKey === 'taxable')                              withdrawalsFromTaxable += take
          else if (['roth_401k', 'roth_ira'].includes(typeKey))       withdrawalsFromRoth    += take
        }
      }
      // Anything unmet → external debt tranche
      if (remaining > 0) {
        debtTranches.push({ original: remaining, principal: remaining, yearsLeft: DEBT_YEARS })
        debtBalance += remaining
      }
    }

    // 11b. Federal tax estimation
    //      RMDs are ordinary income (already in totalRmdThisYear).
    //      Salary is ordinary income. SS: 85% is taxable above low-income thresholds
    //      (we use 85% flat as a conservative simplification for middle-income retirees).
    //      Standard deduction inflates with CPI so real after-tax income stays sensible.
    const stdDeduction     = (p2Included ? 29200 : 14600) * inflMultiplier
    const ordinaryIncome   = effectiveTotalSalary + effectiveTotalSS * 0.85 + totalRmdThisYear + withdrawalsFromTrad
    const capitalGainsIncome = withdrawalsFromTaxable
    const taxableOrdinary  = Math.max(0, ordinaryIncome - stdDeduction)
    const estimatedTax     = computeTax(taxableOrdinary, capitalGainsIncome, p2Included, inflMultiplier)
    const totalGrossIncome = effectiveTotalSalary + effectiveTotalSS + totalRmdThisYear + eventIncome + portfolioDrawdown
    const afterTaxIncome   = Math.max(0, totalGrossIncome - estimatedTax)
    const effectiveTaxRate = totalGrossIncome > 0 ? estimatedTax / totalGrossIncome : 0

    // 12. Compound accounts AFTER drawdown, THEN add contributions
    for (const acct of workingAccounts) {
      acct.balance = acct.balance * (1 + acct.growthRate)
      if (!p1Retired) {
        const stopAge = p1.retirementAge - acct.stopYearsBefore
        if (p1Age < stopAge) {
          acct.balance += acct.annualContrib + acct.annualMatch
        }
      }
    }

    // 13. Emergency fund growth
    // Only positive balances earn interest; negative EF (owed money) doesn't compound here
    // (debt tranches handle the borrowing cost separately)
    if (efBalance > 0) {
      efBalance = efBalance * (1 + efRate)
    }
    // Negative EF is allowed — it reflects a cash shortfall that hasn't been formalized as debt

    // 14. Cash balance — fully balanced equation
    //     cashIn  = all income sources + portfolio drawdown + HSA withdrawal
    //     cashOut = all spending + contributions + debt service
    const totalCashIn  = effectiveTotalSalary + effectiveTotalSS + totalRmdThisYear + eventIncome
                         + portfolioDrawdown + hsaWithdrawal
    const totalCashOut = livingSpending + healthSpending
                         + eventExpenses + recurringExpense + accountContributions
                         + debtInterest + debtPrincipalRepayment
    let cashAfterDrawdown = totalCashIn - totalCashOut

    // ── 14a. DEFICIT handling ──────────────────────────────────────────────
    // Order: drain EF → drain taxable brokerage → create debt
    if (cashAfterDrawdown < 0) {
      let shortfall = -cashAfterDrawdown   // positive number = how much we need

      // 1. Take from EF first (down to 0, not below)
      if (efBalance > 0) {
        const fromEF  = Math.min(efBalance, shortfall)
        efBalance    -= fromEF
        shortfall    -= fromEF
      }

      // 2. If still short, take from taxable brokerage account(s)
      if (shortfall > 0) {
        for (const acct of workingAccounts) {
          if (shortfall <= 0) break
          if (acct.type !== 'taxable' || acct.balance <= 0) continue
          const fromTaxable  = Math.min(acct.balance, shortfall)
          acct.balance      -= fromTaxable
          shortfall         -= fromTaxable
          withdrawalsFromTaxable += fromTaxable   // count toward capital gains for tax
        }
      }

      // 3. Anything still unmet → debt
      if (shortfall > 0) {
        debtTranches.push({ original: shortfall, principal: shortfall, yearsLeft: DEBT_YEARS })
        debtBalance += shortfall
      }

      cashAfterDrawdown = 0   // deficit fully absorbed above
    }

    // ── 14b. SURPLUS handling ─────────────────────────────────────────────
    // Order: fill EF up to $50k cap → overflow into taxable brokerage
    const EF_CAP = 50_000 * inflMultiplier   // cap inflates with CPI in nominal terms
    let emergencyFundContribution = 0

    if (cashAfterDrawdown > 0) {
      let surplus = cashAfterDrawdown

      // 1. Top up EF to the cap
      if (efBalance < EF_CAP) {
        const toEF  = Math.min(surplus, EF_CAP - efBalance)
        efBalance  += toEF
        emergencyFundContribution += toEF
        surplus    -= toEF
      }

      // 2. Route overflow into taxable brokerage (first one found, or any)
      if (surplus > 0) {
        const taxableAcct = workingAccounts.find(a => a.type === 'taxable')
        if (taxableAcct) {
          taxableAcct.balance += surplus
        } else {
          // No taxable account exists — add remainder to EF as before
          efBalance += surplus
          emergencyFundContribution += surplus
        }
        surplus = 0
      }
    }

    // 15. Advance debt tranches
    let newDebtBalance = 0
    for (const t of debtTranches) {
      if (t.yearsLeft > 0) {
        const payment = t.original / DEBT_YEARS
        t.principal  = Math.max(0, t.principal - payment)
        t.yearsLeft -= 1
      }
      if (t.principal > 0) newDebtBalance += t.principal
    }
    debtBalance = newDebtBalance

    // 16. Portfolio totals
    // totalPortfolioValue = investment accounts only (excludes EF)
    // totalNetWorth       = investment accounts + EF (the complete picture)
    const totalPortfolioValue = workingAccounts.reduce((s, a) => s + Math.max(0, a.balance), 0)
    const totalNetWorth       = totalPortfolioValue + efBalance  // EF can be negative
    const accountBalances = {}
    for (const acct of workingAccounts) {
      accountBalances[acct.id] = Math.max(0, acct.balance)
    }

    // 17. Assemble row
    ledger.push({
      age:  p1Age,
      year,
      p2Age,

      // Income
      person1Salary:         Math.round(effectivePerson1Salary),
      person2Salary:         Math.round(effectivePerson2Salary),
      bridgeIncomePerson1:   Math.round(effectiveBridge1),
      bridgeIncomePerson2:   Math.round(effectiveBridge2),
      employerContributions: Math.round(totalEmployerContrib),
      socialSecurityPerson1: Math.round(effectiveSS1),
      socialSecurityPerson2: Math.round(effectiveSS2),
      rmdIncome:             Math.round(totalRmdThisYear),
      eventIncome:           Math.round(eventIncome),
      incomeChangeRecurring: Math.round(Math.max(recurringIncome, 0)),  // salary-change recurring income (positive only)
      totalIncome:           Math.round(effectiveTotalSalary + effectiveTotalSS + totalRmdThisYear + eventIncome),

      // Spending
      livingSpending:        Math.round(livingSpending),
      healthSpending:        Math.round(healthSpending),
      hsaWithdrawal:         Math.round(hsaWithdrawal),
      accountContributions:  Math.round(accountContributions),
      largeEvents:           Math.round(largeEventsNet),
      debtInterest:          Math.round(debtInterest),
      debtRepayment:         Math.round(debtPrincipalRepayment),
      totalSpending:         Math.round(totalCashOut),
      totalSpendingNetHSA:   Math.round(totalCashOut - hsaWithdrawal),

      // Cash flow
      portfolioDrawdown:     Math.round(portfolioDrawdown),
      annualSurplus:         Math.round(cashAfterDrawdown),

      // Balances
      emergencyFundContribution: Math.round(emergencyFundContribution),
      emergencyFundBalance:      Math.round(efBalance),      // can be negative
      emergencyFundDepleted:     efBalance < 0,
      debtBalance:               Math.round(debtBalance),
      ...accountBalances,
      totalPortfolioValue:       Math.round(totalPortfolioValue),  // investment accounts only
      totalNetWorth:             Math.round(totalNetWorth),         // includes EF

      // Meta
      inflationMultiplier: inflMultiplier,
      p1Retired,
      p2Retired,
      bothRetired,
      survivingSpouseActive,
      drawdownNeeded: Math.round(drawdownNeeded),

      // Tax estimation
      estimatedTax:         Math.round(estimatedTax),
      taxableOrdinaryIncome: Math.round(taxableOrdinary),
      effectiveTaxRate:     parseFloat(effectiveTaxRate.toFixed(4)),
      afterTaxIncome:       Math.round(afterTaxIncome),
    })

    if (p1Age >= horizonAge) break
  }

  return ledger
}

// ─── summarize ───────────────────────────────────────────────────────────────

export function summarize(ledger) {
  if (!ledger || ledger.length === 0) {
    return {
      portfolioAtRetirement: null,
      portfolioFinal:        null,
      depletionAge:          null,
      totalSSLifetime:       null,
      peakPortfolio:         null,
      retirementYear:        null,
    }
  }

  const retirementRow = ledger.find(r => r.p1Retired)
  const finalRow      = ledger[ledger.length - 1]

  // Use totalNetWorth (accounts + EF) for a complete picture;
  // fall back to totalPortfolioValue for ledgers that predate the totalNetWorth field
  const netWorthAt = (r) => r?.totalNetWorth ?? r?.totalPortfolioValue ?? 0
  const depletionRow  = ledger.find(r => r.p1Retired && netWorthAt(r) <= 0)
  const peakPortfolio = Math.max(...ledger.map(r => netWorthAt(r)))
  const totalSS       = ledger.reduce(
    (s, r) => s + r.socialSecurityPerson1 + r.socialSecurityPerson2, 0
  )

  return {
    portfolioAtRetirement: retirementRow ? netWorthAt(retirementRow) : null,
    portfolioFinal:        netWorthAt(finalRow),
    depletionAge:          depletionRow?.age ?? null,
    totalSSLifetime:       Math.round(totalSS),
    peakPortfolio:         Math.round(peakPortfolio),
    retirementAge:         retirementRow?.age ?? null,
    retirementYear:        retirementRow?.year ?? null,
    finalAge:              finalRow.age,
    finalDebt:             finalRow.debtBalance,
    emergencyFundFinal:    finalRow.emergencyFundBalance,
  }
}

// ─── monteCarlo ──────────────────────────────────────────────────────────────

export function monteCarlo(state, runs = 500, targetAge = 90) {
  const { profile, accounts } = state
  const p1CurrentAge = num(profile.person1.age, 0)
  if (p1CurrentAge < 1 || accounts.length === 0) {
    return { survivalRate: null, p10: null, p50: null, p90: null, runs: 0 }
  }

  const p1RetirementAge = num(profile.person1.retirementAge, 65)
  const inflationRate   = pct(profile.inflationRate, 0.03)
  const baseRetSpend    =
    num(state.spending.annualRetirementLiving, 0) +
    num(state.spending.annualRetirementHealthcare, 0)
  const annualRetSpend  = baseRetSpend > 0
    ? baseRetSpend
    : num(state.spending.annualPreRetirement, 0) * 0.8

  const annualContribTotal = accounts.reduce(
    (s, a) => s + (num(a.monthlyContribution, 0) + num(a.monthlyEmployerMatch, 0)) * 12, 0
  )

  const totalBalance   = accounts.reduce((s, a) => s + num(a.balance, 0), 0)
  const weightedReturn = totalBalance > 0
    ? accounts.reduce(
        (s, a) => s + (num(a.balance, 0) / totalBalance) * pct(a.annualGrowthRate, 0.07), 0
      )
    : 0.07

  const SS_ANNUAL  = (
    num(state.socialSecurity.person1.monthlyBenefit, 0) +
    (profile.includePerson2 ? num(state.socialSecurity.person2.monthlyBenefit, 0) : 0)
  ) * 12
  const ssClaimAge = num(state.socialSecurity.person1.claimingAge, 67)

  const horizonYears = Math.max(targetAge - p1CurrentAge, 10)
  const sigma = 0.12

  let seed = 0xFEED
  const lcgRand = () => {
    seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF
    return (seed >>> 0) / 0xFFFFFFFF
  }
  const randn = () => {
    const u1 = Math.max(lcgRand(), 1e-10)
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * lcgRand())
  }

  let survived = 0
  const finalValues = []

  for (let r = 0; r < runs; r++) {
    let portfolio = totalBalance
    let debt      = 0

    for (let yr = 0; yr < horizonYears; yr++) {
      const p1Age   = p1CurrentAge + yr
      const infl    = Math.pow(1 + inflationRate, yr)
      const retired = p1Age >= p1RetirementAge
      const ss      = p1Age >= ssClaimAge ? SS_ANNUAL * infl : 0
      const spend   = retired ? annualRetSpend * infl : 0
      const contrib = retired ? 0 : annualContribTotal

      portfolio = Math.max(0, portfolio) * (1 + weightedReturn + sigma * randn()) + contrib

      if (retired) {
        const gap = Math.max(0, spend - ss)
        if (gap > 0) {
          if (portfolio >= gap) { portfolio -= gap }
          else { debt += gap - portfolio; portfolio = 0 }
        }
      }
      debt *= 1.05
    }

    if (portfolio > 0 && debt < portfolio * 0.1) survived++
    finalValues.push(portfolio - debt)
  }

  finalValues.sort((a, b) => a - b)

  return {
    survivalRate: Math.round((survived / runs) * 100),
    p10:  Math.round(finalValues[Math.floor(runs * 0.10)] ?? 0),
    p50:  Math.round(finalValues[Math.floor(runs * 0.50)] ?? 0),
    p90:  Math.round(finalValues[Math.floor(runs * 0.90)] ?? 0),
    runs,
    targetAge,
  }
}

// ─── incomeSourcesByAge ───────────────────────────────────────────────────────

export function incomeSourcesByAge(ledger) {
  return {
    ages:     ledger.map(r => r.age),
    salary1:  ledger.map(r => r.person1Salary),
    salary2:  ledger.map(r => r.person2Salary),
    ss1:      ledger.map(r => r.socialSecurityPerson1),
    ss2:      ledger.map(r => r.socialSecurityPerson2),
    drawdown: ledger.map(r => r.portfolioDrawdown),
    rmd:      ledger.map(r => r.rmdIncome),
  }
}
