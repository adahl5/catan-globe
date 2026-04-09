import { shuffleInPlace } from '../globe'
import type { DevCardType } from './types'

/** Standard Catan dev card distribution: 20 cards total. */
export const FULL_DECK: DevCardType[] = [
  ...Array<DevCardType>(9).fill('knight'),
  ...Array<DevCardType>(2).fill('roadBuilding'),
  ...Array<DevCardType>(2).fill('yearOfPlenty'),
  ...Array<DevCardType>(2).fill('monopoly'),
  ...Array<DevCardType>(5).fill('victoryPoint'),
]

export function createShuffledDeck(random: () => number = Math.random): DevCardType[] {
  const deck = [...FULL_DECK]
  shuffleInPlace(deck, random)
  return deck
}

export const DEV_CARD_LABELS: Record<DevCardType, string> = {
  knight: 'Knight',
  roadBuilding: 'Road Building',
  yearOfPlenty: 'Year of Plenty',
  monopoly: 'Monopoly',
  victoryPoint: 'Victory Point',
}

export const DEV_CARD_DESCRIPTIONS: Record<DevCardType, string> = {
  knight: 'Move the robber. Steal 1 resource from the owner of a settlement or city adjacent to the robber.',
  roadBuilding: 'Place 2 roads as if you had just built them.',
  yearOfPlenty: 'Take any 2 resources from the bank.',
  monopoly: 'Name 1 resource. All other players must give you all of that resource.',
  victoryPoint: '+1 Victory Point (revealed when claiming victory).',
}
