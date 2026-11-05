import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { RefreshCw, Eye, EyeOff, Download } from 'lucide-react'
import { api } from '../api'
import type { ContentBlock, FileDetail, MiddleJsonData } from '../types'
import { parseMiddleJson } from '../utils/parseMiddleJson'
import { parseV4 } from '../utils/parseV4'
import type { V4MiddleJson, V4StructuredContent } from '../utils/parseV4'
import StatusBadge from '../components/StatusBadge'
import PDFViewer from '../components/PDFViewer'
import PDFViewerV2 from '../components/PDFViewerV2'
import ImageViewer from '../components/ImageViewer'
import ImageViewerV2 from '../components/ImageViewerV2'
import ContentViewer from '../components/ContentViewer'
import ContentViewerV2 from '../components/ContentViewerV2'
import JsonViewer from '../components/JsonViewer'
import Markdown from '../components/Markdown'

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  return <TaskDetailContent key={id} id={id} />
}

function TaskDetailContent({ id }: { id?: string }) {
  const [file, setFile] = useState<FileDetail | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<ContentBlock[]>([])
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [hiddenBlocks, setHiddenBlocks] = useState<Set<number>>(new Set())
  const [resultView, setResultView] = useState<'markdown' | 'json'>('markdown')
  const [middleJson, setMiddleJson] = useState<MiddleJsonData | null>(null)
  const [structured, setStructured] = useState<V4StructuredContent | null>(null)
  const [showAllBoxes, setShowAllBoxes] = useState(true)
  const [loading, setLoading] = useState(true)

  const fetchFile = useCallback(async () => {
    if (!id) return
    const data = await api.getResult(Number(id))
    setFile(data)
    setLoading(false)
  }, [id])

  useEffect(() => {
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
        const [list, mj, sc] = await Promise.all([
          api.getContentList(Number(id)),
          api.getMiddleJson(Number(id)),
          data.engine === 'local_v4' || data.engine === 'local_v41' ? api.getStructuredContent(Number(id)) : Promise.resolve(null),
        ])
        setBlocks(list)
        setMiddleJson(mj as MiddleJsonData | null)
        setStructured(sc as V4StructuredContent | null)
      }
    }
    init()
  }, [id])

  // 解析中轮询
  useEffect(() => {
    if (!file || file.status === 'done' || file.status === 'failed') return
    const timer = setInterval(fetchFile, 3000)
    return () => clearInterval(timer)
  }, [file, fetchFile])

  // 解析完成后加载 content_list + middle_json
  useEffect(() => {
    if (!id || !file || file.status !== 'done' || blocks.length > 0) return
    Promise.all([
      api.getContentList(Number(id)),
      api.getMiddleJson(Number(id)),
      file.engine === 'local_v4' || file.engine === 'local_v41' ? api.getStructuredContent(Number(id)) : Promise.resolve(null),
    ]).then(([list, mj, sc]) => {
      setBlocks(list)
      setMiddleJson(mj as MiddleJsonData | null)
      setStructured(sc as V4StructuredContent | null)
    })
  }, [blocks.length, file, id])

  const isImage = file
    ? (file.content_type?.startsWith('image/') ?? /\.(png|jpe?g|gif|bmp|webp|tiff?)$/i.test(file.filename))
    : false

  // middle_json 在线 API 解析出来的 PDF 没有；图片有没有则看本地服务是否返回。
  // 只要 middle_json 存在就优先用 V2 组件（原生像素坐标），没有时回退 V1（content_list）。
  const useV2 = file?.engine === 'local_v4' || file?.engine === 'local_v41' ? structured != null : middleJson != null

  const parsedBlocks = useMemo(() => {
    if (file?.engine === 'local_v4' || file?.engine === 'local_v41') return parseV4(structured, middleJson as V4MiddleJson | null)
    if (!useV2) return []
    return parseMiddleJson(middleJson!)
  }, [middleJson, structured, file?.engine, useV2])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (!file) return null

  const isParsing = file.status === 'pending' || file.status === 'running'
  const hasLayoutResults = useV2 ? parsedBlocks.length > 0 : blocks.length > 0
  const hasResults = hasLayoutResults || Boolean(file.result)

  const handleDownloadResult = () => {
    const base = file.filename.replace(/\.[^/.]+$/, '')
    const isJson = resultView === 'json'
    const content = isJson
      ? JSON.stringify({ content_list: blocks, middle_json: middleJson, structured_content: structured }, null, 2)
      : file.result ?? ''
    const blob = new Blob([content], { type: isJson ? 'application/json' : 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${base}.${isJson ? 'json' : 'md'}`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* 顶部标题栏 */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 bg-white shrink-0">
        <span className="text-sm font-medium text-gray-800 truncate max-w-sm">{file.filename}</span>
        <StatusBadge status={file.status} />
        <span className="text-xs text-gray-400">{file.engine === 'local_v41' ? '本地 v4.1' : file.engine === 'local_v4' ? '本地 v4.0' : file.engine === 'cloud' ? '在线 API' : `本地 v3 · ${file.mode === 'sync' ? '同步' : '异步'}`}</span>
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
            <span className="text-xs text-gray-500">{file.source_url ? '远程来源' : '原文件'}</span>
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
                useV2 ? (
                  <ImageViewerV2
                    url={downloadUrl}
                    blocks={parsedBlocks}
                    activeIndex={activeIndex}
                    onBlockClick={setActiveIndex}
                    hiddenBlocks={hiddenBlocks}
                    showAllBoxes={showAllBoxes}
                    onToggleHidden={(i) => setHiddenBlocks(prev => {
                      const next = new Set(prev)
                      if (next.has(i)) next.delete(i)
                      else next.add(i)
                      return next
                    })}
                  />
                ) : (
                  <ImageViewer
                    url={downloadUrl}
                    blocks={blocks}
                    activeIndex={activeIndex}
                    onBlockClick={setActiveIndex}
                    hiddenBlocks={hiddenBlocks}
                    showAllBoxes={showAllBoxes}
                    onToggleHidden={(i) => setHiddenBlocks(prev => {
                      const next = new Set(prev)
                      if (next.has(i)) next.delete(i)
                      else next.add(i)
                      return next
                    })}
                  />
                )
              ) : useV2 ? (
                <PDFViewerV2
                  url={downloadUrl}
                  blocks={parsedBlocks}
                  activeIndex={activeIndex}
                  onBlockClick={setActiveIndex}
                  hiddenBlocks={hiddenBlocks}
                  showAllBoxes={showAllBoxes}
                  onToggleHidden={(i) => setHiddenBlocks(prev => {
                    const next = new Set(prev)
                    if (next.has(i)) next.delete(i)
                    else next.add(i)
                    return next
                  })}
                />
              ) : (
                <PDFViewer
                  url={downloadUrl}
                  blocks={blocks}
                  activeIndex={activeIndex}
                  onBlockClick={setActiveIndex}
                  hiddenBlocks={hiddenBlocks}
                  showAllBoxes={showAllBoxes}
                  onToggleHidden={(i) => setHiddenBlocks(prev => {
                    const next = new Set(prev)
                    if (next.has(i)) next.delete(i)
                    else next.add(i)
                    return next
                  })}
                />
              )
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-gray-400 text-sm">
                {file.source_url ? <><span>URL 来源暂不提供原文件预览</span>
                  <a href={file.source_url} target="_blank" rel="noopener noreferrer" className="max-w-full truncate text-blue-600 underline">打开原始地址</a></>
                  : '暂无文件预览'}
              </div>
            )}
          </div>
        </div>

        {/* 右：内容块查看器 */}
        <div className="w-1/2 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-4 py-1.5 border-b border-gray-100 bg-gray-50 shrink-0">
            <span className="text-xs text-gray-500">解析结果</span>
            {hasResults && (
              <div className="flex items-center gap-2">
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
                <button
                  onClick={handleDownloadResult}
                  title="下载解析结果"
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-white text-gray-500 hover:bg-gray-100 border border-gray-200 transition-colors"
                >
                  <Download size={12} />
                  下载
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
                <JsonViewer value={{ content_list: blocks, middle_json: middleJson, structured_content: structured }} />
              ) : !hasLayoutResults ? (
                <div className="h-full overflow-y-auto p-5 text-sm text-gray-700">
                  <Markdown text={file.result || ''} block />
                </div>
              ) : useV2 ? (
                <ContentViewerV2
                  blocks={parsedBlocks}
                  activeIndex={activeIndex}
                  onBlockClick={setActiveIndex}
                  hiddenBlocks={hiddenBlocks}
                />
              ) : (
                <ContentViewer
                  blocks={blocks}
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
