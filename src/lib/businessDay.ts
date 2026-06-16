import type { Sale } from '@/types'

// "Día del negocio": el día en que se abrió la caja, no la medianoche del reloj.
// Si una caja abre a las 7 a.m. y cierra a la 1 a.m. del día siguiente, todas
// sus ventas pertenecen al día en que abrió (incluidas las de después de las 12).

// Fecha LOCAL en formato YYYY-MM-DD (no UTC).
export function localYMD(iso: string | number | Date): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayYMD(): string {
  return localYMD(Date.now())
}

// Día contable de una venta: usa businessDate (día de apertura de la caja); si la
// venta es antigua y no lo tiene, cae a la fecha de creación.
export function saleDay(s: Sale): string {
  return s.businessDate || localYMD(s.createdAt)
}
