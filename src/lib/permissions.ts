import type { User, UserPermissions } from '@/types'

// Verifica un permiso fino. Admin y super-admin pueden todo. Para empleados,
// un permiso no definido se considera permitido (retrocompatibilidad).
export function can(user: User | undefined, perm: keyof UserPermissions): boolean {
  if (!user) return false
  if (user.role !== 'empleado') return true
  return user.permissions?.[perm] !== false
}
