// Cobro del SaaS con descuento por paquete: la 1ª ventanilla a precio lleno,
// la 2ª y 3ª más baratas, y de la 4ª en adelante aún menos. Así el cliente
// paga menos por local mientras más locales tiene.

const TIERS = [1, 0.8, 0.7, 0.6] // factor por la 1ª, 2ª, 3ª, 4ª+ ventanilla

export function monthlyTotal(locationCount: number, feePerLocation: number): number {
  let total = 0
  for (let i = 0; i < locationCount; i++) {
    const factor = TIERS[Math.min(i, TIERS.length - 1)]
    total += Math.round(feePerLocation * factor)
  }
  return total
}

/** Desglose por ventanilla, para mostrar el ahorro. */
export function billingBreakdown(locationCount: number, feePerLocation: number) {
  const lines: { index: number; price: number; factor: number }[] = []
  for (let i = 0; i < locationCount; i++) {
    const factor = TIERS[Math.min(i, TIERS.length - 1)]
    lines.push({ index: i + 1, price: Math.round(feePerLocation * factor), factor })
  }
  const full = feePerLocation * locationCount
  const total = lines.reduce((s, l) => s + l.price, 0)
  return { lines, total, savings: full - total }
}
