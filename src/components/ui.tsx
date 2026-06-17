import { type ReactNode } from 'react'
import { cop } from '@/lib/money'

// Primitivas de interfaz reutilizables (tarjetas, chips, estados vacíos).

export function StatCard({
  label,
  value,
  sub,
  accent = 'text-slate-800',
  icon,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  accent?: string
  icon?: ReactNode
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        {icon && <div className="text-brand-500">{icon}</div>}
      </div>
      <p className={`mt-1 text-2xl font-bold ${accent}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  )
}

export function Money({ value, className = '' }: { value: number; className?: string }) {
  return <span className={className}>{cop(value)}</span>
}

// Miniatura del producto: muestra la foto si existe; si no, el ícono.
export function ProductThumb({
  photo,
  emoji,
  size = 48,
}: {
  photo?: string
  emoji?: string
  size?: number
}) {
  const style = { width: size, height: size }
  if (photo) {
    return <img src={photo} alt="" style={style} className="shrink-0 rounded-xl object-cover" />
  }
  return (
    <span
      style={{ ...style, fontSize: size * 0.55 }}
      className="flex shrink-0 items-center justify-center rounded-xl bg-slate-50"
    >
      {emoji ?? '📦'}
    </span>
  )
}

export function EmptyState({
  emoji = '📭',
  title,
  hint,
  action,
}: {
  emoji?: string
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="text-5xl">{emoji}</div>
      <p className="font-semibold text-slate-700">{title}</p>
      {hint && <p className="max-w-xs text-sm text-slate-400">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-400">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-500" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
            value === o.value ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  right,
  help,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
  /** Ancla del manual (ayuda.html#ancla) → muestra un botón "?" de ayuda de la sección. */
  help?: string
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {right}
        {help && (
          <a
            href={`${import.meta.env.BASE_URL}ayuda.html#${help}`}
            target="_blank"
            rel="noreferrer"
            title="Ayuda de esta sección"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-base font-bold text-slate-500 hover:bg-slate-200"
          >
            ?
          </a>
        )}
      </div>
    </div>
  )
}

// Chip de estado DIAN
export function DianChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    enviado: 'bg-emerald-100 text-emerald-700',
    pendiente: 'bg-amber-100 text-amber-700',
    error: 'bg-rose-100 text-rose-700',
    no_requiere: 'bg-slate-100 text-slate-500',
  }
  const label: Record<string, string> = {
    enviado: 'DIAN ✓',
    pendiente: 'DIAN pendiente',
    error: 'DIAN error',
    no_requiere: 'Sin DIAN',
  }
  return <span className={`chip ${map[status] || map.no_requiere}`}>{label[status] || status}</span>
}
