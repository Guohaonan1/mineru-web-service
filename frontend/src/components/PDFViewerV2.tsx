import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import type { ParsedBlock } from '../types'

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const TYPE_STROKE: Record<string, string> = {
  text:                '#3b82f6',
  title:               '#3b82f6',
  interline_equation:  '#e67aab',
  list:                '#22c55e',
  ref_text:            '#9ca3af',
  table_caption:       '#3b82f6',
  table:               '#10b981',
  image:               '#8b5cf6',
  image_caption:       '#8b5cf6',
}
const DEFAULT_STROKE = '#6b7280'

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function getBlockText(block: ParsedBlock): string {
  return block.text ?? block.latex ?? ''
}

interface ContextMenu { index: number; x: number; y: number }

interface Props {
  url: string
  blocks: ParsedBlock[]
  activeIndex: number | null
  onBlockClick: (index: number) => void
  hiddenBlocks: Set<number>
  showAllBoxes: boolean
  onToggleHidden: (index: number) => void
}

export default function PDFViewerV2({ url, blocks, activeIndex, onBlockClick, hiddenBlocks, showAllBoxes, onToggleHidden }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const [numPages, setNumPages] = useState(0)
  const [containerWidth, setContainerWidth] = useState(600)
  const [loadedPages, setLoadedPages] = useState<Set<number>>(new Set())
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

  const blocksByPage = new Map<number, ParsedBlock[]>()
  for (const block of blocks) {
    if (!blocksByPage.has(block.page_idx)) blocksByPage.set(block.page_idx, [])
    blocksByPage.get(block.page_idx)!.push(block)
  }

  // page_size per page_idx (from the first block on that page)
  const pageSizeMap = new Map<number, [number, number]>()
  for (const block of blocks) {
    if (!pageSizeMap.has(block.page_idx)) pageSizeMap.set(block.page_idx, block.page_size)
  }

  return (
    <div className="w-full h-full flex flex-col bg-gray-100">
      {/* 右键菜单 */}
      {contextMenu && (() => {
        const block = blocks[contextMenu.index]
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
            {block.discarded && (
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
            const pageIdx = i  // page_idx is 0-based
            const pageBlocks = blocksByPage.get(pageIdx) ?? []
            const pageSize = pageSizeMap.get(pageIdx)
            const isLoaded = loadedPages.has(pageIdx)

            return (
              <div
                key={i}
                className="relative mx-auto mb-4 shadow-md"
                style={{ width: containerWidth }}
                ref={(el) => { if (el) pageRefs.current.set(pageIdx, el) }}
              >
                <Page
                  pageNumber={i + 1}
                  width={containerWidth}
                  onLoadSuccess={() => setLoadedPages(prev => new Set(prev).add(pageIdx))}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />

                {/* SVG bbox 覆盖层：使用 middle_json 原生 page_size 作为 viewBox */}
                {isLoaded && pageSize && (
                  <svg
                    className="absolute inset-0 w-full h-full"
                    viewBox={`0 0 ${pageSize[0]} ${pageSize[1]}`}
                    preserveAspectRatio="none"
                  >
                    <g>
                      {pageBlocks.map((block) => {
                        const index = block.index
                        const isActive = index === activeIndex
                        const isHovered = index === hoveredIndex
                        const isHidden = hiddenBlocks.has(index)
                        const [x1, y1, x2, y2] = block.bbox
                        const stroke = block.discarded ? '#9ca3af' : (TYPE_STROKE[block.type] ?? DEFAULT_STROKE)

                        let fill = 'transparent'
                        let strokeColor = 'transparent'
                        let strokeOpacity = 1
                        let strokeDasharray: string | undefined

                        if (isHidden) {
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
                          strokeColor = stroke
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
