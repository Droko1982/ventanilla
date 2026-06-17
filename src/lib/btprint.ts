// Impresión directa en impresoras térmicas Bluetooth (BLE) usando ESC/POS.
// Pensada para las impresoras genéricas de 58mm que NO aparecen en el diálogo de
// impresión del navegador. Requiere HTTPS (lo tenemos) y un gesto del usuario
// (clic). Si el navegador/dispositivo no soporta Web Bluetooth o la impresora no
// responde, lanza un error y queda el botón "Imprimir" normal como respaldo.
//
// Es "mejor esfuerzo": cubre los servicios BLE más comunes de estas impresoras.
// Con una impresora muy distinta puede que no encuentre el canal de escritura.

const CHUNK = 180 // los paquetes BLE son pequeños; enviamos por partes
const COMBINING = new RegExp('[\\u0300-\\u036f]', 'g') // acentos combinados (NFD)

// Servicios BLE típicos de impresoras térmicas / módulos serie (HM-10, ISSC…).
const PRINTER_SERVICES: (number | string)[] = [
  0x18f0, 0xff00, 0xffe0, 0xff12, 0xae30,
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
]

export function btPrintSupported(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).bluetooth
}

// Convierte el texto del recibo a bytes ESC/POS: init + líneas + avance + corte.
// Quita negritas markdown (*) y acentos, porque las térmicas básicas no manejan
// UTF-8 (imprimirían caracteres raros).
function escpos(text: string): Uint8Array {
  const clean = text.replace(/\*/g, '').normalize('NFD').replace(COMBINING, '')
  const out: number[] = [0x1b, 0x40] // ESC @ (inicializar)
  for (const line of clean.split('\n')) {
    for (const c of line) out.push(c.charCodeAt(0) & 0xff)
    out.push(0x0a) // salto de línea
  }
  out.push(0x0a, 0x0a, 0x0a, 0x0a) // avanzar papel
  out.push(0x1d, 0x56, 0x42, 0x00) // GS V B 0 → corte parcial con avance
  return new Uint8Array(out)
}

// Pide elegir la impresora, busca un canal de escritura y envía el recibo.
export async function btPrint(text: string): Promise<void> {
  const bt = (navigator as any).bluetooth
  if (!bt) throw new Error('Este navegador no soporta impresión Bluetooth. Usa Chrome en Android o el botón "Imprimir".')
  const device = await bt.requestDevice({ acceptAllDevices: true, optionalServices: PRINTER_SERVICES })
  if (!device?.gatt) throw new Error('No se pudo conectar con la impresora.')
  const server = await device.gatt.connect()
  try {
    const services = await server.getPrimaryServices()
    let ch: any = null
    for (const s of services) {
      const chars = await s.getCharacteristics()
      for (const c of chars) {
        if (c.properties.write || c.properties.writeWithoutResponse) { ch = c; break }
      }
      if (ch) break
    }
    if (!ch) throw new Error('No se encontró el canal de impresión. ¿Es una impresora térmica Bluetooth?')
    const data = escpos(text)
    for (let i = 0; i < data.length; i += CHUNK) {
      const slice = data.slice(i, i + CHUNK)
      if (ch.properties.writeWithoutResponse && ch.writeValueWithoutResponse) await ch.writeValueWithoutResponse(slice)
      else await ch.writeValue(slice)
    }
  } finally {
    try { server.disconnect() } catch { /* */ }
  }
}
