// Genera y descarga un CSV seguro para abrir en Excel en español:
//  - BOM UTF-8: las tildes y la ñ salen correctas.
//  - comillas escapadas y campos entre comillas: nombres con comas no corren columnas.
//  - protección anti-inyección de fórmulas: un valor que empieza por = + - @ se
//    neutraliza con una comilla, para que Excel no lo ejecute como fórmula.
export function toCSV(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    let s = String(v ?? '')
    if (/^[=+\-@]/.test(s)) s = "'" + s
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return rows.map((r) => r.map(esc).join(',')).join('\r\n')
}

export function downloadCSV(rows: (string | number | null | undefined)[][], filename: string): void {
  const blob = new Blob(['﻿' + toCSV(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
