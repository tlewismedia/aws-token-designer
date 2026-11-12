// Token sheet (FR-8, FR-9, FR-11): 7×9 grid = up to 63 tokens, print-ready.
// Markup and print CSS follow the source app (#63). Removal stays index-aligned
// with `sheet.images`, including ids whose image is no longer in the gallery.

import { useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPrint, faTrash } from '@fortawesome/free-solid-svg-icons'
import type { ImageWithUrls } from '@aws-token-designer/shared'
import Button from '../../components/Button/Button'
import {
  useSheets,
  useRemoveToken,
  useClearSheet,
  useCreateSheet,
  MAX_TOKENS,
} from '../../hooks/useSheets'
import { useImages } from '../../hooks/useImages'
import TokenSheetToken from './TokenSheetToken'
import './TokenSheet.css'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.'
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

  // One tile per entry in `sheet.images` — including unresolved ids — so the
  // remove handler receives the index the server will act on.
  const tokens = (sheet?.images ?? []).slice(0, MAX_TOKENS).map((imageId, index) => ({
    imageId,
    index,
    url: imageMap.get(imageId)?.thumbUrl,
  }))
  const emptyCount = Math.max(0, MAX_TOKENS - tokens.length)

  // Wait for thumbnails before opening the print dialog (FR-11). Readiness is
  // tracked per loaded URL, not per sheet signature, so adding/removing tokens
  // never makes already-rendered images look unloaded: their `onLoad` will not
  // fire again unless the browser remounts them.
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(() => new Set())
  const loadableCount = tokens.filter((token) => Boolean(token.url)).length
  const loadedCount = tokens.filter(
    (token) => token.url && loadedUrls.has(token.url),
  ).length
  const ready = loadedCount >= loadableCount

  const handleImageReady = (url: string) => {
    setLoadedUrls((previous) => {
      if (previous.has(url)) return previous
      const next = new Set(previous)
      next.add(url)
      return next
    })
  }

  const handleAdd = () => {
    createSheet.mutate('Default Sheet')
  }

  const handleClear = () => {
    clearSheet.mutate()
  }

  const handleDelete = async (_sheetId: string, index: number) => {
    try {
      await removeToken.mutateAsync(index)
    } catch {
      // The mutation error is rendered above; swallow the rejection so the
      // click handler does not produce an unhandled promise rejection.
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const actionError = removeToken.error ?? clearSheet.error

  if (sheets.isLoading || images.isLoading) {
    return (
      <div className="token-sheet-container">
        <h2>Token Sheet</h2>
        <p>Loading...</p>
      </div>
    )
  }

  if (sheets.isError || images.isError) {
    return (
      <div className="token-sheet-container">
        <h2>Token Sheet</h2>
        <p className="error-message" role="alert">
          Failed to load the token sheet. Try refreshing.
        </p>
      </div>
    )
  }

  if (!sheet) {
    return (
      <div className="token-sheet-container">
        <h2>Token Sheet</h2>
        <Button onClick={handleAdd} disabled={createSheet.isPending}>
          Add Token Sheet
        </Button>
        <p>No token sheets found. Create one to get started!</p>
        {createSheet.error && (
          <p className="error-message" role="alert">
            Could not create token sheet: {errorText(createSheet.error)}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="token-sheet-container">
      <div className="sheet-header">
        <div className="top-buttons">
          <Button
            onClick={handleClear}
            size="small"
            aria-label="Clear sheet"
            title="Clear sheet"
            disabled={clearSheet.isPending}
          >
            <FontAwesomeIcon icon={faTrash} />
          </Button>
          <Button
            onClick={handlePrint}
            size="small"
            aria-label="Print"
            disabled={!ready}
            title={
              ready
                ? 'Print sheet'
                : `Preparing images (${loadedCount}/${loadableCount})`
            }
          >
            <FontAwesomeIcon icon={faPrint} />
          </Button>
        </div>
      </div>

      {actionError && (
        <p className="error-message" role="alert">
          Could not update the sheet: {errorText(actionError)}
        </p>
      )}

      <div className="printable">
        <div className="image-grid">
          {tokens.map((token) => (
            <TokenSheetToken
              key={`${token.index}-${token.imageId}`}
              url={token.url}
              index={token.index}
              sheetId={sheet.id}
              handleDelete={handleDelete}
              onImageReady={handleImageReady}
            />
          ))}

          {Array.from({ length: emptyCount }, (_, index) => (
            <div key={`empty-${index}`} className="empty-token" />
          ))}
        </div>
      </div>
    </div>
  )
}
