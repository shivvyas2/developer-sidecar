export interface ReadoutField { label: string; value: string }

/** The chamfered readout panel: mono labels over dot-matrix numerals, with a note line. */
export function ReadoutPanel({ fields, note, label = 'Readout' }: { fields: ReadoutField[]; note?: string; label?: string }) {
  return (
    <section className="ds-readout" aria-label={label}>
      <dl className="ds-readout__fields">
        {fields.map((f) => (
          <div className="ds-readout__field" key={f.label}>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
      {note ? <p className="ds-readout__note">{note}</p> : null}
    </section>
  )
}
