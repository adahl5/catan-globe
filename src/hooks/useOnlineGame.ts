/**
 * useOnlineGame — manages the WebSocket connection and game state for online play.
 *
 * Architecture:
 *   - The server is the ordering authority: every dispatch is sent to the server
 *     first; the server echoes it back to ALL clients (including the sender).
 *   - Each client applies actions only when received from the server, ensuring
 *     identical, deterministic state across all browsers.
 *   - Late-joiners receive the full action history in ROOM_JOINED and replay it
 *     locally to reconstruct the current game state.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { SerializableLayout } from '../globe'
import { buildGlobeGraph } from '../game/graph'
import { createInitialState, gameReducer, type GameAction } from '../game/reducer'
import type { GameState, GlobeGraph } from '../game/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'

export interface OnlineGame {
  connectionStatus: ConnectionStatus
  roomId: string | null
  isHost: boolean
  playerCount: number
  myPlayerIndex: number | null
  error: string | null
  gameState: GameState | null
  createRoom: () => void
  joinRoom: (id: string) => void
  disconnect: () => void
  dispatch: (action: GameAction) => void
}

// ---------------------------------------------------------------------------
// WebSocket URL — works both in dev (proxied by Vite) and production
// ---------------------------------------------------------------------------

/**
 * Returns the WebSocket server URL.
 *
 * Resolution order:
 *   1. VITE_WS_URL build-time env var — set this when the WebSocket server
 *      lives on a different host/port than the web server, e.g.:
 *        VITE_WS_URL=wss://api.example.com/ws
 *   2. Derived from the current page origin — works when Caddy (or any
 *      reverse proxy) forwards /ws to the app on the same host.
 */
function getWsUrl(): string {
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined
  if (envUrl) {
    try {
      const parsed = new URL(envUrl)
      if (parsed.protocol === 'ws:' || parsed.protocol === 'wss:') return envUrl
      console.warn(
        `[useOnlineGame] VITE_WS_URL has scheme "${parsed.protocol}" — ` +
        'must be ws:// or wss://. Falling back to default URL.',
      )
    } catch {
      console.warn(
        `[useOnlineGame] VITE_WS_URL "${envUrl}" is not a valid URL. ` +
        'Falling back to default URL.',
      )
    }
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOnlineGame(graph: GlobeGraph, layout: SerializableLayout): OnlineGame {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle')
  const [roomId, setRoomId] = useState<string | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [playerCount, setPlayerCount] = useState(1)
  const [myPlayerIndex, setMyPlayerIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)

  // Game state — same pure reducer as the offline game, but dispatch goes
  // through the server so all clients apply actions in the same order.
  const reducer = useCallback(
    (s: GameState | null, a: GameAction): GameState | null => {
      if (a.type === 'START_GAME') {
        return createInitialState(a.players, a.shuffledDeck, a.initialRobberFace)
      }
      if (!s) return s
      return gameReducer(s, a, graph, layout)
    },
    [graph, layout],
  )

  const [gameState, internalDispatch] = useReducer(reducer, null)

  // handleMessage uses only stable references (useState setters + internalDispatch),
  // so it's safe to set on the WebSocket without the stale-closure problem.
  function handleMessage(event: MessageEvent) {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(event.data as string)
    } catch {
      return
    }

    if (msg.type === 'ROOM_CREATED') {
      setRoomId(msg.roomId as string)
      setIsHost(true)
      setPlayerCount(1)
      setMyPlayerIndex(0)
      setConnectionStatus('connected')
    } else if (msg.type === 'ROOM_JOINED') {
      setRoomId(msg.roomId as string)
      setIsHost(false)
      setMyPlayerIndex(msg.playerIndex as number)
      setConnectionStatus('connected')
      // Replay full action history to reconstruct current game state
      for (const action of msg.history as GameAction[]) {
        internalDispatch(action)
      }
    } else if (msg.type === 'ERROR') {
      setError(msg.message as string)
      setConnectionStatus('error')
    } else if (msg.type === 'GAME_ACTION') {
      internalDispatch(msg.action as GameAction)
    } else if (msg.type === 'PLAYER_COUNT') {
      setPlayerCount(msg.count as number)
    }
  }

  function openWs(onOpen: () => void) {
    wsRef.current?.close()
    setConnectionStatus('connecting')
    setError(null)

    const ws = new WebSocket(getWsUrl())
    wsRef.current = ws
    ws.onopen = onOpen
    ws.onmessage = handleMessage
    ws.onerror = () => {
      setError('Could not connect to the server.')
      setConnectionStatus('error')
    }
    ws.onclose = () => setConnectionStatus(prev => prev === 'error' ? prev : 'idle')
  }

  function createRoom() {
    openWs(() => wsRef.current?.send(JSON.stringify({ type: 'CREATE_ROOM' })))
  }

  function joinRoom(id: string) {
    openWs(() =>
      wsRef.current?.send(JSON.stringify({ type: 'JOIN_ROOM', roomId: id.toUpperCase() })),
    )
  }

  function disconnect() {
    wsRef.current?.close()
    wsRef.current = null
    setConnectionStatus('idle')
    setRoomId(null)
    setIsHost(false)
    setPlayerCount(1)
    setMyPlayerIndex(null)
    setError(null)
  }

  // Public dispatch — sends to server; action is applied when echoed back
  function dispatch(action: GameAction) {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'GAME_ACTION', action }))
    }
  }

  // Cleanup on unmount
  useEffect(() => () => { wsRef.current?.close() }, [])

  return {
    connectionStatus,
    roomId,
    isHost,
    playerCount,
    myPlayerIndex,
    error,
    gameState,
    createRoom,
    joinRoom,
    disconnect,
    dispatch,
  }
}

// Re-export graph builder so callers don't need a separate import
export { buildGlobeGraph }
