import { useUnreadNotifications } from '@/hooks/data'
import { db } from '@/data/db'
import { EmptyState, PageHeader } from '@/components/ui'
import { timeAgo } from '@/lib/format'
import { toast } from '@/components/Toast'
import type { NotificationType } from '@/types'

const typeMeta: Record<NotificationType, { emoji: string; color: string }> = {
  stock: { emoji: '📦', color: 'bg-amber-100 text-amber-700' },
  vencimiento: { emoji: '⏳', color: 'bg-rose-100 text-rose-700' },
  caja: { emoji: '💵', color: 'bg-emerald-100 text-emerald-700' },
  dian: { emoji: '🧾', color: 'bg-blue-100 text-blue-700' },
  fraude: { emoji: '🚨', color: 'bg-purple-100 text-purple-700' },
}

// Centro de notificaciones: reúne todas las alertas del negocio.
export default function Notificaciones() {
  const notifs = useUnreadNotifications()
  const unread = (notifs ?? []).filter((n) => !n.read)

  async function markAll() {
    for (const n of unread) await db.notifications.update(n.id, { read: true })
    toast('success', 'Todo marcado como leído')
  }

  return (
    <div>
      <PageHeader help="mas"
        title="Notificaciones"
        subtitle="Stock, vencimientos, caja y DIAN en un solo lugar"
        right={
          unread.length > 0 ? (
            <button onClick={markAll} className="btn btn-secondary px-3 py-2 text-sm">
              Marcar leídas
            </button>
          ) : undefined
        }
      />

      {(notifs?.length ?? 0) === 0 ? (
        <EmptyState emoji="🔔" title="Todo en orden" hint="No hay alertas pendientes." />
      ) : (
        <div className="space-y-2">
          {notifs?.map((n) => {
            const meta = typeMeta[n.type]
            return (
              <button
                key={n.id}
                onClick={() => db.notifications.update(n.id, { read: true })}
                className={`card flex w-full items-start gap-3 p-3 text-left ${n.read ? 'opacity-60' : ''}`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${meta.color}`}>
                  {meta.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-700">{n.title}</p>
                    {!n.read && <span className="h-2 w-2 rounded-full bg-rose-500" />}
                  </div>
                  <p className="text-sm text-slate-500">{n.message}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{timeAgo(n.createdAt)}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
