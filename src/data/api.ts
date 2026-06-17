// Cliente del API de Ventanilla. El frontend funciona SIN backend (modo demo,
// todo local). Cuando se configura una URL de API + token, se activa la nube.

const URL_KEY = 'ventanilla-api-url'
const TOKEN_KEY = 'ventanilla-token'
const ROLE_KEY = 'ventanilla-role'

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
export function getRole(): string {
  return localStorage.getItem(ROLE_KEY) || ''
}
export function setRole(r: string) {
  localStorage.setItem(ROLE_KEY, r)
}
export function clearCloud() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(URL_KEY)
  localStorage.removeItem(ROLE_KEY)
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
  if (!res.ok) {
    // Token vencido o inválido: limpia la sesión de nube y avisa una sola vez,
    // para no quedar reintentando contra el servidor en bucle.
    if (res.status === 401 && getToken()) {
      localStorage.removeItem(TOKEN_KEY)
      window.dispatchEvent(new CustomEvent('ventanilla:auth-expired'))
    }
    throw new Error((data as any).error || `Error ${res.status}`)
  }
  return data as T
}

// Conecta este dispositivo a una cuenta del backend (dueño).
export async function cloudLogin(url: string, email: string, password: string) {
  setApiUrl(url)
  const d = await api<{ token: string; user?: { id: string; name: string; role: string } }>('/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  })
  setToken(d.token)
  setRole(d.user?.role ?? 'admin')
  return d
}

// --- Consola Super-Admin en la nube ----------------------------------------
export interface CloudTenant {
  id: string; businessName: string; ownerName: string; email: string; city: string
  status: string; paidUntil: string; monthlyFeePerLocation: number; locationCount: number
  maxSeats?: number; maxDevices?: number; deviceCount?: number
}

// Inicia sesión como Super-Admin de la plataforma (valida el rol).
export async function superAdminLogin(url: string, email: string, password: string): Promise<boolean> {
  setApiUrl(url)
  const d = await api<{ token: string; user?: { role?: string } }>('/auth/login', { method: 'POST', body: { email, password }, auth: false })
  if (d.user?.role !== 'superadmin') { throw new Error('Esas credenciales no son de Super-Admin') }
  setToken(d.token)
  setRole('superadmin')
  return true
}

export async function adminListTenants(): Promise<CloudTenant[]> {
  return api<CloudTenant[]>('/admin/tenants')
}
export async function adminSetStatus(id: string, status: string): Promise<void> {
  await api(`/admin/tenants/${id}/status`, { method: 'POST', body: { status } })
}
export async function adminPay(id: string): Promise<void> {
  await api(`/admin/tenants/${id}/pay`, { method: 'POST' })
}
export async function adminDeleteTenant(id: string): Promise<void> {
  await api(`/admin/tenants/${id}`, { method: 'DELETE' })
}
export async function adminCreateTenant(data: {
  businessName: string; ownerName: string; email: string; password: string; city?: string; phone?: string
}): Promise<{ ok: boolean; id: string }> {
  return api(`/admin/tenants`, { method: 'POST', body: data })
}
export async function adminUpdateCredentials(id: string, data: {
  businessName?: string; ownerName?: string; email?: string; password?: string
}): Promise<void> {
  await api(`/admin/tenants/${id}/credentials`, { method: 'POST', body: data })
}
export async function adminSetLicense(id: string, data: { maxSeats?: number; maxDevices?: number }): Promise<void> {
  await api(`/admin/tenants/${id}/license`, { method: 'POST', body: data })
}
export interface CloudDevice { id: string; name: string; blocked: boolean; lastSeen: string | null }
export async function adminListDevices(id: string): Promise<CloudDevice[]> {
  return api<CloudDevice[]>(`/admin/tenants/${id}/devices`)
}
export async function adminReleaseDevice(id: string, recordId: string): Promise<void> {
  await api(`/admin/tenants/${id}/devices/release`, { method: 'POST', body: { recordId } })
}

// --- Banco de productos compartido (catálogo global entre tiendas) ----------
export interface BankProduct {
  barcode: string; name: string; brand?: string | null; category?: string | null
  unit?: string; imageEmoji?: string | null
}
// Consulta exacta por código (autocompletar al escanear). Null si no hay nube/red.
export async function bankLookup(barcode: string): Promise<BankProduct | null> {
  if (!isCloudConfigured() || !navigator.onLine) return null
  try { return await api<BankProduct | null>(`/bank/${encodeURIComponent(barcode)}`) } catch { return null }
}
export async function bankSearch(q: string): Promise<BankProduct[]> {
  if (!isCloudConfigured() || !navigator.onLine) return []
  try { return await api<BankProduct[]>(`/bank?q=${encodeURIComponent(q)}`) } catch { return [] }
}
// Aporta una ficha al banco (no bloquea ni lanza si falla).
export async function bankContribute(p: BankProduct): Promise<void> {
  if (!isCloudConfigured() || !navigator.onLine) return
  try { await api('/bank', { method: 'POST', body: p }) } catch { /* silencioso */ }
}

// Crea una cuenta nueva (negocio) en la nube y conecta este dispositivo.
export async function cloudRegister(
  url: string,
  data: { businessName: string; ownerName: string; email: string; password: string; phone?: string; city?: string },
) {
  setApiUrl(url)
  const d = await api<{ token: string; user?: { id: string; name: string; role: string } }>('/auth/register', { method: 'POST', body: data, auth: false })
  setToken(d.token)
  setRole('admin')
  return d
}
