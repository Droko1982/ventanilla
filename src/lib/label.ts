import type { Product } from '@/types'
import { cop } from './money'
import { code128SVG } from './barcode'

// HTML de UNA etiqueta (nombre, precio y código de barras Code 128 real).
function labelHtml(product: Product, businessName: string): string {
  const code = product.barcode || product.internalCode || ''
  const bars = code ? code128SVG(code, { moduleWidth: 2, height: 40 }) : ''
  return `
    <div class="lbl">
      <div class="biz">${businessName}</div>
      <div class="name">${product.name}</div>
      <div class="price">${cop(product.price)}${product.unit === 'peso' ? '/kg' : ''}</div>
      <div class="bars">${bars}</div>
      <div class="code">${code}</div>
    </div>`
}

const LABEL_STYLE = `
    *{font-family:Arial, sans-serif; margin:0; padding:0;}
    body{padding:8px; display:flex; flex-wrap:wrap; gap:8px;}
    .lbl{width:230px; border:1px solid #ccc; border-radius:6px; padding:8px; text-align:center;}
    .biz{font-size:10px; color:#666;}
    .name{font-size:13px; font-weight:bold; margin:3px 0; min-height:32px;}
    .price{font-size:24px; font-weight:800;}
    .bars{margin:6px 0 2px; line-height:0;}
    .bars svg{display:block; margin:0 auto; max-width:100%; height:auto;}
    .code{font-family:'Courier New',monospace; font-size:11px; letter-spacing:1px;}
    @media print { .lbl { page-break-inside: avoid; } }`

function openPrint(inner: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title>
  <style>${LABEL_STYLE}</style></head><body>${inner}</body></html>`
  const w = window.open('', '_blank', 'width=720,height=560')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300)
}

// Imprime la etiqueta de UN producto (con N copias). Code 128 escaneable.
export function printLabel(product: Product, businessName: string, copies = 1) {
  openPrint(labelHtml(product, businessName).repeat(Math.max(1, copies)))
}

// Imprime las etiquetas de VARIOS productos en una sola hoja (impresión en lote).
export function printLabels(products: Product[], businessName: string) {
  if (!products.length) return
  openPrint(products.map((p) => labelHtml(p, businessName)).join(''))
}
