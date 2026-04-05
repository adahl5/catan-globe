import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'

/**
 * Unit truncated icosahedron from the canonical icosahedron (three.js vertex order)
 * by truncating each original vertex at 1/3 along incident edges — 60 vertices, 12 pentagons, 20 hexagons.
 */
const PHI = (1 + Math.sqrt(5)) / 2

/** Icosahedron vertices on the unit sphere (same order as THREE.IcosahedronGeometry). */
const ICOSA_VERTS: [number, number, number][] = [
  [-1, PHI, 0],
  [1, PHI, 0],
  [-1, -PHI, 0],
  [1, -PHI, 0],
  [0, -1, PHI],
  [0, 1, PHI],
  [0, -1, -PHI],
  [0, 1, -PHI],
  [PHI, 0, -1],
  [PHI, 0, 1],
  [-PHI, 0, -1],
  [-PHI, 0, 1],
]

/** Triangle indices (20 faces), matching THREE.IcosahedronGeometry. */
const ICOSA_TRI = [
  0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3,
  4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
] as const

function normalizedIcosahedronVertices(): Vector3[] {
  return ICOSA_VERTS.map(([x, y, z]) => new Vector3(x, y, z).normalize())
}

function uniqueEdgesFromTriangles(tri: readonly number[]): string[] {
  const set = new Set<string>()
  const add = (a: number, b: number) => set.add(a < b ? `${a},${b}` : `${b},${a}`)
  for (let i = 0; i < tri.length; i += 3) {
    add(tri[i], tri[i + 1])
    add(tri[i + 1], tri[i + 2])
    add(tri[i + 2], tri[i])
  }
  return [...set].sort()
}

export type TruncatedIcosahedronData = {
  /** 60 vertex positions (truncated solid, not on unit sphere). */
  vertices: Vector3[]
  /** 12 pentagonal faces — indices into `vertices`; order matches icosahedron vertex 0..11. */
  pentagonFaces: readonly number[][]
  /** 20 hexagonal faces — indices into `vertices`; order matches `ICOSA_TRI` face order. */
  hexagonFaces: readonly number[][]
}

let cached: TruncatedIcosahedronData | null = null

export function getTruncatedIcosahedron(): TruncatedIcosahedronData {
  if (cached) return cached

  const base = normalizedIcosahedronVertices()
  const edges = uniqueEdgesFromTriangles(ICOSA_TRI)

  const edgeMap = new Map<
    string,
    { nearLoIdx: number; nearHiIdx: number }
  >()
  const vertices: Vector3[] = []

  for (const e of edges) {
    const [lo, hi] = e.split(',').map(Number) as [number, number]
    const A = base[lo]
    const B = base[hi]
    const nearLo = A.clone().lerp(B, 1 / 3)
    const nearHi = B.clone().lerp(A, 1 / 3)
    const nearLoIdx = vertices.length
    const nearHiIdx = vertices.length + 1
    vertices.push(nearLo, nearHi)
    edgeMap.set(e, { nearLoIdx, nearHiIdx })
  }

  function truncNear(v: number, u: number): number {
    const k = v < u ? `${v},${u}` : `${u},${v}`
    const { nearLoIdx, nearHiIdx } = edgeMap.get(k)!
    return v < u ? nearLoIdx : nearHiIdx
  }

  const neighbors: number[][] = Array.from({ length: 12 }, () => [])
  for (const e of edges) {
    const [i, j] = e.split(',').map(Number)
    neighbors[i].push(j)
    neighbors[j].push(i)
  }

  const t1 = new Vector3()
  const t2 = new Vector3()
  function orderNeighbors(v: number, neigh: number[]): number[] {
    const center = base[v]
    const n = center.clone().normalize()
    const arbitrary = Math.abs(n.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)
    t1.crossVectors(arbitrary, n).normalize()
    t2.crossVectors(n, t1).normalize()
    return [...neigh].sort((a, b) => {
      const va = base[a].clone().sub(center)
      const vb = base[b].clone().sub(center)
      return Math.atan2(va.dot(t2), va.dot(t1)) - Math.atan2(vb.dot(t2), vb.dot(t1))
    })
  }

  const pentagonFaces: number[][] = []
  for (let v = 0; v < 12; v++) {
    const ord = orderNeighbors(v, neighbors[v])
    pentagonFaces.push(ord.map((u) => truncNear(v, u)))
  }

  const hexagonFaces: number[][] = []
  for (let i = 0; i < ICOSA_TRI.length; i += 3) {
    const a = ICOSA_TRI[i]
    const b = ICOSA_TRI[i + 1]
    const c = ICOSA_TRI[i + 2]
    hexagonFaces.push([
      truncNear(a, b),
      truncNear(b, a),
      truncNear(b, c),
      truncNear(c, b),
      truncNear(c, a),
      truncNear(a, c),
    ])
  }

  cached = { vertices, pentagonFaces, hexagonFaces }
  return cached
}

