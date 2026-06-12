import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { useScopeLocationIds, useLocations } from '@/hooks/data'
import { EmptyState, PageHeader } from '@/components/ui'
import { Icon } from '@/components/icons'
import { fmtDateTime } from '@/lib/format'
import { useSession } from '@/store/session'

// Registro de auditoría: quién hizo o modificó cada cosa y cuándo.
// Sirve para que nadie tape un faltante editando una venta.
export default function Auditoria() {
  const tenantId = useSession((s) => s.tenantId)!
  const scopeIds = useScopeLocationIds()
  const locations = useLocations()
  const locName = new Map((locations ?? []).map((l) => [l.id, l.name]))

  const logs = useLiveQuery(async () => {
    const all = await db.auditLogs.where('tenantId').equals(tenantId).reverse().toArray()
    return all.filter((l) => !l.locationId || scopeIds.includes(l.locationId)).slice(0, 200)
  }, [tenantId, scopeIds.join(',')])

  return (
    <div>
      <PageHeader title="Auditoría" subtitle="Cada acción sensible queda firmada" />
      {(logs?.length ?? 0) === 0 ? (
        <EmptyState emoji="🛡️" title="Sin movimientos aún" hint="Aquí se registra quién hace o cambia cada cosa." />
      ) : (
        <div className="space-y-2">
          {logs?.map((l) => (
            <div key={l.id} className="card flex items-start gap-3 p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <Icon name="shield" className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-700">
                  <b>{l.userName}</b> {l.action}
                </p>
                <p className="text-xs text-slate-500">{l.detail}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {fmtDateTime(l.createdAt)}
                  {l.locationId && ` · ${locName.get(l.locationId) ?? ''}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
