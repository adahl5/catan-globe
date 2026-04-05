import { getPoleHexagonIndices } from './truncatedIcosahedron'

/** Truncated icosahedron (soccer ball): 12 pentagonal + 20 hexagonal faces. */
export const PENTAGON_COUNT = 12
export const HEXAGON_COUNT = 20
export const FACE_COUNT = PENTAGON_COUNT + HEXAGON_COUNT

const _poles = getPoleHexagonIndices()
/** Hexagon index at the top (+Y); still carries a normal game tile. */
export const NORTH_POLE_HEXAGON_INDEX = _poles.north
/** Bottom (−Y) hexagon: no tile (globe mounting rod). Excluded from ports, terrain, and numbers. */
export const SOUTH_POLE_HEXAGON_INDEX = _poles.south

export const PORT_COUNT = 7
export const GENERIC_PORT_COUNT = 2
export const SPECIAL_PORT_COUNT = 5

/** Playable faces exclude the south-pole hexagon (rod mount, no tile). */
export const PLAYABLE_FACE_COUNT = FACE_COUNT - 1

/** Faces that carry resource terrain (the rest are port-only tiles among playable faces). */
export const RESOURCE_FACE_COUNT = PLAYABLE_FACE_COUNT - PORT_COUNT

/** Desert among resource faces only — no die chip. */
export const DESERT_FACE_COUNT = 3

/** Dice chips: each non-desert resource face (never on port-only faces). */
export const NUMBERED_FACE_COUNT = RESOURCE_FACE_COUNT - DESERT_FACE_COUNT

/** Production numbers only — 7 is the robber roll and is not placed on tiles. */
export const DICE_VALUES = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12] as const

export type HexTerrain = 'desert' | 'lumber' | 'grain' | 'brick' | 'wool'

/** Null on a face means that face is a port tile (no resource terrain). */
export type FaceTerrain = HexTerrain | null

/** Classic 2:1 maritime trades (ore included even when ore terrain is not on this globe). */
export const TWO_TO_ONE_RESOURCES = ['lumber', 'brick', 'grain', 'wool', 'ore'] as const
export type TwoToOneResource = (typeof TWO_TO_ONE_RESOURCES)[number]

export type PortSlot =
  | { kind: '3:1' }
  | { kind: '2:1'; resource: TwoToOneResource }

export const TERRAIN_LABELS: Record<HexTerrain, string> = {
  desert: 'Desert',
  lumber: 'Lumber',
  grain: 'Grain',
  brick: 'Brick',
  wool: 'Wool',
}

export const TRADE_RESOURCE_LABELS: Record<TwoToOneResource, string> = {
  lumber: 'Lumber',
  brick: 'Brick',
  grain: 'Grain',
  wool: 'Wool',
  ore: 'Ore',
}

/** Ways to roll each sum with two fair six-sided dice (for Catan-style pips). */
export const ROLL_WEIGHT: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
}

/** Terrain multiset for resource faces only (7 port-only faces on the playable shell; no south pole). */
const RESOURCE_TERRAIN_COUNTS: Record<HexTerrain, number> = {
  desert: DESERT_FACE_COUNT,
  lumber: 5,
  grain: 5,
  brick: 5,
  wool: 6,
}

/** Default multiset: one chip per numbered resource face (Catan-like weights, no 7). */
export function defaultPoolCounts(): Record<number, number> {
  return {
    2: 1,
    3: 3,
    4: 2,
    5: 3,
    6: 3,
    8: 2,
    9: 2,
    10: 2,
    11: 2,
    12: 1,
  }
}

export function poolTotal(counts: Record<number, number>): number {
  return DICE_VALUES.reduce((s, v) => s + (counts[v] ?? 0), 0)
}

export function expandPool(counts: Record<number, number>): number[] {
  const out: number[] = []
  for (const v of DICE_VALUES) {
    const n = counts[v] ?? 0
    for (let i = 0; i < n; i++) out.push(v)
  }
  return out
}

function expandResourceTerrainMultiset(): HexTerrain[] {
  const out: HexTerrain[] = []
  for (const t of Object.keys(RESOURCE_TERRAIN_COUNTS) as HexTerrain[]) {
    const n = RESOURCE_TERRAIN_COUNTS[t]
    for (let i = 0; i < n; i++) out.push(t)
  }
  return out
}

function terrainTalliesMatch(
  tallies: Record<HexTerrain, number>,
  expected: Record<HexTerrain, number>,
): boolean {
  return (Object.keys(expected) as HexTerrain[]).every((k) => tallies[k] === expected[k])
}

export function shuffleInPlace<T>(arr: T[], random: () => number = Math.random): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

export function assignPortsOnFaces(
  random: () => number = Math.random,
): {
  pentPorts: (PortSlot | null)[]
  hexPorts: (PortSlot | null)[]
} {
  const slots: PortSlot[] = [
    { kind: '3:1' },
    { kind: '3:1' },
    ...TWO_TO_ONE_RESOURCES.map((resource) => ({ kind: '2:1' as const, resource })),
  ]
  shuffleInPlace(slots, random)
  const pentPorts = Array.from({ length: PENTAGON_COUNT }, () => null as PortSlot | null)
  const hexPorts = Array.from({ length: HEXAGON_COUNT }, () => null as PortSlot | null)
  type FaceRef = { kind: 'pent'; i: number } | { kind: 'hex'; i: number }
  const order: FaceRef[] = [
    ...Array.from({ length: PENTAGON_COUNT }, (_, i) => ({ kind: 'pent' as const, i })),
    ...Array.from({ length: HEXAGON_COUNT }, (_, i) => ({ kind: 'hex' as const, i })).filter(
      (r) => r.i !== SOUTH_POLE_HEXAGON_INDEX,
    ),
  ]
  shuffleInPlace(order, random)
  for (let p = 0; p < PORT_COUNT; p++) {
    const ref = order[p]
    if (ref.kind === 'pent') pentPorts[ref.i] = slots[p]
    else hexPorts[ref.i] = slots[p]
  }
  return { pentPorts, hexPorts }
}

