/**
 * Ventanilla — Plataforma SaaS de ventas e inventario.
 * Desarrollada por el Dr. Mauricio Rodríguez Herrera.
 * © Dr. Mauricio Rodríguez Herrera. Todos los derechos reservados.
 */
import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useSession } from '@/store/session'
import { getToken, getRole } from '@/data/api'
import { AppLayout } from '@/components/AppLayout'
import { ToastContainer } from '@/components/Toast'
import { UpdateBanner } from '@/components/UpdateBanner'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Spinner } from '@/components/ui'

// El POS y el Login se cargan de una vez (lo primero que usa un cajero).
import Login from '@/screens/Login'
import POS from '@/screens/POS'

// El resto se carga sólo cuando se entra (más liviano en celular).
const Dashboard = lazy(() => import('@/screens/Dashboard'))
const Inventory = lazy(() => import('@/screens/Inventory'))
const Caja = lazy(() => import('@/screens/Caja'))
const Mas = lazy(() => import('@/screens/Mas'))
const Proveedores = lazy(() => import('@/screens/Proveedores'))
const Clientes = lazy(() => import('@/screens/Clientes'))
const Ventas = lazy(() => import('@/screens/Ventas'))
const Documentos = lazy(() => import('@/screens/Documentos'))
const Compras = lazy(() => import('@/screens/Compras'))
const ReporteInventario = lazy(() => import('@/screens/ReporteInventario'))
const InformeZ = lazy(() => import('@/screens/InformeZ'))
const Cartera = lazy(() => import('@/screens/Cartera'))
const AjustesInventario = lazy(() => import('@/screens/AjustesInventario'))
const EventosRecepcion = lazy(() => import('@/screens/EventosRecepcion'))
const Domicilios = lazy(() => import('@/screens/Domicilios'))
const Tienda = lazy(() => import('@/screens/Tienda'))
const PantallaCliente = lazy(() => import('@/screens/PantallaCliente'))
const Autoservicio = lazy(() => import('@/screens/Autoservicio'))
const Ventanillas = lazy(() => import('@/screens/Ventanillas'))
const Reportes = lazy(() => import('@/screens/Reportes'))
const Notificaciones = lazy(() => import('@/screens/Notificaciones'))
const Ajustes = lazy(() => import('@/screens/Ajustes'))
const Auditoria = lazy(() => import('@/screens/Auditoria'))
const SuperAdmin = lazy(() => import('@/screens/SuperAdmin'))

// Guard de ruta: solo el DUEÑO (admin) entra. Un empleado que escriba la URL de
// una pantalla sensible es redirigido al POS. Defensa además del ocultar enlaces.
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const role = useSession((s) => s.role)
  if (role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const role = useSession((s) => s.role)
  const { pathname } = useLocation()

  // Catálogo público de la tienda (sin login): link para compartir con clientes.
  if (pathname === '/tienda') {
    return (
      <>
        <ToastContainer />
        <Suspense fallback={<Spinner label="Cargando…" />}>
          <Tienda />
        </Suspense>
      </>
    )
  }

  // Pantalla del cliente (2º monitor): muestra en vivo lo que se va vendiendo.
  if (pathname === '/pantalla') {
    return (
      <Suspense fallback={<Spinner label="Cargando…" />}>
        <PantallaCliente />
      </Suspense>
    )
  }

  // Autoservicio (kiosco): se monta SIN la barra de navegación, para que el
  // cliente no pueda salir al POS/Caja del dueño sin el PIN de salida.
  if (pathname === '/autoservicio' && role && role !== 'superadmin') {
    return (
      <>
        <ToastContainer />
        <ErrorBoundary>
          <Suspense fallback={<Spinner label="Cargando…" />}>
            <Autoservicio />
          </Suspense>
        </ErrorBoundary>
      </>
    )
  }

  return (
    <>
      <ToastContainer />
      <UpdateBanner />
      <ErrorBoundary>
      <Suspense fallback={<Spinner label="Cargando…" />}>
        {!role ? (
          <Login />
        ) : role === 'superadmin' ? (
          // Defensa en profundidad: la consola solo se muestra si además hay un
          // token de super-admin real (de superAdminLogin). Sin él (p. ej. si se
          // manipuló la sesión local), se exige volver a autenticarse.
          getToken() && getRole() === 'superadmin' ? <SuperAdmin /> : <Login />
        ) : (
          <AppLayout>
            <ErrorBoundary key={pathname}>
            <Routes>
              {/* Accesibles para cajero y dueño */}
              <Route path="/" element={<POS />} />
              <Route path="/pos" element={<POS />} />
              <Route path="/inventario" element={<Inventory />} />
              <Route path="/caja" element={<Caja />} />
              <Route path="/mas" element={<Mas />} />
              <Route path="/domicilios" element={<Domicilios />} />
              <Route path="/notificaciones" element={<Notificaciones />} />
              {/* SOLO DUEÑO: reportes, dinero, configuración y datos sensibles.
                  El guard evita que un empleado entre escribiendo la URL/hash. */}
              <Route path="/resumen" element={<RequireAdmin><Dashboard /></RequireAdmin>} />
              <Route path="/ventanillas" element={<RequireAdmin><Ventanillas /></RequireAdmin>} />
              <Route path="/proveedores" element={<RequireAdmin><Proveedores /></RequireAdmin>} />
              <Route path="/clientes" element={<RequireAdmin><Clientes /></RequireAdmin>} />
              <Route path="/ventas" element={<RequireAdmin><Ventas /></RequireAdmin>} />
              <Route path="/documentos" element={<RequireAdmin><Documentos /></RequireAdmin>} />
              <Route path="/compras" element={<RequireAdmin><Compras /></RequireAdmin>} />
              <Route path="/reporte-inventario" element={<RequireAdmin><ReporteInventario /></RequireAdmin>} />
              <Route path="/informe-z" element={<RequireAdmin><InformeZ /></RequireAdmin>} />
              <Route path="/cartera" element={<RequireAdmin><Cartera /></RequireAdmin>} />
              <Route path="/ajustes-inventario" element={<RequireAdmin><AjustesInventario /></RequireAdmin>} />
              <Route path="/eventos-recepcion" element={<RequireAdmin><EventosRecepcion /></RequireAdmin>} />
              <Route path="/reportes" element={<RequireAdmin><Reportes /></RequireAdmin>} />
              <Route path="/ajustes" element={<RequireAdmin><Ajustes /></RequireAdmin>} />
              <Route path="/auditoria" element={<RequireAdmin><Auditoria /></RequireAdmin>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </ErrorBoundary>
          </AppLayout>
        )}
      </Suspense>
      </ErrorBoundary>
    </>
  )
}
