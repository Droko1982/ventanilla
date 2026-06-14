import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useSession } from '@/store/session'
import { AppLayout } from '@/components/AppLayout'
import { ToastContainer } from '@/components/Toast'
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
const Reportes = lazy(() => import('@/screens/Reportes'))
const Notificaciones = lazy(() => import('@/screens/Notificaciones'))
const Ajustes = lazy(() => import('@/screens/Ajustes'))
const Auditoria = lazy(() => import('@/screens/Auditoria'))
const SuperAdmin = lazy(() => import('@/screens/SuperAdmin'))

export default function App() {
  const role = useSession((s) => s.role)

  return (
    <>
      <ToastContainer />
      <Suspense fallback={<Spinner label="Cargando…" />}>
        {!role ? (
          <Login />
        ) : role === 'superadmin' ? (
          <SuperAdmin />
        ) : (
          <AppLayout>
            <Routes>
              <Route path="/" element={role === 'empleado' ? <POS /> : <Dashboard />} />
              <Route path="/pos" element={<POS />} />
              <Route path="/inventario" element={<Inventory />} />
              <Route path="/caja" element={<Caja />} />
              <Route path="/mas" element={<Mas />} />
              <Route path="/proveedores" element={<Proveedores />} />
              <Route path="/clientes" element={<Clientes />} />
              <Route path="/ventas" element={<Ventas />} />
            <Route path="/documentos" element={<Documentos />} />
            <Route path="/compras" element={<Compras />} />
            <Route path="/reporte-inventario" element={<ReporteInventario />} />
            <Route path="/informe-z" element={<InformeZ />} />
            <Route path="/cartera" element={<Cartera />} />
              <Route path="/reportes" element={<Reportes />} />
              <Route path="/notificaciones" element={<Notificaciones />} />
              <Route path="/ajustes" element={<Ajustes />} />
              <Route path="/auditoria" element={<Auditoria />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppLayout>
        )}
      </Suspense>
    </>
  )
}
