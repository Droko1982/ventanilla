// Sincroniza el carrito del POS con la "pantalla del cliente" (2º monitor).
// Usa BroadcastChannel entre ventanas del mismo origen, con respaldo en
// localStorage (evento 'storage') por si el navegador no soporta el canal.

export interface CartLineView {
  name: string
  emoji?: string
  qty: number
  unit: string
  lineTotal: number
}
export interface CartView {
  lines: CartLineView[]
  total: number
  businessName: string
  at: number
}

const CH = 'ventanilla-customer-screen'
const LS = 'ventanilla-customer-screen-state'

let channel: BroadcastChannel | null = null
function getChannel(): BroadcastChannel | null {
  if (channel) return channel
  try { channel = new BroadcastChannel(CH) } catch { channel = null }
  return channel
}

export function publishCartView(view: CartView): void {
  try { localStorage.setItem(LS, JSON.stringify(view)) } catch { /* ignore */ }
  try { getChannel()?.postMessage(view) } catch { /* ignore */ }
}

export function subscribeCartView(cb: (v: CartView) => void): () => void {
  // Estado inicial (por si la pantalla se abre con el carrito ya armado)
  try {
    const s = localStorage.getItem(LS)
    if (s) cb(JSON.parse(s))
  } catch { /* ignore */ }

  let bc: BroadcastChannel | null = null
  try {
    bc = new BroadcastChannel(CH)
    bc.onmessage = (e) => cb(e.data as CartView)
  } catch { /* ignore */ }

  const onStorage = (e: StorageEvent) => {
    if (e.key === LS && e.newValue) {
      try { cb(JSON.parse(e.newValue)) } catch { /* ignore */ }
    }
  }
  window.addEventListener('storage', onStorage)

  return () => {
    try { bc?.close() } catch { /* ignore */ }
    window.removeEventListener('storage', onStorage)
  }
}
