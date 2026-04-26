import { createContext, useContext, useReducer, useEffect, useRef } from 'react'

// ─── Default State ───────────────────────────────────────────────────────────

const DEFAULT_STATE = {
  profile: {
    person1: {
      name: '',
      age: '',
      employmentStatus: 'employed',   // 'employed' | 'not_yet_employed'
      income: '',                      // annual gross salary (if employed)
      expectedStartAge: '',            // age when work begins (if not_yet_employed)
      expectedStartingSalary: '',      // starting salary (if not_yet_employed)
      incomeGrowthRate: 3,             // stored as plain % number e.g. 3 = 3%
      retirementAge: '',
      lifeExpectancy: 90,              // used to set simulation horizon
      bridgeIncome: {
        enabled:      false,
        startAge:     62,
        endAge:       67,
        annualAmount: 0,               // today's dollars
        growthRate:   0,               // % annual growth
      },
    },
    person2: {
      name: '',
      age: '',
      employmentStatus: 'employed',
      income: '',
      expectedStartAge: '',
      expectedStartingSalary: '',
      incomeGrowthRate: 3,
      retirementAge: '',
      lifeExpectancy: 90,
      bridgeIncome: {
        enabled:      false,
        startAge:     62,
        endAge:       67,
        annualAmount: 0,
        growthRate:   0,
      },
    },
    includePerson2: false,
    filingStatus: 'single',
    state: 'IN',
    inflationRate: 3,                  // stored as plain % number e.g. 3 = 3%
    planningHorizonAge: 95,
  },

  spending: {
    annualPreRetirement: '',           // yearly household spending before retirement
    annualRetirementLiving: '',        // yearly living expenses in retirement
    annualRetirementHealthcare: '',    // yearly healthcare/insurance in retirement
    categories: [],                    // { id, name, amount, isRetirementExpense }
  },

  accounts: [],
  // Each account: {
  //   id, name, type ('401k'|'roth_ira'|'trad_ira'|'taxable'|'hsa'|'pension'|'cash'),
  //   owner ('person1'|'person2'|'joint'),
  //   balance, contributionAnnual, employerMatchRate, employerMatchMax,
  //   expectedReturn, fees, notes
  // }

  socialSecurity: {
    person1: {
      monthlyBenefit: '',   // estimated monthly benefit in today's dollars
      claimingAge: 67,      // age to start claiming (62–70)
    },
    person2: {
      monthlyBenefit: '',
      claimingAge: 67,
    },
  },

  futureEvents: [],
  // Each event: {
  //   id, name, type ('large_expense'|'windfall'|'income_change'),
  //   person1Age,   // age of Person 1 when event occurs
  //   amount,       // today's dollars; positive = money in, negative = money out
  // }

  emergencyFund: {
    currentBalance: '',
    growthRate: 4,   // annual growth rate % (e.g. HYSA)
  },

  survivingSpouse: {
    enabled:                  false,
    whoPassesKey:             'person2',  // 'person1' or 'person2'
    ageOfPerson1WhenItOccurs: 75,         // P1's age when the event occurs
    spendingFactor:           0.75,       // survivor spends X% of couple's budget
  },

  projectionOverrides: {
    stockReturn: 0.07,
    bondReturn: 0.035,
    realEstateReturn: 0.05,
    inflationRate: 0.03,
    taxRateOrdinary: 0.22,
    taxRateCapGains: 0.15,
    sequenceOfReturnsRisk: true,
    monteCarloEnabled: false,
    monteCarloRuns: 500,
  },

  // UI state (not persisted to localStorage)
  _ui: {
    activeTab: 'dashboard',
    lastSaved: null,
  },
}

// ─── Action Types ─────────────────────────────────────────────────────────────

