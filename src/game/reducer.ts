/**
 * Pure game state machine.
 *
 * gameReducer(state, action, graph, layout) → new state
 *
 * All randomness is injected via action payloads (dice values, shuffled deck, etc.)
 * so the reducer is deterministic and testable.
 */

import type { SerializableLayout } from '../globe'
import { getFaceTerrain, getSouthPoleFaceIndex } from './graph'
import { recomputeLongestRoad } from './longestRoad'
import { computeProduction } from './production'
import {
  COSTS,
  canAfford,
  getValidRoadEdges,
  getValidSettlementVertices,
  playerCitiesLeft,
  playerRoadsLeft,
  playerSettlementsLeft,
} from './rules'
import type {
  BuildingType,
  DevCardType,
  EdgeIndex,
  FaceIndex,
  GameState,
  GlobeGraph,
  PlayerConfig,
  PlayerIndex,
  PlayerState,
  Resource,
  ResourceCounts,
  VertexIndex,
} from './types'
import { RESOURCES, emptyResources, totalResources } from './types'
import { checkWin } from './vp'

// ---------------------------------------------------------------------------
// Action union type
// ---------------------------------------------------------------------------

export type GameAction =
  | {
      type: 'START_GAME'
      players: PlayerConfig[]
      shuffledDeck: DevCardType[]
      initialRobberFace: FaceIndex
    }
  | { type: 'SETUP_PLACE_SETTLEMENT'; vertexIndex: VertexIndex }
  | { type: 'SETUP_PLACE_ROAD'; edgeIndex: EdgeIndex }
  | { type: 'PLAY_KNIGHT' }
  | { type: 'ROLL_DICE'; die1: number; die2: number }
  | { type: 'MOVE_ROBBER'; faceIndex: FaceIndex }
  | { type: 'STEAL'; targetPlayerIndex: PlayerIndex; stolenResource?: Resource }
  | { type: 'DISCARD'; playerIndex: PlayerIndex; resources: Partial<ResourceCounts> }
  | { type: 'BUILD_ROAD'; edgeIndex: EdgeIndex }
  | { type: 'BUILD_SETTLEMENT'; vertexIndex: VertexIndex }
  | { type: 'BUILD_CITY'; vertexIndex: VertexIndex }
  | { type: 'BUY_DEV_CARD' }
  | { type: 'PLAY_ROAD_BUILDING' }
  | { type: 'PLACE_RB_ROAD'; edgeIndex: EdgeIndex }
  | { type: 'SKIP_RB_ROAD' }
  | { type: 'PLAY_YEAR_OF_PLENTY'; res1: Resource; res2: Resource }
  | { type: 'PLAY_MONOPOLY'; resource: Resource }
  | { type: 'TRADE_BANK'; give: Resource; giveCount: number; receive: Resource }
  | { type: 'PROPOSE_TRADE'; offer: Partial<ResourceCounts>; request: Partial<ResourceCounts> }
  | { type: 'ACCEPT_TRADE'; acceptingPlayerIndex: PlayerIndex }
  | { type: 'CANCEL_TRADE' }
  | { type: 'END_TURN' }

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

function makePlayer(config: PlayerConfig): PlayerState {
  return {
    name: config.name,
    color: config.color,
    resources: emptyResources(),
    devCards: [],
    playedDevCards: [],
    knightsPlayed: 0,
    settlements: [],
    cities: [],
    roads: [],
  }
}

