import { useState } from 'react'
import { useSession } from '@/store/session'
import { toast } from '@/components/Toast'
import { Icon } from '@/components/icons'

// Pantalla de entrada del demo: elegir rol con un toque. Pensada para que
// cualquier persona entienda en segundos qué puede probar.
export default function Login() {
  const loginAs = useSession((s) => s.loginAs)
  const loginByPin = useSession((s) => s.loginEmployeeByPin)
  const [mode, setMode] = useState<'menu' | 'pin'>('menu')
  const [pin, setPin] = useState('')

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
            onClick={() => loginAs('u_super')}
            className="flex w-full items-center gap-3 rounded-2xl bg-white/10 p-4 text-left text-white backdrop-blur active:scale-[0.99]"
          >
            <span className="text-3xl">🛡️</span>
            <span className="flex-1">
              <span className="block font-bold">Super-Admin (plataforma)</span>
              <span className="block text-sm text-brand-100">
                Ver clientes, activar/suspender, cobro
              </span>
            </span>
            <Icon name="arrow-left" className="h-5 w-5 rotate-180 text-brand-200" />
          </button>

          <p className="pt-4 text-center text-xs text-brand-200">
            Es un demo: los datos son de ejemplo y viven en tu dispositivo.
          </p>
        </div>
      ) : (
        <PinPad
          pin={pin}
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

function PinPad({
  pin,
  onDigit,
  onBack,
  onCancel,
}: {
  pin: string
  onDigit: (d: string) => void
  onBack: () => void
  onCancel: () => void
}) {
  return (
    <div className="w-full max-w-xs">
      <p className="mb-1 text-center text-sm text-brand-100">Ingresa tu PIN de 4 dígitos</p>
      <p className="mb-4 text-center text-xs text-brand-200">
        Demo: Centro 1234 · Norte 2345 · Pereira 3456
      </p>
      <div className="mb-6 flex justify-center gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full border-2 border-white/60 ${
              pin.length > i ? 'bg-white' : ''
            }`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
          <button
            key={n}
            onClick={() => onDigit(n)}
            className="aspect-square rounded-2xl bg-white/15 text-2xl font-semibold backdrop-blur active:bg-white/30"
          >
            {n}
          </button>
        ))}
        <button onClick={onCancel} className="aspect-square rounded-2xl text-sm text-brand-200">
          Cancelar
        </button>
        <button
          onClick={() => onDigit('0')}
          className="aspect-square rounded-2xl bg-white/15 text-2xl font-semibold backdrop-blur active:bg-white/30"
        >
          0
        </button>
        <button onClick={onBack} className="aspect-square rounded-2xl text-2xl text-brand-100">
          ⌫
        </button>
      </div>
    </div>
  )
}
