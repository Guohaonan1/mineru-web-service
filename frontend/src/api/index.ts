import type { ContentBlock, FileDetail, FileItem } from '../types'

const BASE = '/api'

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

  getDownloadUrl(id: number): Promise<{ url: string }> {
    return request(`/files/${id}/download_url`)
  },

  deleteFile(id: number): Promise<{ msg: string }> {
    return request(`/files/${id}`, { method: 'DELETE' })
  },
}
