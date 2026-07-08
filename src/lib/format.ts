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

// Interpreta una cadena "YYYY-MM-DD" (solo fecha, ej. vencimiento o fecha de
// pago) como fecha LOCAL de Colombia y no como UTC. Si trae hora (timestamp
// completo) o ya es Date, se usa tal cual. Evita que un vencimiento se muestre
// (o se cuente como atrasado) un día antes por la diferencia horaria (UTC-5).
export function toLocalDate(iso: string | Date): Date {
  if (iso instanceof Date) return iso
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return new Date(iso)
}

export function fmtDate(iso: string | Date): string {
  return dateFmt.format(toLocalDate(iso))
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

// Días calendario (en hora local) entre hoy y la fecha dada. Positivo = futuro,
// 0 = hoy, negativo = atrasado. Compara días calendario, no milisegundos, para
// que "vence hoy" sea 0 y no dependa de la hora ni de la zona horaria.
export function daysUntil(iso: string): number {
  const target = toLocalDate(iso)
  target.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}
