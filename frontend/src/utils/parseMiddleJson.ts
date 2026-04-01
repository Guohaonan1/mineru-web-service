import type { MiddleJsonData, MjBlock, MjLine, ParsedBlock } from '../types'

function spansText(lines: MjLine[] = []): string {
  return lines
    .map(l => l.spans.map(s => s.content ?? '').join(' '))
    .join(' ')
    .trim()
}

function processBlock(
  block: MjBlock,
  page_idx: number,
  page_size: [number, number],
  out: ParsedBlock[],
  discarded = false,
) {
  const type = block.type

  if (type === 'text' || type === 'title' || type === 'list' || type === 'ref_text') {
    out.push({
      index: out.length,
      page_idx,
      page_size,
      type: type as ParsedBlock['type'],
      bbox: block.bbox,
      text: spansText(block.lines),
      discarded,
    })
    return
  }

  if (type === 'interline_equation') {
    const span = block.lines?.[0]?.spans?.[0]
    out.push({
      index: out.length,
      page_idx,
      page_size,
      type: 'interline_equation',
      bbox: block.bbox,
      latex: span?.content,
      img_path: span?.image_path,
      discarded,
    })
    return
  }

  if (type === 'table') {
    const captionBlock = block.blocks?.find(b => b.type === 'table_caption')
    const bodyBlock = block.blocks?.find(b => b.type === 'table_body')

    if (captionBlock) {
      out.push({
        index: out.length,
        page_idx,
        page_size,
        type: 'table_caption',
        bbox: captionBlock.bbox,
        text: spansText(captionBlock.lines),
        discarded,
      })
    }

    const htmlSpan = bodyBlock?.lines?.[0]?.spans?.find(s => s.html)
    out.push({
      index: out.length,
      page_idx,
      page_size,
      type: 'table',
      bbox: bodyBlock?.bbox ?? block.bbox,
      html: htmlSpan?.html,
      img_path: bodyBlock?.lines?.[0]?.spans?.find(s => s.image_path)?.image_path,
      discarded,
    })
    return
  }

  if (type === 'image') {
    const bodyBlock = block.blocks?.find(b => b.type === 'image_body')
    const captionBlock = block.blocks?.find(b => b.type === 'image_caption')

    const imgSpan = bodyBlock?.lines?.[0]?.spans?.find(s => s.image_path)
    out.push({
      index: out.length,
      page_idx,
      page_size,
      type: 'image',
      bbox: bodyBlock?.bbox ?? block.bbox,
      img_path: imgSpan?.image_path,
      discarded,
    })

    if (captionBlock) {
      out.push({
        index: out.length,
        page_idx,
        page_size,
        type: 'image_caption',
        bbox: captionBlock.bbox,
        text: spansText(captionBlock.lines),
        discarded,
      })
    }
    return
  }

  // 兜底：discarded_blocks 中未知类型（header/footer/page_number 等），有文本则作为 text 处理
  const text = spansText(block.lines)
  if (text) {
    out.push({
      index: out.length,
      page_idx,
      page_size,
      type: 'text',
      bbox: block.bbox,
      text,
      discarded,
    })
  }
}

export function parseMiddleJson(data: MiddleJsonData): ParsedBlock[] {
  const out: ParsedBlock[] = []
  for (const page of data.pdf_info) {
    const page_size = page.page_size as [number, number]
    const TYPE_ORDER: Record<string, number> = {
      aside_text: -2, aside: -2,
      header: -1,
      footer: 1000,
      page_number: 1001,
    }
    const tagged = [
      ...page.para_blocks.map(b => ({ block: b, discarded: false })),
      ...(page.discarded_blocks ?? []).map(b => ({ block: b, discarded: true })),
    ].sort((a, b) => {
      const oa = TYPE_ORDER[a.block.type] ?? 0
      const ob = TYPE_ORDER[b.block.type] ?? 0
      if (oa !== ob) return oa - ob
      return (a.block.bbox?.[1] ?? 0) - (b.block.bbox?.[1] ?? 0)
    })

    for (const { block, discarded } of tagged) {
      processBlock(block, page.page_idx, page_size, out, discarded)
    }
  }
  out.forEach((b, i) => { b.index = i })
  return out
}
