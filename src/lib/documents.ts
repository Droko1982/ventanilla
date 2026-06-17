import type { SaleItem } from '@/types'

// IVA discriminado para factura electrónica / remisión.
// En la tienda los precios se manejan CON IVA incluido (precio al público),
// así que la base gravable se obtiene "des-incluyendo" el impuesto.

export interface IvaLine {
  rate: number
  base: number
  iva: number
}

export interface DocTotals {
  lines: IvaLine[] // desglose por tarifa de IVA
  base: number // base gravable total
  iva: number // IVA total
  total: number // total con IVA
}

export function ivaBreakdown(items: SaleItem[], globalDiscount = 0): DocTotals {
  const byRate = new Map<number, { base: number; iva: number; gross: number }>()
  let grossTotal = 0
  for (const it of items) {
    const gross = it.unitPrice * it.qty - it.lineDiscount
    grossTotal += gross
  }
  // Reparte el descuento global proporcionalmente
  for (const it of items) {
    const gross = it.unitPrice * it.qty - it.lineDiscount
    const share = grossTotal > 0 ? (gross / grossTotal) * globalDiscount : 0
    const net = gross - share
    const base = net / (1 + it.ivaRate / 100)
    const iva = net - base
    const cur = byRate.get(it.ivaRate) ?? { base: 0, iva: 0, gross: 0 }
    cur.base += base
    cur.iva += iva
    cur.gross += net
    byRate.set(it.ivaRate, cur)
  }
  const lines: IvaLine[] = [...byRate.entries()]
    .map(([rate, v]) => ({ rate, base: Math.round(v.base), iva: Math.round(v.iva) }))
    .sort((a, b) => a.rate - b.rate)
  const base = lines.reduce((s, l) => s + l.base, 0)
  let iva = lines.reduce((s, l) => s + l.iva, 0)
  const total = Math.max(0, Math.round(grossTotal - globalDiscount))
  // Cuadre de centavo: base + IVA debe ser EXACTAMENTE el total (la DIAN lo exige).
  // El descuadre por redondeo se absorbe en el IVA de la última tarifa.
  const diff = total - (base + iva)
  if (diff !== 0 && lines.length > 0) {
    lines[lines.length - 1].iva += diff
    iva += diff
  }
  return { lines, base, iva, total }
}
