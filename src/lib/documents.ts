import type { SaleItem, Tenant, DianConfig } from '@/types'

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

// ---- Desglose de impuestos RICO (factura/tiquete/documento equivalente) -----
// Amplía ivaBreakdown para soportar, además del IVA:
//  - "No responsable de IVA": no discrimina ningún impuesto (base = total).
//  - INC (Impuesto Nacional al Consumo, restaurantes/bares): impuesto aparte.
//  - Categoría DIAN: gravado / exento / excluido (para la tarifa 0%).
// El cuadre base + IVA + INC == total se mantiene EXACTO, absorbiendo el redondeo
// en la línea gravada de mayor base (nunca en una exenta/excluida).

export type TaxKind = 'iva' | 'inc'
export type TaxCategory = 'gravado' | 'exento' | 'excluido'

export interface TaxLine {
  kind: TaxKind
  rate: number
  base: number
  tax: number
  category: TaxCategory
}

export interface TaxTotals {
  lines: TaxLine[]
  base: number // base gravable total (todas las líneas)
  iva: number // IVA total
  inc: number // INC total
  total: number // total con impuestos
  vatDiscriminated: boolean // false si el emisor no es responsable de IVA
}

export interface TaxOptions {
  vatResponsible?: boolean // default true
  incRate?: number // tarifa INC (default 8)
}

// Deriva las opciones de impuesto de la configuración del negocio.
export function taxOptsFromTenant(t?: Pick<Tenant, 'vatResponsible' | 'dian'> | null): TaxOptions {
  return { vatResponsible: t?.vatResponsible !== false, incRate: t?.dian?.incRate ?? 8 }
}

export function docTotals(items: SaleItem[], globalDiscount = 0, opts: TaxOptions = {}): TaxTotals {
  const vatResponsible = opts.vatResponsible !== false // default true
  const incRate = opts.incRate ?? 8

  let grossTotal = 0
  for (const it of items) grossTotal += it.unitPrice * it.qty - it.lineDiscount
  const total = Math.max(0, Math.round(grossTotal - globalDiscount))

  // No responsable de IVA: el documento NO discrimina impuestos; base = total.
  if (!vatResponsible) {
    return { lines: [], base: total, iva: 0, inc: 0, total, vatDiscriminated: false }
  }

  const groups = new Map<string, TaxLine>()
  for (const it of items) {
    const gross = it.unitPrice * it.qty - it.lineDiscount
    const share = grossTotal > 0 ? (gross / grossTotal) * globalDiscount : 0
    const net = gross - share
    const kind: TaxKind = it.taxKind === 'inc' ? 'inc' : 'iva'
    const rate = kind === 'inc' ? (it.ivaRate || incRate) : it.ivaRate
    // La categoría (exento/excluido) solo aplica al IVA; el INC es siempre gravado.
    const category: TaxCategory =
      kind === 'inc' ? 'gravado' : it.taxCategory ?? (it.ivaRate > 0 ? 'gravado' : 'excluido')
    const base = net / (1 + rate / 100)
    const tax = net - base
    const k = `${kind}|${rate}|${category}`
    const cur = groups.get(k) ?? { kind, rate, base: 0, tax: 0, category }
    cur.base += base
    cur.tax += tax
    groups.set(k, cur)
  }

  const lines: TaxLine[] = [...groups.values()]
    .map((g) => ({ ...g, base: Math.round(g.base), tax: Math.round(g.tax) }))
    .sort((a, b) => (a.kind === b.kind ? a.rate - b.rate : a.kind === 'iva' ? -1 : 1))

  let base = lines.reduce((s, l) => s + l.base, 0)
  let iva = lines.filter((l) => l.kind === 'iva').reduce((s, l) => s + l.tax, 0)
  let inc = lines.filter((l) => l.kind === 'inc').reduce((s, l) => s + l.tax, 0)

  // Cuadre de centavo POR impuesto: base + IVA + INC debe ser EXACTAMENTE el total.
  // El descuadre por redondeo se absorbe en la línea GRAVADA de mayor base (nunca
  // en una exenta/excluida, que no lleva impuesto). Si todo es exento/excluido, se
  // ajusta la base de la línea de mayor base.
  const diff = total - (base + iva + inc)
  if (diff !== 0) {
    const taxable = lines.filter((l) => l.rate > 0)
    if (taxable.length) {
      let top = taxable[0]
      for (const l of taxable) if (l.base > top.base) top = l
      top.tax += diff
      if (top.kind === 'iva') iva += diff
      else inc += diff
    } else if (lines.length) {
      let top = lines[0]
      for (const l of lines) if (l.base > top.base) top = l
      top.base += diff
      base += diff
    }
  }

  return { lines, base, iva, inc, total, vatDiscriminated: true }
}

