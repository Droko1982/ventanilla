import type { Sale, Remision, Tenant, Location } from '@/types'
import { cop, kg } from './money'
import { fmtDateTime } from './format'
import { docTotals, taxOptsFromTenant, taxSummary, pieResolucion, dianLegend, formaPago, esc } from './documents'

// Texto e impresión de FACTURA ELECTRÓNICA DE VENTA y REMISIÓN.

export function facturaText(sale: Sale, tenant: Tenant, location: Location): string {
  const t = docTotals(sale.items, sale.discount, taxOptsFromTenant(tenant))
  const L: string[] = []
  L.push(`*${tenant.businessName}* — NIT ${tenant.nit}`)
  if (tenant.taxResponsibilities) L.push(tenant.taxResponsibilities)
  if (tenant.vatResponsible === false) L.push('No responsable de IVA')
  L.push(`${location.name}, ${location.address}`)
  L.push('================================')
  L.push(`*FACTURA ELECTRÓNICA DE VENTA*`)
  L.push(`No. ${sale.dianDocNumber ?? '(pendiente)'}`)
  L.push(fmtDateTime(sale.createdAt))
  L.push('--------------------------------')
  if (sale.customerName) L.push(`Cliente: ${sale.customerName}`)
  if (sale.customerDoc) L.push(`${sale.customerIdType ?? 'CC'}: ${sale.customerDoc}`)
  if (sale.customerAddress) L.push(`Dir: ${sale.customerAddress}`)
  L.push('--------------------------------')
  for (const it of sale.items) {
    const q = it.unit === 'peso' ? kg(it.qty) : `${it.qty} x`
    L.push(`${it.name}`)
    L.push(`  ${q} ${cop(it.unitPrice)}   ${cop(it.unitPrice * it.qty - it.lineDiscount)}`)
  }
  L.push('--------------------------------')
  for (const r of taxSummary(t)) L.push(`${r.label}: ${cop(r.amount)}`)
  if (sale.discount > 0) L.push(`Descuento: -${cop(sale.discount)}`)
  L.push(`*TOTAL: ${cop(sale.total)}*`)
  L.push(`Forma de pago: ${formaPago(sale.payments)}`)
  L.push('================================')
  const pie = pieResolucion(tenant.dian, 'fe')
  if (pie) L.push(pie)
  L.push(dianLegend(tenant.dian))
  L.push('¡Gracias por su compra!')
  return L.join('\n')
}

export function remisionText(rem: Remision, tenant: Tenant, location: Location): string {
  const L: string[] = []
  L.push(`*${tenant.businessName}* — NIT ${tenant.nit}`)
  L.push(`${location.name}, ${location.address}`)
  L.push('================================')
  L.push(`*REMISIÓN / NOTA DE ENTREGA*`)
  L.push(`No. ${rem.number}`)
  L.push(fmtDateTime(rem.createdAt))
  L.push('--------------------------------')
  L.push(`Cliente: ${rem.customerName}`)
  if (rem.customerDoc) L.push(`Doc: ${rem.customerDoc}`)
  if (rem.customerAddress) L.push(`Dir: ${rem.customerAddress}`)
  L.push('--------------------------------')
  for (const it of rem.items) {
    const q = it.unit === 'peso' ? kg(it.qty) : `${it.qty} x`
    L.push(`${it.name}  ${q}   ${cop(it.unitPrice * it.qty - it.lineDiscount)}`)
  }
  L.push('--------------------------------')
  if (rem.discount > 0) L.push(`Descuento: -${cop(rem.discount)}`)
  L.push(`*TOTAL: ${cop(rem.total)}*`)
  if (rem.note) L.push(`Obs: ${rem.note}`)
  L.push('================================')
  L.push('Documento de entrega — no es factura de venta.')
  return L.join('\n')
}

