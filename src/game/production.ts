/**
 * Resource production: given a dice roll, compute how many resources each
 * player receives from the current board state, then cap against bank supply.
 *
 * Standard rule: if the bank cannot fully pay all production of a resource type,
 * NO player receives that resource type.
 */

import type { SerializableLayout } from '../globe'
import { getFaceNumber, getFaceTerrain } from './graph'
import type { FaceIndex, GameState, GlobeGraph, PlayerIndex, Resource, ResourceCounts } from './types'
import { RESOURCES, emptyResources } from './types'

/** Map each terrain type to the resource it produces (desert → null). */
const TERRAIN_RESOURCE: Partial<Record<string, Resource>> = {
  lumber: 'lumber',
  brick: 'brick',
  wool: 'wool',
  grain: 'grain',
  // No ore terrain in this globe variant
}

/**
 * Returns a per-player resource production map for the given dice total.
 * Does NOT apply bank limits — call applyBankCap() on the result.
 */
export function computeRawProduction(
  roll: number,
  state: GameState,
  layout: SerializableLayout,
  graph: GlobeGraph,
): Record<PlayerIndex, ResourceCounts> {
  const production: Record<PlayerIndex, ResourceCounts> = {}
  for (let p = 0; p < state.players.length; p++) {
    production[p] = emptyResources()
  }

  const totalFaces = graph.faceVertices.length // 32
  for (let fi = 0 as FaceIndex; fi < totalFaces; fi++) {
    if (fi === state.robberFace) continue

    const chip = getFaceNumber(fi, layout)
    if (chip !== roll) continue

    const terrain = getFaceTerrain(fi, layout)
    if (!terrain || terrain === 'desert') continue

    const resource = TERRAIN_RESOURCE[terrain]
    if (!resource) continue

    for (const v of graph.faceVertices[fi]!) {
      const building = state.buildings[v]
      if (!building) continue
      const amount = building.type === 'city' ? 2 : 1
      production[building.player]![resource] += amount
    }
  }

  return production
}

/**
 * Standard Catan bank-cap rule: if the bank cannot cover the total demand for
 * a resource, no player receives any of that resource this round.
 */
export function applyBankCap(
  production: Record<PlayerIndex, ResourceCounts>,
  bank: ResourceCounts,
): Record<PlayerIndex, ResourceCounts> {
  const capped: Record<PlayerIndex, ResourceCounts> = {}
  const playerCount = Object.keys(production).length

  for (let p = 0; p < playerCount; p++) {
    capped[p] = emptyResources()
  }

  for (const res of RESOURCES) {
    const total = Object.values(production).reduce((s, r) => s + (r as ResourceCounts)[res], 0)
    if (total > bank[res]) continue // bank can't cover — nobody gets it

    for (let p = 0; p < playerCount; p++) {
      capped[p]![res] = production[p]![res] ?? 0
    }
  }

  return capped
}

/** Convenience: compute and cap in one call. */
export function computeProduction(
  roll: number,
  state: GameState,
  layout: SerializableLayout,
  graph: GlobeGraph,
): Record<PlayerIndex, ResourceCounts> {
  return applyBankCap(computeRawProduction(roll, state, layout, graph), state.bank)
}
