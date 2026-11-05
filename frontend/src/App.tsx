import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import SystemStatus from './components/SystemStatus'
import HomePage from './pages/HomePage'
import TaskListPage from './pages/TaskListPage'
import TaskDetailPage from './pages/TaskDetailPage'
import SettingsPage from './pages/SettingsPage'
import { api } from './api'
import type { FileItem } from './types'

function AppShell() {
  const [files, setFiles] = useState<FileItem[]>([])

  const loadFiles = async () => {
    try {
      const data = await api.listFiles()
      setFiles(data)
    } catch {
      // 后端未启动时静默失败
    }
  }

  useEffect(() => {
    api.listFiles().then(setFiles).catch(() => {})
    const timer = setInterval(loadFiles, 5000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <SystemStatus />
      <Sidebar files={files} />
      <main className="flex-1 flex overflow-hidden">
        <Routes>
          <Route path="/" element={<HomePage onUploaded={loadFiles} />} />
          <Route path="/tasks" element={<TaskListPage files={files} onRefresh={loadFiles} />} />
          <Route path="/tasks/:id" element={<TaskDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}
