import type { Sale, Tenant, Location } from '@/types'
import { cop, kg } from './money'
import { fmtDateTime } from './format'
import { docTotals, taxOptsFromTenant, taxSummary, pieResolucion, dianLegend, formaPago, docTypeLabel } from './documents'

// Construye el texto del recibo (para WhatsApp/correo) y permite imprimirlo
// en una impresora térmica (vía la ventana de impresión del navegador).

const methodLabel: Record<string, string> = {
  efectivo: 'Efectivo',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  otro: 'Otro',
  fiado: 'Fiado (crédito)',
}

export function receiptText(sale: Sale, tenant: Tenant, location: Location): string {
  const t = docTotals(sale.items, sale.discount, taxOptsFromTenant(tenant))
  const lines: string[] = []
  lines.push(`*${tenant.businessName}*`)
  lines.push(location.name)
  lines.push(location.address)
  lines.push(`NIT ${tenant.nit}`)
  if (tenant.vatResponsible === false) lines.push('No responsable de IVA')
  lines.push('--------------------------------')
  lines.push(fmtDateTime(sale.createdAt))
  if (sale.dianDocNumber) lines.push(`${docTypeLabel(sale.dianDocType)} No. ${sale.dianDocNumber}`)
  lines.push('--------------------------------')
  for (const it of sale.items) {
    const qty = it.unit === 'peso' ? kg(it.qty) : `${it.qty} x`
    lines.push(`${it.name}`)
    lines.push(`  ${qty}  ${cop(it.unitPrice)}   ${cop(it.unitPrice * it.qty - it.lineDiscount)}`)
  }
  lines.push('--------------------------------')
  for (const r of taxSummary(t)) lines.push(`${r.label}: ${cop(r.amount)}`)
  if (sale.discount > 0) lines.push(`Descuento: -${cop(sale.discount)}`)
  lines.push(`*TOTAL: ${cop(sale.total)}*`)
  lines.push(`Forma de pago: ${formaPago(sale.payments)}`)
  for (const p of sale.payments) lines.push(`${methodLabel[p.method] ?? p.method}: ${cop(p.amount)}`)
  lines.push('--------------------------------')
  const pie = pieResolucion(tenant.dian, 'pos')
  if (pie) lines.push(pie)
  lines.push(dianLegend(tenant.dian))
  lines.push('¡Gracias por su compra! 🛒')
  return lines.join('\n')
}

export function printReceipt(sale: Sale, tenant: Tenant, location: Location): void {
  const rows = sale.items
    .map((it) => {
      const qty = it.unit === 'peso' ? kg(it.qty) : `${it.qty}`
      const line = it.unitPrice * it.qty - it.lineDiscount
      return `<tr><td>${it.name}<br><small>${qty} x ${cop(it.unitPrice)}</small></td><td style="text-align:right">${cop(line)}</td></tr>`
    })
    .join('')

  const pays = sale.payments
    .map((p) => `<div style="display:flex;justify-content:space-between"><span>${methodLabel[p.method] ?? p.method}</span><span>${cop(p.amount)}</span></div>`)
    .join('')

  const t = docTotals(sale.items, sale.discount, taxOptsFromTenant(tenant))
  const taxRows = taxSummary(t)
    .map((r) => `<div style="display:flex;justify-content:space-between"><span>${r.label}</span><span>${cop(r.amount)}</span></div>`)
    .join('')
  const pie = pieResolucion(tenant.dian, 'pos')
  const respons = tenant.vatResponsible === false ? 'No responsable de IVA' : ''

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Recibo</title>
  <style>
    * { font-family: 'Courier New', monospace; }
    body { width: 280px; margin: 0 auto; padding: 8px; color:#000; }
    h2 { text-align:center; margin:4px 0; }
    .c { text-align:center; font-size:12px; }
    hr { border:none; border-top:1px dashed #000; margin:6px 0; }
    table { width:100%; font-size:12px; border-collapse:collapse; }
    td { padding:2px 0; vertical-align:top; }
    .row { display:flex; justify-content:space-between; font-size:12px; }
    .tot { font-size:16px; font-weight:bold; display:flex; justify-content:space-between; }
    small { color:#333; }
  </style></head><body>
    <h2>${tenant.businessName}</h2>
    <div class="c">${location.name}<br>${location.address}<br>NIT ${tenant.nit}${respons ? `<br>${respons}` : ''}</div>
    <hr>
    <div class="c">${fmtDateTime(sale.createdAt)}</div>
    ${sale.dianDocNumber ? `<div class="c">${docTypeLabel(sale.dianDocType)} No. ${sale.dianDocNumber}</div>` : ''}
    <hr>
    <table>${rows}</table>
    <hr>
    ${taxRows}
    ${sale.discount > 0 ? `<div class="row"><span>Descuento</span><span>-${cop(sale.discount)}</span></div>` : ''}
    <div class="tot"><span>TOTAL</span><span>${cop(sale.total)}</span></div>
    <div class="row"><span>Forma de pago</span><span>${formaPago(sale.payments)}</span></div>
    <hr>
    ${pays}
    <hr>
    <div class="c">${pie ? `${pie}<br>` : ''}${dianLegend(tenant.dian)}<br>¡Gracias por su compra! 🛒</div>
  </body></html>`

  const w = window.open('', '_blank', 'width=320,height=600')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300)
}
