/**
 * OnlineGameContainer — top-level container for online multiplayer games.
 *
 * Flow:
 *   1. MultiplayerLobby   — create or join a room
 *   2a. Host → PlayerSetup + room banner  — configure players, start game
 *   2b. Guest → waiting screen            — wait for host to start
 *   3. GameLayout         — live game, synced via WebSocket
 */

import { useCallback, useMemo, useState } from 'react'
import type { SerializableLayout } from '../globe'
import { serializeLayout } from '../globe'
import { buildGlobeGraph, getDesertFaceIndices, getSouthPoleFaceIndex } from '../game/graph'
import { createShuffledDeck } from '../game/devCards'
import type { PlayerConfig } from '../game/types'
import { useOnlineGame } from '../hooks/useOnlineGame'
import { GameLayout } from './GameLayout'
import { PlayerSetup } from './PlayerSetup'
import { MultiplayerLobby } from './MultiplayerLobby'
import './MultiplayerLobby.css'

interface Props {
  layout: SerializableLayout
  /** Pre-populated room ID from an invite URL; triggers auto-join. */
  initialRoomId?: string
  onExit: () => void
}

export function OnlineGameContainer({ layout, initialRoomId, onExit }: Props) {
  const graph = useMemo(() => buildGlobeGraph(), [])
  const online = useOnlineGame(graph, layout)

  const [copyLabel, setCopyLabel] = useState('Copy invite link')

  // Build the shareable join URL once connected
  const inviteUrl = useMemo(() => {
    if (!online.roomId) return ''
    const url = new URL(window.location.href)
    url.searchParams.set('room', online.roomId)
    url.searchParams.set('layout', serializeLayout(layout))
    return url.toString()
  }, [online.roomId, layout])

  const handleCopyInvite = useCallback(() => {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopyLabel('Copied!')
      setTimeout(() => setCopyLabel('Copy invite link'), 2000)
    })
  }, [inviteUrl])

  function handleStart(players: PlayerConfig[]) {
    const shuffledDeck = createShuffledDeck()
    const deserts = getDesertFaceIndices(layout)
    const initialRobberFace = deserts[0] ?? getSouthPoleFaceIndex()
    online.dispatch({ type: 'START_GAME', players, shuffledDeck, initialRobberFace })
  }

  function handleLeave() {
    online.disconnect()
    onExit()
  }

  // ── 1. Not yet connected → lobby ─────────────────────────────────────────
  if (online.connectionStatus !== 'connected') {
    return (
      <MultiplayerLobby
        status={online.connectionStatus}
        error={online.error}
        initialRoomId={initialRoomId}
        onCreateRoom={online.createRoom}
        onJoinRoom={online.joinRoom}
        onCancel={onExit}
      />
    )
  }

  // ── 2. Connected, game not started yet ───────────────────────────────────
  if (!online.gameState) {
    if (online.isHost) {
      // Host: show room banner above the normal PlayerSetup
      return (
        <>
          <div className="online-room-banner">
            <span>Room code:</span>
            <span className="online-room-banner__code">{online.roomId}</span>
            <button
              type="button"
              className="online-room-banner__copy"
              onClick={handleCopyInvite}
            >
              {copyLabel}
            </button>
            <span className="online-room-banner__count">
              {online.playerCount} player{online.playerCount !== 1 ? 's' : ''} connected
            </span>
          </div>
          <PlayerSetup onStart={handleStart} onCancel={handleLeave} />
        </>
      )
    }

    // Guest: waiting for host to start
    return (
      <div className="online-waiting">
        <div className="online-waiting__card">
          <h2>Waiting for host</h2>
          <div className="online-waiting__room-code">{online.roomId}</div>
          <p className="online-waiting__info">
            {online.playerCount} player{online.playerCount !== 1 ? 's' : ''} connected
          </p>
          <p className="online-waiting__info">
            <span className="online-waiting__dots">The host is setting up the game</span>
          </p>
          <button type="button" className="btn btn--secondary" onClick={handleLeave}>
            Leave Room
          </button>
        </div>
      </div>
    )
  }

  // ── 3. Game in progress ──────────────────────────────────────────────────
  return (
    <GameLayout
      state={online.gameState}
      layout={layout}
      graph={graph}
      dispatch={online.dispatch}
      onExit={handleLeave}
      myPlayerIndex={online.myPlayerIndex}
      inviteUrl={inviteUrl}
    />
  )
}
