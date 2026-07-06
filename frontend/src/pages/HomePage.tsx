import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, FileText } from 'lucide-react'
import { api } from '../api'
import { getCloudApiKey, setCloudApiKey } from '../api/cloud'

interface Props {
  onUploaded: () => void
}

type MinerUVersion = '2.7.6' | '3.0' | 'cloud'

export default function HomePage({ onUploaded }: Props) {
  const navigate = useNavigate()
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadStep, setUploadStep] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState<MinerUVersion>('3.0')
  const [cloudApiKey, setCloudApiKeyState] = useState(getCloudApiKey)

  const saveCloudKey = (key: string) => {
    setCloudApiKeyState(key)
    setCloudApiKey(key)
  }

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    setUploadStep('')
    try {
      if (version === 'cloud') {
        if (!cloudApiKey) throw new Error('请填写在线 API Key')
        setUploadStep('上传并解析中...')
        const result = await api.uploadCloud(files[0], cloudApiKey)
        onUploaded()
        navigate(`/tasks/${result.id}`)
      } else {
        setUploadStep('上传并解析中...')
        const result = version === '3.0'
          ? await api.uploadAsync(files[0])
          : await api.upload(files[0])
        onUploaded()
        navigate(`/tasks/${result.id}`)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
      setUploadStep('')
    }
  }, [navigate, onUploaded, version, cloudApiKey])

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

        {/* 版本选择 */}
        <div className="flex items-center justify-center gap-1 mb-3 p-1 bg-white border border-gray-200 rounded-lg w-fit mx-auto">
          {([
            { key: '3.0',   label: '最新版' },
            { key: '2.7.6', label: '兼容 2.7.6' },
            { key: 'cloud', label: '在线 API' },
          ] as { key: MinerUVersion; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setVersion(key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                version === key
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mb-4">
          {version === 'cloud'
            ? '直接调用 mineru.net，不经过本地服务'
            : version === '3.0'
              ? '异步任务模式（POST /tasks）'
              : '同步解析模式（POST /file_parse）'}
        </p>

        {/* 在线 API Key（始终占位，非在线模式时隐藏）*/}
        <div className={`mb-4 flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 ${version !== 'cloud' ? 'invisible' : ''}`}>
          <span className="text-xs text-gray-400 whitespace-nowrap">API Key</span>
          <input
            type="password"
            value={cloudApiKey}
            onChange={e => saveCloudKey(e.target.value)}
            placeholder="Bearer token（自动保存到本地）"
            className="flex-1 text-xs outline-none bg-transparent placeholder-gray-300"
          />
        </div>

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
              <span className="text-sm">{uploadStep || '处理中...'}</span>
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
