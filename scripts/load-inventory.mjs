// Carga el inventario del primer cliente en producción: crea la cuenta (con sus
// defaults: local + categorías), arma los productos con precios conocidos y los
// sube por /sync. Sin códigos de barra (se asignan escaneando el producto real).
import { writeFileSync } from 'node:fs'

const API = process.env.API || 'https://ventanilla-api-vvzh.onrender.com'
const SA_EMAIL = 'Lordmauricio22@gmail.com'
const SA_PASS = 'Mauricio071182.'
const CLIENT = { businessName: 'Tienda Cliente 1', ownerName: 'Mr Melo', email: 'tienda1@ventanilla.co', password: 'tienda1234', city: 'Armenia, Quindío' }

// [nombre, categoría, precio venta COP]. costo ≈ 78% (editable).
const P = [
  // --- BEBIDAS: gaseosas Postobón ---
  ['PEPSI 2.5', 'Bebidas', 5500], ['COLOMBIANA 2.5', 'Bebidas', 5500], ['MANZANA 2.5', 'Bebidas', 5500],
  ['PEPSI 1.5', 'Bebidas', 4000], ['COLOMBIANA 1.5', 'Bebidas', 4000], ['MANZANA 1.5', 'Bebidas', 4000],
  ['GINGER 1.5', 'Bebidas', 4000], ['BRETAÑA 1.5', 'Bebidas', 3500],
  ['MR TEA DURAZNO 1.5', 'Bebidas', 4500], ['MR TEA LIMON 1.5', 'Bebidas', 4500],
  ['PEPSI 400ML', 'Bebidas', 2000], ['COLOMBIANA 400ML', 'Bebidas', 2000], ['MANZANA 400ML', 'Bebidas', 2000],
  ['UVA 400ML', 'Bebidas', 2000], ['NARANJA 400ML', 'Bebidas', 2000], ['NARANJA 1.5', 'Bebidas', 4000], ['UVA 1.5', 'Bebidas', 4000],
  ['BRETAÑA 300ML', 'Bebidas', 1500],
  ['H2O 600ML LIMA LIMON', 'Bebidas', 3000], ['H2O 600ML LIMONATA', 'Bebidas', 3000], ['H2O 600ML MARACUYA', 'Bebidas', 3000],
  ['GATORADE TROPICAL 500ML', 'Bebidas', 3500], ['GATORADE MARACUYA 500ML', 'Bebidas', 3500],
  ['GATORADE MANDARINA 500ML', 'Bebidas', 3500], ['GATORADE ICE BLUE 500ML', 'Bebidas', 3500], ['GATORADE TROPICAL 1LT', 'Bebidas', 5500],
  ['SPEED MAX LITROS', 'Bebidas', 4000], ['SPEED MAX 250ML', 'Bebidas', 2000], ['SPEED MAX LATA', 'Bebidas', 2500],
  ['AGUA GAS 600ML', 'Bebidas', 2000], ['AGUA LITROS', 'Bebidas', 2000], ['AGUA 600ML', 'Bebidas', 1500],
  ['AGUA 300ML', 'Bebidas', 1000], ['AGUA 250ML CON GAS', 'Bebidas', 2000], ['AGUA 6 LITROS BOLSA', 'Bebidas', 3500],
  ['TAMARINDO 1.5', 'Bebidas', 4000], ['TAMARINDO 250ML', 'Bebidas', 1500],
  ['HIT LITRO MANGO', 'Bebidas', 3500], ['HIT LITRO MORA', 'Bebidas', 3500], ['HIT LITRO NARANJA P', 'Bebidas', 3500],
  ['HIT LITRO TROPICAL', 'Bebidas', 3500], ['HIT LITRO LULO', 'Bebidas', 3500],
  ['HIT 500ML NARANJA P', 'Bebidas', 2000], ['HIT 500ML MORA', 'Bebidas', 2000], ['HIT 500ML TROPICAL', 'Bebidas', 2000],
  ['HIT 500ML LULO', 'Bebidas', 2000], ['HIT 500ML MANGO', 'Bebidas', 2000], ['HIT 200ML SURTIDOS', 'Bebidas', 1000],
  ['SODA HATSU ROSADO', 'Bebidas', 3500], ['RED BULL 250ML LATA', 'Bebidas', 5500],
  ['MR TEA DURAZNO 500ML', 'Bebidas', 2500], ['MR TEA LIMON 500ML', 'Bebidas', 2500],
  ['TE HATSU NEGRO 250ML', 'Bebidas', 3000], ['TE HATSU BLANCO 250ML', 'Bebidas', 3000],
  ['ACQUA ROJA 400ML', 'Bebidas', 2500], ['ACQUA VERDE 400ML', 'Bebidas', 2500],
  // --- BEBIDAS: Coca-Cola / Femsa ---
  ['COCA COLA 2.25 LT', 'Bebidas', 6500], ['COCA COLA 2LT RP', 'Bebidas', 6000], ['COCA COLA 1.5 ORIGINAL', 'Bebidas', 4500],
  ['COCA COLA 400 ORIGINAL', 'Bebidas', 2500], ['COCA COLA MINI', 'Bebidas', 2000], ['COCA COLA 1.5 ZERO', 'Bebidas', 4500],
  ['COCA COLA 400ML ZERO', 'Bebidas', 2500], ['COCA COLA 330ML LATA', 'Bebidas', 2800], ['FANTA NARANJA 235ML LATA', 'Bebidas', 2000],
  ['QUATRO 1.5', 'Bebidas', 4500], ['QUATRO 400', 'Bebidas', 2500], ['SPRITE 1.5 LT', 'Bebidas', 4500], ['SPRITE 400', 'Bebidas', 2500],
  ['DEL VALLE NARANJA 1.5', 'Bebidas', 4500], ['DEL VALLE NARANJA 400ML', 'Bebidas', 2500], ['DEL VALLE MANDARINA 1.5', 'Bebidas', 4500],
  ['POWERADE POWER', 'Bebidas', 3000], ['MONSTER', 'Bebidas', 6000], ['AGUA DE MANZANA 600', 'Bebidas', 2500],
  // --- BEBIDAS: Quala ---
  ['VIVE 100 TAPA NEGRA', 'Bebidas', 2000], ['VIVE 100 380 VERDE', 'Bebidas', 2000], ['VIVE 100 380 ROJO', 'Bebidas', 2000],
  ['VIVE 100 380 AZUL', 'Bebidas', 2000], ['VIVE 100 380 MORADO', 'Bebidas', 2000], ['VIVE 100 380 BLANCO', 'Bebidas', 2000],
  ['VIVE 100 PEQUEÑO BLANCO', 'Bebidas', 1500], ['VIVE 100 PEQUEÑO VERDE', 'Bebidas', 1500], ['LIKE BOTELLA 300ML', 'Bebidas', 2000],
  ['QUATES GRANDES', 'Bebidas', 1500], ['QUATES PEQUEÑOS', 'Bebidas', 1000], ['SAVILOE GRANDE', 'Bebidas', 2500],
  ['SAVILOE PEQUEÑO', 'Bebidas', 1500], ['SAVILOE X', 'Bebidas', 2000],
  ['AMPER MANGO', 'Bebidas', 2000], ['AMPER BLANCO', 'Bebidas', 2000], ['AMPER NEGRO', 'Bebidas', 2000], ['AMPER AZUL', 'Bebidas', 2000],
  ['SPARTAN AZUL', 'Bebidas', 2000], ['SPARTAN AMARILLO', 'Bebidas', 2000], ['HIDRALYTE', 'Bebidas', 2500],
  ['FRUTIÑO', 'Bebidas', 500], ['PANELADA', 'Bebidas', 2000], ['SON TE', 'Bebidas', 2000],
  // --- HELADOS ---
  ['ALOHA MANGO BICHE', 'Helados', 2500], ['ALOHA RASPADO', 'Helados', 2000], ['ALOHA NARANJA', 'Helados', 2000], ['ALOHA LIMON', 'Helados', 2000],
  ['BOCATO FRESA', 'Helados', 1500], ['BOCATO JUMBO', 'Helados', 2500],
  ['CHOCOCONO MINI', 'Helados', 1500], ['CHOCOCONO TRADICIONAL', 'Helados', 3000], ['CHOCOCONO MANI', 'Helados', 3000], ['CHOCOCONO CRISPY', 'Helados', 3000],
  ['ARTESANAL MARACUYA', 'Helados', 3000], ['ARTESANAL AREQUIPE', 'Helados', 3000], ['ARTESANAL 3 LECHES', 'Helados', 3000], ['ARTESANAL MORA', 'Helados', 3000],
  ['HELADO CASERO YOGURT MELOCOTON', 'Helados', 2500],
  ['GALLETA NAPOLITANO', 'Helados', 2500], ['GALLETA VAINILLA', 'Helados', 2500], ['GALLETA JUMBO', 'Helados', 3000], ['PALETA JET', 'Helados', 2000],
  ['CASERO MORA', 'Helados', 2000], ['CASERO YOGURT', 'Helados', 2000], ['CASERO COCO', 'Helados', 2000], ['CASERO GUANABANA', 'Helados', 2000], ['CASERO RON CON PASAS', 'Helados', 2500],
  ['POLLET COOKIES AND CREAM', 'Helados', 3500], ['POLLET FRUTOS ROJOS', 'Helados', 3500], ['POLLET CHOCOAVELLANA', 'Helados', 3500],
  ['BONICESSOTE', 'Helados', 1500], ['BONICE', 'Helados', 800],
  // --- LÁCTEOS ---
  ['AVENA', 'Lácteos', 2000], ['YOGURT ORIGINAL MELOCOTON', 'Lácteos', 3500], ['YOGURT ORIGINAL MORA', 'Lácteos', 3500], ['YOGURT ORIGINAL FRESA', 'Lácteos', 3500],
  ['KUMIS', 'Lácteos', 3500], ['REGENERIS PITALLA', 'Lácteos', 3000], ['REGENERIS FRESA', 'Lácteos', 3000], ['REGENERIS MELOCOTON', 'Lácteos', 3000],
  ['YOGO YOGO VASO MORA', 'Lácteos', 1500], ['YOGO YOGO VASO FRESA', 'Lácteos', 1500], ['YOGO YOGO VASO MELOCOTON', 'Lácteos', 1500], ['YOGO YOGO BOLSA', 'Lácteos', 1000],
  ['YOGO PREMIO MORA', 'Lácteos', 2000], ['YOGO PREMIO MELOCOTON', 'Lácteos', 2000], ['YOGO PREMIO FRESA', 'Lácteos', 2000],
  ['ALPINITO', 'Lácteos', 1500], ['GELATINA', 'Lácteos', 1500],
  ['BON YURT ZUCARITAS', 'Lácteos', 3000], ['BON YURT CHOCOCRISPI', 'Lácteos', 3000], ['BON YURT OREO', 'Lácteos', 3000],
  ['BON YURT BOLITAS', 'Lácteos', 3000], ['BON YURT PIAZZA', 'Lácteos', 3000], ['BON YURT MORENITAS', 'Lácteos', 3000],
  ['ALPIN BOTELLA', 'Lácteos', 2500], ['ALPIN CAJA CHOCOLATE', 'Lácteos', 2000], ['ALPIN CAJA FRESA', 'Lácteos', 2000],
  ['ALPIN BOLSA FRESA', 'Lácteos', 1500], ['ALPIN BOLSA CHOCOLATE', 'Lácteos', 1500], ['AREQUIPE', 'Lácteos', 2000],
  // --- MECATO: chocolatinas, galletas, maní ---
  ['JUMBO MANI 17g', 'Mecato', 1000], ['JUMBO MANI 35g', 'Mecato', 1800], ['JUMBO MANI 90g', 'Mecato', 4000], ['JUMBO MIX 60g', 'Mecato', 3000],
  ['GALLETA GOL 28g', 'Mecato', 800], ['GALLETA WAFER NUCITA 22.9g', 'Mecato', 800], ['GALLETA GOL MEGA AREQUIPE', 'Mecato', 1500],
  ['BURBUJET BURBUJA', 'Mecato', 500], ['M&M', 'Mecato', 3500], ['BALON JET', 'Mecato', 2000],
  ['CHOCOLATINA JET COOKIES AND CREAM 11g', 'Mecato', 1000], ['CHOCOLATINA JET COOKIES AND CREAM GRANDE', 'Mecato', 3000],
  ['CHOCOLATINA JET TRADICIONAL', 'Mecato', 1500], ['GALLETA WAFER SABORES', 'Mecato', 800], ['CHOCOLATINA JET SABORES', 'Mecato', 1500],
  ['CHOCOLATINA JET 45g', 'Mecato', 2500], ['CHOCOLATINA JET FRESA 29g', 'Mecato', 1500], ['CHOCOLATINA JET CRUJIVAINILLA 50g', 'Mecato', 2500],
  ['FESTIVAL', 'Mecato', 1000], ['CHOCOLISTO', 'Mecato', 2000], ['TODAY X 3', 'Mecato', 2000],
  ['BIANCHI BARRA 40g', 'Mecato', 1000], ['CHOCOLORES TRULULU', 'Mecato', 500], ['GALLETA OREO TUBO', 'Mecato', 4000], ['COCOSSETTE', 'Mecato', 1500],
  ['KELLOGS ZUCARITAS', 'Mecato', 2500], ['KELLOGS CHOCOCRISPI', 'Mecato', 2500], ['KELLOGS FRUT LOOPS', 'Mecato', 2500],
  // --- ABARROTES ---
  ['NESCAFE SOBRE', 'Abarrotes', 1000], ['NESCAFE X 30G', 'Abarrotes', 6000], ['NESCAFE X 10G', 'Abarrotes', 2500],
  ['CAFE AGUILA ROJA X 50', 'Abarrotes', 1500], ['CAFE AGUILA ROJA X 125', 'Abarrotes', 3500],
  ['LECHERA DOY PACK', 'Abarrotes', 5000], ['LECHERA SOBRE', 'Abarrotes', 2000], ['LECHERA LATA', 'Abarrotes', 5500],
  ['ATUN SOBERANA', 'Abarrotes', 4000], ['ATUN VAN CAMPS AGUA', 'Abarrotes', 5000], ['ATUN VAN CAMPS ACEITE', 'Abarrotes', 5000],
  ['MAYONESA', 'Abarrotes', 3000], ['SALSA ROSADA', 'Abarrotes', 3000], ['SALSA ROJA', 'Abarrotes', 3000], ['SALSA BBQ', 'Abarrotes', 3000],
  ['MANTEQUILLA', 'Abarrotes', 2000], ['GASTRO FAST', 'Abarrotes', 3000], ['SEVEDOL', 'Abarrotes', 1000],
  // --- ASEO / CUIDADO PERSONAL ---
  ['JABON DE BAÑO', 'Aseo', 2500], ['JABON REY', 'Aseo', 2000], ['CLOROX ROPA COLOR', 'Aseo', 4000], ['CLOROX', 'Aseo', 4000],
  ['FABULOSO', 'Aseo', 4000], ['FAB X 450', 'Aseo', 4500], ['FAB X 100', 'Aseo', 1500], ['SUAVITEL', 'Aseo', 4000],
  ['GEL EGO', 'Aseo', 3500], ['SHAMPOO PANTENE', 'Aseo', 2000], ['ALCOHOL', 'Aseo', 3000],
  ['SPEED STICK XTREME NIGHT', 'Aseo', 8000], ['SPEED STICK GEL', 'Aseo', 8000], ['LADY SPEED STICK GEL', 'Aseo', 8000], ['LADY SPEED STICK X 2', 'Aseo', 8000],
  ['BALANS WOMEN', 'Aseo', 8000], ['BALANS MEN', 'Aseo', 8000],
  ['PRESTOBARBA CHICK VERDE', 'Aseo', 1500], ['PRESTOBARBA CHICK ROSADA', 'Aseo', 1500],
  ['PAÑAL ETAPA 3', 'Aseo', 1500], ['PAÑAL ETAPA 4', 'Aseo', 1500], ['PAÑAL ETAPA 5', 'Aseo', 1500],
  // --- MASCOTAS ---
  ['MIRRINGO X 500', 'Mascotas', 5000], ['MIRRINGO X 1000', 'Mascotas', 9000],
  ['NUTRE CAN CACHORRO X 500', 'Mascotas', 5000], ['NUTRE CAN ADULTOS X 800', 'Mascotas', 7000],
  ['RINGO CACHORRO 1 KL', 'Mascotas', 9000], ['RINGO CACHORRO 2 KL', 'Mascotas', 16000], ['RINGO ADULTO 1 KL', 'Mascotas', 8000], ['RINGO ADULTO 2 KL', 'Mascotas', 15000],
  ['CHUNKI GATO', 'Mascotas', 6000], ['CHUNKI PERRO', 'Mascotas', 6000], ['SMART', 'Mascotas', 7000], ['QUIDACAT', 'Mascotas', 7000],
  // --- VARIOS ---
  ['COPAS', 'Varios', 500], ['VASOS', 'Varios', 500], ['CONDON HAWAI', 'Varios', 2000], ['VELAS X UNIDAD', 'Varios', 500],
  ['ENCENDEDOR TOKAI', 'Varios', 2500], ['ENCENDEDOR ELECTRONICO', 'Varios', 3000], ['FOSFOROS', 'Varios', 500],
  ['PILAS AA', 'Varios', 4000], ['PILAS AAA', 'Varios', 4000],
]

