import type { Response, NextFunction } from 'express'
import { prisma } from './db.js'
import type { AuthedRequest } from './auth.js'

// Días de gracia tras el vencimiento antes de bloquear (igual que en el cliente).
const LICENSE_GRACE_DAYS = 5

// Middleware: además del bloqueo en el cliente (que es solo UX), el servidor
// niega el acceso a los datos a un negocio suspendido o vencido. Así el control
// del dueño de la plataforma (suspender / cobrar) es real y no se puede saltar
// editando el navegador. No aplica al super-admin ni a tokens sin tenant.
export async function licenseActive(req: AuthedRequest, res: Response, next: NextFunction) {
  const tenantId = req.auth?.tenantId
  if (!tenantId) return next()
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true, paidUntil: true },
  })
  if (!tenant) return res.status(404).json({ error: 'Negocio no encontrado' })
  const overdue = Date.now() > new Date(tenant.paidUntil).getTime() + LICENSE_GRACE_DAYS * 86_400_000
  if (tenant.status === 'suspendido' || overdue) {
    return res.status(402).json({
      error: 'Suscripción inactiva o vencida. Comunícate para reactivar.',
      code: 'license_inactive',
    })
  }
  next()
}
