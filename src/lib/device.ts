import { db } from '@/data/db'
import { uid } from './id'

// Identidad del dispositivo y control de licencia por dispositivo.
const KEY = 'ventanilla-device-id'

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(KEY)
    if (!id) { id = uid('dev'); localStorage.setItem(KEY, id) }
    return id
  } catch {
    return 'dev-anon'
  }
}

export function getDeviceName(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iPhone/iPad' : /Mac/.test(ua) ? 'Mac' : 'PC'
  const br = /Edg/.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome'
    : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Navegador'
  return `${br} · ${os}`
}

export interface DeviceCheck { allowed: boolean; count: number; max: number }

// Registra/actualiza este dispositivo para el cliente y aplica el cupo de la
// licencia: si ya se alcanzó el máximo, el dispositivo nuevo queda bloqueado.
export async function registerDevice(tenant: { id: string; maxDevices?: number }): Promise<DeviceCheck> {
  const id = getDeviceId()
  const now = new Date().toISOString()
  const max = tenant.maxDevices ?? 999
  const all = await db.devices.where('tenantId').equals(tenant.id).toArray()
  const existing = all.find((d) => d.id === id)
  const activeOthers = all.filter((d) => d.id !== id && !d.blocked).length

  if (existing) {
    existing.lastSeen = now
    if (existing.blocked && activeOthers < max) existing.blocked = false // hay cupo: se libera
    await db.devices.put(existing)
    return { allowed: !existing.blocked, count: all.length, max }
  }
  const blocked = activeOthers >= max
  await db.devices.put({ id, tenantId: tenant.id, name: getDeviceName(), firstSeen: now, lastSeen: now, blocked })
  return { allowed: !blocked, count: all.length + 1, max }
}
