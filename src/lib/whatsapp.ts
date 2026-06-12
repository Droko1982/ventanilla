// Construye enlaces de WhatsApp "click-to-chat" (wa.me) con mensaje pre-cargado.
// En la v1 el pedido a proveedor sale por correo automático + un mensaje de
// WhatsApp listo para enviar con un toque. El envío 100% automático vía
// WhatsApp Business API se conecta después.

export function waLink(phone: string, message: string): string {
  const clean = phone.replace(/[^\d]/g, '')
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`
}

/** mailto: con asunto y cuerpo, para el pedido automático por correo. */
export function mailtoLink(to: string, subject: string, body: string): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
