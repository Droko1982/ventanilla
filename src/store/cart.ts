import { create } from 'zustand'
import type { Product } from '@/types'

// Carrito de la venta en curso (POS). Vive en memoria; se vacía al cobrar.
export interface CartLine {
  productId: string
  name: string
  unit: 'unidad' | 'peso'
  qty: number
  unitPrice: number // precio efectivo (al detal o por mayor según cantidad)
  basePrice?: number // precio al detal
  wholesalePrice?: number // precio al por mayor
  wholesaleMinQty?: number // cantidad mínima para el por mayor
  promoType?: '2x1' | 'percent'
  promoValue?: number
  promoSaving?: number // ahorro por promoción (calculado según la cantidad)
  lineDiscount: number
  ivaRate: number
  cost: number
  emoji?: string
}

// Precio de la línea según la cantidad. El precio al por mayor y la promoción
// NO se apilan: el cliente recibe el MEJOR de los dos. El 2x1 solo aplica por
// unidad (no tiene sentido en productos por peso).
export function priceLine(
  l: Pick<CartLine, 'basePrice' | 'unitPrice' | 'wholesalePrice' | 'wholesaleMinQty' | 'promoType' | 'promoValue' | 'unit'>,
  qty: number,
): { unitPrice: number; promoSaving: number } {
  const base = l.basePrice ?? l.unitPrice
  const wholesaleActive = !!(l.wholesalePrice && l.wholesaleMinQty && qty >= l.wholesaleMinQty)
  const wholesaleTotal = wholesaleActive ? l.wholesalePrice! * qty : base * qty

  let promoSav = 0
  if (l.promoType === '2x1' && l.unit !== 'peso') promoSav = Math.floor(qty / 2) * base
  else if (l.promoType === 'percent' && l.promoValue) promoSav = Math.round(base * qty * (l.promoValue / 100))
  const promoTotal = base * qty - promoSav

  if (wholesaleActive && wholesaleTotal <= promoTotal) return { unitPrice: l.wholesalePrice!, promoSaving: 0 }
  return { unitPrice: base, promoSaving: promoSav }
}

export interface SaleMeta {
  vendedorId?: string
  vendedorName?: string
  customerId?: string
  discountReason?: string
}

interface CartState {
  lines: CartLine[]
  globalDiscount: number
  meta: SaleMeta
  addProduct: (p: Product, qty?: number) => void
  addLine: (line: CartLine) => void
  setQty: (productId: string, qty: number) => void
  setLineDiscount: (productId: string, discount: number) => void
  remove: (productId: string) => void
  setGlobalDiscount: (d: number) => void
  setMeta: (m: Partial<SaleMeta>) => void
  clear: () => void
}

export const useCart = create<CartState>((set) => ({
  lines: [],
  globalDiscount: 0,
  meta: {},

  addProduct: (p, qty) =>
    set((s) => {
      const existing = s.lines.find((l) => l.productId === p.id)
      // Por peso siempre se agrega/edita la cantidad indicada; por unidad se suma.
      if (existing) {
        return {
          lines: s.lines.map((l) => {
            if (l.productId !== p.id) return l
            const newQty = p.unit === 'peso' ? (qty ?? l.qty) : l.qty + (qty ?? 1)
            const pr = priceLine(l, newQty)
            return { ...l, qty: newQty, unitPrice: pr.unitPrice, promoSaving: pr.promoSaving }
          }),
        }
      }
      const newQty = qty ?? 1
      const line: CartLine = {
        productId: p.id,
        name: p.name,
        unit: p.unit,
        qty: newQty,
        basePrice: p.price,
        wholesalePrice: p.wholesalePrice,
        wholesaleMinQty: p.wholesaleMinQty,
        promoType: p.promoType,
        promoValue: p.promoValue,
        unitPrice: p.price,
        lineDiscount: 0,
        ivaRate: p.ivaRate,
        cost: p.cost,
        emoji: p.imageEmoji,
      }
      const pr0 = priceLine(line, newQty)
      line.unitPrice = pr0.unitPrice
      line.promoSaving = pr0.promoSaving
      return { lines: [...s.lines, line] }
    }),

  addLine: (line) => set((s) => ({ lines: [...s.lines, line] })),

  setQty: (productId, qty) =>
    set((s) => ({
      lines:
        qty <= 0
          ? s.lines.filter((l) => l.productId !== productId)
          : s.lines.map((l) => {
              if (l.productId !== productId) return l
              const pr = priceLine(l, qty)
              return { ...l, qty, unitPrice: pr.unitPrice, promoSaving: pr.promoSaving }
            }),
    })),

  setLineDiscount: (productId, discount) =>
    set((s) => ({
      lines: s.lines.map((l) =>
        l.productId === productId ? { ...l, lineDiscount: Math.max(0, discount) } : l,
      ),
    })),

  remove: (productId) => set((s) => ({ lines: s.lines.filter((l) => l.productId !== productId) })),
  setGlobalDiscount: (d) => set({ globalDiscount: Math.max(0, d) }),
  setMeta: (m) => set((s) => ({ meta: { ...s.meta, ...m } })),
  clear: () => set({ lines: [], globalDiscount: 0, meta: {} }),
}))

// Cálculos derivados del carrito
export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + l.unitPrice * l.qty - l.lineDiscount - (l.promoSaving ?? 0), 0)
}
export function cartTotal(lines: CartLine[], globalDiscount: number): number {
  return Math.max(0, Math.round(cartSubtotal(lines) - globalDiscount))
}
export function cartCount(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + (l.unit === 'peso' ? 1 : l.qty), 0)
}
