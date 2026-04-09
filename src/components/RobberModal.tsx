import type { PlayerColor, PlayerIndex } from '../game/types'

const COLOR_SWATCHES: Record<PlayerColor, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  orange: '#f97316',
  white: '#cbd5e1',
}

interface PlayerOption {
  playerIndex: PlayerIndex
  name: string
  color: PlayerColor
  resourceCount: number
}

interface Props {
  players: PlayerOption[]
  onSteal: (playerIndex: PlayerIndex) => void
}

export function RobberModal({ players, onSteal }: Props) {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3 className="modal__title">Steal a resource</h3>
        <p className="modal__desc">
          Choose a player to steal from. You will receive one random resource from their hand.
        </p>
        <div className="modal__options">
          {players.map((p) => (
            <button
              key={p.playerIndex}
              type="button"
              className="modal__player-btn"
              onClick={() => onSteal(p.playerIndex)}
            >
              <span
                className="modal__player-swatch"
                style={{ background: COLOR_SWATCHES[p.color] }}
              />
              <span className="modal__player-name">{p.name}</span>
              <span className="modal__player-cards">{p.resourceCount} card{p.resourceCount !== 1 ? 's' : ''}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
