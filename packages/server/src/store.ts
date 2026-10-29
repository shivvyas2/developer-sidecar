import { DatabaseSync } from 'node:sqlite'
import type {
  Attention, Baseline, DecisionEntry, FeedStep, GlossaryEntry, RecapEntry, SessionSummary, SidecarEvent, StepExplanation, TokenUsage,
} from '@sidecar/shared'

export interface Store {
  insertEvent(e: SidecarEvent): number | null
  /** `attention`, when given, replaces the session's attention unless a newer one is already stored. */
  touchSession(id: string, cwd: string, ts: number, attention?: { state: Attention; text?: string }): SessionSummary
  listSessions(): SessionSummary[]
  saveStep(s: FeedStep): void
  stepsForSession(sessionId: string): FeedStep[]
  stepsAfter(seq: number): FeedStep[]
  /** An opaque token that changes whenever what stepsForSession returns may have changed. */
  revision(sessionId: string): string
  saveExplanation(sessionId: string, stepId: string, e: StepExplanation, at: number): void
  hasExplanation(stepId: string): boolean
  /** False when a decision with its id is already stored, so it was not added. */
  addDecision(d: DecisionEntry): boolean
  listDecisions(sessionId: string): DecisionEntry[]
  addConcept(c: GlossaryEntry): boolean
  listGlossary(sessionId: string): GlossaryEntry[]
  /** Replaces the turn's recap and counts it; returns how many times the turn has been recapped. */
  saveRecap(r: RecapEntry): number
  getRecap(turnId: string): (RecapEntry & { count: number }) | undefined
  /** Counts a call on a turn whose recap stays as stored until the call writes a new one; returns the count, 0 for no recap. */
  countRecapCall(turnId: string): number
  listRecaps(sessionId: string): RecapEntry[]
  /** Marks every pending recap unavailable (their calls can no longer finish) and returns them. */
  failPendingRecaps(reason: string, at: number): RecapEntry[]
  /** Each session's newest recap when it is unavailable and no call was ever made for it (recaps were paused). */
  unavailableRecaps(): RecapEntry[]
  addUsage(u: TokenUsage): TokenUsage
  usage(): TokenUsage
  getSession(id: string): SessionSummary | undefined
  lastPrompt(sessionId: string): string | undefined
  /** The project scan taken when the session began. */
  saveBaseline(sessionId: string, b: Baseline): void
  getBaseline(sessionId: string): Baseline | undefined
  deleteSession(id: string): void
  deleteAll(): void
  close(): void
}

interface SessionRow {
  id: string; cwd: string; started_at: number; last_at: number
  attention: Attention | null; attention_at: number | null; attention_text: string | null
}

const toSession = (r: SessionRow): SessionSummary => ({
  id: r.id, cwd: r.cwd, startedAt: r.started_at, lastAt: r.last_at,
  ...(r.attention ? { attention: r.attention } : {}),
  ...(r.attention_at !== null ? { attentionAt: r.attention_at } : {}),
  ...(r.attention_text ? { attentionText: r.attention_text } : {}),
})

/** Columns added after 0.1.0, so databases created by it gain them on open. */
const SESSION_COLUMNS = [['attention', 'TEXT'], ['attention_at', 'INTEGER'], ['attention_text', 'TEXT']] as const

