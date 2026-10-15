/** `/sidecar` and its subcommands (spec §7). */
export type SidecarCommand = { kind: 'open' } | { kind: 'web' } | { kind: 'mute'; muted: boolean } | { kind: 'help' }

export const HELP = 'Usage: /sidecar opens the pane. /sidecar web gives the workstation link. /sidecar off and /sidecar on hide or show the band and toasts.'

export function parseCommand(args: string): SidecarCommand {
  const word = args.trim().toLowerCase()
  if (word === '') return { kind: 'open' }
  if (word === 'web') return { kind: 'web' }
  if (word === 'off') return { kind: 'mute', muted: true }
  if (word === 'on') return { kind: 'mute', muted: false }
  return { kind: 'help' }
}
