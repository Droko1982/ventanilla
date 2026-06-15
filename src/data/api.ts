// Cliente del API de Ventanilla. El frontend funciona SIN backend (modo demo,
// todo local). Cuando se configura una URL de API + token, se activa la nube.

const URL_KEY = 'ventanilla-api-url'
const TOKEN_KEY = 'ventanilla-token'

export function getApiUrl(): string {
  const stored = localStorage.getItem(URL_KEY)
  const env = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
  return (stored || env).replace(/\/$/, '')
}
export function setApiUrl(url: string) {
  localStorage.setItem(URL_KEY, url.replace(/\/$/, ''))
}
export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t)
}
export function clearCloud() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(URL_KEY)
  localStorage.removeItem('ventanilla-last-pull')
  localStorage.removeItem('ventanilla-dirty')
}
export function isCloudConfigured(): boolean {
  return !!getApiUrl() && !!getToken()
}

interface ApiOpts {
  method?: string
  body?: unknown
  auth?: boolean
}
export async function api<T = any>(path: string, opts: ApiOpts = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = opts
  const res = await fetch(getApiUrl() + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth && getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as any).error || `Error ${res.status}`)
  return data as T
}

// Conecta este dispositivo a una cuenta del backend (dueño).
export async function cloudLogin(url: string, email: string, password: string) {
  setApiUrl(url)
  const d = await api<{ token: string }>('/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  })
  setToken(d.token)
  return d
}

// Crea una cuenta nueva (negocio) en la nube y conecta este dispositivo.
export async function cloudRegister(
  url: string,
  data: { businessName: string; ownerName: string; email: string; password: string; phone?: string; city?: string },
) {
  setApiUrl(url)
  const d = await api<{ token: string }>('/auth/register', { method: 'POST', body: data, auth: false })
  setToken(d.token)
  return d
}
