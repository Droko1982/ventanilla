import type { Sale, Tenant, Location } from '@/types'
import { cop, kg } from './money'
import { fmtDateTime } from './format'

// Construye el texto del recibo (para WhatsApp/correo) y permite imprimirlo
// en una impresora térmica (vía la ventana de impresión del navegador).

const methodLabel: Record<string, string> = {
  efectivo: 'Efectivo',
  nequi: 'Nequi',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  fiado: 'Fiado (crédito)',
}

export function receiptText(sale: Sale, tenant: Tenant, location: Location): string {
  const lines: string[] = []
  lines.push(`*${tenant.businessName}*`)
  lines.push(location.name)
  lines.push(location.address)
  lines.push(`NIT ${tenant.nit}`)
  lines.push('--------------------------------')
  lines.push(fmtDateTime(sale.createdAt))
  if (sale.dianDocNumber) lines.push(`Doc. ${sale.dianDocType.toUpperCase()} ${sale.dianDocNumber}`)
  lines.push('--------------------------------')
  for (const it of sale.items) {
    const qty = it.unit === 'peso' ? kg(it.qty) : `${it.qty} x`
    lines.push(`${it.name}`)
    lines.push(`  ${qty}  ${cop(it.unitPrice)}   ${cop(it.unitPrice * it.qty - it.lineDiscount)}`)
  }
  lines.push('--------------------------------')
  if (sale.discount > 0) lines.push(`Descuento: -${cop(sale.discount)}`)
  lines.push(`*TOTAL: ${cop(sale.total)}*`)
  for (const p of sale.payments) lines.push(`${methodLabel[p.method] ?? p.method}: ${cop(p.amount)}`)
  lines.push('--------------------------------')
  lines.push('¡Gracias por su compra! 🛒')
  lines.push('Documento equivalente electrónico POS - DIAN')
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

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Recibo</title>
  <style>
    * { font-family: 'Courier New', monospace; }
    body { width: 280px; margin: 0 auto; padding: 8px; color:#000; }
    h2 { text-align:center; margin:4px 0; }
    .c { text-align:center; font-size:12px; }
    hr { border:none; border-top:1px dashed #000; margin:6px 0; }
    table { width:100%; font-size:12px; border-collapse:collapse; }
    td { padding:2px 0; vertical-align:top; }
    .tot { font-size:16px; font-weight:bold; display:flex; justify-content:space-between; }
    small { color:#333; }
  </style></head><body>
    <h2>${tenant.businessName}</h2>
    <div class="c">${location.name}<br>${location.address}<br>NIT ${tenant.nit}</div>
    <hr>
    <div class="c">${fmtDateTime(sale.createdAt)}</div>
    ${sale.dianDocNumber ? `<div class="c">${sale.dianDocType.toUpperCase()} ${sale.dianDocNumber}</div>` : ''}
    <hr>
    <table>${rows}</table>
    <hr>
    ${sale.discount > 0 ? `<div style="display:flex;justify-content:space-between"><span>Descuento</span><span>-${cop(sale.discount)}</span></div>` : ''}
    <div class="tot"><span>TOTAL</span><span>${cop(sale.total)}</span></div>
    <hr>
    ${pays}
    <hr>
    <div class="c">¡Gracias por su compra! 🛒<br>Documento equivalente electrónico POS · DIAN</div>
  </body></html>`

  const w = window.open('', '_blank', 'width=320,height=600')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300)
}
