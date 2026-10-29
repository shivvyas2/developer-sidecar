/** How much the town moves: auto follows the OS setting, reduce shows each scene finished, full always animates. */
export type MotionPref = 'auto' | 'reduce' | 'full'

const KEY = 'sidecar-motion'

export function readMotion(storage: Pick<Storage, 'getItem'> | null): MotionPref {
  try {
    const v = storage?.getItem(KEY)
    return v === 'reduce' || v === 'full' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function writeMotion(storage: Pick<Storage, 'setItem'> | null, pref: MotionPref): void {
  try {
    storage?.setItem(KEY, pref)
  } catch {
    /* private mode or quota: the choice just does not persist */
  }
}

export const reduceMotion = (pref: MotionPref, osReduces: boolean): boolean => (pref === 'auto' ? osReduces : pref === 'reduce')
