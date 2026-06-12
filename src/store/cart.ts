import { create } from 'zustand'
import type { Product } from '@/types'

// Carrito de la venta en curso (POS). Vive en memoria; se vacía al cobrar.
export interface CartLine {
  productId: string
  name: string
  unit: 'unidad' | 'peso'
  qty: number
  unitPrice: number
  lineDiscount: number
  ivaRate: number
  cost: number
  emoji?: string
}

interface CartState {
  lines: CartLine[]
  globalDiscount: number
  addProduct: (p: Product, qty?: number) => void
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
          lines: s.lines.map((l) =>
            l.productId === p.id
              ? { ...l, qty: p.unit === 'peso' ? (qty ?? l.qty) : l.qty + (qty ?? 1) }
              : l,
          ),
        }
      }
      return {
        lines: [
          ...s.lines,
          {
            productId: p.id,
            name: p.name,
            unit: p.unit,
            qty: qty ?? 1,
            unitPrice: p.price,
            lineDiscount: 0,
            ivaRate: p.ivaRate,
            cost: p.cost,
            emoji: p.imageEmoji,
          },
        ],
      }
    }),

  setQty: (productId, qty) =>
    set((s) => ({
      lines:
        qty <= 0
          ? s.lines.filter((l) => l.productId !== productId)
          : s.lines.map((l) => (l.productId === productId ? { ...l, qty } : l)),
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
  return lines.reduce((s, l) => s + l.unitPrice * l.qty - l.lineDiscount, 0)
}
export function cartTotal(lines: CartLine[], globalDiscount: number): number {
  return Math.max(0, Math.round(cartSubtotal(lines) - globalDiscount))
}
export function cartCount(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + (l.unit === 'peso' ? 1 : l.qty), 0)
}
