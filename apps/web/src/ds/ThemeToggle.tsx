import { nextTheme, type ThemePref } from '../theme'
import { RoundButton } from './RoundButton'

const GLYPH: Record<ThemePref, string> = { auto: '◐', light: '○', dark: '●' }
const NAME: Record<ThemePref, string> = { auto: 'Auto', light: 'Light', dark: 'Dark' }

/** Cycles the theme preference: Auto, Light, Dark. */
export function ThemeToggle({ pref, onChange }: { pref: ThemePref; onChange: (pref: ThemePref) => void }) {
  const next = nextTheme(pref)
  return (
    <span className="ds-toggle">
      <RoundButton
        label={GLYPH[pref]}
        title={`Theme: ${NAME[pref]}. Switch to ${NAME[next]}`}
        onPress={() => onChange(next)}
      />
      <span className="ds-toggle__label" aria-hidden>{NAME[pref].toUpperCase()}</span>
    </span>
  )
}
