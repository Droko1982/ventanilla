// Bre-B: sistema de pagos inmediatos interoperables del Banco de la República.
// El comercio registra una "llave" (celular, cédula, correo o alfanumérica) y el
// cliente le paga a esa llave desde CUALQUIER banco o billetera. Aquí mostramos
// la llave y un QR con la llave para que el cliente la lea y pague.

export const BREB_KEY_TYPES = [
  { value: 'celular', label: '📱 Celular' },
  { value: 'cedula', label: '🪪 Cédula' },
  { value: 'correo', label: '✉️ Correo' },
  { value: 'alfanumerica', label: '＠ Llave alfanumérica' },
] as const

export type BreBKeyType = (typeof BREB_KEY_TYPES)[number]['value']

// Contenido del QR = la llave del comercio (lo que el cliente usa para pagar).
export function breBPayload(tenant: { breBKey?: string }): string {
  return (tenant.breBKey ?? '').trim()
}

export function hasBreB(tenant?: { breBKey?: string } | null): boolean {
  return !!tenant?.breBKey?.trim()
}

export function breBTypeLabel(type?: string): string {
  return BREB_KEY_TYPES.find((t) => t.value === type)?.label ?? 'Llave'
}
