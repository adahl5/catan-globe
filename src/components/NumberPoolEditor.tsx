import { DICE_VALUES, NUMBERED_FACE_COUNT, poolTotal } from '../globe'

type Props = {
  counts: Record<number, number>
  onChange: (counts: Record<number, number>) => void
  onResetDefault: () => void
}

export function NumberPoolEditor({ counts, onChange, onResetDefault }: Props) {
  const total = poolTotal(counts)
  const match = total === NUMBERED_FACE_COUNT

  function setCount(value: number, next: number) {
    const c = Number.isFinite(next) ? Math.max(0, Math.floor(next)) : 0
    onChange({ ...counts, [value]: c })
  }

  return (
    <div className="pool-editor">
      <div className="pool-editor__header">
        <h2>Number pool</h2>
        <p className="pool-editor__hint">
          Set how many chips you have for each die total ({NUMBERED_FACE_COUNT} total: one per
          non-desert resource face; port-only faces never get a chip).
        </p>
      </div>
      <div className="pool-editor__grid" role="table" aria-label="Dice value counts">
        {DICE_VALUES.map((v) => (
          <label key={v} className="pool-editor__row">
            <span className="pool-editor__label">{v}</span>
            <input
              type="number"
              min={0}
              step={1}
              value={counts[v] ?? 0}
              onChange={(e) => setCount(v, parseInt(e.target.value, 10))}
              aria-label={`Count for ${v}`}
            />
          </label>
        ))}
      </div>
      <div className={`pool-editor__sum ${match ? 'pool-editor__sum--ok' : 'pool-editor__sum--warn'}`}>
        Total: <strong>{total}</strong> / {NUMBERED_FACE_COUNT}
        {!match && (
          <span className="pool-editor__sum-msg">
            {total < NUMBERED_FACE_COUNT
              ? ` — add ${NUMBERED_FACE_COUNT - total} more`
              : ` — remove ${total - NUMBERED_FACE_COUNT}`}
          </span>
        )}
      </div>
      <button type="button" className="btn btn--secondary" onClick={onResetDefault}>
        Reset pool to default
      </button>
    </div>
  )
}
