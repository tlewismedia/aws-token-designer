// Generation modal shell — the Stability AI pipeline lands in Phase 3
// (issue #4). Kept in the UI so the builder flow is complete.

import { useState } from 'react'
import Modal from '../../components/Modal'

export default function GenerateImageModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [style, setStyle] = useState<'photographic' | 'anime'>('photographic')

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Generate an image">
      <form className="form" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="gen-name">Name</label>
        <input id="gen-name" value={name} onChange={(e) => setName(e.target.value)} disabled />
        <label htmlFor="gen-description">Description</label>
        <textarea
          id="gen-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled
        />
        <label htmlFor="gen-style">Style</label>
        <select id="gen-style" value={style} onChange={(e) => setStyle(e.target.value as 'photographic' | 'anime')} disabled>
          <option value="photographic">Photographic</option>
          <option value="anime">Anime</option>
        </select>
        <button type="submit" className="btn btn-primary" disabled>
          Generate
        </button>
        <p className="form-note">
          Image generation arrives in Phase 3 — the upload flow is fully working today.
        </p>
      </form>
    </Modal>
  )
}
