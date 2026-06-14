/**
 * DashboardPage tests (TDD — written before implementation)
 *
 * Strategy:
 * - Mock `../lib/api` so api.get / api.post are vi.fn() spies.
 * - Mock react-router's useNavigate.
 * - Wrap renders in QueryClientProvider (fresh client per test, retry disabled).
 * - Mock recharts to avoid ResponsiveContainer measuring 0x0 in jsdom.
 *
 * Test coverage:
 * A. Stat cards render formatBRL(parseAmount(value)) with no NaN.
 * B. Transaction list renders description + formatted amount + category chip.
 * C. Pagination: Next issues page=2 call; Prev disabled on page 1.
 * D. Sincronizar button POSTs banking/accounts/{id}/transactions/fetch/ for each active account.
 * E. Logout clears tokens and navigates to /login.
 * F. 503 on sync → friendly 503 message; non-503 error → generic message.
 * G. Loading state: no crash while data loads.
 * H. txError: transactions query failure shows error message.
 * I. Pagination: page-2 row appears and page-1 row disappears after Next click.
 * J. pollUntilStable unit tests (deterministic, injected sleepFn).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ─── Mock recharts to avoid ResponsiveContainer 0×0 jsdom issue ──────────────

vi.mock('recharts', () => ({
  PieChart: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: () => <div data-testid="pie" />,
  Cell: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}))

// ─── Mock api module ──────────────────────────────────────────────────────────

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    get: mockApiGet,
    post: mockApiPost,
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

// ─── Lazy import AFTER mocks ──────────────────────────────────────────────────

const { default: DashboardPage, pollUntilStable, SYNC_MAX_POLLS } = await import('./DashboardPage')

// ─── Test fixtures ────────────────────────────────────────────────────────────

const SUMMARY_PAYLOAD = {
  balance: '14286.90',
  income: '17000.00',
  expenses: '-2713.10',
  by_category: [
    { category: 'Serviços', color: '#3B82F6', total: '-1372.70', count: 3 },
    { category: null, color: null, total: '-1340.40', count: 2 },
  ],
  period: { start_date: '2026-06-01', end_date: '2026-06-30' },
}

const TRANSACTIONS_PAGE1 = {
  count: 42,
  results: [
    {
      id: '1',
      pluggy_transaction_id: 'pt_1',
      amount: '-50.00',
      description: 'Supermercado Extra',
      date: '2026-06-10T14:30:00Z',
      category: { id: 'c1', name: 'Alimentação', icon: '🍔', color: '#10B981' },
      is_processed: true,
    },
    {
      id: '2',
      pluggy_transaction_id: 'pt_2',
      amount: '17000.00',
      description: 'Salário',
      date: '2026-06-01T08:00:00Z',
      category: null,
      is_processed: true,
    },
  ],
}

const TRANSACTIONS_PAGE2 = {
  count: 42,
  results: [
    {
      id: '3',
      pluggy_transaction_id: 'pt_3',
      amount: '-120.00',
      description: 'Internet Fibra',
      date: '2026-06-05T10:00:00Z',
      category: { id: 'c2', name: 'Serviços', icon: '🌐', color: '#3B82F6' },
      is_processed: true,
    },
  ],
}

// Two active accounts + one inactive account
const ACCOUNTS_PAYLOAD = [
  {
    id: 'acc_1',
    pluggy_account_id: 'pluggy_acc_1',
    bank_name: 'Nubank',
    account_type: 'BANK',
    balance: '14286.90',
    is_active: true,
  },
  {
    id: 'acc_2',
    pluggy_account_id: 'pluggy_acc_2',
    bank_name: 'Itaú',
    account_type: 'BANK',
    balance: '5000.00',
    is_active: true,
  },
  {
    id: 'acc_3',
    pluggy_account_id: 'pluggy_acc_3',
    bank_name: 'Bradesco',
    account_type: 'BANK',
    balance: '0.00',
    is_active: false,
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function renderDashboard() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default api.get responses
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('dashboard/summary')) {
        return Promise.resolve({ data: SUMMARY_PAYLOAD })
      }
      if (url.includes('transactions/')) {
        return Promise.resolve({ data: TRANSACTIONS_PAGE1 })
      }
      if (url.includes('banking/accounts')) {
        return Promise.resolve({ data: ACCOUNTS_PAYLOAD })
      }
      return Promise.resolve({ data: {} })
    })

    mockApiPost.mockResolvedValue({ data: { message: 'ok', task_id: 'task_1' } })
  })

  // ── Test A: Stat cards render formatBRL(parseAmount(value)) with no NaN ──────

  it('renders stat card for Saldo with correct BRL value (no NaN)', async () => {
    renderDashboard()

    // "Painel" heading should render immediately (even during loading)
    expect(screen.getByRole('heading', { name: /painel/i })).toBeInTheDocument()

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('R$ 14.286,90')).toBeInTheDocument()
    })
  })

  it('renders stat card for Receitas with correct BRL value', async () => {
    renderDashboard()

    // income is R$ 17.000,00 — must appear at least once (also appears in tx list; use getAllBy)
    await waitFor(() => {
      const elements = screen.getAllByText('R$ 17.000,00')
      expect(elements.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders stat card for Despesas with negative BRL value (expenses are negative)', async () => {
    renderDashboard()

    await waitFor(() => {
      // expenses is "-2713.10" → formatBRL(parseAmount("-2713.10")) → "-R$ 2.713,10"
      expect(screen.getByText('-R$ 2.713,10')).toBeInTheDocument()
    })
  })

  // ── Test B: Transaction list renders rows ─────────────────────────────────────

  it('renders transaction description and formatted amount', async () => {
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Supermercado Extra')).toBeInTheDocument()
    })

    expect(screen.getByText('-R$ 50,00')).toBeInTheDocument()
    expect(screen.getByText('Salário')).toBeInTheDocument()
    // R$ 17.000,00 appears twice (stat card + tx row) — use getAllBy
    expect(screen.getAllByText('R$ 17.000,00').length).toBeGreaterThanOrEqual(1)
  })

  it('renders category chip for transactions with a category', async () => {
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Alimentação')).toBeInTheDocument()
    })
  })

  it('renders "Sem categoria" chip for transactions without a category', async () => {
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Sem categoria')).toBeInTheDocument()
    })
  })

  // ── Test C: Pagination ────────────────────────────────────────────────────────

  it('disables Prev button on page 1', async () => {
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Supermercado Extra')).toBeInTheDocument()
    })

    const prevBtn = screen.getByRole('button', { name: /anterior/i })
    expect(prevBtn).toBeDisabled()
  })

  it('clicking Next requests page 2 and shows second page results', async () => {
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Supermercado Extra')).toBeInTheDocument()
    })

    // Switch mock to return page 2
    mockApiGet.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
      const page = config?.params?.page ?? 1
      if (url.includes('dashboard/summary')) {
        return Promise.resolve({ data: SUMMARY_PAYLOAD })
      }
      if (url.includes('banking/accounts')) {
        return Promise.resolve({ data: ACCOUNTS_PAYLOAD })
      }
      if (url.includes('transactions/')) {
        if (page === 2) {
          return Promise.resolve({ data: TRANSACTIONS_PAGE2 })
        }
        return Promise.resolve({ data: TRANSACTIONS_PAGE1 })
      }
      return Promise.resolve({ data: {} })
    })

    const nextBtn = screen.getByRole('button', { name: /próxima/i })
    fireEvent.click(nextBtn)

    // Should have called api.get with page=2
    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith(
        'transactions/',
        expect.objectContaining({ params: expect.objectContaining({ page: 2 }) }),
      )
    })
  })

  it('disables Next button on the last page', async () => {
    // count=2, limit=20 → only 1 page
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('dashboard/summary')) {
        return Promise.resolve({ data: SUMMARY_PAYLOAD })
      }
      if (url.includes('transactions/')) {
        return Promise.resolve({ data: { count: 2, results: TRANSACTIONS_PAGE1.results } })
      }
      if (url.includes('banking/accounts')) {
        return Promise.resolve({ data: ACCOUNTS_PAYLOAD })
      }
      return Promise.resolve({ data: {} })
    })

    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Supermercado Extra')).toBeInTheDocument()
    })

    const nextBtn = screen.getByRole('button', { name: /próxima/i })
    expect(nextBtn).toBeDisabled()
  })

  // ── Test I: Pagination row visibility ─────────────────────────────────────────

  it('after clicking Next, page-2 rows appear and page-1 rows disappear', async () => {
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Supermercado Extra')).toBeInTheDocument()
    })

    // Confirm page-1 row is visible before clicking Next
    expect(screen.getByText('Supermercado Extra')).toBeInTheDocument()

    // Update mock to return page 2 data
    mockApiGet.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
      const page = config?.params?.page ?? 1
      if (url.includes('dashboard/summary')) {
        return Promise.resolve({ data: SUMMARY_PAYLOAD })
      }
      if (url.includes('banking/accounts')) {
        return Promise.resolve({ data: ACCOUNTS_PAYLOAD })
      }
      if (url.includes('transactions/')) {
        if (page === 2) {
          return Promise.resolve({ data: TRANSACTIONS_PAGE2 })
        }
        return Promise.resolve({ data: TRANSACTIONS_PAGE1 })
      }
      return Promise.resolve({ data: {} })
    })

    fireEvent.click(screen.getByRole('button', { name: /próxima/i }))

    // Page-2 row appears
    await waitFor(() => {
      expect(screen.getByText('Internet Fibra')).toBeInTheDocument()
    })

    // Page-1 row disappears
    expect(screen.queryByText('Supermercado Extra')).not.toBeInTheDocument()
  })

  // ── Test D: Sincronizar button ─────────────────────────────────────────────────

  it('clicking Sincronizar POSTs for each ACTIVE account and excludes inactive', async () => {
    renderDashboard()

    // Wait for queries to settle
    await waitFor(() => {
      expect(screen.getByText('Supermercado Extra')).toBeInTheDocument()
    })

    const syncBtn = screen.getByRole('button', { name: /sincronizar/i })
    fireEvent.click(syncBtn)

    await waitFor(() => {
      // Called for acc_1 and acc_2 (both active)
      expect(mockApiPost.mock.calls.some(
        (call) => call[0] === 'banking/accounts/acc_1/transactions/fetch/',
      )).toBe(true)
      expect(mockApiPost.mock.calls.some(
        (call) => call[0] === 'banking/accounts/acc_2/transactions/fetch/',
      )).toBe(true)
      // NOT called for acc_3 (inactive)
      expect(mockApiPost.mock.calls.some(
        (call) => call[0] === 'banking/accounts/acc_3/transactions/fetch/',
      )).toBe(false)
      // Exactly 2 POST calls total
      expect(mockApiPost).toHaveBeenCalledTimes(2)
    })
  })

  // ── Test E: Logout ─────────────────────────────────────────────────────────────

  it('clicking Logout calls clearTokens and navigates to /login', async () => {
    const { clearTokens } = await import('../lib/api')

    renderDashboard()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /logout|sair/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /logout|sair/i }))

    expect(clearTokens).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  // ── Test F: 503 on sync fetch is handled gracefully ───────────────────────────

  it('shows friendly message when transactions/fetch/ returns 503', async () => {
    mockApiPost.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 503, data: { error: 'Broker unavailable' } },
    })

    renderDashboard()

    // Wait for queries to settle before clicking sync
    await waitFor(() => {
      expect(screen.getByText('Supermercado Extra')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /sincronizar/i }))

    await waitFor(() => {
      expect(
        screen.getByText(/serviço bancário temporariamente indisponível/i),
      ).toBeInTheDocument()
    })
  })

  it('shows generic message when transactions/fetch/ returns non-503 error', async () => {
    mockApiPost.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500, data: { error: 'Internal Server Error' } },
    })

    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Supermercado Extra')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /sincronizar/i }))

    await waitFor(() => {
      expect(
        screen.getByText(/não foi possível sincronizar/i),
      ).toBeInTheDocument()
    })

    // Must NOT show the 503 message
    expect(
      screen.queryByText(/serviço bancário temporariamente indisponível/i),
    ).not.toBeInTheDocument()
  })

  // ── Test G: Loading state ─────────────────────────────────────────────────────

  it('renders headings while data is loading (no crash)', () => {
    mockApiGet.mockImplementation(() => new Promise(() => {}))

    renderDashboard()

    // Headings render immediately; no data yet, no crash
    expect(screen.getByRole('heading', { name: /painel/i })).toBeInTheDocument()
    expect(screen.getByText('Carregando transações...')).toBeInTheDocument()
  })

  // ── Test H: txError ────────────────────────────────────────────────────────────

  it('shows error message when transactions query fails', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('dashboard/summary')) {
        return Promise.resolve({ data: SUMMARY_PAYLOAD })
      }
      if (url.includes('banking/accounts')) {
        return Promise.resolve({ data: ACCOUNTS_PAYLOAD })
      }
      if (url.includes('transactions/')) {
        return Promise.reject(new Error('Network Error'))
      }
      return Promise.resolve({ data: {} })
    })

    renderDashboard()

    await waitFor(() => {
      expect(
        screen.getByText(/não foi possível carregar as transações/i),
      ).toBeInTheDocument()
    })
  })

  // ── Test G: "Conectar banco" link ─────────────────────────────────────────────

  it('renders a "Conectar banco" link', async () => {
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /conectar banco/i })).toBeInTheDocument()
    })
  })

  // ── Test J: pollUntilStable unit tests ────────────────────────────────────────

  describe('pollUntilStable helper', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('stops when consecutive counts match', async () => {
      const noopSleep = () => Promise.resolve()
      // count sequence: prev=-1, poll1 returns 5 (changed), poll2 returns 5 (same → stop)
      mockApiGet
        .mockResolvedValueOnce({ data: { count: 5 } })
        .mockResolvedValueOnce({ data: { count: 5 } })

      await pollUntilStable(noopSleep)

      expect(mockApiGet).toHaveBeenCalledTimes(2)
      expect(mockApiGet).toHaveBeenCalledWith('transactions/')
    })

    it('caps at SYNC_MAX_POLLS when count never stabilizes', async () => {
      const noopSleep = () => Promise.resolve()
      let n = 0
      mockApiGet.mockImplementation(() => Promise.resolve({ data: { count: ++n } }))

      await pollUntilStable(noopSleep)

      expect(mockApiGet).toHaveBeenCalledTimes(SYNC_MAX_POLLS)
    })

    it('breaks early when api.get throws', async () => {
      const noopSleep = () => Promise.resolve()
      mockApiGet
        .mockResolvedValueOnce({ data: { count: 5 } })
        .mockRejectedValueOnce(new Error('Network error'))

      await pollUntilStable(noopSleep)

      // Called twice: first resolves (count=5, changed from prev=-1 → no stop),
      // second throws → break
      expect(mockApiGet).toHaveBeenCalledTimes(2)
    })
  })
})
