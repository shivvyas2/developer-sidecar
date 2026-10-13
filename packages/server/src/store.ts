import { DatabaseSync } from 'node:sqlite'
import type { FeedStep, SessionSummary, SidecarEvent } from '@sidecar/shared'

export interface Store {
  insertEvent(e: SidecarEvent): number | null
  touchSession(id: string, cwd: string, ts: number): SessionSummary
  listSessions(): SessionSummary[]
  saveStep(s: FeedStep): void
  stepsForSession(sessionId: string): FeedStep[]
  stepsAfter(seq: number): FeedStep[]
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
  const bySession = db.prepare('SELECT json FROM steps WHERE session_id = ? ORDER BY started_at ASC, seq ASC')
  const afterSeq = db.prepare('SELECT json FROM steps WHERE seq > ? ORDER BY seq ASC')

  const parseSteps = (rows: unknown[]) => rows.map((r) => JSON.parse((r as { json: string }).json) as FeedStep)

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
    close() {
      db.close()
    },
  }
}