export const ACTIONS = {
  // Profile
  UPDATE_PROFILE: 'UPDATE_PROFILE',
  UPDATE_PERSON: 'UPDATE_PERSON',
  UPDATE_BRIDGE_INCOME: 'UPDATE_BRIDGE_INCOME',
  TOGGLE_PERSON2: 'TOGGLE_PERSON2',

  // Spending
  UPDATE_SPENDING: 'UPDATE_SPENDING',
  ADD_SPENDING_CATEGORY: 'ADD_SPENDING_CATEGORY',
  UPDATE_SPENDING_CATEGORY: 'UPDATE_SPENDING_CATEGORY',
  REMOVE_SPENDING_CATEGORY: 'REMOVE_SPENDING_CATEGORY',

  // Accounts
  ADD_ACCOUNT: 'ADD_ACCOUNT',
  UPDATE_ACCOUNT: 'UPDATE_ACCOUNT',
  REMOVE_ACCOUNT: 'REMOVE_ACCOUNT',
  REORDER_ACCOUNTS: 'REORDER_ACCOUNTS',

  // Social Security
  UPDATE_SOCIAL_SECURITY: 'UPDATE_SOCIAL_SECURITY',

  // Future Events
  ADD_EVENT: 'ADD_EVENT',
  UPDATE_EVENT: 'UPDATE_EVENT',
  REMOVE_EVENT: 'REMOVE_EVENT',

  // Emergency Fund
  UPDATE_EMERGENCY_FUND: 'UPDATE_EMERGENCY_FUND',

  // Surviving Spouse Scenario
  UPDATE_SURVIVING_SPOUSE: 'UPDATE_SURVIVING_SPOUSE',

  // Projection Overrides
  UPDATE_PROJECTION_OVERRIDES: 'UPDATE_PROJECTION_OVERRIDES',

  // UI
  SET_ACTIVE_TAB: 'SET_ACTIVE_TAB',

  // Persistence
  LOAD_STATE: 'LOAD_STATE',
  RESET_STATE: 'RESET_STATE',
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.LOAD_STATE:
      return { ...action.payload, _ui: { ...DEFAULT_STATE._ui, activeTab: state._ui.activeTab } }

    case ACTIONS.RESET_STATE:
      return { ...DEFAULT_STATE }

    case ACTIONS.TOGGLE_PERSON2:
      return {
        ...state,
        profile: { ...state.profile, includePerson2: !state.profile.includePerson2 },
      }

    // ── Profile ──
    case ACTIONS.UPDATE_PROFILE:
      return { ...state, profile: { ...state.profile, ...action.payload } }

    case ACTIONS.UPDATE_PERSON: {
      const { person, data } = action.payload
      return {
        ...state,
        profile: {
          ...state.profile,
          [person]: { ...state.profile[person], ...data },
        },
      }
    }

    case ACTIONS.UPDATE_BRIDGE_INCOME: {
      const { person, data } = action.payload
      return {
        ...state,
        profile: {
          ...state.profile,
          [person]: {
            ...state.profile[person],
            bridgeIncome: {
              ...state.profile[person].bridgeIncome,
              ...data,
            },
          },
        },
      }
    }

    // ── Spending ──
    case ACTIONS.UPDATE_SPENDING:
      return { ...state, spending: { ...state.spending, ...action.payload } }

    case ACTIONS.ADD_SPENDING_CATEGORY:
      return {
        ...state,
        spending: {
          ...state.spending,
          categories: [...state.spending.categories, action.payload],
        },
      }

    case ACTIONS.UPDATE_SPENDING_CATEGORY:
      return {
        ...state,
        spending: {
          ...state.spending,
          categories: state.spending.categories.map(c =>
            c.id === action.payload.id ? { ...c, ...action.payload } : c
          ),
        },
      }

    case ACTIONS.REMOVE_SPENDING_CATEGORY:
      return {
        ...state,
        spending: {
          ...state.spending,
          categories: state.spending.categories.filter(c => c.id !== action.payload),
        },
      }

    // ── Accounts ──
    case ACTIONS.ADD_ACCOUNT:
      return { ...state, accounts: [...state.accounts, action.payload] }

    case ACTIONS.UPDATE_ACCOUNT:
      return {
        ...state,
        accounts: state.accounts.map(a =>
          a.id === action.payload.id ? { ...a, ...action.payload } : a
        ),
      }

    case ACTIONS.REMOVE_ACCOUNT:
      return { ...state, accounts: state.accounts.filter(a => a.id !== action.payload) }

    case ACTIONS.REORDER_ACCOUNTS:
      return { ...state, accounts: action.payload }

    // ── Social Security ──
    case ACTIONS.UPDATE_SOCIAL_SECURITY: {
      const { person, data } = action.payload
      return {
        ...state,
        socialSecurity: {
          ...state.socialSecurity,
          [person]: { ...state.socialSecurity[person], ...data },
        },
      }
    }

    // ── Future Events ──
    case ACTIONS.ADD_EVENT:
      return { ...state, futureEvents: [...state.futureEvents, action.payload] }

    case ACTIONS.UPDATE_EVENT:
      return {
        ...state,
        futureEvents: state.futureEvents.map(e =>
          e.id === action.payload.id ? { ...e, ...action.payload } : e
        ),
      }

    case ACTIONS.REMOVE_EVENT:
      return { ...state, futureEvents: state.futureEvents.filter(e => e.id !== action.payload) }

    // ── Emergency Fund ──
    case ACTIONS.UPDATE_EMERGENCY_FUND:
      return { ...state, emergencyFund: { ...state.emergencyFund, ...action.payload } }

    // ── Surviving Spouse ──
    case ACTIONS.UPDATE_SURVIVING_SPOUSE:
      return {
        ...state,
        survivingSpouse: { ...state.survivingSpouse, ...action.payload },
      }

    // ── Projection Overrides ──
    case ACTIONS.UPDATE_PROJECTION_OVERRIDES:
      return {
        ...state,
        projectionOverrides: { ...state.projectionOverrides, ...action.payload },
      }

    // ── UI ──
    case ACTIONS.SET_ACTIVE_TAB:
      return { ...state, _ui: { ...state._ui, activeTab: action.payload } }

    default:
      return state
  }
}

// ─── LocalStorage Helpers ─────────────────────────────────────────────────────

const LS_KEY = 'fwp_state'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveToStorage(state) {
  try {
    // Strip _ui from persisted state
    const { _ui, ...persistable } = state
    localStorage.setItem(LS_KEY, JSON.stringify(persistable))
  } catch (e) {
    console.warn('FWP: Failed to save state to localStorage', e)
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const StoreContext = createContext(null)

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, DEFAULT_STATE, (initial) => {
    const saved = loadFromStorage()
    if (saved) {
      return { ...initial, ...saved, _ui: initial._ui }
    }
    return initial
  })

  // Debounced auto-save
  const saveTimer = useRef(null)
  useEffect(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveToStorage(state)
    }, 500)
    return () => clearTimeout(saveTimer.current)
  }, [state])

  return (
    <StoreContext.Provider value={{ state, dispatch }}>
      {children}
    </StoreContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within <StoreProvider>')
  return ctx
}

// ─── Utility: generate a simple unique ID ────────────────────────────────────

export function genId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}
