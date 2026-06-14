import { useEffect, useState } from 'react'
import QR from 'qrcode'

// Muestra un código QR (SVG) a partir de un texto. Se usa para la llave Bre-B.
export function QRCode({ value, size = 200 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let alive = true
    QR.toString(value, { type: 'svg', margin: 1, width: size, errorCorrectionLevel: 'M' })
      .then((s) => { if (alive) setSvg(s) })
      .catch(() => { if (alive) setSvg('') })
    return () => { alive = false }
  }, [value, size])

  if (!svg) return <div style={{ width: size, height: size }} className="mx-auto animate-pulse rounded-lg bg-slate-100" />
  return <div style={{ width: size, height: size }} className="mx-auto" dangerouslySetInnerHTML={{ __html: svg }} />
}
