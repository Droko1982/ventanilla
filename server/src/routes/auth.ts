import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { hash, verify, signToken, authRequired, type AuthedRequest } from '../auth.js'
import { env } from '../env.js'
import { uid } from '../util.js'
import { seedTenantDefaults } from '../tenantDefaults.js'

export const authRouter = Router()

// Registro de un nuevo cliente (dueño de tienda) + su usuario admin.
authRouter.post('/register', async (req, res) => {
  const schema = z.object({
    businessName: z.string().min(2),
    ownerName: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    city: z.string().optional(),
    phone: z.string().optional(),
    nit: z.string().optional(),
  })
  const p = schema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: 'Datos inválidos', detail: p.error.flatten() })

  const exists = await prisma.tenant.findUnique({ where: { email: p.data.email } })
  if (exists) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' })

  const tenantId = uid('t')
  const tenant = await prisma.tenant.create({
    data: {
      id: tenantId,
      businessName: p.data.businessName,
      ownerName: p.data.ownerName,
      email: p.data.email,
      passwordHash: hash(p.data.password),
      nit: p.data.nit ?? '',
      city: p.data.city ?? '',
      phone: p.data.phone ?? '',
      status: 'prueba',
      paidUntil: new Date(Date.now() + 15 * 86400000), // 15 días de prueba
      dian: { enabled: false, provider: 'ninguno', testMode: true },
    },
  })
  const userId = uid('u')
  await prisma.user.create({
    data: {
      id: userId,
      tenantId,
      name: p.data.ownerName,
      role: 'admin',
      email: p.data.email,
      passwordHash: hash(p.data.password),
    },
  })
  await seedTenantDefaults(tenantId, p.data.city ?? '')
  const token = signToken({ userId, tenantId, role: 'admin', name: p.data.ownerName })
  res.json({ token, tenant: publicTenant(tenant), user: { id: userId, name: p.data.ownerName, role: 'admin' } })
})

// Login del dueño (o super-admin de la plataforma).
authRouter.post('/login', async (req, res) => {
  const schema = z.object({ email: z.string().email(), password: z.string() })
  const p = schema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: 'Datos inválidos' })

  // Super-Admin de la plataforma (configurado por variables de entorno)
  if (p.data.email === env.superAdmin.email && p.data.password === env.superAdmin.password) {
    const token = signToken({ userId: 'superadmin', tenantId: null, role: 'superadmin', name: 'Super-Admin' })
    return res.json({ token, user: { id: 'superadmin', name: 'Super-Admin', role: 'superadmin' } })
  }

  const tenant = await prisma.tenant.findUnique({ where: { email: p.data.email } })
  if (!tenant || !verify(p.data.password, tenant.passwordHash)) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos' })
  }
  const admin = await prisma.user.findFirst({ where: { tenantId: tenant.id, role: 'admin' } })
  const token = signToken({ userId: admin?.id ?? tenant.id, tenantId: tenant.id, role: 'admin', name: tenant.ownerName })
  res.json({ token, tenant: publicTenant(tenant), user: { id: admin?.id, name: tenant.ownerName, role: 'admin' } })
})

// Login de empleado por PIN (necesita el correo del negocio para ubicar el tenant).
authRouter.post('/pin', async (req, res) => {
  const schema = z.object({ email: z.string().email(), pin: z.string().min(4) })
  const p = schema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: 'Datos inválidos' })

  const tenant = await prisma.tenant.findUnique({ where: { email: p.data.email } })
  if (!tenant) return res.status(404).json({ error: 'Negocio no encontrado' })

  const employees = await prisma.user.findMany({ where: { tenantId: tenant.id, role: 'empleado', active: true } })
  const match = employees.find((e) => verify(p.data.pin, e.pinHash))
  if (!match) return res.status(401).json({ error: 'PIN incorrecto' })

  const token = signToken({ userId: match.id, tenantId: tenant.id, role: 'empleado', name: match.name })
  res.json({ token, tenant: publicTenant(tenant), user: { id: match.id, name: match.name, role: 'empleado', locationId: match.locationId } })
})

// Datos del usuario autenticado.
authRouter.get('/me', authRequired, async (req: AuthedRequest, res) => {
  const tenant = req.auth?.tenantId
    ? await prisma.tenant.findUnique({ where: { id: req.auth.tenantId } })
    : null
  res.json({ auth: req.auth, tenant: tenant ? publicTenant(tenant) : null })
})

function publicTenant(t: { id: string; businessName: string; ownerName: string; email: string; status: string; paidUntil: Date; monthlyFeePerLocation: number; nit: string; city: string }) {
  return {
    id: t.id, businessName: t.businessName, ownerName: t.ownerName, email: t.email,
    status: t.status, paidUntil: t.paidUntil, monthlyFeePerLocation: t.monthlyFeePerLocation,
    nit: t.nit, city: t.city,
  }
}
