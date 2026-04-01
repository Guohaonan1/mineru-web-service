export interface FileItem {
  id: number
  filename: string
  minio_path: string | null
  status: 'pending' | 'running' | 'done' | 'failed'
  created_at: string
  updated_at: string
}

export interface FileDetail extends FileItem {
  content_type: string | null
  result: string | null
  error: string | null
}

// ── middle_json 原始类型 ──────────────────────────────────────────
export interface MjSpan {
  type: string
  bbox: [number, number, number, number]
  content?: string
  image_path?: string
  html?: string
  score?: number
}

export interface MjLine {
  bbox: [number, number, number, number]
  spans: MjSpan[]
}

export interface MjBlock {
  type: string
  bbox: [number, number, number, number]
  index?: number
  angle?: number
  lines?: MjLine[]
  blocks?: MjBlock[]
}

export interface MjPage {
  page_idx: number
  page_size: [number, number]
  para_blocks: MjBlock[]
  discarded_blocks: MjBlock[]
}

export interface MiddleJsonData {
  pdf_info: MjPage[]
  _backend?: string
  _ocr_enable?: boolean
  _vlm_ocr_enable?: boolean
}

// ── 解析后的扁平化块（供 V2 组件使用）────────────────────────────
export interface ParsedBlock {
  index: number
  page_idx: number
  page_size: [number, number]
  type: 'text' | 'title' | 'table_caption' | 'table' | 'image' | 'image_caption' | 'interline_equation' | 'list' | 'ref_text'
  bbox: [number, number, number, number]
  text?: string       // text / title / table_caption / image_caption / list
  html?: string       // table body HTML
  img_path?: string   // image / interline_equation (base64 or data URL)
  latex?: string      // interline_equation LaTeX
  discarded?: boolean // from discarded_blocks (header / footer / aside etc.)
}

export interface ContentBlock {
  type: 'text' | 'image' | 'equation' | 'table' | 'list' | 'header' | 'footer' | 'page_footnote' | 'aside_text' | 'page_number'
  // text / equation
  text?: string
  text_level?: number
  text_format?: string
  // image
  img_path?: string
  image_caption?: string[]
  // table
  table_body?: string
  table_caption?: string[]
  img_path_table?: string
  // list
  list_items?: string[]
  // position
  bbox: [number, number, number, number]  // [x1, y1, x2, y2] PDF 坐标
  page_idx: number
}
