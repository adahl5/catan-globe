import { describe, expect, it } from 'vitest'
import { buildGlobeGraph, HEX_FACE_OFFSET, getSouthPoleFaceIndex } from '../game/graph'
import { SOUTH_POLE_HEXAGON_INDEX } from '../globe'

describe('buildGlobeGraph', () => {
  const graph = buildGlobeGraph()

  it('returns the same cached instance on repeat calls', () => {
    expect(buildGlobeGraph()).toBe(graph)
  })

  it('has exactly 90 unique edges', () => {
    expect(graph.edges.length).toBe(90)
  })

  it('has exactly 32 faces', () => {
    expect(graph.faceVertices.length).toBe(32)
  })

  it('pentagons (faces 0-11) have 5 vertices each', () => {
    for (let i = 0; i < 12; i++) {
      expect(graph.faceVertices[i]!.length).toBe(5)
    }
  })

  it('hexagons (faces 12-31) have 6 vertices each', () => {
    for (let i = 12; i < 32; i++) {
      expect(graph.faceVertices[i]!.length).toBe(6)
    }
  })

  it('all vertex indices in edges are 0-59', () => {
    for (const [a, b] of graph.edges) {
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThan(60)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThan(60)
      expect(a).toBeLessThan(b) // canonical ordering
    }
  })

  it('each vertex is in exactly 3 faces', () => {
    for (let v = 0; v < 60; v++) {
      expect(graph.vertexToFaces[v]!.length).toBe(3)
    }
  })

  it('each vertex has exactly 3 adjacent vertices', () => {
    for (let v = 0; v < 60; v++) {
      expect(graph.vertexAdjacency[v]!.length).toBe(3)
    }
  })

  it('each vertex is incident on exactly 3 edges', () => {
    for (let v = 0; v < 60; v++) {
      expect(graph.vertexToEdges[v]!.length).toBe(3)
    }
  })

  it('each edge borders exactly 2 faces', () => {
    for (let e = 0; e < graph.edges.length; e++) {
      expect(graph.edgeToFaces[e]!.length).toBe(2)
    }
  })

  it('Euler characteristic V - E + F = 2', () => {
    const V = 60
    const E = graph.edges.length
    const F = graph.faceVertices.length
    expect(V - E + F).toBe(2)
  })

  it('edgeIndex map has 90 entries matching edges array', () => {
    expect(graph.edgeIndex.size).toBe(90)
    for (let e = 0; e < graph.edges.length; e++) {
      const [a, b] = graph.edges[e]!
      const key = `${Math.min(a, b)},${Math.max(a, b)}`
      expect(graph.edgeIndex.get(key)).toBe(e)
    }
  })

  it('getSouthPoleFaceIndex returns HEX_FACE_OFFSET + SOUTH_POLE_HEXAGON_INDEX', () => {
    expect(getSouthPoleFaceIndex()).toBe(HEX_FACE_OFFSET + SOUTH_POLE_HEXAGON_INDEX)
  })
})
