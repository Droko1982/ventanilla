import type { User, UserPermissions } from '@/types'

// Permisos SENSIBLES (anti-fraude): si no están definidos, se DENIEGAN por
// defecto. Así un empleado sin permisos explícitos (seed/migración) no puede
// anular ventas. Para abrirlos, el dueño los activa en Ajustes → Empleados.
const DENY_BY_DEFAULT: ReadonlySet<keyof UserPermissions> = new Set(['canVoid'])

// Verifica un permiso fino. Admin y super-admin pueden todo. Para empleados,
// un permiso normal no definido se considera permitido; uno sensible, denegado.
export function can(user: User | undefined, perm: keyof UserPermissions): boolean {
  if (!user) return false
  if (user.role !== 'empleado') return true
  const v = user.permissions?.[perm]
  if (v === undefined) return !DENY_BY_DEFAULT.has(perm)
  return v !== false
}
