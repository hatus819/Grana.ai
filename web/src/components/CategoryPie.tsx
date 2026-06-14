import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'
import { parseAmount } from '../lib/money'

interface CategoryEntry {
  category: string | null
  color: string | null
  total: string
  count: number
}

interface CategoryPieProps {
  data: CategoryEntry[]
}

const FALLBACK_COLOR = '#9ca3af'

export default function CategoryPie({ data }: CategoryPieProps) {
  if (!data || data.length === 0) {
    return (
      <div style={{ color: '#6b7280', fontSize: 14, padding: '12px 0' }}>
        Sem dados de categoria no período.
      </div>
    )
  }

  const chartData = data.map((entry) => ({
    name: entry.category ?? 'Sem categoria',
    value: Math.abs(parseAmount(entry.total)),
    fill: entry.color ?? FALLBACK_COLOR,
  }))

  return (
    <PieChart width={320} height={240}>
      <Pie
        data={chartData}
        dataKey="value"
        nameKey="name"
        cx="50%"
        cy="50%"
        outerRadius={90}
      >
        {chartData.map((entry, index) => (
          <Cell key={`cell-${index}`} fill={entry.fill} />
        ))}
      </Pie>
      <Tooltip formatter={(value) => `R$ ${Number(value).toFixed(2)}`} />
      <Legend />
    </PieChart>
  )
}
