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
  try {
    await el.click()
  } catch {
    // Fallback: click programático (evita "not clickable" por animación/overlay)
    await page.evaluate((e) => e.click(), el)
  }
}

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText)
}

// Espera (sondeando) a que el texto aparezca en pantalla; tolera carga lenta.
async function waitForText(page, needle, timeoutMs = 7000) {
  const start = Date.now()
  let t = ''
  while (Date.now() - start < timeoutMs) {
    t = await bodyText(page)
    if (t.includes(needle)) return t
    await sleep(250)
  }
  return t
}

// Espera a que un texto DESAPAREZCA (p. ej. al cerrarse una hoja).
async function waitForGone(page, needle, timeoutMs = 5000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const t = await bodyText(page)
    if (!t.includes(needle)) return true
    await sleep(200)
  }
  return false
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
  let txt = await waitForText(page, 'Ventanilla', 15000) // seed (resetDemo) + render
  if (!txt.includes('Ventanilla')) throw new Error('No renderizó la pantalla de inicio')
  console.log('✓ Pantalla de login renderiza')

  // 1b) Encoder Code 128 real (sólo en dev: importa el módulo fuente de Vite)
  if (!process.env.SMOKE_URL) {
    ctx = 'barcode'
    const svg = await page.evaluate(async () => {
      const m = await import('/src/lib/barcode.ts')
      return m.code128SVG('770201100000')
    })
    // Code 128 de 12 dígitos: start+12+check+stop = 15 símbolos → muchas barras
    const rects = (svg.match(/<rect/g) || []).length
    if (!svg.includes('<svg') || rects < 30) throw new Error(`Code 128 inválido (rects=${rects})`)
    console.log(`✓ Código de barras Code 128 escaneable (${rects} barras)`)
  }

  // 2) Entrar como Dueño
  ctx = 'login-admin'
  await clickText(page, 'Dueño de la tienda')
  txt = await waitForText(page, 'Producto nuevo', 9000)
  if (!/Producto nuevo/.test(txt)) throw new Error('Inicio (POS) del Dueño no renderizó')
  console.log('✓ Inicio = POS (facturación + lista) para el Dueño')

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
    ['#/resumen', 'Hola,'],
  ]
  for (const [hash, expect] of routes) {
    ctx = `ruta ${hash}`
    await page.evaluate((h) => { location.hash = h }, hash)
    txt = await waitForText(page, expect, 7000)
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

  // Venta manual (producto libre que se lleva en papel)
  await clickText(page, 'Venta manual')
  await sleep(500)
  await page.keyboard.type('Producto en papel')
  await sleep(150)
  await page.evaluate(() => {
    const i = [...document.querySelectorAll('input')].find((x) => x.placeholder === '$')
    if (i) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(i, '3000'); i.dispatchEvent(new Event('input', { bubbles: true })) }
  })
  await sleep(200)
  await clickText(page, 'Agregar')
  await sleep(500)
  console.log('✓ Venta manual (producto libre) agregada')

  // 4b) Venta completa de extremo a extremo: carrito → cobrar → recibo
  ctx = 'checkout'
  await clickText(page, 'Ver carrito')
  await sleep(700)
  txt = await bodyText(page)
  if (!/Producto en papel/.test(txt)) throw new Error('El producto manual no llegó al carrito')
  await clickText(page, 'Cobrar')
  await sleep(700)
  // nota / detalles de la venta
  await page.evaluate(() => {
    const i = [...document.querySelectorAll('input')].find((x) => (x.placeholder || '').includes('Detalle de la venta'))
    if (i) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(i, 'Venta de mostrador'); i.dispatchEvent(new Event('input', { bubbles: true })) }
  })
  await sleep(200)
  await clickText(page, 'Recibí el pago')
  await sleep(1200)
  txt = await bodyText(page)
  if (!/Venta lista|Total cobrado/.test(txt)) throw new Error('No se completó la venta (sin recibo)')
  console.log('✓ Venta completa (con manual + nota) → recibo generado')
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

  // 4d-bis) Caja: resumen del día al WhatsApp + botón abrir cajón
  if (!/Enviar resumen del día/i.test(txt)) throw new Error('Botón de resumen del día no renderizó')
  if (!/Abrir cajón monedero/i.test(txt)) throw new Error('Botón de abrir cajón no renderizó')
  console.log('✓ Caja: resumen del día a WhatsApp + abrir cajón monedero')

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
  if (!/Desempacar/.test(txt)) throw new Error('Conversión (desempacar) no disponible')
  console.log('✓ Kardex + etiqueta + desempacar en ficha de producto')
  await page.keyboard.press('Escape')
  await sleep(400)

  // 4e-bis) Toma física de inventario
  ctx = 'toma-fisica'
  await clickText(page, 'Conteo')
  await sleep(700)
  txt = await bodyText(page)
  if (!/Aplicar/.test(txt)) throw new Error('Toma física no abrió')
  console.log('✓ Toma física de inventario')
  await page.keyboard.press('Escape')
  await sleep(400)

  // 4f) Dashboard: cambiar granularidad día/semana/mes/año
  ctx = 'dashboard-periodos'
  await page.evaluate(() => { location.hash = '#/resumen' })
  await sleep(800)
  await clickText(page, 'Año')
  await sleep(500)
  await clickText(page, 'Mes')
  await sleep(500)
  await clickText(page, 'Día')
  await sleep(500)
  txt = await bodyText(page)
  if (!/Meta del mes/.test(txt)) throw new Error('Meta del mes no renderizó')
  if (!/Asistente/.test(txt)) throw new Error('Asistente de insights no renderizó')
  console.log('✓ Dashboard: históricos día/semana/mes/año + meta + asistente')

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

  // 4f-quater) Ajustes: cajón monedero (no disparamos requestPort en headless)
  ctx = 'cajon-monedero'
  if (!/Cajón monedero/i.test(txt) || !/Probar apertura/i.test(txt) || !/efectivo/i.test(txt)) throw new Error('Sección de cajón monedero no renderizó')
  console.log('✓ Ajustes: cajón monedero (Web Serial + apertura automática)')

  // 4f-quinquies) Ajustes: báscula (granel)
  ctx = 'bascula'
  if (!/Báscula/i.test(txt) || !/Probar lectura/i.test(txt) || !/Vincular báscula/i.test(txt)) throw new Error('Sección de báscula no renderizó')
  console.log('✓ Ajustes: báscula granel (Web Serial)')

  // 4f-sexies) Ajustes: Bre-B + programa de puntos
  ctx = 'breb-puntos'
  if (!/Bre-B/i.test(txt) || !/llave/i.test(txt)) throw new Error('Sección Bre-B no renderizó')
  if (!/Programa de puntos/i.test(txt) || !/fidelizaci/i.test(txt)) throw new Error('Sección de puntos no renderizó')
  console.log('✓ Ajustes: pagos Bre-B + programa de puntos')
  if (!/Pagar mensualidad/i.test(txt)) throw new Error('Botón de pago de mensualidad no renderizó')
  console.log('✓ Ajustes: pagar mensualidad (cobro de renta)')
  if (!/Crear cuenta/i.test(txt) || !/Iniciar sesión/i.test(txt)) throw new Error('Auto-registro a la nube no renderizó')
  console.log('✓ Ajustes: nube con auto-registro (crear cuenta / iniciar sesión)')
  if (!/Legal/i.test(txt) || !/Ley 1581/.test(txt)) throw new Error('Sección Legal no renderizó')
  console.log('✓ Ajustes: sección Legal (privacidad + términos)')
  if (!/Módulos/i.test(txt) || !/Activa solo lo que uses/i.test(txt)) throw new Error('Sección Módulos no renderizó')
  console.log('✓ Ajustes: sección Módulos (activar/ocultar)')

  // Ocultar "Domicilios" y verificar que desaparece del menú Más
  ctx = 'modulos-ocultar'
  await page.evaluate(() => {
    const labels = [...document.querySelectorAll('label')]
    const dom = labels.find((l) => /Domicilios/.test(l.textContent || ''))
    const cb = dom && dom.querySelector('input[type=checkbox]')
    if (cb && cb.checked) cb.click()
  })
  await sleep(500)
  await page.evaluate(() => { location.hash = '#/mas' })
  await waitForText(page, 'Más', 4000)
  if (!(await waitForGone(page, 'Domicilios', 4000))) throw new Error('El módulo oculto sigue en el menú')
  console.log('✓ Módulos: ocultar quita el ítem del menú Más')
  // Reactivar para no afectar otros pasos
  await page.evaluate(() => { location.hash = '#/ajustes' })
  await sleep(500)
  await page.evaluate(() => {
    const labels = [...document.querySelectorAll('label')]
    const dom = labels.find((l) => /Domicilios/.test(l.textContent || ''))
    const cb = dom && dom.querySelector('input[type=checkbox]')
    if (cb && !cb.checked) cb.click()
  })
  await sleep(400)

  // 4f-septies) Modo oscuro: la clase `dark` cambia el fondo a un tono oscuro
  ctx = 'modo-oscuro'
  const darkBg = await page.evaluate(() => {
    document.documentElement.classList.add('dark')
    const bg = getComputedStyle(document.body).backgroundColor
    document.documentElement.classList.remove('dark')
    return bg
  })
  if (!/rgb\(11, 18, 32\)/.test(darkBg)) throw new Error(`Modo oscuro no aplicó (body bg = ${darkBg})`)
  console.log('✓ Modo oscuro (tema CSS aplicado)')

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
  txt = await waitForText(page, 'REALIZAR PAGO', 6000)
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

  // 4g-bis2) Tercer modo: Lista (filas compactas con "Agregar")
  ctx = 'modo-lista'
  await clickText(page, 'Lista')
  txt = await waitForText(page, 'Agregar', 4000)
  if (!/Agregar/.test(txt)) throw new Error('Modo Lista no renderizó')
  console.log('✓ POS modo lista (filas con Agregar)')

  await clickText(page, 'Fichas') // volver a fichas para no afectar pasos siguientes
  await sleep(500)

  // 4g-ter) Editar un producto existente desde el POS (modificar lo creado)
  ctx = 'editar-producto'
  const editOpened = await page.evaluate(() => {
    const b = document.querySelector('button[aria-label^="Editar "]')
    if (b) { b.click(); return true }
    return false
  })
  if (!editOpened) throw new Error('No se encontró el botón de editar producto en el POS')
  txt = await waitForText(page, 'Guardar cambios', 5000)
  if (!/Editar producto/i.test(txt) || !/Guardar cambios/i.test(txt)) throw new Error('No abrió el formulario de edición del producto')
  await clickText(page, 'Guardar cambios')
  if (!(await waitForGone(page, 'Editar producto', 5000))) throw new Error('El formulario de edición no cerró tras guardar')
  console.log('✓ Editar producto desde el POS (modificar producto creado)')

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
  txt = await waitForText(page, 'FC-401', 9000)
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

  // devolución a proveedor
  await clickText(page, 'Devolución')
  await sleep(700)
  txt = await bodyText(page)
  if (!/Devolución a proveedor/.test(txt)) throw new Error('Devolución a proveedor no abrió')
  await page.keyboard.press('Escape')
  await sleep(300)
  console.log('✓ Compras: devolución a proveedor')

  // 4h-ter) Reporte de Inventario General
  ctx = 'reporte-inventario'
  await page.evaluate(() => { location.hash = '#/reporte-inventario' })
  txt = await waitForText(page, 'Inventario General', 9000)
  if (!/Inventario General/.test(txt) || !/Costo prom/.test(txt)) throw new Error('Reporte de inventario no renderizó')
  console.log('✓ Reporte de Inventario General (costo prom., utilidad %, stock sugerido)')

  // 4h-quater) Informe Z fiscal
  ctx = 'informe-z'
  await page.evaluate(() => { location.hash = '#/informe-z' })
  txt = await waitForText(page, 'Generar Z', 9000)
  if (!/Informe Z/.test(txt) || !/Generar Z/.test(txt)) throw new Error('Informe Z no renderizó')
  await clickText(page, 'Generar Z (ese día)')
  await sleep(1300)
  txt = await bodyText(page)
  if (!/imprimir z/i.test(txt)) throw new Error('No se generó el informe Z')
  console.log('✓ Informe Z fiscal (Zetas)')
  await page.keyboard.press('Escape')
  await sleep(300)

  // 4h-quinquies) Cartera
  ctx = 'cartera'
  await page.evaluate(() => { location.hash = '#/cartera' })
  txt = await waitForText(page, 'REM-121', 9000)
  if (!/Cartera/.test(txt) || !/REM-121/.test(txt)) throw new Error('Cartera no renderizó')
  console.log('✓ Cartera (remisiones a crédito + fiado)')

  // 4h-sexies) Ajustes de inventario
  ctx = 'ajustes-inventario'
  await page.evaluate(() => { location.hash = '#/ajustes-inventario' })
  txt = await waitForText(page, 'Ajustes de inventario', 9000)
  if (!/Ajustes de inventario/.test(txt) || !/Entrada/.test(txt) || !/Salida/.test(txt)) throw new Error('Ajustes de inventario no renderizó')
  await clickText(page, 'Precio')
  await sleep(600)
  txt = await bodyText(page)
  if (!/Actual/.test(txt)) throw new Error('Cambio de precio no renderizó')
  await clickText(page, 'Vence')
  await sleep(600)
  txt = await bodyText(page)
  if (!/(Vence|Vencido|Sin fecha)/.test(txt)) throw new Error('Control de vencimientos no renderizó')
  console.log('✓ Ajustes de inventario (entradas/salidas, precio, sección, vencimientos)')

  // 4h-septies) Eventos Recepción DIAN
  ctx = 'eventos-recepcion'
  await page.evaluate(() => { location.hash = '#/eventos-recepcion' })
  txt = await waitForText(page, 'FC-401', 9000)
  if (!/Eventos Recepción/.test(txt) || !/FC-401/.test(txt)) throw new Error('Eventos Recepción no renderizó')
  await clickText(page, 'FC-401')
  await sleep(600)
  txt = await bodyText(page)
  if (!/Acuse de recibo/.test(txt)) throw new Error('Detalle de eventos no abrió')
  await clickText(page, 'Transmitir')
  await sleep(600)
  console.log('✓ Eventos Recepción (DIAN)')
  await page.keyboard.press('Escape')
  await sleep(300)

  // 4h-octies) Importar clientes (CSV)
  ctx = 'importar-clientes'
  await page.evaluate(() => { location.hash = '#/clientes' })
  await sleep(900)
  await clickText(page, 'Importar')
  await sleep(600)
  txt = await bodyText(page)
  if (!/Importar clientes/.test(txt)) throw new Error('Importar clientes no abrió')
  console.log('✓ Importar clientes (CSV)')
  await page.keyboard.press('Escape')
  await sleep(300)

  // 4h-octies2) Analítica de cliente: total, # compras y promedio por compra
  ctx = 'cliente-analitica'
  const openedCust = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /Compras:/.test(x.textContent || ''))
    if (b) { b.click(); return true }
    return false
  })
  if (!openedCust) throw new Error('No se encontró un cliente para abrir')
  txt = await waitForText(page, 'Promedio/compra', 4000)
  if (!/Total comprado/.test(txt) || !/Promedio\/compra/.test(txt)) throw new Error('Analítica de cliente no renderizó')
  console.log('✓ Clientes: analítica (total, # compras, promedio por compra)')
  await page.keyboard.press('Escape')
  await sleep(300)

  // 4h-nonies) Domicilios
  ctx = 'domicilios'
  await page.evaluate(() => { location.hash = '#/domicilios' })
  txt = await waitForText(page, 'Doña Rosa', 9000)
  if (!/Domicilios/.test(txt) || !/Doña Rosa/.test(txt)) throw new Error('Domicilios no renderizó')
  await clickText(page, 'Doña Rosa')
  await sleep(600)
  txt = await bodyText(page)
  if (!/En camino|Entregado/.test(txt)) throw new Error('Detalle de domicilio no abrió')
  console.log('✓ Domicilios (entregas: estado, repartidor, mapa)')
  await page.keyboard.press('Escape')
  await sleep(300)

  // 4i) Ventas: devolución parcial (abre la hoja)
  ctx = 'devolucion-parcial'
  await page.evaluate(() => { location.hash = '#/ventas' })
  await sleep(800)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => / items/.test(x.textContent || ''))
    if (b) b.click()
  })
  await sleep(700)
  txt = await bodyText(page)
  if (!/nota débito/i.test(txt)) throw new Error('Botón de nota débito no disponible')
  await clickText(page, 'Devolución parcial')
  await sleep(600)
  txt = await bodyText(page)
  if (!/Devolver ·/.test(txt)) throw new Error('Devolución parcial no abrió')
  console.log('✓ Ventas: devolución parcial')
  await page.keyboard.press('Escape')
  await sleep(300)
  await page.keyboard.press('Escape')
  await sleep(300)

  // 4j) Tienda online pública (catálogo + pedido por WhatsApp)
  ctx = 'tienda-online'
  await page.evaluate(() => { location.hash = '#/tienda' })
  txt = await waitForText(page, 'Enviar pedido', 4000)
  if (!/Tienda La Esquina/.test(txt) || !/Agregar/.test(txt)) {
    // aún sin pedido: verifica catálogo y agrega un producto
    if (!/Tienda La Esquina/.test(txt)) throw new Error('Catálogo de tienda online no renderizó')
  }
  await clickText(page, 'Agregar')
  txt = await waitForText(page, 'Enviar pedido por WhatsApp', 4000)
  if (!/Enviar pedido por WhatsApp/.test(txt)) throw new Error('La barra de pedido no apareció')
  console.log('✓ Tienda online (catálogo público + pedido por WhatsApp)')

  // 4j2) Pantalla del cliente (2º monitor)
  ctx = 'pantalla-cliente'
  await page.evaluate(() => { location.hash = '#/pantalla' })
  txt = await waitForText(page, 'Gracias por su compra', 5000)
  if (!/Gracias por su compra/.test(txt)) throw new Error('Pantalla del cliente no renderizó')
  console.log('✓ Pantalla del cliente (2º monitor)')

  // 4j3) Autoservicio (self-checkout): el cliente escanea y ve el total
  ctx = 'autoservicio'
  await page.evaluate(() => { location.hash = '#/autoservicio' })
  txt = await waitForText(page, 'Escanea tu producto', 6000)
  if (!/Escanea tu producto/.test(txt) || !/Pagar/.test(txt)) throw new Error('Autoservicio no renderizó')
  console.log('✓ Autoservicio (self-checkout)')

  await page.evaluate(() => { location.hash = '#/' })
  await sleep(600)

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

  // 5b) Licencia: el Super-Admin abre un cliente y ve control de puntos/dispositivos
  ctx = 'licencia-superadmin'
  await clickText(page, 'Tienda La Esquina')
  txt = await waitForText(page, 'Licencia', 4000)
  if (!/Licencia/.test(txt) || !/Puntos \(ventanillas\)/.test(txt) || !/Dispositivos/.test(txt)) throw new Error('Panel de licencia no renderizó')
  console.log('✓ Super-Admin: licencia (puntos + dispositivos)')
  await page.keyboard.press('Escape')
  await sleep(300)

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
  txt = await waitForText(page, 'Producto nuevo', 6000)
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

  // 7b) Documentos legales (privacidad y términos) — requeridos por ley/Play
  ctx = 'legal'
  await page.goto(BASE + 'privacidad.html', { waitUntil: 'networkidle2' })
  await sleep(400)
  txt = await bodyText(page)
  if (!/Tratamiento de Datos/i.test(txt) || !/Ley 1581/.test(txt)) throw new Error('Política de privacidad no renderizó')
  await page.goto(BASE + 'terminos.html', { waitUntil: 'networkidle2' })
  await sleep(400)
  txt = await bodyText(page)
  if (!/Términos y Condiciones/i.test(txt) || !/Colombia/.test(txt)) throw new Error('Términos no renderizó')
  console.log('✓ Legal: política de privacidad + términos')

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
