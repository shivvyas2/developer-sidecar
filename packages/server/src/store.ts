import { DatabaseSync } from 'node:sqlite'
import type {
  DecisionEntry, FeedStep, GlossaryEntry, SessionSummary, SidecarEvent, StepExplanation, TokenUsage,
} from '@sidecar/shared'

export interface Store {
  insertEvent(e: SidecarEvent): number | null
  touchSession(id: string, cwd: string, ts: number): SessionSummary
  listSessions(): SessionSummary[]
  saveStep(s: FeedStep): void
  stepsForSession(sessionId: string): FeedStep[]
  stepsAfter(seq: number): FeedStep[]
  saveExplanation(sessionId: string, stepId: string, e: StepExplanation, at: number): void
  hasExplanation(stepId: string): boolean
  addDecision(d: DecisionEntry): void
  listDecisions(sessionId: string): DecisionEntry[]
  addConcept(c: GlossaryEntry): boolean
  listGlossary(sessionId: string): GlossaryEntry[]
  addUsage(u: TokenUsage): TokenUsage
  usage(): TokenUsage
  getSession(id: string): SessionSummary | undefined
  lastPrompt(sessionId: string): string | undefined
  deleteSession(id: string): void
  deleteAll(): void
  close(): void
}

interface SessionRow { id: string; cwd: string; started_at: number; last_at: number }

const toSession = (r: SessionRow): SessionSummary =>
  ({ id: r.id, cwd: r.cwd, startedAt: r.started_at, lastAt: r.last_at })

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
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `)

  const insEvent = db.prepare('INSERT OR IGNORE INTO events (id, session_id, ts, kind, json) VALUES (?, ?, ?, ?, ?)')
  const upSession = db.prepare(`
    INSERT INTO sessions (id, cwd, started_at, last_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET last_at = MAX(sessions.last_at, excluded.last_at),
      cwd = CASE WHEN excluded.cwd <> '' THEN excluded.cwd ELSE sessions.cwd END`)
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
  const decisionsFor = db.prepare('SELECT json FROM decisions WHERE session_id = ? ORDER BY at ASC, id ASC')
  const insConcept = db.prepare('INSERT OR IGNORE INTO concepts (session_id, term_key, at, json) VALUES (?, ?, ?, ?)')
  const conceptsFor = db.prepare('SELECT json FROM concepts WHERE session_id = ? ORDER BY term_key ASC')
  const getMeta = db.prepare('SELECT value FROM meta WHERE key = ?')
  const upMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  const lastPromptStmt = db.prepare(`
    SELECT json FROM steps WHERE session_id = ? AND json_extract(json, '$.category') = 'prompt'
    ORDER BY started_at DESC, seq DESC LIMIT 1`)
  const SESSION_TABLES = ['events', 'sessions', 'steps', 'explanations', 'decisions', 'concepts'] as const
  const delBySession = SESSION_TABLES.map((t) => db.prepare(`DELETE FROM ${t} WHERE ${t === 'sessions' ? 'id' : 'session_id'} = ?`))
  const tx = (fn: () => void) => {
    db.exec('BEGIN')
    try { fn(); db.exec('COMMIT') } catch (err) { db.exec('ROLLBACK'); throw err }
  }
  const parseJson = <T>(rows: unknown[]) => rows.map((r) => JSON.parse((r as { json: string }).json) as T)

  return {
    insertEvent(e) {
      const r = insEvent.run(e.id, e.sessionId, e.ts, e.kind, JSON.stringify(e))
      return r.changes === 0 ? null : Number(r.lastInsertRowid)
    },
    touchSession(id, cwd, ts) {
      upSession.run(id, cwd, ts, ts)
      return toSession(getSession.get(id) as unknown as SessionRow)
    },
    listSessions() {
      return (allSessions.all() as unknown as SessionRow[]).map(toSession)
    },
    saveStep(s) {
      upStep.run(s.id, s.sessionId, s.seq, s.startedAt, JSON.stringify(s))
    },
    stepsForSession(sessionId) {
      return parseSteps(bySession.all(sessionId))
    },
    stepsAfter(seq) {
      return parseSteps(afterSeq.all(seq))
    },
    saveExplanation(sessionId, stepId, e, at) {
      upExp.run(stepId, sessionId, at, JSON.stringify(e))
    },
    hasExplanation(stepId) {
      return getExp.get(stepId) !== undefined
    },
    addDecision(d) {
      insDecision.run(d.id, d.sessionId, d.stepId, d.at, JSON.stringify(d))
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
    deleteSession(id) {
      tx(() => { for (const stmt of delBySession) stmt.run(id) })
    },
    deleteAll() {
      tx(() => { for (const t of SESSION_TABLES) db.exec(`DELETE FROM ${t}`) })
    },
    close() {
      db.close()
    },
  }
}
