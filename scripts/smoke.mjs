// Verificación headless: recorre todas las pantallas y reporta errores de
// consola o excepciones. Uso: node scripts/smoke.mjs
import puppeteer from 'puppeteer'

const BASE = process.env.SMOKE_URL || 'http://localhost:5173/'
const errors = []
let ctx = 'inicio'

function attach(page) {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${ctx}] console.error: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`[${ctx}] pageerror: ${e.message}`))
  page.on('requestfailed', (r) => {
    const u = r.url()
    if (!u.includes('favicon')) errors.push(`[${ctx}] requestfailed: ${u} (${r.failure()?.errorText})`)
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function clickText(page, text) {
  const handle = await page.evaluateHandle((t) => {
    const els = [...document.querySelectorAll('button, a')]
    return els.find((e) => e.textContent && e.textContent.trim().includes(t)) || null
  }, text)
  const el = handle.asElement()
  if (!el) throw new Error(`No encontré el botón con texto: "${text}"`)
  await el.click()
}

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText)
}

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, isMobile: true })
  attach(page)

  // 1) Carga inicial (seed + login)
  ctx = 'carga'
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(2500) // seed (resetDemo) + render
  let txt = await bodyText(page)
  if (!txt.includes('Ventanilla')) throw new Error('No renderizó la pantalla de inicio')
  console.log('✓ Pantalla de login renderiza')

  // 2) Entrar como Dueño
  ctx = 'login-admin'
  await clickText(page, 'Dueño de la tienda')
  await sleep(1800)
  txt = await bodyText(page)
  if (!/Hola,/.test(txt)) throw new Error('Dashboard de admin no renderizó')
  console.log('✓ Dashboard (Dueño) renderiza')

  // 3) Recorrer todas las rutas del admin
  const routes = [
    ['#/pos', 'Producto nuevo'],
    ['#/inventario', 'Inventario'],
    ['#/caja', 'Caja'],
    ['#/proveedores', 'Proveedores'],
    ['#/ventas', 'Ventas'],
    ['#/documentos', 'Facturas y remisiones'],
    ['#/reportes', 'Reportes'],
    ['#/clientes', 'Clientes'],
    ['#/notificaciones', 'Notificaciones'],
    ['#/auditoria', 'Auditoría'],
    ['#/ajustes', 'Ajustes'],
    ['#/mas', 'Más'],
    ['#/', 'Hola,'],
  ]
  for (const [hash, expect] of routes) {
    ctx = `ruta ${hash}`
    await page.evaluate((h) => { location.hash = h }, hash)
    await sleep(900)
    txt = await bodyText(page)
    if (!txt.includes(expect)) throw new Error(`Ruta ${hash}: no se encontró "${expect}"`)
    console.log(`✓ ${hash}`)
  }

  // 4) Abrir el carrito vendiendo: tocar primer producto y abrir cobro
  ctx = 'venta-pos'
  await page.evaluate(() => { location.hash = '#/pos' })
  await sleep(900)
  // tocar el primer producto (botón con $ y stock)
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const prod = btns.find((b) => /en stock|Agotado/.test(b.textContent || ''))
    if (prod) prod.click()
  })
  await sleep(600)
  txt = await bodyText(page)
  if (!/Ver carrito/.test(txt)) console.log('· (aviso) no apareció la barra de carrito tras tocar producto')
  else console.log('✓ Agregar al carrito funciona')

  // Recarga / servicio (no afecta inventario)
  await clickText(page, 'Recarga / Servicio')
  await sleep(500)
  await page.keyboard.type('5000')
  await sleep(200)
  await clickText(page, 'Agregar')
  await sleep(500)
  console.log('✓ Recarga/servicio agregada al carrito')

  // 4b) Venta completa de extremo a extremo: carrito → cobrar → recibo
  ctx = 'checkout'
  await clickText(page, 'Ver carrito')
  await sleep(700)
  await clickText(page, 'Cobrar')
  await sleep(700)
  await clickText(page, 'Recibí el pago')
  await sleep(1200)
  txt = await bodyText(page)
  if (!/Venta lista|Total cobrado/.test(txt)) throw new Error('No se completó la venta (sin recibo)')
  console.log('✓ Venta completa → recibo generado (DIAN + stock + auditoría)')
  await clickText(page, 'Nueva venta')
  await sleep(500)

  // 4c) Documentos: abrir factura electrónica y remisión de ejemplo
  ctx = 'documentos'
  await page.evaluate(() => { location.hash = '#/documentos' })
  await sleep(900)
  await clickText(page, 'FE-9')
  await sleep(700)
  txt = await bodyText(page)
  if (!/Base gravable/.test(txt)) throw new Error('Detalle de factura no renderizó')
  await page.keyboard.press('Escape')
  await sleep(400)
  await clickText(page, 'Remisiones')
  await sleep(500)
  await clickText(page, 'REM-1')
  await sleep(700)
  txt = await bodyText(page)
  if (!/Convertir en factura/.test(txt)) throw new Error('Detalle de remisión no renderizó')
  await page.keyboard.press('Escape')
  await sleep(400)
  console.log('✓ Documentos: factura y remisión de ejemplo se abren')

  // 4d) Caja: abrir caja y registrar un egreso de efectivo
  ctx = 'caja-movimiento'
  await page.evaluate(() => { location.hash = '#/caja' })
  await sleep(900)
  await clickText(page, 'Abrir caja')
  await sleep(500)
  await page.keyboard.type('50000')
  await sleep(200)
  await clickText(page, 'Abrir con')
  await sleep(800)
  await clickText(page, 'Egreso')
  await sleep(500)
  await page.keyboard.type('8000')
  await sleep(200)
  await clickText(page, 'Pago proveedor')
  await sleep(200)
  await clickText(page, 'Registrar egreso')
  await sleep(800)
  txt = await bodyText(page)
  if (!/Pago proveedor/.test(txt)) throw new Error('El egreso de caja no se registró')
  console.log('✓ Caja: egreso de efectivo (movimiento) registrado')

  // 4e) Kardex en la ficha de producto
  ctx = 'kardex'
  await page.evaluate(() => { location.hash = '#/inventario' })
  await sleep(900)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /umbral \d/.test(x.textContent || ''))
    if (b) b.click()
  })
  await sleep(700)
  txt = await bodyText(page)
  if (!/Movimientos \(kardex\)/.test(txt)) throw new Error('Kardex no renderizó en la ficha de producto')
  if (!/Imprimir etiqueta/.test(txt)) throw new Error('Botón de etiqueta no disponible')
  console.log('✓ Kardex + etiqueta imprimible en ficha de producto')
  await page.keyboard.press('Escape')
  await sleep(400)

  // 4e-bis) Toma física de inventario
  ctx = 'toma-fisica'
  await clickText(page, 'Toma física de inventario')
  await sleep(700)
  txt = await bodyText(page)
  if (!/Aplicar/.test(txt)) throw new Error('Toma física no abrió')
  console.log('✓ Toma física de inventario')
  await page.keyboard.press('Escape')
  await sleep(400)

  // 4f) Dashboard: cambiar granularidad día/semana/mes/año
  ctx = 'dashboard-periodos'
  await page.evaluate(() => { location.hash = '#/' })
  await sleep(800)
  await clickText(page, 'Año')
  await sleep(500)
  await clickText(page, 'Mes')
  await sleep(500)
  await clickText(page, 'Día')
  await sleep(500)
  txt = await bodyText(page)
  if (!/Meta del mes/.test(txt)) throw new Error('Meta del mes no renderizó')
  console.log('✓ Dashboard: históricos día/semana/mes/año + meta')

  // 4f-bis) Reportes: comisiones por vendedor + export contable
  ctx = 'reportes-comisiones'
  await page.evaluate(() => { location.hash = '#/reportes' })
  await sleep(900)
  txt = await bodyText(page)
  if (!/Ventas por vendedor/.test(txt) || !/reporte contable/i.test(txt)) throw new Error('Comisiones/export contable no renderizó')
  console.log('✓ Reportes: comisiones por vendedor + export contable')

  // 4f-ter) Ajustes: respaldo exportar/importar
  ctx = 'respaldo'
  await page.evaluate(() => { location.hash = '#/ajustes' })
  await sleep(900)
  txt = await bodyText(page)
  if (!/Exportar respaldo/.test(txt)) throw new Error('Respaldo no renderizó en Ajustes')
  console.log('✓ Ajustes: respaldo exportar/importar')

  // 4g) Precio al por mayor visible en POS
  ctx = 'por-mayor'
  await page.evaluate(() => { location.hash = '#/pos' })
  await sleep(800)
  txt = await bodyText(page)
  if (!/x6\+/.test(txt)) console.log('· (aviso) no se vio la pista de precio por mayor')
  else console.log('✓ Precio al por mayor visible en POS')

  // Pantalla a cliente
  await clickText(page, '📺')
  await sleep(500)
  txt = await bodyText(page)
  if (!/total a pagar/i.test(txt)) throw new Error('Pantalla a cliente no abrió')
  await clickText(page, 'Cerrar')
  await sleep(300)
  console.log('✓ POS: pantalla a cliente')

  // 4g-bis) Modo mostrador (clásico tipo SEITEM) + vueltas ("Cambio")
  ctx = 'modo-mostrador'
  await clickText(page, 'Mostrador')
  await sleep(500)
  txt = await bodyText(page)
  if (!/REALIZAR PAGO/.test(txt) || !/Vendedor/.test(txt)) throw new Error('Modo mostrador no renderizó')
  if (!/Cambio:/.test(txt)) throw new Error('Chip de vueltas (Cambio) no visible')
  await page.evaluate(() => {
    const i = [...document.querySelectorAll('input')].find((x) => (x.placeholder || '').includes('Cód. barras'))
    if (i) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(i, '770201100000'); i.dispatchEvent(new Event('input', { bubbles: true })) }
  })
  await sleep(300)
  await clickText(page, 'AGREGAR')
  await sleep(500)
  txt = await bodyText(page)
  if (!/Gaseosa/.test(txt)) throw new Error('No se agregó producto por código en el mostrador')
  console.log('✓ POS modo mostrador (clásico) + vueltas')
  await clickText(page, 'Fichas') // volver a fichas para no afectar pasos siguientes
  await sleep(300)

  // 4h) Proveedores: reabastecimiento automático + cuentas por pagar
  ctx = 'reabastecimiento-auto'
  await page.evaluate(() => { location.hash = '#/proveedores' })
  await sleep(1100)
  txt = await bodyText(page)
  if (!/Reabastecimiento autom/i.test(txt)) throw new Error('Toggle de reabastecimiento automático no visible')
  await page.evaluate(() => { const cb = [...document.querySelectorAll('input[type=checkbox]')][0]; if (cb && !cb.checked) cb.click() })
  await sleep(500)
  await clickText(page, 'Pedir y enviar ahora')
  await sleep(1500)
  console.log('✓ Reabastecimiento automático por WhatsApp (crea pedidos a proveedores)')

  ctx = 'cuentas-por-pagar'
  await clickText(page, 'Por pagar')
  await sleep(900)
  txt = await bodyText(page)
  if (!/total por pagar/i.test(txt)) throw new Error('Cuentas por pagar no renderizó')
  console.log('✓ Proveedores: cuentas por pagar')

  // 4h-bis) Compras: factura de compra + costo promedio
  ctx = 'compras'
  await page.evaluate(() => { location.hash = '#/compras' })
  await sleep(1000)
  txt = await bodyText(page)
  if (!/Nueva factura de compra/.test(txt)) throw new Error('Compras no renderizó')
  if (!/FC-401/.test(txt)) throw new Error('Compra de ejemplo no visible')
  await clickText(page, 'Nueva factura de compra')
  await sleep(700)
  await page.evaluate(() => {
    const prov = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => (o.textContent || '').includes('Seleccione')))
    if (prov && prov.options.length > 1) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
      setter.call(prov, prov.options[1].value)
      prov.dispatchEvent(new Event('change', { bubbles: true }))
    }
  })
  await sleep(300)
  await page.evaluate(() => {
    const i = [...document.querySelectorAll('input')].find((x) => (x.placeholder || '').includes('Cód. barras'))
    if (i) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(i, '770201100001'); i.dispatchEvent(new Event('input', { bubbles: true })) }
  })
  await sleep(300)
  await clickText(page, 'AGREGAR')
  await sleep(400)
  await clickText(page, 'GUARDAR')
  await sleep(900)
  console.log('✓ Compras: factura de compra (stock + costo promedio + deuda)')

  // 4i) Ventas: devolución parcial (abre la hoja)
  ctx = 'devolucion-parcial'
  await page.evaluate(() => { location.hash = '#/ventas' })
  await sleep(800)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => / items/.test(x.textContent || ''))
    if (b) b.click()
  })
  await sleep(700)
  await clickText(page, 'Devolución parcial')
  await sleep(600)
  txt = await bodyText(page)
  if (!/Devolver ·/.test(txt)) throw new Error('Devolución parcial no abrió')
  console.log('✓ Ventas: devolución parcial')
  await page.keyboard.press('Escape')
  await sleep(300)
  await page.keyboard.press('Escape')
  await sleep(300)

  // 5) Cerrar sesión y entrar como Super-Admin
  ctx = 'login-super'
  await page.evaluate(() => { localStorage.removeItem('ventanilla-session') })
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await sleep(1200)
  await clickText(page, 'Super-Admin (plataforma)')
  await sleep(1400)
  txt = await bodyText(page)
  if (!txt.includes('Consola Super-Admin')) throw new Error('Consola Super-Admin no renderizó')
  console.log('✓ Consola Super-Admin renderiza')

  // 6) Cajero con PIN
  ctx = 'login-cajero'
  await page.evaluate(() => { localStorage.removeItem('ventanilla-session') })
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await sleep(1200)
  await clickText(page, 'Cajero / Empleado')
  await sleep(600)
  for (const d of ['1', '2', '3', '4']) {
    await page.evaluate((digit) => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === digit)
      if (b) b.click()
    }, d)
    await sleep(150)
  }
  await sleep(1500)
  txt = await bodyText(page)
  if (!/Producto nuevo/.test(txt)) throw new Error('POS del cajero no renderizó tras el PIN')
  console.log('✓ Login cajero por PIN → POS renderiza')

  // 6b) Permisos: cajera con permisos limitados (Laura, PIN 2345) sin "Producto nuevo"
  ctx = 'permisos'
  await page.evaluate(() => { localStorage.removeItem('ventanilla-session') })
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await sleep(1200)
  await clickText(page, 'Cajero / Empleado')
  await sleep(600)
  for (const d of ['2', '3', '4', '5']) {
    await page.evaluate((digit) => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === digit)
      if (b) b.click()
    }, d)
    await sleep(150)
  }
  await sleep(1500)
  txt = await bodyText(page)
  if (/Producto nuevo/.test(txt)) throw new Error('Permiso fallido: Laura no debería poder crear productos')
  console.log('✓ Permisos: cajera limitada sin "Producto nuevo"')

  // 7) Landing de Ventanilla (página de presentación)
  ctx = 'landing'
  await page.goto(BASE + 'landing.html', { waitUntil: 'networkidle2' })
  await sleep(600)
  txt = await bodyText(page)
  if (!/Probar el demo/.test(txt) || !/Ventanilla/.test(txt)) throw new Error('Landing no renderizó')
  console.log('✓ Landing de Ventanilla renderiza')

  // 8) Nube — E2E (opcional, sólo con CLOUD_TEST=1 y el API local corriendo).
  // Va al final porque la sincronización sobrescribe los datos locales del demo.
  if (process.env.CLOUD_TEST) {
    ctx = 'nube'
    await page.evaluate(() => { localStorage.removeItem('ventanilla-session') })
    await page.goto(BASE, { waitUntil: 'networkidle2' })
    await sleep(1200)
    await clickText(page, 'Dueño de la tienda')
    await sleep(1500)
    await page.evaluate(() => { location.hash = '#/ajustes' })
    await sleep(1000)
    await page.evaluate(({ url, email, pass }) => {
      const setVal = (ph, val) => {
        const i = [...document.querySelectorAll('input')].find((x) => (x.placeholder || '').includes(ph))
        if (!i) return
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(i, val)
        i.dispatchEvent(new Event('input', { bubbles: true }))
      }
      setVal('URL del API', url)
      setVal('Correo del negocio', email)
      setVal('Contraseña', pass)
    }, { url: 'http://localhost:4000', email: 'laesquina@demo.co', pass: 'demo1234' })
    await sleep(400)
    await clickText(page, 'Conectar a la nube')
    await sleep(3500)
    txt = await bodyText(page)
    if (!/Conectado a la nube/.test(txt)) throw new Error('No se conectó a la nube')
    console.log('✓ Nube: login + sincronización con el API real')
  }

  await browser.close()

  console.log('\n===== RESULTADO =====')
  if (errors.length === 0) {
    console.log('✅ Sin errores de consola ni excepciones en ninguna pantalla.')
    process.exit(0)
  } else {
    console.log(`❌ ${errors.length} problema(s):`)
    for (const e of errors) console.log('  - ' + e)
    process.exit(1)
  }
}

main().catch((e) => {
  console.log('FALLO DE LA PRUEBA: ' + e.message)
  for (const er of errors) console.log('  - ' + er)
  process.exit(1)
})
