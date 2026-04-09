import { useCallback, useMemo, useState } from 'react'
import type { SerializableLayout } from '../globe'
import type { GameAction } from '../game/reducer'
import {
  COSTS,
  canAfford,
  getPortRates,
  playerCitiesLeft,
  playerRoadsLeft,
  playerSettlementsLeft,
} from '../game/rules'
import {
  type GameState,
  type GlobeGraph,
  type PlayerColor,
  type PlayerIndex,
  type Resource,
  RESOURCES,
} from '../game/types'
import { getPlayerVP } from '../game/vp'
import { DEV_CARD_LABELS } from '../game/devCards'
import { BankTradePanel, PlayerTradePanel } from './TradePanel'

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

const PLAYER_CSS_COLORS: Record<PlayerColor, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  orange: '#f97316',
  white: '#94a3b8',
}

// ---------------------------------------------------------------------------
// Phase descriptions
// ---------------------------------------------------------------------------

function phaseInstruction(state: GameState): string {
  const { phase } = state
  const p = state.players[state.currentPlayerIndex]!.name
  switch (phase) {
    case 'setup_place_settlement':
      return `${p}: place your settlement`
    case 'setup_place_road':
      return `${p}: place a road next to your settlement`
    case 'main_preroll':
      return `${p}: roll the dice (or play a Knight first)`
    case 'main_robber_move':
      return `${p}: click a face on the globe to move the robber`
    case 'main_steal':
      return `${p}: choose a player to steal from`
    case 'main_discard': {
      const keys = Object.keys(state.pendingDiscards ?? {})
      if (keys.length > 0) {
        const pi = Number(keys[0]) as PlayerIndex
        return `${state.players[pi]!.name}: discard half your cards`
      }
      return 'Discarding…'
    }
    case 'main_road_building_1':
      return `${p}: place road 1/2 (Road Building)`
    case 'main_road_building_2':
      return `${p}: place road 2/2 (Road Building) — or skip`
    case 'main_build':
      return `${p}: build, trade, or end turn`
    case 'game_over':
      return `🎉 ${state.players[state.winnerIndex ?? 0]!.name} wins!`
    default:
      return ''
  }
}

// ---------------------------------------------------------------------------
// Dice face component
// ---------------------------------------------------------------------------

function DieFace({ value }: { value: number }) {
  const PIPS: Record<number, string> = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' }
  return <span className="die-face">{PIPS[value] ?? value}</span>
}

// ---------------------------------------------------------------------------
// Main HUD
// ---------------------------------------------------------------------------

export type ActiveAction = 'settlement' | 'road' | 'city' | null

interface Props {
  state: GameState
  layout: SerializableLayout
  graph: GlobeGraph
  dispatch: (a: GameAction) => void
  activeAction: ActiveAction
  setActiveAction: (a: ActiveAction) => void
  /** Which player index this client controls. null/undefined = offline. */
  myPlayerIndex?: number | null
  /** Shareable join URL; when provided a copy-invite button appears in the header. */
  inviteUrl?: string
}

