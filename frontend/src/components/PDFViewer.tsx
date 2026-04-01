import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import type { ContentBlock } from '../types'

function getBlockText(block: ContentBlock): string {
  if (block.type === 'list') return block.list_items?.join('\n') ?? ''
  if (block.type === 'image') return block.image_caption?.[0] ?? ''
  if (block.type === 'table') return block.table_caption?.[0] ?? ''
  return block.text ?? ''
}

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const NOISE_TYPES = new Set(['page_number', 'footer', 'header', 'aside_text'])

// MinerU 对所有 PDF 使用固定边长 N≈992 的正方形图片送入 ML 模型
// N 由 A4（595pt）× 120 DPI / 72 推导而来，Letter/其他尺寸复用同一个 N
// preserveAspectRatio="none" 让浏览器按实际页面宽高比独立缩放 X/Y
const MINERU_N = 595 * (120 / 72)  // ≈ 991.7，固定值，不随页面尺寸变化

const TYPE_STROKE: Record<string, string> = {
  text:          '#3b82f6',   // blue
  equation:      '#e67aab',   // pink
  list:          '#22c55e',   // green
  table:         '#10b981',   // green
  image:         '#8b5cf6',   // purple
  page_footnote: '#9ca3af',   // gray
}
const DEFAULT_STROKE = '#6b7280'

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

interface PageSize { width: number; height: number }

interface ContextMenu { index: number; x: number; y: number }

interface Props {
  url: string
  blocks: ContentBlock[]
  activeIndex: number | null
  onBlockClick: (index: number) => void
  hiddenBlocks: Set<number>
  showAllBoxes: boolean
  onToggleHidden: (index: number) => void
}

export default function PDFViewer({ url, blocks, activeIndex, onBlockClick, hiddenBlocks, showAllBoxes, onToggleHidden }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const [numPages, setNumPages] = useState(0)
  const [containerWidth, setContainerWidth] = useState(600)
  const [pageSizes, setPageSizes] = useState<Map<number, PageSize>>(new Map())
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (activeIndex === null) return
    const block = blocks[activeIndex]
    if (!block) return
    pageRefs.current.get(block.page_idx)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeIndex, blocks])

  useEffect(() => {
    const dismiss = () => setContextMenu(null)
    document.addEventListener('click', dismiss)
    return () => document.removeEventListener('click', dismiss)
  }, [])

  const blocksByPage = new Map<number, Array<{ block: ContentBlock; index: number }>>()
  const safeBlocks = Array.isArray(blocks) ? blocks : []
  safeBlocks.forEach((block, index) => {
    const page = block.page_idx
    if (!blocksByPage.has(page)) blocksByPage.set(page, [])
    blocksByPage.get(page)!.push({ block, index })
  })

  return (
    <div className="w-full h-full flex flex-col bg-gray-100">
      {/* 右键菜单 */}
      {contextMenu && (() => {
        const block = blocks[contextMenu.index]
        const isNoise = block && NOISE_TYPES.has(block.type)
        const isHidden = hiddenBlocks.has(contextMenu.index)
        return (
          <div
            style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 50 }}
            className="bg-white shadow-lg rounded-lg border border-gray-200 py-1 min-w-[90px] text-sm"
            onClick={e => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700"
              onClick={() => {
                navigator.clipboard.writeText(getBlockText(block))
                setContextMenu(null)
              }}
            >
              复制
            </button>
            {isNoise && (
              <button
                className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-500"
                onClick={() => {
                  onToggleHidden(contextMenu.index)
                  setContextMenu(null)
                }}
              >
                {isHidden ? '显示' : '隐藏'}
              </button>
            )}
          </div>
        )
      })()}

      {/* 可滚动 PDF 区域 */}
      <div ref={containerRef} className="flex-1 overflow-auto px-4 py-4">
        <Document
          file={url}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={<div className="text-center text-gray-400 pt-10 text-sm">加载中...</div>}
        >
          {Array.from({ length: numPages }, (_, i) => {
            const pageNum = i
            const pageBlocks = blocksByPage.get(pageNum) ?? []
            const size = pageSizes.get(pageNum)

            // 固定正方形 viewBox，N ≈ 992，所有页面尺寸复用
            const N = size ? MINERU_N : 0

            return (
              <div
                key={i}
                className="relative mx-auto mb-4 shadow-md"
                style={{ width: containerWidth }}
                ref={(el) => { if (el) pageRefs.current.set(pageNum, el) }}
              >
                <Page
                  pageNumber={i + 1}
                  width={containerWidth}
                  onLoadSuccess={(page) => {
                    const vp = page.getViewport({ scale: 1 })
                    const N = MINERU_N
                    const renderedH = containerWidth * (vp.height / vp.width)
                    console.log(
                      `[PDFViewer] page=${pageNum}`,
                      `pdf=${vp.width.toFixed(1)}×${vp.height.toFixed(1)}pt`,
                      `containerWidth=${containerWidth}px`,
                      `renderedH=${renderedH.toFixed(1)}px`,
                      `N=${N.toFixed(1)}`,
                      `scaleX=${(containerWidth / N).toFixed(4)}`,
                      `scaleY=${(renderedH / N).toFixed(4)}`,
                    )
                    setPageSizes(prev => new Map(prev).set(pageNum, { width: vp.width, height: vp.height }))
                  }}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />

                {/* SVG bbox 覆盖层 */}
                {size && (
                  <svg
                    className="absolute inset-0 w-full h-full"
                    viewBox={`0 0 ${N} ${N}`}
                    preserveAspectRatio="none"
                  >
                    <g>
                      {pageBlocks.map(({ block, index }) => {
                        const isActive = index === activeIndex
                        const isHovered = index === hoveredIndex
                        const isHidden = hiddenBlocks.has(index)
                        const [x1, y1, x2, y2] = block.bbox
                        const stroke = TYPE_STROKE[block.type] ?? DEFAULT_STROKE

                        const isNoise = NOISE_TYPES.has(block.type)

                        let fill = 'transparent'
                        let strokeColor = 'transparent'
                        let strokeOpacity = 1
                        let strokeDasharray: string | undefined

                        if (isHidden) {
                          fill = 'transparent'
                          strokeColor = '#d1d5db'
                          strokeOpacity = 0.6
                          strokeDasharray = '4 3'
                        } else if (isActive) {
                          fill = hexToRgba(stroke, 0.2)
                          strokeColor = stroke
                        } else if (isHovered) {
                          fill = hexToRgba(stroke, 0.08)
                          strokeColor = hexToRgba(stroke, 0.6)
                        } else if (showAllBoxes) {
                          fill = 'rgba(0,0,0,0.01)'
                          strokeColor = isNoise ? '#9ca3af' : stroke
                          strokeOpacity = 0.5
                        }

                        return (
                          <rect
                            key={index}
                            x={x1} y={y1}
                            width={x2 - x1} height={y2 - y1}
                            fill={fill}
                            stroke={strokeColor}
                            strokeOpacity={strokeOpacity}
                            strokeWidth={1}
                            strokeDasharray={strokeDasharray}
                            vectorEffect="non-scaling-stroke"
                            style={{ cursor: 'pointer' }}
                            onClick={(e) => {
                              e.stopPropagation()
                              onBlockClick(index)
                              setContextMenu({ index, x: e.clientX, y: e.clientY })
                            }}
                            onMouseEnter={() => setHoveredIndex(index)}
                            onMouseLeave={() => setHoveredIndex(null)}
                          />
                        )
                      })}
                    </g>
                  </svg>
                )}
              </div>
            )
          })}
        </Document>
      </div>
    </div>
  )
}
