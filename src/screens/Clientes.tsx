import { useState } from 'react'
import { useCustomers } from '@/hooks/data'
import { db } from '@/data/db'
import { payCredit } from '@/data/repo'
import { Sheet } from '@/components/Sheet'
import { EmptyState, PageHeader, Money } from '@/components/ui'
import { Icon } from '@/components/icons'
import { toast } from '@/components/Toast'
import { cop, parseCop } from '@/lib/money'
import { waLink } from '@/lib/whatsapp'
import { uid } from '@/lib/id'
import { useSession } from '@/store/session'
import type { Customer } from '@/types'

// Clientes + fiado (crédito). Muy usado en tiendas de barrio colombianas.
export default function Clientes() {
  const tenantId = useSession((s) => s.tenantId)!
  const customers = useCustomers()
  const [detail, setDetail] = useState<Customer | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const totalFiado = (customers ?? []).reduce((s, c) => s + c.creditBalance, 0)
  const sorted = [...(customers ?? [])].sort((a, b) => b.creditBalance - a.creditBalance)

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Fiado, historial y abonos"
        right={
          <button onClick={() => setAddOpen(true)} className="btn btn-primary px-3 py-2 text-sm">
            <Icon name="plus" className="h-5 w-5" /> Cliente
          </button>
        }
      />

      <div className="card mb-4 flex items-center justify-between p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Total en fiado</p>
          <p className="text-2xl font-bold text-rose-600"><Money value={totalFiado} /></p>
        </div>
        <span className="text-3xl">📒</span>
      </div>

      <div className="space-y-2">
        {sorted.map((c) => (
          <button key={c.id} onClick={() => setDetail(c)} className="card flex w-full items-center gap-3 p-3 text-left">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">
              {c.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-700">{c.name}</p>
              <p className="text-xs text-slate-400">Compras: {cop(c.totalSpent)}</p>
            </div>
            {c.creditBalance > 0 ? (
              <span className="chip bg-rose-100 text-rose-700">Debe {cop(c.creditBalance)}</span>
            ) : (
              <span className="chip bg-emerald-100 text-emerald-700">Al día</span>
            )}
          </button>
        ))}
        {sorted.length === 0 && <EmptyState emoji="🧍" title="Sin clientes" hint="Agrega clientes para llevar el fiado." />}
      </div>

      {detail && <CustomerDetail customer={detail} onClose={() => setDetail(null)} />}
      {addOpen && <CustomerForm tenantId={tenantId} onClose={() => setAddOpen(false)} />}
    </div>
  )
}

function CustomerDetail({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [abono, setAbono] = useState('')
  const reminder = `Hola ${customer.name}, te recordamos tu saldo pendiente de ${cop(customer.creditBalance)}. ¡Gracias!`
  return (
    <Sheet open onClose={onClose} title={customer.name}>
      <div className="space-y-4">
        <div className="rounded-2xl bg-rose-50 p-4 text-center">
          <p className="text-sm text-rose-600">Saldo en fiado</p>
          <p className="text-3xl font-extrabold text-rose-700">{cop(customer.creditBalance)}</p>
        </div>
        <div className="space-y-1 text-sm text-slate-500">
          {customer.phone && <p>📲 {customer.phone}</p>}
          {customer.idNumber && <p>🪪 {customer.idNumber}</p>}
          <p>🛒 Total comprado: {cop(customer.totalSpent)}</p>
        </div>

        {customer.creditBalance > 0 && (
          <>
            <div>
              <label className="label">Registrar abono</label>
              <div className="flex gap-2">
                <input className="input" inputMode="numeric" value={abono} onChange={(e) => setAbono(e.target.value)} placeholder="$ 0" />
                <button
                  className="btn btn-primary px-4"
                  onClick={async () => {
                    await payCredit(customer.id, parseCop(abono))
                    toast('success', 'Abono registrado')
                    onClose()
                  }}
                >
                  Abonar
                </button>
              </div>
            </div>
            {customer.phone && (
              <a href={waLink(customer.phone, reminder)} target="_blank" rel="noreferrer" className="btn btn-success w-full">
                <Icon name="whatsapp" className="h-5 w-5" /> Recordar por WhatsApp
              </a>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}

function CustomerForm({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [idNumber, setId] = useState('')
  return (
    <Sheet
      open
      onClose={onClose}
      title="Nuevo cliente"
      footer={
        <button
          className="btn btn-primary btn-lg w-full"
          onClick={async () => {
            if (!name.trim()) return toast('error', 'Ponle nombre al cliente')
            await db.customers.put({
              id: uid('cl'), tenantId, name: name.trim(), phone, idNumber,
              creditBalance: 0, totalSpent: 0, points: 0, createdAt: new Date().toISOString(),
            })
            toast('success', 'Cliente creado')
            onClose()
          }}
        >
          Crear cliente
        </button>
      }
    >
      <div className="space-y-3">
        <div><label className="label">Nombre</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label">Celular</label><input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="3001234567" /></div>
        <div><label className="label">Cédula / NIT (opcional)</label><input className="input" value={idNumber} onChange={(e) => setId(e.target.value)} /></div>
      </div>
    </Sheet>
  )
}
