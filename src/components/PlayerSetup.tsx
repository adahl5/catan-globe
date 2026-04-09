import { useState } from 'react'
import type { PlayerColor, PlayerConfig } from '../game/types'

const COLORS: PlayerColor[] = ['red', 'blue', 'orange', 'white']

const COLOR_LABELS: Record<PlayerColor, string> = {
  red: 'Red',
  blue: 'Blue',
  orange: 'Orange',
  white: 'White',
}

const COLOR_SWATCHES: Record<PlayerColor, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  orange: '#f97316',
  white: '#cbd5e1',
}

interface Props {
  onStart: (players: PlayerConfig[]) => void
  onCancel: () => void
}

export function PlayerSetup({ onStart, onCancel }: Props) {
  const [playerCount, setPlayerCount] = useState(2)
  const [names, setNames] = useState(['Player 1', 'Player 2', 'Player 3', 'Player 4'])
  const [colors, setColors] = useState<PlayerColor[]>(['red', 'blue', 'orange', 'white'])

  function setName(i: number, name: string) {
    const next = [...names]
    next[i] = name
    setNames(next)
  }

  function setColor(playerIdx: number, color: PlayerColor) {
    const next = [...colors]
    next[playerIdx] = color
    setColors(next)
  }

  function isColorTaken(color: PlayerColor, forPlayer: number) {
    return colors.slice(0, playerCount).some((c, i) => i !== forPlayer && c === color)
  }

  function handleStart() {
    const players: PlayerConfig[] = Array.from({ length: playerCount }, (_, i) => ({
      name: names[i]?.trim() || `Player ${i + 1}`,
      color: colors[i]!,
    }))
    onStart(players)
  }

  return (
    <div className="player-setup-overlay">
      <div className="player-setup">
        <h2 className="player-setup__title">Catan Globe — New Game</h2>

        <div className="player-setup__count">
          <label className="player-setup__label">Number of players</label>
          <div className="player-setup__count-btns">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                className={`player-setup__count-btn${playerCount === n ? ' player-setup__count-btn--active' : ''}`}
                onClick={() => setPlayerCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="player-setup__players">
          {Array.from({ length: playerCount }, (_, i) => (
            <div key={i} className="player-setup__player">
              <div
                className="player-setup__player-swatch"
                style={{ background: COLOR_SWATCHES[colors[i]!] }}
              />
              <input
                className="player-setup__name-input"
                type="text"
                value={names[i]}
                onChange={(e) => setName(i, e.target.value)}
                maxLength={20}
                placeholder={`Player ${i + 1}`}
              />
              <div className="player-setup__colors">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    title={COLOR_LABELS[color]}
                    className={`player-setup__color-btn${colors[i] === color ? ' player-setup__color-btn--selected' : ''}${isColorTaken(color, i) ? ' player-setup__color-btn--taken' : ''}`}
                    style={{ background: COLOR_SWATCHES[color] }}
                    onClick={() => setColor(i, color)}
                    disabled={isColorTaken(color, i)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="player-setup__actions">
          <button type="button" className="btn btn--secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={handleStart}>
            Start Game
          </button>
        </div>
      </div>
    </div>
  )
}
