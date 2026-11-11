// SheetBuilder (FR-13): gallery + token sheet + upload/generate modals.

import { useState } from 'react'
import ImageGallery from '../images/ImageGallery'
import UploadImageModal from '../images/UploadImageModal'
import GenerateImageModal from '../images/GenerateImageModal'
import TokenSheet from './TokenSheet'

export default function SheetBuilder() {
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [isGenerateOpen, setIsGenerateOpen] = useState(false)

  return (
    <div className="sheet-builder-wrapper">
      <div className="sheet-builder-container">
        <div className="library">
          <div className="button-group">
            <button
              className="btn btn-primary"
              onClick={() => setIsGenerateOpen(true)}
              title="Generate an image with AI"
            >
              ✨ Generate
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setIsUploadOpen(true)}
              title="Upload image"
            >
              ⬆ Upload
            </button>
          </div>
          <ImageGallery />
        </div>
        <TokenSheet />
      </div>
      <UploadImageModal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} />
      <GenerateImageModal isOpen={isGenerateOpen} onClose={() => setIsGenerateOpen(false)} />
    </div>
  )
}
