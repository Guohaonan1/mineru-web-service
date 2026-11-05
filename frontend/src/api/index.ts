import type { ContentBlock, FileDetail, FileItem } from '../types'
import type { ParseSettings } from '../utils/parseSettings'

const BASE = '/api'

export interface V4ModelStatus {
  state: 'checking' | 'missing' | 'downloading' | 'verifying' | 'ready' | 'failed'
  ready: boolean
  detail: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  upload(file: File): Promise<FileItem> {
    const form = new FormData()
    form.append('file', file)
    return request('/files/upload', { method: 'POST', body: form })
  },

  uploadAsync(file: File): Promise<FileItem> {
    const form = new FormData()
    form.append('file', file)
    return request('/files/upload_async', { method: 'POST', body: form })
  },

  uploadV4(file: File, options: ParseSettings): Promise<FileItem> {
    const form = new FormData()
    form.append('file', file)
    form.append('tier', options.v4Tier)
    form.append('ocr_mode', options.v4Ocr)
    return request('/files/upload_v4', { method: 'POST', body: form })
  },

  uploadV41(file: File, options: ParseSettings): Promise<FileItem> {
    const form = new FormData()
    form.append('file', file)
    form.append('tier', options.v4Tier)
    form.append('ocr_mode', options.v4Ocr)
    return request('/files/upload_v41', { method: 'POST', body: form })
  },

  uploadCloud(file: File, apiKey: string, options: ParseSettings): Promise<FileItem> {
    const form = new FormData()
    form.append('file', file)
    form.append('api_key', apiKey)
    form.append('model_version', options.cloudModel)
    form.append('is_ocr', String(options.cloudOcr))
    form.append('enable_table', String(options.cloudTable))
    form.append('enable_formula', String(options.cloudFormula))
    return request('/files/upload_cloud', { method: 'POST', body: form })
  },

  parseUrl(url: string, kind: 'document' | 'web', engine: 'local_v4' | 'local_v41' | 'cloud',
           options: ParseSettings, apiKey: string): Promise<FileItem> {
    return request('/files/parse_url', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, kind, engine, api_key: engine === 'cloud' ? apiKey : null,
        tier: options.v4Tier, ocr_mode: options.v4Ocr, model_version: options.cloudModel,
        is_ocr: options.cloudOcr, enable_table: options.cloudTable, enable_formula: options.cloudFormula }) })
  },

  listFiles(): Promise<FileItem[]> {
    return request('/files')
  },

  getStatus(id: number): Promise<{ id: number; status: string }> {
    return request(`/files/${id}/status`)
  },

  getResult(id: number): Promise<FileDetail> {
    return request(`/files/${id}/result`)
  },

  getContentList(id: number): Promise<ContentBlock[]> {
    return request(`/files/${id}/content_list`)
  },

  getMiddleJson(id: number): Promise<unknown> {
    return request(`/files/${id}/middle_json`)
  },

  getStructuredContent(id: number): Promise<unknown> {
    return request(`/files/${id}/structured_content`)
  },

  getDownloadUrl(id: number): Promise<{ url: string }> {
    return request(`/files/${id}/download_url`)
  },

  deleteFile(id: number): Promise<{ msg: string }> {
    return request(`/files/${id}`, { method: 'DELETE' })
  },

  getSystemStatus(): Promise<{ mineru: boolean; minio: boolean; local_v3: { ok: boolean }; local_v4: { ok: boolean; version: string | null }; local_v41: { ok: boolean; version: string | null } }> {
    return request('/status')
  },

  getV4Models(): Promise<V4ModelStatus> {
    return request('/models/v4')
  },

  downloadV4Models(): Promise<V4ModelStatus> {
    return request('/models/v4/download', { method: 'POST' })
  },
}
