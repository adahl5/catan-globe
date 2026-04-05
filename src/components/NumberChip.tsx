import { ROLL_WEIGHT } from '../globe'

type Props = {
  value: number
  className?: string
}

/** Catan-style highlight for the most common production numbers. */
function isHighYield(n: number): boolean {
  return n === 6 || n === 8
}

export function NumberChip({ value, className = '' }: Props) {
  const pips = ROLL_WEIGHT[value] ?? 0
  return (
    <span
      className={`number-chip ${isHighYield(value) ? 'number-chip--hot' : ''} ${className}`.trim()}
      title={`${pips} way${pips === 1 ? '' : 's'} to roll ${value}`}
    >
      <span className="number-chip__value">{value}</span>
      <span className="number-chip__pips" aria-hidden>
        {'●'.repeat(pips)}
      </span>
    </span>
  )
}
