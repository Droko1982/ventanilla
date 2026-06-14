import { db } from './db'
import { api, isCloudConfigured, getApiUrl } from './api'

// ============================================================================
// Sincronización offline-first con el backend.
// La app sigue funcionando 100% local (Dexie); cuando hay nube configurada,
// empuja los cambios locales y trae los del servidor. Si no hay nube, NADA de
// esto se activa (el demo queda intacto).
// ============================================================================

const SYNC_TABLES = [
  'categories', 'locations', 'products', 'stock', 'sales', 'customers',
  'suppliers', 'purchaseOrders', 'stockMovements', 'cashSessions',
  'auditLogs', 'notifications', 'expenses', 'remisiones', 'cashMovements',
  'changeOwed', 'purchases', 'users', 'tenants',
]
const LAST_PULL_KEY = 'ventanilla-last-pull'
const DIRTY_KEY = 'ventanilla-dirty'

let cloudEnabled = false
let applying = false // true mientras aplicamos cambios del servidor (no re-encolar)
let timer: ReturnType<typeof setInterval> | null = null
let hooksRegistered = false
let lastSyncedAt: string | null = null

interface DirtyItem { table: string; recordId: string; deleted: boolean }
const dirty = new Map<string, DirtyItem>()

function persistDirty() {
  try { localStorage.setItem(DIRTY_KEY, JSON.stringify([...dirty.values()])) } catch { /* */ }
}
function loadDirty() {
  try {
    const arr = JSON.parse(localStorage.getItem(DIRTY_KEY) || '[]') as DirtyItem[]
    for (const d of arr) dirty.set(`${d.table}:${d.recordId}`, d)
  } catch { /* */ }
}

function enqueue(table: string, recordId: unknown, deleted: boolean) {
  if (!cloudEnabled || applying) return
  if (typeof recordId !== 'string' || !recordId) return
  dirty.set(`${table}:${recordId}`, { table, recordId, deleted })
  persistDirty()
}

// Registra ganchos de Dexie para detectar cambios locales (no escriben en
// transacción: sólo marcan en memoria + localStorage, así no rompen nada).
function registerHooks() {
  if (hooksRegistered) return
  hooksRegistered = true
  for (const name of SYNC_TABLES) {
    const table = (db as any)[name]
    if (!table?.hook) continue
    table.hook('creating', (pk: unknown, obj: any) => enqueue(name, pk ?? obj?.id, false))
    table.hook('updating', (_mods: unknown, pk: unknown) => enqueue(name, pk, false))
    table.hook('deleting', (pk: unknown) => enqueue(name, pk, true))
  }
}

async function push() {
  if (!dirty.size) return
  const records: any[] = []
  for (const d of dirty.values()) {
    if (d.deleted) {
      records.push({ table: d.table, recordId: d.recordId, deleted: true, data: { id: d.recordId } })
    } else {
      const row = await (db as any)[d.table].get(d.recordId)
      if (row) records.push({ table: d.table, recordId: d.recordId, data: row })
      else records.push({ table: d.table, recordId: d.recordId, deleted: true, data: { id: d.recordId } })
    }
  }
  if (!records.length) return
  await api('/sync', { method: 'POST', body: { records } })
  dirty.clear()
  persistDirty()
}

async function pull() {
  const since = localStorage.getItem(LAST_PULL_KEY) || '1970-01-01T00:00:00.000Z'
  const res = await api<{ serverTime: string; records: any[] }>(`/sync?since=${encodeURIComponent(since)}`)
  applying = true
  try {
    for (const r of res.records || []) {
      const table = (db as any)[r.table]
      if (!table) continue
      if (r.deleted) await table.delete(r.recordId)
      else await table.put(r.data)
    }
  } finally {
    applying = false
  }
  localStorage.setItem(LAST_PULL_KEY, res.serverTime || new Date().toISOString())
  lastSyncedAt = res.serverTime || new Date().toISOString()
}

export async function syncNow(): Promise<void> {
  if (!cloudEnabled || !navigator.onLine) return
  await push()
  await pull()
}

export async function startCloud(): Promise<void> {
  if (!isCloudConfigured()) return
  cloudEnabled = true
  loadDirty()
  registerHooks()
  try { await syncNow() } catch (e) { console.warn('Sincronización inicial falló:', e) }
  if (timer) clearInterval(timer)
  timer = setInterval(() => { syncNow().catch(() => {}) }, 30000)
  window.addEventListener('online', () => { syncNow().catch(() => {}) })
}

export function stopCloud() {
  cloudEnabled = false
  if (timer) { clearInterval(timer); timer = null }
}

export function cloudStatus() {
  return {
    enabled: cloudEnabled,
    url: getApiUrl(),
    lastSyncedAt: lastSyncedAt || localStorage.getItem(LAST_PULL_KEY),
    pending: dirty.size,
  }
}
