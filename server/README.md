# Ventanilla — Backend (API)

> Creado y de propiedad del **Dr. Mauricio Rodríguez Herrera**. © Todos los derechos reservados.

API multi-tenant para Ventanilla: **autenticación**, **sincronización offline-first** y **integraciones** (Wompi, WhatsApp Cloud API, DIAN). Node + Express + Prisma + PostgreSQL.

El frontend (la PWA) sigue funcionando **sin internet** con su base local (Dexie); cuando se conecta a este API, **sincroniza** y habilita multi-dispositivo, pasarela de pago, WhatsApp automático y transmisión DIAN real.

---

## 🚀 Arranque local (con Docker)

```bash
cd server
cp .env.example .env          # ajusta JWT_SECRET y, si quieres, las llaves de integración
docker compose up -d db       # levanta PostgreSQL en localhost:5433
npm install
npm run prisma:generate
npm run prisma:push           # crea las tablas
npm run seed                  # negocio demo: laesquina@demo.co / demo1234 (PIN 1234)
npm run dev                   # API en http://localhost:4000
```

Verifica que todo responde:

```bash
npm run smoke                 # recorre auth, sync e integraciones
```

### Todo con Docker (API incluida)

```bash
docker compose up -d          # Postgres + API (build) en http://localhost:4000
```

## ☁️ Desplegar en producción

Funciona en cualquier hosting de Node con una base PostgreSQL administrada (Neon, Supabase, Railway, Render…).

1. Crea una base **PostgreSQL** y copia su `DATABASE_URL`.
2. Despliega esta carpeta `server/` (por ejemplo en **Railway** o **Render**):
   - Build: `npm install && npm run prisma:generate && npm run build`
   - Start: `npm run prisma:push && npm start`
   - Variables: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` (incluye tu dominio del frontend), `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`.
3. En el frontend, define `VITE_API_URL=https://tu-api...` (o conéctalo desde **Ajustes → Conectar a la nube**).

## 🔌 Integraciones (opcionales)

Cada una funciona en **modo simulado** sin llaves y se vuelve **real** al agregarlas en `.env`:

- **Pasarela de pago — Wompi** (`WOMPI_PRIVATE_KEY`, `WOMPI_EVENTS_SECRET`): cobro de la mensualidad del SaaS. Endpoint `POST /billing/checkout` crea el enlace; `POST /billing/webhook` confirma el pago y extiende la suscripción.
- **WhatsApp Cloud API** (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`): envío automático de recibos/pedidos. `POST /whatsapp/send`.
- **DIAN** (`DIAN_PROVIDER`, `DIAN_API_KEY`, o la config por tenant): transmisión real del documento equivalente/factura. `POST /dian/transmit`.

## 📚 Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado del API |
| POST | `/auth/register` | Crea un negocio + admin |
| POST | `/auth/login` | Login del dueño (o super-admin) |
| POST | `/auth/pin` | Login de empleado por PIN |
| GET | `/auth/me` | Usuario autenticado |
| GET | `/sync?since=ISO` | Trae cambios desde una fecha |
| POST | `/sync` | Sube cambios locales |
| POST | `/billing/checkout` | Enlace de pago de la mensualidad |
| POST | `/billing/webhook` | Webhook de Wompi |
| GET | `/billing/status` | Estado de pago del negocio |
| POST | `/whatsapp/send` | Enviar WhatsApp |
| POST | `/dian/transmit` | Transmitir a la DIAN |
| GET | `/admin/tenants` | (Super-Admin) lista de clientes |
| POST | `/admin/tenants/:id/status` | Activar/suspender |
| POST | `/admin/tenants/:id/pay` | Registrar pago (+30 días) |

## 🔐 Seguridad

- Contraseñas y PIN con **bcrypt**; tokens **JWT** (30 días).
- **Aislamiento multi-tenant**: cada petición opera solo sobre los datos de su negocio (`tenantId` del token).
- Configura un `JWT_SECRET` largo y aleatorio y un `CORS_ORIGIN` específico en producción.