async function jpost(path, body, token) {
  const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) })
  return r.json().catch(() => ({}))
}
async function jget(path, token) {
  const r = await fetch(API + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} })
  return r.json().catch(() => ({}))
}
const uid = (p) => `${p}_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2, 6)}`

const sa = await jpost('/auth/login', { email: SA_EMAIL, password: SA_PASS })
if (!sa.token) { console.error('No super-admin token', sa); process.exit(1) }

// crea el cliente (o reutiliza si ya existe)
const created = await jpost('/admin/tenants', CLIENT, sa.token)
console.log('crear cliente:', created.ok ? 'creado' : (created.error || JSON.stringify(created)))

const cl = await jpost('/auth/login', { email: CLIENT.email, password: CLIENT.password })
if (!cl.token) { console.error('No client token', cl); process.exit(1) }

// pull para obtener local + categorías por defecto
const pull = await jget('/sync?since=1970-01-01T00:00:00.000Z', cl.token)
const recs = pull.records || []
const loc = recs.find((r) => r.table === 'locations' && !r.deleted)
const catByName = new Map()
for (const r of recs) if (r.table === 'categories' && !r.deleted) catByName.set(String(r.data.name).toLowerCase(), r.data.id)
const tenantId = loc?.data?.tenantId
const locId = loc?.data?.id
console.log('local:', loc?.data?.name, '| categorías:', catByName.size, '| tenant:', tenantId)
if (!locId) { console.error('Sin local por defecto (¿backend con defaults desplegado?)'); process.exit(1) }

