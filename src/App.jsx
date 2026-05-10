import NavBar from './components/NavBar'
import Dashboard from './pages/Dashboard'
import ProfileIncome from './pages/ProfileIncome'
import Accounts from './pages/Accounts'
import Events from './pages/Events'
import Scenarios from './pages/Scenarios'
import { useStore } from './store'
import { WhatIfProvider } from './store/whatif'

const PAGE_MAP = {
  dashboard: Dashboard,
  profile: ProfileIncome,
  accounts: Accounts,
  events: Events,
  scenarios: Scenarios,
}

export default function App() {
  const { state } = useStore()
  const ActivePage = PAGE_MAP[state._ui.activeTab] || Dashboard

  return (
    <WhatIfProvider>
      <div className="min-h-screen bg-slate-950 bg-grid">
        <NavBar />
        <main className="w-full px-4 md:px-6 py-6 md:py-8 pb-24 md:pb-8">
          <ActivePage key={state._ui.activeTab} />
        </main>
      </div>
    </WhatIfProvider>
  )
}
