# 🏪 Ventanilla · v1.0

**Plataforma SaaS de ventas e inventario para tiendas y ventanillas en Colombia.**
POS, inventario, caja, **facturación electrónica (DIAN)**, remisiones, reportes y multi-local — desde el celular y **funciona sin internet** (PWA).

> **Creada, desarrollada y de propiedad del Dr. Mauricio Rodríguez Herrera.**
> © Dr. Mauricio Rodríguez Herrera. Todos los derechos reservados.

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
- **Inventario:** stock por local, umbral de reorden dinámico, **control de vencimientos** (captura del lote, alertas y baja por merma), ajustes de entrada/salida con motivo, cambio rápido de precio/sección, traslados y **desempaque** (caja→unidad), **kardex**, **fotos y detalles**, **precio al por mayor**, **reporte de inventario general** (costo promedio, utilidad %, stock sugerido), carga masiva CSV/Excel.
- **Compras:** factura de compra, **costo promedio ponderado**, último proveedor, devoluciones a proveedor y **cuentas por pagar**.
- **Proveedores:** pedido sugerido por velocidad de venta, **reabastecimiento automático por WhatsApp** al bajar el stock, recepción de mercancía y deuda.
- **Caja:** apertura, **ingresos/egresos (sangría) y gastos**, cierre/arqueo y conciliación por método, **resumen del día al WhatsApp del dueño** e **Informe Z** fiscal.
- **Documentos:** documento equivalente POS, **factura electrónica de venta** (IVA discriminado), **remisiones** (convertibles a factura), notas crédito y débito, **devoluciones parciales** y **Eventos Recepción DIAN**. Conexión DIAN configurable por cliente (simulada en el demo).
- **Cartera:** cuentas por cobrar (remisiones a crédito con vencimiento/atraso y fiado por cliente, con abonos).
- **Domicilios:** entregas con repartidor, estado en vivo, mapa y aviso al cliente por WhatsApp.
- **Hardware conectado (Web Serial):** **cajón monedero** (pulso ESC/POS, automático en ventas en efectivo), **báscula** para granel y **etiquetas con código de barras Code 128 escaneable**.
- **Dashboard y reportes:** históricos por **día / semana / mes / año** con navegación; márgenes, utilidad neta, más/menos vendidos, stock muerto, **comisiones por vendedor** y comparación entre locales (export CSV).
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

## 🧾 Cumplimiento DIAN

La representación de los documentos sigue las reglas de la normativa colombiana: **régimen tributario del emisor** (responsable / **no responsable de IVA**), **IVA e INC discriminados**, clasificación **gravado / exento / excluido**, **numeración derivada de la resolución** (prefijo, rango y vigencia, con avisos de rango por agotarse), **notas crédito/débito con su concepto DIAN y referencia** al documento original, y **adquiriente "consumidor final"** cuando no se identifica. Los documentos **nunca afirman una validación falsa**: en modo demo se rotulan como simulados.

La transmisión a la DIAN está **simulada** en el demo (no se computan CUFE/CUDE, que requieren un proveedor real). En producción cada cliente conecta su **proveedor tecnológico autorizado** (Alegra, Factus o el software gratuito de la DIAN) con su propia resolución de numeración.

## ☁️ Backend y nube (multi-dispositivo)

El backend vive en [`server/`](server/) (Node + Express + Prisma + **PostgreSQL**): autenticación multi-tenant, sincronización offline-first e integraciones (**Wompi**, **WhatsApp Cloud API**, **DIAN**). La app funciona sin él (modo local); al conectarla, sincroniza y habilita varios dispositivos.

```bash
cd server
cp .env.example .env
docker compose up -d db        # PostgreSQL
npm install && npm run prisma:push && npm run seed
npm run dev                    # API en http://localhost:4000
npm run smoke                  # verifica el API
```

Conectar la app a la nube: **Ajustes → Nube (multi-dispositivo)** (URL del API + correo + contraseña), o define `VITE_API_URL` al compilar. Guía completa de despliegue en [`server/README.md`](server/README.md).

## 🗺️ Próximas funciones (opcionales)

> **Filosofía:** antes que “más funciones”, la app debe seguir siendo **sencilla e intuitiva** para cajeros sin experiencia en ofimática. Lo de abajo solo se agrega si aporta valor real sin complicar el uso.

Candidatas: combos/promociones, variantes/modificadores de producto, cotizaciones/proformas y producto vendido por caja **y** unidad en una sola ficha. Las integraciones de **pago (Wompi/PSE)**, **WhatsApp Cloud API** y **transmisión DIAN real** ya están implementadas en el backend y se activan con las llaves del cliente.

## 👤 Créditos y propiedad

**Ventanilla** fue **creada, desarrollada y es propiedad del Dr. Mauricio Rodríguez Herrera.**
© Dr. Mauricio Rodríguez Herrera. Todos los derechos reservados. Uso no autorizado prohibido.

---

Hecho con ❤️ para las tiendas de Colombia · Armenia, Quindío. 🇨🇴
