import { type ReactNode, useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Icon } from './icons'
import { Sheet } from './Sheet'
import { useOnline } from '@/hooks/useOnline'
import { useInstallPrompt } from '@/hooks/useInstall'
import { useSession } from '@/store/session'
import {
  useCurrentUser,
  useTenant,
  useLocations,
  useUnreadNotifications,
} from '@/hooks/data'
import { resetDemo } from '@/data/seed'
import { getTheme, toggleTheme } from '@/lib/theme'
import { registerDevice } from '@/lib/device'
import { requestMonthlyCheckout } from '@/data/repo'
import { isCloudConfigured } from '@/data/api'
import { db } from '@/data/db'
import { daysUntil } from '@/lib/format'
import { toast } from './Toast'

// Barra superior: marca + selector de local + estado de red + campana + perfil.
function TopBar() {
  const online = useOnline()
  const user = useCurrentUser()
  const tenant = useTenant()
  const locations = useLocations()
  const role = useSession((s) => s.role)
  const filter = useSession((s) => s.locationFilter)
  const setFilter = useSession((s) => s.setLocationFilter)
  const logout = useSession((s) => s.logout)
  const notifs = useUnreadNotifications()
  const unread = (notifs ?? []).filter((n) => !n.read).length
  const navigate = useNavigate()
  const { canInstall, promptInstall } = useInstallPrompt()
  const [menu, setMenu] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [dark, setDark] = useState(getTheme() === 'dark')
  const [pinOpen, setPinOpen] = useState(false)

  const currentLocName =
    role === 'empleado'
      ? locations?.find((l) => l.id === user?.locationId)?.name
      : filter === 'all'
        ? 'Todos los locales'
        : locations?.find((l) => l.id === filter)?.name

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
          <Icon name="building" className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight text-slate-800">
            {tenant?.businessName ?? 'Ventanilla'}
          </p>
          {role === 'empleado' ? (
            <p className="truncate text-xs text-slate-500">{currentLocName}</p>
          ) : (
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="-ml-1 max-w-[12rem] truncate bg-transparent text-xs text-slate-500 outline-none"
            >
              <option value="all">Todos los locales</option>
              {locations?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Estado de red bien visible (online/offline) */}
        <span
          className={`chip ${online ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
          title={online ? 'Conectado' : 'Sin internet — sigue vendiendo, se sincroniza después'}
        >
          {online ? (
            <>● En línea</>
          ) : (
            <>
              <Icon name="wifi-off" className="h-3.5 w-3.5" /> Offline
            </>
          )}
        </span>

        <button
          onClick={() => navigate('/notificaciones')}
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
          aria-label="Notificaciones"
        >
          <Icon name="bell" className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {unread}
            </span>
          )}
        </button>

        <button
          onClick={() => setMenu(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700"
          aria-label="Perfil"
        >
          {(user?.name ?? '?').slice(0, 1)}
        </button>
      </div>

      <Sheet open={menu} onClose={() => setMenu(false)} title="Cuenta">
        <div className="space-y-1">
          <p className="text-lg font-bold text-slate-800">{user?.name}</p>
          <p className="text-sm text-slate-500">
            {role === 'admin' ? 'Administrador / Dueño' : role === 'empleado' ? 'Empleado / Cajero' : 'Super-Admin'}
          </p>
          <p className="text-sm text-slate-500">{tenant?.businessName}</p>
        </div>
        <div className="mt-5 space-y-2">
          <button
            className="btn btn-secondary w-full"
            onClick={async () => {
              if (canInstall) await promptInstall()
              else toast('info', 'En el navegador: menú ⋮ → "Instalar app" o "Agregar a pantalla de inicio"')
              setMenu(false)
            }}
          >
            📲 Instalar app en el celular
          </button>
          <button
            className="btn btn-secondary w-full"
            onClick={() => { const t = toggleTheme(); setDark(t === 'dark') }}
          >
            {dark ? '☀️ Modo claro' : '🌙 Modo oscuro'}
          </button>
          <button className="btn btn-secondary w-full" onClick={() => { setMenu(false); setPinOpen(true) }}>
            🔑 Cambiar mi PIN
          </button>
          {role === 'admin' && (
            <button className="btn btn-secondary w-full" onClick={() => { setMenu(false); navigate('/ajustes') }}>
              ⚙️ Ajustes / Configuración
            </button>
          )}
          <a
            href="https://wa.me/573147555896?text=Hola%2C%20necesito%20soporte%20de%20Ventanilla"
            target="_blank"
            rel="noreferrer"
            className="btn btn-success w-full"
          >
            💬 Soporte por WhatsApp
          </a>
          {!isCloudConfigured() && (
            <button
              className="btn btn-secondary w-full"
              disabled={resetting}
              onClick={async () => {
                setResetting(true)
                await resetDemo()
                toast('success', 'Demo reiniciado con datos nuevos')
                setResetting(false)
                setMenu(false)
              }}
            >
              {resetting ? 'Reiniciando…' : '↺ Reiniciar datos del demo'}
            </button>
          )}
          <button
            className="btn btn-danger w-full"
            onClick={() => {
              logout()
              setMenu(false)
              navigate('/')
            }}
          >
            <Icon name="logout" className="h-5 w-5" /> Salir
          </button>
        </div>
      </Sheet>

      {pinOpen && user && <ChangePinSheet user={user} onClose={() => setPinOpen(false)} />}
    </header>
  )
}

// Cambiar el PIN del usuario actual (cajero o dueño).
function ChangePinSheet({ user, onClose }: { user: { id: string; name: string }; onClose: () => void }) {
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  return (
    <Sheet
      open onClose={onClose} title="Cambiar mi PIN"
      footer={
        <button
          className="btn btn-primary btn-lg w-full"
          onClick={async () => {
            if (pin.length !== 4) return toast('error', 'El PIN debe tener 4 dígitos')
            if (pin !== confirm) return toast('error', 'Los PIN no coinciden')
            await db.users.update(user.id, { pin })
            toast('success', 'PIN actualizado')
            onClose()
          }}
        >
          Guardar PIN
        </button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Elige un PIN de 4 dígitos para {user.name}.</p>
        <div>
          <label className="label">Nuevo PIN</label>
          <input className="input text-center text-2xl tracking-widest" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" />
        </div>
        <div>
          <label className="label">Confírmalo</label>
          <input className="input text-center text-2xl tracking-widest" inputMode="numeric" maxLength={4} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" />
        </div>
      </div>
    </Sheet>
  )
}

// Barra inferior de navegación (cambia según el rol).
function BottomNav() {
  const role = useSession((s) => s.role)
  const notifs = useUnreadNotifications()
  const unread = (notifs ?? []).filter((n) => !n.read).length

  const adminItems = [
    { to: '/', icon: 'cart', label: 'Vender', end: true },
    { to: '/resumen', icon: 'home', label: 'Resumen' },
    { to: '/inventario', icon: 'box', label: 'Inventario' },
    { to: '/caja', icon: 'cash', label: 'Caja' },
    { to: '/mas', icon: 'grid', label: 'Más' },
  ] as const

  const empItems = [
    { to: '/pos', icon: 'cart', label: 'Vender', end: true },
    { to: '/inventario', icon: 'box', label: 'Inventario' },
    { to: '/caja', icon: 'cash', label: 'Caja' },
    { to: '/notificaciones', icon: 'bell', label: 'Alertas', badge: unread },
  ] as const

  const items = role === 'empleado' ? empItems : adminItems

  return (
    <nav className="sticky bottom-0 z-30 border-t border-slate-200 bg-white/95 shadow-[0_-4px_20px_rgba(15,23,42,0.10)] backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-stretch justify-around gap-1 p-1.5">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={'end' in it ? it.end : false}
            className={({ isActive }) =>
              `relative flex flex-1 flex-col items-center gap-1 rounded-2xl py-2.5 text-xs font-semibold transition ${
                isActive ? 'bg-brand-100 text-brand-700' : 'text-slate-400'
              }`
            }
          >
            <Icon name={it.icon as any} className="h-7 w-7" />
            {it.label}
            {'badge' in it && it.badge ? (
              <span className="absolute right-1/4 top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {it.badge}
              </span>
            ) : null}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

// Control de licencia: registra el dispositivo y bloquea si la cuenta está
// suspendida, vencida (renta no pagada) o si se superó el cupo de dispositivos.
function LicenseBlocked({ reason }: { reason: 'device' | 'suspended' | 'overdue' }) {
  const tenant = useTenant()
  const logout = useSession((s) => s.logout)
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const wa = `https://wa.me/573147555896?text=${encodeURIComponent(`Hola, soy ${tenant?.businessName ?? 'un cliente'} y necesito reactivar mi licencia de Ventanilla.`)}`

  async function pay() {
    setBusy(true)
    const r = await requestMonthlyCheckout()
    setBusy(false)
    if (r?.url) window.open(r.url, '_blank')
    else toast('info', 'Conecta la nube (Ajustes) para pagar en línea, o contacta a la plataforma.')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-900 px-6 text-center text-white">
      <div className="text-5xl">🔒</div>
      <h1 className="text-2xl font-extrabold">
        {reason === 'device' ? 'Dispositivo no autorizado' : reason === 'overdue' ? 'Renta vencida' : 'Licencia inactiva'}
      </h1>
      <p className="max-w-sm text-sm text-slate-300">
        {reason === 'device'
          ? 'Se alcanzó el número de dispositivos de tu licencia. Pide a la plataforma ampliar el cupo o libera otro dispositivo.'
          : reason === 'overdue'
            ? 'Tu mensualidad está vencida. Paga para seguir vendiendo.'
            : 'Tu cuenta está suspendida. Reactívala con la plataforma para seguir vendiendo.'}
      </p>
      {reason !== 'device' && (
        <button onClick={pay} disabled={busy} className="btn btn-primary w-full max-w-xs">
          {busy ? 'Generando pago…' : '💳 Pagar mensualidad'}
        </button>
      )}
      <a href={wa} target="_blank" rel="noreferrer" className="btn btn-success w-full max-w-xs">
        <Icon name="whatsapp" className="h-5 w-5" /> Contactar a la plataforma
      </a>
      <button onClick={() => { logout(); navigate('/') }} className="text-sm text-slate-400 underline">Cambiar de usuario</button>
    </div>
  )
}

const LICENSE_GRACE_DAYS = 5

export function AppLayout({ children }: { children: ReactNode }) {
  const tenant = useTenant()
  const role = useSession((s) => s.role)
  const [deviceBlocked, setDeviceBlocked] = useState(false)

  useEffect(() => {
    if (!tenant || role === 'superadmin') return
    registerDevice(tenant).then((r) => setDeviceBlocked(!r.allowed)).catch(() => {})
  }, [tenant, role])

  // Si la sesión de nube expira (token vencido), avisar al usuario para que
  // vuelva a conectarse desde Ajustes. El trabajo local sigue intacto.
  useEffect(() => {
    const onExpired = () => toast('error', 'Tu sesión en la nube expiró. Vuelve a conectarte en Ajustes → Nube.')
    window.addEventListener('ventanilla:auth-expired', onExpired)
    return () => window.removeEventListener('ventanilla:auth-expired', onExpired)
  }, [])

  let reason: 'device' | 'suspended' | 'overdue' | null = null
  if (tenant && role !== 'superadmin') {
    if (deviceBlocked) reason = 'device'
    else if (tenant.status === 'suspendido') reason = 'suspended'
    else if (daysUntil(tenant.paidUntil) < -LICENSE_GRACE_DAYS) reason = 'overdue'
  }
  if (reason) return <LicenseBlocked reason={reason} />

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <TopBar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-3 py-4">{children}</main>
      <BottomNav />
    </div>
  )
}
