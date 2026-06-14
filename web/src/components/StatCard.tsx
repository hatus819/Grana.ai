interface StatCardProps {
  label: string
  value: string
  color?: string
}

export default function StatCard({ label, value, color }: StatCardProps) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: '16px 20px',
        minWidth: 160,
        flex: 1,
      }}
    >
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? '#111827' }}>{value}</div>
    </div>
  )
}
