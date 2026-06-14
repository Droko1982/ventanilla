// Generador de código de barras Code 128 (subconjunto B) como SVG.
// Code 128B codifica ASCII 32..126, así que sirve tanto para los códigos
// numéricos del producto como para los códigos internos tipo "VEN-100000".
// El resultado SÍ es escaneable por cualquier lector estándar.

// Tabla canónica de patrones Code 128 (valores 0..106). Cada patrón son los
// anchos en módulos de barra/espacio/barra/espacio/barra/espacio (el 106 = STOP
// trae 7 elementos: termina en barra de terminación).
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]

const START_B = 104
const STOP = 106

function encode(text: string): number[] {
  const codes = [START_B]
  for (const ch of text) {
    const v = ch.charCodeAt(0) - 32
    codes.push(v < 0 || v > 94 ? 0 : v) // fuera de rango → espacio
  }
  let sum = START_B
  for (let i = 1; i < codes.length; i++) sum += codes[i] * i
  codes.push(sum % 103) // dígito de control
  codes.push(STOP)
  return codes
}

export function code128SVG(
  text: string,
  opts: { moduleWidth?: number; height?: number; quiet?: number; showText?: boolean } = {},
): string {
  const { moduleWidth = 2, height = 48, quiet = 10, showText = false } = opts
  const widths = encode(text).map((c) => PATTERNS[c]).join('')

  let x = quiet * moduleWidth
  let isBar = true
  let rects = ''
  for (const d of widths) {
    const w = Number(d) * moduleWidth
    if (isBar) rects += `<rect x="${x}" y="0" width="${w}" height="${height}" fill="#000"/>`
    x += w
    isBar = !isBar
  }
  const totalW = Math.round(x + quiet * moduleWidth)
  const textH = showText ? 16 : 0
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${height + textH}" viewBox="0 0 ${totalW} ${height + textH}">`
    + `<rect width="${totalW}" height="${height + textH}" fill="#fff"/>${rects}`
    + (showText ? `<text x="${totalW / 2}" y="${height + textH - 3}" text-anchor="middle" font-family="monospace" font-size="13">${text}</text>` : '')
    + `</svg>`
}
