import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { RefreshCw, Eye, EyeOff } from 'lucide-react'
import { api } from '../api'
import type { ContentBlock, FileDetail, MiddleJsonData } from '../types'
import { parseMiddleJson } from '../utils/parseMiddleJson'
import StatusBadge from '../components/StatusBadge'
import PDFViewerV2 from '../components/PDFViewerV2'
import ImageViewer from '../components/ImageViewer'
import ContentViewer from '../components/ContentViewer'
import ContentViewerV2 from '../components/ContentViewerV2'
import JsonViewer from '../components/JsonViewer'

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [file, setFile] = useState<FileDetail | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<ContentBlock[]>([])
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [hiddenBlocks, setHiddenBlocks] = useState<Set<number>>(new Set())
  const [resultView, setResultView] = useState<'markdown' | 'json'>('markdown')
  const [middleJson, setMiddleJson] = useState<MiddleJsonData | null>(null)
  const [showAllBoxes, setShowAllBoxes] = useState(true)
  const [loading, setLoading] = useState(true)

  const fetchFile = useCallback(async () => {
    if (!id) return
    const data = await api.getResult(Number(id))
    setFile(data)
    setLoading(false)
  }, [id])

  useEffect(() => {
    setLoading(true)
    setFile(null)
    setDownloadUrl(null)
    setBlocks([])
    setActiveIndex(null)
    setHiddenBlocks(new Set())
    setMiddleJson(null)

    const init = async () => {
      if (!id) return
      const data = await api.getResult(Number(id))
      setFile(data)
      setLoading(false)

      if (data.minio_path) {
        const { url } = await api.getDownloadUrl(Number(id))
        setDownloadUrl(url)
      }

      if (data.status === 'done') {
        const [list, mj] = await Promise.all([
          api.getContentList(Number(id)),
          api.getMiddleJson(Number(id)),
        ])
        setBlocks(list)
        setMiddleJson(mj as MiddleJsonData | null)
      }
    }
    init()
  }, [id])

  // 解析中轮询
  useEffect(() => {
    if (!file || file.status === 'done' || file.status === 'failed') return
    const timer = setInterval(fetchFile, 3000)
    return () => clearInterval(timer)
  }, [file?.status, fetchFile])

  // 解析完成后加载 content_list + middle_json
  useEffect(() => {
    if (!id || !file || file.status !== 'done' || blocks.length > 0) return
    Promise.all([
      api.getContentList(Number(id)),
      api.getMiddleJson(Number(id)),
    ]).then(([list, mj]) => {
      setBlocks(list)
      setMiddleJson(mj as MiddleJsonData | null)
    })
  }, [file?.status, id])

  const isImage = file
    ? (file.content_type?.startsWith('image/') ?? /\.(png|jpe?g|gif|bmp|webp|tiff?)$/i.test(file.filename))
    : false

  const parsedBlocks = useMemo(() => {
    if (!middleJson || isImage) return []
    return parseMiddleJson(middleJson)
  }, [middleJson, isImage])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (!file) return null

  const isParsing = file.status === 'pending' || file.status === 'running'
  const hasResults = isImage ? blocks.length > 0 : parsedBlocks.length > 0

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* 顶部标题栏 */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 bg-white shrink-0">
        <span className="text-sm font-medium text-gray-800 truncate max-w-sm">{file.filename}</span>
        <StatusBadge status={file.status} />
        {isParsing && (
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <RefreshCw size={12} className="animate-spin" /> 解析中...
          </span>
        )}
      </div>

      {/* 主体：左右分栏 */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* 左：PDF 预览 + bbox 高亮 */}
        <div className="w-1/2 border-r border-gray-200 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50 shrink-0">
            <span className="text-xs text-gray-500">原文件</span>
            {!isParsing && downloadUrl && (
              <button
                onClick={() => setShowAllBoxes(v => !v)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors ${showAllBoxes ? 'bg-blue-100 text-blue-600 hover:bg-blue-200' : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'}`}
              >
                {showAllBoxes ? <Eye size={12} /> : <EyeOff size={12} />}
                {showAllBoxes ? '布局解析打开' : '布局解析关闭'}
              </button>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            {isParsing ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
                <span className="text-sm">解析中，请稍候...</span>
              </div>
            ) : downloadUrl ? (
              isImage ? (
                <ImageViewer
                  url={downloadUrl}
                  blocks={blocks}
                  activeIndex={activeIndex}
                  onBlockClick={setActiveIndex}
                  hiddenBlocks={hiddenBlocks}
                  showAllBoxes={showAllBoxes}
                  onToggleHidden={(i) => setHiddenBlocks(prev => {
                    const next = new Set(prev)
                    next.has(i) ? next.delete(i) : next.add(i)
                    return next
                  })}
                />
              ) : (
                <PDFViewerV2
                  url={downloadUrl}
                  blocks={parsedBlocks}
                  activeIndex={activeIndex}
                  onBlockClick={setActiveIndex}
                  hiddenBlocks={hiddenBlocks}
                  showAllBoxes={showAllBoxes}
                  onToggleHidden={(i) => setHiddenBlocks(prev => {
                    const next = new Set(prev)
                    next.has(i) ? next.delete(i) : next.add(i)
                    return next
                  })}
                />
              )
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                暂无文件预览
              </div>
            )}
          </div>
        </div>

        {/* 右：内容块查看器 */}
        <div className="w-1/2 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-4 py-1.5 border-b border-gray-100 bg-gray-50 shrink-0">
            <span className="text-xs text-gray-500">解析结果</span>
            {hasResults && (
              <div className="flex text-xs rounded overflow-hidden border border-gray-200">
                <button
                  onClick={() => setResultView('markdown')}
                  className={`px-2.5 py-1 transition-colors ${resultView === 'markdown' ? 'bg-blue-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  Markdown
                </button>
                <button
                  onClick={() => setResultView('json')}
                  className={`px-2.5 py-1 transition-colors ${resultView === 'json' ? 'bg-blue-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  JSON
                </button>
              </div>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            {isParsing ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
                <span className="text-sm">解析中，请稍候...</span>
              </div>
            ) : file.status === 'failed' ? (
              <div className="m-4 text-sm text-red-500 bg-red-50 rounded-lg p-4">
                {file.error || '解析失败'}
              </div>
            ) : hasResults ? (
              resultView === 'json' ? (
                <JsonViewer value={{ content_list: blocks, middle_json: middleJson }} />
              ) : isImage ? (
                <ContentViewer
                  blocks={blocks}
                  activeIndex={activeIndex}
                  onBlockClick={setActiveIndex}
                  hiddenBlocks={hiddenBlocks}
                />
              ) : (
                <ContentViewerV2
                  blocks={parsedBlocks}
                  activeIndex={activeIndex}
                  onBlockClick={setActiveIndex}
                  hiddenBlocks={hiddenBlocks}
                />
              )
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                暂无结果
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
