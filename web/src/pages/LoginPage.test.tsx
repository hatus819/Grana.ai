/**
 * LoginPage tests (TDD — written before implementation)
 *
 * Mocks:
 * - src/lib/api  →  spyable api.post + token helpers
 * - react-router →  useNavigate spy so we can assert navigation without a full
 *                   browser history
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'

// ─── Mock the api module ──────────────────────────────────────────────────────

const mockApiPost = vi.fn()
const mockSetTokens = vi.fn()
const mockGetAccessToken = vi.fn<() => string | null>(() => null)
const mockClearTokens = vi.fn()

vi.mock('../lib/api', () => ({
  api: { post: mockApiPost },
  setTokens: mockSetTokens,
  getAccessToken: mockGetAccessToken,
  clearTokens: mockClearTokens,
}))

// Lazy import AFTER mock is registered
const { default: LoginPage } = await import('./LoginPage')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<div>Dashboard Page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls api.post with auth/login/ and credentials on submit', async () => {
    mockApiPost.mockResolvedValueOnce({
      data: {
        user: { id: 1, email: 'test@example.com', phone: null, cpf: null },
        tokens: { access: 'access123', refresh: 'refresh456' },
      },
    })

    renderLogin()

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /sign in|log in|entrar/i }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('auth/login/', {
        email: 'test@example.com',
        password: 'secret123',
      })
    })
  })

  it('stores tokens via setTokens and navigates to /dashboard on success', async () => {
    mockApiPost.mockResolvedValueOnce({
      data: {
        user: { id: 1, email: 'test@example.com', phone: null, cpf: null },
        tokens: { access: 'access123', refresh: 'refresh456' },
      },
    })

    renderLogin()

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /sign in|log in|entrar/i }))

    await waitFor(() => {
      expect(mockSetTokens).toHaveBeenCalledWith({ access: 'access123', refresh: 'refresh456' })
    })

    // Navigation occurred — dashboard route renders
    await waitFor(() => {
      expect(screen.getByText('Dashboard Page')).toBeInTheDocument()
    })
  })

  it('renders non_field_errors on 400 response', async () => {
    const axiosError = {
      isAxiosError: true,
      response: {
        status: 400,
        data: { non_field_errors: ['Unable to log in with provided credentials.'] },
      },
    }
    mockApiPost.mockRejectedValueOnce(axiosError)

    renderLogin()

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'wrong@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'wrongpass' },
    })
    fireEvent.click(screen.getByRole('button', { name: /sign in|log in|entrar/i }))

    await waitFor(() => {
      expect(
        screen.getByText('Unable to log in with provided credentials.'),
      ).toBeInTheDocument()
    })
  })

  it('renders field-level errors on 400 response', async () => {
    const axiosError = {
      isAxiosError: true,
      response: {
        status: 400,
        data: { email: ['Enter a valid email address.'], password: ['This field is required.'] },
      },
    }
    mockApiPost.mockRejectedValueOnce(axiosError)

    renderLogin()

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'notanemail' },
    })
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: /sign in|log in|entrar/i }))

    await waitFor(() => {
      expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
      expect(screen.getByText('This field is required.')).toBeInTheDocument()
    })
  })
})
