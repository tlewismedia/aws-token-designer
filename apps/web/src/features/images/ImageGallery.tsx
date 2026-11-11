// Image gallery (FR-6): thumbnails from presigned URLs; add-to-sheet and
// delete actions.

import { useImages, useDeleteImage } from '../../hooks/useImages'
import { useAddToken } from '../../hooks/useSheets'

export default function ImageGallery() {
  const images = useImages()
  const addToken = useAddToken()
  const deleteImage = useDeleteImage()

  if (images.isLoading) return <p className="loading">Loading images…</p>
  if (images.isError) {
    return (
      <p className="form-error">
        Could not load images: {images.error instanceof Error ? images.error.message : 'error'}
      </p>
    )
  }

  const list = images.data?.images ?? []

  if (list.length === 0) {
    return <p className="collection-placeholder">No images yet — generate or upload one above.</p>
  }

  return (
    <div className="gallery">
      {list.map((image) => (
        <figure key={image.id} className="gallery-item">
          <img
            src={image.thumbUrl}
            alt={image.name}
            loading="lazy"
            onError={(e) => {
              // Presigned URL expired or missing thumb — blank tile.
              e.currentTarget.style.visibility = 'hidden'
            }}
          />
          <figcaption>
            <span className="gallery-name" title={image.name}>
              {image.name}
            </span>
            <div className="gallery-actions">
              <button
                className="btn btn-small"
                onClick={() => addToken.mutate(image.id)}
                disabled={image.status !== 'ready'}
                title={image.status !== 'ready' ? `Image is ${image.status}` : 'Add to sheet'}
              >
                Add
              </button>
              <button
                className="btn btn-small btn-danger"
                onClick={() => {
                  if (window.confirm(`Delete “${image.name}” and remove it from all sheets?`)) {
                    deleteImage.mutate(image.id)
                  }
                }}
                title="Delete image"
              >
                Delete
              </button>
            </div>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}
