import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCustomers } from '@/hooks/data'
import { db } from '@/data/db'
import { payCredit } from '@/data/repo'
import { Sheet } from '@/components/Sheet'
import { EmptyState, PageHeader, Money } from '@/components/ui'
import { Icon } from '@/components/icons'
import { toast } from '@/components/Toast'
import { cop, parseCop } from '@/lib/money'
import { fmtDate } from '@/lib/format'
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
  const [importOpen, setImportOpen] = useState(false)

  const totalFiado = (customers ?? []).reduce((s, c) => s + c.creditBalance, 0)
  const sorted = [...(customers ?? [])].sort((a, b) => b.creditBalance - a.creditBalance)

  return (
    <div>
      <PageHeader help="fiado"
        title="Clientes"
        subtitle="Fiado, historial y abonos"
        right={
          <div className="flex gap-2">
            <button onClick={() => setImportOpen(true)} className="btn btn-secondary px-3 py-2 text-sm">
              <Icon name="doc" className="h-5 w-5" /> Importar
            </button>
            <button onClick={() => setAddOpen(true)} className="btn btn-primary px-3 py-2 text-sm">
              <Icon name="plus" className="h-5 w-5" /> Cliente
            </button>
          </div>
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
      {importOpen && <ImportClientsSheet tenantId={tenantId} onClose={() => setImportOpen(false)} />}
    </div>
  )
}