/** Triangle-fan geometry from coplanar 3D vertices (one shared vertex = centroid). */
export function createFaceGeometry(indices: readonly number[], verts: readonly Vector3[]): BufferGeometry {
  const pts = indices.map((i) => verts[i])
  const centroid = pts.reduce((acc, p) => acc.add(p.clone()), new Vector3()).multiplyScalar(1 / pts.length)

  const positions: number[] = []
  const n = pts.length
  // n triangles with wrap; i=1..n-2 omits wedges through p_0.
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    positions.push(
      centroid.x,
      centroid.y,
      centroid.z,
      pts[i].x,
      pts[i].y,
      pts[i].z,
      pts[j].x,
      pts[j].y,
      pts[j].z,
    )
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  return geo
}

export function faceCentroid(indices: readonly number[], verts: readonly Vector3[]): Vector3 {
  return indices
    .reduce((acc, i) => acc.add(verts[i].clone()), new Vector3())
    .multiplyScalar(1 / indices.length)
}

export function faceOutwardNormal(
  indices: readonly number[],
  verts: readonly Vector3[],
  centroid: Vector3,
): Vector3 {
  const pts = indices.map((i) => verts[i])
  const n = new Vector3()
    .crossVectors(new Vector3().subVectors(pts[1], pts[0]), new Vector3().subVectors(pts[2], pts[0]))
    .normalize()
  if (n.dot(centroid) < 0) n.negate()
  return n
}

type CachedFaceGeometries = {
  pent: BufferGeometry[]
  hex: BufferGeometry[]
}

let geometryCache: CachedFaceGeometries | null = null

export function getCachedFaceGeometries(): CachedFaceGeometries {
  if (geometryCache) return geometryCache
  const { vertices, pentagonFaces, hexagonFaces } = getTruncatedIcosahedron()
  geometryCache = {
    pent: pentagonFaces.map((idx) => createFaceGeometry(idx, vertices)),
    hex: hexagonFaces.map((idx) => createFaceGeometry(idx, vertices)),
  }
  return geometryCache
}

let poleHexagonIndices: { north: number; south: number } | null = null

/**
 * Hexagonal faces whose outward normals align most with +Y (north) and −Y (south).
 * Ties use the smallest hex index (geometry has two symmetric candidates per pole).
 */
export function getPoleHexagonIndices(): { north: number; south: number } {
  if (poleHexagonIndices) return poleHexagonIndices
  const { vertices, hexagonFaces } = getTruncatedIcosahedron()
  const ny = hexagonFaces.map((f) => {
    const c = faceCentroid(f, vertices)
    return faceOutwardNormal(f, vertices, c).y
  })
  const north = ny.reduce((best, y, i) => (y > ny[best]! || (y === ny[best] && i < best) ? i : best), 0)
  const south = ny.reduce((best, y, i) => (y < ny[best]! || (y === ny[best] && i < best) ? i : best), 0)
  poleHexagonIndices = { north, south }
  return poleHexagonIndices
}
