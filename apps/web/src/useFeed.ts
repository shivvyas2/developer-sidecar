import { useEffect, useReducer, useRef, useState } from 'react'
import type { ServerMessage } from '@sidecar/shared'
import { fetchSessions, fetchSteps, token } from './api'
import { feedReducer, initialFeed } from './feed'

export type Connection = 'connecting' | 'live' | 'offline'

export function useFeed() {
  const [state, dispatch] = useReducer(feedReducer, initialFeed)
  const [connection, setConnection] = useState<Connection>('connecting')
  const lastSeq = useRef(0)
  lastSeq.current = state.lastSeq

  useEffect(() => {
    fetchSessions().then((sessions) => dispatch({ type: 'sessions', sessions })).catch(() => setConnection('offline'))
  }, [])

  useEffect(() => {
    if (!state.selected) return
    const id = state.selected
    fetchSteps(id).then((steps) => dispatch({ type: 'steps', sessionId: id, steps })).catch(() => undefined)
  }, [state.selected])

  useEffect(() => {
    let ws: WebSocket | null = null
    let retry = 1000
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const connect = () => {
      ws = new WebSocket(`ws://${location.host}/ws?token=${token}&after=${lastSeq.current}`)
      ws.onopen = () => { setConnection('live'); retry = 1000 }
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
