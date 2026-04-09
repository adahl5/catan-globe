/**
 * Victory point computation and win condition checking.
 */

import type { GameState, PlayerIndex } from './types'

/**
 * Computes a player's victory point total.
 *
 * @param pi              Player index.
 * @param state           Current game state.
 * @param revealDevCards  If true, count VP dev cards in hand (used for win check / game over screen).
 *                        If false, only count public points (for HUD while game is ongoing).
 */
export function getPlayerVP(
  pi: PlayerIndex,
  state: GameState,
  revealDevCards: boolean,
): number {
  const player = state.players[pi]!
  let vp = 0

  // Buildings
  vp += player.settlements.length // 1 VP each
  vp += player.cities.length * 2  // 2 VP each

  // Special cards
  if (state.longestRoadHolder === pi) vp += 2
  if (state.largestArmyHolder === pi) vp += 2

  // VP dev cards (hidden unless revealing)
  if (revealDevCards) {
    vp += player.devCards.filter((c) => c === 'victoryPoint').length
  }

  return vp
}

/**
 * Returns the winning player index if any player has reached 10+ VP
 * (counting their hidden VP cards), or null if no one has won yet.
 *
 * In standard Catan, you can only win on your own turn.  Call this
 * only at END_TURN (or after city/settlement placement, etc.) for the
 * current player.
 */
export function checkWin(state: GameState): PlayerIndex | null {
  const pi = state.currentPlayerIndex
  if (getPlayerVP(pi, state, true) >= 10) return pi
  return null
}
