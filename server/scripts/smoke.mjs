// Verificación del API: recorre auth, sync e integraciones. Requiere el API
// corriendo (npm run dev) y la base migrada.  Uso: node scripts/smoke.mjs
const BASE = process.env.API_URL || 'http://localhost:4000'
const email = `test_${Date.now()}@demo.co`
let token = ''
const fails = []

async function call(method, path, body, auth) {
  const r = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, data }
}

function check(cond, label) {
  if (cond) console.log('✓ ' + label)
  else { console.log('✗ ' + label); fails.push(label) }
}

async function main() {
  let r = await call('GET', '/health')
  check(r.ok && r.data.ok, 'GET /health')

  r = await call('POST', '/auth/register', { businessName: 'Tienda Test', ownerName: 'Tester', email, password: 'clave123' })
  check(r.ok && r.data.token, 'POST /auth/register (crea negocio + admin)')
  token = r.data.token
  const tenantId = r.data.tenant?.id

  r = await call('POST', '/auth/login', { email, password: 'clave123' })
  check(r.ok && r.data.token, 'POST /auth/login (dueño)')
  token = r.data.token

  r = await call('GET', '/auth/me', null, token)
  check(r.ok && r.data.auth?.tenantId === tenantId, 'GET /auth/me')

  // Push: un producto y un empleado (con PIN) — IDs únicos por corrida
  const rid = Date.now()
  r = await call('POST', '/sync', {
    records: [
      { table: 'products', recordId: `p_${rid}`, data: { id: `p_${rid}`, name: 'Gaseosa Test', price: 5000 } },
      { table: 'users', recordId: `e_${rid}`, data: { id: `e_${rid}`, name: 'Cajera Test', role: 'empleado', pin: '4321' } },
    ],
  }, token)
  check(r.ok && r.data.applied === 2, 'POST /sync (push producto + empleado)')

  // Pull: debe traer el producto, el tenant y los usuarios
  r = await call('GET', '/sync?since=1970-01-01', null, token)
  const tables = new Set((r.data.records || []).map((x) => x.table))
  check(r.ok && (r.data.records || []).some((x) => x.recordId === `p_${rid}`), 'GET /sync (pull trae el producto)')
  check(tables.has('tenants') && tables.has('users'), 'GET /sync (incluye perfil negocio + empleados)')

  // Login del empleado por PIN
  r = await call('POST', '/auth/pin', { email, pin: '4321' })
  check(r.ok && r.data.token, 'POST /auth/pin (empleado)')

  // Integraciones (modo simulado sin llaves)
  r = await call('POST', '/billing/checkout', {}, token)
  check(r.ok && r.data.url, 'POST /billing/checkout (enlace de pago)')

  r = await call('POST', '/whatsapp/send', { to: '573147555896', message: 'Hola' }, token)
  check(r.ok && r.data.sent, 'POST /whatsapp/send')

  r = await call('POST', '/dian/transmit', { docType: 'factura' }, token)
  check(r.ok && r.data.status === 'enviado', 'POST /dian/transmit')

  // Super-Admin
  r = await call('POST', '/auth/login', {
    email: process.env.SUPERADMIN_EMAIL || 'admin@ventanilla.co',
    password: process.env.SUPERADMIN_PASSWORD || 'ventanilla-admin',
  })
  check(r.ok && r.data.token, 'POST /auth/login (super-admin)')
  const superToken = r.data.token
  r = await call('GET', '/admin/tenants', null, superToken)
  check(r.ok && Array.isArray(r.data), 'GET /admin/tenants (consola)')

  console.log('\n===== RESULTADO API =====')
  if (fails.length === 0) {
    console.log('✅ API completo, sin fallos.')
    process.exit(0)
  } else {
    console.log(`❌ ${fails.length} fallo(s): ${fails.join(', ')}`)
    process.exit(1)
  }
}

main().catch((e) => { console.error('FALLO:', e); process.exit(1) })
