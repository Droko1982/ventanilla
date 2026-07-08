import type { Sale } from '@/types'
import { saleDay, localYMD } from './businessDay'

// Períodos históricos para el dashboard: día, semana, mes y año, con
// navegación a períodos anteriores (offset 0 = actual, 1 = anterior, …).

export type Granularity = 'dia' | 'semana' | 'mes' | 'anio'

export interface Period {
  granularity: Granularity
  start: number // ms inclusive
  end: number // ms exclusivo
  label: string
}

export interface Bucket {
  label: string
  revenue: number
  count: number
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function makePeriod(granularity: Granularity, offset: number): Period {
  const now = new Date()
  if (granularity === 'dia') {
    const base = startOfDay(new Date(now.getTime() - offset * 86400000))
    const end = new Date(base.getTime() + 86400000)
    const hoy = offset === 0 ? 'Hoy · ' : offset === 1 ? 'Ayer · ' : ''
    return { granularity, start: base.getTime(), end: end.getTime(), label: `${hoy}${base.getDate()} ${MESES[base.getMonth()]}` }
  }
  if (granularity === 'semana') {
    const ref = new Date(now.getTime() - offset * 7 * 86400000)
    const dow = (ref.getDay() + 6) % 7 // 0 = lunes
    const monday = startOfDay(new Date(ref.getTime() - dow * 86400000))
    const sunday = new Date(monday.getTime() + 6 * 86400000)
    const end = new Date(monday.getTime() + 7 * 86400000)
    const label = `${monday.getDate()} ${MESES[monday.getMonth()]} – ${sunday.getDate()} ${MESES[sunday.getMonth()]}`
    return { granularity, start: monday.getTime(), end: end.getTime(), label: offset === 0 ? `Esta semana · ${label}` : label }
  }
  if (granularity === 'mes') {
    const start = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1)
    return { granularity, start: start.getTime(), end: end.getTime(), label: `${MESES_LARGO[start.getMonth()]} ${start.getFullYear()}` }
  }
  // anio
  const year = now.getFullYear() - offset
  const start = new Date(year, 0, 1)
  const end = new Date(year + 1, 0, 1)
  return { granularity, start: start.getTime(), end: end.getTime(), label: `${year}` }
}

/** Ventas dentro del período, por DÍA CONTABLE (consistente con caja/Z). */
export function salesInPeriod(sales: Sale[], p: Period): Sale[] {
  const startDay = localYMD(p.start)
  const endDay = localYMD(p.end - 1)
  return sales.filter((s) => {
    const d = saleDay(s)
    return d >= startDay && d <= endDay && s.status !== 'anulada'
  })
}

// Día calendario del día CONTABLE de la venta (consistente con caja/Z/reportes),
// no la hora cruda de creación. Así las barras cuadran con el total del período.
function saleDate(s: Sale): Date {
  const [y, m, d] = saleDay(s).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/** Serie temporal con los "baldes" adecuados según la granularidad. */
export function periodSeries(sales: Sale[], p: Period): Bucket[] {
  const inP = salesInPeriod(sales, p)
  if (p.granularity === 'dia') {
    const buckets: Bucket[] = Array.from({ length: 24 }, (_, h) => ({ label: `${h}`, revenue: 0, count: 0 }))
    for (const s of inP) {
      const h = new Date(s.createdAt).getHours()
      buckets[h].revenue += s.total
      buckets[h].count++
    }
    // Muestra el horario comercial (6–22 h) pero NUNCA oculta una hora con ventas,
    // para que la suma de las barras sea igual al total del día.
    return buckets.filter((b, h) => (h >= 6 && h <= 22) || b.count > 0)
  }
  if (p.granularity === 'semana') {
    const buckets: Bucket[] = DIAS.map((d) => ({ label: d, revenue: 0, count: 0 }))
    for (const s of inP) {
      const idx = (saleDate(s).getDay() + 6) % 7
      buckets[idx].revenue += s.total
      buckets[idx].count++
    }
    return buckets
  }
  if (p.granularity === 'mes') {
    const days = new Date(p.end).getDate() === 1 ? new Date(new Date(p.end).getTime() - 86400000).getDate() : 31
    const buckets: Bucket[] = Array.from({ length: days }, (_, i) => ({ label: `${i + 1}`, revenue: 0, count: 0 }))
    for (const s of inP) {
      const day = saleDate(s).getDate()
      if (buckets[day - 1]) {
        buckets[day - 1].revenue += s.total
        buckets[day - 1].count++
      }
    }
    return buckets
  }
  // anio → por mes
  const buckets: Bucket[] = MESES.map((m) => ({ label: m, revenue: 0, count: 0 }))
  for (const s of inP) {
    const mo = saleDate(s).getMonth()
    buckets[mo].revenue += s.total
    buckets[mo].count++
  }
  return buckets
}
