import { useState } from 'react'
import { useSession } from '@/store/session'
import { toast } from '@/components/Toast'
import { Icon } from '@/components/icons'
import { PinPad } from '@/components/PinPad'
import { superAdminLogin, getApiUrl } from '@/data/api'

// Backend de producción (por si el build no trae VITE_API_URL configurada).
const PROD_API = 'https://ventanilla-api-vvzh.onrender.com'

// Pantalla de entrada del demo: elegir rol con un toque. Pensada para que
// cualquier persona entienda en segundos qué puede probar.
export default function Login() {
  const loginAs = useSession((s) => s.loginAs)
  const loginByPin = useSession((s) => s.loginEmployeeByPin)
  const loginSuperAdmin = useSession((s) => s.loginSuperAdmin)
  const [mode, setMode] = useState<'menu' | 'pin' | 'super'>('menu')
  const [pin, setPin] = useState('')
  const [saEmail, setSaEmail] = useState('')
  const [saPass, setSaPass] = useState('')
  const [saBusy, setSaBusy] = useState(false)

  // Super-Admin de la plataforma: SOLO entra con el correo y la clave reales,
  // validados contra el backend. El demo no lo permite (no tiene credenciales).
  async function submitSuper() {
    if (!saEmail.trim() || !saPass) return toast('error', 'Ingresa el correo y la clave')
    setSaBusy(true)
    try {
      await superAdminLogin(getApiUrl() || PROD_API, saEmail.trim(), saPass)
      loginSuperAdmin()
      toast('success', 'Bienvenido, Super-Admin')
    } catch (e) {
      toast('error', (e as Error).message || 'Acceso denegado')
    } finally {
      setSaBusy(false)
    }
  }

  async function submitPin(next: string) {
    if (next.length < 4) {
      setPin(next)
      return
    }
    const user = await loginByPin(next)
    if (user) {
      toast('success', `Hola, ${user.name.split(' ')[0]}`)
    } else {
      toast('error', 'PIN incorrecto')
      setPin('')
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-brand-700 to-brand-900 px-5 py-10 text-white">
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
          <Icon name="building" className="h-9 w-9" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Ventanilla</h1>
        <p className="mt-1 max-w-xs text-sm text-brand-100">
          Ventas, inventario y caja para tu tienda. Funciona sin internet.
        </p>
      </div>

      {mode === 'menu' ? (
        <div className="w-full max-w-sm space-y-3">
          <p className="text-center text-xs uppercase tracking-widest text-brand-200">
            Entrar al demo como…
          </p>
          <button
            onClick={() => loginAs('u_admin')}
            className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left text-slate-800 shadow-lg active:scale-[0.99]"
          >
            <span className="text-3xl">🧑‍💼</span>
            <span className="flex-1">
              <span className="block font-bold">Dueño de la tienda</span>
              <span className="block text-sm text-slate-500">
                Dashboard, todos los locales, reportes
              </span>
            </span>
            <Icon name="arrow-left" className="h-5 w-5 rotate-180 text-slate-300" />
          </button>

          <button
            onClick={() => setMode('pin')}
            className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left text-slate-800 shadow-lg active:scale-[0.99]"
          >
            <span className="text-3xl">🧑‍🦰</span>
            <span className="flex-1">
              <span className="block font-bold">Cajero / Empleado</span>
              <span className="block text-sm text-slate-500">Vender con PIN · sólo su local</span>
            </span>
            <Icon name="arrow-left" className="h-5 w-5 rotate-180 text-slate-300" />
          </button>

          <button
            onClick={() => setMode('super')}
            className="flex w-full items-center gap-3 rounded-2xl bg-white/10 p-4 text-left text-white backdrop-blur active:scale-[0.99]"
          >
            <span className="text-3xl">🛡️</span>
            <span className="flex-1">
              <span className="block font-bold">Super-Admin (plataforma)</span>
              <span className="block text-sm text-brand-100">
                Solo el dueño de la plataforma · requiere clave
              </span>
            </span>
            <Icon name="arrow-left" className="h-5 w-5 rotate-180 text-brand-200" />
          </button>

          <p className="pt-4 text-center text-xs text-brand-200">
            Es un demo: los datos son de ejemplo y viven en tu dispositivo.
          </p>
        </div>
      ) : mode === 'super' ? (
        <div className="w-full max-w-sm space-y-3">
          <p className="text-center text-sm font-semibold text-brand-100">🛡️ Acceso Super-Admin de la plataforma</p>
          <input
            value={saEmail}
            onChange={(e) => setSaEmail(e.target.value)}
            placeholder="Correo"
            autoComplete="username"
            inputMode="email"
            className="w-full rounded-2xl bg-white/15 px-4 py-3 text-white placeholder:text-brand-200 outline-none backdrop-blur"
          />
          <input
            value={saPass}
            onChange={(e) => setSaPass(e.target.value)}
            type="password"
            placeholder="Clave"
            autoComplete="current-password"
            onKeyDown={(e) => e.key === 'Enter' && submitSuper()}
            className="w-full rounded-2xl bg-white/15 px-4 py-3 text-white placeholder:text-brand-200 outline-none backdrop-blur"
          />
          <button onClick={submitSuper} disabled={saBusy} className="w-full rounded-2xl bg-white py-3 font-bold text-brand-700 shadow-lg active:scale-[0.99] disabled:opacity-60">
            {saBusy ? 'Verificando…' : 'Entrar'}
          </button>
          <button onClick={() => { setMode('menu'); setSaEmail(''); setSaPass('') }} className="w-full text-center text-sm text-brand-200">
            Cancelar
          </button>
          <p className="pt-2 text-center text-xs text-brand-200">
            Solo para el dueño de la plataforma. El demo no tiene acceso aquí.
          </p>
        </div>
      ) : (
        <PinPad
          pin={pin}
          tone="brand"
          label="Ingresa tu PIN de 4 dígitos"
          hint="Demo: Centro 1234 · Norte 2345 · Pereira 3456"
          onDigit={(d) => submitPin(pin + d)}
          onBack={() => setPin(pin.slice(0, -1))}
          onCancel={() => {
            setMode('menu')
            setPin('')
          }}
        />
      )}
    </div>
  )
}

