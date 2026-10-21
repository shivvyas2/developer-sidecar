import type { PlaceId } from '@sidecar/shared'

export interface LegendEntry { id: string; title: string; text: string }

/** What each place in the stage's town stands for, in plain words. Tapping a place on the stage shows its entry. */
export const PLACES: Record<PlaceId, LegendEntry> = {
  app: { id: 'app', title: 'Your app', text: 'The yellow building is the app Claude is building for you. It gains a floor for about every three new files.' },
  service: { id: 'service', title: 'Outside service', text: 'A service your app talks to over the internet, like Stripe for payments. Its name shows once Claude uses it.' },
  database: { id: 'database', title: 'Your data', text: 'Where your app keeps information, like orders or users. The label names the first table Claude set up.' },
  toolbox: { id: 'toolbox', title: 'Building blocks', text: 'Ready-made code Claude added (packages), so it does not have to write everything itself.' },
  cloud: { id: 'cloud', title: 'The internet', text: 'Where your app goes when Claude puts it live for other people to use.' },
  bookshelf: { id: 'bookshelf', title: 'Your files', text: 'The drawer of cards is your project’s files. Claude pulls one out when it reads or changes it.' },
  browser: { id: 'browser', title: 'Sign-in', text: 'How people log in to your app.' },
}

/** The rest of the picture, which is not a place you can tap. */
export const OTHERS: LegendEntry[] = [
  { id: 'hand', title: 'The hand', text: 'Claude at work: plugging in a service, setting a brick on your app, unpacking building blocks.' },
  { id: 'checks', title: 'The dial', text: 'Claude checking that your app still works: a tick when the checks pass, a cross when they fail.' },
  { id: 'status', title: 'Status light', text: 'How things stand: all good, needs a fix, needs you (answer in Claude Code), or working.' },
  { id: 'cards', title: 'The step cards', text: 'Everything Claude did, newest first, grouped under each thing you asked. Tap one to see it again.' },
]

/** The place a tap on the stage landed on, from the SVG group's class (sk-place--service and so on). */
export function placeAt(target: Element | null): PlaceId | null {
  const g = target?.closest('[class*="sk-place--"]')
  const id = g?.getAttribute('class')?.match(/\bsk-place--([a-z]+)\b/)?.[1]
  return id && id in PLACES ? (id as PlaceId) : null
}
