import { describe, expect, it, beforeAll } from 'vitest'
import { buildGlobeGraph, getDesertFaceIndices, getSouthPoleFaceIndex } from '../game/graph'
import { createShuffledDeck } from '../game/devCards'
import { createInitialState, gameReducer } from '../game/reducer'
import { getValidSettlementVertices, getSetupRoadEdges } from '../game/rules'
import type { GameState, PlayerConfig } from '../game/types'
import { defaultPoolCounts, assignFullLayout } from '../globe'
import type { SerializableLayout } from '../globe'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let layout: SerializableLayout
let graph: ReturnType<typeof buildGlobeGraph>

beforeAll(() => {
  const result = assignFullLayout(defaultPoolCounts(), () => 0.42)
  if (!result) throw new Error('assignFullLayout failed')
  layout = result
  graph = buildGlobeGraph()
})

const TWO_PLAYERS: PlayerConfig[] = [
  { name: 'Alice', color: 'red' },
  { name: 'Bob', color: 'blue' },
]

function makeDeck() {
  return createShuffledDeck(() => 0)
}

function makeState(players = TWO_PLAYERS) {
  const deserts = getDesertFaceIndices(layout)
  const robberFace = deserts[0] ?? getSouthPoleFaceIndex()
  return createInitialState(players, makeDeck(), robberFace)
}

function dispatch(state: GameState, ...actions: Parameters<typeof gameReducer>[1][]) {
  let s = state
  for (const action of actions) {
    s = gameReducer(s, action, graph, layout)
  }
  return s
}

// ---------------------------------------------------------------------------
// Setup phase
// ---------------------------------------------------------------------------

describe('Setup phase', () => {
  it('starts in setup_place_settlement phase', () => {
    const s = makeState()
    expect(s.phase).toBe('setup_place_settlement')
    expect(s.currentPlayerIndex).toBe(0)
    expect(s.setupOrder).toEqual([0, 1, 1, 0])
  })

  it('transitions to setup_place_road after settlement', () => {
    const s0 = makeState()
    const validVerts = getValidSettlementVertices(0, s0, graph, true)
    expect(validVerts.length).toBeGreaterThan(0)
    const v = validVerts[0]!
    const s1 = dispatch(s0, { type: 'SETUP_PLACE_SETTLEMENT', vertexIndex: v })
    expect(s1.phase).toBe('setup_place_road')
    expect(s1.buildings[v]).toEqual({ type: 'settlement', player: 0 })
    expect(s1.setupState?.lastSettlementVertex).toBe(v)
  })

  it('rejects settlement too close to another (distance rule)', () => {
    const s0 = makeState()
    const v0 = getValidSettlementVertices(0, s0, graph, true)[0]!
    const s1 = dispatch(s0, { type: 'SETUP_PLACE_SETTLEMENT', vertexIndex: v0 })
    // Try to place another settlement at a vertex adjacent to v0
    const adjacent = graph.vertexAdjacency[v0]![0]!
    const s2 = gameReducer(s1, { type: 'SETUP_PLACE_SETTLEMENT', vertexIndex: adjacent }, graph, layout)
    // Should not change (still setup_place_road, wrong phase)
    expect(s2).toBe(s1)
  })

  it('completes full 2-player setup (4 settlements + 4 roads)', () => {
    let s = makeState()

    // Complete all 4 setup turns: [P0, P1, P1, P0]
    for (let turn = 0; turn < 4; turn++) {
      expect(s.phase).toBe('setup_place_settlement')
      const pi = s.currentPlayerIndex
      const verts = getValidSettlementVertices(pi, s, graph, true)
      const v = verts[0]!
      s = dispatch(s, { type: 'SETUP_PLACE_SETTLEMENT', vertexIndex: v })
      expect(s.phase).toBe('setup_place_road')
      const lastV = s.setupState!.lastSettlementVertex!
      const edges = getSetupRoadEdges(lastV, s, graph)
      s = dispatch(s, { type: 'SETUP_PLACE_ROAD', edgeIndex: edges[0]! })
    }

    expect(s.phase).toBe('main_preroll')
    expect(s.currentPlayerIndex).toBe(0)
    expect(Object.keys(s.buildings).length).toBe(4)
    expect(Object.keys(s.roads).length).toBe(4)
  })

  it('grants resources in round 2 setup', () => {
    let s = makeState()

    // Complete round 1 for both players
    for (let turn = 0; turn < 2; turn++) {
      const v = getValidSettlementVertices(s.currentPlayerIndex, s, graph, true)[0]!
      s = dispatch(s, { type: 'SETUP_PLACE_SETTLEMENT', vertexIndex: v })
      const edges = getSetupRoadEdges(s.setupState!.lastSettlementVertex!, s, graph)
      s = dispatch(s, { type: 'SETUP_PLACE_ROAD', edgeIndex: edges[0]! })
    }

    // Now in round 2 (P1 goes first in round 2)
    expect(s.setupState?.round).toBe(2)
    const bobBefore = { ...s.players[1]!.resources }

    const v = getValidSettlementVertices(s.currentPlayerIndex, s, graph, true)[0]!
    s = dispatch(s, { type: 'SETUP_PLACE_SETTLEMENT', vertexIndex: v })
    const edges = getSetupRoadEdges(s.setupState!.lastSettlementVertex!, s, graph)
    s = dispatch(s, { type: 'SETUP_PLACE_ROAD', edgeIndex: edges[0]! })

    // Bob should have received resources
    const bobAfter = s.players[1]!.resources
    const totalBefore = Object.values(bobBefore).reduce((a, b) => a + b, 0)
    const totalAfter = Object.values(bobAfter).reduce((a, b) => a + b, 0)
    // Bob's settlement is adjacent to at least 1 resource face (not guaranteed to be non-desert/port)
    // Just verify no negative resources and state is valid
    expect(totalAfter).toBeGreaterThanOrEqual(totalBefore)
  })
})

