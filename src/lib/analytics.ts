import type { Sale, PaymentMethod } from '@/types'
import { saleDay, localYMD } from './businessDay'

// Cálculos de negocio sobre las ventas: ingresos, utilidad, por método,
// más/menos vendidos, ventas por día. Lo usan el dashboard y los reportes.

export interface SalesSummary {
  count: number
  revenue: number // total vendido (ventas completadas)
  cost: number // costo de la mercancía vendida
  profit: number // utilidad bruta (revenue - cost)
  byMethod: Record<PaymentMethod, number>
  ticketAvg: number
}

const emptyMethods = (): Record<PaymentMethod, number> => ({
  efectivo: 0, nequi: 0, tarjeta: 0, transferencia: 0, fiado: 0,
})

export function summarize(sales: Sale[]): SalesSummary {
  let revenue = 0
  let cost = 0
  let count = 0
  const byMethod = emptyMethods()
  for (const s of sales) {
    if (s.status !== 'completada') continue
    count++
    revenue += s.total
    for (const it of s.items) cost += it.cost * it.qty
    for (const p of s.payments) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount
  }
  return {
    count,
    revenue,
    cost: Math.round(cost),
    profit: Math.round(revenue - cost),
    byMethod,
    ticketAvg: count ? Math.round(revenue / count) : 0,
  }
}

export interface ProductStat {
  productId: string
  name: string
  qty: number
  revenue: number
  profit: number
}

export function productStats(sales: Sale[]): ProductStat[] {
  const map = new Map<string, ProductStat>()
  for (const s of sales) {
    if (s.status !== 'completada') continue
    // Reparte el descuento global de la venta entre los ítems (proporcional al
    // valor de cada línea) para que la utilidad no quede inflada.
    const saleGross = s.items.reduce((a, it) => a + it.unitPrice * it.qty - it.lineDiscount, 0)
    for (const it of s.items) {
      const itemGross = it.unitPrice * it.qty - it.lineDiscount
      const share = saleGross > 0 ? (s.discount ?? 0) * (itemGross / saleGross) : 0
      const cur = map.get(it.productId) ?? { productId: it.productId, name: it.name, qty: 0, revenue: 0, profit: 0 }
      cur.qty += it.qty
      cur.revenue += itemGross - share
      cur.profit += (it.unitPrice - it.cost) * it.qty - it.lineDiscount - share
      map.set(it.productId, cur)
    }
  }
  return [...map.values()]
}

export function topProducts(sales: Sale[], n = 5): ProductStat[] {
  return productStats(sales).sort((a, b) => b.qty - a.qty).slice(0, n)
}

export function bottomProducts(sales: Sale[], n = 5): ProductStat[] {
  return productStats(sales).sort((a, b) => a.qty - b.qty).slice(0, n)
}

export interface DayPoint {
  date: string // YYYY-MM-DD
  label: string // dd/mm
  revenue: number
  count: number
}

export function salesByDay(sales: Sale[], days = 14): DayPoint[] {
  const out: DayPoint[] = []
  const byDay = new Map<string, { revenue: number; count: number }>()
  for (const s of sales) {
    if (s.status !== 'completada') continue
    const key = saleDay(s) // día contable (día de apertura de la caja)
    const cur = byDay.get(key) ?? { revenue: 0, count: 0 }
    cur.revenue += s.total
    cur.count += 1
    byDay.set(key, cur)
  }
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const v = byDay.get(key) ?? { revenue: 0, count: 0 }
    out.push({ date: key, label: `${d.getDate()}/${d.getMonth() + 1}`, revenue: v.revenue, count: v.count })
  }
  return out
}

/** Filtra ventas de los últimos N días por DÍA CONTABLE (consistente con caja/Z). */
export function filterByRange(sales: Sale[], days: number): Sale[] {
  const sinceDay = localYMD(Date.now() - Math.max(0, days - 1) * 86400000)
  return sales.filter((s) => saleDay(s) >= sinceDay)
}

export function todayRange(sales: Sale[]): Sale[] {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return sales.filter((s) => new Date(s.createdAt).getTime() >= d.getTime())
}
