/**
 * CategoryPie unit tests
 *
 * Verifies:
 * - null category → "Sem categoria" in pie data
 * - negative totals → positive values via Math.abs
 * - null color → FALLBACK_COLOR (#9ca3af) in pie data
 * - empty data → fallback message rendered
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// ─── Capture Pie data prop via mock ──────────────────────────────────────────

let capturedPieData: Array<{ name: string; value: number; fill: string }> = []

vi.mock('recharts', () => ({
  PieChart: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: ({ data }: { data?: Array<{ name: string; value: number; fill: string }> }) => {
    capturedPieData = data ?? []
    return <div data-testid="pie" />
  },
  Cell: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

const { default: CategoryPie } = await import('./CategoryPie')

const FALLBACK_COLOR = '#9ca3af'

describe('CategoryPie', () => {
  it('renders fallback message when data is empty', () => {
    render(<CategoryPie data={[]} />)
    expect(screen.getByText(/sem dados de categoria/i)).toBeInTheDocument()
  })

  it('maps null category to "Sem categoria"', () => {
    capturedPieData = []
    render(
      <CategoryPie
        data={[{ category: null, color: '#3B82F6', total: '-500.00', count: 1 }]}
      />,
    )
    expect(capturedPieData).toHaveLength(1)
    expect(capturedPieData[0].name).toBe('Sem categoria')
  })

  it('uses Math.abs so negative totals become positive values', () => {
    capturedPieData = []
    render(
      <CategoryPie
        data={[{ category: 'Alimentação', color: '#10B981', total: '-1372.70', count: 3 }]}
      />,
    )
    expect(capturedPieData).toHaveLength(1)
    expect(capturedPieData[0].value).toBeGreaterThan(0)
    expect(capturedPieData[0].value).toBeCloseTo(1372.7, 1)
  })

  it('maps null color to FALLBACK_COLOR', () => {
    capturedPieData = []
    render(
      <CategoryPie
        data={[{ category: 'Outros', color: null, total: '-200.00', count: 2 }]}
      />,
    )
    expect(capturedPieData).toHaveLength(1)
    expect(capturedPieData[0].fill).toBe(FALLBACK_COLOR)
  })

  it('preserves provided category name and color', () => {
    capturedPieData = []
    render(
      <CategoryPie
        data={[{ category: 'Serviços', color: '#3B82F6', total: '-800.00', count: 5 }]}
      />,
    )
    expect(capturedPieData[0].name).toBe('Serviços')
    expect(capturedPieData[0].fill).toBe('#3B82F6')
  })

  it('handles multiple entries including mixed null/non-null', () => {
    capturedPieData = []
    render(
      <CategoryPie
        data={[
          { category: 'Serviços', color: '#3B82F6', total: '-1372.70', count: 3 },
          { category: null, color: null, total: '-1340.40', count: 2 },
        ]}
      />,
    )
    expect(capturedPieData).toHaveLength(2)
    expect(capturedPieData[0].name).toBe('Serviços')
    expect(capturedPieData[1].name).toBe('Sem categoria')
    expect(capturedPieData[1].fill).toBe(FALLBACK_COLOR)
    expect(capturedPieData[0].value).toBeCloseTo(1372.7, 1)
    expect(capturedPieData[1].value).toBeCloseTo(1340.4, 1)
  })
})
