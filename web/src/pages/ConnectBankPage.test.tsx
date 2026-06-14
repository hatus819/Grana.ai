/**
 * ConnectBankPage tests (TDD — written before implementation)
 *
 * Strategy:
 * - Mock `react-pluggy-connect`: PluggyConnect renders a div+buttons so we can
 *   assert props (connectToken, includeSandbox) and trigger onSuccess/onError.
 * - Mock `../lib/api` so api.post / api.get are vi.fn() spies.
 * - Mock react-router's useNavigate to capture navigation calls.
 *
 * Tests A + B: component-level tests (token fetch, widget props, connect POST).
 * Tests C + D: unit tests on the exported `runSyncAndCategorize` helper.
 *   Rationale: fake timers + waitFor don't compose cleanly (waitFor uses
 *   setTimeout internally and hangs when fake timers replace it). The task
 *   explicitly allows testing the orchestration via an extracted helper.
 *   The helper is tested with a no-op sleep so no timers are needed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ─── Capture widget props so tests can assert them ────────────────────────────

let capturedConnectToken: string | undefined
let capturedIncludeSandbox: boolean | undefined

vi.mock('react-pluggy-connect', () => ({
  PluggyConnect: (props: {
    connectToken: string
    includeSandbox?: boolean
    onSuccess: (itemData: { item: { id: string } }) => void
    onError: (error: { message: string }) => void
  }) => {
    capturedConnectToken = props.connectToken
    capturedIncludeSandbox = props.includeSandbox
    return (
      <div
        data-testid="pluggy-widget"
        data-connect-token={props.connectToken}
        data-include-sandbox={String(props.includeSandbox)}
      >
        <button
          data-testid="pluggy-success"
          onClick={() => props.onSuccess({ item: { id: 'item_123' } })}
        >
          mock-widget-success
        </button>
        <button
          data-testid="pluggy-error"
          onClick={() => props.onError({ message: 'widget error' })}
        >
          mock-widget-error
        </button>
      </div>
    )
  },
}))

// ─── Mock api module ──────────────────────────────────────────────────────────

const mockApiPost = vi.fn()
const mockApiGet = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    post: mockApiPost,
    get: mockApiGet,
  },
  getAccessToken: vi.fn(() => 'tok'),
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
}))

// ─── Mock useNavigate ─────────────────────────────────────────────────────────

const mockNavigate = vi.fn()

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// ─── Lazy import AFTER mocks registered ──────────────────────────────────────

const { default: ConnectBankPage, runSyncAndCategorize, POLL_INTERVAL_MS, MAX_POLLS } =
  await import('./ConnectBankPage')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function renderConnectBank() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={['/connect']}>
        <Routes>
          <Route path="/connect" element={<ConnectBankPage />} />
          <Route path="/dashboard" element={<div>Dashboard Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Instant sleep for unit tests (no timers needed)
const instantSleep = () => Promise.resolve()

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ConnectBankPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedConnectToken = undefined
    capturedIncludeSandbox = undefined
  })

  // ── Test A: token fetch → widget renders with correct props ─────────────────

  it('fetches connect token on mount and renders widget with connectToken and includeSandbox=true', async () => {
    mockApiPost.mockResolvedValueOnce({ data: { accessToken: 'tok' } })

    renderConnectBank()

    // Initially, the widget should not appear (loading state)
    expect(screen.queryByTestId('pluggy-widget')).not.toBeInTheDocument()

    // Wait for the token fetch to resolve and the widget to appear
    await waitFor(() => {
      expect(screen.getByTestId('pluggy-widget')).toBeInTheDocument()
    })

    // Assert api.post was called with correct endpoint
    expect(mockApiPost).toHaveBeenCalledWith('banking/connect-token/')

    // Assert widget received correct props
    expect(capturedConnectToken).toBe('tok')
    // import.meta.env.DEV is true under vitest
    expect(capturedIncludeSandbox).toBe(true)
  })

  // ── Test B: widget success → POSTs accounts/connect/ with itemId ───────────

  it('calls api.post banking/accounts/connect/ with itemId when widget succeeds', async () => {
    // First call: connect token
    mockApiPost.mockResolvedValueOnce({ data: { accessToken: 'tok' } })
    // Second call: accounts/connect/
    mockApiPost.mockResolvedValueOnce({ data: { accounts: [], sync_started: true } })
    // Third call: categorize
    mockApiPost.mockResolvedValueOnce({ data: { message: 'ok', task_id: '1' } })
    // api.get for polling — two calls to stabilize count=0
    mockApiGet.mockResolvedValue({ data: { count: 0, results: [] } })

    renderConnectBank()

    await waitFor(() => {
      expect(screen.getByTestId('pluggy-success')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('pluggy-success'))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('banking/accounts/connect/', { itemId: 'item_123' })
    })
  })

  // ── Test C: poll stabilization + categorize → navigate /dashboard ───────────
  // Tests the exported runSyncAndCategorize helper directly (no timers needed).

  it('polls transactions until count stabilizes, then categorizes and signals navigate', async () => {
    // Verify the exported constants match spec
    expect(POLL_INTERVAL_MS).toBe(3000)
    expect(MAX_POLLS).toBe(8)

    const apiGet = vi.fn()
    const apiPost = vi.fn()
    const onSyncing = vi.fn()

    // Polls: count changes on poll 1 (5), stabilizes on poll 2 (still 5)
    apiGet
      .mockResolvedValueOnce({ data: { count: 5 } })   // poll 1 — changed from -1
      .mockResolvedValueOnce({ data: { count: 5 } })   // poll 2 — same → stop

    // Categorize succeeds
    apiPost.mockResolvedValueOnce({ data: { message: 'ok', task_id: 't1' } })

    const result = await runSyncAndCategorize({
      apiGet,
      apiPost,
      sleep: instantSleep,
      onSyncing,
    })

    // Two polls should have occurred
    expect(apiGet).toHaveBeenCalledTimes(2)
    expect(apiGet).toHaveBeenCalledWith('transactions/')

    // onSyncing called with transaction counts
    expect(onSyncing).toHaveBeenCalledWith(5)

    // Categorize was called
    expect(apiPost).toHaveBeenCalledWith('transactions/categorize/')

    // Should signal navigate
    expect(result.outcome).toBe('navigated')
  })

  it('runs up to MAX_POLLS polls if count keeps changing', async () => {
    const apiGet = vi.fn()
    const apiPost = vi.fn()
    const onSyncing = vi.fn()

    // Count increments every poll — never stabilizes → runs MAX_POLLS times
    let count = 0
    apiGet.mockImplementation(() => {
      count++
      return Promise.resolve({ data: { count } })
    })

    apiPost.mockResolvedValueOnce({ data: { message: 'ok', task_id: 't1' } })

    await runSyncAndCategorize({
      apiGet,
      apiPost,
      sleep: instantSleep,
      onSyncing,
    })

    expect(apiGet).toHaveBeenCalledTimes(MAX_POLLS)
  })

  // ── Test D: categorize returns categorize_failed for 503 ────────────────────

  it('runSyncAndCategorize returns categorize_failed when categorize fails with 503', async () => {
    const apiGet = vi.fn()
    const apiPost = vi.fn()
    const onSyncing = vi.fn()

    // Polls stabilize immediately
    apiGet
      .mockResolvedValueOnce({ data: { count: 0 } })
      .mockResolvedValueOnce({ data: { count: 0 } })

    // Categorize returns 503
    apiPost.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 503, data: { error: 'Categorization service temporarily unavailable' } },
    })

    const result = await runSyncAndCategorize({
      apiGet,
      apiPost,
      sleep: instantSleep,
      onSyncing,
    })

    expect(result.outcome).toBe('categorize_failed')
  })

  // ── Fix B: categorize 500 also returns categorize_failed ────────────────────

  it('runSyncAndCategorize returns categorize_failed when categorize fails with 500', async () => {
    const apiGet = vi.fn()
    const apiPost = vi.fn()
    const onSyncing = vi.fn()

    apiGet
      .mockResolvedValueOnce({ data: { count: 0 } })
      .mockResolvedValueOnce({ data: { count: 0 } })

    apiPost.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500, data: { error: 'Internal server error' } },
    })

    const result = await runSyncAndCategorize({
      apiGet,
      apiPost,
      sleep: instantSleep,
      onSyncing,
    })

    expect(result.outcome).toBe('categorize_failed')
  })

  // ── Fix B: component shows friendly message on categorize_error ─────────────

  it('shows friendly categorize-failed message and continue-to-dashboard button in the component', async () => {
    // 1. connect token
    mockApiPost.mockResolvedValueOnce({ data: { accessToken: 'tok' } })
    // 2. accounts/connect
    mockApiPost.mockResolvedValueOnce({ data: { accounts: [], sync_started: true } })
    // 3. categorize → any error
    mockApiPost.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 503, data: { error: 'Categorization service temporarily unavailable' } },
    })

    // Polls stabilize: count=0 on both polls
    mockApiGet
      .mockResolvedValueOnce({ data: { count: 0 } })
      .mockResolvedValueOnce({ data: { count: 0 } })

    renderConnectBank()

    await waitFor(() => {
      expect(screen.getByTestId('pluggy-success')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('pluggy-success'))

    // Friendly non-blocking message should appear
    await waitFor(() => {
      expect(screen.getByText(/categorização não pôde ser concluída agora/i)).toBeInTheDocument()
    }, { timeout: 10000 })

    // A continue-to-dashboard button should be present
    const continueBtn = screen.getByRole('button', { name: /ir para o painel/i })
    expect(continueBtn).toBeInTheDocument()

    // Clicking it should navigate to /dashboard
    fireEvent.click(continueBtn)
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  // ── Fix E-1: Poll failure → hard error state (fix A) ────────────────────────

  it('poll failure during sync shows sync error message and retry button', async () => {
    // 1. connect token
    mockApiPost.mockResolvedValueOnce({ data: { accessToken: 'tok' } })
    // 2. accounts/connect
    mockApiPost.mockResolvedValueOnce({ data: { accounts: [], sync_started: true } })

    // api.get rejects on first poll
    mockApiGet.mockRejectedValueOnce(new Error('Network error'))

    renderConnectBank()

    await waitFor(() => {
      expect(screen.getByTestId('pluggy-success')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('pluggy-success'))

    await waitFor(() => {
      expect(
        screen.getByText(/não foi possível sincronizar as transações/i),
      ).toBeInTheDocument()
    }, { timeout: 10000 })

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument()
  })

  // ── Fix E-2: Connect 403 → server error message ──────────────────────────────

  it('shows 403 server error message when connect POST returns 403', async () => {
    // 1. connect token
    mockApiPost.mockResolvedValueOnce({ data: { accessToken: 'tok' } })
    // 2. accounts/connect → 403 with server message
    // axios.isAxiosError() returns true for objects with isAxiosError: true (real behaviour)
    const axiosErr = {
      isAxiosError: true,
      response: { status: 403, data: { error: 'Esta conta não pertence a você.' } },
    }
    mockApiPost.mockRejectedValueOnce(axiosErr)

    renderConnectBank()

    await waitFor(() => {
      expect(screen.getByTestId('pluggy-success')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('pluggy-success'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    // Should show the server-provided error message
    expect(
      screen.getByText(/esta conta não pertence a você|esta conexão bancária não pertence a você/i),
    ).toBeInTheDocument()
  })

  // ── Fix E-3: Connect 502 → generic import-failed message ────────────────────

  it('shows generic error message when connect POST returns 502', async () => {
    // 1. connect token
    mockApiPost.mockResolvedValueOnce({ data: { accessToken: 'tok' } })
    // 2. accounts/connect → 502
    const axiosErr = {
      isAxiosError: true,
      response: { status: 502, data: {} },
    }
    mockApiPost.mockRejectedValueOnce(axiosErr)

    renderConnectBank()

    await waitFor(() => {
      expect(screen.getByTestId('pluggy-success')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('pluggy-success'))

    await waitFor(() => {
      expect(
        screen.getByText(/não foi possível importar as contas/i),
      ).toBeInTheDocument()
    })

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  // ── Fix E-4: Widget onError → error message renders ─────────────────────────

  it('shows widget error message when pluggy widget fires onError', async () => {
    mockApiPost.mockResolvedValueOnce({ data: { accessToken: 'tok' } })

    renderConnectBank()

    await waitFor(() => {
      expect(screen.getByTestId('pluggy-error')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('pluggy-error'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(screen.getByText(/widget error/i)).toBeInTheDocument()
  })

  // ── Fix E-5: Happy-path navigate (component level) ───────────────────────────

  it('navigates to /dashboard and calls categorize POST on full success chain', async () => {
    // 1. connect token
    mockApiPost.mockResolvedValueOnce({ data: { accessToken: 'tok' } })
    // 2. accounts/connect
    mockApiPost.mockResolvedValueOnce({ data: { accounts: [], sync_started: true } })
    // 3. categorize
    mockApiPost.mockResolvedValueOnce({ data: { message: 'ok', task_id: 't1' } })
    // polls stabilize
    mockApiGet
      .mockResolvedValueOnce({ data: { count: 0 } })
      .mockResolvedValueOnce({ data: { count: 0 } })

    renderConnectBank()

    await waitFor(() => {
      expect(screen.getByTestId('pluggy-success')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('pluggy-success'))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('transactions/categorize/')
    }, { timeout: 10000 })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    }, { timeout: 10000 })
  })

  // ── Fix E-6: Token-fetch error + retry ───────────────────────────────────────

  it('shows error on token-fetch failure, then retries and renders widget on success', async () => {
    // First call: reject
    mockApiPost.mockRejectedValueOnce(new Error('Network error'))
    // Second call (retry): resolve
    mockApiPost.mockResolvedValueOnce({ data: { accessToken: 'tok_retry' } })

    renderConnectBank()

    // Wait for error alert
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(
      screen.getByText(/não foi possível iniciar a conexão bancária/i),
    ).toBeInTheDocument()

    // Click retry
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }))

    // api.post called again
    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledTimes(2)
    })

    // Widget should render on success
    await waitFor(() => {
      expect(screen.getByTestId('pluggy-widget')).toBeInTheDocument()
    })
  })
})
