// Modo claro / oscuro. Guarda la preferencia y aplica la clase `dark` en <html>.
export type Theme = 'light' | 'dark'
const KEY = 'ventanilla-theme'

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    if (t === 'dark' || t === 'light') return t
  } catch { /* sin almacenamiento */ }
  try {
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
  } catch { /* sin matchMedia */ }
  return 'light'
}

export function applyTheme(t: Theme): void {
  const el = document.documentElement
  if (t === 'dark') el.classList.add('dark')
  else el.classList.remove('dark')
}

export function setTheme(t: Theme): void {
  try { localStorage.setItem(KEY, t) } catch { /* ignore */ }
  applyTheme(t)
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}

export function initTheme(): void {
  applyTheme(getTheme())
}
