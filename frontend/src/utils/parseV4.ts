import type { ParsedBlock } from '../types'

type Box = [number, number, number, number]
type V4Caption = string | { bbox?: Box; content: string }
type V4Block = {
  type: string
  bbox?: Box
  content?: string
  image_source?: string
  captions?: V4Caption[]
  footnotes?: V4Caption[]
}
type V4Page = { page_idx: number; blocks: V4Block[] }
export type V4StructuredContent = { pages: V4Page[] }
export type V4MiddleJson = {
  pages: { page_idx: number; blocks: unknown[] }[]
  extensions?: { docvortex_layout?: { pages?: { page_idx: number; width_pt: number; height_pt: number }[] } }
}

const BOX_TYPES: Record<string, ParsedBlock['type']> = {
  doc_title: 'title', paragraph_title: 'title', title: 'title',
  text: 'text', list: 'list', image: 'image', chart: 'image',
  table: 'table', equation: 'interline_equation', interline_equation: 'interline_equation',
  formula: 'interline_equation', ref_text: 'ref_text',
}
const EDGE_TYPES = new Set(['header', 'footer', 'page_number', 'page_footnote', 'aside_text'])

export function parseV4(
  structured: V4StructuredContent | null,
  middle: V4MiddleJson | null,
): ParsedBlock[] {
  if (!structured?.pages) return []
  const sizes = new Map((middle?.extensions?.docvortex_layout?.pages ?? [])
    .map(page => [page.page_idx, [page.width_pt, page.height_pt] as [number, number]]))
  const out: ParsedBlock[] = []
  for (const page of structured.pages) {
    const page_size = sizes.get(page.page_idx) ?? [1, 1]
    for (const block of page.blocks ?? []) {
      const type = BOX_TYPES[block.type] ?? (EDGE_TYPES.has(block.type) ? 'text' : null)
      if (!type || !block.bbox) continue
      const bbox = [block.bbox[0] * page_size[0], block.bbox[1] * page_size[1],
        block.bbox[2] * page_size[0], block.bbox[3] * page_size[1]] as Box
      const text = block.content ?? ''
      out.push({
        index: out.length,
        page_idx: page.page_idx,
        page_size,
        bbox,
        type,
        text: type === 'interline_equation' ? undefined : text,
        latex: type === 'interline_equation' ? `$$\n${text}\n$$` : undefined,
        html: type === 'table' ? text : undefined,
        img_path: block.image_source,
        discarded: EDGE_TYPES.has(block.type),
      })
      for (const caption of block.captions ?? []) {
        const text = typeof caption === 'string' ? caption : caption.content
        if (typeof text !== 'string' || !text) continue
        const captionBox = typeof caption === 'string' ? block.bbox : (caption.bbox ?? block.bbox)
        out.push({ index: out.length, page_idx: page.page_idx, page_size,
          bbox: [captionBox[0] * page_size[0], captionBox[1] * page_size[1],
            captionBox[2] * page_size[0], captionBox[3] * page_size[1]],
          type: type === 'table' ? 'table_caption' : 'image_caption', text })
      }
    }
  }
  return out
}
