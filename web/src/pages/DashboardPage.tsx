import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { api, clearTokens } from '../lib/api'
import { sleep } from '../lib/sleep'
import { parseAmount, formatBRL } from '../lib/money'
import StatCard from '../components/StatCard'
import CategoryPie from '../components/CategoryPie'
import TransactionList from '../components/TransactionList'

// ─── Pagination defaults (must match backend: page + limit, default limit=20) ─

const DEFAULT_LIMIT = 20

// ─── Sync-poll helper (exported so it can be unit-tested without timers) ──────

export const SYNC_POLL_INTERVAL_MS = 3000
export const SYNC_MAX_POLLS = 8

export async function pollUntilStable(
  sleepFn: (ms: number) => Promise<void> = sleep,
): Promise<void> {
  let prev = -1
  let count = 0
  for (let i = 0; i < SYNC_MAX_POLLS && count !== prev; i++) {
    prev = count
    await sleepFn(SYNC_POLL_INTERVAL_MS)
    try {
      count = (await api.get('transactions/')).data.count
    } catch {
      break
    }
  }
}

// ─── API response types ───────────────────────────────────────────────────────

interface CategoryEntry {
  category: string | null
  color: string | null
  total: string
  count: number
}

interface SummaryData {
  balance: string
  income: string
  expenses: string
  by_category: CategoryEntry[]
  period: { start_date: string; end_date: string }
}

interface TransactionItem {
  id: string
  pluggy_transaction_id: string
  amount: string
  description: string
  date: string
  category: { id: string; name: string; icon?: string; color?: string } | null
  is_processed: boolean
}

interface TransactionsData {
  count: number
  results: TransactionItem[]
}

interface AccountItem {
  id: string
  pluggy_account_id: string
  bank_name: string
  account_type: string
  balance: string
  is_active: boolean
}

// ─── DashboardPage ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  // ── Logout ─────────────────────────────────────────────────────────────────
  function handleLogout() {
    clearTokens()
    void navigate('/login')
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: summary, isError: summaryError } = useQuery<SummaryData>({
    queryKey: ['dashboard/summary'],
    queryFn: async () => {
      const res = await api.get('dashboard/summary/')
      return (res as { data: SummaryData }).data
    },
  })

  const { data: txData, isError: txError } = useQuery<TransactionsData>({
    queryKey: ['transactions', page],
    queryFn: async () => {
      const res = await api.get('transactions/', { params: { page, limit: DEFAULT_LIMIT } })
      return (res as { data: TransactionsData }).data
    },
  })

  const { data: accounts } = useQuery<AccountItem[]>({
    queryKey: ['banking/accounts'],
    queryFn: async () => {
      const res = await api.get('banking/accounts/')
      return (res as { data: AccountItem[] }).data
    },
  })

  // ── Sincronizar ────────────────────────────────────────────────────────────

  async function handleSync() {
    if (syncing || !accounts || accounts.length === 0) return
    setSyncing(true)
    setSyncError(null)
    try {
      const active = accounts.filter((a) => a.is_active)
      for (const a of active) {
        await api.post(`banking/accounts/${a.id}/transactions/fetch/`)
      }
      await pollUntilStable()
      await queryClient.invalidateQueries({ queryKey: ['dashboard/summary'] })
      await queryClient.invalidateQueries({ queryKey: ['transactions'] })
      setPage(1)
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 503) {
        setSyncError('Serviço bancário temporariamente indisponível. Tente novamente mais tarde.')
      } else {
        setSyncError('Não foi possível sincronizar. Tente novamente.')
      }
    } finally {
      setSyncing(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  // summaryError used to guard future error display; declared to avoid unused-var warning
  void summaryError

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto', fontFamily: 'sans-serif' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>Painel</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link
            to="/connect"
            style={{
              fontSize: 14,
              color: '#2563eb',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Conectar banco
          </Link>
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={syncing}
            style={{
              padding: '7px 16px',
              borderRadius: 6,
              border: '1px solid #d1d5db',
              background: syncing ? '#f3f4f6' : '#fff',
              cursor: syncing ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              padding: '7px 16px',
              borderRadius: 6,
              border: '1px solid #d1d5db',
              background: '#fff',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Sair
          </button>
        </div>
      </div>

      {/* Sync error message */}
      {syncError && (
        <div
          role="alert"
          style={{
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: 6,
            padding: '10px 16px',
            marginBottom: 16,
            color: '#b91c1c',
            fontSize: 14,
          }}
        >
          {syncError}
        </div>
      )}

      {/* Stat Cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
        <StatCard
          label="Saldo"
          value={summary ? formatBRL(parseAmount(summary.balance)) : '—'}
          color="#111827"
        />
        <StatCard
          label="Receitas"
          value={summary ? formatBRL(parseAmount(summary.income)) : '—'}
          color="#10b981"
        />
        <StatCard
          label="Despesas"
          value={summary ? formatBRL(parseAmount(summary.expenses)) : '—'}
          color="#ef4444"
        />
      </div>

      {/* Category Pie */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Despesas por categoria</h2>
        <CategoryPie data={summary?.by_category ?? []} />
      </div>

      {/* Transaction List */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Transações</h2>
        {txData ? (
          <TransactionList
            transactions={txData.results}
            count={txData.count}
            page={page}
            limit={DEFAULT_LIMIT}
            onPageChange={(p) => setPage(p)}
          />
        ) : txError ? (
          <p style={{ color: '#ef4444', fontSize: 14 }}>Não foi possível carregar as transações.</p>
        ) : (
          <p style={{ color: '#6b7280', fontSize: 14 }}>Carregando transações...</p>
        )}
      </div>
    </div>
  )
}