// Pie legal con la autorización de numeración (obligatorio en la representación
// gráfica). Devuelve null si no hay número de resolución configurado — nunca se
// imprime un pie vacío que aparente oficialidad sin respaldo.
export function pieResolucion(dian: DianConfig | undefined, doc: 'fe' | 'pos'): string | null {
  if (!dian) return null
  const r = doc === 'fe' ? dian.fe : dian.pos
  const resNumber = r?.resNumber || dian.resolutionNumber
  if (!resNumber) return null
  const parts = [`Resolución DIAN No. ${resNumber}`]
  if (r?.resolutionDate) parts.push(`del ${r.resolutionDate}`)
  if (r?.prefix && r?.from != null && r?.to != null) parts.push(`${r.prefix} del ${r.from} al ${r.to}`)
  else if (dian.resolutionRange) parts.push(dian.resolutionRange)
  if (r?.validityMonths) parts.push(`vigencia ${r.validityMonths} meses`)
  return parts.join(' · ')
}

// Leyenda HONESTA sobre el estado del documento. El sistema NO transmite a la
// DIAN: nunca afirmamos "validado por la DIAN". En modo de pruebas lo decimos
// explícitamente para no engañar al comprador.
export function dianLegend(dian: DianConfig | undefined): string {
  if (!dian || !dian.enabled) return 'Documento de venta'
  if (dian.testMode) return 'MODO DE PRUEBAS — documento no validado por la DIAN'
  return 'Representación impresa de documento electrónico'
}

// Forma de pago del documento: Crédito si hay fiado, si no Contado.
export function formaPago(payments: { method: string }[]): 'Contado' | 'Crédito' {
  return payments.some((p) => p.method === 'fiado') ? 'Crédito' : 'Contado'
}

// Escapa texto para interpolar con seguridad en el HTML de impresión (evita que un
// campo del negocio — nombre, responsabilidades, resolución — inyecte marcado).
export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c
  ))
}

// Nombre correcto del tipo de documento (terminología DIAN vigente).
export function docTypeLabel(t?: string): string {
  if (t === 'factura') return 'Factura electrónica de venta'
  if (t === 'nota_credito') return 'Nota crédito'
  return 'Documento equivalente POS'
}

// Filas de resumen de impuestos para la representación gráfica (base, IVA/INC por
// tarifa, y subtotales exento/excluido). Presentación agnóstica: el formateo de
// moneda lo hace cada impresora. Vacío si el emisor no discrimina IVA.
export interface TaxSummaryRow {
  label: string
  amount: number
  kind: 'base' | 'tax' | 'exempt'
}
export function taxSummary(t: TaxTotals): TaxSummaryRow[] {
  if (!t.vatDiscriminated) return []
  const rows: TaxSummaryRow[] = []
  const gravableBase = t.lines.filter((l) => l.category === 'gravado').reduce((s, l) => s + l.base, 0)
  if (gravableBase > 0) rows.push({ label: 'Base gravable', amount: gravableBase, kind: 'base' })
  for (const l of t.lines) {
    if (l.tax <= 0) continue
    rows.push({ label: `${l.kind === 'inc' ? 'INC' : 'IVA'} ${l.rate}%`, amount: l.tax, kind: 'tax' })
  }
  const exento = t.lines.filter((l) => l.category === 'exento').reduce((s, l) => s + l.base, 0)
  const excluido = t.lines.filter((l) => l.category === 'excluido').reduce((s, l) => s + l.base, 0)
  if (exento > 0) rows.push({ label: 'Exento (0%)', amount: exento, kind: 'exempt' })
  if (excluido > 0) rows.push({ label: 'Excluido de IVA', amount: excluido, kind: 'exempt' })
  return rows
}
