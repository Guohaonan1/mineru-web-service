import { useEffect, useState } from 'react'
import { api } from '../api'

type Status = { mineru: boolean; minio: boolean; local_v3?: { ok: boolean }; local_v4?: { ok: boolean }; local_v41?: { ok: boolean } } | null

function Dot({ ok }: { ok: boolean }) {
  return <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
}

export default function SystemStatus() {
  const [status, setStatus] = useState<Status>(null)

  useEffect(() => {
    const load = () => {
      api.getSystemStatus()
        .then(setStatus)
        .catch(() => setStatus({ mineru: false, minio: false }))
    }
    load()
    const timer = setInterval(load, 10000)
    return () => clearInterval(timer)
  }, [])

  if (!status) return null

  return (
    <div className="fixed top-3 right-4 z-50 flex items-center gap-3 bg-white border border-gray-200 rounded-full px-3 py-1 text-xs text-gray-500 shadow-sm">
      <span className="flex items-center gap-1.5">
        <Dot ok={status.local_v41?.ok ?? false} />
        v4.1
      </span>
      <span className="flex items-center gap-1.5">
        <Dot ok={status.local_v4?.ok ?? false} />
        v4.0
      </span>
      <span className="flex items-center gap-1.5">
        <Dot ok={status.local_v3?.ok ?? false} />
        v3
      </span>
      <span className="flex items-center gap-1.5">
        <Dot ok={status.minio} />
        MinIO
      </span>
    </div>
  )
}
