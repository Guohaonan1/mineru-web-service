import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, FileText, ExternalLink, SlidersHorizontal, X } from 'lucide-react'
import { api } from '../api'
import type { V4ModelStatus } from '../api'
import { getCloudApiKey, setCloudApiKey } from '../api/cloud'
import SelectField from '../components/SelectField'
import { cloudModelOptions, getParseSettings, ocrOptions, tierOptions } from '../utils/parseSettings'
import type { ParseSettings } from '../utils/parseSettings'

interface Props {
  onUploaded: () => void
}

type Engine = 'local_v41' | 'local_v4' | 'cloud' | 'local_v3'

export default function HomePage({ onUploaded }: Props) {
  const navigate = useNavigate()
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadStep, setUploadStep] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [engine, setEngine] = useState<Engine>('local_v41')
  const [v3Mode, setV3Mode] = useState<'async' | 'sync'>(() => getParseSettings().v3Mode)
  const [options, setOptions] = useState(getParseSettings)
  const [showOptions, setShowOptions] = useState(false)
  const [source, setSource] = useState<'file' | 'document' | 'web'>('file')
  const [sourceUrl, setSourceUrl] = useState('')
  const [serviceStatus, setServiceStatus] = useState<{ local_v3: { ok: boolean }; local_v4: { ok: boolean }; local_v41: { ok: boolean } } | null>(null)
  const [modelStatus, setModelStatus] = useState<V4ModelStatus | null>(null)
  const [modelBusy, setModelBusy] = useState(false)
  const [cloudApiKey, setCloudApiKeyState] = useState(getCloudApiKey)

  const refreshStatus = () => api.getSystemStatus().then(setServiceStatus).catch(() => setServiceStatus(null))

  useEffect(() => {
    const load = () => { api.getSystemStatus().then(setServiceStatus).catch(() => setServiceStatus(null)) }
    load()
    const timer = setInterval(load, 10000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const load = () => { api.getV4Models().then(setModelStatus).catch(() => setModelStatus(null)) }
    load()
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [])

  const downloadModels = async () => {
    setModelBusy(true)
    setError(null)
    try {
      setModelStatus(await api.downloadV4Models())
    } catch (e) {
      setError(e instanceof Error ? e.message : '模型下载请求失败')
    } finally {
      setModelBusy(false)
    }
  }

  const saveCloudKey = (key: string) => {
    setCloudApiKeyState(key)
    setCloudApiKey(key)
  }

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    if ((engine === 'local_v4' || engine === 'local_v41') && !modelStatus?.ready) {
      setError('本地 v4 模型尚未就绪，请先下载并验证模型')
      return
    }
    setUploading(true)
    setError(null)
    setUploadStep('')
    try {
      if (engine === 'cloud') {
        if (!cloudApiKey) throw new Error('请填写在线 API Key')
        setUploadStep('上传并解析中...')
        const result = await api.uploadCloud(files[0], cloudApiKey, options)
        onUploaded()
        navigate(`/tasks/${result.id}`)
      } else {
        setUploadStep('上传并解析中...')
        const result = engine === 'local_v41'
          ? await api.uploadV41(files[0], options)
          : engine === 'local_v4' ? await api.uploadV4(files[0], options)
          : v3Mode === 'async' ? await api.uploadAsync(files[0]) : await api.upload(files[0])
        onUploaded()
        navigate(`/tasks/${result.id}`)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '上传失败')
    } finally {
      setUploading(false)
      setUploadStep('')
    }
  }, [navigate, onUploaded, engine, v3Mode, cloudApiKey, modelStatus?.ready, options])

  const handleUrl = async () => {
    if (source === 'file' || engine === 'local_v3') return
    if ((engine === 'local_v4' || engine === 'local_v41') && source !== 'web' && !modelStatus?.ready) { setError('本地 v4 模型尚未就绪'); return }
    if (engine === 'cloud' && !cloudApiKey) { setError('请填写在线 API Key'); return }
    setUploading(true)
    setError(null)
    try {
      const result = await api.parseUrl(sourceUrl.trim(), source, engine, options, cloudApiKey)
      onUploaded()
      navigate(`/tasks/${result.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交 URL 失败')
    } finally { setUploading(false) }
  }

  const updateOption = <K extends keyof ParseSettings>(key: K, value: ParseSettings[K]) => {
    setOptions(previous => ({ ...previous, [key]: value }))
  }

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
            { key: 'local_v41', label: '本地 v4.1' },
            { key: 'local_v4', label: '本地 v4.0' },
            { key: 'cloud', label: '在线 API' },
            { key: 'local_v3', label: '本地 v3' },
          ] as { key: Engine; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setEngine(key); if (key === 'local_v3') setSource('file'); refreshStatus() }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                engine === key
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mb-4">
          {engine === 'cloud' ? 'mineru.net 精准解析 API'
            : engine === 'local_v41' ? `MinerU 4.1.6 · Tasks 异步接口${serviceStatus && !serviceStatus.local_v41.ok ? ' · 服务不可用' : ''}`
              : engine === 'local_v4' ? `MinerU 4.0 · 旧版异步接口${serviceStatus && !serviceStatus.local_v4.ok ? ' · 服务不可用' : ''}`
              : `MinerU 3.x · ${v3Mode === 'async' ? '异步' : '同步'}${serviceStatus && !serviceStatus.local_v3.ok ? ' · 服务不可用' : ''}`}
        </p>

        {/* 调用方式共用固定高度的设置区，切换时上传区保持原位 */}
        <div className={`mb-4 h-40 text-left ${engine === 'local_v4' || engine === 'local_v41' ? 'rounded-lg border border-gray-200 bg-white' : ''}`}>
          {engine === 'local_v4' || engine === 'local_v41' ? (
            <div className="flex h-full flex-col p-3 text-xs text-gray-600">
              <div className="flex items-center justify-between gap-3 shrink-0">
                <span>Standard 模型：{modelStatus?.state === 'ready' ? '已就绪'
                  : modelStatus?.state === 'downloading' ? '下载中，请稍候'
                    : modelStatus?.state === 'verifying' ? '校验中'
                      : modelStatus?.state === 'failed' ? '准备失败'
                        : modelStatus?.state === 'missing' ? '尚未准备好' : '检查中'}</span>
                <button type="button" onClick={downloadModels}
                  disabled={modelBusy || modelStatus?.state === 'checking' || modelStatus?.state === 'downloading' || modelStatus?.state === 'verifying' || modelStatus?.ready}
                  className="rounded bg-blue-500 px-2.5 py-1 text-white disabled:bg-gray-300 shrink-0">
                  下载模型
                </button>
              </div>
              <div className={`mt-2 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words ${modelStatus?.state === 'failed' ? 'text-red-500' : 'text-gray-500'}`}>
                {modelStatus?.detail}
              </div>
              <p className="mt-2 shrink-0 text-gray-400">下载完成后，建议以本地模型模式和预加载选项重启 MinerU API；命令见 README。</p>
            </div>
          ) : engine === 'cloud' ? (
            <div className="flex h-full flex-col gap-3 p-3 pt-8 text-xs">
              <div className="flex items-center gap-3">
                <label htmlFor="cloud-api-key" className="shrink-0 text-gray-600">API Key</label>
                <input
                  id="cloud-api-key"
                  type="password"
                  value={cloudApiKey}
                  onChange={e => saveCloudKey(e.target.value)}
                  placeholder="输入 Token（自动保存到本地）"
                  className="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-gray-700 outline-none placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <a href="https://mineru.net/apiManage/token" target="_blank" rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-1 text-blue-600 hover:underline">
                前往 MinerU 官网获取 API Key <ExternalLink size={12} />
              </a>
            </div>
          ) : (
            <div className="flex h-full flex-col gap-3 p-3 pt-8 text-xs">
              <div className="flex items-center gap-3">
                <span className="shrink-0 text-gray-600">调用方式</span>
                <div role="group" aria-label="调用方式" className="flex min-w-0 flex-1 gap-2">
                  {([
                    { value: 'async', label: '异步（推荐）' },
                    { value: 'sync', label: '同步（兼容 2.7.6）' },
                  ] as const).map(({ value, label }) => (
                    <button key={value} type="button" aria-pressed={v3Mode === value}
                      onClick={() => { setV3Mode(value); updateOption('v3Mode', value) }}
                      className={`min-w-0 flex-1 rounded-md border px-2 py-2 text-center transition-colors ${v3Mode === value
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:text-blue-600'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-gray-400">{v3Mode === 'async' ? '异步提交任务并查询结果，适合较大的文档。' : '同步等待解析结果，兼容 MinerU 2.7.6。'}</p>
            </div>
          )}
        </div>

        <div className="mb-3 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1" role="group" aria-label="解析来源">
            {([{ value: 'file', label: '文件' },
              ...(engine === 'local_v3' ? [] : [{ value: 'document', label: '文档 URL' }, { value: 'web', label: '网页 URL' }])
            ] as { value: typeof source; label: string }[]).map(item => (
              <button key={item.value} type="button" onClick={() => setSource(item.value)}
                className={`rounded-md px-2.5 py-1.5 ${source === item.value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}>
                {item.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setShowOptions(true)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-gray-600 hover:bg-gray-100">
            <SlidersHorizontal size={14} /> 本次解析设置
          </button>
        </div>

        {/* 拖拽上传区 */}
        {source === 'file' ? <label
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
        </label> : (
          <div className="flex h-56 flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-gray-300 bg-white px-6">
            <p className="text-sm font-medium text-gray-700">{source === 'web' ? '解析网页内容' : '解析远程文档'}</p>
            <input type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)}
              placeholder={source === 'web' ? 'https://example.com/article' : 'https://example.com/document.pdf'} aria-label="HTTPS URL"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
            <button type="button" disabled={uploading || !sourceUrl.trim()} onClick={handleUrl}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm text-white disabled:bg-gray-300">
              {uploading ? '正在提交...' : '开始解析'}
            </button>
            <p className="text-xs text-gray-400">请输入可公开访问的 HTTPS 地址</p>
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm text-red-500">{error}</p>
        )}

        {showOptions && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setShowOptions(false)}>
            <div role="dialog" aria-modal="true" aria-label="本次解析设置" onClick={e => e.stopPropagation()}
              className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 text-left shadow-xl">
              <div className="flex items-center justify-between"><h2 className="font-medium text-gray-800">本次解析设置</h2>
                <button type="button" aria-label="关闭" onClick={() => setShowOptions(false)}><X size={18} /></button></div>
              {source === 'web' ? <p className="text-sm text-gray-500">网页解析自动使用{engine === 'cloud' ? ' MinerU-HTML' : ' Flash'} 模式。</p>
                : engine === 'local_v4' || engine === 'local_v41' ? <>
                  <SelectField label="解析质量" value={options.v4Tier} options={tierOptions} onChange={value => updateOption('v4Tier', value)} />
                  <SelectField label="OCR 模式" value={options.v4Ocr} options={ocrOptions} onChange={value => updateOption('v4Ocr', value)} />
                  <p className="text-xs text-gray-400">模型就绪状态仅校验 Standard；其他档位是否可用取决于 MinerU 服务启动配置。</p>
                </> : engine === 'cloud' ? <>
                  <SelectField label="解析模型" value={options.cloudModel} options={cloudModelOptions} onChange={value => updateOption('cloudModel', value)} />
                  {([['cloudOcr', '强制 OCR'], ['cloudTable', '表格识别'], ['cloudFormula', '公式识别']] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center justify-between text-sm">{label}
                      <input type="checkbox" checked={options[key]} onChange={e => updateOption(key, e.target.checked)} className="h-4 w-4 accent-blue-600" />
                    </label>
                  ))}
                </> : <p className="text-sm text-gray-500">本地 v3 使用上方选择的同步或异步方式。</p>}
              <p className="text-xs text-gray-400">仅对当前页面提交的任务生效；长期默认值在左下角“设置”中修改。</p>
              <button type="button" onClick={() => setShowOptions(false)} className="w-full rounded-md bg-blue-600 py-2 text-sm text-white">完成</button>
            </div>
          </div>
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
