/**
 * RegisterPage tests (TDD — written before implementation)
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

const { default: RegisterPage } = await import('./RegisterPage')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/dashboard" element={<div>Dashboard Page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls api.post with auth/register/ and required fields on submit', async () => {
    mockApiPost.mockResolvedValueOnce({
      data: {
        user: { id: 2, email: 'new@example.com', phone: null, cpf: null },
        tokens: { access: 'acc', refresh: 'ref' },
      },
    })

    renderRegister()

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'new@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'strongpass1' },
    })
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'strongpass1' },
    })
    fireEvent.click(screen.getByRole('button', { name: /sign up|register|cadastrar/i }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('auth/register/', {
        email: 'new@example.com',
        password: 'strongpass1',
        password_confirm: 'strongpass1',
      })
    })
  })

  it('includes phone and cpf when provided', async () => {
    mockApiPost.mockResolvedValueOnce({
      data: {
        user: { id: 2, email: 'new@example.com', phone: '11999999999', cpf: '12345678901' },
        tokens: { access: 'acc', refresh: 'ref' },
      },
    })

    renderRegister()

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'new@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'strongpass1' },
    })
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'strongpass1' },
    })
    fireEvent.change(screen.getByLabelText(/phone/i), {
      target: { value: '11999999999' },
    })
    fireEvent.change(screen.getByLabelText(/cpf/i), {
      target: { value: '12345678901' },
    })
    fireEvent.click(screen.getByRole('button', { name: /sign up|register|cadastrar/i }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('auth/register/', {
        email: 'new@example.com',
        password: 'strongpass1',
        password_confirm: 'strongpass1',
        phone: '11999999999',
        cpf: '12345678901',
      })
    })
  })

  it('omits phone and cpf from payload when left blank', async () => {
    mockApiPost.mockResolvedValueOnce({
      data: {
        user: { id: 2, email: 'new@example.com', phone: null, cpf: null },
        tokens: { access: 'acc', refresh: 'ref' },
      },
    })

    renderRegister()

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'new@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'strongpass1' },
    })
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'strongpass1' },
    })
    // Leave phone and cpf blank
    fireEvent.click(screen.getByRole('button', { name: /sign up|register|cadastrar/i }))

    await waitFor(() => {
      const call = mockApiPost.mock.calls[0]
      expect(call[1]).not.toHaveProperty('phone')
      expect(call[1]).not.toHaveProperty('cpf')
    })
  })

  it('stores tokens and navigates to /dashboard on success', async () => {
    mockApiPost.mockResolvedValueOnce({
      data: {
        user: { id: 2, email: 'new@example.com', phone: null, cpf: null },
        tokens: { access: 'acc', refresh: 'ref' },
      },
    })

    renderRegister()

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'new@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'strongpass1' },
    })
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'strongpass1' },
    })
    fireEvent.click(screen.getByRole('button', { name: /sign up|register|cadastrar/i }))

    await waitFor(() => {
      expect(mockSetTokens).toHaveBeenCalledWith({ access: 'acc', refresh: 'ref' })
    })

    await waitFor(() => {
      expect(screen.getByText('Dashboard Page')).toBeInTheDocument()
    })
  })

  it('renders field errors on 400 response', async () => {
    const axiosError = {
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          email: ['A user with this email already exists.'],
          password: ['This password is too short. It must contain at least 8 characters.'],
        },
      },
    }
    mockApiPost.mockRejectedValueOnce(axiosError)

    renderRegister()

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'existing@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'short' },
    })
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'short' },
    })
    fireEvent.click(screen.getByRole('button', { name: /sign up|register|cadastrar/i }))

    await waitFor(() => {
      expect(
        screen.getByText('A user with this email already exists.'),
      ).toBeInTheDocument()
      expect(
        screen.getByText('This password is too short. It must contain at least 8 characters.'),
      ).toBeInTheDocument()
    })
  })

  it('renders non_field_errors on 400 response', async () => {
    const axiosError = {
      isAxiosError: true,
      response: {
        status: 400,
        data: { non_field_errors: ['Passwords do not match.'] },
      },
    }
    mockApiPost.mockRejectedValueOnce(axiosError)

    renderRegister()

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'new@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'strongpass1' },
    })
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'differentpass' },
    })
    fireEvent.click(screen.getByRole('button', { name: /sign up|register|cadastrar/i }))

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match.')).toBeInTheDocument()
    })
  })
})
