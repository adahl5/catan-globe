/**
 * Game rules: validity predicates, building costs, and port trade rates.
 * All functions are pure — they only read game state and return results.
 */

import type { SerializableLayout } from '../globe'
import { getFacePort } from './graph'
import type {
  EdgeIndex,
  FaceIndex,
  GameState,
  GlobeGraph,
  PlayerIndex,
  PlayerState,
  Resource,
  ResourceCounts,
  VertexIndex,
} from './types'
import { RESOURCES } from './types'

// ---------------------------------------------------------------------------
// Building costs
// ---------------------------------------------------------------------------

export const COSTS: Record<'road' | 'settlement' | 'city' | 'devCard', Partial<ResourceCounts>> = {
  road: { lumber: 1, brick: 1 },
  settlement: { lumber: 1, brick: 1, wool: 1, grain: 1 },
  city: { grain: 2, ore: 3 },
  devCard: { ore: 1, wool: 1, grain: 1 },
}

export function canAfford(player: PlayerState, cost: Partial<ResourceCounts>): boolean {
  return RESOURCES.every((r) => player.resources[r] >= (cost[r] ?? 0))
}

// ---------------------------------------------------------------------------
// Settlement placement
// ---------------------------------------------------------------------------

/**
 * Returns all valid vertex indices where the given player may place a settlement.
 *
 * Rules:
 * - Vertex must be unoccupied.
 * - No adjacent vertex may have any building (distance rule: 2-edge gap).
 * - In main game (isSetup = false): vertex must be connected by the player's road.
 */
export function getValidSettlementVertices(
  pi: PlayerIndex,
  state: GameState,
  graph: GlobeGraph,
  isSetup: boolean,
): VertexIndex[] {
  const result: VertexIndex[] = []
  for (let v = 0; v < 60; v++) {
    if (state.buildings[v] !== undefined) continue

    // Distance rule
    const tooClose = graph.vertexAdjacency[v]!.some((n) => state.buildings[n] !== undefined)
    if (tooClose) continue

    if (!isSetup) {
      // Must be reachable via the player's roads
      const connectedByRoad = graph.vertexToEdges[v]!.some((ei) => state.roads[ei] === pi)
      if (!connectedByRoad) continue
    }

    result.push(v)
  }
  return result
}

// ---------------------------------------------------------------------------
// Road placement
// ---------------------------------------------------------------------------

/**
 * Returns true if the player can extend a road from the given vertex:
 * - Player owns a building there, OR
 * - Player has a road touching there AND no opponent building blocks the vertex.
 */
function canExtendFromVertex(
  v: VertexIndex,
  pi: PlayerIndex,
  state: GameState,
  graph: GlobeGraph,
): boolean {
  const building = state.buildings[v]
  if (building?.player === pi) return true
  if (building !== undefined) return false // opponent building blocks
  return graph.vertexToEdges[v]!.some((ei) => state.roads[ei] === pi)
}

/**
 * Returns all valid edge indices where the given player may build a road.
 *
 * Rules:
 * - Edge must be unoccupied.
 * - At least one endpoint must be accessible (own building or own road without opponent blocking).
 */
export function getValidRoadEdges(
  pi: PlayerIndex,
  state: GameState,
  graph: GlobeGraph,
): EdgeIndex[] {
  return graph.edges
    .map((_, ei) => ei)
    .filter((ei) => {
      if (state.roads[ei] !== undefined) return false
      const [a, b] = graph.edges[ei]!
      return (
        canExtendFromVertex(a, pi, state, graph) || canExtendFromVertex(b, pi, state, graph)
      )
    })
}

/**
 * Returns the valid road edges for a setup-phase placement:
 * only edges directly adjacent to the just-placed settlement vertex.
 */
export function getSetupRoadEdges(
  lastSettlementVertex: VertexIndex,
  state: GameState,
  graph: GlobeGraph,
): EdgeIndex[] {
  return graph.vertexToEdges[lastSettlementVertex]!.filter((ei) => state.roads[ei] === undefined)
}

// ---------------------------------------------------------------------------
// City placement
// ---------------------------------------------------------------------------

/** Returns vertex indices where the player can upgrade a settlement to a city. */
export function getValidCityVertices(pi: PlayerIndex, state: GameState): VertexIndex[] {
  return Object.entries(state.buildings)
    .filter(([, b]) => b.player === pi && b.type === 'settlement')
    .map(([v]) => Number(v))
}

// ---------------------------------------------------------------------------
// Robber movement
// ---------------------------------------------------------------------------

/** The robber may be moved to any face except its current position and the south pole. */
export function canMoveRobberTo(
  fi: FaceIndex,
  currentRobberFace: FaceIndex,
  southPoleFace: FaceIndex,
): boolean {
  return fi !== currentRobberFace && fi !== southPoleFace
}

// ---------------------------------------------------------------------------
// Port trade rates
// ---------------------------------------------------------------------------

/**
 * Returns the best (lowest) available trade rate for each resource for the given player.
 * Default is 4:1.  Generic 3:1 ports lower all rates to at most 3.  Specific 2:1 ports
 * lower the relevant resource rate to 2.
 *
 * A port benefits a player if they have any settlement or city on a vertex of that face.
 */
export function getPortRates(
  pi: PlayerIndex,
  state: GameState,
  graph: GlobeGraph,
  layout: SerializableLayout,
): Record<Resource, number> {
  const rates: Record<Resource, number> = {
    lumber: 4,
    brick: 4,
    wool: 4,
    grain: 4,
    ore: 4,
  }

  const totalFaces = graph.faceVertices.length
  for (let fi = 0; fi < totalFaces; fi++) {
    const port = getFacePort(fi, layout)
    if (!port) continue

    // Does the player have any building on this port face?
    const playerOnFace = graph.faceVertices[fi]!.some(
      (v) => state.buildings[v]?.player === pi,
    )
    if (!playerOnFace) continue

    if (port.kind === '3:1') {
      for (const r of RESOURCES) {
        rates[r] = Math.min(rates[r], 3)
      }
    } else {
      rates[port.resource] = Math.min(rates[port.resource], 2)
    }
  }

  return rates
}

// ---------------------------------------------------------------------------
// Bank trade validity
// ---------------------------------------------------------------------------

export function canTradeWithBank(
  player: PlayerState,
  give: Resource,
  giveCount: number,
  receive: Resource,
  bank: ResourceCounts,
  portRates: Record<Resource, number>,
): boolean {
  if (give === receive) return false
  if (giveCount !== portRates[give]) return false
  if (player.resources[give] < giveCount) return false
  if (bank[receive] < 1) return false
  return true
}

// ---------------------------------------------------------------------------
// Player supply limits
// ---------------------------------------------------------------------------

/** Maximum roads per player (standard Catan: 15). */
export const MAX_ROADS = 15
/** Maximum settlements per player (standard Catan: 5). */
export const MAX_SETTLEMENTS = 5
/** Maximum cities per player (standard Catan: 4). */
export const MAX_CITIES = 4

export function playerRoadsLeft(player: PlayerState): number {
  return MAX_ROADS - player.roads.length
}

export function playerSettlementsLeft(player: PlayerState): number {
  return MAX_SETTLEMENTS - player.settlements.length
}

export function playerCitiesLeft(player: PlayerState): number {
  return MAX_CITIES - player.cities.length
}
