import { useEffect } from 'react'

// Teclado numérico para PIN: funciona con el MOUSE (botones en pantalla) y con
// el TECLADO físico (dígitos agregan, Backspace borra). Tono 'brand' para fondo
// oscuro (login) y 'light' para hojas con fondo claro.
export function PinPad({
  pin, onDigit, onBack, onCancel, length = 4, tone = 'brand', label, hint,
}: {
  pin: string
  onDigit: (d: string) => void
  onBack: () => void
  onCancel?: () => void
  length?: number
  tone?: 'brand' | 'light'
  label?: string
  hint?: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') { e.preventDefault(); onDigit(e.key) }
      else if (e.key === 'Backspace') { e.preventDefault(); onBack() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const dark = tone === 'brand'
  const dotBorder = dark ? 'border-white/60' : 'border-slate-300'
  const dotFill = dark ? 'bg-white' : 'bg-brand-600'
  const btn = dark
    ? 'bg-white/15 text-white backdrop-blur active:bg-white/30'
    : 'bg-slate-100 text-slate-800 active:bg-slate-200'
  const muted = dark ? 'text-brand-200' : 'text-slate-400'

  return (
    <div className="mx-auto w-full max-w-xs">
      {label && <p className={`mb-1 text-center text-sm ${dark ? 'text-brand-100' : 'text-slate-600'}`}>{label}</p>}
      {hint && <p className={`mb-3 text-center text-xs ${muted}`}>{hint}</p>}
      <div className="mb-6 flex justify-center gap-3">
        {Array.from({ length }).map((_, i) => (
          <div key={i} className={`h-4 w-4 rounded-full border-2 ${dotBorder} ${pin.length > i ? dotFill : ''}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
          <button key={n} type="button" onClick={() => onDigit(n)} className={`aspect-square rounded-2xl text-2xl font-semibold ${btn}`}>{n}</button>
        ))}
        <button type="button" onClick={onCancel} className={`aspect-square rounded-2xl text-sm ${muted}`}>{onCancel ? 'Cancelar' : ''}</button>
        <button type="button" onClick={() => onDigit('0')} className={`aspect-square rounded-2xl text-2xl font-semibold ${btn}`}>0</button>
        <button type="button" onClick={onBack} className={`aspect-square rounded-2xl text-2xl ${muted}`}>⌫</button>
      </div>
    </div>
  )
}
