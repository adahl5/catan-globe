/**
 * GameContainer: top-level game component.
 *
 * Owns the game state via useReducer.  Renders PlayerSetup until the game is
 * started, then renders GameLayout for active gameplay.
 */

import { useCallback, useMemo, useReducer } from 'react'
import type { SerializableLayout } from '../globe'
import { createShuffledDeck } from '../game/devCards'
import { buildGlobeGraph, getDesertFaceIndices, getSouthPoleFaceIndex } from '../game/graph'
import { createInitialState, gameReducer, type GameAction } from '../game/reducer'
import type { GameState, PlayerConfig } from '../game/types'
import { GameLayout } from './GameLayout'
import { PlayerSetup } from './PlayerSetup'

interface Props {
  layout: SerializableLayout
  onExit: () => void
}

type MaybeGameState = GameState | null

export function GameContainer({ layout, onExit }: Props) {
  // Build the graph once and cache it (buildGlobeGraph is already memoised at module level)
  const graph = useMemo(() => buildGlobeGraph(), [])

  // Wrap the reducer to close over graph + layout
  const reducer = useCallback(
    (s: MaybeGameState, a: GameAction): MaybeGameState => {
      if (a.type === 'START_GAME') {
        return createInitialState(a.players, a.shuffledDeck, a.initialRobberFace)
      }
      if (!s) return s
      return gameReducer(s, a, graph, layout)
    },
    [graph, layout],
  )

  const [state, dispatch] = useReducer(reducer, null)

  function handleStart(players: PlayerConfig[]) {
    const shuffledDeck = createShuffledDeck()
    const deserts = getDesertFaceIndices(layout)
    // Robber starts on the first desert face; fall back to south pole if no deserts
    const initialRobberFace = deserts[0] ?? getSouthPoleFaceIndex()
    dispatch({ type: 'START_GAME', players, shuffledDeck, initialRobberFace })
  }

  if (!state) {
    return <PlayerSetup onStart={handleStart} onCancel={onExit} />
  }

  return (
    <GameLayout
      state={state}
      layout={layout}
      graph={graph}
      dispatch={dispatch}
      onExit={onExit}
    />
  )
}
