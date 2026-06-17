# ✅ Todo listo para dominio propio + Play Store

Esto resume lo que **ya quedó preparado en el código** y el **paso a paso exacto**
para el día que compres el dominio. La app ya funciona offline y sincroniza; subirla
a Play Store no cambia eso.

---

## 1) Lo que ya quedó listo (no tienes que hacer nada)
- **`base` configurable** (vite.config): con dominio propio se construye en la raíz.
- **`public/.well-known/assetlinks.json`** creado (solo falta pegar la huella del keystore).
- **Manifest + iconos** (192, 512, 512‑maskable), service worker, HTTPS, `display: standalone` → cumple requisitos de PWA/TWA.
- **Política de privacidad y términos** publicados (requisito de Play).
- **Banner de actualización** dentro de la app.

---

## 2) Checklist cuando compres el dominio (ej. `ventanillapos.com`)

**a) Apuntar el dominio a GitHub Pages (DNS, en tu proveedor del dominio)**
- Registros `A` del root `@` a las IP de GitHub Pages:
  `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
- Registro `CNAME` de `www` → `droko1982.github.io`.

**b) Decirle a GitHub Pages el dominio**
- Crea el archivo `public/CNAME` con UNA línea: el dominio (ej. `ventanillapos.com`).
  (Avísame y lo creo; lo dejo pendiente porque un valor errado rompe el sitio actual.)

**c) Construir y desplegar en la RAÍZ (base `/`)**
```
PowerShell (recomendado):  $env:VITE_BASE='/'; npm run deploy ; $env:VITE_BASE=$null
bash (Git Bash):           MSYS_NO_PATHCONV=1 VITE_BASE=/ npm run deploy
```
> En Git Bash, `VITE_BASE=/` se convierte a una ruta de Windows; usa
> `MSYS_NO_PATHCONV=1` (o mejor, PowerShell).
Esto deja la app en `https://ventanillapos.com/` y el `assetlinks.json` en
`https://ventanillapos.com/.well-known/assetlinks.json`.

**d) Apuntar la app del cliente a la nube (igual que hoy)**
- En `.env.production` ya está `VITE_API_URL=https://ventanilla-api-vvzh.onrender.com`.
- En **Render → Environment → `CORS_ORIGIN`** agrega el dominio nuevo:
  `https://ventanillapos.com,https://www.ventanillapos.com,https://droko1982.github.io`

**e) En Play Console (si harás la app Android)**
- Sigue `PUBLICAR-PLAY-STORE.md` con la URL del dominio nuevo.
- Pega tu dominio en PWABuilder → genera el `.aab` y obtén la **huella SHA‑256**.

---

## 3) Llenar el `assetlinks.json` (para que la app abra sin barra de URL)
PWABuilder te da el **package name** (ej. `co.ventanilla.app`) y la **huella SHA‑256**
del keystore. Edita `public/.well-known/assetlinks.json` y reemplaza:
- `package_name` por el tuyo.
- `REEMPLAZAR_CON_LA_HUELLA_SHA256_DEL_KEYSTORE_DE_PWABUILDER` por la huella
  (formato `AA:BB:CC:…`). Vuelve a desplegar (paso c).

---

## 4) Ficha de Play Store (textos listos para copiar)

**Nombre:** `Ventanilla — Ventas e Inventario`

**Descripción corta (máx. 80):**
`POS, inventario y caja para tu tienda. Funciona sin internet.`

**Descripción completa:**
```
Ventanilla es la app de ventas, inventario y caja pensada para tiendas de barrio,
ventanillas y minimercados en Colombia. Sencilla, rápida y funciona SIN INTERNET:
sigue vendiendo aunque se caiga el wifi y sincroniza sola cuando vuelve la conexión.

• Vende rápido: por fichas, por lista o en modo mostrador. Escanea el código de
  barras o búscalo por nombre.
• Cobra fácil: efectivo (con cálculo de vueltas), Nequi, tarjeta, transferencia,
  pago mixto y fiado. Cobra con Enter, sin tocar la pantalla.
• Inventario completo: precios y rentabilidad, control de existencias, productos
  por vencer, carga masiva y banco de productos compartido.
• Caja y cierre: apertura, arqueo, ingresos/egresos e informe Z. El día contable
  respeta tu turno aunque cruce la medianoche.
• Documentos: tiquete, remisión y factura electrónica.
• Reportes y caja: ventas del día, semana, mes y año, productos más vendidos,
  utilidad y cartera de fiado.
• Multi‑ventanilla: administra varios locales desde un solo lugar.
• Domicilios, tienda online para compartir el catálogo y pantalla para el cliente.

Funciona offline, se instala como app y protege tus datos según la Ley 1581.
```

**Categoría:** Negocios (o Compras)
**Política de privacidad (URL):** `https://TU-DOMINIO/privacidad.html`
**Ícono 512×512:** `public/icons/icon-512.png`
**Recursos gráficos a preparar:** gráfico de funciones 1024×500 y 2–8 capturas de
pantalla del teléfono (POS, inventario, caja, reportes).
**Clasificación de contenido:** apta para todos (app de negocios, sin contenido sensible).

---

## Resumen
Apenas tengas el dominio: DNS → `public/CNAME` → `VITE_BASE=/ npm run deploy` →
CORS en Render → (opcional) PWABuilder + Play Console con el `assetlinks`.
Yo te dejo cada pieza lista; solo falta el dominio y la cuenta de Play ($25).
</content>
