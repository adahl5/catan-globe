/**
 * MultiplayerLobby — "Create Room" / "Join Room" screen shown before connecting.
 */

import { useEffect, useState } from 'react'
import type { ConnectionStatus } from '../hooks/useOnlineGame'
import './MultiplayerLobby.css'

interface Props {
  status: ConnectionStatus
  error: string | null
  /** Pre-populated room code (from invite URL); triggers auto-join on mount. */
  initialRoomId?: string
  onCreateRoom: () => void
  onJoinRoom: (id: string) => void
  onCancel: () => void
}

export function MultiplayerLobby({
  status,
  error,
  initialRoomId,
  onCreateRoom,
  onJoinRoom,
  onCancel,
}: Props) {
  const [view, setView] = useState<'menu' | 'join'>(() => (initialRoomId ? 'join' : 'menu'))
  const [joinCode, setJoinCode] = useState(initialRoomId ?? '')

  // Auto-join when an invite link opens the page
  useEffect(() => {
    if (initialRoomId && status === 'idle') {
      onJoinRoom(initialRoomId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Connecting spinner ────────────────────────────────────────────────────
  if (status === 'connecting') {
    return (
      <div className="mp-lobby">
        <div className="mp-lobby__card">
          <p className="mp-lobby__spinner-text">Connecting…</p>
        </div>
      </div>
    )
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className="mp-lobby">
        <div className="mp-lobby__card">
          <h2 className="mp-lobby__title">Connection Error</h2>
          <p className="mp-lobby__error">{error}</p>
          <div className="mp-lobby__actions">
            <button type="button" className="btn btn--secondary" onClick={onCancel}>
              Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Join form ─────────────────────────────────────────────────────────────
  function handleJoin() {
    const code = joinCode.trim().toUpperCase()
    if (code.length < 4) return
    onJoinRoom(code)
  }

  return (
    <div className="mp-lobby">
      <div className="mp-lobby__card">
        <h2 className="mp-lobby__title">Play Online</h2>

        {view === 'menu' && (
          <>
            <p className="mp-lobby__desc">
              Create a room and share the invite link, or enter a room code to join a friend.
            </p>
            <div className="mp-lobby__actions mp-lobby__actions--col">
              <button type="button" className="btn btn--primary mp-lobby__btn-wide" onClick={onCreateRoom}>
                Create Room
              </button>
              <button
                type="button"
                className="btn btn--secondary mp-lobby__btn-wide"
                onClick={() => setView('join')}
              >
                Join Room
              </button>
              <button type="button" className="btn btn--secondary mp-lobby__btn-wide" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </>
        )}

        {view === 'join' && (
          <>
            <p className="mp-lobby__desc">Enter the 6-character room code shared by your host:</p>
            <div className="mp-lobby__join-row">
              <input
                className="mp-lobby__code-input"
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="e.g. AB23CD"
                maxLength={8}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              />
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleJoin}
                disabled={joinCode.trim().length < 4}
              >
                Join
              </button>
            </div>
            <div className="mp-lobby__actions">
              <button type="button" className="btn btn--secondary" onClick={() => setView('menu')}>
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
