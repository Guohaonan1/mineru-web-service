export function getCloudApiKey(): string {
  return localStorage.getItem('mineru_cloud_api_key') ?? ''
}

export function setCloudApiKey(key: string) {
  localStorage.setItem('mineru_cloud_api_key', key)
}
