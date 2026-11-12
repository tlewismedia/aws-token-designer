// SheetBuilder (FR-13): gallery + token sheet + upload/generate modals.
//
// Markup and CSS follow the source app. The ported forms live inside the
// source-style children-only Modal (issue #65).

import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUpload, faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons'
import Modal from '../Modal/Modal'
import ImageGallery from '../ImageGallery/ImageGallery'
import GenerateImageForm from '../GenerateImageForm/GenerateImageForm'
import UploadImageForm from '../UploadImageForm/UploadImageForm'
import TokenSheet from '../TokenSheet/TokenSheet'
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

      <Modal isOpen={isGenerateOpen} onClose={() => setIsGenerateOpen(false)}>
        <GenerateImageForm />
      </Modal>

      <Modal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)}>
        <UploadImageForm />
      </Modal>
    </div>
  )
}