export function GameHUD({
  state,
  layout,
  graph,
  dispatch,
  activeAction,
  setActiveAction,
  myPlayerIndex,
  inviteUrl,
}: Props) {
  const [ypRes1, setYpRes1] = useState<Resource>('lumber')
  const [ypRes2, setYpRes2] = useState<Resource>('grain')
  const [monopolyRes, setMonopolyRes] = useState<Resource>('lumber')
  const [copyLabel, setCopyLabel] = useState('🔗 Invite')

  const handleCopyInvite = useCallback(() => {
    if (!inviteUrl) return
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopyLabel('✓ Copied!')
      setTimeout(() => setCopyLabel('🔗 Invite'), 2000)
    })
  }, [inviteUrl])

  const { phase, currentPlayerIndex, players, lastRoll } = state
  const currentPlayer = players[currentPlayerIndex]!

  // In online mode myPlayerIndex tells us which seat belongs to this client.
  // We use it to (a) lock out off-turn buttons and (b) always show the local
  // player's own resources / dev cards regardless of whose turn it is.
  const isMyTurn = myPlayerIndex == null || myPlayerIndex === currentPlayerIndex
  const myPlayer = myPlayerIndex != null ? (players[myPlayerIndex] ?? currentPlayer) : currentPlayer

  const portRates = useMemo(
    () => getPortRates(currentPlayerIndex, state, graph, layout),
    [currentPlayerIndex, state, graph, layout],
  )

  const isMainBuild = phase === 'main_build'
  const isPreroll = phase === 'main_preroll'
  const isGameOver = phase === 'game_over'

  // Can the current player afford things?
  const canRoad =
    isMainBuild && canAfford(currentPlayer, COSTS.road) && playerRoadsLeft(currentPlayer) > 0
  const canSettlement =
    isMainBuild &&
    canAfford(currentPlayer, COSTS.settlement) &&
    playerSettlementsLeft(currentPlayer) > 0
  const canCity =
    isMainBuild &&
    canAfford(currentPlayer, COSTS.city) &&
    playerCitiesLeft(currentPlayer) > 0 &&
    currentPlayer.settlements.length > 0
  const canDevCard =
    isMainBuild &&
    canAfford(currentPlayer, COSTS.devCard) &&
    state.devCardDeck.length > 0
  const canPlayKnight =
    isPreroll &&
    !state.playedDevCardThisTurn &&
    currentPlayer.devCards.includes('knight')
  const canPlayRoadBuilding =
    isMainBuild &&
    !state.playedDevCardThisTurn &&
    currentPlayer.devCards.includes('roadBuilding')
  const canPlayYoP =
    isMainBuild &&
    !state.playedDevCardThisTurn &&
    currentPlayer.devCards.includes('yearOfPlenty')
  const canPlayMonopoly =
    isMainBuild &&
    !state.playedDevCardThisTurn &&
    currentPlayer.devCards.includes('monopoly')

  function rollDice() {
    dispatch({
      type: 'ROLL_DICE',
      die1: Math.ceil(Math.random() * 6),
      die2: Math.ceil(Math.random() * 6),
    })
  }

  function toggleAction(action: ActiveAction) {
    setActiveAction(activeAction === action ? null : action)
  }

  return (
    <div className="game-hud">
      {/* ---------------------------------------------------------------- */}
      {/* Header                                                           */}
      {/* ---------------------------------------------------------------- */}
      <div className="game-hud__header">
        <div
          className="game-hud__player-badge"
          style={{ borderColor: PLAYER_CSS_COLORS[currentPlayer.color] }}
        >
          <span
            className="game-hud__player-dot"
            style={{ background: PLAYER_CSS_COLORS[currentPlayer.color] }}
          />
          <span className="game-hud__player-name">{currentPlayer.name}</span>
          {!isGameOver && (
            <span className="game-hud__vp">
              {getPlayerVP(currentPlayerIndex, state, false)} VP
            </span>
          )}
        </div>
        {inviteUrl && (
          <button
            type="button"
            className="btn btn--ghost game-hud__invite"
            onClick={handleCopyInvite}
            title={inviteUrl}
          >
            {copyLabel}
          </button>
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Phase instruction                                                */}
      {/* ---------------------------------------------------------------- */}
      <p className="game-hud__instruction">{phaseInstruction(state)}</p>

      {/* ---------------------------------------------------------------- */}
      {/* Game over banner                                                 */}
      {/* ---------------------------------------------------------------- */}
      {isGameOver && (
        <div className="game-hud__winner">
          <p>Final scores:</p>
          {players.map((p, pi) => (
            <div key={pi} className="game-hud__final-score">
              <span style={{ color: PLAYER_CSS_COLORS[p.color] }}>{p.name}</span>:{' '}
              {getPlayerVP(pi, state, true)} VP
            </div>
          ))}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Dice                                                             */}
      {/* ---------------------------------------------------------------- */}
      {(isPreroll || isMainBuild) && !isGameOver && (
        <div className="game-hud__dice-section">
          {lastRoll && (
            <div className="game-hud__dice-display">
              <DieFace value={lastRoll[0]} />
              <DieFace value={lastRoll[1]} />
              <span className="game-hud__dice-total">= {lastRoll[0] + lastRoll[1]}</span>
            </div>
          )}
          {isPreroll && isMyTurn && (
            <button type="button" className="btn btn--primary" onClick={rollDice}>
              🎲 Roll Dice
            </button>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Knight (pre-roll)                                                */}
      {/* ---------------------------------------------------------------- */}
      {isPreroll && isMyTurn && canPlayKnight && (
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => dispatch({ type: 'PLAY_KNIGHT' })}
        >
          🪖 Play Knight (move robber first)
        </button>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Build actions                                                    */}
      {/* ---------------------------------------------------------------- */}
      {isMainBuild && isMyTurn && (
        <div className="game-hud__section">
          <h4 className="game-hud__section-title">Build</h4>
          <div className="game-hud__build-btns">
            <button
              type="button"
              className={`btn btn--build${activeAction === 'road' ? ' btn--build-active' : ''}`}
              disabled={!canRoad}
              onClick={() => toggleAction('road')}
              title="Road: 1 lumber + 1 brick"
            >
              🛤️ Road
            </button>
            <button
              type="button"
              className={`btn btn--build${activeAction === 'settlement' ? ' btn--build-active' : ''}`}
              disabled={!canSettlement}
              onClick={() => toggleAction('settlement')}
              title="Settlement: 1 lumber + 1 brick + 1 wool + 1 grain"
            >
              🏠 Settlement
            </button>
            <button
              type="button"
              className={`btn btn--build${activeAction === 'city' ? ' btn--build-active' : ''}`}
              disabled={!canCity}
              onClick={() => toggleAction('city')}
              title="City: 2 grain + 3 ore"
            >
              🏙️ City
            </button>
            <button
              type="button"
              className="btn btn--build"
              disabled={!canDevCard}
              onClick={() => dispatch({ type: 'BUY_DEV_CARD' })}
              title="Dev Card: 1 ore + 1 wool + 1 grain"
            >
              🃏 Dev Card ({state.devCardDeck.length} left)
            </button>
          </div>
        </div>
      )}

      {/* Road building placement sub-phase */}
      {(phase === 'main_road_building_1' || phase === 'main_road_building_2') && isMyTurn && (
        <div className="game-hud__section">
          <p>Click a valid road location on the globe.</p>
          {phase === 'main_road_building_2' && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => dispatch({ type: 'SKIP_RB_ROAD' })}
            >
              Skip 2nd road
            </button>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Dev cards in hand                                                */}
      {/* ---------------------------------------------------------------- */}
      {isMainBuild && isMyTurn && (canPlayRoadBuilding || canPlayYoP || canPlayMonopoly) && (
        <div className="game-hud__section">
          <h4 className="game-hud__section-title">Play Dev Card</h4>
          {canPlayRoadBuilding && (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => dispatch({ type: 'PLAY_ROAD_BUILDING' })}
            >
              🛤️ Road Building
            </button>
          )}
          {canPlayYoP && (
            <div className="game-hud__yop">
              <span>Year of Plenty:</span>
              <select value={ypRes1} onChange={(e) => setYpRes1(e.target.value as Resource)}>
                {RESOURCES.map((r) => <option key={r} value={r}>{RESOURCE_LABELS[r]}</option>)}
              </select>
              <select value={ypRes2} onChange={(e) => setYpRes2(e.target.value as Resource)}>
                {RESOURCES.map((r) => <option key={r} value={r}>{RESOURCE_LABELS[r]}</option>)}
              </select>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => dispatch({ type: 'PLAY_YEAR_OF_PLENTY', res1: ypRes1, res2: ypRes2 })}
              >
                Take resources
              </button>
            </div>
          )}
          {canPlayMonopoly && (
            <div className="game-hud__monopoly">
              <span>Monopoly:</span>
              <select value={monopolyRes} onChange={(e) => setMonopolyRes(e.target.value as Resource)}>
                {RESOURCES.map((r) => <option key={r} value={r}>{RESOURCE_LABELS[r]}</option>)}
              </select>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => dispatch({ type: 'PLAY_MONOPOLY', resource: monopolyRes })}
              >
                Take all
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Trading                                                          */}
      {/* ---------------------------------------------------------------- */}
      {/* Show the trade section to the current player, OR to any player
          when there is a pending offer they need to respond to. */}
      {isMainBuild && (isMyTurn || state.pendingTradeOffer != null) && (
        <div className="game-hud__section">
          <h4 className="game-hud__section-title">Trade</h4>
          {isMyTurn && (
            <BankTradePanel
              player={currentPlayer}
              portRates={portRates}
              bank={state.bank}
              onTrade={(give, giveCount, receive) =>
                dispatch({ type: 'TRADE_BANK', give, giveCount, receive })
              }
            />
          )}
          {players.length > 1 && (
            <PlayerTradePanel
              currentPlayer={currentPlayerIndex}
              myPlayerIndex={myPlayerIndex ?? null}
              players={players}
              pendingOffer={state.pendingTradeOffer}
              onPropose={(offer, request) => dispatch({ type: 'PROPOSE_TRADE', offer, request })}
              onAccept={(pi) => dispatch({ type: 'ACCEPT_TRADE', acceptingPlayerIndex: pi })}
              onCancel={() => dispatch({ type: 'CANCEL_TRADE' })}
            />
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Dev card count summary                                           */}
      {/* ---------------------------------------------------------------- */}
      {/* "Waiting" notice shown to online players when it is not their turn */}
      {!isMyTurn && !isGameOver && (
        <p className="game-hud__waiting">
          ⏳ Waiting for {currentPlayer.name}…
        </p>
      )}

      {myPlayer.devCards.length > 0 && (
        <div className="game-hud__section">
          <h4 className="game-hud__section-title">Your Dev Cards</h4>
          <div className="game-hud__dev-cards">
            {myPlayer.devCards.map((c, i) => (
              <span key={i} className="game-hud__dev-card">{DEV_CARD_LABELS[c]}</span>
            ))}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Current player resources                                         */}
      {/* ---------------------------------------------------------------- */}
      <div className="game-hud__section">
        <h4 className="game-hud__section-title">Your Resources</h4>
        <div className="game-hud__resources">
          {RESOURCES.map((r) => (
            <div key={r} className={`game-hud__res game-hud__res--${r}`}>
              <span className="game-hud__res-icon">{RESOURCE_ICONS[r]}</span>
              <span className="game-hud__res-count">{myPlayer.resources[r]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* All players overview                                             */}
      {/* ---------------------------------------------------------------- */}
      <div className="game-hud__section">
        <h4 className="game-hud__section-title">All Players</h4>
        <div className="game-hud__all-players">
          {players.map((p, pi) => (
            <div
              key={pi}
              className={`game-hud__player-row${pi === currentPlayerIndex ? ' game-hud__player-row--current' : ''}`}
            >
              <span
                className="game-hud__player-dot"
                style={{ background: PLAYER_CSS_COLORS[p.color] }}
              />
              <span className="game-hud__player-row-name">{p.name}</span>
              <span className="game-hud__player-row-vp">{getPlayerVP(pi, state, false)} VP</span>
              <span className="game-hud__player-row-cards">{RESOURCES.reduce((s, r) => s + p.resources[r], 0)} cards</span>
              <span className="game-hud__player-row-roads">{p.roads.length}🛤️</span>
              {state.longestRoadHolder === pi && <span title="Longest Road">🛣️</span>}
              {state.largestArmyHolder === pi && <span title="Largest Army">🪖</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* End turn                                                         */}
      {/* ---------------------------------------------------------------- */}
      {isMainBuild && isMyTurn && (
        <button
          type="button"
          className="btn btn--primary game-hud__end-turn"
          onClick={() => {
            setActiveAction(null)
            dispatch({ type: 'END_TURN' })
          }}
        >
          End Turn →
        </button>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Turn log                                                         */}
      {/* ---------------------------------------------------------------- */}
      <div className="game-hud__section game-hud__log-section">
        <h4 className="game-hud__section-title">Log</h4>
        <div className="game-hud__log">
          {state.log.slice(-20).map((entry, i) => (
            <p key={i} className="game-hud__log-entry">{entry}</p>
          ))}
        </div>
      </div>
    </div>
  )
}
