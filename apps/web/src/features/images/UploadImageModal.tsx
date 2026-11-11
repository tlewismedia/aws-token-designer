// Upload flow (FR-5): drag/drop or picker, 10 MB + type checks client-side,
// then presign → S3 PUT → complete (server does EXIF strip + thumbnail).

import { useRef, useState, type DragEvent, type FormEvent } from 'react'
import Modal from '../../components/Modal'
import { useUploadImage } from '../../hooks/useImages'
import { MAX_UPLOAD_BYTES, IMAGE_CONTENT_TYPES } from '@aws-token-designer/shared'

const ACCEPTED = IMAGE_CONTENT_TYPES.join(',')

function prettyBytes(bytes: number): string {
  return `${Math.round(bytes / 1024 / 102.4) / 10} MB`
}

export default function UploadImageModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const upload = useUploadImage()
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const accept = (candidate: File | undefined) => {
    if (!candidate) return
    if (!(IMAGE_CONTENT_TYPES as readonly string[]).includes(candidate.type)) {
      setError('Only PNG, JPEG, or WebP images are supported')
      return
    }
    if (candidate.size > MAX_UPLOAD_BYTES) {
      setError(`Image is ${prettyBytes(candidate.size)} — the limit is 10 MB`)
      return
    }
    setError('')
    setFile(candidate)
    if (!name) setName(candidate.name.replace(/\.[^.]+$/, ''))
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    accept(e.dataTransfer.files?.[0])
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!file) return
    setError('')
    try {
      await upload.mutateAsync({ file, name: name || file.name })
      setFile(null)
      setName('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Upload an image">
      <form className="form" onSubmit={(e) => void handleSubmit(e)}>
        {error && <p className="form-error">{error}</p>}
        <div
          className={`dropzone${dragOver ? ' dropzone-active' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          {file ? (
            <p>{file.name} ({prettyBytes(file.size)})</p>
          ) : (
            <p>Drag an image here, or click to browse (PNG/JPEG/WebP, ≤ 10 MB)</p>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          hidden
          onChange={(e) => accept(e.target.files?.[0])}
        />
        <label htmlFor="upload-name">Name</label>
        <input
          id="upload-name"
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={!file || upload.isPending}>
          {upload.isPending ? 'Processing…' : 'Upload'}
        </button>
      </form>
    </Modal>
  )
}
