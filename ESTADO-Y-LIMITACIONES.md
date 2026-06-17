# Ventanilla — Estado y limitaciones (para el cliente piloto)

Plataforma de **Dr. Mauricio Rodríguez Herrera**. Este documento dice, con
honestidad, **qué funciona hoy** y **qué todavía NO** (porque requiere trámites,
llaves o certificados externos). Es importante que el cliente lo conozca por
escrito antes de usarla.

---

## ✅ Funciona completo (úsalo con confianza)
- **Vender sin internet** y **sincronizar** al volver la conexión.
- **Varias cajas a la vez** sin descuadrar inventario ni saldos de fiado.
- **POS:** fichas, lista y mostrador; cobro en efectivo (con vueltas), Nequi,
  tarjeta, transferencia, **pago mixto** y **fiado**; cobro con Enter.
- **Inventario:** productos, precios y rentabilidad, control de existencias,
  productos por vencer, **banco de productos** y **códigos en línea** (Open Food
  Facts), **etiquetas con código de barras**, importar CSV.
- **Caja:** apertura, ingresos/egresos, **arqueo** (con vueltas debidas), informe Z.
- **Cartera (fiado):** saldo por cliente, abonos, **recordatorio por WhatsApp**.
- **Reportes:** ventas del día/semana/mes/año, productos top, utilidad, export contable.
- **Recibo/tirilla:** impresión normal y **Bluetooth** (térmica 58mm).
- **Permisos** por cajero, **PIN** por persona, multi‑dispositivo, modo oscuro.
- Datos protegidos según **Ley 1581** (privacidad y términos publicados).

---

## ⚠️ Todavía NO funciona "de verdad" (requiere configuración externa)
Estas funciones existen en la app pero hoy están en **modo demostración**: pueden
mostrar "enviado/transmitido" **sin** hacerlo realmente. NO dependen de un botón:
requieren trámites/llaves que se conectan después.

1. **Factura electrónica DIAN.** La app genera un número y muestra "transmitida ✓",
   pero **no emite una factura legal** (no hay CUFE ni validación ante la DIAN).
   Para que sea real se necesita: **NIT**, **resolución de numeración DIAN**,
   **certificado digital** y un **proveedor autorizado** (Alegra/Factus u otro).
   👉 Mientras tanto, usar el **tiquete POS** (documento equivalente).

2. **Pagos automáticos en la tienda.**
   - **Bre‑B / QR:** muestra el QR con la llave del comercio, pero **no confirma
     el pago solo** — el cajero verifica que entró y confirma. (No hay datáfono.)
   - **Wompi:** es para cobrar la **mensualidad del SaaS**, no ventas; sin llaves
     genera enlaces de prueba.

3. **Envíos automáticos.**
   - **WhatsApp y correo automáticos** (pedido a proveedor, recordatorios): sin
     llaves quedan en modo demo. ✅ Lo que SÍ funciona hoy es el **WhatsApp con un
     toque** (abre el chat con el mensaje listo) y el correo manual.

---

## 🔧 Para activarlas más adelante (cuando el negocio lo necesite)
- **DIAN:** conseguir NIT + resolución + certificado + proveedor → se conecta el flujo real.
- **Pagos:** poner la **llave Bre‑B** del comercio en Ajustes; llaves de Wompi para cobro automático.
- **WhatsApp/correo automáticos:** token de WhatsApp Business API / llave de Resend.

---

## Resumen honesto
Para **vender, inventariar, cuadrar caja, fiar y reportar** — incluso con varias
cajas y sin internet — la plataforma está **lista y probada**. Lo que falta para
el 100% (DIAN legal, pagos y envíos automáticos) **no son errores**: son
integraciones externas que se activan con los trámites y llaves correspondientes.
