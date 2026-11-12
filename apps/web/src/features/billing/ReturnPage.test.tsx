// Return-page fulfillment states (FR-12): fulfilled, pending (refresh),
// failed, unknown (403/404/missing session), and a generic error.

import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ useCheckoutStatus: vi.fn() }))

vi.mock('../../hooks/useCheckout', () => ({
  useCheckoutStatus: mocks.useCheckoutStatus,
}))

import { ApiError } from '../../lib/api'
import ReturnPage from './ReturnPage'

function query(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
    ...overrides,
  }
}

function renderPage(search = '?session_id=cs_test_1') {
  return render(
    <MemoryRouter initialEntries={[`/return${search}`]}>
      <ReturnPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mocks.useCheckoutStatus.mockReset()
})

describe('ReturnPage', () => {
  it('shows the source success copy when fulfillment succeeded', () => {
    mocks.useCheckoutStatus.mockReturnValue(
      query({ data: { status: 'succeeded', creditsGranted: 10 } }),
    )
    renderPage()

    expect(screen.getByText(/Payment received and credits have been applied/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'orders@example.com' })).toHaveAttribute(
      'href',
      'mailto:orders@example.com',
    )
  })

  it('shows a pending state and refetches on Refresh', () => {
    const refetch = vi.fn()
    mocks.useCheckoutStatus.mockReturnValue(
      query({ data: { status: 'pending', creditsGranted: 0 }, refetch }),
    )
    renderPage()

    expect(screen.getByText(/still processing your credits/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('shows a fulfillment_failed state for a failed payment record', () => {
    mocks.useCheckoutStatus.mockReturnValue(
      query({ data: { status: 'failed', creditsGranted: 0 } }),
    )
    renderPage()

    expect(
      screen.getByText(/could not apply your credits automatically/),
    ).toBeInTheDocument()
  })

  it('treats a 403 as an unknown order, never showing payment data', () => {
    mocks.useCheckoutStatus.mockReturnValue(
      query({ isError: true, error: new ApiError(403, 'FORBIDDEN', 'no') }),
    )
    renderPage()

    expect(screen.getByText(/could not find that order/)).toBeInTheDocument()
    expect(screen.queryByText(/credits have been applied/)).not.toBeInTheDocument()
  })

  it('treats a 404 as an unknown order', () => {
    mocks.useCheckoutStatus.mockReturnValue(
      query({ isError: true, error: new ApiError(404, 'NOT_FOUND', 'no') }),
    )
    renderPage()

    expect(screen.getByText(/could not find that order/)).toBeInTheDocument()
  })

  it('asks for a session id when the query string is empty', () => {
    mocks.useCheckoutStatus.mockReturnValue(query())
    renderPage('')

    expect(screen.getByText(/needs a checkout session id/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'orders@example.com' })).toBeInTheDocument()
  })

  it('shows a retryable error for an unexpected failure', () => {
    mocks.useCheckoutStatus.mockReturnValue(
      query({ isError: true, error: new Error('network') }),
    )
    renderPage()

    expect(screen.getByText(/could not check this order/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })

  it('shows a loading state while the first status request is in flight', () => {
    mocks.useCheckoutStatus.mockReturnValue(query({ isPending: true }))
    renderPage()

    expect(screen.getByText(/Checking payment status/)).toBeInTheDocument()
  })
})
