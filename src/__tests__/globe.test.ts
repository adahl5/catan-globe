import { describe, expect, it } from 'vitest'
import {
  defaultPoolCounts,
  poolTotal,
  expandPool,
  shuffleInPlace,
  assignPortsOnFaces,
  assignNumbersForLayout,
  assignFullLayout,
  globeLayoutValid,
  type PortSlot,
  PENTAGON_COUNT,
  HEXAGON_COUNT,
  PORT_COUNT,
  RESOURCE_FACE_COUNT,
  DESERT_FACE_COUNT,
  NUMBERED_FACE_COUNT,
  SOUTH_POLE_HEXAGON_INDEX,
} from '../globe'

const deterministicRandom = (() => {
  let seed = 42
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
})()

describe('globe constants', () => {
  it('counts are consistent', () => {
    expect(PENTAGON_COUNT).toBe(12)
    expect(HEXAGON_COUNT).toBe(20)
    expect(PORT_COUNT).toBe(7)
    expect(RESOURCE_FACE_COUNT).toBe(HEXAGON_COUNT + PENTAGON_COUNT - 1 - PORT_COUNT)
    expect(NUMBERED_FACE_COUNT).toBe(RESOURCE_FACE_COUNT - DESERT_FACE_COUNT)
  })

  it('south pole is excluded from playable faces', () => {
    expect(SOUTH_POLE_HEXAGON_INDEX).toBeGreaterThanOrEqual(0)
    expect(SOUTH_POLE_HEXAGON_INDEX).toBeLessThan(HEXAGON_COUNT)
  })
})

describe('poolTotal', () => {
  it('sums counts', () => {
    expect(poolTotal({ 2: 1, 3: 2, 4: 3 })).toBe(6)
  })

  it('handles missing values', () => {
    expect(poolTotal({})).toBe(0)
    expect(poolTotal({ 2: 0 })).toBe(0)
  })
})

describe('expandPool', () => {
  it('expands counts to array', () => {
    expect(expandPool({ 2: 2, 6: 1 })).toEqual([2, 2, 6])
  })

  it('handles empty', () => {
    expect(expandPool({})).toEqual([])
  })
})

describe('shuffleInPlace', () => {
  it('shuffles deterministically', () => {
    const arr = [1, 2, 3, 4, 5]
    shuffleInPlace(arr, deterministicRandom)
    expect(arr.sort()).toEqual([1, 2, 3, 4, 5])
  })
})

describe('assignPortsOnFaces', () => {
  it('places exactly PORT_COUNT ports', () => {
    const { pentPorts, hexPorts } = assignPortsOnFaces(deterministicRandom)
    const portCount =
      pentPorts.filter((p) => p !== null).length + hexPorts.filter((p) => p !== null).length
    expect(portCount).toBe(PORT_COUNT)
  })

  it('excludes south pole from ports', () => {
    const { hexPorts } = assignPortsOnFaces(deterministicRandom)
    expect(hexPorts[SOUTH_POLE_HEXAGON_INDEX]).toBe(null)
  })

  it('contains 2 generic and 5 specific ports', () => {
    const { pentPorts, hexPorts } = assignPortsOnFaces(deterministicRandom)
    const allPorts = [...pentPorts, ...hexPorts].filter((p): p is NonNullable<PortSlot> => p !== null)
    const generic = allPorts.filter((p) => p.kind === '3:1').length
    const specific = allPorts.filter((p) => p.kind === '2:1').length
    expect(generic).toBe(2)
    expect(specific).toBe(5)
  })
})

describe('globeLayoutValid', () => {
  it('accepts a valid layout', () => {
    const result = assignFullLayout(defaultPoolCounts(), deterministicRandom)
    expect(result).not.toBeNull()
    expect(
      globeLayoutValid(
        result!.pentTerrain,
        result!.hexTerrain,
        result!.pentPorts,
        result!.hexPorts,
      ),
    ).toBe(true)
  })

  it('rejects port and terrain on same face', () => {
    const pentPorts: (PortSlot | null)[] = Array(PENTAGON_COUNT).fill(null)
    pentPorts[0] = { kind: '3:1' }
    const pentTerrain = Array(PENTAGON_COUNT).fill('desert')
    const hexPorts: (PortSlot | null)[] = Array(HEXAGON_COUNT).fill(null)
    const hexTerrain = Array(HEXAGON_COUNT).fill('lumber')
    expect(globeLayoutValid(pentTerrain, hexTerrain, pentPorts, hexPorts)).toBe(false)
  })
})

describe('assignNumbersForLayout', () => {
  it('numbers all non-desert resource faces', () => {
    const result = assignFullLayout(defaultPoolCounts(), deterministicRandom)
    expect(result).not.toBeNull()

    const numberCount =
      result!.pentagons.filter((n) => n !== null).length +
      result!.hexagons.filter((n) => n !== null).length
    expect(numberCount).toBe(NUMBERED_FACE_COUNT)
  })

  it('fails with wrong pool total', () => {
    const result = assignFullLayout(defaultPoolCounts(), deterministicRandom)
    expect(result).not.toBeNull()
    const wrongPool = { 2: 1, 3: 1 }
    const nums = assignNumbersForLayout(
      wrongPool,
      result!.pentTerrain,
      result!.hexTerrain,
      result!.pentPorts,
      result!.hexPorts,
      deterministicRandom,
    )
    expect(nums).toBeNull()
  })
})

describe('assignFullLayout', () => {
  it('produces valid complete layout', () => {
    const result = assignFullLayout(defaultPoolCounts(), deterministicRandom)
    expect(result).not.toBeNull()
    expect(
      globeLayoutValid(
        result!.pentTerrain,
        result!.hexTerrain,
        result!.pentPorts,
        result!.hexPorts,
      ),
    ).toBe(true)
  })

  it('produces correct face counts', () => {
    const result = assignFullLayout(defaultPoolCounts(), deterministicRandom)!
    expect(result.pentTerrain.length).toBe(PENTAGON_COUNT)
    expect(result.hexTerrain.length).toBe(HEXAGON_COUNT)
    expect(result.pentPorts.length).toBe(PENTAGON_COUNT)
    expect(result.hexPorts.length).toBe(HEXAGON_COUNT)
    expect(result.pentagons.length).toBe(PENTAGON_COUNT)
    expect(result.hexagons.length).toBe(HEXAGON_COUNT)
  })
})