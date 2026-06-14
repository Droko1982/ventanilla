import type { Product } from '@/types'
import { cop } from './money'
import { code128SVG } from './barcode'

// Imprime una etiqueta de precio para el producto (nombre, precio y código).
// El código de barras es Code 128 REAL y escaneable por cualquier lector.
export function printLabel(product: Product, businessName: string, copies = 1) {
  const code = product.barcode || product.internalCode || ''
  const bars = code ? code128SVG(code, { moduleWidth: 2, height: 40 }) : ''

  const one = `
    <div class="lbl">
      <div class="biz">${businessName}</div>
      <div class="name">${product.name}</div>
      <div class="price">${cop(product.price)}${product.unit === 'peso' ? '/kg' : ''}</div>
      <div class="bars">${bars}</div>
      <div class="code">${code}</div>
    </div>`

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta</title>
  <style>
    *{font-family:Arial, sans-serif; margin:0; padding:0;}
    body{padding:8px; display:flex; flex-wrap:wrap; gap:8px;}
    .lbl{width:230px; border:1px solid #ccc; border-radius:6px; padding:8px; text-align:center;}
    .biz{font-size:10px; color:#666;}
    .name{font-size:13px; font-weight:bold; margin:3px 0; min-height:32px;}
    .price{font-size:24px; font-weight:800;}
    .bars{margin:6px 0 2px; line-height:0;}
    .bars svg{display:block; margin:0 auto; max-width:100%; height:auto;}
    .code{font-family:'Courier New',monospace; font-size:11px; letter-spacing:1px;}
    @media print { .lbl { page-break-inside: avoid; } }
  </style></head><body>${one.repeat(Math.max(1, copies))}</body></html>`

  const w = window.open('', '_blank', 'width=460,height=360')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300)
}
