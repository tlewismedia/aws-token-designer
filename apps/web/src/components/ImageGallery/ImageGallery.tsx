// Image gallery (FR-6): thumbnails from presigned URLs; add-to-sheet and
// delete actions. Markup and overlays follow the source app (#63); unlike the
// source, mutation failures are surfaced instead of only logged.

import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faTrash } from '@fortawesome/free-solid-svg-icons'
import { useImages, useDeleteImage } from '../../hooks/useImages'
import { useAddToken, useSheets, MAX_TOKENS } from '../../hooks/useSheets'
import './ImageGallery.css'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.'
}

export default function ImageGallery() {
  const images = useImages()
  const sheets = useSheets()
  const addToken = useAddToken()
  const deleteImage = useDeleteImage()
  const [addError, setAddError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const latestSheet = sheets.latestSheet
  const sheetNotFull = latestSheet ? latestSheet.images.length < MAX_TOKENS : false

  if (images.isLoading) {
    return (
      <div className="image-gallery">
        <p className="gallery-loading">Loading images…</p>
      </div>
    )
  }

  if (images.isError) {
    return (
      <div className="image-gallery">
        <p className="error-message" role="alert">
          Failed to load images:{' '}
          {images.error instanceof Error ? images.error.message : 'unknown error'}
        </p>
      </div>
    )
  }

  const list = images.data?.images ?? []

  if (list.length === 0) {
    return (
      <div className="empty-gallery">
        <p>
          No images yet. <br />
          Generate your first image.
        </p>
      </div>
    )
  }

  async function handleAddToSheet(imageId: string): Promise<void> {
    setAddError(null)
    try {
      await addToken.mutateAsync(imageId)
    } catch (error) {
      setAddError(errorText(error))
    }
  }

  async function handleDeleteImage(imageId: string, name: string): Promise<void> {
    if (!window.confirm(`Delete “${name}” and remove it from all sheets?`)) return
    setDeleteError(null)
    try {
      await deleteImage.mutateAsync(imageId)
    } catch (error) {
      setDeleteError(errorText(error))
    }
  }

  return (
    <div className="image-gallery">
      <h3>Your Generated Images ({list.length})</h3>

      {addError && (
        <p className="error-message" role="alert">
          Could not add image: {addError}
        </p>
      )}
      {deleteError && (
        <p className="error-message" role="alert">
          Could not delete image: {deleteError}
        </p>
      )}

      <ul className="image-list">
        {list.map((image) => (
          <li key={image.id} className="image-item">
            {image.thumbUrl && (
              <div>
                <div className="image-thumbnail">
                  <img
                    src={image.thumbUrl}
                    alt={image.name}
                    onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }}
                  />
                  <div className="thumb-buttons">
                    {sheetNotFull && (
                      <button
                        onClick={() => void handleAddToSheet(image.id)}
                        aria-label="Add to sheet"
                        disabled={image.status !== 'ready' || addToken.isPending}
                        title={
                          image.status === 'ready'
                            ? 'Add to sheet'
                            : `Image is ${image.status}`
                        }
                      >
                        <FontAwesomeIcon icon={faPlus} />
                      </button>
                    )}

                    <button
                      onClick={() => void handleDeleteImage(image.id, image.name)}
                      aria-label="Delete image"
                      disabled={deleteImage.isPending}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
