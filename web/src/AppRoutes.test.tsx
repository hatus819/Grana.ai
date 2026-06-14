/**
 * AppRoutes / auth guard tests (TDD — written before implementation)
 *
 * We test AppRoutes (the routes tree without BrowserRouter) by wrapping it
 * in MemoryRouter, so we can assert guard behaviour without a real browser.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ─── Mock the api module ──────────────────────────────────────────────────────

const mockGetAccessToken = vi.fn<() => string | null>(() => null)
const mockClearTokens = vi.fn()
const mockApiPost = vi.fn()
const mockApiGet = vi.fn()

vi.mock('./lib/api', () => ({
  api: { post: mockApiPost, get: mockApiGet },
  setTokens: vi.fn(),
  getAccessToken: mockGetAccessToken,
  clearTokens: mockClearTokens,
}))

// Stub the Pluggy widget so the real zoid/cross-domain iframe shim never loads
// in jsdom (it throws unhandled async errors that fail the vitest run).
vi.mock('react-pluggy-connect', () => ({
  PluggyConnect: () => null,
}))

const { AppRoutes } = await import('./App')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

/** Wrap AppRoutes in the providers the real App.tsx provides */
function renderRoutes(path: string) {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AppRoutes — auth guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: connect-token fetch resolves so ConnectBankPage effect settles
    mockApiPost.mockResolvedValue({ data: { accessToken: 'tok' } })
    // Default: api.get resolves with empty/minimal data so DashboardPage doesn't throw
    mockApiGet.mockResolvedValue({ data: { count: 0, results: [], balance: '0', income: '0', expenses: '0', by_category: [] } })
  })

  it('redirects unauthenticated user from /dashboard to /login', () => {
    mockGetAccessToken.mockReturnValue(null)

    renderRoutes('/dashboard')

    // Should land on login page
    expect(screen.getByRole('button', { name: /sign in|log in|entrar/i })).toBeInTheDocument()
  })

  it('renders protected /dashboard page when access token exists', () => {
    mockGetAccessToken.mockReturnValue('valid_token')

    renderRoutes('/dashboard')

    // DashboardPage heading is "Painel"
    expect(screen.getByRole('heading', { name: /painel/i })).toBeInTheDocument()
  })

  it('redirects unauthenticated user from /connect to /login', () => {
    mockGetAccessToken.mockReturnValue(null)

    renderRoutes('/connect')

    expect(screen.getByRole('button', { name: /sign in|log in|entrar/i })).toBeInTheDocument()
  })

  it('renders protected /connect page when access token exists', async () => {
    mockGetAccessToken.mockReturnValue('valid_token')

    renderRoutes('/connect')

    // Use findBy so the assertion waits for async effects to settle (avoids act() warning)
    expect(
      await screen.findByRole('heading', { name: /conectar banco|connect bank/i }),
    ).toBeInTheDocument()
  })

  it('renders /login page on /login route', () => {
    renderRoutes('/login')

    expect(screen.getByRole('button', { name: /sign in|log in|entrar/i })).toBeInTheDocument()
  })

  it('renders /register page on /register route', () => {
    renderRoutes('/register')

    expect(screen.getByRole('button', { name: /sign up|register|cadastrar/i })).toBeInTheDocument()
  })
})
