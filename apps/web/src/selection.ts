/** Which step the Stage tab shows: the latest while following, or a step the user picked. */
export interface Selection { id: string | null; follow: boolean }

export const initialSelection: Selection = { id: null, follow: true }

export type SelectionAction =
  | { type: 'pick'; id: string; latestId: string | null }
  | { type: 'live' }
  | { type: 'reset' }

/** Latest step while following; a user pick stops following until they pick the latest again or press LIVE. */
export function selectionReducer(s: Selection, a: SelectionAction): Selection {
  switch (a.type) {
    case 'pick': return { id: a.id, follow: a.id === a.latestId }
    case 'live': return { id: null, follow: true }
    case 'reset': return initialSelection
  }
}

export const selectedId = (s: Selection, latestId: string | null): string | null => (s.follow ? latestId : s.id)

/** A step's position in its session, 1-based and zero-padded to three digits: 0 -> "001". */
export const stepNumber = (index: number): string => String(index + 1).padStart(3, '0')
