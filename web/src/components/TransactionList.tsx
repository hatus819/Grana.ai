import { parseAmount, formatBRL } from '../lib/money'

interface Category {
  id: string
  name: string
  icon?: string
  color?: string
}

export interface Transaction {
  id: string
  pluggy_transaction_id: string
  amount: string
  description: string
  date: string | null
  category: Category | null
  is_processed: boolean
}

interface TransactionListProps {
  transactions: Transaction[]
  count: number
  page: number
  limit: number
  onPageChange: (page: number) => void
}

const FALLBACK_CHIP_COLOR = '#e5e7eb'

export default function TransactionList({
  transactions,
  count,
  page,
  limit,
  onPageChange,
}: TransactionListProps) {
  const totalPages = Math.max(1, Math.ceil(count / limit))
  const isFirstPage = page <= 1
  const isLastPage = page >= totalPages

  return (
    <div>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 14,
        }}
      >
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px', color: '#6b7280', fontWeight: 600 }}>Data</th>
            <th style={{ padding: '8px 12px', color: '#6b7280', fontWeight: 600 }}>Descrição</th>
            <th style={{ padding: '8px 12px', color: '#6b7280', fontWeight: 600 }}>Categoria</th>
            <th
              style={{
                padding: '8px 12px',
                color: '#6b7280',
                fontWeight: 600,
                textAlign: 'right',
              }}
            >
              Valor
            </th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => {
            const amount = parseAmount(tx.amount)
            const formattedAmount = formatBRL(amount)
            const dateStr = tx.date ? tx.date.slice(0, 10) : '—'
            const chipLabel = tx.category?.name ?? 'Sem categoria'
            const chipColor = tx.category?.color ?? FALLBACK_CHIP_COLOR

            return (
              <tr
                key={tx.id}
                style={{
                  borderBottom: '1px solid #f3f4f6',
                }}
              >
                <td style={{ padding: '10px 12px', color: '#374151' }}>{dateStr}</td>
                <td style={{ padding: '10px 12px', color: '#111827' }}>{tx.description}</td>
                <td style={{ padding: '10px 12px' }}>
                  <span
                    style={{
                      background: chipColor,
                      color: '#fff',
                      borderRadius: 12,
                      padding: '2px 10px',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {chipLabel}
                  </span>
                </td>
                <td
                  style={{
                    padding: '10px 12px',
                    textAlign: 'right',
                    fontWeight: 600,
                    color: amount < 0 ? '#ef4444' : '#10b981',
                  }}
                >
                  {formattedAmount}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Pagination controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginTop: 16,
          justifyContent: 'flex-end',
        }}
      >
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={isFirstPage}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            background: '#fff',
            cursor: isFirstPage ? 'not-allowed' : 'pointer',
            opacity: isFirstPage ? 0.5 : 1,
          }}
        >
          Anterior
        </button>
        <span style={{ fontSize: 13, color: '#6b7280' }}>
          Página {page} de {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={isLastPage}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            background: '#fff',
            cursor: isLastPage ? 'not-allowed' : 'pointer',
            opacity: isLastPage ? 0.5 : 1,
          }}
        >
          Próxima
        </button>
      </div>
    </div>
  )
}
