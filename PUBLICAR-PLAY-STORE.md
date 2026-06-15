# 📲 Publicar Ventanilla en Google Play (app descargable Android)

Ventanilla ya es una **PWA instalable** (manifest, iconos, service worker, HTTPS).
Para que aparezca en la **Play Store** se empaqueta como **TWA** (Trusted Web
Activity): una app Android que abre la PWA a pantalla completa. No hay que
reescribir nada.

> Resultado: una app real en Google Play que tus clientes descargan, con tu
> ícono, y que funciona offline igual que la PWA.

---

## Requisitos (una sola vez)
- Cuenta de **Google Play Console**: https://play.google.com/console — pago único de **USD $25**.
- Nada más en tu PC: el empaquetado se hace en la web con **PWABuilder**.

## Paso 1 — Generar el paquete Android (PWABuilder, 5 min)
1. Entra a **https://www.pwabuilder.com**
2. Pega la URL de la app: `https://droko1982.github.io/ventanilla/` → **Start**.
3. PWABuilder analiza la PWA (debe dar verde en manifest, service worker, etc.).
4. Clic en **Package For Stores** → **Android** → **Generate Package**.
5. Deja los datos: **Package ID** ej. `co.ventanilla.app`, App name `Ventanilla`.
   - Marca/usa la opción de **firma (signing key)** que PWABuilder genera y
     **guarda ese archivo .keystore y sus contraseñas** (lo necesitas para
     futuras actualizaciones).
6. Descarga el `.zip`: trae el **`app-release-bundle.aab`** (para subir a Play) y
   el **`assetlinks.json`** (para quitar la barra de direcciones).

## Paso 2 — Verificación de dominio (assetlinks.json)
Para que la app abra **sin barra de navegador**, el archivo `assetlinks.json`
(que viene en el zip) debe quedar accesible en la RAÍZ del dominio:

```
https://droko1982.github.io/.well-known/assetlinks.json
```

⚠️ Ojo con GitHub Pages: como la app vive en `…/ventanilla/`, la raíz
`droko1982.github.io` la sirve **otro** repositorio. Tienes 3 opciones:
- **A (recomendada):** crea un repo llamado `droko1982.github.io` (tu "user
  site") y dentro una carpeta `.well-known/` con el `assetlinks.json`.
- **B:** usa un **dominio propio** (ej. `app.tutienda.co`) apuntando a Pages y
  pon ahí `/.well-known/assetlinks.json`.
- **C:** publica igual sin verificar; la app funciona pero muestra una barra
  fina con la URL. Se puede verificar después.

El `assetlinks.json` se ve así (PWABuilder ya lo genera con TU huella):
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "co.ventanilla.app",
    "sha256_cert_fingerprints": ["AA:BB:CC:…"]
  }
}]
```

## Paso 3 — Subir a Google Play
1. En **Play Console** → **Crear app** → nombre `Ventanilla`, idioma español,
   tipo App, gratis.
2. **Producción → Crear nueva versión** → sube el **`.aab`**.
3. Completa la ficha: **descripción** (puedes reusar la del landing), **ícono**
   512×512 (usa `public/icons/icon-512.png`), **gráfico de funciones** 1024×500,
   **capturas** de pantalla (teléfono), **categoría** Negocios/Compras.
4. **Política de privacidad** (obligatoria): publica una página simple (puede ser
   en GitHub Pages) explicando que los datos se guardan en el dispositivo del
   negocio y, si conecta la nube, en su servidor. (Ver plantilla en
   `server/DESPLIEGUE-GRATIS.md` para dónde alojarla.)
5. Cuestionario de contenido + público objetivo → enviar a **revisión**.
6. Google revisa (de horas a pocos días). Al aprobar, queda **descargable**.

## Actualizaciones futuras
Cuando cambie la app, **no** hay que volver a empaquetar por cada cambio: como es
una TWA que carga la web, los cambios desplegados en GitHub Pages **se ven solos**.
Solo vuelves a generar el `.aab` (con la MISMA keystore) si cambias ícono,
permisos o quieres subir la versión en Play.

## Alternativa: Bubblewrap (CLI, si prefieres consola)
```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://droko1982.github.io/ventanilla/manifest.webmanifest
bubblewrap build   # genera el .aab y el assetlinks
```

---

**Resumen:** PWA → PWABuilder → `.aab` → Play Console ($25) → revisión → publicada.
La app es la misma web, así que sigue funcionando offline y se actualiza sola.