export function openStore(path: string): Store {
  const db = new DatabaseSync(path)
  // several sidecar processes may race to create the database on first run
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      session_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      kind TEXT NOT NULL,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, cwd TEXT NOT NULL, started_at INTEGER NOT NULL, last_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS steps (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, seq INTEGER NOT NULL,
      started_at INTEGER NOT NULL, json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS steps_seq ON steps(seq);
    CREATE INDEX IF NOT EXISTS steps_session ON steps(session_id, started_at);
    CREATE TABLE IF NOT EXISTS explanations (
      step_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, at INTEGER NOT NULL, json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS explanations_session ON explanations(session_id);
    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, step_id TEXT NOT NULL, at INTEGER NOT NULL, json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS decisions_session ON decisions(session_id, at);
    CREATE TABLE IF NOT EXISTS concepts (
      session_id TEXT NOT NULL, term_key TEXT NOT NULL, at INTEGER NOT NULL, json TEXT NOT NULL,
      PRIMARY KEY (session_id, term_key)
    );
    CREATE TABLE IF NOT EXISTS recaps (
      turn_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, at INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 0, json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS recaps_session ON recaps(session_id, at);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS baselines (session_id TEXT PRIMARY KEY, json TEXT NOT NULL);
  `)
  const sessionCols = new Set((db.prepare('PRAGMA table_info(sessions)').all() as { name: string }[]).map((c) => c.name))
  for (const [name, type] of SESSION_COLUMNS) {
    if (sessionCols.has(name)) continue
    try {
      db.exec(`ALTER TABLE sessions ADD COLUMN ${name} ${type}`)
    } catch (err) {
      // another sidecar process may have added it first
      if (!/duplicate column/i.test((err as Error).message)) throw err
    }
  }

  const NEWER = 'excluded.attention IS NOT NULL AND excluded.attention_at >= COALESCE(sessions.attention_at, 0)'
  const insEvent = db.prepare('INSERT OR IGNORE INTO events (id, session_id, ts, kind, json) VALUES (?, ?, ?, ?, ?)')
  const upSession = db.prepare(`
    INSERT INTO sessions (id, cwd, started_at, last_at, attention, attention_at, attention_text) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET last_at = MAX(sessions.last_at, excluded.last_at),
      cwd = CASE WHEN excluded.cwd <> '' THEN excluded.cwd ELSE sessions.cwd END,
      attention = CASE WHEN ${NEWER} THEN excluded.attention ELSE sessions.attention END,
      attention_text = CASE WHEN ${NEWER} THEN excluded.attention_text ELSE sessions.attention_text END,
      attention_at = CASE WHEN ${NEWER} THEN excluded.attention_at ELSE sessions.attention_at END`)
  const getSession = db.prepare('SELECT * FROM sessions WHERE id = ?')
  const allSessions = db.prepare('SELECT * FROM sessions ORDER BY last_at DESC')
  const upStep = db.prepare(`
    INSERT INTO steps (id, session_id, seq, started_at, json) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET seq = excluded.seq, json = excluded.json`)
  const bySession = db.prepare(`
    SELECT s.json AS json, e.json AS exp FROM steps s LEFT JOIN explanations e ON e.step_id = s.id
    WHERE s.session_id = ? ORDER BY s.started_at ASC, s.seq ASC`)
  const afterSeq = db.prepare(`
    SELECT s.json AS json, e.json AS exp FROM steps s LEFT JOIN explanations e ON e.step_id = s.id
    WHERE s.seq > ? ORDER BY s.seq ASC`)

  const parseSteps = (rows: unknown[]) => rows.map((r) => {
    const row = r as { json: string; exp: string | null }
    const step = JSON.parse(row.json) as FeedStep
    if (row.exp) step.explanation = JSON.parse(row.exp) as StepExplanation
    return step
  })

  const upExp = db.prepare(`
    INSERT INTO explanations (step_id, session_id, at, json) VALUES (?, ?, ?, ?)
    ON CONFLICT(step_id) DO UPDATE SET at = excluded.at, json = excluded.json`)
  const getExp = db.prepare('SELECT 1 AS x FROM explanations WHERE step_id = ?')
  const insDecision = db.prepare('INSERT OR IGNORE INTO decisions (id, session_id, step_id, at, json) VALUES (?, ?, ?, ?, ?)')
  // at the same time, in the order they were added (a recap's decisions share its time)
  const decisionsFor = db.prepare('SELECT json FROM decisions WHERE session_id = ? ORDER BY at ASC, rowid ASC')
  const insConcept = db.prepare('INSERT OR IGNORE INTO concepts (session_id, term_key, at, json) VALUES (?, ?, ?, ?)')
  const conceptsFor = db.prepare('SELECT json FROM concepts WHERE session_id = ? ORDER BY term_key ASC')
  // count goes up only when a call was made (pending), so pending, then done, counts once
  const upRecap = db.prepare(`
    INSERT INTO recaps (turn_id, session_id, at, count, json) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(turn_id) DO UPDATE SET at = excluded.at, json = excluded.json, count = recaps.count + excluded.count
    RETURNING count`)
  const getRecapStmt = db.prepare('SELECT json, count FROM recaps WHERE turn_id = ?')
  const countCall = db.prepare('UPDATE recaps SET count = count + 1 WHERE turn_id = ? RETURNING count')
  const recapsFor = db.prepare('SELECT json FROM recaps WHERE session_id = ? ORDER BY at ASC, turn_id ASC')
  const pendingRecaps = db.prepare(`SELECT json FROM recaps WHERE json_extract(json, '$.status') = 'pending'`)
  const uncalledRecaps = db.prepare(`
    SELECT json FROM recaps r WHERE count = 0 AND json_extract(json, '$.status') = 'unavailable'
      AND NOT EXISTS (SELECT 1 FROM recaps n WHERE n.session_id = r.session_id AND (n.at > r.at OR (n.at = r.at AND n.turn_id > r.turn_id)))
    ORDER BY session_id`)
  const setRecapJson = db.prepare('UPDATE recaps SET at = ?, json = ? WHERE turn_id = ?')
  const getMeta = db.prepare('SELECT value FROM meta WHERE key = ?')
  const upMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  const lastPromptStmt = db.prepare(`
    SELECT json FROM steps WHERE session_id = ? AND json_extract(json, '$.category') = 'prompt'
    ORDER BY started_at DESC, seq DESC LIMIT 1`)
  const SESSION_TABLES = ['events', 'sessions', 'steps', 'explanations', 'decisions', 'concepts', 'recaps', 'baselines'] as const
  const upBaseline = db.prepare('INSERT INTO baselines (session_id, json) VALUES (?, ?) ON CONFLICT(session_id) DO UPDATE SET json = excluded.json')
  const getBaselineStmt = db.prepare('SELECT json FROM baselines WHERE session_id = ?')
  const delBySession = SESSION_TABLES.map((t) => db.prepare(`DELETE FROM ${t} WHERE ${t === 'sessions' ? 'id' : 'session_id'} = ?`))
  const tx = (fn: () => void) => {
    db.exec('BEGIN')
    try { fn(); db.exec('COMMIT') } catch (err) { db.exec('ROLLBACK'); throw err }
  }
  const parseJson = <T>(rows: unknown[]) => rows.map((r) => JSON.parse((r as { json: string }).json) as T)

  // Revisions are only meaningful within one process: the boot stamp keeps a restarted server's numbers from matching.
  const boot = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  let epoch = 0
  const revs = new Map<string, number>()
  const bump = (sessionId: string) => revs.set(sessionId, (revs.get(sessionId) ?? 0) + 1)

  return {
    insertEvent(e) {
      const r = insEvent.run(e.id, e.sessionId, e.ts, e.kind, JSON.stringify(e))
      return r.changes === 0 ? null : Number(r.lastInsertRowid)
    },
    touchSession(id, cwd, ts, attention) {
      upSession.run(id, cwd, ts, ts, attention?.state ?? null, attention ? ts : null, attention?.text ?? null)
      return toSession(getSession.get(id) as unknown as SessionRow)
    },
    listSessions() {
      return (allSessions.all() as unknown as SessionRow[]).map(toSession)
    },
    saveStep(s) {
      upStep.run(s.id, s.sessionId, s.seq, s.startedAt, JSON.stringify(s))
      bump(s.sessionId)
    },
    stepsForSession(sessionId) {
      return parseSteps(bySession.all(sessionId))
    },
    revision(sessionId) {
      return `${boot}.${epoch}.${revs.get(sessionId) ?? 0}`
    },
    stepsAfter(seq) {
      return parseSteps(afterSeq.all(seq))
    },
    saveExplanation(sessionId, stepId, e, at) {
      upExp.run(stepId, sessionId, at, JSON.stringify(e))
      bump(sessionId)
    },
    hasExplanation(stepId) {
      return getExp.get(stepId) !== undefined
    },
    addDecision(d) {
      return insDecision.run(d.id, d.sessionId, d.stepId, d.at, JSON.stringify(d)).changes > 0
    },
    listDecisions(sessionId) {
      return parseJson<DecisionEntry>(decisionsFor.all(sessionId))
    },
    addConcept(c) {
      return insConcept.run(c.sessionId, c.term.trim().toLowerCase(), c.at, JSON.stringify(c)).changes > 0
    },
    listGlossary(sessionId) {
      return parseJson<GlossaryEntry>(conceptsFor.all(sessionId))
    },
    saveRecap(r) {
      const row = upRecap.get(r.turnId, r.sessionId, r.at, r.status === 'pending' ? 1 : 0, JSON.stringify(r)) as { count: number }
      return row.count
    },
    getRecap(turnId) {
      const row = getRecapStmt.get(turnId) as { json: string; count: number } | undefined
      return row ? { ...(JSON.parse(row.json) as RecapEntry), count: row.count } : undefined
    },
    countRecapCall(turnId) {
      return (countCall.get(turnId) as { count: number } | undefined)?.count ?? 0
    },
    listRecaps(sessionId) {
      return parseJson<RecapEntry>(recapsFor.all(sessionId))
    },
    failPendingRecaps(reason, at) {
      const failed = parseJson<RecapEntry>(pendingRecaps.all()).map((r): RecapEntry => ({ ...r, at, status: 'unavailable', reason }))
      for (const r of failed) setRecapJson.run(at, JSON.stringify(r), r.turnId)
      return failed
    },
    unavailableRecaps() {
      return parseJson<RecapEntry>(uncalledRecaps.all())
    },
    usage() {
      const row = getMeta.get('usage') as { value: string } | undefined
      return row ? (JSON.parse(row.value) as TokenUsage) : { input: 0, output: 0 }
    },
    addUsage(u) {
      const cur = this.usage()
      const next = { input: cur.input + u.input, output: cur.output + u.output }
      upMeta.run('usage', JSON.stringify(next))
      return next
    },
    getSession(id) {
      const row = getSession.get(id) as unknown as SessionRow | undefined
      return row ? toSession(row) : undefined
    },
    lastPrompt(sessionId) {
      const row = lastPromptStmt.get(sessionId) as { json: string } | undefined
      if (!row) return undefined
      const prompt = ((JSON.parse(row.json) as FeedStep).input as { prompt?: unknown } | null)?.prompt
      return typeof prompt === 'string' ? prompt : undefined
    },
    saveBaseline(sessionId, b) {
      upBaseline.run(sessionId, JSON.stringify(b))
    },
    getBaseline(sessionId) {
      const row = getBaselineStmt.get(sessionId) as { json: string } | undefined
      return row ? (JSON.parse(row.json) as Baseline) : undefined
    },
    deleteSession(id) {
      tx(() => { for (const stmt of delBySession) stmt.run(id) })
      bump(id)
    },
    deleteAll() {
      tx(() => { for (const t of SESSION_TABLES) db.exec(`DELETE FROM ${t}`) })
      epoch += 1
      revs.clear()
    },
    close() {
      db.close()
    },
  }
}
