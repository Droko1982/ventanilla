// Lectura de peso desde una báscula por Web Serial (RS-232 / USB-serial).
//
// No hay un protocolo único entre básculas: la mayoría emiten líneas ASCII con
// el peso (p. ej. "ST,GS,+  1.234 kg"). Leemos el texto entrante y extraemos el
// número en kg. Algunas básculas sólo responden ante un disparador, así que
// enviamos ENQ (0x05) y "W\r\n" (inofensivos si la báscula emite en continuo).
// En celular o sin báscula, degrada con un aviso y nunca rompe.

const LS_KEY = 'ventanilla.scale.linked'
type SerialNavigator = Navigator & { serial?: any }

export function scaleSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator
}

export function scaleLinked(): boolean {
  try {
    return localStorage.getItem(LS_KEY) === '1'
  } catch {
    return false
  }
}

let port: any = null

async function getPort(interactive: boolean): Promise<any> {
  const serial = (navigator as SerialNavigator).serial
  if (!serial) return null
  if (port) return port
  const granted = await serial.getPorts()
  if (granted.length) {
    port = granted[0]
    return port
  }
  if (!interactive) return null
  port = await serial.requestPort()
  return port
}

export async function connectScale(): Promise<boolean> {
  if (!scaleSupported()) return false
  try {
    const p = await getPort(true)
    if (!p) return false
    try { localStorage.setItem(LS_KEY, '1') } catch { /* ignore */ }
    return true
  } catch {
    return false
  }
}

export function unlinkScale(): void {
  port = null
  try { localStorage.removeItem(LS_KEY) } catch { /* ignore */ }
}

// Extrae el peso (en kg) del texto recibido. Detecta unidad g/kg/lb.
function parseWeightKg(text: string): number | null {
  const matches = [...text.matchAll(/(-?\d+[.,]?\d*)\s*(kg|g|lb)?/gi)]
  for (let i = matches.length - 1; i >= 0; i--) {
    const raw = parseFloat(matches[i][1].replace(',', '.'))
    if (isNaN(raw) || raw <= 0) continue
    const unit = (matches[i][2] || 'kg').toLowerCase()
    const kg = unit === 'g' ? raw / 1000 : unit === 'lb' ? raw * 0.453592 : raw
    return Math.round(kg * 1000) / 1000
  }
  return null
}

export type ScaleResult =
  | { ok: true; kg: number }
  | { ok: false; reason: 'unsupported' | 'no-device' | 'no-read' | 'error' }

// Lee el peso una vez (espera hasta timeoutMs a que la báscula reporte un valor).
export async function readWeightOnce(interactive = false, timeoutMs = 2500): Promise<ScaleResult> {
  if (!scaleSupported()) return { ok: false, reason: 'unsupported' }
  try {
    const p = await getPort(interactive)
    if (!p) return { ok: false, reason: 'no-device' }
    if (!p.readable) await p.open({ baudRate: 9600 })
    try { localStorage.setItem(LS_KEY, '1') } catch { /* ignore */ }

    // Disparador de lectura (inofensivo si la báscula emite en continuo)
    try {
      const w = p.writable.getWriter()
      await w.write(Uint8Array.of(0x05))
      await w.write(new TextEncoder().encode('W\r\n'))
      w.releaseLock()
    } catch { /* algunas básculas no aceptan escritura */ }

    const reader = p.readable.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    const timer = setTimeout(() => { reader.cancel().catch(() => {}) }, timeoutMs)
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const kg = parseWeightKg(buf)
        if (kg) {
          clearTimeout(timer)
          reader.cancel().catch(() => {})
          return { ok: true, kg }
        }
      }
    } finally {
      clearTimeout(timer)
      try { reader.releaseLock() } catch { /* ignore */ }
    }
    return { ok: false, reason: 'no-read' }
  } catch {
    return { ok: false, reason: 'error' }
  }
}

export function scaleMessage(r: ScaleResult): { tone: 'success' | 'info' | 'error'; text: string } {
  if (r.ok) return { tone: 'success', text: `Peso leído: ${r.kg} kg` }
  switch (r.reason) {
    case 'unsupported': return { tone: 'info', text: 'Este dispositivo no soporta báscula (usa el PC con Chrome/Edge).' }
    case 'no-device': return { tone: 'info', text: 'No hay báscula vinculada. Conéctala en Ajustes.' }
    case 'no-read': return { tone: 'info', text: 'La báscula no reportó peso. Verifica que esté encendida y estable.' }
    default: return { tone: 'error', text: 'No se pudo leer la báscula. Revisa la conexión.' }
  }
}