// --- Importar clientes desde CSV -------------------------------------------
function ImportClientsSheet({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const [preview, setPreview] = useState<string[][]>([])
  const [count, setCount] = useState(0)

  function parseCSV(text: string): string[][] {
    const rows: string[][] = []
    for (const raw of text.split(/\r?\n/)) {
      if (!raw.trim()) continue
      const cells: string[] = []
      let cur = '', inQ = false
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i]
        if (inQ) {
          if (ch === '"') { if (raw[i + 1] === '"') { cur += '"'; i++ } else inQ = false }
          else cur += ch
        } else if (ch === '"') inQ = true
        else if (ch === ',' || ch === ';') { cells.push(cur.trim()); cur = '' }
        else cur += ch
      }
      cells.push(cur.trim())
      rows.push(cells)
    }
    return rows
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { const rows = parseCSV(reader.result as string); setPreview(rows.slice(0, 6)); setCount(Math.max(0, rows.length - 1)) }
    reader.readAsText(file)
  }
  async function doImport() {
    const fileInput = document.getElementById('csv-clients') as HTMLInputElement
    const file = fileInput?.files?.[0]
    if (!file) return
    const rows = parseCSV(await file.text())
    let imported = 0
    for (const r of rows.slice(1)) {
      const [name, idNumber, phone, address, barrio, city] = r
      if (!name) continue
      await db.customers.put({
        id: uid('cl'), tenantId, name,
        idNumber: idNumber || undefined, phone: phone || undefined,
        address: address || undefined, barrio: barrio || undefined, city: city || undefined,
        creditBalance: 0, totalSpent: 0, points: 0, createdAt: new Date().toISOString(),
      })
      imported++
    }
    toast('success', `${imported} clientes importados`)
    onClose()
  }
  const template = 'nombre,identificacion,celular,direccion,barrio,ciudad\nDoña Rosa,41234567,3001112233,Cra 14 #5-20,La Patria,Armenia'
  const templateUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(template)

  return (
    <Sheet open onClose={onClose} title="Importar clientes"
      footer={<button className="btn btn-primary btn-lg w-full" disabled={!count} onClick={doImport}>Importar {count} clientes</button>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Sube un <b>CSV</b> con columnas: nombre, identificación, celular, dirección, barrio, ciudad.</p>
        <a href={templateUrl} download="plantilla-clientes.csv" className="btn btn-secondary w-full text-sm">⬇️ Descargar plantilla</a>
        <label className="btn btn-primary w-full cursor-pointer">
          📂 Elegir archivo CSV
          <input id="csv-clients" type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
        </label>
        {preview.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs">
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className={i === 0 ? 'bg-slate-100 font-semibold' : ''}>
                    {row.slice(0, 4).map((cell, j) => <td key={j} className="border-b border-slate-100 px-2 py-1">{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Sheet>
  )
}

function CustomerDetail({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [abono, setAbono] = useState('')
  const reminder = `Hola ${customer.name}, te recordamos tu saldo pendiente de ${cop(customer.creditBalance)}. ¡Gracias!`

  // Analítica del cliente: nº de compras, ticket promedio y última compra
  const sales = useLiveQuery(
    () => db.sales.filter((s) => s.customerId === customer.id).toArray(),
    [customer.id],
  )
  const stats = useMemo(() => {
    const done = (sales ?? []).filter((s) => s.status === 'completada')
    const n = done.length
    const sum = done.reduce((s, x) => s + x.total, 0)
    const last = done.reduce<string | undefined>((acc, s) => (!acc || s.createdAt > acc ? s.createdAt : acc), undefined)
    const avg = n > 0 ? Math.round(sum / n) : 0
    return { n, avg, last }
  }, [sales])

  return (
    <Sheet open onClose={onClose} title={customer.name}>
      <div className="space-y-4">
        <div className="rounded-2xl bg-rose-50 p-4 text-center">
          <p className="text-sm text-rose-600">Saldo en fiado</p>
          <p className="text-3xl font-extrabold text-rose-700">{cop(customer.creditBalance)}</p>
        </div>

        {/* Cuánto compra este cliente */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 p-2.5">
            <p className="text-lg font-bold text-slate-700">{cop(customer.totalSpent)}</p>
            <p className="text-[11px] text-slate-400">Total comprado</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-2.5">
            <p className="text-lg font-bold text-slate-700">{stats.n}</p>
            <p className="text-[11px] text-slate-400">Compras</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-2.5">
            <p className="text-lg font-bold text-slate-700">{cop(stats.avg)}</p>
            <p className="text-[11px] text-slate-400">Promedio/compra</p>
          </div>
        </div>
        <div className="space-y-1 text-sm text-slate-500">
          {customer.phone && <p>📲 {customer.phone}</p>}
          {customer.idNumber && <p>🪪 {customer.idNumber}</p>}
          {(customer.points ?? 0) > 0 && <p>⭐ Puntos de fidelización: {customer.points}</p>}
          {stats.last && <p>🕒 Última compra: {fmtDate(stats.last)}</p>}
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
                    const amt = parseCop(abono)
                    if (amt <= 0) return toast('error', 'Escribe un monto válido')
                    if (amt > customer.creditBalance) return toast('error', `El abono supera el saldo (${cop(customer.creditBalance)})`)
                    await payCredit(customer.id, amt)
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
  const [nombreComercial, setNombreComercial] = useState('')
  const [phone, setPhone] = useState('')
  const [idNumber, setId] = useState('')
  const [address, setAddress] = useState('')
  const [barrio, setBarrio] = useState('')
  const [city, setCity] = useState('')
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
              id: uid('cl'), tenantId, name: name.trim(),
              nombreComercial: nombreComercial.trim() || undefined,
              phone, idNumber,
              address: address.trim() || undefined,
              barrio: barrio.trim() || undefined,
              city: city.trim() || undefined,
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
        <div><label className="label">Nombre comercial (opcional)</label><input className="input" value={nombreComercial} onChange={(e) => setNombreComercial(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">Celular</label><input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="3001234567" /></div>
          <div><label className="label">Cédula / NIT</label><input className="input" value={idNumber} onChange={(e) => setId(e.target.value)} /></div>
        </div>
        <div><label className="label">Dirección</label><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">Barrio</label><input className="input" value={barrio} onChange={(e) => setBarrio(e.target.value)} /></div>
          <div><label className="label">Ciudad</label><input className="input" value={city} onChange={(e) => setCity(e.target.value)} /></div>
        </div>
      </div>
    </Sheet>
  )
}
