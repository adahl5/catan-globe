/**
 * GameLayout: positions the 3D globe and the HUD side-by-side.
 * Computes valid move targets for the current phase and passes them to the scene.
 * Renders modals (Discard, Steal) when needed.
 */

import { useMemo, useState } from 'react'
import type { SerializableLayout } from '../globe'
import type { GameAction } from '../game/reducer'
import {
  getSetupRoadEdges,
  getValidCityVertices,
  getValidRoadEdges,
  getValidSettlementVertices,
} from '../game/rules'
import type { EdgeIndex, FaceIndex, GameState, GlobeGraph, PlayerIndex, VertexIndex } from '../game/types'
import { RESOURCES, totalResources } from '../game/types'
import { DiscardModal } from './DiscardModal'
import { GameGlobeScene } from './GameGlobeScene'
import { GameHUD, type ActiveAction } from './GameHUD'
import { RobberModal } from './RobberModal'

interface Props {
  state: GameState
  layout: SerializableLayout
  graph: GlobeGraph
  dispatch: (a: GameAction) => void
  onExit: () => void
  /** Which player index this client controls. null/undefined = offline (no restriction). */
  myPlayerIndex?: number | null
  /** Shareable join URL for online games. Renders a copy button in the HUD when provided. */
  inviteUrl?: string
}

export function GameLayout({ state, layout, graph, dispatch, onExit, myPlayerIndex, inviteUrl }: Props) {
  const [activeAction, setActiveAction] = useState<ActiveAction>(null)

  const { phase, currentPlayerIndex, players } = state

  // In online mode restrict all game actions to the client's own player.
  // Offline (myPlayerIndex == null) allows full control.
  const isMyTurn = myPlayerIndex == null || myPlayerIndex === currentPlayerIndex

  // -------------------------------------------------------------------------
  // Compute valid targets for the current phase + action
  // -------------------------------------------------------------------------
  const validVertices = useMemo<VertexIndex[]>(() => {
    if (phase === 'setup_place_settlement') {
      return getValidSettlementVertices(currentPlayerIndex, state, graph, true)
    }
    if (phase === 'main_build') {
      if (activeAction === 'settlement') {
        return getValidSettlementVertices(currentPlayerIndex, state, graph, false)
      }
      if (activeAction === 'city') {
        return getValidCityVertices(currentPlayerIndex, state)
      }
    }
    return []
  }, [phase, currentPlayerIndex, state, graph, activeAction])

  const validEdges = useMemo<EdgeIndex[]>(() => {
    if (phase === 'setup_place_road') {
      const lastV = state.setupState?.lastSettlementVertex
      if (lastV == null) return []
      return getSetupRoadEdges(lastV, state, graph)
    }
    if (phase === 'main_build' && activeAction === 'road') {
      return getValidRoadEdges(currentPlayerIndex, state, graph)
    }
    if (phase === 'main_road_building_1' || phase === 'main_road_building_2') {
      return getValidRoadEdges(currentPlayerIndex, state, graph)
    }
    return []
  }, [phase, currentPlayerIndex, state, graph, activeAction])

  const robberClickable = phase === 'main_robber_move'

  // -------------------------------------------------------------------------
  // Click handlers
  // -------------------------------------------------------------------------
  function handleVertexClick(v: VertexIndex) {
    if (!isMyTurn) return
    if (phase === 'setup_place_settlement') {
      dispatch({ type: 'SETUP_PLACE_SETTLEMENT', vertexIndex: v })
    } else if (phase === 'main_build') {
      if (activeAction === 'settlement') {
        dispatch({ type: 'BUILD_SETTLEMENT', vertexIndex: v })
        setActiveAction(null)
      } else if (activeAction === 'city') {
        dispatch({ type: 'BUILD_CITY', vertexIndex: v })
        setActiveAction(null)
      }
    }
  }

  function handleEdgeClick(e: EdgeIndex) {
    if (!isMyTurn) return
    if (phase === 'setup_place_road') {
      dispatch({ type: 'SETUP_PLACE_ROAD', edgeIndex: e })
    } else if (phase === 'main_build' && activeAction === 'road') {
      dispatch({ type: 'BUILD_ROAD', edgeIndex: e })
      setActiveAction(null)
    } else if (phase === 'main_road_building_1' || phase === 'main_road_building_2') {
      dispatch({ type: 'PLACE_RB_ROAD', edgeIndex: e })
    }
  }

  function handleFaceClick(f: FaceIndex) {
    if (!isMyTurn) return
    if (phase === 'main_robber_move') {
      dispatch({ type: 'MOVE_ROBBER', faceIndex: f })
    }
  }

  // -------------------------------------------------------------------------
  // Discard modal: find the first player who still needs to discard
  // -------------------------------------------------------------------------
  const discardPlayer = useMemo<PlayerIndex | null>(() => {
    if (phase !== 'main_discard' || !state.pendingDiscards) return null
    if (myPlayerIndex != null) {
      // Online: only prompt this client's own player to discard.
      return (myPlayerIndex in state.pendingDiscards) ? myPlayerIndex as PlayerIndex : null
    }
    // Offline: prompt the first pending player.
    const keys = Object.keys(state.pendingDiscards).map(Number) as PlayerIndex[]
    return keys[0] ?? null
  }, [phase, state.pendingDiscards, myPlayerIndex])

  // -------------------------------------------------------------------------
  // Steal modal
  // -------------------------------------------------------------------------
  const stealPlayers = useMemo(() => {
    if (phase !== 'main_steal' || !state.pendingStealFrom) return null
    return state.pendingStealFrom.map((pi) => ({
      playerIndex: pi,
      name: players[pi]!.name,
      color: players[pi]!.color,
      resourceCount: totalResources(players[pi]!.resources),
    }))
  }, [phase, state.pendingStealFrom, players])

  return (
    <div className="game-layout">
      <button type="button" className="btn btn--ghost game-layout__exit" onClick={onExit}>
        ✕ Exit
      </button>

      <GameGlobeScene
        layout={layout}
        state={state}
        graph={graph}
        validVertices={validVertices}
        validEdges={validEdges}
        onVertexClick={handleVertexClick}
        onEdgeClick={handleEdgeClick}
        onFaceClick={handleFaceClick}
        robberClickable={robberClickable}
      />

      <GameHUD
        state={state}
        layout={layout}
        graph={graph}
        dispatch={dispatch}
        activeAction={activeAction}
        setActiveAction={setActiveAction}
        myPlayerIndex={myPlayerIndex}
        inviteUrl={inviteUrl}
      />

      {/* Discard modal */}
      {discardPlayer !== null && state.pendingDiscards && (
        <DiscardModal
          playerName={players[discardPlayer]!.name}
          currentResources={players[discardPlayer]!.resources}
          mustDiscard={state.pendingDiscards[discardPlayer]!}
          onConfirm={(resources) =>
            dispatch({ type: 'DISCARD', playerIndex: discardPlayer, resources })
          }
        />
      )}

      {/* Steal modal — only the active player can steal */}
      {stealPlayers && isMyTurn && (
        <RobberModal
          players={stealPlayers}
          onSteal={(pi) => {
            // Pick the stolen resource here so the same value is sent to all clients,
            // keeping game state deterministic across the network.
            const avail = RESOURCES.filter(r => state.players[pi]!.resources[r] > 0)
            const stolenResource = avail.length > 0
              ? avail[Math.floor(Math.random() * avail.length)]
              : undefined
            dispatch({ type: 'STEAL', targetPlayerIndex: pi, stolenResource })
          }}
        />
      )}
    </div>
  )
}
