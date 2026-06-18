import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { useScopeLocationIds, useCustomers } from '@/hooks/data'
import { abonarRemision, payCredit, runFiadoReminders } from '@/data/repo'
import { isCloudConfigured } from '@/data/api'
import { Sheet } from '@/components/Sheet'
import { Segmented, EmptyState, PageHeader, StatCard, Money } from '@/components/ui'
import { toast } from '@/components/Toast'
import { cop, parseCop } from '@/lib/money'
import { fmtDate, daysUntil } from '@/lib/format'
import { waLink } from '@/lib/whatsapp'
import { Icon } from '@/components/icons'
import { useSession } from '@/store/session'
import type { Remision } from '@/types'

export default function Cartera() {
  const tenantId = useSession((s) => s.tenantId)!
  const scopeIds = useScopeLocationIds()
  const customers = useCustomers()
  const [tab, setTab] = useState<'todas' | 'atrasadas'>('todas')
  const [abono, setAbono] = useState<Remision | null>(null)

  const remisiones = useLiveQuery(
    () => (scopeIds.length ? db.remisiones.where('locationId').anyOf(scopeIds).toArray() : []),
    [scopeIds.join(',')],
  )

  const creditRems = useMemo(() => {
    const list = (remisiones ?? [])
      .filter((r) => r.onCredit && r.status !== 'anulada' && r.total - (r.abonado ?? 0) > 0)
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    if (tab === 'atrasadas') return list.filter((r) => r.dueDate && daysUntil(r.dueDate) < 0)
    return list
  }, [remisiones, tab])

  const fiadoClientes = useMemo(() => (customers ?? []).filter((c) => c.creditBalance > 0).sort((a, b) => b.creditBalance - a.creditBalance), [customers])

  const totalRem = creditRems.reduce((s, r) => s + (r.total - (r.abonado ?? 0)), 0)
  const totalFiado = fiadoClientes.reduce((s, c) => s + c.creditBalance, 0)

  return (
    <div>
      <PageHeader help="fiado" title="Cartera" subtitle="Cuentas por cobrar (crédito y fiado)" />

      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <StatCard label="Remisiones a crédito" value={<Money value={totalRem} />} accent="text-rose-600" />
        <StatCard label="Fiado de clientes" value={<Money value={totalFiado} />} accent="text-rose-600" />
      </div>

      {/* Remisiones a crédito */}
      <p className="mb-2 text-sm font-semibold text-slate-600">Remisiones a crédito</p>
      <div className="mb-3">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'todas', label: 'Todas' }, { value: 'atrasadas', label: 'Atrasadas' }]} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-2 py-2 text-left">Cliente</th>
              <th className="px-2 py-2 text-left">Vence</th>
              <th className="px-2 py-2 text-right">Total</th>
              <th className="px-2 py-2 text-right">Abonado</th>
              <th className="px-2 py-2 text-right">Resta</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {creditRems.map((r) => {
              const resta = r.total - (r.abonado ?? 0)
              const atraso = r.dueDate ? -daysUntil(r.dueDate) : null
              return (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5">
                    <p className="line-clamp-1 font-medium text-slate-700">{r.customerName}</p>
                    <p className="text-[10px] text-slate-400">{r.number}</p>
                  </td>
                  <td className="px-2 py-1.5">
                    {r.dueDate ? <span className={atraso! > 0 ? 'text-rose-600' : 'text-slate-500'}>{fmtDate(r.dueDate)}{atraso! > 0 ? ` · +${atraso}d` : ''}</span> : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right text-slate-500">{cop(r.total)}</td>
                  <td className="px-2 py-1.5 text-right text-emerald-600">{cop(r.abonado ?? 0)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-rose-600">{cop(resta)}</td>
                  <td className="px-1"><button onClick={() => setAbono(r)} className="text-brand-600">Abonar</button></td>
                </tr>
              )
            })}
            {creditRems.length === 0 && <tr><td colSpan={6} className="px-3 py-5 text-center text-slate-400">Sin remisiones a crédito.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Fiado de clientes */}
      <div className="mb-2 mt-5 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-600">Fiado por cliente</p>
        {fiadoClientes.length > 0 && (
          <button
            onClick={async () => {
              if (!isCloudConfigured()) return toast('info', 'Conecta la nube + WhatsApp en Ajustes para enviar a todos. O usa "recordar" de cada cliente.')
              const n = await runFiadoReminders(tenantId)
              toast(n > 0 ? 'success' : 'info', n > 0 ? `Recordatorio enviado a ${n} cliente(s)` : 'Nadie por recordar ahora')
            }}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            📲 Recordar a todos
          </button>
        )}
      </div>
      <div className="space-y-2">
        {fiadoClientes.map((c) => {
          const dias = c.creditSince ? Math.floor((Date.now() - new Date(c.creditSince).getTime()) / 86400000) : null
          return (
          <div key={c.id} className="card flex items-center gap-3 p-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-100 font-bold text-rose-700">{c.name.slice(0, 1)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-700">{c.name}</p>
              <div className="flex items-center gap-2">
                {dias !== null && <span className={`text-xs ${dias >= 15 ? 'text-rose-500 font-semibold' : 'text-slate-400'}`}>debe hace {dias} día(s)</span>}
                {c.phone && (
                  <a href={waLink(c.phone, `Hola ${c.name}, recuerda tu saldo de ${cop(c.creditBalance)}. ¡Gracias!`)} target="_blank" rel="noreferrer" className="text-xs text-emerald-600">
                    <Icon name="whatsapp" className="mr-0.5 inline h-3 w-3" /> recordar
                  </a>
                )}
              </div>
            </div>
            <span className="font-bold text-rose-600">{cop(c.creditBalance)}</span>
            <button
              onClick={async () => {
                const a = prompt(`Abono de ${c.name} (saldo ${cop(c.creditBalance)}):`)
                if (a === null) return
                const amt = parseCop(a)
                if (amt <= 0) return toast('error', 'Monto inválido')
                if (amt > c.creditBalance) return toast('error', 'El abono supera el saldo')
                await payCredit(c.id, amt); toast('success', 'Abono registrado')
              }}
              className="btn btn-success px-3 py-2 text-xs"
            >
              Abonar
            </button>
          </div>
          )
        })}
        {fiadoClientes.length === 0 && <EmptyState emoji="✅" title="Sin fiado pendiente" />}
      </div>

      {abono && (
        <Sheet open onClose={() => setAbono(null)} title={`Abono · ${abono.number}`}>
          <AbonoForm
            resta={abono.total - (abono.abonado ?? 0)}
            onApply={async (amount) => { await abonarRemision(abono.id, amount); toast('success', 'Abono registrado'); setAbono(null) }}
          />
        </Sheet>
      )}
    </div>
  )
}

function AbonoForm({ resta, onApply }: { resta: number; onApply: (amount: number) => void }) {
  const [v, setV] = useState('')
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-rose-50 p-3 text-center">
        <p className="text-sm text-rose-600">Saldo pendiente</p>
        <p className="text-2xl font-extrabold text-rose-700">{cop(resta)}</p>
      </div>
      <input autoFocus className="input text-center text-xl font-bold" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} placeholder="$ 0" />
      <button
        className="btn btn-success w-full"
        onClick={() => {
          const amt = parseCop(v)
          if (amt <= 0) return toast('error', 'Monto inválido')
          if (amt > resta) return toast('error', 'El abono supera el saldo')
          onApply(amt)
        }}
      >
        Registrar abono
      </button>
    </div>
  )
}
