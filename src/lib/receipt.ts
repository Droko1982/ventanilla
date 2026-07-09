import type { Sale, Tenant, Location } from '@/types'
import { cop, kg } from './money'
import { fmtDateTime } from './format'
import { docTotals, taxOptsFromTenant, taxSummary, pieResolucion, dianLegend, formaPago, docTypeLabel, esc } from './documents'

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
      return `<tr><td>${esc(it.name)}<br><small>${qty} x ${cop(it.unitPrice)}</small></td><td>${cop(line)}</td></tr>`
    })
    .join('')

  const pays = sale.payments
    .map((p) => `<div class="row"><span>${esc(methodLabel[p.method] ?? p.method)}</span><span>${cop(p.amount)}</span></div>`)
    .join('')

  const t = docTotals(sale.items, sale.discount, taxOptsFromTenant(tenant))
  const taxRows = taxSummary(t)
    .map((r) => `<div class="row"><span>${r.label}</span><span>${cop(r.amount)}</span></div>`)
    .join('')
  const pie = pieResolucion(tenant.dian, 'pos')
  const respons = tenant.vatResponsible === false ? 'No responsable de IVA' : ''

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Recibo</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;font-family:'Consolas',ui-monospace,'Courier New',monospace;}
    body{width:280px;margin:0 auto;padding:12px 10px;background:#fff;color:#111;font-size:12px;line-height:1.5;-webkit-font-smoothing:antialiased;}
    h2{text-align:center;font-size:16px;font-weight:800;letter-spacing:.02em;margin-bottom:2px;}
    .c{text-align:center;font-size:11px;color:#444;}
    hr{border:0;border-top:1px dashed #bbb;margin:8px 0;}
    table{width:100%;font-size:12px;border-collapse:collapse;}
    td{padding:3px 0;vertical-align:top;}
    td:last-child{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;}
    .row{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;color:#333;font-variant-numeric:tabular-nums;}
    .title{margin:8px 0;text-align:center;font-weight:700;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;border:1.5px solid #111;border-radius:5px;padding:5px 0;}
    .tot{display:flex;justify-content:space-between;align-items:baseline;margin-top:8px;padding-top:8px;border-top:2px solid #111;font-size:18px;font-weight:800;font-variant-numeric:tabular-nums;}
    .foot{margin-top:11px;text-align:center;color:#555;font-size:9.5px;line-height:1.6;}
    small{color:#666;font-size:10.5px;}
  </style></head><body>
    <h2>${esc(tenant.businessName)}</h2>
    <div class="c">${esc(location.name)} · ${esc(location.address)}<br>NIT ${esc(tenant.nit)}${respons ? ` · ${esc(respons)}` : ''}</div>
    ${sale.dianDocNumber
      ? `<div class="title">${docTypeLabel(sale.dianDocType)}</div><div class="c">No. ${esc(sale.dianDocNumber)} · ${fmtDateTime(sale.createdAt)}</div>`
      : `<div class="c">${fmtDateTime(sale.createdAt)}</div>`}
    <hr>
    <table>${rows}</table>
    <hr>
    ${taxRows}
    ${sale.discount > 0 ? `<div class="row"><span>Descuento</span><span>-${cop(sale.discount)}</span></div>` : ''}
    <div class="tot"><span>TOTAL</span><span>${cop(sale.total)}</span></div>
    <div class="row"><span>Forma de pago</span><span>${formaPago(sale.payments)}</span></div>
    <hr>
    ${pays}
    <div class="foot">${pie ? `${esc(pie)}<br>` : ''}${dianLegend(tenant.dian)}<br>¡Gracias por su compra! 🛒</div>
  </body></html>`

  const w = window.open('', '_blank', 'width=320,height=600')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300)
}
