import { useState } from 'react'
import type { PlayerIndex, PlayerState, Resource, ResourceCounts } from '../game/types'
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

interface BankTradeProps {
  player: PlayerState
  portRates: Record<Resource, number>
  bank: ResourceCounts
  onTrade: (give: Resource, giveCount: number, receive: Resource) => void
}

export function BankTradePanel({ player, portRates, bank, onTrade }: BankTradeProps) {
  const [giving, setGiving] = useState<Resource>('lumber')
  const [receiving, setReceiving] = useState<Resource>('brick')

  const rate = portRates[giving]
  const canTrade =
    giving !== receiving &&
    player.resources[giving] >= rate &&
    bank[receiving] >= 1

  return (
    <div className="trade-panel">
      <h4 className="trade-panel__title">Trade with Bank</h4>
      <div className="trade-panel__row">
        <div className="trade-panel__side">
          <label className="trade-panel__sublabel">You give ({rate}:1)</label>
          <select
            className="trade-panel__select"
            value={giving}
            onChange={(e) => setGiving(e.target.value as Resource)}
          >
            {RESOURCES.map((r) => (
              <option key={r} value={r} disabled={player.resources[r] < portRates[r]}>
                {RESOURCE_ICONS[r]} {RESOURCE_LABELS[r]} (have {player.resources[r]}, need {portRates[r]})
              </option>
            ))}
          </select>
        </div>
        <span className="trade-panel__arrow">→</span>
        <div className="trade-panel__side">
          <label className="trade-panel__sublabel">You receive</label>
          <select
            className="trade-panel__select"
            value={receiving}
            onChange={(e) => setReceiving(e.target.value as Resource)}
          >
            {RESOURCES.map((r) => (
              <option key={r} value={r} disabled={bank[r] === 0 || r === giving}>
                {RESOURCE_ICONS[r]} {RESOURCE_LABELS[r]} (bank: {bank[r]})
              </option>
            ))}
          </select>
        </div>
      </div>
      <button
        type="button"
        className="btn btn--secondary trade-panel__btn"
        disabled={!canTrade}
        onClick={() => onTrade(giving, rate, receiving)}
      >
        Trade
      </button>
    </div>
  )
}

interface PlayerTradeProps {
  currentPlayer: PlayerIndex
  /** In online mode, the seat index this client controls. null/undefined = offline (pass-and-play). */
  myPlayerIndex?: PlayerIndex | null
  players: PlayerState[]
  pendingOffer: { fromPlayer: PlayerIndex; offer: Partial<ResourceCounts>; request: Partial<ResourceCounts> } | null
  onPropose: (offer: Partial<ResourceCounts>, request: Partial<ResourceCounts>) => void
  onAccept: (acceptingPlayer: PlayerIndex) => void
  onCancel: () => void
}

export function PlayerTradePanel({
  currentPlayer,
  myPlayerIndex,
  players,
  pendingOffer,
  onPropose,
  onAccept,
  onCancel,
}: PlayerTradeProps) {
  const [offer, setOffer] = useState<Partial<ResourceCounts>>({})
  const [request, setRequest] = useState<Partial<ResourceCounts>>({})
  const [expanded, setExpanded] = useState(false)

  function adjustAmount(
    obj: Partial<ResourceCounts>,
    setObj: (v: Partial<ResourceCounts>) => void,
    r: Resource,
    delta: number,
    max: number,
  ) {
    const next = (obj[r] ?? 0) + delta
    if (next < 0 || next > max) return
    setObj({ ...obj, [r]: next })
  }

  if (pendingOffer) {
    // In online mode (myPlayerIndex set), each client only sees their own accept button.
    // In offline/pass-and-play mode (myPlayerIndex null/undefined), all buttons are shown.
    const otherPlayers = players
      .map((p, i) => ({ p, i }))
      .filter(({ i }) => i !== pendingOffer.fromPlayer)
      .filter(({ i }) => myPlayerIndex == null || i === myPlayerIndex)

    const offerParts = RESOURCES.filter((r) => (pendingOffer.offer[r] ?? 0) > 0)
      .map((r) => `${pendingOffer.offer[r]} ${RESOURCE_LABELS[r]}`)
      .join(', ')
    const requestParts = RESOURCES.filter((r) => (pendingOffer.request[r] ?? 0) > 0)
      .map((r) => `${pendingOffer.request[r]} ${RESOURCE_LABELS[r]}`)
      .join(', ')

    // Only the proposer (or pass-and-play) can cancel the offer
    const canCancel = myPlayerIndex == null || myPlayerIndex === pendingOffer.fromPlayer

    return (
      <div className="trade-panel">
        <h4 className="trade-panel__title">Trade Offer</h4>
        <p className="trade-panel__offer-summary">
          <strong>{players[pendingOffer.fromPlayer]!.name}</strong> offers: {offerParts || '—'}
          <br />
          Wants: {requestParts || '—'}
        </p>
        <div className="trade-panel__acceptors">
          {otherPlayers.map(({ p, i }) => {
            const canAfford = RESOURCES.every(
              (r) => p.resources[r] >= (pendingOffer.request[r] ?? 0),
            )
            return (
              <button
                key={i}
                type="button"
                className="btn btn--secondary"
                disabled={!canAfford}
                onClick={() => onAccept(i)}
              >
                {p.name} accepts
              </button>
            )
          })}
        </div>
        {canCancel && (
          <button type="button" className="btn btn--ghost trade-panel__cancel" onClick={onCancel}>
            Cancel offer
          </button>
        )}
      </div>
    )
  }

  if (!expanded) {
    return (
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => setExpanded(true)}
      >
        Propose Player Trade…
      </button>
    )
  }

  const currentPlayerState = players[currentPlayer]!

  return (
    <div className="trade-panel">
      <h4 className="trade-panel__title">Propose Trade</h4>
      <div className="trade-panel__propose">
        <div className="trade-panel__propose-col">
          <strong>You offer</strong>
          {RESOURCES.map((r) => (
            <div key={r} className="trade-panel__resource-row">
              <span>{RESOURCE_ICONS[r]} {RESOURCE_LABELS[r]}</span>
              <div className="trade-panel__spinner">
                <button type="button" onClick={() => adjustAmount(offer, setOffer, r, -1, currentPlayerState.resources[r])}>−</button>
                <span>{offer[r] ?? 0}</span>
                <button type="button" onClick={() => adjustAmount(offer, setOffer, r, 1, currentPlayerState.resources[r])}>+</button>
              </div>
            </div>
          ))}
        </div>
        <div className="trade-panel__propose-col">
          <strong>You want</strong>
          {RESOURCES.map((r) => (
            <div key={r} className="trade-panel__resource-row">
              <span>{RESOURCE_ICONS[r]} {RESOURCE_LABELS[r]}</span>
              <div className="trade-panel__spinner">
                <button type="button" onClick={() => adjustAmount(request, setRequest, r, -1, 9)}>−</button>
                <span>{request[r] ?? 0}</span>
                <button type="button" onClick={() => adjustAmount(request, setRequest, r, 1, 9)}>+</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="trade-panel__propose-actions">
        <button type="button" className="btn btn--ghost" onClick={() => setExpanded(false)}>Cancel</button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => { onPropose(offer, request); setExpanded(false); setOffer({}); setRequest({}) }}
        >
          Propose
        </button>
      </div>
    </div>
  )
}