export function createInitialState(
  players: PlayerConfig[],
  deck: DevCardType[],
  robberFace: FaceIndex,
): GameState {
  const n = players.length
  // Snake order: [0,1,...,n-1, n-1,...,1,0]
  const forward = Array.from({ length: n }, (_, i) => i)
  const backward = [...forward].reverse()
  const setupOrder: PlayerIndex[] = [...forward, ...backward]

  return {
    phase: 'setup_place_settlement',
    players: players.map(makePlayer),
    currentPlayerIndex: 0,
    turnNumber: 0,
    diceRolledThisTurn: false,
    buildings: {},
    roads: {},
    robberFace,
    devCardDeck: deck,
    lastRoll: null,
    longestRoadHolder: null,
    largestArmyHolder: null,
    bank: { lumber: 19, brick: 19, wool: 19, grain: 19, ore: 19 },
    setupState: {
      round: 1,
      setupOrderIndex: 0,
      lastSettlementVertex: null,
    },
    setupOrder,
    pendingStealFrom: null,
    pendingDiscards: null,
    playedDevCardThisTurn: false,
    pendingTradeOffer: null,
    winnerIndex: null,
    log: [`Game started with ${n} players.`],
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addLog(state: GameState, msg: string): GameState {
  return { ...state, log: [...state.log, msg] }
}

function playerName(state: GameState, pi: PlayerIndex): string {
  return state.players[pi]!.name
}

/** Deduct resources from player and return them to the bank. */
function deductResources(
  state: GameState,
  pi: PlayerIndex,
  cost: Partial<ResourceCounts>,
): GameState {
  const player = { ...state.players[pi]! }
  const bank = { ...state.bank }
  const newResources = { ...player.resources }
  for (const r of RESOURCES) {
    const amount = cost[r] ?? 0
    newResources[r] -= amount
    bank[r] += amount
  }
  player.resources = newResources
  const players = [...state.players]
  players[pi] = player
  return { ...state, players, bank }
}

/** Transfer resources from bank to player. */
function grantResources(
  state: GameState,
  pi: PlayerIndex,
  resources: Partial<ResourceCounts>,
): GameState {
  const player = { ...state.players[pi]! }
  const bank = { ...state.bank }
  const newResources = { ...player.resources }
  for (const r of RESOURCES) {
    const amount = resources[r] ?? 0
    if (amount <= 0) continue
    const banked = Math.min(amount, bank[r]) // can't give more than bank has
    newResources[r] += banked
    bank[r] -= banked
  }
  player.resources = newResources
  const players = [...state.players]
  players[pi] = player
  return { ...state, players, bank }
}

/** After any change that could affect Largest Army, recompute the holder. */
function updateLargestArmy(state: GameState): GameState {
  const { largestArmyHolder, players } = state
  const THRESHOLD = 3

  let newHolder = largestArmyHolder
  const currentHolderKnights = newHolder !== null ? players[newHolder]!.knightsPlayed : 0

  for (let pi = 0; pi < players.length; pi++) {
    const knights = players[pi]!.knightsPlayed
    if (knights < THRESHOLD) continue
    if (newHolder === null || knights > currentHolderKnights) {
      newHolder = pi
    }
  }

  if (newHolder === largestArmyHolder) return state
  const name = newHolder !== null ? playerName(state, newHolder) : 'nobody'
  return addLog({ ...state, largestArmyHolder: newHolder }, `🪖 Largest Army: ${name}`)
}

/** After any road change, recompute Longest Road. */
function updateLongestRoad(state: GameState, graph: GlobeGraph): GameState {
  const { holder } = recomputeLongestRoad(state, graph)
  if (holder === state.longestRoadHolder) return state
  const name = holder !== null ? playerName(state, holder) : 'nobody'
  return addLog({ ...state, longestRoadHolder: holder }, `🛣️ Longest Road: ${name}`)
}

/** Grant round-2 setup resources: 1 of each terrain adjacent to vertex. */
function grantSetupResources(
  state: GameState,
  pi: PlayerIndex,
  vertex: VertexIndex,
  graph: GlobeGraph,
  layout: SerializableLayout,
): GameState {
  const gained: Partial<ResourceCounts> = {}
  for (const fi of graph.vertexToFaces[vertex]!) {
    const terrain = getFaceTerrain(fi, layout)
    if (!terrain || terrain === 'desert') continue
    const res = terrain as Resource
    gained[res] = (gained[res] ?? 0) + 1
  }
  const parts = Object.entries(gained)
    .filter(([, n]) => n > 0)
    .map(([r, n]) => `${n} ${r}`)
    .join(', ')
  const s = grantResources(state, pi, gained)
  return parts ? addLog(s, `${playerName(s, pi)} collects: ${parts}`) : s
}

// ---------------------------------------------------------------------------
// After-robber helper: determine next phase
// ---------------------------------------------------------------------------

/** After robber is moved: find opponents adjacent to the robber face. */
function computeStealTargets(
  state: GameState,
  graph: GlobeGraph,
  robberFace: FaceIndex,
): PlayerIndex[] {
  const found = new Set<PlayerIndex>()
  for (const v of graph.faceVertices[robberFace]!) {
    const building = state.buildings[v]
    if (building && building.player !== state.currentPlayerIndex) {
      found.add(building.player)
    }
  }
  return [...found]
}

// ---------------------------------------------------------------------------
// Main reducer
// ---------------------------------------------------------------------------

export function gameReducer(
  state: GameState,
  action: GameAction,
  graph: GlobeGraph,
  layout: SerializableLayout,
): GameState {
  switch (action.type) {
    // -----------------------------------------------------------------------
    case 'SETUP_PLACE_SETTLEMENT': {
      if (state.phase !== 'setup_place_settlement') return state
      const { vertexIndex } = action
      if (state.buildings[vertexIndex] !== undefined) return state
      // Distance rule
      const tooClose = graph.vertexAdjacency[vertexIndex]!.some(
        (n) => state.buildings[n] !== undefined,
      )
      if (tooClose) return state

      const pi = state.currentPlayerIndex
      const player = { ...state.players[pi]! }
      player.settlements = [...player.settlements, vertexIndex]
      const players = [...state.players]
      players[pi] = player

      return addLog(
        {
          ...state,
          players,
          buildings: { ...state.buildings, [vertexIndex]: { type: 'settlement' as BuildingType, player: pi } },
          phase: 'setup_place_road',
          setupState: { ...state.setupState!, lastSettlementVertex: vertexIndex },
        },
        `${playerName(state, pi)} placed a settlement.`,
      )
    }

    // -----------------------------------------------------------------------
    case 'SETUP_PLACE_ROAD': {
      if (state.phase !== 'setup_place_road') return state
      const { edgeIndex } = action
      const { setupState } = state
      if (!setupState) return state
      const { lastSettlementVertex, setupOrderIndex } = setupState
      if (lastSettlementVertex === null) return state
      if (!graph.vertexToEdges[lastSettlementVertex]!.includes(edgeIndex)) return state
      if (state.roads[edgeIndex] !== undefined) return state

      const pi = state.currentPlayerIndex
      const n = state.players.length

      // Place the road
      const player = { ...state.players[pi]! }
      player.roads = [...player.roads, edgeIndex]
      const players = [...state.players]
      players[pi] = player
      let s: GameState = {
        ...state,
        players,
        roads: { ...state.roads, [edgeIndex]: pi },
      }

      // Round 2: grant resources from adjacent faces
      if (setupState.round === 2) {
        s = grantSetupResources(s, pi, lastSettlementVertex, graph, layout)
      }

      s = addLog(s, `${playerName(s, pi)} placed a road.`)

      // Advance setup order
      const nextIdx = setupOrderIndex + 1
      if (nextIdx >= state.setupOrder.length) {
        // All placements done — start main game
        return {
          ...s,
          phase: 'main_preroll',
          currentPlayerIndex: 0,
          setupState: null,
          turnNumber: 1,
          log: [...s.log, 'Setup complete! Game begins.'],
        }
      }

      const nextPlayer = state.setupOrder[nextIdx]!
      const nextRound: 1 | 2 = nextIdx < n ? 1 : 2
      return {
        ...s,
        phase: 'setup_place_settlement',
        currentPlayerIndex: nextPlayer,
        setupState: {
          round: nextRound,
          setupOrderIndex: nextIdx,
          lastSettlementVertex: null,
        },
      }
    }

    // -----------------------------------------------------------------------
    case 'PLAY_KNIGHT': {
      if (state.phase !== 'main_preroll') return state
      const pi = state.currentPlayerIndex
      const player = { ...state.players[pi]! }
      const cardIdx = player.devCards.indexOf('knight')
      if (cardIdx === -1) return state
      if (state.playedDevCardThisTurn) return state

      const devCards = [...player.devCards]
      devCards.splice(cardIdx, 1)
      player.devCards = devCards
      player.playedDevCards = [...player.playedDevCards, 'knight']
      player.knightsPlayed += 1

      const players = [...state.players]
      players[pi] = player

      let s: GameState = {
        ...state,
        players,
        phase: 'main_robber_move',
        playedDevCardThisTurn: true,
      }
      s = updateLargestArmy(s)
      return addLog(s, `${playerName(s, pi)} played a Knight.`)
    }

    // -----------------------------------------------------------------------
    case 'ROLL_DICE': {
      if (state.phase !== 'main_preroll') return state
      const { die1, die2 } = action
      const roll = die1 + die2
      const pi = state.currentPlayerIndex

      let s: GameState = {
        ...state,
        lastRoll: [die1, die2],
        diceRolledThisTurn: true,
      }
      s = addLog(s, `${playerName(s, pi)} rolled ${roll} (${die1}+${die2}).`)

      if (roll === 7) {
        // Collect players who must discard (> 7 cards)
        const pendingDiscards: Record<PlayerIndex, number> = {}
        for (let p = 0; p < s.players.length; p++) {
          const total = totalResources(s.players[p]!.resources)
          if (total > 7) {
            pendingDiscards[p] = Math.floor(total / 2)
            s = addLog(s, `${playerName(s, p)} must discard ${pendingDiscards[p]} cards.`)
          }
        }
        if (Object.keys(pendingDiscards).length > 0) {
          return { ...s, phase: 'main_discard', pendingDiscards }
        }
        return { ...s, phase: 'main_robber_move', pendingDiscards: null }
      }

      // Normal roll — distribute resources
      const production = computeProduction(roll, s, layout, graph)
      let bank = { ...s.bank }
      const players = [...s.players]

      let resourceLog = ''
      for (let p = 0; p < players.length; p++) {
        const gained = production[p]!
        const total = totalResources(gained)
        if (total === 0) continue
        const parts = RESOURCES.filter((r) => gained[r] > 0).map((r) => `${gained[r]} ${r}`)
        resourceLog += `${s.players[p]!.name}: ${parts.join(', ')}. `
        const pl = { ...players[p]! }
        pl.resources = { ...pl.resources }
        for (const r of RESOURCES) {
          pl.resources[r] += gained[r]
          bank[r] -= gained[r]
        }
        players[p] = pl
      }

      if (resourceLog) s = addLog(s, `Resources: ${resourceLog.trim()}`)

      return { ...s, players, bank, phase: 'main_build' }
    }

    // -----------------------------------------------------------------------
    case 'DISCARD': {
      if (state.phase !== 'main_discard') return state
      const { playerIndex, resources } = action
      const required = state.pendingDiscards?.[playerIndex]
      if (required === undefined) return state

      const discardTotal = RESOURCES.reduce((s, r) => s + (resources[r] ?? 0), 0)
      if (discardTotal !== required) return state

      const player = state.players[playerIndex]!
      for (const r of RESOURCES) {
        if ((resources[r] ?? 0) > player.resources[r]) return state // can't discard more than held
      }

      let s = deductResources(state, playerIndex, resources)
      s = addLog(s, `${playerName(s, playerIndex)} discarded ${required} cards.`)

      const newPending = { ...s.pendingDiscards! }
      delete newPending[playerIndex]

      if (Object.keys(newPending).length === 0) {
        return { ...s, pendingDiscards: null, phase: 'main_robber_move' }
      }
      return { ...s, pendingDiscards: newPending }
    }

    // -----------------------------------------------------------------------
    case 'MOVE_ROBBER': {
      if (state.phase !== 'main_robber_move') return state
      const { faceIndex } = action
      const southPole = getSouthPoleFaceIndex()
      if (faceIndex === state.robberFace) return state
      if (faceIndex === southPole) return state

      const pi = state.currentPlayerIndex
      let s: GameState = { ...state, robberFace: faceIndex }
      s = addLog(s, `${playerName(s, pi)} moved the robber.`)

      const targets = computeStealTargets(s, graph, faceIndex)
      if (targets.length === 0) {
        // No steal targets — go to build phase or back to preroll
        const nextPhase = s.diceRolledThisTurn ? 'main_build' : 'main_preroll'
        return { ...s, phase: nextPhase, pendingStealFrom: null }
      }

      return { ...s, phase: 'main_steal', pendingStealFrom: targets }
    }

    // -----------------------------------------------------------------------
    case 'STEAL': {
      if (state.phase !== 'main_steal') return state
      const { targetPlayerIndex } = action
      if (!state.pendingStealFrom?.includes(targetPlayerIndex)) return state

      const target = state.players[targetPlayerIndex]!
      const available = RESOURCES.filter((r) => target.resources[r] > 0)
      const pi = state.currentPlayerIndex

      let s: GameState = { ...state, phase: state.diceRolledThisTurn ? 'main_build' : 'main_preroll', pendingStealFrom: null }

      if (available.length === 0) {
        return addLog(s, `${playerName(s, pi)} stole from ${playerName(s, targetPlayerIndex)} (nothing to steal).`)
      }

      // Use the resource chosen at dispatch time (deterministic for online play),
      // falling back to a local random pick for offline games.
      const stolenRes =
        action.stolenResource ?? available[Math.floor(Math.random() * available.length)]!

      // Transfer: target loses 1, current player gains 1
      const players = [...s.players]
      const targetPlayer = { ...players[targetPlayerIndex]! }
      targetPlayer.resources = { ...targetPlayer.resources, [stolenRes]: targetPlayer.resources[stolenRes] - 1 }
      const currentPlayer = { ...players[pi]! }
      currentPlayer.resources = { ...currentPlayer.resources, [stolenRes]: currentPlayer.resources[stolenRes] + 1 }
      players[targetPlayerIndex] = targetPlayer
      players[pi] = currentPlayer

      return addLog(
        { ...s, players },
        `${playerName(s, pi)} stole 1 resource from ${playerName(s, targetPlayerIndex)}.`,
      )
    }

    // -----------------------------------------------------------------------
    case 'BUILD_ROAD': {
      if (state.phase !== 'main_build') return state
      const pi = state.currentPlayerIndex
      const player = state.players[pi]!
      if (!canAfford(player, COSTS.road)) return state
      if (playerRoadsLeft(player) <= 0) return state

      const valid = getValidRoadEdges(pi, state, graph)
      if (!valid.includes(action.edgeIndex)) return state

      let s = deductResources(state, pi, COSTS.road)
      const p = { ...s.players[pi]! }
      p.roads = [...p.roads, action.edgeIndex]
      const players = [...s.players]
      players[pi] = p
      s = { ...s, players, roads: { ...s.roads, [action.edgeIndex]: pi } }
      s = updateLongestRoad(s, graph)
      const winner = checkWin(s)
      if (winner !== null) return { ...s, phase: 'game_over', winnerIndex: winner }
      return addLog(s, `${playerName(s, pi)} built a road.`)
    }

    // -----------------------------------------------------------------------
    case 'BUILD_SETTLEMENT': {
      if (state.phase !== 'main_build') return state
      const pi = state.currentPlayerIndex
      const player = state.players[pi]!
      if (!canAfford(player, COSTS.settlement)) return state
      if (playerSettlementsLeft(player) <= 0) return state

      const valid = getValidSettlementVertices(pi, state, graph, false)
      if (!valid.includes(action.vertexIndex)) return state

      let s = deductResources(state, pi, COSTS.settlement)
      const p = { ...s.players[pi]! }
      p.settlements = [...p.settlements, action.vertexIndex]
      const players = [...s.players]
      players[pi] = p
      s = {
        ...s,
        players,
        buildings: { ...s.buildings, [action.vertexIndex]: { type: 'settlement' as BuildingType, player: pi } },
      }
      const winner = checkWin(s)
      if (winner !== null) return { ...s, phase: 'game_over', winnerIndex: winner }
      return addLog(s, `${playerName(s, pi)} built a settlement.`)
    }

    // -----------------------------------------------------------------------
    case 'BUILD_CITY': {
      if (state.phase !== 'main_build') return state
      const pi = state.currentPlayerIndex
      const player = state.players[pi]!
      if (!canAfford(player, COSTS.city)) return state
      if (playerCitiesLeft(player) <= 0) return state

      const building = state.buildings[action.vertexIndex]
      if (!building || building.player !== pi || building.type !== 'settlement') return state

      let s = deductResources(state, pi, COSTS.city)
      // Put grain back for settlement cost... no, city cost is different (2 grain + 3 ore)
      const p = { ...s.players[pi]! }
      p.settlements = p.settlements.filter((v) => v !== action.vertexIndex)
      p.cities = [...p.cities, action.vertexIndex]
      const players = [...s.players]
      players[pi] = p
      s = {
        ...s,
        players,
        buildings: { ...s.buildings, [action.vertexIndex]: { type: 'city' as BuildingType, player: pi } },
      }
      const winner = checkWin(s)
      if (winner !== null) return { ...s, phase: 'game_over', winnerIndex: winner }
      return addLog(s, `${playerName(s, pi)} built a city.`)
    }

    // -----------------------------------------------------------------------
    case 'BUY_DEV_CARD': {
      if (state.phase !== 'main_build') return state
      const pi = state.currentPlayerIndex
      const player = state.players[pi]!
      if (!canAfford(player, COSTS.devCard)) return state
      if (state.devCardDeck.length === 0) return state

      let s = deductResources(state, pi, COSTS.devCard)
      const [drawn, ...remaining] = s.devCardDeck
      const p = { ...s.players[pi]! }
      p.devCards = [...p.devCards, drawn!]
      const players = [...s.players]
      players[pi] = p
      s = { ...s, players, devCardDeck: remaining }

      const winner = checkWin(s)
      if (winner !== null) return { ...addLog(s, `${playerName(s, pi)} bought a dev card.`), phase: 'game_over', winnerIndex: winner }
      return addLog(s, `${playerName(s, pi)} bought a dev card.`)
    }

    // -----------------------------------------------------------------------
    case 'PLAY_ROAD_BUILDING': {
      if (state.phase !== 'main_build') return state
      if (state.playedDevCardThisTurn) return state
      const pi = state.currentPlayerIndex
      const player = state.players[pi]!
      const cardIdx = player.devCards.indexOf('roadBuilding')
      if (cardIdx === -1) return state

      const p = { ...player }
      const devCards = [...p.devCards]
      devCards.splice(cardIdx, 1)
      p.devCards = devCards
      p.playedDevCards = [...p.playedDevCards, 'roadBuilding']
      const players = [...state.players]
      players[pi] = p

      // Check if player has any road to place
      const valid = getValidRoadEdges(pi, { ...state, players }, graph)
      if (valid.length === 0 || playerRoadsLeft(p) === 0) {
        return addLog({ ...state, players, playedDevCardThisTurn: true }, `${playerName(state, pi)} played Road Building (no valid roads).`)
      }

      return addLog(
        { ...state, players, phase: 'main_road_building_1', playedDevCardThisTurn: true },
        `${playerName(state, pi)} played Road Building.`,
      )
    }

    // -----------------------------------------------------------------------
    case 'PLACE_RB_ROAD': {
      if (state.phase !== 'main_road_building_1' && state.phase !== 'main_road_building_2') return state
      const pi = state.currentPlayerIndex
      const player = state.players[pi]!
      if (playerRoadsLeft(player) <= 0) return state

      const valid = getValidRoadEdges(pi, state, graph)
      if (!valid.includes(action.edgeIndex)) return state

      const p = { ...player }
      p.roads = [...p.roads, action.edgeIndex]
      const players = [...state.players]
      players[pi] = p

      let s: GameState = {
        ...state,
        players,
        roads: { ...state.roads, [action.edgeIndex]: pi },
        phase: state.phase === 'main_road_building_1' ? 'main_road_building_2' : 'main_build',
      }
      s = updateLongestRoad(s, graph)
      const winner = checkWin(s)
      if (winner !== null) return { ...s, phase: 'game_over', winnerIndex: winner }
      return addLog(s, `${playerName(s, pi)} placed a free road.`)
    }

    // -----------------------------------------------------------------------
    case 'SKIP_RB_ROAD': {
      if (state.phase !== 'main_road_building_1' && state.phase !== 'main_road_building_2') return state
      return { ...state, phase: 'main_build' }
    }

    // -----------------------------------------------------------------------
    case 'PLAY_YEAR_OF_PLENTY': {
      if (state.phase !== 'main_build') return state
      if (state.playedDevCardThisTurn) return state
      const pi = state.currentPlayerIndex
      const player = state.players[pi]!
      const cardIdx = player.devCards.indexOf('yearOfPlenty')
      if (cardIdx === -1) return state

      const p = { ...player }
      const devCards = [...p.devCards]
      devCards.splice(cardIdx, 1)
      p.devCards = devCards
      p.playedDevCards = [...p.playedDevCards, 'yearOfPlenty']
      const players = [...state.players]
      players[pi] = p

      let s: GameState = { ...state, players, playedDevCardThisTurn: true }
      s = grantResources(s, pi, { [action.res1]: 1 })
      s = grantResources(s, pi, { [action.res2]: 1 })
      return addLog(s, `${playerName(s, pi)} played Year of Plenty (${action.res1}, ${action.res2}).`)
    }

    // -----------------------------------------------------------------------
    case 'PLAY_MONOPOLY': {
      if (state.phase !== 'main_build') return state
      if (state.playedDevCardThisTurn) return state
      const pi = state.currentPlayerIndex
      const player = state.players[pi]!
      const cardIdx = player.devCards.indexOf('monopoly')
      if (cardIdx === -1) return state

      const p = { ...player }
      const devCards = [...p.devCards]
      devCards.splice(cardIdx, 1)
      p.devCards = devCards
      p.playedDevCards = [...p.playedDevCards, 'monopoly']
      const players = [...state.players]
      players[pi] = p

      // Collect the resource from all other players
      let total = 0
      const playersAfter = [...players]
      for (let other = 0; other < playersAfter.length; other++) {
        if (other === pi) continue
        const amt = playersAfter[other]!.resources[action.resource]
        if (amt <= 0) continue
        total += amt
        const op = { ...playersAfter[other]! }
        op.resources = { ...op.resources, [action.resource]: 0 }
        playersAfter[other] = op
      }
      const current = { ...playersAfter[pi]! }
      current.resources = { ...current.resources, [action.resource]: current.resources[action.resource] + total }
      playersAfter[pi] = current

      return addLog(
        { ...state, players: playersAfter, playedDevCardThisTurn: true },
        `${playerName(state, pi)} played Monopoly on ${action.resource} and took ${total}.`,
      )
    }

    // -----------------------------------------------------------------------
    case 'TRADE_BANK': {
      if (state.phase !== 'main_build') return state
      const pi = state.currentPlayerIndex
      const { give, giveCount, receive } = action
      if (give === receive) return state
      const player = state.players[pi]!
      if (player.resources[give] < giveCount) return state
      if (state.bank[receive] < 1) return state

      let s = deductResources(state, pi, { [give]: giveCount })
      s = grantResources(s, pi, { [receive]: 1 })
      return addLog(s, `${playerName(s, pi)} traded ${giveCount} ${give} for 1 ${receive}.`)
    }

    // -----------------------------------------------------------------------
    case 'PROPOSE_TRADE': {
      if (state.phase !== 'main_build') return state
      const pi = state.currentPlayerIndex
      const player = state.players[pi]!
      // Validate player has the offered resources
      for (const r of RESOURCES) {
        if ((action.offer[r] ?? 0) > player.resources[r]) return state
      }
      return {
        ...state,
        pendingTradeOffer: {
          fromPlayer: pi,
          offer: action.offer,
          request: action.request,
        },
      }
    }

    // -----------------------------------------------------------------------
    case 'ACCEPT_TRADE': {
      if (!state.pendingTradeOffer) return state
      if (state.phase !== 'main_build') return state
      const { acceptingPlayerIndex } = action
      const { fromPlayer, offer, request } = state.pendingTradeOffer
      if (acceptingPlayerIndex === fromPlayer) return state

      const acceptor = state.players[acceptingPlayerIndex]!
      // Acceptor must have the requested resources
      for (const r of RESOURCES) {
        if ((request[r] ?? 0) > acceptor.resources[r]) return state
      }
      const proposer = state.players[fromPlayer]!
      for (const r of RESOURCES) {
        if ((offer[r] ?? 0) > proposer.resources[r]) return state
      }

      let s = deductResources(state, fromPlayer, offer)
      s = deductResources(s, acceptingPlayerIndex, request)
      s = grantResources(s, acceptingPlayerIndex, offer)
      s = grantResources(s, fromPlayer, request)
      return addLog(
        { ...s, pendingTradeOffer: null },
        `${playerName(s, fromPlayer)} traded with ${playerName(s, acceptingPlayerIndex)}.`,
      )
    }

    // -----------------------------------------------------------------------
    case 'CANCEL_TRADE': {
      return { ...state, pendingTradeOffer: null }
    }

    // -----------------------------------------------------------------------
    case 'END_TURN': {
      if (state.phase !== 'main_build') return state

      let s: GameState = { ...state, pendingTradeOffer: null }
      s = updateLongestRoad(s, graph)
      const winner = checkWin(s)
      if (winner !== null) {
        return {
          ...s,
          phase: 'game_over',
          winnerIndex: winner,
          log: [...s.log, `🎉 ${playerName(s, winner)} wins!`],
        }
      }

      const nextPlayer = (s.currentPlayerIndex + 1) % s.players.length
      return {
        ...s,
        phase: 'main_preroll',
        currentPlayerIndex: nextPlayer,
        turnNumber: s.turnNumber + 1,
        diceRolledThisTurn: false,
        playedDevCardThisTurn: false,
        pendingStealFrom: null,
        pendingDiscards: null,
        log: [...s.log, `--- ${playerName(s, nextPlayer)}'s turn ---`],
      }
    }

    default:
      return state
  }
}
