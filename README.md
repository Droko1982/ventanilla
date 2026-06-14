# 🏪 Ventanilla

**Plataforma SaaS de ventas e inventario para tiendas y ventanillas en Colombia.**
POS, inventario, caja, **facturación electrónica (DIAN)**, remisiones, reportes y multi-local — desde el celular y **funciona sin internet** (PWA).

---

## 🔗 Enlaces

| | |
|---|---|
| **Demo en vivo (app)** | https://droko1982.github.io/ventanilla/ |
| **Landing (para promocionar)** | https://droko1982.github.io/ventanilla/landing.html |
| **Local (desarrollo)** | http://localhost:5173/ — tras correr `npm run dev` |
| **Repositorio** | https://github.com/Droko1982/ventanilla |
| **Contacto / Soporte** | WhatsApp **314 755 5896** |

## 🔑 Cuentas del demo

- **Dueño / Administrador:** botón "Dueño de la tienda" (PIN 1111).
- **Cajeros (empleados):** PIN **1234** (Centro) · **2345** (Norte — con permisos limitados) · **3456** (Pereira).
- **Super-Admin (plataforma):** botón "Super-Admin".

> Trae datos de ejemplo de una tienda de **Armenia, Quindío** ("Tienda La Esquina", 3 locales). Reinícialos en **Cuenta → Reiniciar datos del demo**.

---

## ✨ Funciones

- **POS:** código de barras/QR (cámara o lector USB/Bluetooth), por peso/granel, manual y por código interno; **recargas y servicios**; pagos efectivo (con vuelto), Nequi, tarjeta, transferencia, **fiado** y **mixto**; descuentos, **redondeo a $50**; recibo por impresión/correo/WhatsApp. Escanea un código nuevo → **crea el producto al instante**.
- **Inventario:** stock por local, umbral de reorden dinámico, vencimientos con descuento sugerido, traslados entre locales, **kardex**, **fotos y detalles**, **precio al por mayor**, carga masiva CSV/Excel.
- **Proveedores:** pedido sugerido por velocidad de venta, correo + WhatsApp listo, recepción de mercancía y **cuentas por pagar**.
- **Caja:** apertura, **ingresos/egresos (sangría) y gastos**, cierre/arqueo y conciliación por método.
- **Documentos:** documento equivalente POS, **factura electrónica de venta** (IVA discriminado), **remisiones** (convertibles a factura), notas crédito y **devoluciones parciales**. Conexión DIAN configurable por cliente (simulada en el demo).
- **Dashboard y reportes:** históricos por **día / semana / mes / año** con navegación; márgenes, utilidad neta, más/menos vendidos, stock muerto y comparación entre locales (export CSV).
- **Clientes:** fiado/crédito, abonos y recordatorio por WhatsApp.
- **Roles y permisos:** Super-Admin (plataforma), Admin (dueño) y Empleado con **permisos finos** (descuentos, inventario, caja, anulaciones).
- **Offline / PWA:** instalable y funciona sin conexión; sincroniza al volver el internet.

---

## 🛠️ Tecnología

- **Frontend:** React 18 + TypeScript + Vite · **UI:** Tailwind CSS (móvil-primero)
- **Datos locales / offline:** Dexie (IndexedDB) · **PWA:** vite-plugin-pwa
- **Gráficas:** Recharts · **Escaneo:** html5-qrcode (cámara) + "wedge" de teclado (lector físico)
- **Estado:** Zustand · **Despliegue:** GitHub Pages (rama `gh-pages`)

> La capa de datos está abstraída (`src/data/`) para conectar un backend real después; cada registro tiene `syncedAt` para la sincronización futura.

## 🚀 Correr en tu computador

Requisitos: **Node 18+** y **Git**.

```bash
git clone https://github.com/Droko1982/ventanilla.git
cd ventanilla
npm install
npm run dev          # abre http://localhost:5173/
```

Otros comandos:

```bash
npm run build        # compila a /dist (PWA incluida)
npm run preview      # previsualiza el build (sirve bajo /ventanilla/)
npm run typecheck    # solo verificación de tipos
npm run deploy       # construye y publica en GitHub Pages (rama gh-pages)
```

> La landing en local queda en http://localhost:5173/landing.html

## 📁 Estructura

```
src/
  data/        db.ts (Dexie), seed.ts (datos demo), repo.ts (lógica de negocio)
  lib/         money, format, period, analytics, billing, documents, permissions, image, receipt, docprint…
  hooks/       data.ts (consultas reactivas), useOnline, useBarcodeWedge
  store/       session.ts, cart.ts (Zustand)
  components/  AppLayout, Sheet, Scanner, ProductForm, ProductPicker, ui, icons, Toast
  screens/     Login, Dashboard, POS, Inventory, Caja, Documentos, Ventas, Proveedores,
               Clientes, Reportes, Notificaciones, Ajustes, Auditoria, SuperAdmin, Mas
public/        landing.html (presentación), icons, favicon
scripts/       smoke.mjs (verificación headless), gen-icons.mjs
```

## ✅ Verificación automática

`scripts/smoke.mjs` recorre todas las pantallas y flujos clave con un navegador headless (Puppeteer) y reporta cualquier error de consola:

```bash
npm run dev                                                   # en otra terminal
node scripts/smoke.mjs                                        # contra localhost:5173
SMOKE_URL="https://droko1982.github.io/ventanilla/" node scripts/smoke.mjs   # contra el sitio en vivo
```
(requiere `npm i -D puppeteer` para correrlo)

## 🧾 Nota sobre la DIAN

En el demo la transmisión a la DIAN está **simulada** para mostrar el flujo completo (numeración FE/POS/NC, IVA discriminado, estados enviado/pendiente, nota crédito). En producción cada cliente conecta su proveedor autorizado (Alegra, Factus o el software de la DIAN) con su resolución de numeración.

## 🗺️ Próximas funciones sugeridas

Combos/promociones, programa de puntos, variantes/presentaciones (caja→unidad), cotizaciones, lotes por vencimiento, etiquetas imprimibles, domicilios, pasarela de pago de la mensualidad (Wompi/PSE), respaldo/sincronización en la nube, WhatsApp Business API.

---

Hecho con ❤️ para las tiendas de Colombia · Armenia, Quindío. 🇨🇴
