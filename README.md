# Ventanilla 🛒

**Plataforma SaaS de ventas e inventario para ventanillas y tiendas pequeñas en Colombia.**

Cada cliente (dueño de tienda) administra sus locales, empleados, inventario y ventas desde un solo lugar. Registra ventas por código de barras, QR, peso o manual; controla el stock; reabastece solo; concilia la caja; y muestra todo el negocio en un dashboard. **Funciona sin internet** (offline-first) y se instala como app (PWA) en celular, tablet o computador.

> 🌐 **Demo en vivo:** https://droko1982.github.io/ventanilla/
> Es un demo: los datos son de ejemplo y viven en el dispositivo. Botón **«Reiniciar datos del demo»** en el menú de cuenta.

---

## ✨ Qué incluye esta v1

### Punto de venta (POS)
- Escaneo por **cámara** y por **lector físico USB/Bluetooth** (detección automática de teclado-wedge).
- Venta **por unidad** y **por peso/granel** (kg), activable por producto y por local.
- **Descuentos** por línea y sobre la venta.
- Pagos: **efectivo (con vuelto), Nequi, tarjeta, transferencia, fiado** y **pago mixto** (dividido).
- Comprobante por **foto** para transferencias/Nequi (estructura lista para confirmación automática).
- **Agregar producto al vuelo** durante la venta.
- Recibo en **3 vías**: impresora térmica, correo y WhatsApp.
- Documento Equivalente Electrónico (**DEE POS**) de la DIAN — simulado en el demo.

### Inventario
- Stock **por producto y por local**, se descuenta solo con cada venta.
- **Umbral de reorden dinámico** según velocidad de venta.
- **Traslados** entre locales y **consulta de stock cruzado**.
- **Vencimientos**: alerta a 30 días, bandera a 7, y **descuento sugerido** para promoción.
- **Carga masiva** de productos por CSV/Excel (con plantilla descargable).
- Costo, precio, **IVA por producto** y categorías.

### Reabastecimiento
- **Pedido sugerido** (cuánto pedir) por velocidad de venta + tiempo de entrega del proveedor.
- Pedido por **correo automático** + **WhatsApp listo para enviar** con un toque.
- **Recibir mercancía**: confirmar lo que llegó de verdad y actualizar el stock.

### Caja y antifraude
- **Cierre de caja / arqueo** con sobrante/faltante.
- **Conciliación** por método de pago.
- **PIN** por empleado, **registro de auditoría** (quién hizo o cambió cada cosa) y alertas de movimientos inusuales.

### Dashboard y reportes
- Ventas del día, por método, márgenes y **utilidad neta** (ventas − costos − gastos).
- **Más / menos vendidos**, **comparación entre locales**, **stock muerto**.
- Reportes por rango, **exportables a CSV**.
- **Centro de notificaciones** unificado (stock, vencimientos, caja, DIAN).

### Clientes
- **Fiado/crédito** por cliente (típico de tienda de barrio), abonos y recordatorio por WhatsApp.

### Super-Admin (plataforma)
- Lista de clientes, **activar/suspender**, registro de pago.
- **Cobro escalonado con descuento por paquete** (2ª y 3ª ventanilla más baratas) y **MRR**.

---

## 🧱 Stack técnico

- **Frontend:** React + TypeScript + Vite
- **UI:** Tailwind CSS (móvil-primero, botones grandes)
- **Offline-first:** PWA (vite-plugin-pwa / Workbox) + **IndexedDB** (Dexie)
- **Gráficas:** Recharts
- **Despliegue:** GitHub Pages (workflow en `.github/workflows/deploy.yml`)

La capa de datos está abstraída (`src/data/repo.ts`) para conectar **un backend real** después (cada función equivale a una llamada de API). Cada registro lleva `syncedAt` para sincronizar lo creado offline.

---

## 🚀 Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # genera dist/ (PWA incluida)
npm run preview  # sirve el build
```

### Cuentas de demo
| Rol | Acceso |
|-----|--------|
| Dueño (admin) | botón «Dueño de la tienda» |
| Cajero (empleado) | PIN — Centro `1234`, Norte `2345`, Pereira `3456` |
| Super-Admin | botón «Super-Admin» |

---

## 🗺️ Siguiente (post-v1)
- Backend multi-tenant real + sincronización.
- Confirmación automática de pagos (Nequi/banco).
- WhatsApp Business API (envío 100% automático a proveedores).
- Pasarela de pago para el cobro de la mensualidad.
- Transmisión DIAN real por proveedor autorizado de cada cliente.

---

Hecho para tiendas reales de Colombia. 🇨🇴
