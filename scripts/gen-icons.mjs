// Genera los iconos PNG de la PWA a partir de un SVG de marca.
// Uso puntual: node scripts/gen-icons.mjs  (requiere sharp instalado temporalmente)
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

mkdirSync('public/icons', { recursive: true })

const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#0d9488"/>
  <rect x="112" y="128" width="288" height="64" rx="16" fill="#ccfbf1"/>
  <rect x="112" y="224" width="288" height="160" rx="16" fill="#f0fdfa"/>
  <rect x="160" y="272" width="80" height="64" rx="12" fill="#0d9488"/>
  <rect x="272" y="272" width="80" height="64" rx="12" fill="#0d9488"/>
  <rect x="176" y="384" width="160" height="32" rx="16" fill="#99f6e4"/>
</svg>`

const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0d9488"/>
  <rect x="156" y="168" width="200" height="44" rx="12" fill="#ccfbf1"/>
  <rect x="156" y="236" width="200" height="112" rx="12" fill="#f0fdfa"/>
  <rect x="190" y="272" width="56" height="44" rx="8" fill="#0d9488"/>
  <rect x="266" y="272" width="56" height="44" rx="8" fill="#0d9488"/>
</svg>`

await sharp(Buffer.from(logo)).resize(192, 192).png().toFile('public/icons/icon-192.png')
await sharp(Buffer.from(logo)).resize(512, 512).png().toFile('public/icons/icon-512.png')
await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile('public/icons/icon-512-maskable.png')
console.log('Iconos PWA generados en public/icons/')
