import { useEffect, useReducer, useRef, useState } from 'react'
import type { ServerMessage } from '@sidecar/shared'
import { fetchDecisions, fetchExplainer, fetchGlossary, fetchSessions, fetchSteps, token } from './api'
import { feedReducer, initialFeed, type FeedAction } from './feed'

export type Connection = 'connecting' | 'live' | 'offline'

export function useFeed() {
  const [state, dispatch] = useReducer(feedReducer, initialFeed)
  const [connection, setConnection] = useState<Connection>('connecting')
  const lastSeq = useRef(0)
  lastSeq.current = state.lastSeq
  const selected = useRef<string | null>(null)
  selected.current = state.selected

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
        // after a reconnect, catch up on anything missed while offline (explanations ride along with steps)
        if (opened) {
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
    return () => { stopped = true; clearTimeout(timer); ws?.close() }
  }, [])

  return { state, dispatch, connection }
}

function loadSession(id: string, dispatch: (a: FeedAction) => void) {
  fetchSteps(id).then((steps) => dispatch({ type: 'steps', sessionId: id, steps })).catch(() => undefined)
  fetchDecisions(id).then((decisions) => dispatch({ type: 'decisions', sessionId: id, decisions })).catch(() => undefined)
  fetchGlossary(id).then((entries) => dispatch({ type: 'glossary', sessionId: id, entries })).catch(() => undefined)
}