const now = new Date().toISOString()
const records = []
const csv = ['nombre,codigo_barras,categoria,precio,costo,iva,unidad,stock']
let i = 0
for (const [name, cat, price] of P) {
  const pid = uid('p')
  const categoryId = catByName.get(cat.toLowerCase()) || catByName.get('varios') || ''
  const cost = Math.round(price * 0.78)
  records.push({ table: 'products', recordId: pid, data: {
    id: pid, tenantId, name, categoryId, unit: 'unidad', price, cost, ivaRate: 0,
    perishable: false, imageEmoji: '📦', active: true, internalCode: `VEN-${100000 + i}`, createdAt: now,
  } })
  records.push({ table: 'stock', recordId: `${locId}:${pid}`, data: {
    id: `${locId}:${pid}`, tenantId, locationId: locId, productId: pid,
    quantity: 0, reorderThreshold: 4, reorderTarget: 12, updatedAt: now,
  } })
  csv.push([JSON.stringify(name).slice(1, -1), '', cat, price, cost, 0, 'unidad', 0].join(','))
  i++
}

// push en lotes
for (let k = 0; k < records.length; k += 200) {
  const batch = records.slice(k, k + 200)
  const res = await jpost('/sync', { records: batch }, cl.token)
  console.log(`push ${k}-${k + batch.length}: applied=${res.applied}`)
}

writeFileSync('inventario-cliente-1.csv', csv.join('\n'), 'utf8')
console.log(`\n✅ ${P.length} productos cargados en la cuenta ${CLIENT.email}`)
console.log(`CSV de respaldo: scripts/inventario-cliente-1.csv`)
console.log(`Login del cliente → correo: ${CLIENT.email} · clave: ${CLIENT.password}`)
