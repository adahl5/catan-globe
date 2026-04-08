import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react'
import {
  HEXAGON_COUNT,
  NUMBERED_FACE_COUNT,
  PENTAGON_COUNT,
  RESOURCE_FACE_COUNT,
  assignFullLayout,
  assignNumbersForLayout,
  defaultPoolCounts,
  loadPoolFromStorage,
  poolTotal,
  savePoolToStorage,
  deserializeLayout,
  type FaceTerrain,
  type PortSlot,
  type SerializableLayout,
} from './globe'
import { NumberPoolEditor } from './components/NumberPoolEditor'
import { LayoutManager } from './components/LayoutManager'
import './App.css'

const GlobeBoard = lazy(() => import('./components/GlobeBoard').then(m => ({ default: m.GlobeBoard })))

function emptyLayout(): {
  pentagons: (number | null)[]
  hexagons: (number | null)[]
  pentTerrain: FaceTerrain[] | null
  hexTerrain: FaceTerrain[] | null
  pentPorts: (PortSlot | null)[] | null
  hexPorts: (PortSlot | null)[] | null
} {
  return {
    pentagons: Array.from({ length: PENTAGON_COUNT }, () => null as number | null),
    hexagons: Array.from({ length: HEXAGON_COUNT }, () => null as number | null),
    pentTerrain: null,
    hexTerrain: null,
    pentPorts: null,
    hexPorts: null,
  }
}

function initialPoolCounts(): Record<number, number> {
  return loadPoolFromStorage() ?? defaultPoolCounts()
}

function layoutFromPool(counts: Record<number, number>) {
  const result = assignFullLayout(counts)
  if (!result) return emptyLayout()
  return {
    pentagons: result.pentagons,
    hexagons: result.hexagons,
    pentTerrain: result.pentTerrain,
    hexTerrain: result.hexTerrain,
    pentPorts: result.pentPorts,
    hexPorts: result.hexPorts,
  }
}

export default function App() {
  const [counts, setCounts] = useState<Record<number, number>>(initialPoolCounts)
  const [layout, setLayout] = useState(() => layoutFromPool(initialPoolCounts()))

  // Load layout from URL if present
  useEffect(() => {
    const url = new URL(window.location.href)
    const layoutParam = url.searchParams.get('layout')
    if (layoutParam) {
      const parsedLayout = deserializeLayout(layoutParam)
      if (parsedLayout) {
        setLayout(parsedLayout)
        // Clear the URL parameter without reloading
        url.searchParams.delete('layout')
        window.history.replaceState({}, '', url.toString())
      }
    }
  }, [])

  useEffect(() => {
    savePoolToStorage(counts)
  }, [counts])

  const total = useMemo(() => poolTotal(counts), [counts])
  const canShuffleNumbers = total === NUMBERED_FACE_COUNT
  const hasLayout =
    layout.pentTerrain != null &&
    layout.pentTerrain.length === PENTAGON_COUNT &&
    layout.hexTerrain != null &&
    layout.hexTerrain.length === HEXAGON_COUNT &&
    layout.pentPorts != null &&
    layout.pentPorts.length === PENTAGON_COUNT &&
    layout.hexPorts != null &&
    layout.hexPorts.length === HEXAGON_COUNT

  const handleShuffleAll = useCallback(() => {
    const result = assignFullLayout(counts)
    if (!result) return
    setLayout({
      pentTerrain: result.pentTerrain,
      hexTerrain: result.hexTerrain,
      pentPorts: result.pentPorts,
      hexPorts: result.hexPorts,
      pentagons: result.pentagons,
      hexagons: result.hexagons,
    })
  }, [counts])

  const handleShuffleNumbersOnly = useCallback(() => {
    if (!layout.pentTerrain || !layout.hexTerrain || !layout.pentPorts || !layout.hexPorts) return
    const nums = assignNumbersForLayout(
      counts,
      layout.pentTerrain,
      layout.hexTerrain,
      layout.pentPorts,
      layout.hexPorts,
    )
    if (!nums) return
    setLayout((prev) => ({
      ...prev,
      pentagons: nums.pentagons,
      hexagons: nums.hexagons,
    }))
  }, [counts, layout.pentTerrain, layout.hexTerrain, layout.pentPorts, layout.hexPorts])

  const handleClear = useCallback(() => {
    setLayout(emptyLayout())
  }, [])

  const handleLoadLayout = useCallback((loadedLayout: SerializableLayout) => {
    setLayout(loadedLayout)
  }, [])

  const currentSerializableLayout: SerializableLayout | null = useMemo(() => {
    if (!hasLayout) return null
    return {
      pentagons: layout.pentagons,
      hexagons: layout.hexagons,
      pentTerrain: layout.pentTerrain!,
      hexTerrain: layout.hexTerrain!,
      pentPorts: layout.pentPorts!,
      hexPorts: layout.hexPorts!,
    }
  }, [layout, hasLayout])

  return (
    <div className="app">
      <header className="app__header">
        <h1>Round Catan layout generator</h1>
        <p className="app__lede">
          The south-pole hexagon is left empty for the mounting rod.{' '}
          <strong>{RESOURCE_FACE_COUNT} faces</strong> carry terrain (three desert, no chip).{' '}
          <strong>{NUMBERED_FACE_COUNT} die chips</strong> go on the non-desert ones.{' '}
          <strong>Seven port-only faces</strong> (two 3:1 and five 2:1) never share a tile with
          terrain or numbers.
        </p>
      </header>

      <main className="app__main">
        <aside className="app__aside">
          <NumberPoolEditor
            counts={counts}
            onChange={setCounts}
            onResetDefault={() => setCounts(defaultPoolCounts())}
          />
          <div className="app__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleShuffleAll}
              disabled={!canShuffleNumbers}
            >
              Shuffle full layout
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleShuffleNumbersOnly}
              disabled={!canShuffleNumbers || !hasLayout}
              title={
                !hasLayout
                  ? 'Run a full shuffle first to place terrain and ports'
                  : 'Keep terrain and ports; reshuffle only the number chips'
              }
            >
              Reshuffle numbers only
            </button>
            <button type="button" className="btn btn--secondary" onClick={handleClear}>
              Clear layout
            </button>
          </div>
          <LayoutManager
            currentLayout={currentSerializableLayout}
            onLoadLayout={handleLoadLayout}
          />
        </aside>
        <Suspense fallback={<GlobeBoardLoading />}>
          <GlobeBoard
            pentagons={layout.pentagons}
            hexagons={layout.hexagons}
            pentTerrain={layout.pentTerrain}
            hexTerrain={layout.hexTerrain}
            pentPorts={layout.pentPorts}
            hexPorts={layout.hexPorts}
          />
        </Suspense>
      </main>
    </div>
  )
}

function GlobeBoardLoading() {
  return <div className="globe-board-loading">Loading board...</div>
}
