import { useEffect, useRef } from 'react'
import type { ContentBlock } from '../types'

const NOISE_TYPES = new Set(['page_number', 'footer', 'header', 'aside_text'])

interface Props {
  blocks: ContentBlock[]
  activeIndex: number | null
  onBlockClick: (index: number) => void
  hiddenBlocks: Set<number>
}

function BlockContent({ block, isActive }: { block: ContentBlock; isActive: boolean }) {
  switch (block.type) {
    case 'text': {
      const level = block.text_level
      if (level === 1) return (
        <h1 className="text-[1.25rem] font-bold text-gray-900 mt-6 mb-3 leading-snug border-b border-gray-100 pb-2">
          {block.text}
        </h1>
      )
      if (level === 2) return (
        <h2 className="text-[1.05rem] font-semibold text-gray-800 mt-5 mb-2 leading-snug">
          {block.text}
        </h2>
      )
      if (level === 3) return (
        <h3 className="text-[0.95rem] font-semibold text-gray-700 mt-4 mb-1.5">
          {block.text}
        </h3>
      )
      return (
        <p className="text-[0.875rem] leading-[1.75] text-gray-700">
          {block.text}
        </p>
      )
    }

    case 'equation':
      return (
        <div
          className="my-3 px-4 py-3 rounded-lg font-mono text-[0.8rem] overflow-x-auto whitespace-pre-wrap transition-all"
          style={isActive
            ? { background: 'rgba(230,122,171,0.15)', border: '1px solid rgba(230,122,171,0.7)', color: '#b5446e' }
            : { color: '#6b7280' }
          }
        >
          {block.text}
        </div>
      )

    case 'list':
      return (
        <ul className="my-2 space-y-1.5 pl-5">
          {block.list_items?.map((item, i) => (
            <li key={i} className="text-[0.875rem] leading-[1.75] text-gray-700 list-disc">
              {item}
            </li>
          ))}
        </ul>
      )

    case 'table':
      return (
        <div className="my-3 overflow-x-auto transition-all rounded-lg" style={isActive ? { outline: '1px solid rgba(16,185,129,0.7)', background: 'rgba(16,185,129,0.06)' } : undefined}>
          {block.table_caption && block.table_caption.length > 0 && (
            <p className="text-xs text-gray-500 mb-2 italic">{block.table_caption[0]}</p>
          )}
          {block.table_body ? (
            <div
              className="text-[0.8rem] rounded-lg overflow-hidden border border-gray-200
                [&_table]:w-full [&_table]:border-collapse
                [&_th]:px-3 [&_th]:py-2 [&_th]:bg-gray-50 [&_th]:text-gray-600 [&_th]:font-medium [&_th]:text-left [&_th]:border-b [&_th]:border-gray-200
                [&_td]:px-3 [&_td]:py-2 [&_td]:text-gray-700 [&_td]:border-b [&_td]:border-gray-100
                [&_tr:last-child_td]:border-b-0
                [&_tr:hover_td]:bg-gray-50"
              dangerouslySetInnerHTML={{ __html: block.table_body }}
            />
          ) : (
            <div className="text-xs text-gray-400 italic py-2">表格（图片格式）</div>
          )}
        </div>
      )

    case 'image':
      return (
        <div
          className="my-3 rounded-lg transition-all"
          style={isActive ? { outline: '1px solid rgba(139,92,246,0.7)', background: 'rgba(139,92,246,0.08)' } : undefined}
        >
          {block.img_path ? (
            <img
              src={block.img_path}
              alt={block.image_caption?.[0] ?? ''}
              style={{ width: '36%', display: 'block', marginLeft: '50%', transform: 'translate(-50%)' }}
            />
          ) : (
            <div className="rounded-lg border border-dashed px-4 py-3" style={{ borderColor: 'rgba(139,92,246,0.4)' }}>
              <p className="text-xs" style={{ color: '#8b5cf6' }}>[图片]</p>
            </div>
          )}
          {block.image_caption && block.image_caption.length > 0 && (
            <p className="text-xs text-center mt-1.5 italic" style={{ color: '#8b5cf6' }}>{block.image_caption[0]}</p>
          )}
        </div>
      )

    case 'page_footnote':
      return (
        <p className="text-[0.75rem] text-gray-400 leading-relaxed border-t border-gray-100 pt-2 mt-2">
          {block.text}
        </p>
      )

    case 'page_number':
      return (
        <>
          <p className="text-[0.75rem] text-gray-400">{block.text}</p>
          <div className="relative flex justify-center my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <span className="relative px-4 bg-white text-xs text-black/[0.35]">第 {block.page_idx + 1} 页</span>
          </div>
        </>
      )

    default:
      return <p className="text-[0.875rem] text-gray-500">{block.text}</p>
  }
}

export default function ContentViewer({ blocks, activeIndex, onBlockClick, hiddenBlocks }: Props) {
  const blockRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  useEffect(() => {
    if (activeIndex === null) return
    const el = blockRefs.current.get(activeIndex)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeIndex])

  const safeBlocks = Array.isArray(blocks) ? blocks : []

  return (
    <div className="h-full overflow-auto px-6 py-5 bg-white">
      {safeBlocks.map((block, index) => {
        if (hiddenBlocks.has(index)) return null
        const isNoise = NOISE_TYPES.has(block.type)
        const isActive = index === activeIndex

        return (
          <div
            key={index}
            ref={(el) => { if (el) blockRefs.current.set(index, el) }}
            onClick={() => onBlockClick(index)}
            className={`rounded-md px-2 py-0.5 transition-all duration-150 ${
              block.type === 'equation' || block.type === 'image' || block.type === 'table' || block.type === 'page_number'
                ? block.type === 'page_number' ? 'cursor-default' : 'hover:bg-gray-50 cursor-pointer'
                : isNoise
                  ? isActive
                    ? 'bg-blue-50 ring-1 ring-blue-300 shadow-sm opacity-50'
                    : 'opacity-30 hover:opacity-60 cursor-pointer'
                  : isActive
                    ? 'bg-blue-50 ring-1 ring-blue-300 shadow-sm'
                    : 'hover:bg-gray-50 cursor-pointer'
            }`}
          >
            <BlockContent block={block} isActive={isActive} />
          </div>
        )
      })}
    </div>
  )
}
