import { Router } from 'express'
import { prisma } from '../db.js'
import { authRequired, superAdminRequired } from '../auth.js'

export const adminRouter = Router()
adminRouter.use(authRequired, superAdminRequired)

// Lista todos los clientes del SaaS (consola Super-Admin), con nº de dispositivos.
adminRouter.get('/tenants', async (_req, res) => {
  const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: 'desc' } })
  const deviceCounts = await prisma.syncRecord.groupBy({
    by: ['tenantId'], where: { table: 'devices', deletedAt: null }, _count: { _all: true },
  })
  const devByTenant = new Map(deviceCounts.map((d) => [d.tenantId, d._count._all]))
  res.json(
    tenants.map((t) => ({
      id: t.id, businessName: t.businessName, ownerName: t.ownerName, email: t.email,
      city: t.city, status: t.status, paidUntil: t.paidUntil,
      monthlyFeePerLocation: t.monthlyFeePerLocation, locationCount: t.locationCount,
      maxSeats: t.maxSeats, maxDevices: t.maxDevices,
      deviceCount: devByTenant.get(t.id) ?? 0,
    })),
  )
})

// Ajustar la licencia: puntos (ventanillas) y dispositivos permitidos.
adminRouter.post('/tenants/:id/license', async (req, res) => {
  const { maxSeats, maxDevices } = req.body ?? {}
  const data: { maxSeats?: number; maxDevices?: number } = {}
  if (Number.isFinite(maxSeats)) data.maxSeats = Math.max(1, Math.floor(maxSeats))
  if (Number.isFinite(maxDevices)) data.maxDevices = Math.max(1, Math.floor(maxDevices))
  if (!Object.keys(data).length) return res.status(400).json({ error: 'Nada que actualizar' })
  await prisma.tenant.update({ where: { id: req.params.id }, data })
  res.json({ ok: true, ...data })
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
