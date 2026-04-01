import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, FileText } from 'lucide-react'
import { api } from '../api'

interface Props {
  onUploaded: () => void
}

export default function HomePage({ onUploaded }: Props) {
  const navigate = useNavigate()
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      const result = await api.upload(files[0])
      onUploaded()
      navigate(`/tasks/${result.id}`)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }, [navigate, onUploaded])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 p-8">
      <div className="max-w-xl w-full text-center">
        <h1 className="text-2xl font-semibold text-gray-800 mb-2">智能文档解析</h1>
        <p className="text-gray-500 text-sm mb-8">支持 PDF、图片等格式，自动提取文本、表格和公式</p>

        {/* 拖拽上传区 */}
        <label
          className={`flex flex-col items-center justify-center w-full h-56 border-2 border-dashed rounded-2xl cursor-pointer transition-colors ${
            dragging
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp,.tiff"
            onChange={(e) => handleFiles(e.target.files)}
            disabled={uploading}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-3 text-blue-500">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">上传并解析中...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <Upload size={36} strokeWidth={1.5} />
              <div>
                <p className="text-sm font-medium text-gray-600">拖拽文件到此处，或点击上传</p>
                <p className="text-xs text-gray-400 mt-1">支持 PDF、PNG、JPG、WEBP 等格式</p>
              </div>
            </div>
          )}
        </label>

        {error && (
          <p className="mt-3 text-sm text-red-500">{error}</p>
        )}

        {/* 特性说明 */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          {[
            { icon: FileText, title: '文本提取', desc: '精准识别文档结构' },
            { icon: FileText, title: '表格解析', desc: '保留表格完整结构' },
            { icon: FileText, title: '公式识别', desc: '支持数学公式转换' },
          ].map((item) => (
            <div key={item.title} className="p-4 bg-white rounded-xl border border-gray-200 text-left">
              <p className="text-sm font-medium text-gray-700">{item.title}</p>
              <p className="text-xs text-gray-400 mt-1">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
