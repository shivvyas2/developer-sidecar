import { useEffect, useReducer, useRef, useState } from 'react'
import type { ServerMessage } from '@sidecar/shared'
import { fetchDecisions, fetchExplainer, fetchGlossary, fetchRecaps, fetchSessions, fetchSteps, token } from './api'
import { feedReducer, initialFeed, type FeedAction } from './feed'

export type Connection = 'connecting' | 'live' | 'offline'

export function useFeed() {
  const [state, dispatch] = useReducer(feedReducer, initialFeed)
  const [connection, setConnection] = useState<Connection>('connecting')
  const lastSeq = useRef(0)
  lastSeq.current = state.lastSeq
  const selected = useRef<string | null>(null)
  selected.current = state.selected
  const reconnect = useRef<() => void>(() => undefined)

  useEffect(() => {
    fetchSessions().then((sessions) => dispatch({ type: 'sessions', sessions })).catch(() => setConnection('offline'))
    fetchExplainer().then((state) => dispatch({ type: 'explainer', state })).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (state.selected) loadSession(state.selected, dispatch)
  }, [state.selected])

  useEffect(() => {
    let ws: WebSocket | null = null
    let retry = 1000
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let opened = false
    const connect = () => {
      ws = new WebSocket(`ws://${location.host}/ws?token=${token}&after=${lastSeq.current}`)
      ws.onopen = () => {
        setConnection('live')
        retry = 1000
        // after a reconnect, catch up on anything missed while offline
        if (opened) {
          // sessions carry whether Claude is waiting, which no replayed step would update
          fetchSessions().then((sessions) => dispatch({ type: 'sessions', sessions })).catch(() => undefined)
          if (selected.current) loadSession(selected.current, dispatch)
          fetchExplainer().then((state) => dispatch({ type: 'explainer', state })).catch(() => undefined)
        }
        opened = true
      }
      ws.onmessage = (m) => dispatch(JSON.parse(String(m.data)) as ServerMessage)
      ws.onclose = () => {
        setConnection('offline')
        if (!stopped) timer = setTimeout(connect, retry)
        retry = Math.min(retry * 2, 5000)
      }
    }
    connect()
    // Try now instead of waiting out the backoff; a socket that is still open or opening is left alone.
    reconnect.current = () => {
      if (stopped || (ws && ws.readyState !== WebSocket.CLOSED)) return
      clearTimeout(timer)
      retry = 1000
      connect()
    }
    return () => { stopped = true; clearTimeout(timer); ws?.close() }
  }, [])

  return { state, dispatch, connection, retry: () => reconnect.current() }
}

function loadSession(id: string, dispatch: (a: FeedAction) => void) {
  fetchSteps(id).then((steps) => dispatch({ type: 'steps', sessionId: id, steps })).catch(() => undefined)
  fetchDecisions(id).then((decisions) => dispatch({ type: 'decisions', sessionId: id, decisions })).catch(() => undefined)
  fetchGlossary(id).then((entries) => dispatch({ type: 'glossary', sessionId: id, entries })).catch(() => undefined)
  fetchRecaps(id).then((recaps) => dispatch({ type: 'recaps', sessionId: id, recaps })).catch(() => undefined)
}
