import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router'
import { PluggyConnect } from 'react-pluggy-connect'
import axios from 'axios'
import { api } from '../lib/api'
import { sleep } from '../lib/sleep'

// ─── Poll constants (module-level, exported so tests can use them) ────────────

export const POLL_INTERVAL_MS = 3000
export const MAX_POLLS = 8

// ─── Poll + categorize orchestration (exported for unit testing) ──────────────

export async function runSyncAndCategorize(deps: {
  apiGet: (url: string) => Promise<{ data: { count: number } }>
  apiPost: (url: string) => Promise<unknown>
  sleep: (ms: number) => Promise<void>
  onSyncing: (count: number) => void
}): Promise<{ outcome: 'navigated' } | { outcome: 'categorize_failed' }> {
  const { apiGet, apiPost, sleep, onSyncing } = deps

  // Poll until count stabilizes (max MAX_POLLS, POLL_INTERVAL_MS apart)
  let previous = -1
  let data: { count: number } = { count: 0 }

  for (let i = 0; i < MAX_POLLS && data.count !== previous; i++) {
    previous = data.count
    await sleep(POLL_INTERVAL_MS)
    const res = await apiGet('transactions/')
    data = res.data
    onSyncing(data.count)
  }

  // POST categorize
  try {
    await apiPost('transactions/categorize/')
    return { outcome: 'navigated' }
  } catch {
    // Any categorize failure is non-blocking — transactions are already imported
    return { outcome: 'categorize_failed' }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

type PageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; connectToken: string }
  | { status: 'connecting' }
  | { status: 'syncing'; count: number }
  | { status: 'categorize_error' }

export default function ConnectBankPage() {
  const navigate = useNavigate()
  const [state, setState] = useState<PageState>({ status: 'loading' })

  // ── 1. Fetch connect token on mount ────────────────────────────────────────

  const fetchConnectToken = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const res = await api.post<{ accessToken: string }>('banking/connect-token/')
      setState({ status: 'ready', connectToken: res.data.accessToken })
    } catch {
      setState({
        status: 'error',
        message: 'Não foi possível iniciar a conexão bancária. Tente novamente.',
      })
    }
  }, [])

  useEffect(() => {
    fetchConnectToken()
  }, [fetchConnectToken])

  // ── 2. Widget success handler ──────────────────────────────────────────────

  const handleSuccess = useCallback(
    async (itemData: { item: { id: string } }) => {
      const itemId = itemData.item.id

      setState({ status: 'connecting' })

      // Step 3: POST accounts/connect/ with itemId
      try {
        await api.post('banking/accounts/connect/', { itemId })
      } catch (err: unknown) {
        if (axios.isAxiosError(err)) {
          if (err.response?.status === 403) {
            setState({
              status: 'error',
              message: err.response?.data?.error ?? 'Esta conexão bancária não pertence a você.',
            })
          } else {
            setState({
              status: 'error',
              message: 'Não foi possível importar as contas. Tente novamente.',
            })
          }
        } else {
          setState({
            status: 'error',
            message: 'Não foi possível importar as contas. Tente novamente.',
          })
        }
        return
      }

      // Step 4 + 5: poll + categorize
      try {
        const result = await runSyncAndCategorize({
          apiGet: (url) => api.get(url),
          apiPost: (url) => api.post(url),
          sleep,
          onSyncing: (count) => setState({ status: 'syncing', count }),
        })

        if (result.outcome === 'categorize_failed') {
          setState({ status: 'categorize_error' })
        } else {
          navigate('/dashboard')
        }
      } catch {
        setState({
          status: 'error',
          message: 'Não foi possível sincronizar as transações. Tente novamente.',
        })
      }
    },
    [navigate],
  )

  // ── 3. Widget error handler ────────────────────────────────────────────────

  const handleError = useCallback((error: { message: string }) => {
    setState({
      status: 'error',
      message: error.message ?? 'Ocorreu um erro ao conectar o banco.',
    })
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────

  function renderBody() {
    switch (state.status) {
      case 'loading':
        return <p>Carregando...</p>

      case 'error':
        return (
          <>
            <p role="alert">{state.message}</p>
            <button onClick={fetchConnectToken}>Tentar novamente</button>
          </>
        )

      case 'connecting':
        return <p>Conectando sua conta...</p>

      case 'syncing':
        return <p>Sincronizando transações... {state.count} encontradas até agora.</p>

      case 'categorize_error':
        return (
          <>
            <p>
              A categorização não pôde ser concluída agora; suas transações já foram importadas.
              Você pode tentar novamente no painel.
            </p>
            <button onClick={() => navigate('/dashboard')}>Ir para o painel</button>
          </>
        )

      case 'ready':
        return (
          <PluggyConnect
            connectToken={state.connectToken}
            includeSandbox={import.meta.env.DEV}
            onSuccess={handleSuccess}
            onError={handleError}
          />
        )
    }
  }

  return (
    <div style={{ padding: 32 }}>
      <h1>Conectar Banco</h1>
      {renderBody()}
    </div>
  )
}
