import { Router } from 'express'
import { prisma } from '../db.js'
import { authRequired, superAdminRequired, hash } from '../auth.js'
import { uid } from '../util.js'
import { seedTenantDefaults } from '../tenantDefaults.js'

export const adminRouter = Router()
adminRouter.use(authRequired, superAdminRequired)

// Crear un cliente (negocio) desde la consola del dueño de la plataforma.
// Mismos valores que el auto-registro: 15 días de prueba + usuario dueño.
adminRouter.post('/tenants', async (req, res) => {
  const { businessName, ownerName, email, password, city, phone } = req.body ?? {}
  if (!businessName || !ownerName || !email || !password || String(password).length < 6) {
    return res.status(400).json({ error: 'Faltan datos: negocio, dueño, correo y clave (≥6).' })
  }
  const exists = await prisma.tenant.findUnique({ where: { email: String(email) } })
  if (exists) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' })
  const tenantId = uid('t')
  await prisma.tenant.create({
    data: {
      id: tenantId, businessName: String(businessName), ownerName: String(ownerName),
      email: String(email), passwordHash: hash(String(password)),
      city: city ? String(city) : '', phone: phone ? String(phone) : '',
      status: 'prueba', paidUntil: new Date(Date.now() + 15 * 86400000),
      dian: { enabled: false, provider: 'ninguno', testMode: true },
    },
  })
  await prisma.user.create({
    data: { id: uid('u'), tenantId, name: String(ownerName), role: 'admin', email: String(email), passwordHash: hash(String(password)) },
  })
  await seedTenantDefaults(tenantId, city ? String(city) : '')
  res.json({ ok: true, id: tenantId })
})

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

// Eliminar un cliente por completo (cascade borra sus usuarios, datos y pagos).
// Acción del dueño de la plataforma para depurar o dar de baja a un cliente.
adminRouter.delete('/tenants/:id', async (req, res) => {
  try {
    await prisma.tenant.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch {
    res.status(404).json({ error: 'No existe o no se pudo eliminar' })
  }
})

// Editar los datos de acceso del cliente: nombre del negocio, dueño, correo y
// clave (el dueño no tiene pantalla para cambiar su clave de nube; lo hace el
// dueño de la plataforma desde la consola).
adminRouter.post('/tenants/:id/credentials', async (req, res) => {
  const { email, password, businessName, ownerName } = req.body ?? {}
  const data: { email?: string; businessName?: string; ownerName?: string; passwordHash?: string } = {}
  if (email) data.email = String(email).trim().toLowerCase()
  if (businessName) data.businessName = String(businessName).trim()
  if (ownerName) data.ownerName = String(ownerName).trim()
  if (password) {
    if (String(password).length < 6) return res.status(400).json({ error: 'La clave debe tener al menos 6 caracteres' })
    data.passwordHash = hash(String(password))
  }
  if (!Object.keys(data).length) return res.status(400).json({ error: 'Nada que actualizar' })
  if (data.email) {
    const exists = await prisma.tenant.findFirst({ where: { email: data.email, NOT: { id: req.params.id } } })
    if (exists) return res.status(409).json({ error: 'Ese correo ya está en uso por otro cliente' })
  }
  await prisma.tenant.update({ where: { id: req.params.id }, data })
  // Mantener al usuario dueño en sincronía (mismo correo/clave/nombre).
  if (data.email || data.passwordHash || data.ownerName) {
    const owner = await prisma.user.findFirst({ where: { tenantId: req.params.id, role: 'admin' } })
    if (owner) await prisma.user.update({
      where: { id: owner.id },
      data: { ...(data.email ? { email: data.email } : {}), ...(data.passwordHash ? { passwordHash: data.passwordHash } : {}), ...(data.ownerName ? { name: data.ownerName } : {}) },
    })
  }
  res.json({ ok: true })
})

// Dispositivos conectados de un cliente (para gestionarlos desde la consola).
adminRouter.get('/tenants/:id/devices', async (req, res) => {
  const rows = await prisma.syncRecord.findMany({
    where: { tenantId: req.params.id, table: 'devices', deletedAt: null },
    orderBy: { updatedAt: 'desc' },
  })
  res.json(rows.map((r) => {
    const d = (r.data ?? {}) as any
    return { id: r.recordId, name: d.name ?? 'Dispositivo', blocked: !!d.blocked, lastSeen: d.lastSeen ?? null }
  }))
})

// Liberar un dispositivo: libera el cupo. El equipo activo se vuelve a registrar
// al abrir la app; uno perdido/robado desaparece y deja el cupo libre.
adminRouter.post('/tenants/:id/devices/release', async (req, res) => {
  const recordId = String(req.body?.recordId ?? '')
  if (!recordId) return res.status(400).json({ error: 'Falta recordId' })
  await prisma.syncRecord.updateMany({
    where: { tenantId: req.params.id, table: 'devices', recordId },
    data: { deletedAt: new Date() },
  })
  res.json({ ok: true })
})
