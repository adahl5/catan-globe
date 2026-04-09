/**
 * Interactive 3D globe for game mode.
 *
 * Renders:
 *  - Terrain face meshes with number/port labels (same visual as GlobeVisualization)
 *  - Settlement and city markers at vertex positions
 *  - Road markers on edges
 *  - Robber marker on the robber face centroid
 *  - Semi-transparent click targets for valid settlement/road/city/robber placements
 */

import { Edges, Html, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { Quaternion, Vector3 } from 'three'
import {
  NORTH_POLE_HEXAGON_INDEX,
  ROLL_WEIGHT,
  SOUTH_POLE_HEXAGON_INDEX,
  TRADE_RESOURCE_LABELS,
  type FaceTerrain,
  type HexTerrain,
  type PortSlot,
} from '../globe'
import {
  faceCentroid,
  faceOutwardNormal,
  getCachedFaceGeometries,
  getTruncatedIcosahedron,
} from '../truncatedIcosahedron'
import type { EdgeIndex, FaceIndex, GameState, GlobeGraph, PlayerColor, VertexIndex } from '../game/types'
import type { SerializableLayout } from '../globe'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GLOBE_SCALE = 2.35
const FACING_MIN_DOT = 0.18

const TERRAIN_HEX: Record<HexTerrain, string> = {
  desert: '#c4a574',
  lumber: '#166534',
  grain: '#a16207',
  brick: '#991b1b',
  wool: '#57534e',
}
const EMPTY_HEX = '#334155'
const PORT_TILE_HEX = '#0c4a6e'
const EDGE_COLOR = '#1e293b'

const PLAYER_COLORS: Record<PlayerColor, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  orange: '#f97316',
  white: '#e2e8f0',
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface GameGlobeProps {
  layout: SerializableLayout
  state: GameState
  graph: GlobeGraph
  /** Vertex indices that are valid / highlighted for the current action */
  validVertices: VertexIndex[]
  /** Edge indices that are valid / highlighted for the current action */
  validEdges: EdgeIndex[]
  onVertexClick: (v: VertexIndex) => void
  onEdgeClick: (e: EdgeIndex) => void
  /** Called when a face is clicked (during robber move phase) */
  onFaceClick: (f: FaceIndex) => void
  robberClickable: boolean
}

// ---------------------------------------------------------------------------
// Label helpers (same as GlobeVisualization)
// ---------------------------------------------------------------------------

const _tmpWorld = new Vector3()
const _tmpCam = new Vector3()

function FacingLabelDomSink({
  domRef,
  centroid,
  normal,
}: {
  domRef: RefObject<HTMLDivElement | null>
  centroid: Vector3
  normal: Vector3
}) {
  const { camera } = useThree()
  useFrame(() => {
    const el = domRef.current
    if (!el) return
    _tmpWorld.copy(centroid).multiplyScalar(GLOBE_SCALE)
    _tmpCam.subVectors(camera.position, _tmpWorld).normalize()
    const facing = normal.dot(_tmpCam) > FACING_MIN_DOT
    el.style.display = facing ? '' : 'none'
  })
  return null
}

function FacingHtml({
  centroid,
  normal,
  position,
  children,
}: {
  centroid: Vector3
  normal: Vector3
  position: [number, number, number]
  children: ReactNode
}) {
  const domRef = useRef<HTMLDivElement>(null)
  return (
    <group>
      <Html ref={domRef} position={position} center distanceFactor={5.2} style={{ pointerEvents: 'none' }}>
        {children}
      </Html>
      <FacingLabelDomSink domRef={domRef} centroid={centroid} normal={normal} />
    </group>
  )
}

function isHighYield(n: number) {
  return n === 6 || n === 8
}

function portLabel(slot: PortSlot): string {
  if (slot.kind === '3:1') return '3:1'
  return `2:1 ${TRADE_RESOURCE_LABELS[slot.resource].slice(0, 1)}`
}

function FaceLabelStack({
  value,
  terrain,
  port,
  pole,
}: {
  value: number | null
  terrain: FaceTerrain
  port: PortSlot | null | undefined
  pole?: 'north' | 'south' | null
}) {
  if (pole === 'south') {
    return (
      <div className="globe-viz__labels globe-viz__labels--pole">
        <span className="globe-viz__pole globe-viz__pole--south">South</span>
      </div>
    )
  }
  const showRobber = terrain === 'desert' && value == null
  return (
    <div className="globe-viz__labels">
      {pole === 'north' && <span className="globe-viz__pole globe-viz__pole--north">North</span>}
      {value != null && (
        <span
          className={`globe-viz__chip ${isHighYield(value) ? 'globe-viz__chip--hot' : ''}`}
          title={`${ROLL_WEIGHT[value] ?? 0} ways to roll ${value}`}
        >
          <span className="globe-viz__chip-value">{value}</span>
          <span className="globe-viz__chip-pips" aria-hidden>
            {'●'.repeat(ROLL_WEIGHT[value] ?? 0)}
          </span>
        </span>
      )}
      {showRobber && <span className="globe-viz__robber">Desert</span>}
      {port ? (
        <span
          className={`globe-viz__port ${
            port.kind === '2:1' ? `globe-viz__port--${port.resource}` : 'globe-viz__port--any'
          }`}
        >
          {portLabel(port)}
        </span>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Background (respects dark/light mode)
// ---------------------------------------------------------------------------

function OpaqueBackground() {
  const [bgHex, setBgHex] = useState(
    () => (window.matchMedia('(prefers-color-scheme: dark)').matches ? '#1f2028' : '#f4f3ec'),
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => setBgHex(mq.matches ? '#1f2028' : '#f4f3ec')
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return <color attach="background" args={[bgHex]} />
}

// ---------------------------------------------------------------------------
// Main scene
// ---------------------------------------------------------------------------

function GameScene({
  layout,
  state,
  graph,
  validVertices,
  validEdges,
  onVertexClick,
  onEdgeClick,
  onFaceClick,
  robberClickable,
}: GameGlobeProps) {
  const { vertices, pentagonFaces, hexagonFaces } = useMemo(() => getTruncatedIcosahedron(), [])
  const { pent: pentGeoms, hex: hexGeoms } = useMemo(() => getCachedFaceGeometries(), [])

  const pentMeta = useMemo(
    () =>
      pentagonFaces.map((indices) => {
        const c = faceCentroid(indices, vertices)
        const n = faceOutwardNormal(indices, vertices, c)
        return { centroid: c, normal: n }
      }),
    [pentagonFaces, vertices],
  )
  const hexMeta = useMemo(
    () =>
      hexagonFaces.map((indices) => {
        const c = faceCentroid(indices, vertices)
        const n = faceOutwardNormal(indices, vertices, c)
        return { centroid: c, normal: n }
      }),
    [hexagonFaces, vertices],
  )

  const labelOffset = 0.055

  // -------------------------------------------------------------------------
  // Valid vertex positions (lifted slightly above surface)
  // -------------------------------------------------------------------------
  const vertexPositions = useMemo(
    () =>
      vertices.map((v) => {
        const dir = v.clone().normalize()
        return dir.multiplyScalar(v.length() * 1.08)
      }),
    [vertices],
  )

  // -------------------------------------------------------------------------
  // Edge road geometry helpers
  // -------------------------------------------------------------------------
  const edgeData = useMemo(
    () =>
      graph.edges.map(([a, b]) => {
        const pA = vertices[a]!.clone().normalize().multiplyScalar(vertices[a]!.length())
        const pB = vertices[b]!.clone().normalize().multiplyScalar(vertices[b]!.length())
        const mid = pA.clone().add(pB).multiplyScalar(0.5)
        const midNorm = mid.clone().normalize().multiplyScalar(mid.length() * 1.04)
        const dir = pB.clone().sub(pA).normalize()
        const q = new Quaternion().setFromUnitVectors(new Vector3(1, 0, 0), dir)
        const len = pA.distanceTo(pB) * 0.8
        return { mid: midNorm, q, len }
      }),
    [graph.edges, vertices],
  )

  return (
    <group scale={GLOBE_SCALE}>
      <ambientLight intensity={0.62} />
      <directionalLight position={[6, 10, 7]} intensity={0.95} color="#ffffff" />
      <directionalLight position={[-5, -4, -8]} intensity={0.28} color="#a8c0e8" />

      {/* ----------------------------------------------------------------- */}
      {/* Pentagon face meshes                                               */}
      {/* ----------------------------------------------------------------- */}
      {pentGeoms.map((geom, i) => {
        const terrain = layout.pentTerrain[i] ?? null
        const v = layout.pentagons[i] ?? null
        const port = layout.pentPorts[i] ?? null
        const { centroid, normal } = pentMeta[i]!
        const pos = centroid.clone().addScaledVector(normal, labelOffset)
        const color = terrain != null ? TERRAIN_HEX[terrain] : port != null ? PORT_TILE_HEX : EMPTY_HEX
        const showHtml = v != null || terrain === 'desert' || port != null
        const faceIdx: FaceIndex = i

        // Robber indicator
        const isRobber = state.robberFace === faceIdx
        const isRobberTarget = robberClickable && !isRobber && faceIdx !== -1

        return (
          <group key={`pent-${i}`}>
            <mesh
              geometry={geom}
              onClick={
                isRobberTarget
                  ? (e) => {
                      e.stopPropagation()
                      onFaceClick(faceIdx)
                    }
                  : undefined
              }
            >
              <meshStandardMaterial
                color={isRobber ? '#4b0082' : color}
                roughness={0.52}
                metalness={0.06}
              />
              <Edges color={EDGE_COLOR} threshold={12} />
            </mesh>
            {showHtml && (
              <FacingHtml
                centroid={centroid}
                normal={normal}
                position={pos.toArray() as [number, number, number]}
              >
                <FaceLabelStack value={v} terrain={terrain} port={port} />
              </FacingHtml>
            )}
          </group>
        )
      })}

      {/* ----------------------------------------------------------------- */}
      {/* Hexagon face meshes                                                */}
      {/* ----------------------------------------------------------------- */}
      {hexGeoms.map((geom, i) => {
        const terrain = layout.hexTerrain[i] ?? null
        const v = layout.hexagons[i] ?? null
        const port = layout.hexPorts[i] ?? null
        const { centroid, normal } = hexMeta[i]!
        const pos = centroid.clone().addScaledVector(normal, labelOffset)
        const isSouthPole = i === SOUTH_POLE_HEXAGON_INDEX
        const isNorthPole = i === NORTH_POLE_HEXAGON_INDEX
        const pole = isSouthPole ? 'south' : isNorthPole ? 'north' : null
        const color = terrain != null ? TERRAIN_HEX[terrain] : port != null ? PORT_TILE_HEX : EMPTY_HEX
        const showHtml = isSouthPole || isNorthPole || v != null || terrain === 'desert' || port != null
        const faceIdx: FaceIndex = 12 + i

        const isRobber = state.robberFace === faceIdx
        const isRobberTarget = robberClickable && !isRobber && !isSouthPole

        return (
          <group key={`hex-${i}`}>
            <mesh
              geometry={geom}
              onClick={
                isRobberTarget
                  ? (e) => {
                      e.stopPropagation()
                      onFaceClick(faceIdx)
                    }
                  : undefined
              }
            >
              {isSouthPole ? (
                <meshStandardMaterial color={EMPTY_HEX} transparent opacity={0.22} />
              ) : (
                <meshStandardMaterial
                  color={isRobber ? '#4b0082' : color}
                  roughness={0.5}
                  metalness={0.05}
                />
              )}
              <Edges color={EDGE_COLOR} threshold={12} />
            </mesh>
            {showHtml && (
              <FacingHtml
                centroid={centroid}
                normal={normal}
                position={pos.toArray() as [number, number, number]}
              >
                <FaceLabelStack value={v} terrain={terrain} port={port} pole={pole} />
              </FacingHtml>
            )}
          </group>
        )
      })}

      {/* ----------------------------------------------------------------- */}
      {/* Roads                                                               */}
      {/* ----------------------------------------------------------------- */}
      {Object.entries(state.roads).map(([eiStr, playerIdx]) => {
        const ei = Number(eiStr)
        const { mid, q, len } = edgeData[ei]!
        const player = state.players[playerIdx]!
        return (
          <mesh key={`road-${ei}`} position={mid.toArray() as [number, number, number]} quaternion={q}>
            <boxGeometry args={[len, 0.025, 0.018]} />
            <meshStandardMaterial color={PLAYER_COLORS[player.color]} />
          </mesh>
        )
      })}

      {/* ----------------------------------------------------------------- */}
      {/* Valid road highlights                                              */}
      {/* ----------------------------------------------------------------- */}
      {validEdges.map((ei) => {
        const { mid, q, len } = edgeData[ei]!
        return (
          <mesh
            key={`road-hint-${ei}`}
            position={mid.toArray() as [number, number, number]}
            quaternion={q}
            onClick={(e) => {
              e.stopPropagation()
              onEdgeClick(ei)
            }}
          >
            <boxGeometry args={[len, 0.03, 0.022]} />
            <meshStandardMaterial color="#fbbf24" transparent opacity={0.7} />
          </mesh>
        )
      })}

      {/* ----------------------------------------------------------------- */}
      {/* Settlements and cities                                             */}
      {/* ----------------------------------------------------------------- */}
      {Object.entries(state.buildings).map(([vStr, building]) => {
        const vi = Number(vStr)
        const pos = vertexPositions[vi]!
        const player = state.players[building.player]!
        const color = PLAYER_COLORS[player.color]
        return (
          <mesh key={`bld-${vi}`} position={pos.toArray() as [number, number, number]}>
            {building.type === 'settlement' ? (
              <sphereGeometry args={[0.038, 10, 8]} />
            ) : (
              <boxGeometry args={[0.062, 0.062, 0.062]} />
            )}
            <meshStandardMaterial color={color} roughness={0.4} metalness={0.1} />
          </mesh>
        )
      })}

      {/* ----------------------------------------------------------------- */}
      {/* Valid settlement / city vertex highlights                          */}
      {/* ----------------------------------------------------------------- */}
      {validVertices.map((vi) => {
        const pos = vertexPositions[vi]!
        const isCity = state.buildings[vi]?.type === 'settlement' // upgrading to city
        return (
          <mesh
            key={`hint-${vi}`}
            position={pos.toArray() as [number, number, number]}
            onClick={(e) => {
              e.stopPropagation()
              onVertexClick(vi)
            }}
          >
            {isCity ? (
              <boxGeometry args={[0.07, 0.07, 0.07]} />
            ) : (
              <sphereGeometry args={[0.048, 10, 8]} />
            )}
            <meshStandardMaterial color="#fef08a" transparent opacity={0.75} />
          </mesh>
        )
      })}

      {/* ----------------------------------------------------------------- */}
      {/* Robber marker                                                      */}
      {/* ----------------------------------------------------------------- */}
      <RobberMarker state={state} vertices={vertices} pentagonFaces={pentagonFaces} hexagonFaces={hexagonFaces} />

      <OrbitControls enablePan={false} minDistance={3.2} maxDistance={9} makeDefault />
    </group>
  )
}

// ---------------------------------------------------------------------------
// Robber marker
// ---------------------------------------------------------------------------

function RobberMarker({
  state,
  vertices,
  pentagonFaces,
  hexagonFaces,
}: {
  state: GameState
  vertices: Vector3[]
  pentagonFaces: readonly number[][]
  hexagonFaces: readonly number[][]
}) {
  const pos = useMemo(() => {
    const fi = state.robberFace
    const faceVerts = fi < 12 ? pentagonFaces[fi]! : hexagonFaces[fi - 12]!
    const c = faceCentroid(faceVerts, vertices)
    return c.clone().normalize().multiplyScalar(c.length() * 1.18).toArray() as [number, number, number]
  }, [state.robberFace, vertices, pentagonFaces, hexagonFaces])

  return (
    <mesh position={pos}>
      <cylinderGeometry args={[0.022, 0.032, 0.1, 8]} />
      <meshStandardMaterial color="#1e1b4b" roughness={0.6} />
    </mesh>
  )
}

// ---------------------------------------------------------------------------
// Exported wrapper
// ---------------------------------------------------------------------------

export function GameGlobeScene(props: GameGlobeProps) {
  return (
    <div className="game-globe" aria-label="Interactive 3D Catan globe">
      <Suspense fallback={<div className="globe-viz__loading">Loading 3D view…</div>}>
        <Canvas
          camera={{ position: [0, 0.35, 4.2], fov: 45, near: 0.1, far: 100 }}
          gl={{ antialias: true, alpha: false }}
          dpr={[1, 2]}
        >
          <OpaqueBackground />
          <GameScene {...props} />
        </Canvas>
      </Suspense>
      <p className="globe-viz__hint">Drag to rotate · scroll to zoom</p>
    </div>
  )
}
