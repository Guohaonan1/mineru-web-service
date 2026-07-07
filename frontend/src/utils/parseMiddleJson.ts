import type { MiddleJsonData, MjBlock, MjLine, ParsedBlock } from '../types'

function spanText(span: MjLine['spans'][number]): string {
  const content = span.content ?? ''
  // 行内公式：middle_json 里 content 是裸 LaTeX，没有 $ 包裹，
  // 要手动包一层 $...$ 才能被 remark-math/KaTeX 识别渲染（V1 的 content_list 已经预先包好了）
  return span.type === 'inline_equation' && content ? `$${content}$` : content
}

function spansText(lines: MjLine[] = []): string {
  return lines
    .map(l => l.spans.map(spanText).join(' '))
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
    // 跟行内公式一样，middle_json 里 content 是裸 LaTeX，要包一层 $$...$$ 才能被
    // remark-math/KaTeX 识别成块级公式渲染（V1 的 content_list 已经预先包好了）
    out.push({
      index: out.length,
      page_idx,
      page_size,
      type: 'interline_equation',
      bbox: block.bbox,
      latex: span?.content ? `$$\n${span.content}\n$$` : undefined,
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

  // chart：结构跟 image 一样（chart_body + chart_caption），只是 MinerU 换了个名字，
  // 而且 caption 可能前后各出现一次（简短标题 + 完整图注），按原始顺序逐个处理，
  // 复用 image/image_caption 类型渲染（视觉上跟普通图片没有区别）。
  if (type === 'chart') {
    for (const sub of block.blocks ?? []) {
      if (sub.type === 'chart_body') {
        const imgSpan = sub.lines?.[0]?.spans?.find(s => s.image_path)
        out.push({
          index: out.length,
          page_idx,
          page_size,
          type: 'image',
          bbox: sub.bbox,
          img_path: imgSpan?.image_path,
          discarded,
        })
      } else if (sub.type === 'chart_caption') {
        out.push({
          index: out.length,
          page_idx,
          page_size,
          type: 'image_caption',
          bbox: sub.bbox,
          text: spansText(sub.lines),
          discarded,
        })
      }
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
