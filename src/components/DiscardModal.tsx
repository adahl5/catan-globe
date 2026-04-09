import { useState } from 'react'
import type { Resource, ResourceCounts } from '../game/types'
import { RESOURCES } from '../game/types'

const RESOURCE_LABELS: Record<Resource, string> = {
  lumber: 'Lumber',
  brick: 'Brick',
  wool: 'Wool',
  grain: 'Grain',
  ore: 'Ore',
}

const RESOURCE_ICONS: Record<Resource, string> = {
  lumber: '🌲',
  brick: '🧱',
  wool: '🐑',
  grain: '🌾',
  ore: '⛏️',
}

interface Props {
  playerName: string
  currentResources: ResourceCounts
  mustDiscard: number
  onConfirm: (discarded: Partial<ResourceCounts>) => void
}

export function DiscardModal({ playerName, currentResources, mustDiscard, onConfirm }: Props) {
  const [discarding, setDiscarding] = useState<ResourceCounts>({
    lumber: 0,
    brick: 0,
    wool: 0,
    grain: 0,
    ore: 0,
  })

  const totalDiscarding = RESOURCES.reduce((s, r) => s + discarding[r], 0)
  const remaining = mustDiscard - totalDiscarding
  const isValid = remaining === 0

  function adjust(r: Resource, delta: number) {
    const next = discarding[r] + delta
    if (next < 0 || next > currentResources[r]) return
    if (delta > 0 && totalDiscarding >= mustDiscard) return
    setDiscarding((prev) => ({ ...prev, [r]: next }))
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3 className="modal__title">Discard cards — {playerName}</h3>
        <p className="modal__desc">
          You have more than 7 cards. You must discard{' '}
          <strong>{mustDiscard}</strong> card{mustDiscard !== 1 ? 's' : ''}.
          {remaining > 0 && ` (${remaining} more to select)`}
        </p>

        <div className="discard-grid">
          {RESOURCES.map((r) => {
            const have = currentResources[r]
            if (have === 0) return null
            return (
              <div key={r} className="discard-row">
                <span className="discard-row__icon">{RESOURCE_ICONS[r]}</span>
                <span className="discard-row__label">{RESOURCE_LABELS[r]}</span>
                <span className="discard-row__have">({have})</span>
                <div className="discard-row__controls">
                  <button
                    type="button"
                    className="discard-btn"
                    onClick={() => adjust(r, -1)}
                    disabled={discarding[r] === 0}
                  >
                    −
                  </button>
                  <span className="discard-row__count">{discarding[r]}</span>
                  <button
                    type="button"
                    className="discard-btn"
                    onClick={() => adjust(r, 1)}
                    disabled={discarding[r] >= have || totalDiscarding >= mustDiscard}
                  >
                    +
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="modal__actions">
          <button
            type="button"
            className="btn btn--primary"
            disabled={!isValid}
            onClick={() => onConfirm(discarding)}
          >
            Discard {mustDiscard} cards
          </button>
        </div>
      </div>
    </div>
  )
}
