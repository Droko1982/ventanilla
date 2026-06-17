import { Router } from 'express'
import { prisma } from '../db.js'
import { authRequired, hash, type AuthedRequest } from '../auth.js'
import { licenseActive } from '../license.js'

export const syncRouter = Router()

// Tablas de datos que se guardan en el almacén genérico SyncRecord.
// (users y tenants se manejan aparte por la autenticación.)
const SYNC_TABLES = new Set([
  'categories', 'locations', 'products', 'stock', 'sales', 'customers',
  'suppliers', 'purchaseOrders', 'stockMovements', 'cashSessions',
  'auditLogs', 'notifications', 'expenses', 'remisiones', 'cashMovements',
  'changeOwed', 'purchases', 'zReports', 'domicilios', 'devices',
])

interface SyncIn {
  table: string
  recordId: string
  data: Record<string, unknown>
  deleted?: boolean
}

// --- PULL: trae los cambios desde `since` ----------------------------------
// El pull queda ABIERTO a propósito: así un negocio recién suspendido descarga
// su nuevo estado y la app se autobloquea. La escritura (push) sí se bloquea.
syncRouter.get('/', authRequired, async (req: AuthedRequest, res) => {
  const tenantId = req.auth!.tenantId
  if (!tenantId) return res.json({ serverTime: new Date().toISOString(), records: [] })
  const since = req.query.since ? new Date(String(req.query.since)) : new Date(0)

  // Capturamos el cursor ANTES de consultar: si un registro se escribe mientras
  // corre la consulta, su updatedAt será > serverTime y el próximo pull (gt) lo
  // traerá. Generarlo después dejaría esos registros en una ventana ciega (se
  // perderían entre dispositivos). A lo sumo se repite un registro (idempotente).
  const serverTime = new Date().toISOString()

  const rows = await prisma.syncRecord.findMany({
    where: { tenantId, updatedAt: { gt: since } },
    orderBy: { updatedAt: 'asc' },
  })
  const records = rows.map((r) => ({
    table: r.table,
    recordId: r.recordId,
    data: r.data,
    deleted: !!r.deletedAt,
    updatedAt: r.updatedAt.toISOString(),
  }))

  // Perfil del negocio y empleados (desde las tablas estructuradas, sin secretos)
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (tenant && tenant.updatedAt > since) {
    records.push({
      table: 'tenants', recordId: tenant.id, deleted: false,
      updatedAt: tenant.updatedAt.toISOString(),
      data: {
        id: tenant.id, businessName: tenant.businessName, ownerName: tenant.ownerName,
        nit: tenant.nit, email: tenant.email, phone: tenant.phone, city: tenant.city,
        status: tenant.status, monthlyFeePerLocation: tenant.monthlyFeePerLocation,
        paidUntil: tenant.paidUntil.toISOString(), locationCount: tenant.locationCount,
        monthlyGoal: tenant.monthlyGoal, commissionPct: tenant.commissionPct, dian: tenant.dian,
        createdAt: tenant.createdAt.toISOString(),
      },
    })
  }
  const users = await prisma.user.findMany({ where: { tenantId, updatedAt: { gt: since } } })
  for (const u of users) {
    records.push({
      table: 'users', recordId: u.id, deleted: false,
      updatedAt: u.updatedAt.toISOString(),
      data: {
        id: u.id, tenantId: u.tenantId, name: u.name, role: u.role, email: u.email,
        locationId: u.locationId, permissions: u.permissions, active: u.active, pin: '',
      },
    })
  }

  res.json({ serverTime, records })
})

// --- PUSH: aplica los cambios locales del cliente --------------------------
syncRouter.post('/', authRequired, licenseActive, async (req: AuthedRequest, res) => {
  const tenantId = req.auth!.tenantId
  if (!tenantId) return res.status(400).json({ error: 'Sin tenant' })
  const incoming = (req.body?.records ?? []) as SyncIn[]
  if (!Array.isArray(incoming)) return res.status(400).json({ error: 'records debe ser un arreglo' })

  let applied = 0
  for (const rec of incoming) {
    if (!rec?.table || !rec?.recordId) continue

    if (SYNC_TABLES.has(rec.table)) {
      await prisma.syncRecord.upsert({
        where: { tenantId_table_recordId: { tenantId, table: rec.table, recordId: rec.recordId } },
        create: { tenantId, table: rec.table, recordId: rec.recordId, data: rec.data as object, deletedAt: rec.deleted ? new Date() : null },
        update: { data: rec.data as object, deletedAt: rec.deleted ? new Date() : null },
      })
      applied++
    } else if (rec.table === 'users') {
      // Empleado/admin: hashear PIN/clave; nunca confiar en otro tenant
      const d = rec.data as any
      const existing = await prisma.user.findUnique({ where: { id: rec.recordId } })
      if (existing && existing.tenantId !== tenantId) continue
      // Anti-escalada de privilegios: el rol se limita a admin/empleado (nunca
      // superadmin) y solo un admin puede asignar/cambiar el rol. Un empleado
      // no puede ascenderse ni ascender a otros; en sus push se conserva el rol.
      const callerIsAdmin = req.auth!.role === 'admin'
      const wanted = d.role === 'admin' || d.role === 'empleado' ? d.role : 'empleado'
      const role = existing
        ? (callerIsAdmin ? wanted : existing.role)
        : (callerIsAdmin ? wanted : 'empleado')
      const base = {
        tenantId, name: d.name ?? 'Empleado', role,
        email: d.email ?? null, locationId: d.locationId ?? null,
        permissions: d.permissions ?? undefined, active: d.active ?? true,
      }
      await prisma.user.upsert({
        where: { id: rec.recordId },
        create: { id: rec.recordId, ...base, pinHash: d.pin ? hash(String(d.pin)) : null, passwordHash: d.password ? hash(String(d.password)) : null },
        update: { ...base, ...(d.pin ? { pinHash: hash(String(d.pin)) } : {}), ...(d.password ? { passwordHash: hash(String(d.password)) } : {}) },
      })
      applied++
    } else if (rec.table === 'tenants') {
      // Solo el propio negocio puede actualizar SU configuración (no estado/pago)
      if (rec.recordId !== tenantId) continue
      const d = rec.data as any
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          businessName: d.businessName, ownerName: d.ownerName, nit: d.nit,
          city: d.city, phone: d.phone, dian: d.dian ?? undefined,
          monthlyGoal: d.monthlyGoal ?? null, commissionPct: d.commissionPct ?? null,
        },
      })
      applied++
    }
  }

  res.json({ serverTime: new Date().toISOString(), applied })
})