function assignTerrainOnResourceFaces(
  pentPorts: (PortSlot | null)[],
  hexPorts: (PortSlot | null)[],
  random: () => number = Math.random,
): { pentTerrain: FaceTerrain[]; hexTerrain: FaceTerrain[] } | null {
  const tiles = expandResourceTerrainMultiset()
  shuffleInPlace(tiles, random)
  let ti = 0
  const pentTerrain: FaceTerrain[] = pentPorts.map((port) => {
    if (port != null) return null
    return tiles[ti++]!
  })
  const hexTerrain: FaceTerrain[] = hexPorts.map((port, i) => {
    if (i === SOUTH_POLE_HEXAGON_INDEX) return null
    if (port != null) return null
    return tiles[ti++]!
  })
  if (ti !== tiles.length) return null
  return { pentTerrain, hexTerrain }
}

/** Port-only faces have null terrain; resource faces have terrain and null port on that same index. */
export function globeLayoutValid(
  pentTerrain: FaceTerrain[],
  hexTerrain: FaceTerrain[],
  pentPorts: (PortSlot | null)[],
  hexPorts: (PortSlot | null)[],
): boolean {
  if (
    pentTerrain.length !== PENTAGON_COUNT ||
    hexTerrain.length !== HEXAGON_COUNT ||
    pentPorts.length !== PENTAGON_COUNT ||
    hexPorts.length !== HEXAGON_COUNT
  ) {
    return false
  }
  let portTotal = 0
  const tallies: Record<HexTerrain, number> = {
    desert: 0,
    lumber: 0,
    grain: 0,
    brick: 0,
    wool: 0,
  }
  for (let i = 0; i < PENTAGON_COUNT; i++) {
    const port = pentPorts[i]
    const t = pentTerrain[i]
    if (port != null) {
      if (t != null) return false
      portTotal++
    } else {
      if (t == null) return false
      tallies[t]++
    }
  }
  for (let i = 0; i < HEXAGON_COUNT; i++) {
    const port = hexPorts[i]
    const t = hexTerrain[i]
    if (i === SOUTH_POLE_HEXAGON_INDEX) {
      if (port != null || t != null) return false
      continue
    }
    if (port != null) {
      if (t != null) return false
      portTotal++
    } else {
      if (t == null) return false
      tallies[t]++
    }
  }
  if (portTotal !== PORT_COUNT) return false
  return terrainTalliesMatch(tallies, RESOURCE_TERRAIN_COUNTS)
}

/**
 * Assigns dice numbers only to non-desert resource faces (skips port-only faces).
 */
export function assignNumbersForLayout(
  counts: Record<number, number>,
  pentTerrain: FaceTerrain[],
  hexTerrain: FaceTerrain[],
  pentPorts: (PortSlot | null)[],
  hexPorts: (PortSlot | null)[],
  random: () => number = Math.random,
): { pentagons: (number | null)[]; hexagons: (number | null)[] } | null {
  if (poolTotal(counts) !== NUMBERED_FACE_COUNT) return null
  if (!globeLayoutValid(pentTerrain, hexTerrain, pentPorts, hexPorts)) return null

  const pool = expandPool(counts)
  shuffleInPlace(pool, random)
  let ri = 0
  const pentagons = pentTerrain.map((terrain, i) => {
    if (pentPorts[i] != null) return null
    if (terrain === 'desert') return null
    return pool[ri++]!
  })
  const hexagons = hexTerrain.map((terrain, i) => {
    if (i === SOUTH_POLE_HEXAGON_INDEX) return null
    if (hexPorts[i] != null) return null
    if (terrain === 'desert') return null
    return pool[ri++]!
  })
  if (ri !== pool.length) return null
  return { pentagons, hexagons }
}

export function assignFullLayout(
  counts: Record<number, number>,
  random: () => number = Math.random,
): {
  pentTerrain: FaceTerrain[]
  hexTerrain: FaceTerrain[]
  pentPorts: (PortSlot | null)[]
  hexPorts: (PortSlot | null)[]
  pentagons: (number | null)[]
  hexagons: (number | null)[]
} | null {
  const { pentPorts, hexPorts } = assignPortsOnFaces(random)
  const terrain = assignTerrainOnResourceFaces(pentPorts, hexPorts, random)
  if (!terrain) return null
  const { pentTerrain, hexTerrain } = terrain
  const nums = assignNumbersForLayout(
    counts,
    pentTerrain,
    hexTerrain,
    pentPorts,
    hexPorts,
    random,
  )
  if (!nums) return null
  return { pentTerrain, hexTerrain, pentPorts, hexPorts, ...nums }
}

const STORAGE_KEY = 'round-catan-pool-v5'

export function loadPoolFromStorage(): Record<number, number> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, number>
    const next: Record<number, number> = {}
    for (const v of DICE_VALUES) {
      const c = Number(parsed[String(v)])
      next[v] = Number.isFinite(c) && c >= 0 ? Math.floor(c) : 0
    }
    return next
  } catch {
    return null
  }
}

export function savePoolToStorage(counts: Record<number, number>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(counts))
  } catch {
    /* ignore quota */
  }
}
