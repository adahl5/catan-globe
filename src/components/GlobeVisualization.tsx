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
import { Vector3 } from 'three'
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

/** Same scale as the root `<group scale={…}>` wrapping all globe meshes. */
const GLOBE_SCALE = 2.35

/** Hide labels when the face normal is far from the view direction (~80° cone toward camera). */
const FACING_MIN_DOT = 0.18

const _tmpWorldCentroid = new Vector3()
const _tmpToCamera = new Vector3()

/**
 * @react-three/drei `Html` toggles its root div’s `display` and ignores `Object3D.visible` on parents.
 * This runs in a sibling placed after `<Html />` so its `useFrame` runs after drei's and keeps the DOM hidden on the far hemisphere.
 */
function FacingLabelDomSink({
  domRef,
  faceCentroid,
  faceNormal,
}: {
  domRef: RefObject<HTMLDivElement | null>
  faceCentroid: Vector3
  faceNormal: Vector3
}) {
  const { camera } = useThree()
  useFrame(() => {
    const el = domRef.current
    if (!el) return
    _tmpWorldCentroid.copy(faceCentroid).multiplyScalar(GLOBE_SCALE)
    _tmpToCamera.subVectors(camera.position, _tmpWorldCentroid).normalize()
    const facing = faceNormal.dot(_tmpToCamera) > FACING_MIN_DOT
    el.style.display = facing ? '' : 'none'
  })
  return null
}

/**
 * HTML labels on the far side of the globe read poorly; only show when the face points toward the camera.
 */
function FacingHtml({
  faceCentroid,
  faceNormal,
  htmlPosition,
  children,
}: {
  faceCentroid: Vector3
  faceNormal: Vector3
  htmlPosition: [number, number, number]
  children: ReactNode
}) {
  const domRef = useRef<HTMLDivElement>(null)
  return (
    <group>
      <Html
        ref={domRef}
        position={htmlPosition}
        center
        distanceFactor={5.2}
        style={{ pointerEvents: 'none' }}
      >
        {children}
      </Html>
      <FacingLabelDomSink domRef={domRef} faceCentroid={faceCentroid} faceNormal={faceNormal} />
    </group>
  )
}

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
  pole?: 'north' | 'south' | null
}

function FaceLabelStack({ value, terrain, port, pole }: LabelStackProps) {
  if (pole === 'south') {
    return (
      <div className="globe-viz__labels globe-viz__labels--pole">
        <span className="globe-viz__pole globe-viz__pole--south">South pole</span>
        <span className="globe-viz__pole-note">Rod mount · no tile</span>
      </div>
    )
  }
  const showRobber = terrain === 'desert' && value == null
  return (
    <div className="globe-viz__labels">
      {pole === 'north' && (
        <span className="globe-viz__pole globe-viz__pole--north">North pole</span>
      )}
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

/** Solid WebGL clear + scene background (matches `--code-bg` light / dark). */
function OpaqueSceneBackground() {
  const [bgHex, setBgHex] = useState(
    () => (window.matchMedia('(prefers-color-scheme: dark)').matches ? '#1f2028' : '#f4f3ec'),
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => setBgHex(mq.matches ? '#1f2028' : '#f4f3ec')
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return <color attach="background" args={[bgHex]} />
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
    <group scale={GLOBE_SCALE}>
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
              <FacingHtml
                faceCentroid={centroid}
                faceNormal={normal}
                htmlPosition={pos.toArray() as [number, number, number]}
              >
                <FaceLabelStack value={v} terrain={terrain} port={port} />
              </FacingHtml>
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
        const isSouthPole = i === SOUTH_POLE_HEXAGON_INDEX
        const isNorthPole = i === NORTH_POLE_HEXAGON_INDEX
        const pole = isSouthPole ? 'south' : isNorthPole ? 'north' : null
        const color =
          terrain != null ? TERRAIN_HEX[terrain] : port != null ? PORT_TILE_HEX : EMPTY_HEX
        const showHtml =
          isSouthPole ||
          isNorthPole ||
          v != null ||
          terrain === 'desert' ||
          port != null

        return (
          <group key={`hex-${i}`}>
            <mesh geometry={geom}>
              {isSouthPole ? (
                <meshStandardMaterial
                  color={EMPTY_HEX}
                  roughness={0.65}
                  metalness={0.04}
                  transparent
                  opacity={0.22}
                />
              ) : (
                <meshStandardMaterial color={color} roughness={0.5} metalness={0.05} />
              )}
              <Edges color={EDGE_COLOR} threshold={12} />
            </mesh>
            {showHtml && (
              <FacingHtml
                faceCentroid={centroid}
                faceNormal={normal}
                htmlPosition={pos.toArray() as [number, number, number]}
              >
                <FaceLabelStack value={v} terrain={terrain} port={port} pole={pole} />
              </FacingHtml>
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
          gl={{ antialias: true, alpha: false }}
          dpr={[1, 2]}
        >
          <OpaqueSceneBackground />
          <GlobeScene {...props} />
        </Canvas>
      </Suspense>
      <p className="globe-viz__hint">Drag to rotate · scroll to zoom</p>
    </div>
  )
}