function printHtml(title: string, inner: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;font-family:'Consolas',ui-monospace,'Courier New',monospace;}
    body{width:300px;margin:0 auto;padding:14px 12px;background:#fff;color:#111;font-size:12px;line-height:1.5;-webkit-font-smoothing:antialiased;}
    h2{text-align:center;font-size:17px;font-weight:800;letter-spacing:.02em;margin-bottom:2px;}
    .c{text-align:center;font-size:11px;color:#444;}
    hr{border:0;border-top:1px dashed #bbb;margin:9px 0;}
    table{width:100%;font-size:12px;border-collapse:collapse;}
    td{padding:3px 0;vertical-align:top;}
    td:last-child{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;}
    .row{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;color:#333;font-variant-numeric:tabular-nums;}
    .title{margin:9px 0;text-align:center;font-weight:700;font-size:11px;letter-spacing:.12em;text-transform:uppercase;border:1.5px solid #111;border-radius:5px;padding:5px 0;}
    .tot{display:flex;justify-content:space-between;align-items:baseline;margin-top:8px;padding-top:8px;border-top:2px solid #111;font-size:18px;font-weight:800;font-variant-numeric:tabular-nums;}
    .foot{margin-top:11px;text-align:center;color:#555;font-size:9.5px;line-height:1.6;}
    small{color:#666;font-size:10.5px;}
  </style></head><body>${inner}</body></html>`
  const w = window.open('', '_blank', 'width=340,height=640')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300)
}

export function printFactura(sale: Sale, tenant: Tenant, location: Location) {
  const t = docTotals(sale.items, sale.discount, taxOptsFromTenant(tenant))
  const rows = sale.items
    .map((it) => {
      const q = it.unit === 'peso' ? kg(it.qty) : `${it.qty}`
      return `<tr><td>${esc(it.name)}<br><small>${q} x ${cop(it.unitPrice)}</small></td><td style="text-align:right">${cop(it.unitPrice * it.qty - it.lineDiscount)}</td></tr>`
    })
    .join('')
  const taxRows = taxSummary(t)
    .map((r) => `<div class="row"><span>${r.label}</span><span>${cop(r.amount)}</span></div>`)
    .join('')
  const pie = pieResolucion(tenant.dian, 'fe')
  const respons = [tenant.taxResponsibilities, tenant.vatResponsible === false ? 'No responsable de IVA' : '']
    .filter(Boolean)
    .join(' · ')
  printHtml('Factura', `
    <h2>${esc(tenant.businessName)}</h2>
    <div class="c">NIT ${esc(tenant.nit)}${respons ? ` · ${esc(respons)}` : ''}<br>${esc(location.name)} · ${esc(location.address)}</div>
    <div class="title">Factura electrónica de venta</div>
    <div class="c">No. ${esc(sale.dianDocNumber ?? '(pendiente)')} · ${fmtDateTime(sale.createdAt)}</div>
    ${sale.customerName ? `<hr><div class="c">${esc(sale.customerName)} · ${sale.customerIdType ?? 'CC'} ${esc(sale.customerDoc ?? '')}${sale.customerAddress ? `<br>${esc(sale.customerAddress)}` : ''}</div>` : ''}
    <hr><table>${rows}</table><hr>
    ${taxRows}
    ${sale.discount > 0 ? `<div class="row"><span>Descuento</span><span>-${cop(sale.discount)}</span></div>` : ''}
    <div class="tot"><span>TOTAL</span><span>${cop(sale.total)}</span></div>
    <div class="row"><span>Forma de pago</span><span>${formaPago(sale.payments)}</span></div>
    <div class="foot">${pie ? `${esc(pie)}<br>` : ''}${dianLegend(tenant.dian)}<br>¡Gracias por su compra!</div>`)
}

export function printRemision(rem: Remision, tenant: Tenant, location: Location) {
  const rows = rem.items
    .map((it) => {
      const q = it.unit === 'peso' ? kg(it.qty) : `${it.qty}`
      return `<tr><td>${esc(it.name)}<br><small>${q} x ${cop(it.unitPrice)}</small></td><td style="text-align:right">${cop(it.unitPrice * it.qty - it.lineDiscount)}</td></tr>`
    })
    .join('')
  printHtml('Remisión', `
    <h2>${esc(tenant.businessName)}</h2>
    <div class="c">NIT ${esc(tenant.nit)}<br>${esc(location.name)} · ${esc(location.address)}</div>
    <div class="title">Remisión · Nota de entrega</div>
    <div class="c">No. ${esc(rem.number)} · ${fmtDateTime(rem.createdAt)}</div>
    <hr><div class="c">${esc(rem.customerName)}${rem.customerDoc ? ` · ${esc(rem.customerDoc)}` : ''}${rem.customerAddress ? `<br>${esc(rem.customerAddress)}` : ''}</div>
    <hr><table>${rows}</table><hr>
    ${rem.discount > 0 ? `<div class="row"><span>Descuento</span><span>-${cop(rem.discount)}</span></div>` : ''}
    <div class="tot"><span>TOTAL</span><span>${cop(rem.total)}</span></div>
    ${rem.note ? `<div class="row"><span>Obs.</span><span>${esc(rem.note)}</span></div>` : ''}
    <div class="foot">Documento de entrega — no es factura de venta.</div>`)
}
