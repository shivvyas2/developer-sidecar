import { clamp, easeInOut, easeOutBack, lerp } from '../ease'
import { g, n } from '../svg'
import { legacyColor } from '../tokens'
import type { PropFrame } from '../timeline'

const S = `stroke="${legacyColor('ink')}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`

const along = (pr: PropFrame, k: number, arc = 0) => ({
  x: lerp(pr.from.x, pr.to.x, k),
  y: lerp(pr.from.y, pr.to.y, k) - Math.sin(k * Math.PI) * arc,
})

/** A prop in absolute canvas coordinates. */
export function prop(pr: PropFrame, t: number): string {
  const { from, to, p } = pr
  switch (pr.kind) {
    case 'cable': {
      const mx = (from.x + to.x) / 2
      const my = Math.max(from.y, to.y) + 30
      return `<path class="sk-cable" d="M${n(from.x)} ${n(from.y)} Q${n(mx)} ${n(my)} ${n(to.x)} ${n(to.y)}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="${n(1 - p, 3)}" fill="none" stroke="${legacyColor('ink')}" stroke-width="4" stroke-linecap="round"/>`
        + (p >= 1 ? `<circle cx="${n(to.x)}" cy="${n(to.y)}" r="5" fill="${legacyColor('ok')}" ${S}/>` : '')
    }
    case 'wrench':
      return g(from.x, from.y, `<g transform="rotate(${n(Math.sin(p * Math.PI * 6) * 35 - 20)})"><rect x="-3" y="-22" width="6" height="22" rx="2" fill="${legacyColor('smoke')}" ${S}/><circle cx="0" cy="-26" r="7" fill="none" ${S}/></g>`)
    case 'magnifier':
      return g(from.x + Math.sin(p * Math.PI * 4) * 8, from.y, `<line x1="6" y1="6" x2="15" y2="15" ${S}/><circle r="9" fill="${legacyColor('sky')}" ${S}/>`)
    case 'book': {
      const page = -10 + 20 * ((p * 3) % 1)
      return g(from.x, from.y, `<path d="M-14 -6 q7 -6 14 0 q7 -6 14 0 v14 q-7 -6 -14 0 q-7 -6 -14 0 z" fill="${legacyColor('paper')}" ${S}/><line x1="${n(page)}" y1="-6" x2="${n(page)}" y2="6" ${S}/>`)
    }
    case 'box':
      return [0, 1, 2].map((i) => {
        const rise = easeOutBack(clamp(p * 1.4 - i * 0.2)) * 40
        return g(from.x - 18 + i * 18, from.y - 40 - rise, i === 1
          ? `<rect x="-4" y="-12" width="8" height="18" rx="2" fill="${legacyColor('smoke')}" ${S}/>`
          : `<circle r="6" fill="${legacyColor('accent')}" ${S}/>`)
      }).join('')
    case 'gadget': {
      const at = along(pr, easeInOut(p), 40)
      const teeth = [0, 90, 180, 270].map((a) => `<rect x="-2" y="-14" width="4" height="6" fill="${legacyColor('ink')}" transform="rotate(${a})"/>`).join('')
      return g(at.x, at.y, `<g transform="rotate(${n(p * 360)})">${teeth}<circle r="9" fill="${legacyColor('accent')}" ${S}/></g>`)
    }
    case 'rocket': {
      const at = along(pr, easeInOut(p))
      const flame = t % 200 < 100 ? 14 : 10
      const fade = p > 0.9 ? n(1 - (p - 0.9) * 10, 2) : '1'
      return `<g opacity="${fade}">${g(at.x, at.y, `<path d="M-6 6 L0 ${flame + 6} L6 6 z" fill="${legacyColor('accent')}"/><path d="M0 -26 q12 12 8 32 h-16 q-4 -20 8 -32 z" fill="${legacyColor('paper')}" ${S}/><circle cy="-8" r="4" fill="${legacyColor('sky')}" ${S}/>`)}</g>`
    }
    case 'parcel': {
      const at = along(pr, easeInOut(p), 16)
      return g(at.x, at.y, `<rect x="-14" y="-14" width="28" height="24" rx="3" fill="${legacyColor('accent')}" ${S}/><path d="M-14 -6 h28 M0 -14 v24" fill="none" ${S}/>`)
    }
  }
}
