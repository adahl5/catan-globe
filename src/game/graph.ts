/**
 * Computes the globe graph (edge/face/vertex topology) from the existing
 * truncated icosahedron geometry.  Cached at module level — same pattern as
 * getCachedFaceGeometries() in truncatedIcosahedron.ts.
 *
 * Face index convention (used throughout the game):
 *   0-11  → pentagons  (matches pentTerrain / pentPorts / pentagons arrays)
 *   12-31 → hexagons   (hexIdx = faceIndex - 12)
 */

import { SOUTH_POLE_HEXAGON_INDEX } from '../globe'
import { getTruncatedIcosahedron } from '../truncatedIcosahedron'
import type { FaceIndex, GlobeGraph, VertexIndex } from './types'
import type { FaceTerrain, PortSlot, SerializableLayout } from '../globe'

export const HEX_FACE_OFFSET = 12

let cachedGraph: GlobeGraph | null = null

export function buildGlobeGraph(): GlobeGraph {
  if (cachedGraph) return cachedGraph

  const { pentagonFaces, hexagonFaces } = getTruncatedIcosahedron()

  // Unified face list: 0-11 = pentagons, 12-31 = hexagons
  const faceVertices: VertexIndex[][] = [
    ...pentagonFaces,
    ...hexagonFaces,
  ]

  const VERTEX_COUNT = 60
  const edges: [VertexIndex, VertexIndex][] = []
  const edgeIndexMap = new Map<string, number>()
  const edgeToFaces: FaceIndex[][] = []
  const vertexToFaces: FaceIndex[][] = Array.from({ length: VERTEX_COUNT }, () => [])
  const vertexToEdges: number[][] = Array.from({ length: VERTEX_COUNT }, () => [])
  const vertexAdjacency: VertexIndex[][] = Array.from({ length: VERTEX_COUNT }, () => [])

  for (let fi = 0; fi < faceVertices.length; fi++) {
    const verts = faceVertices[fi]!
    const n = verts.length

    // Each vertex belongs to this face
    for (const v of verts) {
      vertexToFaces[v]!.push(fi)
    }

    // Collect the face's edges (consecutive vertex pairs, wrapping)
    for (let i = 0; i < n; i++) {
      const a = verts[i]!
      const b = verts[(i + 1) % n]!
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      const key = `${lo},${hi}`

      if (edgeIndexMap.has(key)) {
        // Second face that shares this edge
        edgeToFaces[edgeIndexMap.get(key)!]!.push(fi)
      } else {
        // New unique edge
        const ei = edges.length
        edges.push([lo, hi])
        edgeIndexMap.set(key, ei)
        edgeToFaces.push([fi])
        vertexToEdges[lo]!.push(ei)
        vertexToEdges[hi]!.push(ei)
        vertexAdjacency[lo]!.push(hi)
        vertexAdjacency[hi]!.push(lo)
      }
    }
  }

  cachedGraph = {
    edges,
    edgeIndex: edgeIndexMap,
    edgeToFaces,
    faceVertices,
    vertexToFaces,
    vertexToEdges,
    vertexAdjacency,
  }
  return cachedGraph
}

/** Unified face index of the south pole hexagon (excluded from play). */
export function getSouthPoleFaceIndex(): FaceIndex {
  return HEX_FACE_OFFSET + SOUTH_POLE_HEXAGON_INDEX
}

/** Terrain of a face by unified face index. */
export function getFaceTerrain(fi: FaceIndex, layout: SerializableLayout): FaceTerrain {
  if (fi < HEX_FACE_OFFSET) return layout.pentTerrain[fi] ?? null
  return layout.hexTerrain[fi - HEX_FACE_OFFSET] ?? null
}

/** Number chip of a face by unified face index. */
export function getFaceNumber(fi: FaceIndex, layout: SerializableLayout): number | null {
  if (fi < HEX_FACE_OFFSET) return layout.pentagons[fi] ?? null
  return layout.hexagons[fi - HEX_FACE_OFFSET] ?? null
}

/** Port of a face by unified face index. */
export function getFacePort(fi: FaceIndex, layout: SerializableLayout): PortSlot | null {
  if (fi < HEX_FACE_OFFSET) return layout.pentPorts[fi] ?? null
  return layout.hexPorts[fi - HEX_FACE_OFFSET] ?? null
}

/** All face indices where terrain === 'desert'. */
export function getDesertFaceIndices(layout: SerializableLayout): FaceIndex[] {
  const result: FaceIndex[] = []
  layout.pentTerrain.forEach((t, i) => {
    if (t === 'desert') result.push(i)
  })
  layout.hexTerrain.forEach((t, i) => {
    if (t === 'desert') result.push(i + HEX_FACE_OFFSET)
  })
  return result
}
