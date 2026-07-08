// Lectura de ETIQUETAS DE BÁSCULA. Las balanzas de fruver/carnicería/quesos
// imprimen un código EAN-13 con el peso (o el precio) INCRUSTADO. Formato típico:
//   "2 CCCCCC VVVVV D"  →  prefijo "2" + código del producto (6) + valor (5) + control (1)
// El "valor" son gramos (si la balanza incrusta el PESO) o pesos (si incrusta el PRECIO).
import type { Product } from '@/types'

export interface ScaleLabelConfig {
  enabled?: boolean
  prefix?: string // prefijo que marca una etiqueta de báscula (por defecto "2")
  embeds?: 'peso' | 'precio' // qué trae incrustado el valor (por defecto "peso")
  itemDigits?: number // dígitos del código del producto (por defecto 6)
}

export interface ScaleLabelParsed {
  itemCode: string // código del producto embebido (para buscarlo en el catálogo)
  weightKg?: number // peso en kg (si la balanza incrusta el peso)
  price?: number // precio total de esa etiqueta (si la balanza incrusta el precio)
}

/** Interpreta un código escaneado como etiqueta de báscula. Devuelve null si no aplica. */
export function parseScaleLabel(code: string, cfg?: ScaleLabelConfig): ScaleLabelParsed | null {
  if (!cfg?.enabled) return null
  const c = (code || '').trim()
  const prefix = (cfg.prefix || '2').trim()
  const itemDigits = cfg.itemDigits ?? 6
  // Debe ser un EAN-13 numérico que empiece por el prefijo configurado.
  if (!/^\d{13}$/.test(c) || !c.startsWith(prefix)) return null
  const start = prefix.length
  const itemCode = c.slice(start, start + itemDigits)
  const value = parseInt(c.slice(start + itemDigits, 12) || '0', 10) || 0 // hasta el dígito de control (pos 12)
  if (cfg.embeds === 'precio') return { itemCode, price: value }
  return { itemCode, weightKg: value / 1000 } // gramos → kg
}

const noZeros = (s: string | undefined) => (s || '').replace(/^0+/, '') || '0'

/** Busca el producto que corresponde al código de una etiqueta de báscula. */
export function findByScaleItem(products: Product[], itemCode: string, prefix = '2'): Product | undefined {
  const target = noZeros(itemCode)
  const full = prefix + itemCode
  return products.find((p) => {
    if (p.active === false) return false
    const b = p.barcode, ic = p.internalCode
    return b === full || b === itemCode || ic === itemCode || noZeros(b) === target || noZeros(ic) === target
  })
}
