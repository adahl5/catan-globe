/**
 * Longest Road calculation for the globe.
 *
 * Uses DFS with backtracking from every vertex that has at least one of the
 * player's roads.  Opponent buildings at a vertex cut the road — you cannot
 * traverse through a vertex occupied by an opponent.
 *
 * Returns the number of road segments in the longest continuous path.
 */

import type { EdgeIndex, GameState, GlobeGraph, PlayerIndex, VertexIndex } from './types'

/**
 * Recursive DFS helper.  `fromVertex` is the vertex we just arrived at;
 * we try to extend the path from there along unvisited player roads.
 */
function dfs(
  fromVertex: VertexIndex,
  playerRoadSet: Set<EdgeIndex>,
  opponentVertices: Set<VertexIndex>,
  visitedEdges: Set<EdgeIndex>,
  graph: GlobeGraph,
): number {
  let maxExtension = 0

  for (const ei of graph.vertexToEdges[fromVertex]!) {
    if (!playerRoadSet.has(ei) || visitedEdges.has(ei)) continue

    const [a, b] = graph.edges[ei]!
    const nextVertex = a === fromVertex ? b : a

    // Opponent buildings break road continuity
    if (opponentVertices.has(nextVertex)) continue

    visitedEdges.add(ei)
    maxExtension = Math.max(
      maxExtension,
      1 + dfs(nextVertex, playerRoadSet, opponentVertices, visitedEdges, graph),
    )
    visitedEdges.delete(ei)
  }

  return maxExtension
}

/**
 * Computes the longest road length for a player.
 *
 * @param playerRoads  EdgeIndex array of the player's road segments.
 * @param opponentVertices  Set of vertices occupied by any other player's building
 *                          (opponent buildings break road continuity).
 * @param graph  The globe graph.
 */
export function computeLongestRoad(
  playerRoads: EdgeIndex[],
  opponentVertices: Set<VertexIndex>,
  graph: GlobeGraph,
): number {
  if (playerRoads.length === 0) return 0

  const playerRoadSet = new Set(playerRoads)

  // Collect all vertices that are endpoints of this player's roads
  const startVertices = new Set<VertexIndex>()
  for (const ei of playerRoads) {
    const [a, b] = graph.edges[ei]!
    startVertices.add(a)
    startVertices.add(b)
  }

  let max = 0
  for (const sv of startVertices) {
    const visited = new Set<EdgeIndex>()
    max = Math.max(max, dfs(sv, playerRoadSet, opponentVertices, visited, graph))
  }
  return max
}

/** Builds the set of all vertices occupied by opponents of `currentPlayer`. */
function opponentVertexSet(state: GameState, currentPlayer: PlayerIndex): Set<VertexIndex> {
  const set = new Set<VertexIndex>()
  for (const [vStr, building] of Object.entries(state.buildings)) {
    if (building.player !== currentPlayer) {
      set.add(Number(vStr))
    }
  }
  return set
}

/**
 * Recomputes Longest Road for all players and returns the new holder.
 *
 * Rules:
 * - A player needs at least 5 roads to claim Longest Road.
 * - The existing holder keeps the card on ties (challenger must *exceed* current length).
 * - If the holder's road is broken they can lose the card; in that case no one gets it
 *   unless another player has 5+.
 */
export function recomputeLongestRoad(
  state: GameState,
  graph: GlobeGraph,
): { holder: PlayerIndex | null; lengths: number[] } {
  const lengths: number[] = state.players.map((p, pi) =>
    computeLongestRoad(p.roads, opponentVertexSet(state, pi), graph),
  )

  const { longestRoadHolder } = state
  let newHolder = longestRoadHolder

  // Check if current holder still qualifies
  if (newHolder !== null && lengths[newHolder]! < 5) {
    newHolder = null
  }

  // Check if any player now has a longer road than the current holder
  for (let pi = 0; pi < lengths.length; pi++) {
    if (lengths[pi]! < 5) continue
    if (newHolder === null || lengths[pi]! > lengths[newHolder]!) {
      newHolder = pi
    }
  }

  return { holder: newHolder, lengths }
}
