import { Edges, Html, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useMemo } from 'react'
import {
  ROLL_WEIGHT,
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

type Props = {
  pentagons: (number | null)[]
  hexagons: (number | null)[]
  pentTerrain: FaceTerrain[] | null
  hexTerrain: FaceTerrain[] | null
  pentPorts: (PortSlot | null)[] | null
  hexPorts: (PortSlot | null)[] | null
}

const TERRAIN_HEX: Record<HexTerrain, string> = {
  desert: '#c4a574',
  lumber: '#166534',
  grain: '#a16207',
  brick: '#991b1b',
  wool: '#57534e',
}

const EMPTY_HEX = '#334155'
/** Port-only faces (no resource terrain) */
const PORT_TILE_HEX = '#0c4a6e'
const EDGE_COLOR = '#1e293b'

function isHighYield(n: number): boolean {
  return n === 6 || n === 8
}

function portLabel(slot: PortSlot): string {
  if (slot.kind === '3:1') return '3:1'
  return `2:1 ${TRADE_RESOURCE_LABELS[slot.resource].slice(0, 1)}`
}

type LabelStackProps = {
  value: number | null
  terrain: FaceTerrain
  port: PortSlot | null | undefined
}

function FaceLabelStack({ value, terrain, port }: LabelStackProps) {
  const showRobber = terrain === 'desert' && value == null
  return (
    <div className="globe-viz__labels">
      {value != null && (
        <span
          className={`globe-viz__chip ${isHighYield(value) ? 'globe-viz__chip--hot' : ''}`}
          title={`${ROLL_WEIGHT[value] ?? 0} way${ROLL_WEIGHT[value] === 1 ? '' : 's'} to roll ${value}`}
        >
          <span className="globe-viz__chip-value">{value}</span>
          <span className="globe-viz__chip-pips" aria-hidden>
            {'●'.repeat(ROLL_WEIGHT[value] ?? 0)}
          </span>
        </span>
      )}
      {showRobber && <span className="globe-viz__robber">Robber</span>}
      {port ? (
        <span
          className={`globe-viz__port ${port.kind === '2:1' ? `globe-viz__port--${port.resource}` : 'globe-viz__port--any'}`}
        >
          {portLabel(port)}
        </span>
      ) : null}
    </div>
  )
}

function GlobeScene({ pentagons, hexagons, pentTerrain, hexTerrain, pentPorts, hexPorts }: Props) {
  const { vertices, pentagonFaces, hexagonFaces } = useMemo(() => getTruncatedIcosahedron(), [])
  const { pent: pentGeoms, hex: hexGeoms } = useMemo(() => getCachedFaceGeometries(), [])

  const pentMeta = useMemo(
    () =>
      pentagonFaces.map((indices) => {
        const centroid = faceCentroid(indices, vertices)
        const normal = faceOutwardNormal(indices, vertices, centroid)
        return { centroid, normal }
      }),
    [pentagonFaces, vertices],
  )

  const hexMeta = useMemo(
    () =>
      hexagonFaces.map((indices) => {
        const centroid = faceCentroid(indices, vertices)
        const normal = faceOutwardNormal(indices, vertices, centroid)
        return { centroid, normal }
      }),
    [hexagonFaces, vertices],
  )

  const labelOffset = 0.055

  return (
    <group scale={2.35}>
      <ambientLight intensity={0.62} />
      <directionalLight position={[6, 10, 7]} intensity={0.95} color="#ffffff" />
      <directionalLight position={[-5, -4, -8]} intensity={0.28} color="#a8c0e8" />

      {pentGeoms.map((geom, i) => {
        const terrain = pentTerrain?.[i] ?? null
        const v = pentagons[i] ?? null
        const port = pentPorts?.[i] ?? null
        const { centroid, normal } = pentMeta[i]!
        const pos = centroid.clone().addScaledVector(normal, labelOffset)
        const color =
          terrain != null ? TERRAIN_HEX[terrain] : port != null ? PORT_TILE_HEX : EMPTY_HEX
        const showHtml = v != null || terrain === 'desert' || port != null

        return (
          <group key={`pent-${i}`}>
            <mesh geometry={geom}>
              <meshStandardMaterial color={color} roughness={0.52} metalness={0.06} />
              <Edges color={EDGE_COLOR} threshold={12} />
            </mesh>
            {showHtml && (
              <Html position={pos.toArray()} center distanceFactor={5.2} style={{ pointerEvents: 'none' }}>
                <FaceLabelStack value={v} terrain={terrain} port={port} />
              </Html>
            )}
          </group>
        )
      })}

      {hexGeoms.map((geom, i) => {
        const terrain = hexTerrain?.[i] ?? null
        const v = hexagons[i] ?? null
        const port = hexPorts?.[i] ?? null
        const { centroid, normal } = hexMeta[i]!
        const pos = centroid.clone().addScaledVector(normal, labelOffset)
        const color =
          terrain != null ? TERRAIN_HEX[terrain] : port != null ? PORT_TILE_HEX : EMPTY_HEX
        const showHtml = v != null || terrain === 'desert' || port != null

        return (
          <group key={`hex-${i}`}>
            <mesh geometry={geom}>
              <meshStandardMaterial color={color} roughness={0.5} metalness={0.05} />
              <Edges color={EDGE_COLOR} threshold={12} />
            </mesh>
            {showHtml && (
              <Html position={pos.toArray()} center distanceFactor={5.2} style={{ pointerEvents: 'none' }}>
                <FaceLabelStack value={v} terrain={terrain} port={port} />
              </Html>
            )}
          </group>
        )
      })}

      <OrbitControls enablePan={false} minDistance={3.2} maxDistance={9} makeDefault />
    </group>
  )
}

export function GlobeVisualization(props: Props) {
  return (
    <div className="globe-viz" aria-label="Interactive 3D truncated icosahedron layout">
      <Suspense fallback={<div className="globe-viz__loading">Loading 3D view…</div>}>
        <Canvas
          camera={{ position: [0, 0.35, 4.2], fov: 45, near: 0.1, far: 100 }}
          gl={{ antialias: true, alpha: true }}
          dpr={[1, 2]}
        >
          <GlobeScene {...props} />
        </Canvas>
      </Suspense>
      <p className="globe-viz__hint">Drag to rotate · scroll to zoom</p>
    </div>
  )
}
