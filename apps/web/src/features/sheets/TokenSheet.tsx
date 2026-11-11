// Token sheet (FR-8, FR-9, FR-11): 7×9 grid = up to 63 tokens, print-ready.

import { useMemo, useRef, useState } from 'react'
import type { ImageWithUrls } from '@aws-token-designer/shared'
import { useSheets, useRemoveToken, useClearSheet, useCreateSheet, MAX_TOKENS } from '../../hooks/useSheets'
import { useImages } from '../../hooks/useImages'

function Token({
  url,
  index,
  onRemove,
  onImageReady,
}: {
  url: string | undefined
  index: number
  onRemove: (index: number) => void
  onImageReady: () => void
}) {
  return (
    <div className="token">
      {url && (
        <img
          src={url}
          alt=""
          loading="eager"
          decoding="sync"
          onLoad={onImageReady}
          onError={onImageReady}
        />
      )}
      <button
        className="remove-token"
        onClick={() => onRemove(index)}
        aria-label={`Remove token ${index + 1}`}
      >
        ×
      </button>
    </div>
  )
}

export default function TokenSheet() {
  const sheets = useSheets()
  const images = useImages()
  const removeToken = useRemoveToken()
  const clearSheet = useClearSheet()
  const createSheet = useCreateSheet()

  const sheet = sheets.latestSheet
  const imageMap = useMemo(() => {
    const map = new Map<string, ImageWithUrls>()
    for (const image of images.data?.images ?? []) map.set(image.id, image)
    return map
  }, [images.data])

  const imageUrls = (sheet?.images ?? [])
    .map((id) => imageMap.get(id)?.thumbUrl)
    .filter((url): url is string => Boolean(url))
    .slice(0, MAX_TOKENS)
  const count = imageUrls.length
  const emptyCount = Math.max(0, MAX_TOKENS - count)

  // Wait for thumbnails before opening the print dialog (FR-11).
  // The signature is kept in state with the count so a sheet change never
  // needs a setState-in-effect reset (react-hooks/set-state-in-effect).
  const [loaded, setLoaded] = useState<{ sig: string; count: number }>({ sig: '', count: 0 })
  const loadedIndexes = useRef<{ sig: string; seen: Set<number> }>({ sig: '', seen: new Set() })
  const signature = useMemo(() => imageUrls.join('|'), [imageUrls])
  const ready = count === 0 || (loaded.sig === signature && loaded.count >= count)

  const handleImageReady = (index: number) => {
    const current = loadedIndexes.current
    if (current.sig !== signature) {
      current.sig = signature
      current.seen = new Set<number>()
    }
    if (current.seen.has(index)) return
    current.seen.add(index)
    setLoaded({ sig: signature, count: current.seen.size })
  }

  const handlePrint = () => {
    window.print()
  }

  if (sheets.isLoading || images.isLoading) {
    return (
      <div className="token-sheet-container">
        <h2>Token Sheet</h2>
        <p className="loading">Loading…</p>
      </div>
    )
  }

  if (sheets.isError || images.isError) {
    return (
      <div className="token-sheet-container">
        <h2>Token Sheet</h2>
        <p className="form-error">Failed to load the token sheet. Try refreshing.</p>
      </div>
    )
  }

  if (!sheet) {
    return (
      <div className="token-sheet-container">
        <h2>Token Sheet</h2>
        <button
          className="btn btn-primary"
          onClick={() => createSheet.mutate('Default Sheet')}
          disabled={createSheet.isPending}
        >
          Add Token Sheet
        </button>
      </div>
    )
  }

  return (
    <div className="token-sheet-container">
      <div className="sheet-header">
        <h2>Token Sheet</h2>
        <div className="top-buttons">
          <button className="btn" onClick={handlePrint} disabled={!ready}>
            {ready ? 'Print' : 'Loading thumbnails…'}
          </button>
          <button
            className="btn"
            onClick={() => clearSheet.mutate()}
            disabled={clearSheet.isPending || sheet.images.length === 0}
          >
            Clear
          </button>
        </div>
      </div>
      <div className="sheet-info">
        <p>
          <strong>Count:</strong> {sheet.images.length}/{MAX_TOKENS}
        </p>
        <p>
          <strong>Template:</strong> {sheet.template}
        </p>
      </div>
      <div className="printable">
        <div className="image-grid">
          {imageUrls.map((url, i) => (
            <Token
              key={`${i}-${url}`}
              url={url}
              index={i}
              onRemove={(index) => removeToken.mutate(index)}
              onImageReady={() => handleImageReady(i)}
            />
          ))}
          {Array.from({ length: emptyCount }, (_, i) => (
            <div key={`empty-${i}`} className="empty-token" />
          ))}
        </div>
      </div>
    </div>
  )
}
