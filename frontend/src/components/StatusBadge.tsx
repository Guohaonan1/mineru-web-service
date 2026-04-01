const config = {
  pending:  { label: '等待中', className: 'bg-yellow-100 text-yellow-700' },
  running:  { label: '解析中', className: 'bg-blue-100 text-blue-700' },
  done:     { label: '已完成', className: 'bg-green-100 text-green-700' },
  failed:   { label: '失败',   className: 'bg-red-100 text-red-700' },
}

export default function StatusBadge({ status }: { status: string }) {
  const c = config[status as keyof typeof config] ?? { label: status, className: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.className}`}>
      {c.label}
    </span>
  )
}
