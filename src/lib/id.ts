// Generador de IDs único que funciona offline (no depende del servidor).
// Usa crypto.randomUUID cuando existe; si no, un fallback con timestamp.

export function uid(prefix = ''): string {
  let id: string
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    id = crypto.randomUUID()
  } else {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
  return prefix ? `${prefix}_${id}` : id
}

/** Código interno corto y legible para productos sin código de barras. */
export function internalCode(): string {
  const n = Math.floor(100000 + Math.random() * 899999)
  return `VEN-${n}`
}

/** PIN de 4 dígitos al azar (para sugerir uno seguro). Evita los muy obvios. */
export function randomPin(): string {
  const obvios = new Set(['0000', '1111', '1234', '2222', '4321', '0123'])
  let pin = ''
  do {
    pin = String(Math.floor(1000 + Math.random() * 9000))
  } while (obvios.has(pin))
  return pin
}
