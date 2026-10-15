import { useId, type KeyboardEvent } from 'react'
import { focusSibling, rovingIndex } from './util'

export interface FolderTab { id: string; label: string }

/** File-folder tabs on a rule. The active tab is ink with paper text. */
export function FolderTabs({ tabs, active, onSelect, label = 'Sections' }: {
  tabs: FolderTab[]
  active: string
  onSelect: (id: string) => void
  label?: string
}) {
  const base = useId()
  const hasActive = tabs.some((t) => t.id === active)
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next = rovingIndex(e, i, tabs.length)
    const tab = next === null ? undefined : tabs[next]
    if (next === null || !tab) return
    onSelect(tab.id)
    focusSibling(e, '[role="tab"]', next)
  }
  return (
    <div className="ds-tabs" role="tablist" aria-label={label} data-ds-group>
      {tabs.map((t, i) => {
        const on = t.id === active
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${base}-${i}`}
            aria-selected={on}
            tabIndex={on || (!hasActive && i === 0) ? 0 : -1}
            className="ds-tab"
            onClick={() => onSelect(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <span>{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}