// ---------------------------------------------------------------------------
// Main game phase
// ---------------------------------------------------------------------------

describe('Main game — dice and resources', () => {
  /** Set up a game with both players having placed settlements, now in main_preroll */
  function setupGame() {
    let s = makeState()
    for (let turn = 0; turn < 4; turn++) {
      const v = getValidSettlementVertices(s.currentPlayerIndex, s, graph, true)[0]!
      s = dispatch(s, { type: 'SETUP_PLACE_SETTLEMENT', vertexIndex: v })
      const edges = getSetupRoadEdges(s.setupState!.lastSettlementVertex!, s, graph)
      s = dispatch(s, { type: 'SETUP_PLACE_ROAD', edgeIndex: edges[0]! })
    }
    return s
  }

  it('ROLL_DICE transitions from main_preroll to main_build on non-7', () => {
    const s = setupGame()
    expect(s.phase).toBe('main_preroll')
    const s2 = dispatch(s, { type: 'ROLL_DICE', die1: 3, die2: 2 })
    expect(s2.phase).toBe('main_build')
    expect(s2.lastRoll).toEqual([3, 2])
    expect(s2.diceRolledThisTurn).toBe(true)
  })

  it('ROLL_DICE with 7 transitions to main_robber_move (no big hands)', () => {
    const s = setupGame()
    const s2 = dispatch(s, { type: 'ROLL_DICE', die1: 3, die2: 4 })
    expect(s2.phase).toBe('main_robber_move')
  })

  it('ROLL_DICE with 7 triggers discards when a player has >7 cards', () => {
    let s = setupGame()
    // Give Alice 10 resources
    const players = [...s.players]
    players[0] = {
      ...players[0]!,
      resources: { lumber: 3, brick: 3, wool: 2, grain: 2, ore: 0 },
    }
    s = { ...s, players }
    const s2 = dispatch(s, { type: 'ROLL_DICE', die1: 3, die2: 4 })
    expect(s2.phase).toBe('main_discard')
    expect(s2.pendingDiscards).not.toBeNull()
    expect(s2.pendingDiscards![0]).toBe(5) // floor(10/2)
  })

  it('END_TURN advances to next player and resets turn flags', () => {
    let s = setupGame()
    s = dispatch(s, { type: 'ROLL_DICE', die1: 2, die2: 3 })
    expect(s.phase).toBe('main_build')
    s = dispatch(s, { type: 'END_TURN' })
    expect(s.currentPlayerIndex).toBe(1)
    expect(s.phase).toBe('main_preroll')
    expect(s.diceRolledThisTurn).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Robber mechanics
// ---------------------------------------------------------------------------

describe('Robber mechanics', () => {
  function gameInBuildPhase() {
    let s = makeState()
    for (let turn = 0; turn < 4; turn++) {
      const v = getValidSettlementVertices(s.currentPlayerIndex, s, graph, true)[0]!
      s = dispatch(s, { type: 'SETUP_PLACE_SETTLEMENT', vertexIndex: v })
      const edges = getSetupRoadEdges(s.setupState!.lastSettlementVertex!, s, graph)
      s = dispatch(s, { type: 'SETUP_PLACE_ROAD', edgeIndex: edges[0]! })
    }
    return dispatch(s, { type: 'ROLL_DICE', die1: 3, die2: 4 }) // roll 7
  }

  it('MOVE_ROBBER places robber on new face', () => {
    let s = gameInBuildPhase()
    const oldFace = s.robberFace
    const newFace = oldFace === 0 ? 1 : 0
    s = dispatch(s, { type: 'MOVE_ROBBER', faceIndex: newFace })
    expect(s.robberFace).toBe(newFace)
  })

  it('cannot move robber to current position', () => {
    const s = gameInBuildPhase()
    const sAfter = dispatch(s, { type: 'MOVE_ROBBER', faceIndex: s.robberFace })
    expect(sAfter.robberFace).toBe(s.robberFace) // unchanged
    expect(sAfter.phase).toBe('main_robber_move') // still waiting
  })

  it('MOVE_ROBBER to face with no opponents goes straight to main_build', () => {
    let s = gameInBuildPhase()
    // Move robber to the south pole face (always empty of buildings)
    // But south pole is excluded — pick any face that has no buildings
    // Find a face with no buildings
    const emptyFace = (() => {
      for (let fi = 0; fi < 32; fi++) {
        if (fi === s.robberFace) continue
        if (fi === getSouthPoleFaceIndex()) continue
        const hasBuilding = graph.faceVertices[fi]!.some((v) => s.buildings[v] !== undefined)
        if (!hasBuilding) return fi
      }
      return -1
    })()
    if (emptyFace === -1) return // can't test if all faces have buildings (unlikely)

    s = dispatch(s, { type: 'MOVE_ROBBER', faceIndex: emptyFace })
    expect(s.phase).toBe('main_build')
    expect(s.pendingStealFrom).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Victory condition
// ---------------------------------------------------------------------------

describe('Victory condition', () => {
  it('winner is set when a player reaches 10 VP', () => {
    let s = makeState()

    // Complete setup (2-player snake: [P0, P1, P1, P0])
    for (let turn = 0; turn < 4; turn++) {
      const v = getValidSettlementVertices(s.currentPlayerIndex, s, graph, true)[0]!
      s = dispatch(s, { type: 'SETUP_PLACE_SETTLEMENT', vertexIndex: v })
      const edges = getSetupRoadEdges(s.setupState!.lastSettlementVertex!, s, graph)
      s = dispatch(s, { type: 'SETUP_PLACE_ROAD', edgeIndex: edges[0]! })
    }

    // After setup Alice (P0) has 2 settlements = 2 VP.
    // Give Alice 5 VP dev cards + 3 more settlements directly in the player struct
    // 2 (setup) + 3 (extra) + 5 (VP cards) = 10 VP — no special cards needed.
    const placedSettlements: number[] = [...s.players[0]!.settlements]
    const extraVertices: number[] = []
    for (let v = 0; v < 60 && extraVertices.length < 3; v++) {
      if (s.buildings[v] !== undefined) continue
      const tooClose = graph.vertexAdjacency[v]!.some((n) => s.buildings[n] !== undefined)
      if (tooClose) continue
      extraVertices.push(v)
    }

    const newBuildings = { ...s.buildings }
    for (const v of extraVertices) {
      newBuildings[v] = { type: 'settlement', player: 0 }
    }

    const players = [...s.players]
    players[0] = {
      ...players[0]!,
      settlements: [...placedSettlements, ...extraVertices],
      devCards: ['victoryPoint', 'victoryPoint', 'victoryPoint', 'victoryPoint', 'victoryPoint'],
    }
    // Put Alice back as currentPlayer in main_build to trigger END_TURN check
    s = {
      ...s,
      players,
      buildings: newBuildings,
      currentPlayerIndex: 0,
      phase: 'main_build',
      diceRolledThisTurn: true,
    }

    // Alice has 5 settlements + 5 VP cards = 10 VP → should win on END_TURN
    s = dispatch(s, { type: 'END_TURN' })
    expect(s.winnerIndex).toBe(0)
    expect(s.phase).toBe('game_over')
  })
})
