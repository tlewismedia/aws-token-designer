// Protected routes redirect to /login when unauthenticated (FR-14).

import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import ProtectedRoute from './ProtectedRoute'
import { AuthProvider } from '../contexts/AuthContext'
import { createQueryClient } from '../lib/query-client'

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/login" element={<p>login-page</p>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<p>dashboard-content</p>} />
              <Route path="/buy-credits" element={<p>buy-credits-content</p>} />
              <Route path="/return" element={<p>return-content</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  )
}

describe('ProtectedRoute', () => {
  it.each(['/dashboard', '/buy-credits', '/return'])(
    'redirects unauthenticated users from %s to /login',
    async (path) => {
      renderAt(path)
      await waitFor(() => expect(screen.getByText('login-page')).toBeInTheDocument())
      expect(screen.queryByText(path.slice(1) + '-content')).not.toBeInTheDocument()
    },
  )
})
