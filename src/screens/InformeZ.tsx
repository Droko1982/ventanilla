import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { useActiveLocationId, useCurrentUser, useScopeLocationIds, useTenant, useLocations } from '@/hooks/data'
import { generateZReport } from '@/data/repo'
import { Sheet } from '@/components/Sheet'
import { EmptyState, PageHeader, StatCard, Money } from '@/components/ui'
import { Icon } from '@/components/icons'
import { toast } from '@/components/Toast'
import { cop } from '@/lib/money'
import { fmtDate, fmtDateTime } from '@/lib/format'
import { useSession } from '@/store/session'
import type { ZReport } from '@/types'

const methodLabels: Record<string, string> = { efectivo: 'Efectivo', nequi: 'Nequi', daviplata: 'Daviplata', tarjeta: 'Tarjeta', transferencia: 'Transferencia', otro: 'Otro', fiado: 'Fiado' }
const docLabels: Record<string, string> = { tiquete_pos: 'Tiquete POS', factura: 'Factura', nota_credito: 'Nota crédito' }

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function InformeZ() {
  const tenantId = useSession((s) => s.tenantId)!
  const locationId = useActiveLocationId()
  const user = useCurrentUser()
  const scopeIds = useScopeLocationIds()
  const [date, setDate] = useState(today())
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState<ZReport | null>(null)

  const reports = useLiveQuery(
    () => (scopeIds.length ? db.zReports.where('locationId').anyOf(scopeIds).reverse().toArray() : []),
    [scopeIds.join(',')],
  )

  async function gen(cumulative: boolean) {
    if (!locationId) return
    setBusy(true)
    try {
      const z = await generateZReport(tenantId, locationId, date, cumulative, user!.id, user!.name)
      toast('success', `Informe ${z.number} generado`)
      setDetail(z)
    } finally { setBusy(false) }
  }

  if (!locationId) return <EmptyState emoji="🏪" title="Sin local" hint="Selecciona un local arriba." />

  return (
    <div>
      <PageHeader help="caja" title="Informe Z" subtitle="Cierre fiscal diario (Zetas)" />

      <div className="card mb-4 p-4">
        <label className="label">Fecha del informe</label>
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => gen(false)} disabled={busy} className="btn btn-primary">Generar Z (ese día)</button>
          <button onClick={() => gen(true)} disabled={busy} className="btn btn-secondary">Z hasta hoy</button>
        </div>
      </div>

      <p className="mb-2 text-sm font-semibold text-slate-600">Informes generados</p>
      <div className="space-y-2">
        {reports?.map((z) => (
          <button key={z.id} onClick={() => setDetail(z)} className="card flex w-full items-center gap-3 p-3 text-left">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">Z</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-700">{z.number} · {fmtDate(z.date)}{z.cumulative ? ' (acum.)' : ''}</p>
              <p className="text-xs text-slate-400">{z.count} ventas · {fmtDateTime(z.generatedAt)}</p>
            </div>
            <span className="font-bold text-slate-700">{cop(z.revenue)}</span>
          </button>
        ))}
        {(reports?.length ?? 0) === 0 && <EmptyState emoji="🧾" title="Sin informes" hint="Genera el cierre Z del día." />}
      </div>

      {detail && <ZDetail z={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

function ZDetail({ z, onClose }: { z: ZReport; onClose: () => void }) {
  const tenant = useTenant()
  const locations = useLocations()
  const location = locations?.find((l) => l.id === z.locationId)

  function print() {
    const rows = (s: Record<string, number>, labels: Record<string, string>) =>
      Object.entries(s).map(([k, v]) => `<div class="row"><span>${labels[k] ?? k}</span><span>${cop(v)}</span></div>`).join('')
    const ivas = z.ivaByRate.map((l) => `<div class="row"><span>${l.kind === 'inc' ? 'INC' : 'IVA'} ${l.rate}%</span><span>${cop(l.iva)}</span></div>`).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${z.number}</title>
      <style>*{font-family:'Courier New',monospace}body{width:300px;margin:0 auto;padding:10px}h2{text-align:center;margin:4px 0}.c{text-align:center;font-size:12px}hr{border:none;border-top:1px dashed #000;margin:6px 0}.row{display:flex;justify-content:space-between;font-size:12px}.tot{display:flex;justify-content:space-between;font-size:15px;font-weight:bold}</style>
      </head><body>
      <h2>${tenant?.businessName ?? ''}</h2>
      <div class="c">${location?.name ?? ''}<br>NIT ${tenant?.nit ?? ''}</div>
      <hr><div class="c"><b>INFORME Z ${z.number}</b><br>${fmtDate(z.date)}${z.cumulative ? ' (acumulado)' : ''}<br>Generado ${fmtDateTime(z.generatedAt)}</div><hr>
      <div class="row"><span>No. ventas</span><span>${z.count}</span></div>
      <div class="row"><span>Descuentos</span><span>${cop(z.discounts)}</span></div>
      <div class="row"><span>Devoluciones/anuladas</span><span>${z.returnsCount}</span></div>
      <hr><div class="c">POR MÉTODO</div>${rows(z.byMethod, methodLabels)}
      <hr><div class="c">POR DOCUMENTO</div>${rows(z.byDocType, docLabels)}
      <hr><div class="row"><span>Base gravable</span><span>${cop(z.base)}</span></div>${ivas}
      <div class="tot"><span>TOTAL</span><span>${cop(z.revenue)}</span></div>
      <hr><div class="c">Documento fiscal · Ventanilla</div></body></html>`
    const w = window.open('', '_blank', 'width=340,height=640')
    if (!w) return
    w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 300)
  }

  return (
    <Sheet open onClose={onClose} title={`Informe ${z.number}`} footer={<button onClick={print} className="btn btn-primary btn-lg w-full"><Icon name="print" className="h-5 w-5" /> Imprimir Z</button>}>
      <div className="space-y-4">
        <p className="text-center text-sm text-slate-500">{fmtDate(z.date)}{z.cumulative ? ' (acumulado hasta el día)' : ''}</p>
        <div className="grid grid-cols-2 gap-2.5">
          <StatCard label="Ventas" value={z.count} />
          <StatCard label="Total" value={<Money value={z.revenue} />} accent="text-brand-700" />
          <StatCard label="Base gravable" value={<Money value={z.base} />} />
          <StatCard label="IVA" value={<Money value={z.iva} />} />
        </div>
        <Section title="Por método de pago">
          {Object.entries(z.byMethod).map(([m, v]) => <Row key={m} label={methodLabels[m] ?? m} value={cop(v)} />)}
        </Section>
        <Section title="Por documento">
          {Object.entries(z.byDocType).map(([d, v]) => <Row key={d} label={docLabels[d] ?? d} value={cop(v)} />)}
        </Section>
        {z.ivaByRate.length > 0 && (
          <Section title="Impuestos discriminados">
            {z.ivaByRate.map((l) => <Row key={`${l.kind ?? 'iva'}-${l.rate}`} label={`${l.kind === 'inc' ? 'INC' : 'IVA'} ${l.rate}% (base ${cop(l.base)})`} value={cop(l.iva)} />)}
          </Section>
        )}
        <div className="flex justify-between text-sm text-slate-500">
          <span>Descuentos {cop(z.discounts)}</span>
          <span>Devoluciones/anuladas: {z.returnsCount}</span>
        </div>
      </div>
    </Sheet>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-sm"><span className="text-slate-600">{label}</span><span className="font-semibold text-slate-700">{value}</span></div>
}
