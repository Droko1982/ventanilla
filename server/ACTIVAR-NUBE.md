# ☁️ Encender la nube — guía sencilla

> Con esto tu tienda gana **respaldo automático** (los datos dejan de vivir solo en un dispositivo) y **datos compartidos entre cajeros y dispositivos** (varias cajas viendo el mismo inventario y ventas).
>
> **La app funciona perfectamente sin esto.** Enciéndela solo cuando la necesites. Toma unos **20–30 minutos** y no requiere saber programar.

---

## ¿Cuánto cuesta?
- **Para probar:** gratis (planes free de Neon + Render).
- **Para uso real:** aprox. **$12–25 USD al mes** (≈ $50.000–105.000 COP) de hosting.
- **DIAN real** (opcional) va aparte, con un proveedor autorizado (Alegra, Factus…).

---

## Paso 1 · Crear la base de datos (Neon — gratis)
1. Entra a **https://neon.tech** y crea una cuenta.
2. Crea un proyecto (botón **New Project**).
3. Copia la **cadena de conexión** que te muestra (empieza con `postgresql://…`). Guárdala; la usarás en el Paso 2.

## Paso 2 · Publicar el servidor (Render)
1. Entra a **https://render.com** y crea una cuenta (conéctala a tu GitHub).
2. **New → Blueprint** y elige el repositorio de Ventanilla. Render detecta solo el archivo `render.yaml`.
3. Cuando lo pida, pega:
   - **DATABASE_URL** → la cadena de Neon del Paso 1.
   - **SUPERADMIN_PASSWORD** → una clave tuya para administrar la plataforma (guárdala bien).
4. Dale **Apply / Deploy**. En unos minutos te da una URL como `https://ventanilla-api.onrender.com`.
5. Comprueba que responde: abre esa URL con `/health` al final (debe decir que está OK).

## Paso 3 · Conectar la app
1. En la app: **Ajustes → Nube (multi-dispositivo)**.
2. Pega la **URL del API** del Paso 2 y entra con tu correo y contraseña de dueño.
3. Listo. Desde ahora se **respalda en la nube** y puedes entrar desde otra caja/dispositivo y ver los mismos datos.

---

## Recomendaciones
- Guarda bien la **clave de super-admin** y la **cadena de Neon** (son las llaves del negocio).
- Sigue descargando un **respaldo (.json)** de vez en cuando desde *Ajustes → Datos y respaldo* como red de seguridad extra.
- Integraciones opcionales (pago **Wompi**, **WhatsApp** automático, **DIAN** real): se activan agregando sus llaves en las variables del servidor. Sin llaves, funcionan en modo simulado.

*Detalle técnico completo en [`README.md`](README.md).*
