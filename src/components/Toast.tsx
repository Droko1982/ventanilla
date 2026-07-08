import { create } from 'zustand'

// Notificaciones efímeras tipo "toast" (confirmaciones simples en español).
type ToastKind = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

interface ToastStore {
  items: ToastItem[]
  push: (kind: ToastKind, message: string) => void
  remove: (id: number) => void
}

let seq = 1
export const useToastStore = create<ToastStore>((set) => ({
  items: [],
  push: (kind, message) => {
    const id = seq++
    set((s) => ({ items: [...s.items, { id, kind, message }] }))
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), 2600)
  },
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}))

export function toast(kind: ToastKind, message: string) {
  useToastStore.getState().push(kind, message)
}

const styles: Record<ToastKind, string> = {
  success: 'bg-emerald-600',
  error: 'bg-rose-600',
  info: 'bg-slate-800',
}
const icons: Record<ToastKind, string> = { success: '✓', error: '✕', info: 'ℹ' }

export function ToastContainer() {
  const items = useToastStore((s) => s.items)
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          className={`${styles[t.kind]} animate-slide-up flex max-w-md items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg`}
        >
          <span className="text-base">{icons[t.kind]}</span>
          {t.message}
        </div>
      ))}
    </div>
  )
}
