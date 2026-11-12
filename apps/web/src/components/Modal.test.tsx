import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Modal from './Modal'

function renderModal(children = <p>Modal body</p>) {
  return render(
    <Modal isOpen onClose={() => {}}>
      {children}
    </Modal>,
  )
}

afterEach(() => {
  document.body.style.overflow = ''
})

describe('Modal', () => {
  it('renders nothing while closed and the content card while open', () => {
    const { rerender } = render(
      <Modal isOpen={false} onClose={() => {}}>
        <p>Modal body</p>
      </Modal>,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(
      <Modal isOpen onClose={() => {}}>
        <p>Modal body</p>
      </Modal>,
    )

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Modal body')).toBeInTheDocument()
  })

  it('closes on an outside mousedown but not on a click inside', () => {
    const onClose = vi.fn()
    render(
      <Modal isOpen onClose={onClose}>
        <p>Modal body</p>
      </Modal>,
    )

    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape and on the × button', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <Modal isOpen onClose={onClose}>
        <p>Modal body</p>
      </Modal>,
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('locks body scroll while open and restores it afterwards', () => {
    document.body.style.overflow = 'auto'

    const { rerender } = render(
      <Modal isOpen onClose={() => {}}>
        <p>Modal body</p>
      </Modal>,
    )
    expect(document.body.style.overflow).toBe('hidden')

    rerender(
      <Modal isOpen={false} onClose={() => {}}>
        <p>Modal body</p>
      </Modal>,
    )
    expect(document.body.style.overflow).toBe('auto')
  })

  it('moves focus to the first field on open', () => {
    renderModal(<input aria-label="First field" />)

    expect(screen.getByLabelText('First field')).toHaveFocus()
  })
})
