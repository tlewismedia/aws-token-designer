// Upload image form (FR-5, issue #65): source Name/Description/dropzone
// layout, client-side type + 10 MB checks, then presign → S3 PUT → complete
// (server strips EXIF and makes the thumbnail).

import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import {
  IMAGE_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
} from '@aws-token-designer/shared/constants'
import { useUploadImage } from '../../hooks/useImages'
import './UploadImageForm.css'

const ACCEPTED = IMAGE_CONTENT_TYPES.join(',')

export default function UploadImageForm() {
  const upload = useUploadImage()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (file) selectFile(file)
  }

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) selectFile(file)
  }

  const selectFile = (file: File) => {
    if (!(IMAGE_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      setError('Only PNG, JPEG, WebP, or GIF images are supported')
      return
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setError('File size must be less than 10MB')
      return
    }

    setSelectedFile(file)
    setError('')

    // Auto-populate the name from the filename when the field is still empty.
    if (!name) {
      setName(file.name.replace(/\.[^/.]+$/, ''))
    }
  }

  const handleClick = () => {
    if (!upload.isPending) fileInputRef.current?.click()
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!selectedFile) {
      setError('Please select an image to upload')
      return
    }

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Please enter a name for the image')
      return
    }

    setError('')
    setSuccess('')

    try {
      await upload.mutateAsync({
        file: selectedFile,
        name: trimmedName,
        ...(description.trim() ? { description: description.trim() } : {}),
      })
      setSuccess('Image uploaded successfully!')
      setName('')
      setDescription('')
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload image. Please try again.')
    }
  }

  return (
    <div className="upload-image-form-container">
      <form className="upload-image-form" onSubmit={(e) => void handleSubmit(e)}>
        <h2 id="modal-title">Upload Image</h2>

        <div className="form-group">
          <label htmlFor="upload-name">Name *</label>
          <input
            type="text"
            id="upload-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter image name"
            maxLength={100}
            disabled={upload.isPending}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="upload-description">Description (optional)</label>
          <textarea
            id="upload-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description for this image"
            rows={3}
            maxLength={500}
            disabled={upload.isPending}
          />
        </div>

        <div className="form-group">
          <label>Image *</label>
          <div
            className={[
              'dropzone',
              isDragging ? 'dragging' : '',
              upload.isPending ? 'uploading' : '',
              selectedFile ? 'has-file' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={handleClick}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED}
              onChange={handleFileInput}
              style={{ display: 'none' }}
            />
            {selectedFile ? (
              <div className="file-selected">
                <p className="file-name">{selectedFile.name}</p>
                <p className="file-size">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            ) : (
              <>
                <p className="dropzone-text">
                  Drag and drop an image here, or click to browse
                </p>
                <p className="dropzone-hint">
                  Supports: PNG, JPEG, WebP, GIF (Max 10MB)
                </p>
              </>
            )}
          </div>
        </div>

        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="success-message" role="status">
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={upload.isPending || !selectedFile}
          className="upload-button"
        >
          {upload.isPending ? 'Uploading...' : 'Upload'}
        </button>
      </form>
    </div>
  )
}
