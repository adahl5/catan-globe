import { useCallback, useEffect, useState } from 'react'
import {
  type SerializableLayout,
  type SavedLayout,
  saveLayout as saveLayoutToStorage,
  loadSavedLayouts,
  deleteSavedLayout,
  getShareableUrl,
  serializeLayout,
  deserializeLayout,
} from '../globe'

interface LayoutManagerProps {
  currentLayout: SerializableLayout | null
  onLoadLayout: (layout: SerializableLayout) => void
}

export function LayoutManager({ currentLayout, onLoadLayout }: LayoutManagerProps) {
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>([])
  const [saveName, setSaveName] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [importValue, setImportValue] = useState('')
  const [importError, setImportError] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  useEffect(() => {
    setSavedLayouts(loadSavedLayouts())
  }, [isExpanded])

  const handleSave = useCallback(() => {
    if (!currentLayout || !saveName.trim()) return
    saveLayoutToStorage(saveName.trim(), currentLayout)
    setSaveName('')
    setSavedLayouts(loadSavedLayouts())
  }, [currentLayout, saveName])

  const handleDeleteRequest = useCallback((id: string) => {
    setDeleteConfirmId(id)
  }, [])

  const handleDeleteConfirm = useCallback(() => {
    if (deleteConfirmId) {
      deleteSavedLayout(deleteConfirmId)
      setSavedLayouts(loadSavedLayouts())
    }
    setDeleteConfirmId(null)
  }, [deleteConfirmId])

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirmId(null)
  }, [])

  const handleCopyUrl = useCallback(async () => {
    if (!currentLayout) return
    const url = getShareableUrl(currentLayout)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select text for manual copy
      prompt('Copy this URL to share:', url)
    }
  }, [currentLayout])

  const handleCopyCode = useCallback(async () => {
    if (!currentLayout) return
    const code = serializeLayout(currentLayout)
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      prompt('Copy this code to share:', code)
    }
  }, [currentLayout])

  const handleImport = useCallback(() => {
    setImportError('')
    if (!importValue.trim()) return

    const trimmed = importValue.trim()

    // Try to parse as full layout code first
    let layout = deserializeLayout(trimmed)

    // If that fails, try to extract from URL
    if (!layout) {
      try {
        const url = new URL(trimmed)
        const layoutParam = url.searchParams.get('layout')
        if (layoutParam) {
          layout = deserializeLayout(layoutParam)
        }
      } catch {
        // Not a valid URL
      }
    }

    if (layout) {
      onLoadLayout(layout)
      setImportValue('')
      setIsExpanded(false)
    } else {
      setImportError('Invalid layout code or URL')
    }
  }, [importValue, onLoadLayout])

  const canSave = currentLayout && saveName.trim()

  return (
    <div className="layout-manager">
      <button
        type="button"
        className="btn btn--secondary layout-manager__toggle"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? 'Hide save & share' : 'Save & share layout'}
      </button>

      {isExpanded && (
        <div className="layout-manager__panel">
          {/* Share section */}
          <div className="layout-manager__section">
            <h4>Share current layout</h4>
            <div className="layout-manager__buttons">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={handleCopyUrl}
                disabled={!currentLayout}
              >
                {copied ? 'Copied!' : 'Copy URL'}
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={handleCopyCode}
                disabled={!currentLayout}
              >
                Copy code
              </button>
            </div>
          </div>

          {/* Save section */}
          <div className="layout-manager__section">
            <h4>Save to browser</h4>
            <div className="layout-manager__save-row">
              <input
                type="text"
                placeholder="Layout name..."
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSave) handleSave()
                }}
                className="layout-manager__input"
              />
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleSave}
                disabled={!canSave}
              >
                Save
              </button>
            </div>
          </div>

          {/* Import section */}
          <div className="layout-manager__section">
            <h4>Import layout</h4>
            <div className="layout-manager__import-row">
              <input
                type="text"
                placeholder="Paste layout code or URL..."
                value={importValue}
                onChange={(e) => {
                  setImportValue(e.target.value)
                  setImportError('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleImport()
                }}
                className="layout-manager__input"
              />
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleImport}
                disabled={!importValue.trim()}
              >
                Import
              </button>
            </div>
            {importError && (
              <p className="layout-manager__error">{importError}</p>
            )}
          </div>
        </div>
      )}

      {/* Saved layouts list - always visible */}
      {savedLayouts.length > 0 && (
        <div className="layout-manager__saved-section">
          <h4>Saved layouts ({savedLayouts.length})</h4>
          <ul className="layout-manager__list">
            {savedLayouts.map((saved) => (
              <li key={saved.id} className="layout-manager__item">
                <button
                  type="button"
                  className="layout-manager__load-btn"
                  onClick={() => onLoadLayout(saved.layout)}
                  title="Load this layout"
                >
                  <span className="layout-manager__name">{saved.name}</span>
                  <span className="layout-manager__date">
                    {new Date(saved.createdAt).toLocaleDateString()}
                  </span>
                </button>
                {deleteConfirmId === saved.id ? (
                  <div className="layout-manager__confirm">
                    <span className="layout-manager__confirm-text">Delete?</span>
                    <button
                      type="button"
                      className="btn btn--primary layout-manager__confirm-btn"
                      onClick={handleDeleteConfirm}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary layout-manager__confirm-btn"
                      onClick={handleDeleteCancel}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="layout-manager__delete-btn"
                    onClick={() => handleDeleteRequest(saved.id)}
                    title="Delete"
                    aria-label={`Delete ${saved.name}`}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
