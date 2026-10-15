/** The parts of the Claude Code mod engine this mod uses (Claude Code 2.1.300). */
export interface Engine {
  plugin: { root: string }
  session: { id(): Promise<string> }
  clock: { now(): Promise<number>; every(ms: number, fn: () => void): () => void }
  process: {
    run(argv: readonly string[], init?: { stdin?: string; timeoutMs?: number }): Promise<{ exitCode: number; stdout: string; stderr: string }>
  }
  http: { fetch(url: string, init?: { method?: string; headers?: Record<string, string> }): Promise<{ status: number; ok: boolean; text: string }> }
  command: { register(c: { name: string; description: string; argumentHint?: string }): Promise<unknown> }
  ui: {
    status(text: string | undefined): void
    toast(text: string): void
    invalidate(event: 'ui.render'): void
    open(pane: { id: string; title?: string }): Promise<{ isPlaced: boolean }>
    resolve(e: RenderEvent): Record<string, unknown>
  }
}

export interface RenderEvent {
  surface: 'terminal' | 'desktop' | 'vscode' | 'mobile'
  component: string
  requestId?: string
  viewport?: { columns: number; rows: number }
  props: { hasSurvey?: boolean } & Record<string, unknown>
}

// The engine's hook inputs and results are loosely typed here on purpose: the engine validates them.
export type Hook = ($: Engine, e: any, next: (e: any) => Promise<any>) => unknown
export interface Registration { catch(handler: Hook): unknown }
export interface On {
  (event: string, hook: Hook): Registration
  (event: string, matcher: Record<string, string>, hook: Hook): Registration
}

/** The engine's element factory, a global inside a hooks module. */
declare global {
  var h: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => unknown
}
