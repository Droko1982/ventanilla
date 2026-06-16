# 🆓 Desplegar Ventanilla GRATIS (sin tarjeta, $0)

Todo el sistema puede quedar en línea sin pagar nada:

| Pieza | Servicio gratis | Costo |
|---|---|---|
| Base de datos PostgreSQL | **Neon** (neon.tech) | $0, sin tarjeta |
| Backend / API | **Render** (render.com, plan Free) | $0, sin tarjeta |
| App (PWA) + Landing | **GitHub Pages** (ya está) | $0 |

> El plan Free de Render “se duerme” tras ~15 min sin uso; el primer ingreso luego de dormir tarda ~40–50 s. La app igual funciona **sin internet** y sincroniza cuando el API despierta.

---

## 1) Base de datos en Neon (2 min)
1. Entra a **https://neon.tech** → *Sign up* (con tu cuenta de GitHub).
2. *Create project* → nombre `ventanilla` → región la más cercana (us-east).
3. Copia la **Connection string** (empieza con `postgresql://…`). Esa es tu `DATABASE_URL`.
   - Asegúrate de que termine en **`?sslmode=require`** (Neon ya la da así). Marca *Pooled connection* si la ofrece.

## 2) Crear las tablas y el negocio demo (una vez, desde tu PC)
En la carpeta `server/`:
```powershell
$env:DATABASE_URL="postgresql://...neon..."   # la de Neon
npm install
npm run prisma:push      # crea las tablas
npm run seed             # negocio demo: laesquina@demo.co / demo1234 (PIN 1234)
```

## 3) API en Render (3 min)
1. Entra a **https://render.com** → *Sign up* con GitHub.
2. *New* → **Blueprint** → conecta el repo **Droko1982/ventanilla** (Render detecta `render.yaml`).
3. Cuando pida variables, pega:
   - `DATABASE_URL` = la de **Neon**.
   - `SUPERADMIN_PASSWORD` = una clave tuya (para la consola Super-Admin).
4. *Apply* / *Deploy*. Cuando termine, copia la URL, algo como `https://ventanilla-api.onrender.com`.
5. Verifica abriendo `https://ventanilla-api.onrender.com/health` (debe decir `ok`).

> ⚠️ **Seguridad obligatoria antes de cobrar a clientes reales.** En Render → tu servicio → *Environment*, confirma que existan estas dos variables (sin ellas, el servidor arranca pero genera un secreto aleatorio temporal que cambia en cada reinicio, así que **la consola Super-Admin no podrá entrar con una clave por defecto** y los usuarios tendrán que reconectarse seguido):
> - `JWT_SECRET` — el blueprint la genera sola (`generateValue`). Confirma que esté.
> - `SUPERADMIN_PASSWORD` — **defínela tú** con una clave fuerte. Es la que usarás para entrar a la consola Super-Admin (junto con `SUPERADMIN_EMAIL`, por defecto `admin@ventanilla.co`). Ya **no existe** la clave por defecto `ventanilla-admin`.
> - Opcional pero recomendado: `CORS_ORIGIN = https://droko1982.github.io` para restringir el origen.
> Tras cambiar variables, haz *Manual Deploy → Clear build cache & deploy* (o *Restart*).

## 4) Conectar la app a la nube (30 s)
1. Abre **https://droko1982.github.io/ventanilla/** → entra como **Dueño**.
2. **Ajustes → Nube (multi-dispositivo)** → pega:
   - URL del API: la de Render.
   - Correo: `laesquina@demo.co` · Contraseña: `demo1234` (o tu negocio real).
3. **Conectar a la nube.** Listo: ya sincroniza entre dispositivos. 🎉

---

## Integraciones reales (cuando quieras, también gratis para empezar)
En Render → *Environment* agrega las llaves y se activan solas (sin ellas, modo simulado):
- **Wompi** (cobro de la mensualidad): `WOMPI_PRIVATE_KEY`, `WOMPI_EVENTS_SECRET` (cuenta gratis en comercios.wompi.co).
- **WhatsApp Cloud API** (envío automático): `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` (Meta/Facebook, tramo gratis mensual).
- **DIAN**: la conecta cada negocio con su proveedor autorizado (Alegra/Factus) desde Ajustes.

## Build de producción con la nube pre-cargada (opcional)
Para que la app de tus clientes **ya sepa la URL del API** (y solo tengan que
*Crear cuenta* o *Iniciar sesión* en Ajustes → Nube), compila el frontend con la
variable `VITE_API_URL`:
```powershell
$env:VITE_API_URL="https://ventanilla-api-vvzh.onrender.com"; npm run build
```
La app del demo público (sin esa variable) sigue siendo 100% local. En Ajustes →
Nube ahora hay pestaña **Crear cuenta**: un negocio nuevo se registra solo y
queda conectado y sincronizando en todos sus dispositivos.

## Alternativas 100% gratis (por si Render no te gusta)
- API: **Koyeb** o **Fly.io** (también plan gratis) — usan el `Dockerfile` de `server/`.
- DB: **Supabase** (Postgres gratis) en vez de Neon.
