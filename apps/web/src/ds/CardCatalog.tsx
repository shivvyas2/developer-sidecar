import { useId, type ReactNode } from 'react'
import { DrawerFront } from './StepDrawer'
import { pad3 } from './util'

export interface CatalogTerm { id: string; term: string; body: ReactNode }
export interface CatalogGroup { letter: string; terms: CatalogTerm[] }

/** A card catalog: ink letter tabs, terms on staggered tabs, and the open term's card beneath it. */
export function CardCatalog({ groups, open, onOpen, label }: {
  groups: CatalogGroup[]
  open: string | null
  onOpen: (id: string | null) => void
  label?: string
}) {
  const base = useId()
  let n = 0
  return (
    <section className="ds-cat" aria-label={label ?? 'Glossary'}>
      {groups.map((g) => (
        <div className="ds-cat__group" key={g.letter}>
          <h3 className="ds-cat__row ds-cat__letterrow">
            <span className="ds-cardtab ds-cat__letter" data-ink>
              <span>{g.letter}</span>
              <span>{pad3(g.terms.length)}<span className="ds-sr"> terms</span></span>
            </span>
          </h3>
          <ul className="ds-cat__terms">
            {g.terms.map((t) => {
              const col = n++ % 3
              const isOpen = open === t.id
              const panel = `${base}-${t.id}`
              return (
                <li key={t.id}>
                  <div className="ds-cat__row" data-col={col}>
                    <button
                      type="button"
                      className="ds-cardtab ds-cat__term"
                      data-ink={isOpen || undefined}
                      aria-expanded={isOpen}
                      aria-controls={panel}
                      onClick={() => onOpen(isOpen ? null : t.id)}
                    >
                      <span>{t.term}</span>
                    </button>
                  </div>
                  <div className="ds-cat__card" id={panel} hidden={!isOpen}>{isOpen ? t.body : null}</div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      {label ? <DrawerFront>{label}</DrawerFront> : null}
    </section>
  )
}
