import type { Sale, Remision, Tenant, Location } from '@/types'
import { cop, kg } from './money'
import { fmtDateTime } from './format'
import { ivaBreakdown } from './documents'

// Texto e impresión de FACTURA ELECTRÓNICA DE VENTA y REMISIÓN.

export function facturaText(sale: Sale, tenant: Tenant, location: Location): string {
  const t = ivaBreakdown(sale.items, sale.discount)
  const L: string[] = []
  L.push(`*${tenant.businessName}* — NIT ${tenant.nit}`)
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
  L.push(`Base gravable: ${cop(t.base)}`)
  for (const ln of t.lines) if (ln.iva > 0) L.push(`IVA ${ln.rate}%: ${cop(ln.iva)}`)
  if (sale.discount > 0) L.push(`Descuento: -${cop(sale.discount)}`)
  L.push(`*TOTAL: ${cop(sale.total)}*`)
  L.push('================================')
  L.push('Factura electrónica validada por la DIAN')
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
    *{font-family:'Courier New',monospace;}
    body{width:300px;margin:0 auto;padding:10px;color:#000;}
    h2{text-align:center;margin:4px 0;font-size:15px;}
    .c{text-align:center;font-size:12px;}
    hr{border:none;border-top:1px dashed #000;margin:6px 0;}
    table{width:100%;font-size:12px;border-collapse:collapse;}
    td{padding:2px 0;vertical-align:top;}
    .row{display:flex;justify-content:space-between;font-size:12px;}
    .tot{font-size:15px;font-weight:bold;display:flex;justify-content:space-between;margin-top:4px;}
    small{color:#333;}
  </style></head><body>${inner}</body></html>`
  const w = window.open('', '_blank', 'width=340,height=640')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300)
}

export function printFactura(sale: Sale, tenant: Tenant, location: Location) {
  const t = ivaBreakdown(sale.items, sale.discount)
  const rows = sale.items
    .map((it) => {
      const q = it.unit === 'peso' ? kg(it.qty) : `${it.qty}`
      return `<tr><td>${it.name}<br><small>${q} x ${cop(it.unitPrice)}</small></td><td style="text-align:right">${cop(it.unitPrice * it.qty - it.lineDiscount)}</td></tr>`
    })
    .join('')
  const ivas = t.lines.filter((l) => l.iva > 0).map((l) => `<div class="row"><span>IVA ${l.rate}%</span><span>${cop(l.iva)}</span></div>`).join('')
  printHtml('Factura', `
    <h2>${tenant.businessName}</h2>
    <div class="c">NIT ${tenant.nit}<br>${location.name}<br>${location.address}</div>
    <hr><div class="c"><b>FACTURA ELECTRÓNICA DE VENTA</b><br>No. ${sale.dianDocNumber ?? '(pendiente)'}<br>${fmtDateTime(sale.createdAt)}</div><hr>
    ${sale.customerName ? `<div class="c">${sale.customerName}<br>${sale.customerIdType ?? 'CC'} ${sale.customerDoc ?? ''}<br>${sale.customerAddress ?? ''}</div><hr>` : ''}
    <table>${rows}</table><hr>
    <div class="row"><span>Base gravable</span><span>${cop(t.base)}</span></div>
    ${ivas}
    ${sale.discount > 0 ? `<div class="row"><span>Descuento</span><span>-${cop(sale.discount)}</span></div>` : ''}
    <div class="tot"><span>TOTAL</span><span>${cop(sale.total)}</span></div>
    <hr><div class="c">Validada por la DIAN · ¡Gracias!</div>`)
}

export function printRemision(rem: Remision, tenant: Tenant, location: Location) {
  const rows = rem.items
    .map((it) => {
      const q = it.unit === 'peso' ? kg(it.qty) : `${it.qty}`
      return `<tr><td>${it.name}<br><small>${q} x ${cop(it.unitPrice)}</small></td><td style="text-align:right">${cop(it.unitPrice * it.qty - it.lineDiscount)}</td></tr>`
    })
    .join('')
  printHtml('Remisión', `
    <h2>${tenant.businessName}</h2>
    <div class="c">NIT ${tenant.nit}<br>${location.name}<br>${location.address}</div>
    <hr><div class="c"><b>REMISIÓN / NOTA DE ENTREGA</b><br>No. ${rem.number}<br>${fmtDateTime(rem.createdAt)}</div><hr>
    <div class="c">${rem.customerName}<br>${rem.customerDoc ?? ''}<br>${rem.customerAddress ?? ''}</div><hr>
    <table>${rows}</table><hr>
    ${rem.discount > 0 ? `<div class="row"><span>Descuento</span><span>-${cop(rem.discount)}</span></div>` : ''}
    <div class="tot"><span>TOTAL</span><span>${cop(rem.total)}</span></div>
    ${rem.note ? `<hr><div class="c">Obs: ${rem.note}</div>` : ''}
    <hr><div class="c">Documento de entrega — no es factura.</div>`)
}
