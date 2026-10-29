import { useState } from 'react'
import type { ConceptId } from '@sidecar/shared'
import type { ConceptCardView } from './conceptView'

export interface ConceptCardProps {
  card: ConceptCardView
  /** The real name of what was tapped, such as "Checkout page", when there is one. */
  name?: string
  onPickStep(id: string): void
  onConcept(id: ConceptId): void
  onGlossary(term: string): void
  onClose(): void
}

/** A card that goes as deep as you like: the analogy first, then what it really is, where it is in your project, and related ideas. */
export function ConceptCard({ card, name, onPickStep, onConcept, onGlossary, onClose }: ConceptCardProps) {
  const [deep, setDeep] = useState(false)
  const [all, setAll] = useState(false)
  const files = all ? card.files : card.files.slice(0, 12)
  const steps = all ? card.steps : card.steps.slice(-12)
  const more = card.files.length - files.length + card.steps.length - steps.length
  return (
    <section className="concept" aria-label={`About ${card.city}`}>
      <header className="concept__head">
        <span className="concept__kicker">In the town</span>
        <button type="button" className="concept__close" onClick={onClose} aria-label="Close">x</button>
      </header>
      <h2 className="concept__title">{name ?? card.city}</h2>
      {name && <p className="concept__city">{card.city}</p>}
      <p className="concept__analogy">{card.layer1}</p>
      {!deep && <button type="button" className="concept__deeper" onClick={() => setDeep(true)}>Go deeper</button>}
      {deep && (
        <>
          <h3 className="concept__h">What it really is</h3>
          <p>{card.layer2}</p>
          <h3 className="concept__h">In your project</h3>
          {card.files.length === 0 && card.steps.length === 0 && <p className="concept__none">Nothing in this project yet.</p>}
          {files.length > 0 && <ul className="concept__files">{files.map((f) => <li key={f}><code>{f}</code></li>)}</ul>}
          {steps.length > 0 && (
            <ul className="concept__steps">
              {steps.map((s) => <li key={s.id}><button type="button" onClick={() => onPickStep(s.id)}>{s.caption}</button></li>)}
            </ul>
          )}
          {more > 0 && <button type="button" className="concept__deeper" onClick={() => setAll(true)}>Show all ({more} more)</button>}
          {card.related.length > 0 && (
            <>
              <h3 className="concept__h">Related</h3>
              <ul className="concept__related">{card.related.map((r) => <li key={r.id}><button type="button" onClick={() => onConcept(r.id)}>{r.city}</button></li>)}</ul>
            </>
          )}
          {card.glossaryTerm && <button type="button" className="concept__glossary" onClick={() => onGlossary(card.glossaryTerm!)}>Look up "{card.glossaryTerm}" in the Glossary</button>}
        </>
      )}
    </section>
  )
}
