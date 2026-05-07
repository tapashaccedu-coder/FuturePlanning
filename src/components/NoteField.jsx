/**
 * NoteField — a collapsible note/comment textarea for any section.
 *
 * Usage:
 *   <NoteField noteKey="person1" />
 *   <NoteField noteKey={`account_${account.id}`} />
 *
 * Notes are stored in state.notes[noteKey] and saved with every scenario export.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { useStore, ACTIONS } from '../store'

export default function NoteField({ noteKey, placeholder = 'Add a note or comment…' }) {
  const { state, dispatch } = useStore()
  const text = (state.notes ?? {})[noteKey] ?? ''
  const hasNote = text.trim().length > 0

  const [open, setOpen] = useState(hasNote)   // auto-open if note already exists
  const textareaRef = useRef(null)

  // Auto-focus when opened
  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [open])

  const update = useCallback((val) => {
    dispatch({ type: ACTIONS.UPDATE_NOTE, payload: { key: noteKey, text: val } })
  }, [dispatch, noteKey])

  const clear = () => {
    update('')
    setOpen(false)
  }

  return (
    <div className="mt-3">
      {!open ? (
        /* ── Collapsed: small "Add note" button ── */
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors group"
        >
          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current shrink-0 opacity-60 group-hover:opacity-100">
            <path d="M14.5 3a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h13zm-13-1A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 14.5 2h-13z"/>
            <path d="M3 5.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5z"/>
          </svg>
          {hasNote ? (
            <span className="italic text-amber-400/70 truncate max-w-xs">
              {text.slice(0, 60)}{text.length > 60 ? '…' : ''}
            </span>
          ) : (
            <span>Add note</span>
          )}
        </button>
      ) : (
        /* ── Expanded: textarea + controls ── */
        <div className="rounded-lg border border-slate-700/60 bg-slate-900/60 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700/40 bg-slate-800/40">
            <div className="flex items-center gap-1.5">
              <svg viewBox="0 0 16 16" className="w-3 h-3 fill-amber-400/70 shrink-0">
                <path d="M14.5 3a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h13zm-13-1A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 14.5 2h-13z"/>
                <path d="M3 5.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5z"/>
              </svg>
              <span className="text-xs text-amber-400/80 font-medium">Note</span>
            </div>
            <div className="flex items-center gap-3">
              {hasNote && (
                <button
                  type="button"
                  onClick={clear}
                  className="text-xs text-slate-600 hover:text-red-400 transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-slate-600 hover:text-slate-300 transition-colors"
              >
                Collapse ↑
              </button>
            </div>
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => update(e.target.value)}
            placeholder={placeholder}
            rows={3}
            className="w-full bg-transparent px-3 py-2.5 text-xs text-slate-300 placeholder-slate-600
                       resize-none focus:outline-none leading-relaxed"
            style={{ minHeight: 72 }}
          />

          {/* Footer — char count */}
          <div className="flex justify-end px-3 pb-1.5">
            <span className={`text-xs font-mono ${text.length > 400 ? 'text-amber-400' : 'text-slate-700'}`}>
              {text.length} chars
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
