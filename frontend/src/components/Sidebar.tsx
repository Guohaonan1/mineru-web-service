import { NavLink, useNavigate } from 'react-router-dom'
import { Plus, ListTodo, Settings, User } from 'lucide-react'
import type { FileItem } from '../types'
import StatusBadge from './StatusBadge'

interface Props {
  files: FileItem[]
}

export default function Sidebar({ files }: Props) {
  const navigate = useNavigate()

  return (
    <aside className="w-60 flex flex-col bg-white text-gray-700 shrink-0 h-screen border-r border-gray-200">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-gray-100">
        <span className="text-gray-900 font-semibold text-base">mineru-web</span>
        <span className="ml-1 text-xs text-gray-400">文档解析</span>
      </div>

      {/* 新建解析 */}
      <div className="px-3 pt-4">
        <button
          onClick={() => navigate('/')}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          新建解析
        </button>
      </div>

      {/* 任务管理 */}
      <nav className="px-3 pt-3">
        <NavLink
          to="/tasks"
          className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
            }`
          }
        >
          <ListTodo size={16} />
          任务管理
        </NavLink>
      </nav>

      {/* 最近文件列表 */}
      <div className="flex-1 overflow-y-auto px-3 pt-3 min-h-0">
        <p className="text-xs text-gray-400 px-2 mb-2">最近上传</p>
        <ul className="space-y-1">
          {files.slice(0, 20).map((f) => (
            <li key={f.id}>
              <NavLink
                to={`/tasks/${f.id}`}
                className={({ isActive }) =>
                  `flex items-center justify-between px-2 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                    isActive ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-500'
                  }`
                }
              >
                <span className="truncate max-w-32">{f.filename}</span>
                <StatusBadge status={f.status} />
              </NavLink>
            </li>
          ))}
        </ul>
      </div>

      {/* 底部 */}
      <div className="border-t border-gray-100 px-3 py-3 space-y-1">
        <NavLink
          to="/settings"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-gray-100 text-gray-600 transition-colors"
        >
          <Settings size={16} />
          设置
        </NavLink>
        <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500">
          <User size={16} />
          <span>用户</span>
        </div>
      </div>
    </aside>
  )
}
