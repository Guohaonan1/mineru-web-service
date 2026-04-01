import { useEffect, useRef } from 'react'
import type { ParsedBlock } from '../types'

interface Props {
  blocks: ParsedBlock[]
  activeIndex: number | null
  onBlockClick: (index: number) => void
  hiddenBlocks: Set<number>
}

function BlockContent({ block, isActive }: { block: ParsedBlock; isActive: boolean }) {
  switch (block.type) {
    case 'title':
      return (
        <h2 className="text-[1.05rem] font-semibold text-gray-800 mt-5 mb-2 leading-snug">
          {block.text}
        </h2>
      )

    case 'text':
      return (
        <p className="text-[0.875rem] leading-[1.75] text-gray-700">
          {block.text}
        </p>
      )

    case 'list':
      return (
        <ul className="my-2 space-y-1 pl-5">
          {block.text?.split('\n').map((item, i) => (
            <li key={i} className="text-[0.875rem] leading-[1.75] text-gray-700 list-disc">
              {item}
            </li>
          ))}
        </ul>
      )

    case 'ref_text':
      return (
        <p className="text-[0.75rem] text-gray-400 leading-relaxed border-t border-gray-100 pt-2 mt-2">
          {block.text}
        </p>
      )

    case 'interline_equation':
      return (
        <div
          className="my-3 px-4 py-3 rounded-lg font-mono text-[0.8rem] overflow-x-auto whitespace-pre-wrap transition-all"
          style={isActive
            ? { background: 'rgba(230,122,171,0.15)', border: '1px solid rgba(230,122,171,0.7)', color: '#b5446e' }
            : { color: '#6b7280' }
          }
        >
          {block.latex ?? block.text}
        </div>
      )

    case 'table_caption':
      return (
        <p className="text-[0.875rem] leading-[1.75] text-gray-700">{block.text}</p>
      )

    case 'table':
      return (
        <div
          className="mb-3 overflow-x-auto transition-all"
          style={isActive ? { outline: '1px solid rgba(16,185,129,0.7)', background: 'rgba(16,185,129,0.06)' } : undefined}
        >
          {block.html ? (
            <div
              className="text-[0.8rem]
                [&_table]:w-max [&_table]:min-w-full [&_table]:border-collapse
                [&_th]:px-3 [&_th]:py-2 [&_th]:bg-gray-50 [&_th]:text-gray-600 [&_th]:font-medium [&_th]:text-left [&_th]:border [&_th]:border-gray-400
                [&_td]:px-3 [&_td]:py-2 [&_td]:text-gray-700 [&_td]:border [&_td]:border-gray-400
                [&_tr:hover_td]:bg-gray-50"
              dangerouslySetInnerHTML={{ __html: block.html }}
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
              alt=""
              style={{ width: '36%', display: 'block', marginLeft: '50%', transform: 'translate(-50%)' }}
            />
          ) : (
            <div className="rounded-lg border border-dashed px-4 py-3" style={{ borderColor: 'rgba(139,92,246,0.4)' }}>
              <p className="text-xs" style={{ color: '#8b5cf6' }}>[图片]</p>
            </div>
          )}
        </div>
      )

    case 'image_caption':
      return (
        <p className="text-xs text-center mb-3 italic" style={{ color: '#8b5cf6' }}>
          {block.text}
        </p>
      )

    default:
      return <p className="text-[0.875rem] text-gray-500">{block.text}</p>
  }
}

export default function ContentViewerV2({ blocks, activeIndex, onBlockClick, hiddenBlocks }: Props) {
  const blockRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  useEffect(() => {
    if (activeIndex === null) return
    blockRefs.current.get(activeIndex)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeIndex])

  const safeBlocks = Array.isArray(blocks) ? blocks : []

  let lastPageIdx = -1

  return (
    <div className="h-full overflow-auto px-6 py-5 bg-white">
      {safeBlocks.map((block) => {
        if (hiddenBlocks.has(block.index)) return null

        const isActive = block.index === activeIndex

        // 页面分隔线
        const pageSep = block.page_idx !== lastPageIdx && lastPageIdx !== -1
        lastPageIdx = block.page_idx

        const isEquationOrImage = block.type === 'interline_equation' || block.type === 'image' || block.type === 'table'

        return (
          <div key={block.index}>
            {pageSep && (
              <div className="relative flex justify-center my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <span className="relative px-4 bg-white text-xs text-black/[0.35]">
                  第 {block.page_idx + 1} 页
                </span>
              </div>
            )}
            <div
              ref={(el) => { if (el) blockRefs.current.set(block.index, el) }}
              onClick={() => onBlockClick(block.index)}
              className={`rounded-md transition-all duration-150 cursor-pointer ${
                block.discarded
                  ? isActive
                    ? 'bg-gray-100 ring-1 ring-gray-400'
                    : 'ring-1 ring-gray-200 hover:bg-gray-100'
                  : 'px-2 py-0.5 ' + (isEquationOrImage
                    ? 'hover:bg-gray-50'
                    : isActive
                      ? 'bg-blue-50 ring-1 ring-blue-300 shadow-sm'
                      : 'hover:bg-gray-50')
              }`}
            >
              <BlockContent block={block} isActive={isActive} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
