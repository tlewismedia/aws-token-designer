// Source-parity modal (issue #65): overlay + content card, small × button, and
// a children-only body. Forms own their headings; the dialog still exposes
// dialog semantics and locks body scroll while it is open.

import { useEffect, useRef, type ReactNode } from 'react'
import Button from '../Button/Button'
import './Modal.css'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
}

export default function Modal({ isOpen, onClose, children }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  // Close when the user presses the mouse outside the content card.
  useEffect(() => {
    if (!isOpen) return

    const handleMouseDown = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isOpen, onClose])

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Lock body scroll behind the overlay, restoring the previous value on close.
  useEffect(() => {
    if (!isOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  // Move focus into the dialog on open and return it to the trigger on close.
  useEffect(() => {
    if (!isOpen) return

    const modal = modalRef.current
    if (!modal) return

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null
    const firstField = modal.querySelector<HTMLElement>(
      'input, textarea, select, button:not(.modal-close-button)',
    )
    ;(firstField ?? modal).focus()

    return () => {
      previouslyFocusedRef.current?.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="modal-overlay">
      <div
        className="modal-content"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-label="Dialog"
        tabIndex={-1}
      >
        <Button
          className="modal-close-button"
          onClick={onClose}
          size="small"
          aria-label="Close dialog"
        >
          ×
        </Button>
        {children}
      </div>
    </div>
  )
}
