import { describe, expect, it } from 'vitest'
import { buildGlobeGraph } from '../game/graph'
import { computeLongestRoad } from '../game/longestRoad'

describe('computeLongestRoad', () => {
  const graph = buildGlobeGraph()

  it('returns 0 with no roads', () => {
    expect(computeLongestRoad([], new Set(), graph)).toBe(0)
  })

  it('returns 1 with a single road', () => {
    // Edge 0 connects two vertices
    expect(computeLongestRoad([0], new Set(), graph)).toBe(1)
  })

  it('computes a simple chain correctly', () => {
    // Build a chain of connected roads using real edges
    // Edge 0 connects vertices [a, b]; find an edge that also connects to a or b
    const [, v0b] = graph.edges[0]!
    // Find another edge incident on v0b that isn't edge 0
    const chainEdge = graph.vertexToEdges[v0b]!.find((e) => e !== 0)!
    expect(computeLongestRoad([0, chainEdge], new Set(), graph)).toBe(2)
  })

  it('opponent at a junction breaks the road', () => {
    const [, v0b] = graph.edges[0]!
    const chainEdge = graph.vertexToEdges[v0b]!.find((e) => e !== 0)!
    // With an opponent on the shared vertex, the chain is broken
    const opponentSet = new Set([v0b])
    // Can reach edge 0 as isolated road = 1, or chainEdge isolated = 1
    expect(computeLongestRoad([0, chainEdge], opponentSet, graph)).toBe(1)
  })

  it('finds longest path through a branch (not counting both branches)', () => {
    // Find a vertex with 3 incident edges
    const branchVertex = (() => {
      for (let v = 0; v < 60; v++) {
        if (graph.vertexToEdges[v]!.length === 3) return v
      }
      return -1
    })()
    expect(branchVertex).toBeGreaterThanOrEqual(0)

    // Use all 3 edges incident on branchVertex — best path can use at most 2 of them
    const edges = graph.vertexToEdges[branchVertex]!
    const length = computeLongestRoad(edges, new Set(), graph)
    // 3 roads at a branch: can traverse at most 2 without backtracking (longest = 2)
    expect(length).toBe(2)
  })
})
