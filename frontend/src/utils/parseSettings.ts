export interface ParseSettings {
  v4Tier: 'flash' | 'basic' | 'standard' | 'advanced'
  v4Ocr: 'auto' | 'txt' | 'ocr'
  cloudModel: 'vlm' | 'pipeline'
  cloudOcr: boolean
  cloudTable: boolean
  cloudFormula: boolean
  v3Mode: 'async' | 'sync'
}

export const defaultParseSettings: ParseSettings = {
  v4Tier: 'standard', v4Ocr: 'auto', cloudModel: 'vlm', cloudOcr: false,
  cloudTable: true, cloudFormula: true, v3Mode: 'async',
}

export const tierOptions = [
  { value: 'flash', label: 'Flash', description: '快速解析；网页固定使用' },
  { value: 'basic', label: 'Basic', description: '基础模型解析' },
  { value: 'standard', label: 'Standard', description: '推荐的文档解析档位' },
  { value: 'advanced', label: 'Advanced', description: '更高质量，需服务支持' },
] as const

export const ocrOptions = [
  { value: 'auto', label: '自动判断', description: '按文档内容选择' },
  { value: 'txt', label: '原生文字', description: '优先读取文本层' },
  { value: 'ocr', label: '强制 OCR', description: '重新识别页面文字' },
] as const

export const cloudModelOptions = [
  { value: 'vlm', label: 'VLM', description: '推荐的视觉语言模型' },
  { value: 'pipeline', label: 'Pipeline', description: '传统解析流水线' },
] as const

export const v3ModeOptions = [
  { value: 'async', label: '异步', description: '推荐，适合较大文档' },
  { value: 'sync', label: '同步', description: '兼容 2.7.6' },
] as const

const KEY = 'mineru-parse-settings'

export function getParseSettings(): ParseSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '{}')
    return { ...defaultParseSettings, ...stored }
  } catch {
    return { ...defaultParseSettings }
  }
}

export function saveParseSettings(settings: ParseSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings))
}
