import { useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { api } from '../api'
import type { FileItem } from '../types'
import StatusBadge from '../components/StatusBadge'

interface Props {
  files: FileItem[]
  onRefresh: () => void
}

export default function TaskListPage({ files, onRefresh }: Props) {
  const navigate = useNavigate()

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    await api.deleteFile(id)
    onRefresh()
  }

  return (
    <div className="flex-1 bg-gray-50 p-6 overflow-auto">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">任务管理</h2>

      {files.length === 0 ? (
        <div className="text-center text-gray-400 mt-20 text-sm">暂无解析任务</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">文件名</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">状态</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">创建时间</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">更新时间</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {files.map((f) => (
                <tr
                  key={f.id}
                  onClick={() => navigate(`/tasks/${f.id}`)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 text-gray-800 max-w-xs truncate">{f.filename}</td>
                  <td className="px-4 py-3"><StatusBadge status={f.status} /></td>
                  <td className="px-4 py-3 text-gray-400">{new Date(f.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-400">{new Date(f.updated_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => handleDelete(e, f.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
