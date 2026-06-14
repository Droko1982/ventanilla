import { useNavigate } from 'react-router-dom'
import { Icon } from '@/components/icons'
import { PageHeader } from '@/components/ui'

// Menú "Más": accesos a las secciones que no caben en la barra inferior.
export default function Mas() {
  const navigate = useNavigate()
  const items: { to: string; icon: any; label: string; desc: string; color: string }[] = [
    { to: '/ventas', icon: 'doc', label: 'Ventas y DIAN', desc: 'Historial, documentos POS, pendientes', color: 'bg-blue-100 text-blue-700' },
    { to: '/documentos', icon: 'tag', label: 'Facturas y remisiones', desc: 'Factura electrónica y notas de entrega', color: 'bg-indigo-100 text-indigo-700' },
    { to: '/eventos-recepcion', icon: 'doc', label: 'Eventos Recepción (DIAN)', desc: 'Acuse, recibo del bien y aceptación de compras', color: 'bg-indigo-100 text-indigo-700' },
    { to: '/reportes', icon: 'chart', label: 'Reportes', desc: 'Márgenes, más/menos vendidos, stock muerto', color: 'bg-emerald-100 text-emerald-700' },
    { to: '/proveedores', icon: 'truck', label: 'Proveedores', desc: 'Reabastecer, pedidos, directorio, deuda', color: 'bg-amber-100 text-amber-700' },
    { to: '/compras', icon: 'box', label: 'Compras', desc: 'Facturas de compra, costo promedio, entradas', color: 'bg-purple-100 text-purple-700' },
    { to: '/reporte-inventario', icon: 'chart', label: 'Inventario General', desc: 'Reporte: costo prom., utilidad %, stock sugerido', color: 'bg-teal-100 text-teal-700' },
    { to: '/ajustes-inventario', icon: 'box', label: 'Ajustes de inventario', desc: 'Entradas/salidas, precio, sección, vencimientos', color: 'bg-teal-100 text-teal-700' },
    { to: '/clientes', icon: 'users', label: 'Clientes / Fiado', desc: 'Crédito, historial, abonos', color: 'bg-rose-100 text-rose-700' },
    { to: '/cartera', icon: 'doc', label: 'Cartera', desc: 'Cuentas por cobrar: crédito y fiado, abonos', color: 'bg-rose-100 text-rose-700' },
    { to: '/domicilios', icon: 'truck', label: 'Domicilios', desc: 'Entregas: estado, repartidor, mapa, WhatsApp', color: 'bg-orange-100 text-orange-700' },
    { to: '/informe-z', icon: 'doc', label: 'Informe Z (fiscal)', desc: 'Cierre fiscal diario · Zetas', color: 'bg-blue-100 text-blue-700' },
    { to: '/notificaciones', icon: 'bell', label: 'Notificaciones', desc: 'Alertas de stock, vencimientos, caja', color: 'bg-purple-100 text-purple-700' },
    { to: '/auditoria', icon: 'shield', label: 'Auditoría', desc: 'Quién hizo o cambió cada cosa', color: 'bg-slate-200 text-slate-700' },
    { to: '/ajustes', icon: 'gear', label: 'Ajustes', desc: 'Locales, empleados, DIAN, plan', color: 'bg-slate-100 text-slate-600' },
  ]
  return (
    <div>
      <PageHeader title="Más" subtitle="Todas las herramientas de tu negocio" />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {items.map((it) => (
          <button
            key={it.to}
            onClick={() => navigate(it.to)}
            className="card flex items-center gap-3 p-4 text-left active:scale-[0.99]"
          >
            <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${it.color}`}>
              <Icon name={it.icon} className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-700">{it.label}</p>
              <p className="truncate text-xs text-slate-400">{it.desc}</p>
            </div>
            <Icon name="arrow-left" className="h-5 w-5 rotate-180 text-slate-300" />
          </button>
        ))}
      </div>
    </div>
  )
}
