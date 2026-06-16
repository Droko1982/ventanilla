import { prisma } from './db.js'
import { uid } from './util.js'

// Categorías base para una tienda de barrio (coinciden con el catálogo de carga).
const DEFAULT_CATEGORIES: [string, string][] = [
  ['Bebidas', '🥤'], ['Mecato', '🍫'], ['Lácteos', '🥛'], ['Helados', '🍦'],
  ['Aseo', '🧼'], ['Abarrotes', '🛒'], ['Mascotas', '🐾'], ['Varios', '📦'],
]

// Crea el local principal y unas categorías base para que una cuenta nueva
// funcione desde el primer día (el POS necesita al menos un local).
export async function seedTenantDefaults(tenantId: string, city: string) {
  const now = new Date().toISOString()
  const locId = uid('loc')
  await prisma.syncRecord.create({
    data: {
      tenantId, table: 'locations', recordId: locId,
      data: { id: locId, tenantId, name: 'Principal', address: '', city: city || '', allowBulk: false, active: true, createdAt: now },
    },
  })
  for (const [name, emoji] of DEFAULT_CATEGORIES) {
    const cid = uid('cat')
    await prisma.syncRecord.create({
      data: { tenantId, table: 'categories', recordId: cid, data: { id: cid, tenantId, name, color: '#64748b', emoji } },
    })
  }
}
