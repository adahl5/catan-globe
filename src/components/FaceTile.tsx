import {
  TERRAIN_LABELS,
  TRADE_RESOURCE_LABELS,
  type FaceTerrain,
  type PortSlot,
} from '../globe'
import { NumberChip } from './NumberChip'

type Shape = 'pentagon' | 'hexagon'

type Props = {
  shape: Shape
  index: number
  value: number | null
  terrain: FaceTerrain
  port?: PortSlot | null
}

function portSummary(slot: PortSlot): string {
  if (slot.kind === '3:1') return '3:1 any'
  return `2:1 ${TRADE_RESOURCE_LABELS[slot.resource]}`
}

export function FaceTile({ shape, index, value, terrain, port }: Props) {
  const label = shape === 'pentagon' ? 'Pentagon' : 'Hexagon'
  const isPortOnly = port != null
  const terrainLabel =
    !isPortOnly && terrain != null ? TERRAIN_LABELS[terrain] : null

  let aria = `${label} ${index + 1}`
  if (isPortOnly) {
    aria += `, port-only tile, ${portSummary(port)}`
  } else {
    if (terrainLabel) aria += `, ${terrainLabel}`
    if (value != null) aria += `, number ${value}`
    else if (terrain === 'desert') aria += ', no production number'
    else if (value == null) aria += ', no number yet'
  }

  if (isPortOnly) {
    return (
      <div
        className={`face-tile face-tile--${shape} face-tile--port-only`}
        role="img"
        aria-label={aria}
      >
        <span className="face-tile__shape face-tile__shape--port" aria-hidden />
        <span className="face-tile__meta">
          {shape === 'pentagon' ? '⬠' : '⬡'} {index + 1}
        </span>
        <span className="face-tile__port-kind">Port</span>
        <div className="face-tile__port face-tile__port--solo" aria-hidden>
          {port.kind === '3:1' ? (
            <span className="face-tile__port-ratio">3:1</span>
          ) : (
            <>
              <span className="face-tile__port-ratio">2:1</span>
              <span className={`face-tile__port-res face-tile__port-res--${port.resource}`}>
                {TRADE_RESOURCE_LABELS[port.resource]}
              </span>
            </>
          )}
        </div>
        <span className="face-tile__empty face-tile__empty--port" aria-hidden>
          —
        </span>
      </div>
    )
  }

  return (
    <div
      className={`face-tile face-tile--${shape} ${
        terrain ? `face-tile--terrain-${terrain}` : ''
      }`}
      role="img"
      aria-label={aria}
    >
      <span className="face-tile__shape" aria-hidden />
      <span className="face-tile__meta">
        {shape === 'pentagon' ? '⬠' : '⬡'} {index + 1}
      </span>
      <span className="face-tile__terrain" data-terrain={terrain ?? ''}>
        {terrainLabel ?? '—'}
      </span>
      {value != null ? (
        <NumberChip value={value} className="face-tile__chip" />
      ) : (
        <span className="face-tile__empty">
          {terrain === 'desert' ? 'Robber' : '—'}
        </span>
      )}
    </div>
  )
}
