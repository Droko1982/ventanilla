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

// Precio efectivo según la cantidad (aplica por mayor si corresponde).
function effPrice(l: Pick<CartLine, 'basePrice' | 'unitPrice' | 'wholesalePrice' | 'wholesaleMinQty'>, qty: number): number {
  const base = l.basePrice ?? l.unitPrice
  if (l.wholesalePrice && l.wholesaleMinQty && qty >= l.wholesaleMinQty) return l.wholesalePrice
  return base
}

// Ahorro por promoción automática (2x1 o % de descuento).
function promoSaving(l: Pick<CartLine, 'promoType' | 'promoValue'>, qty: number, unitPrice: number): number {
  if (l.promoType === '2x1') return Math.floor(qty / 2) * unitPrice
  if (l.promoType === 'percent' && l.promoValue) return Math.round(unitPrice * qty * (l.promoValue / 100))
  return 0
}

interface CartState {
  lines: CartLine[]
  globalDiscount: number
  addProduct: (p: Product, qty?: number) => void
  addLine: (line: CartLine) => void
  setQty: (productId: string, qty: number) => void
  setLineDiscount: (productId: string, discount: number) => void
  remove: (productId: string) => void
  setGlobalDiscount: (d: number) => void
  clear: () => void
}

export const useCart = create<CartState>((set) => ({
  lines: [],
  globalDiscount: 0,

  addProduct: (p, qty) =>
    set((s) => {
      const existing = s.lines.find((l) => l.productId === p.id)
      // Por peso siempre se agrega/edita la cantidad indicada; por unidad se suma.
      if (existing) {
        return {
          lines: s.lines.map((l) => {
            if (l.productId !== p.id) return l
            const newQty = p.unit === 'peso' ? (qty ?? l.qty) : l.qty + (qty ?? 1)
            const up = effPrice(l, newQty)
            return { ...l, qty: newQty, unitPrice: up, promoSaving: promoSaving(l, newQty, up) }
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
      line.unitPrice = effPrice(line, newQty)
      line.promoSaving = promoSaving(line, newQty, line.unitPrice)
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
              const up = effPrice(l, qty)
              return { ...l, qty, unitPrice: up, promoSaving: promoSaving(l, qty, up) }
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
  clear: () => set({ lines: [], globalDiscount: 0 }),
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
