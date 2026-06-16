import { Router } from 'express'
import { prisma } from '../db.js'
import { authRequired } from '../auth.js'

// Banco de productos compartido: cualquier tienda autenticada puede consultar y
// aportar fichas de catálogo (sin precios). Acelera el alta de productos.
export const bankRouter = Router()
bankRouter.use(authRequired)

// Buscar por código o por nombre.
bankRouter.get('/', async (req, res) => {
  const q = String(req.query.q ?? '').trim()
  if (q.length < 2) return res.json([])
  const items = await prisma.bankProduct.findMany({
    where: { OR: [{ barcode: { contains: q } }, { name: { contains: q, mode: 'insensitive' } }] },
    orderBy: { uses: 'desc' },
    take: 12,
  })
  res.json(items)
})

// Consulta exacta por código de barras (para autocompletar al escanear).
bankRouter.get('/:barcode', async (req, res) => {
  const item = await prisma.bankProduct.findUnique({ where: { barcode: req.params.barcode } })
  res.json(item ?? null)
})

// Aportar/actualizar una ficha (upsert por código). Suma un uso.
bankRouter.post('/', async (req, res) => {
  const { barcode, name, brand, category, unit, imageEmoji } = req.body ?? {}
  if (!barcode || !name) return res.status(400).json({ error: 'Faltan barcode y name' })
  const data = {
    name: String(name),
    brand: brand ? String(brand) : null,
    category: category ? String(category) : null,
    unit: unit ? String(unit) : 'unidad',
    imageEmoji: imageEmoji ? String(imageEmoji) : null,
  }
  const item = await prisma.bankProduct.upsert({
    where: { barcode: String(barcode) },
    create: { barcode: String(barcode), ...data },
    update: { ...data, uses: { increment: 1 } },
  })
  res.json(item)
})
