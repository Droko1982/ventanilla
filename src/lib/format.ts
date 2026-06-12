// Utilidades de fecha/hora en español (Colombia).

const dateFmt = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const timeFmt = new Intl.DateTimeFormat('es-CO', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

const dateTimeFmt = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

export function fmtDate(iso: string | Date): string {
  return dateFmt.format(new Date(iso))
}

export function fmtTime(iso: string | Date): string {
  return timeFmt.format(new Date(iso))
}

export function fmtDateTime(iso: string | Date): string {
  return dateTimeFmt.format(new Date(iso))
}

/** "hace 5 min", "hace 2 h", "ayer" — para listas y auditoría. */
export function timeAgo(iso: string | Date): string {
  const d = new Date(iso).getTime()
  const diff = Date.now() - d
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const days = Math.floor(h / 24)
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  return fmtDate(iso)
}

/** Inicio del día actual en ISO (para filtros "ventas de hoy"). */
export function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function daysUntil(iso: string): number {
  const d = new Date(iso).getTime()
  return Math.ceil((d - Date.now()) / 86400000)
}
