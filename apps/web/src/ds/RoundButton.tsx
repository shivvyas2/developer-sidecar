/** A circular mono button. `active` fills it with the accent and reports aria-pressed. */
export function RoundButton({ label, active, onPress, title, disabled }: {
  label: string
  active?: boolean
  onPress: () => void
  title: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="ds-round"
      title={title}
      aria-label={title}
      aria-pressed={active === undefined ? undefined : active}
      data-active={active || undefined}
      data-wide={label.length > 2 || undefined}
      disabled={disabled}
      onClick={onPress}
    >
      <span aria-hidden>{label}</span>
    </button>
  )
}
