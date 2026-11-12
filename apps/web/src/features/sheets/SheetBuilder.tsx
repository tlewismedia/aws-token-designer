// SheetBuilder (FR-13): gallery + token sheet + upload/generate modals.
//
// Markup and CSS follow the source app (#63). The modals are still the #64
// adapter components until #65 replaces them with the ported forms.

import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUpload, faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons'
import ImageGallery from '../images/ImageGallery'
import UploadImageModal from '../images/UploadImageModal'
import GenerateImageModal from '../images/GenerateImageModal'
import TokenSheet from './TokenSheet'
import './SheetBuilder.css'

export default function SheetBuilder() {
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [isGenerateOpen, setIsGenerateOpen] = useState(false)

  return (
    <div className="sheet-builder-wrapper">
      <div className="sheet-builder-container">
        <div className="library">
          <div className="button-group">
            <button
              className="add-button"
              onClick={() => setIsGenerateOpen(true)}
              aria-label="Generate image"
            >
              <FontAwesomeIcon icon={faWandMagicSparkles} />
            </button>
            <button
              className="add-button"
              onClick={() => setIsUploadOpen(true)}
              aria-label="Upload image"
            >
              <FontAwesomeIcon icon={faUpload} />
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
