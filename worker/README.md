# Worker de pagos (MercadoPago) — guía de despliegue

Este Worker de Cloudflare es la pieza que hace que el pago **se marque solo** como pagado.
Es gratis, no requiere tarjeta y no necesita activar Blaze en Firebase.

## Qué hace
- `POST /create-preference` → crea el link de pago de MercadoPago (la app lo llama al tocar "Pagar").
- `POST /webhook` → MercadoPago avisa cuando el pago se aprueba; el Worker marca la inscripción
  como pagada en Firestore y guarda el registro para el historial.

## Lo que necesitás antes
1. **Cuenta de Cloudflare** (gratis): https://dash.cloudflare.com/sign-up
2. **Node.js** instalado (para usar `wrangler`).
3. **Cuenta de servicio de Firebase** (gratis, NO requiere Blaze):
   Firebase Console → ⚙️ Configuración del proyecto → **Cuentas de servicio** →
   **Generar nueva clave privada** → descargás un JSON. De ese JSON vas a usar:
   `project_id`, `client_email` y `private_key`.

## Pasos
```bash
npm install -g wrangler
cd worker
wrangler login

# Cargá los 3 secrets (te los pide y los pegás):
wrangler secret put FIREBASE_PROJECT_ID     # ej: tenis-mesa-xxxx
wrangler secret put FIREBASE_CLIENT_EMAIL   # el client_email del JSON
wrangler secret put FIREBASE_PRIVATE_KEY    # el private_key del JSON (pegalo COMPLETO, con los \n)

# Editá APP_URL en wrangler.toml si tu URL es otra. Luego:
wrangler deploy
```
Al terminar, `wrangler` te da la **URL del Worker**, algo como:
`https://tenis-mesa-pagos.TU-USUARIO.workers.dev`

## Conectar la app con el Worker
Pegá esa URL en la app: **Ajustes → Pagos → URL del servicio de pagos** (la guarda el superadmin).

## Configurar el webhook en MercadoPago (opcional pero recomendado)
El Worker ya pasa la `notification_url` en cada pago, así que funciona sin tocar nada.
Si MercadoPago te pide configurar webhooks en el panel, usá:
`https://tenis-mesa-pagos.TU-USUARIO.workers.dev/webhook` con el evento **Pagos**.

## Probar sin cobrar de verdad
Cargá en la app una cuenta de cobro con el **Access Token de PRUEBA** (empieza con `TEST-`)
y usá las tarjetas de prueba de MercadoPago. El pago aprobado marca la inscripción igual.
