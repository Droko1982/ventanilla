import { Router } from 'express'
import { prisma } from '../db.js'
import { authRequired, superAdminRequired } from '../auth.js'

export const adminRouter = Router()
adminRouter.use(authRequired, superAdminRequired)

// Lista todos los clientes del SaaS (consola Super-Admin).
adminRouter.get('/tenants', async (_req, res) => {
  const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: 'desc' } })
  res.json(
    tenants.map((t) => ({
      id: t.id, businessName: t.businessName, ownerName: t.ownerName, email: t.email,
      city: t.city, status: t.status, paidUntil: t.paidUntil,
      monthlyFeePerLocation: t.monthlyFeePerLocation, locationCount: t.locationCount,
    })),
  )
})

// Activar / suspender un cliente.
adminRouter.post('/tenants/:id/status', async (req, res) => {
  const status = String(req.body?.status ?? '')
  if (!['activo', 'suspendido', 'prueba'].includes(status)) return res.status(400).json({ error: 'Estado inválido' })
  await prisma.tenant.update({ where: { id: req.params.id }, data: { status } })
  res.json({ ok: true })
})

// Registrar pago: +30 días y activar.
adminRouter.post('/tenants/:id/pay', async (req, res) => {
  const t = await prisma.tenant.findUnique({ where: { id: req.params.id } })
  if (!t) return res.status(404).json({ error: 'No existe' })
  const base = Math.max(Date.now(), new Date(t.paidUntil).getTime())
  await prisma.tenant.update({ where: { id: req.params.id }, data: { status: 'activo', paidUntil: new Date(base + 30 * 86400000) } })
  res.json({ ok: true })
})
