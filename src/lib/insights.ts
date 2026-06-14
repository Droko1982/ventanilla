import type { Sale } from '@/types'

// Asistente de insights: consejos en lenguaje simple a partir de los datos de la
// tienda. Todo es por reglas (sin servicios externos), rápido y offline.

export interface Insight {
  icon: string
  text: string
  tone: 'good' | 'warn' | 'info'
  to?: string // ruta opcional a la que lleva el consejo
}

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export function buildInsights(args: {
  sales: Sale[]
  topName?: string
  delta: number | null
  lowStock: number
  expiring: number
  deadStock: number
}): Insight[] {
  const { sales, topName, delta, lowStock, expiring, deadStock } = args
  const out: Insight[] = []
  const completed = sales.filter((s) => s.status === 'completada')

  // Tendencia vs período anterior
  if (delta !== null) {
    if (delta >= 5) out.push({ icon: '📈', text: `Vas ${delta}% arriba que el período pasado. ¡Bien hecho!`, tone: 'good' })
    else if (delta <= -5) out.push({ icon: '📉', text: `Vas ${Math.abs(delta)}% por debajo del período pasado. Empújale hoy.`, tone: 'warn' })
  }

  // Mejor día de la semana (por ingreso promedio)
  if (completed.length >= 7) {
    const sum = new Array(7).fill(0)
    const cnt = new Array(7).fill(0)
    for (const s of completed) {
      const d = new Date(s.createdAt).getDay()
      sum[d] += s.total
      cnt[d] += 1
    }
    let best = -1
    let bestAvg = -1
    for (let i = 0; i < 7; i++) {
      const avg = cnt[i] ? sum[i] / cnt[i] : 0
      if (avg > bestAvg) { bestAvg = avg; best = i }
    }
    if (best >= 0 && bestAvg > 0) out.push({ icon: '🗓️', text: `Tu mejor día suele ser el ${DAYS[best]}. Asegura el surtido ese día.`, tone: 'info' })
  }

  // Hora pico
  if (completed.length >= 8) {
    const byHour = new Array(24).fill(0)
    for (const s of completed) byHour[new Date(s.createdAt).getHours()] += 1
    let bh = 0
    for (let i = 1; i < 24; i++) if (byHour[i] > byHour[bh]) bh = i
    if (byHour[bh] > 0) out.push({ icon: '⏰', text: `Tu hora pico es cerca de las ${bh}:00. Ten caja y vitrina listas.`, tone: 'info' })
  }

  if (topName) out.push({ icon: '⭐', text: `Tu producto estrella: ${topName}. No lo dejes agotar.`, tone: 'good' })
  if (lowStock > 0) out.push({ icon: '📦', text: `${lowStock} producto(s) por agotarse. Conviene reabastecer.`, tone: 'warn', to: '/proveedores' })
  if (expiring > 0) out.push({ icon: '⏳', text: `${expiring} producto(s) están por vencer. Rebájalos o retíralos.`, tone: 'warn', to: '/ajustes-inventario' })
  if (deadStock > 0) out.push({ icon: '🐌', text: `${deadStock} producto(s) no se venden hace un mes. Prueba una promo.`, tone: 'info', to: '/reportes' })

  if (out.length === 0) out.push({ icon: '👋', text: 'Registra ventas y aquí te daré consejos para vender más.', tone: 'info' })
  return out
}
