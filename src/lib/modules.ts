// Módulos opcionales que el dueño puede activar/ocultar según lo que use su
// negocio. Todo está ACTIVO por defecto (no rompe nada existente); ocultar solo
// los quita del menú, no borra datos, y se pueden reactivar cuando se quiera.

export interface ModuleDef { key: string; label: string; group: string }

export const MODULES: ModuleDef[] = [
  // Administración
  { key: 'ventanillas', label: 'Mis ventanillas (multi-local)', group: 'Administración' },
  // Ventas y documentos
  { key: 'ventas', label: 'Historial de ventas y DIAN', group: 'Ventas' },
  { key: 'documentos', label: 'Facturas y remisiones', group: 'Ventas' },
  { key: 'eventos', label: 'Eventos Recepción (DIAN)', group: 'Ventas' },
  { key: 'informeZ', label: 'Informe Z (fiscal)', group: 'Ventas' },
  // Inventario y compras
  { key: 'compras', label: 'Compras', group: 'Inventario' },
  { key: 'proveedores', label: 'Proveedores', group: 'Inventario' },
  { key: 'reporteInv', label: 'Inventario General', group: 'Inventario' },
  { key: 'ajustesInv', label: 'Ajustes de inventario', group: 'Inventario' },
  // Clientes
  { key: 'clientes', label: 'Clientes / Fiado', group: 'Clientes' },
  { key: 'cartera', label: 'Cartera (cuentas por cobrar)', group: 'Clientes' },
  // Canales de venta
  { key: 'domicilios', label: 'Domicilios', group: 'Canales' },
  { key: 'tienda', label: 'Tienda online', group: 'Canales' },
  { key: 'autoservicio', label: 'Autoservicio (self-checkout)', group: 'Canales' },
  // Otros
  { key: 'reportes', label: 'Reportes', group: 'Otros' },
  { key: 'auditoria', label: 'Auditoría', group: 'Otros' },
  { key: 'notificaciones', label: 'Notificaciones', group: 'Otros' },
  // Extras del POS
  { key: 'servicios', label: 'Recargas / servicios (en el POS)', group: 'POS' },
  { key: 'ventaManual', label: 'Venta manual (en el POS)', group: 'POS' },
]

export function moduleEnabled(tenant: { modules?: Record<string, boolean> } | null | undefined, key: string): boolean {
  return tenant?.modules?.[key] !== false // por defecto: todo activo
}
