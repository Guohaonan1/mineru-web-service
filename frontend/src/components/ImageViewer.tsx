import { useEffect, useRef, useState } from 'react'
import type { ContentBlock } from '../types'

// MinerU 对图片使用与 PDF 相同的固定正方形坐标系
const MINERU_N = 595 * (120 / 72)  // ≈ 991.7

const NOISE_TYPES = new Set(['page_number', 'footer', 'header', 'aside_text'])

const TYPE_STROKE: Record<string, string> = {
  text:          '#3b82f6',
  equation:      '#e67aab',   // pink
  list:          '#22c55e',
  table:         '#10b981',   // green
  image:         '#8b5cf6',   // purple
  page_footnote: '#9ca3af',
}
const DEFAULT_STROKE = '#6b7280'

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function getBlockText(block: ContentBlock): string {
  if (block.type === 'list') return block.list_items?.join('\n') ?? ''
  if (block.type === 'image') return block.image_caption?.[0] ?? ''
  if (block.type === 'table') return block.table_caption?.[0] ?? ''
  return block.text ?? ''
}

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

export default function ImageViewer({ url, blocks, activeIndex, onBlockClick, hiddenBlocks, showAllBoxes, onToggleHidden }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const blockRef = useRef<Map<number, SVGRectElement>>(new Map())
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)

  useEffect(() => {
    const dismiss = () => setContextMenu(null)
    document.addEventListener('click', dismiss)
    return () => document.removeEventListener('click', dismiss)
  }, [])

  useEffect(() => {
    if (activeIndex === null) return
    blockRef.current.get(activeIndex)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeIndex])

  const safeBlocks = Array.isArray(blocks) ? blocks : []

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

      {/* 图片 + SVG 覆盖层 */}
      <div ref={containerRef} className="flex-1 overflow-auto px-4 py-4">
        <div className="relative mx-auto shadow-md">
          <img
            src={url}
            alt="document"
            className="block w-full h-auto"
          />
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox={`0 0 ${MINERU_N} ${MINERU_N}`}
            preserveAspectRatio="none"
          >
            <g>
              {safeBlocks.map((block, index) => {
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
                    ref={(el) => { if (el) blockRef.current.set(index, el) }}
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
        </div>
      </div>
    </div>
  )
}
