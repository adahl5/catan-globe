import {
  DESERT_FACE_COUNT,
  GENERIC_PORT_COUNT,
  HEXAGON_COUNT,
  NORTH_POLE_HEXAGON_INDEX,
  PENTAGON_COUNT,
  PLAYABLE_FACE_COUNT,
  PORT_COUNT,
  RESOURCE_FACE_COUNT,
  SOUTH_POLE_HEXAGON_INDEX,
  SPECIAL_PORT_COUNT,
  type FaceTerrain,
  type PortSlot,
} from '../globe'
import { FaceTile } from './FaceTile'
import { GlobeVisualization } from './GlobeVisualization'

type Props = {
  pentagons: (number | null)[]
  hexagons: (number | null)[]
  pentTerrain: FaceTerrain[] | null
  hexTerrain: FaceTerrain[] | null
  pentPorts: (PortSlot | null)[] | null
  hexPorts: (PortSlot | null)[] | null
}

export function GlobeBoard({
  pentagons,
  hexagons,
  pentTerrain,
  hexTerrain,
  pentPorts,
  hexPorts,
}: Props) {
  return (
    <div className="globe-board">
      <div className="globe-board__intro">
        <h2>Globe layout</h2>
        <p>
          Truncated icosahedron: <strong>{PENTAGON_COUNT} pentagons</strong> and{' '}
          <strong>{HEXAGON_COUNT} hexagons</strong>. The <strong>south pole</strong> hexagon (
          <strong>⬡ {SOUTH_POLE_HEXAGON_INDEX + 1}</strong>) has <strong>no tile</strong> (mounting
          rod). The other <strong>{PLAYABLE_FACE_COUNT} faces</strong> are in play:{' '}
          <strong>{RESOURCE_FACE_COUNT}</strong> carry terrain (
          <strong>{DESERT_FACE_COUNT} desert</strong>, no die chip on those), and{' '}
          <strong>{PORT_COUNT}</strong> are port-only (
          {GENERIC_PORT_COUNT} generic <strong>3:1</strong> and {SPECIAL_PORT_COUNT}{' '}
          <strong>2:1</strong>) — no terrain or numbers there. The <strong>north pole</strong> is
          hexagon <strong>⬡ {NORTH_POLE_HEXAGON_INDEX + 1}</strong>. Port positions are randomized
          each full shuffle.
        </p>
      </div>

      <GlobeVisualization
        pentagons={pentagons}
        hexagons={hexagons}
        pentTerrain={pentTerrain}
        hexTerrain={hexTerrain}
        pentPorts={pentPorts}
        hexPorts={hexPorts}
      />

      <section className="globe-board__section" aria-labelledby="pent-heading">
        <h3 id="pent-heading">Pentagons ({PENTAGON_COUNT})</h3>
        <div className="globe-board__faces globe-board__faces--pent">
          {Array.from({ length: PENTAGON_COUNT }, (_, i) => (
            <FaceTile
              key={`p-${i}`}
              shape="pentagon"
              index={i}
              terrain={pentTerrain?.[i] ?? null}
              port={pentPorts?.[i] ?? null}
              value={pentagons[i] ?? null}
            />
          ))}
        </div>
      </section>
      <section className="globe-board__section" aria-labelledby="hex-heading">
        <h3 id="hex-heading">Hexagons ({HEXAGON_COUNT})</h3>
        <div className="globe-board__faces globe-board__faces--hex">
          {Array.from({ length: HEXAGON_COUNT }, (_, i) => (
            <FaceTile
              key={`h-${i}`}
              shape="hexagon"
              index={i}
              terrain={hexTerrain?.[i] ?? null}
              port={hexPorts?.[i] ?? null}
              value={hexagons[i] ?? null}
              pole={
                i === SOUTH_POLE_HEXAGON_INDEX
                  ? 'south'
                  : i === NORTH_POLE_HEXAGON_INDEX
                    ? 'north'
                    : undefined
              }
            />
          ))}
        </div>
      </section>
    </div>
  )
}
