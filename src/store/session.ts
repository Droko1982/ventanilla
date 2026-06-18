import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { db } from '@/data/db'
import type { Role, User } from '@/types'

// ============================================================================
// Sesión actual: quién está usando la app y con qué alcance.
//  - superadmin: ve toda la plataforma (no tiene tenant)
//  - admin: dueño; ve todos sus locales (locationFilter = 'all') o filtra uno
//  - empleado: sólo su local asignado
// Se persiste en localStorage para sobrevivir recargas / cierre de pestaña.
// ============================================================================

interface SessionState {
  userId: string | null
  role: Role | null
  tenantId: string | null
  employeeLocationId: string | null // sólo empleados
  locationFilter: string // 'all' o id de local (lo usa el admin)
  ready: boolean

  loginAs: (userId: string) => Promise<boolean>
  loginEmployeeByPin: (pin: string) => Promise<User | null>
  loginAdminByPin: (pin: string) => Promise<User | null>
  loginSuperAdmin: () => void
  setLocationFilter: (id: string) => void
  logout: () => void
}

// La tienda de ESTE dispositivo. En producción hay un solo tenant (la cuenta en
// la nube) y en el demo uno solo sembrado. Si por alguna razón coexistieran
// varios en el mismo IndexedDB, no se filtra (se conserva el comportamiento
// previo) para no bloquear el acceso por error.
async function deviceTenantId(): Promise<string | null> {
  const tenants = await db.tenants.toArray()
  return tenants.length === 1 ? tenants[0].id : null
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      userId: null,
      role: null,
      tenantId: null,
      employeeLocationId: null,
      locationFilter: 'all',
      ready: true,

      async loginAs(userId) {
        const user = await db.users.get(userId)
        if (!user || !user.active) return false
        set({
          userId: user.id,
          role: user.role,
          tenantId: user.tenantId,
          employeeLocationId: user.locationId ?? null,
          locationFilter: user.role === 'empleado' ? user.locationId ?? 'all' : 'all',
        })
        return true
      },

      async loginEmployeeByPin(pin) {
        const dt = await deviceTenantId()
        const user = await db.users
          .where('pin')
          .equals(pin)
          .and((u) => u.role === 'empleado' && u.active && (!dt || u.tenantId === dt))
          .first()
        if (!user) return null
        set({
          userId: user.id,
          role: 'empleado',
          tenantId: user.tenantId,
          employeeLocationId: user.locationId ?? null,
          locationFilter: user.locationId ?? 'all',
        })
        return user
      },

      // Dueño/Admin por PIN (entrada del dueño en el equipo).
      async loginAdminByPin(pin) {
        const dt = await deviceTenantId()
        const user = await db.users
          .where('pin')
          .equals(pin)
          .and((u) => u.role === 'admin' && u.active && (!dt || u.tenantId === dt))
          .first()
        if (!user) return null
        set({
          userId: user.id,
          role: 'admin',
          tenantId: user.tenantId,
          employeeLocationId: null,
          locationFilter: 'all',
        })
        return user
      },

      // Super-Admin de la plataforma: NO es un usuario local; solo se activa tras
      // validar el correo y la clave contra el backend (superAdminLogin).
      loginSuperAdmin() {
        set({ userId: 'superadmin', role: 'superadmin', tenantId: null, employeeLocationId: null, locationFilter: 'all' })
      },

      setLocationFilter(id) {
        set({ locationFilter: id })
      },

      logout() {
        set({
          userId: null,
          role: null,
          tenantId: null,
          employeeLocationId: null,
          locationFilter: 'all',
        })
      },
    }),
    { name: 'ventanilla-session' },
  ),
)
