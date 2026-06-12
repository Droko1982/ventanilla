import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { useSession } from '@/store/session'
import type { Location } from '@/types'

// ============================================================================
// Hooks reactivos: leen IndexedDB y se actualizan solos cuando los datos
// cambian (dexie-react-hooks). Aplican el "scope" (alcance) según el rol.
// ============================================================================

export function useCurrentUser() {
  const userId = useSession((s) => s.userId)
  return useLiveQuery(() => (userId ? db.users.get(userId) : undefined), [userId])
}

export function useTenant() {
  const tenantId = useSession((s) => s.tenantId)
  return useLiveQuery(() => (tenantId ? db.tenants.get(tenantId) : undefined), [tenantId])
}

/** Todos los locales del cliente actual. */
export function useLocations(): Location[] | undefined {
  const tenantId = useSession((s) => s.tenantId)
  return useLiveQuery(
    () => (tenantId ? db.locations.where('tenantId').equals(tenantId).toArray() : []),
    [tenantId],
  )
}

/** Los IDs de local que abarca la vista actual (rol + filtro de local). */
export function useScopeLocationIds(): string[] {
  const role = useSession((s) => s.role)
  const filter = useSession((s) => s.locationFilter)
  const employeeLocationId = useSession((s) => s.employeeLocationId)
  const locations = useLocations()

  if (role === 'empleado') return employeeLocationId ? [employeeLocationId] : []
  if (!locations) return []
  if (filter === 'all') return locations.map((l) => l.id)
  return [filter]
}

/** El local "activo" para operar (vender, caja): empleado=su local; admin=el filtrado o el primero. */
export function useActiveLocationId(): string | null {
  const role = useSession((s) => s.role)
  const filter = useSession((s) => s.locationFilter)
  const employeeLocationId = useSession((s) => s.employeeLocationId)
  const locations = useLocations()
  if (role === 'empleado') return employeeLocationId
  if (filter !== 'all') return filter
  return locations?.[0]?.id ?? null
}

export function useProducts() {
  const tenantId = useSession((s) => s.tenantId)
  return useLiveQuery(
    () => (tenantId ? db.products.where('tenantId').equals(tenantId).toArray() : []),
    [tenantId],
  )
}

export function useCategories() {
  const tenantId = useSession((s) => s.tenantId)
  return useLiveQuery(
    () => (tenantId ? db.categories.where('tenantId').equals(tenantId).toArray() : []),
    [tenantId],
  )
}

export function useSuppliers() {
  const tenantId = useSession((s) => s.tenantId)
  return useLiveQuery(
    () => (tenantId ? db.suppliers.where('tenantId').equals(tenantId).toArray() : []),
    [tenantId],
  )
}

export function useCustomers() {
  const tenantId = useSession((s) => s.tenantId)
  return useLiveQuery(
    () => (tenantId ? db.customers.where('tenantId').equals(tenantId).toArray() : []),
    [tenantId],
  )
}

export function useStockForLocation(locationId: string | null) {
  return useLiveQuery(
    () => (locationId ? db.stock.where('locationId').equals(locationId).toArray() : []),
    [locationId],
  )
}

/** Stock de todos los locales del alcance actual. */
export function useScopeStock() {
  const ids = useScopeLocationIds()
  const key = ids.join(',')
  return useLiveQuery(
    () => (ids.length ? db.stock.where('locationId').anyOf(ids).toArray() : []),
    [key],
  )
}

/** Ventas dentro del alcance actual (todos los locales del scope). */
export function useScopeSales() {
  const ids = useScopeLocationIds()
  const key = ids.join(',')
  return useLiveQuery(async () => {
    if (!ids.length) return []
    const all = await db.sales.where('locationId').anyOf(ids).toArray()
    return all.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  }, [key])
}

export function useUnreadNotifications() {
  const tenantId = useSession((s) => s.tenantId)
  const ids = useScopeLocationIds()
  const key = ids.join(',')
  return useLiveQuery(async () => {
    if (!tenantId) return []
    const all = await db.notifications.where('tenantId').equals(tenantId).toArray()
    // El admin ve todas; el empleado sólo las de su local
    const scoped = all.filter((n) => !n.locationId || ids.includes(n.locationId))
    return scoped.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  }, [tenantId, key])
}
