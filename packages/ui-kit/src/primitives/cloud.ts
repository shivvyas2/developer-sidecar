import type { P } from '../iso'
import { color } from '../tokens'
import { n } from '../svg'

/** The deploy target: a line-art cloud in card fill, its flat base centred on `at`. */
export const cloud = (at: P): string =>
  `<g class="sk-cloud" transform="translate(${n(at.x)} ${n(at.y)})">`
  + `<path d="M-24,0 C-34,0 -36,-13 -25,-15 C-26,-25 -12,-30 -5,-22 C-1,-33 20,-33 21,-18 `
  + `C31,-20 36,-6 28,0 Z" fill="${color('card')}" stroke="${color('ink')}" stroke-width="1" stroke-linejoin="round"/>`
  + `<path d="M-5,-22 C-3,-19 -2.6,-17 -3,-15 M21,-18 C20,-15.6 18.6,-14 17,-13" fill="none" stroke="${color('ink')}" `
  + `stroke-width="1" stroke-linecap="round"/></g>`
