// Apertura del cajón monedero.
//
// Un cajón monedero se abre con un "pulso" eléctrico que envía la impresora de
// tickets cuando recibe el comando ESC/POS de apertura (kick):
//   ESC p m t1 t2  →  0x1B 0x70 0x00 0x19 0xFA
// En una PWA eso se hace con la Web Serial API (Chrome/Edge de escritorio, que
// es donde corre el PC de la tienda). En celular o sin impresora, degrada con
// elegancia: las funciones devuelven un estado y la UI avisa, nunca rompe.

const KICK = Uint8Array.of(0x1b, 0x70, 0x00, 0x19, 0xfa)
const LS_KEY = 'ventanilla.drawer.linked'

type SerialNavigator = Navigator & { serial?: any }

export function drawerSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator
}

// ¿El usuario ya vinculó una impresora/cajón en ESTE dispositivo?
export function drawerLinked(): boolean {
  try {
    return localStorage.getItem(LS_KEY) === '1'
  } catch {
    return false
  }
}

let cachedPort: any = null

async function getPort(interactive: boolean): Promise<any> {
  const serial = (navigator as SerialNavigator).serial
  if (!serial) return null
  if (cachedPort) return cachedPort
  // Reutiliza un puerto ya autorizado en sesiones anteriores
  const granted = await serial.getPorts()
  if (granted.length) {
    cachedPort = granted[0]
    return cachedPort
  }
  if (!interactive) return null
  cachedPort = await serial.requestPort()
  return cachedPort
}

// Pide permiso y vincula una impresora/cajón. true si quedó lista.
export async function connectDrawer(): Promise<boolean> {
  if (!drawerSupported()) return false
  try {
    const port = await getPort(true)
    if (!port) return false
    try { localStorage.setItem(LS_KEY, '1') } catch { /* almacenamiento no disponible */ }
    return true
  } catch {
    return false
  }
}

export function unlinkDrawer(): void {
  cachedPort = null
  try { localStorage.removeItem(LS_KEY) } catch { /* ignore */ }
}

export type DrawerResult = 'ok' | 'unsupported' | 'no-device' | 'error'

// Envía el pulso de apertura al cajón. `interactive` permite pedir el puerto la
// primera vez (requiere gesto del usuario, p. ej. un clic en "Abrir cajón").
export async function openCashDrawer(interactive = false): Promise<DrawerResult> {
  if (!drawerSupported()) return 'unsupported'
  try {
    const port = await getPort(interactive)
    if (!port) return 'no-device'
    if (!port.writable) await port.open({ baudRate: 9600 })
    const writer = port.writable.getWriter()
    try {
      await writer.write(KICK)
    } finally {
      writer.releaseLock()
    }
    try { localStorage.setItem(LS_KEY, '1') } catch { /* ignore */ }
    return 'ok'
  } catch {
    return 'error'
  }
}

// Mensaje amable para mostrar según el resultado.
export function drawerMessage(r: DrawerResult): { tone: 'success' | 'info' | 'error'; text: string } {
  switch (r) {
    case 'ok': return { tone: 'success', text: 'Cajón abierto 💵' }
    case 'unsupported': return { tone: 'info', text: 'Este dispositivo no soporta cajón (usa el PC con Chrome/Edge).' }
    case 'no-device': return { tone: 'info', text: 'No hay impresora/cajón vinculado. Conéctalo en Ajustes.' }
    default: return { tone: 'error', text: 'No se pudo abrir el cajón. Revisa la conexión.' }
  }
}
