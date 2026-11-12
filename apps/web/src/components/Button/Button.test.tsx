import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Button from './Button'

describe('Button', () => {
  it('renders a medium button with the source `.button` classes by default', () => {
    render(<Button>Click me</Button>)

    const button = screen.getByRole('button', { name: 'Click me' })
    expect(button).toHaveClass('button', 'button--medium')
    expect(button).toHaveAttribute('type', 'button')
  })

  it.each(['small', 'medium', 'large'] as const)('supports the %s size', (size) => {
    render(<Button size={size}>Button</Button>)

    expect(screen.getByRole('button')).toHaveClass(`button--${size}`)
  })

  it('merges a caller className and forwards native button props', async () => {
    const onClick = vi.fn()
    render(
      <Button className="modal-close-button" onClick={onClick} disabled>
        Close
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Close' })
    expect(button).toHaveClass('button', 'button--medium', 'modal-close-button')
    expect(button).toBeDisabled()

    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('allows overriding the button type', () => {
    render(<Button type="submit">Submit</Button>)

    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })
})
