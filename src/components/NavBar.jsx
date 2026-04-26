import { useRef, useState } from 'react'
import { useStore, ACTIONS } from '../store'

const TABS = [
  { id: 'dashboard',  label: 'Dashboard',        icon: '◈' },
  { id: 'profile',    label: 'Profile & Income',  icon: '◉' },
  { id: 'accounts',   label: 'Accounts',          icon: '◑' },
  { id: 'events',     label: 'Events',            icon: '◐' },
  { id: 'scenarios',  label: 'Scenarios',         icon: '◎' },
]

export default function NavBar() {
  const { state, dispatch } = useStore()
  const active = state._ui.activeTab

  const [menuOpen,      setMenuOpen]      = useState(false)
  const [saveSuccess,   setSaveSuccess]   = useState(false)
  const [loadError,     setLoadError]     = useState('')
  const [loadSuccess,   setLoadSuccess]   = useState(false)
  const fileInputRef = useRef(null)

  // ── Export: download full state as JSON ─────────────────────────────────
  const handleExport = () => {
    const { _ui, ...exportState } = state
    const payload = {
      version:    2,
      exportedAt: new Date().toISOString(),
      appName:    'FamilyWealthPlanner',
      state:      exportState,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `FWP_settings_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 2500)
    setMenuOpen(false)
  }

  // ── Import: load state from JSON file ───────────────────────────────────
  const handleImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoadError('')
    setLoadSuccess(false)
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const parsed       = JSON.parse(evt.target.result)
        const importedState = parsed.state ?? parsed   // support both v1 and v2 format
        if (!importedState.profile?.person1) {
          setLoadError('Invalid file — does not look like a FamilyWealthPlanner settings file.')
          return
        }
        dispatch({ type: ACTIONS.LOAD_STATE, payload: importedState })
        setLoadSuccess(true)
        setTimeout(() => setLoadSuccess(false), 3000)
        setMenuOpen(false)
      } catch {
        setLoadError('Could not read file — make sure it is a valid .json export.')
      }
    }
    reader.readAsText(file)
    // Reset input so the same file can be re-imported if needed
    e.target.value = ''
  }

  return (
    <header className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-slate-800">
      <div className="w-full px-6">
        <div className="flex items-center gap-8">
          {/* Logo */}
          <div className="flex items-center gap-2.5 py-3 shrink-0">
            <div className="w-7 h-7 rounded-md bg-gold-500 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z"
                  fill="#0a1120" stroke="#0a1120" strokeWidth="0.5" />
                <path d="M8 12l3 3 5-5" stroke="#e8a800" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="font-display font-semibold text-base text-slate-100 tracking-tight">
              FamilyWealth<span className="text-gold-400">Planner</span>
            </span>
          </div>

          <div className="w-px h-6 bg-slate-800 shrink-0" />

          {/* Tabs */}
          <nav className="flex items-end gap-1 overflow-x-auto no-scrollbar flex-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => dispatch({ type: ACTIONS.SET_ACTIVE_TAB, payload: tab.id })}
                className={`nav-tab ${active === tab.id ? 'active' : ''}`}
              >
                <span className="mr-1.5 text-xs opacity-60">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Right side: Save/Load + auto-save indicator */}
          <div className="shrink-0 flex items-center gap-3">

            {/* Save/Load button + dropdown */}
            <div className="relative">
              <button
                onClick={() => { setMenuOpen(o => !o); setLoadError('') }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                  saveSuccess
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                    : menuOpen
                    ? 'bg-gold-500/15 border-gold-500/40 text-gold-300'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600 hover:text-slate-100'
                }`}
              >
                {saveSuccess ? (
                  <>
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
                      <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                    </svg>
                    Saved!
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
                      <path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H9.5a1 1 0 0 0-1 1v4.5h2a.5.5 0 0 1 .354.854l-2.5 2.5a.5.5 0 0 1-.708 0l-2.5-2.5A.5.5 0 0 1 5.5 6.5h2V2a2 2 0 0 1 2-2H14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h2.5a.5.5 0 0 1 0 1H2z"/>
                    </svg>
                    Save / Load
                    <svg viewBox="0 0 16 16" className={`w-3 h-3 fill-current transition-transform ${menuOpen ? 'rotate-180' : ''}`}>
                      <path d="M7.247 11.14L2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z"/>
                    </svg>
                  </>
                )}
              </button>

              {/* Dropdown menu */}
              {menuOpen && (
                <>
                  {/* Backdrop to close on outside click */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden"
                    style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.6))' }}>

                    {/* Header */}
                    <div className="px-4 py-3 border-b border-slate-800">
                      <p className="text-xs font-semibold text-slate-200">Save / Load Settings</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Back up your plan or transfer to another computer
                      </p>
                    </div>

                    {/* Export option */}
                    <button
                      onClick={handleExport}
                      className="w-full flex items-start gap-3 px-4 py-3.5 hover:bg-slate-800 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0 mt-0.5">
                        <svg viewBox="0 0 16 16" className="w-4 h-4 fill-emerald-400">
                          <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                          <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-200">Download settings file</p>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                          Saves all your accounts, profile, and spending as a
                          <span className="font-mono text-slate-400"> .json </span>
                          file to your computer
                        </p>
                      </div>
                    </button>

                    {/* Divider */}
                    <div className="border-t border-slate-800 mx-4" />

                    {/* Import option */}
                    <label className="w-full flex items-start gap-3 px-4 py-3.5 hover:bg-slate-800 transition-colors text-left cursor-pointer">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/25 flex items-center justify-center shrink-0 mt-0.5">
                        <svg viewBox="0 0 16 16" className="w-4 h-4 fill-blue-400">
                          <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                          <path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V10.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z"/>
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-200">Load settings file</p>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                          Restore your plan from a previously downloaded
                          <span className="font-mono text-slate-400"> .json </span>
                          file — replaces current settings
                        </p>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        className="hidden"
                        onChange={handleImport}
                      />
                    </label>

                    {/* Error / success feedback */}
                    {loadError && (
                      <div className="mx-4 mb-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <p className="text-xs text-red-400">⚠ {loadError}</p>
                      </div>
                    )}
                    {loadSuccess && (
                      <div className="mx-4 mb-3 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                        <p className="text-xs text-emerald-400">✓ Settings loaded successfully!</p>
                      </div>
                    )}

                    {/* Footer note */}
                    <div className="px-4 py-2.5 bg-slate-950/50 border-t border-slate-800">
                      <p className="text-xs text-slate-600 leading-relaxed">
                        💡 Use this to transfer your plan between computers after deploying to Vercel.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Auto-save indicator */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-600 font-mono hidden sm:inline">auto-saved</span>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            </div>
          </div>

        </div>
      </div>

      {/* Load-success toast — shows briefly below the navbar */}
      {loadSuccess && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 px-4 py-2 bg-emerald-900/90 border border-emerald-500/30 rounded-lg shadow-xl text-xs text-emerald-300 font-medium pointer-events-none z-50">
          ✓ Settings loaded — your plan has been restored
        </div>
      )}
    </header>
  )
}
