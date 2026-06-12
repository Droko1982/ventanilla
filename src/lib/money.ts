// Formato de moneda colombiana (COP). En Colombia el separador de miles es el
// punto y normalmente no se muestran centavos.  Ej: 12500 -> "$ 12.500"

const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** Da formato a un valor entero en pesos: 12500 -> "$ 12.500" */
export function cop(value: number): string {
  if (Number.isNaN(value) || value == null) return '$ 0'
  // Intl pone "$12.500"; le agregamos un espacio para que respire.
  return copFormatter.format(Math.round(value)).replace('$', '$ ').replace('$  ', '$ ')
}

/** Número con separador de miles, sin símbolo. 12500 -> "12.500" */
export function num(value: number): string {
  return new Intl.NumberFormat('es-CO').format(value)
}

/** Peso/granel. 0.25 -> "0,250 kg" ; 1.5 -> "1,500 kg" */
export function kg(value: number): string {
  return `${new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(value)} kg`
}

/** Convierte un texto escrito por el usuario ("12.500" o "12500") a entero. */
export function parseCop(text: string): number {
  const clean = text.replace(/[^\d]/g, '')
  return clean ? parseInt(clean, 10) : 0
}
