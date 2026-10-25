# Cómo publicar SetSnap (Cloudflare Pages)

SetSnap ya no necesita un servidor Node prendido todo el tiempo. Es un sitio estático, más una función pequeña para leer fotos. Cloudflare Pages lo aloja **gratis**, no se "duerme" como el plan gratis de Render (que tarda casi un minuto en despertar) y sirve la app rápido desde cualquier país.

> Los nombres de los menús de Cloudflare cambian de vez en cuando. Si algo no coincide exactamente, busca la opción con un nombre parecido.

## Paso 1: Crea el proyecto

1. Crea una cuenta gratis en [cloudflare.com](https://dash.cloudflare.com/sign-up).
2. En el panel, entra a **Workers & Pages → Create → Pages → Connect to Git**.
3. Autoriza GitHub y elige el repositorio `SetSnap`.
4. Configura el build:
   - **Framework preset:** None
   - **Build command:** `npm run build`
   - **Build output directory:** `public`
5. Dale a **Save and Deploy**. Te dará una URL como `https://setsnap.pages.dev`.

La carpeta `functions/` se detecta sola: Cloudflare publica `/api/config`, `/api/extract-setlist` y `/share-target` sin configurar nada más.

## Paso 2: Variables

En el proyecto, ve a **Settings → Variables and Secrets** y agrega:

| Nombre | Valor | Tipo |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | El Client ID de tu app de Spotify | Texto |
| `GEMINI_API_KEY` | Tu API key de Google AI Studio (opcional, para fotos) | **Secret** |

Opcionales: `OCR_USER_DAILY`, `OCR_GLOBAL_DAILY`, `GEMINI_MODEL`, `ALLOWED_SPOTIFY_USERS` (ver README).

**Ya no hace falta** `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI` ni `SESSION_SECRET`. Si los tenías en Render, no los copies.

## Paso 3: Límites del OCR (KV)

Para que los límites diarios de fotos funcionen de verdad y el gasto de Gemini tenga techo:

1. Entra a **Storage & Databases → KV** (o **Workers & Pages → KV**) y crea un namespace llamado `setsnap-ocr`.
2. En el proyecto, ve a **Settings → Bindings → Add → KV namespace**:
   - **Variable name:** `RATE_LIMIT_KV`
   - **KV namespace:** `setsnap-ocr`
3. Vuelve a desplegar (**Deployments → Retry deployment**) para que tome las variables y el binding.

## Paso 4: Spotify

1. Entra a tu app en el [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) → **Settings**.
2. En **Redirect URIs** agrega tu URL **con la `/` final**, por ejemplo `https://setsnap.pages.dev/`, y guarda.
3. En **User Management** agrega el nombre y el email de cada persona que vaya a usar la app (tú, tu banda). En Development Mode solo esas cuentas pueden conectarse, y el dueño de la app necesita Spotify Premium.
4. Puedes borrar la Redirect URI vieja de Render (`.../callback/spotify`).

## Paso 5: Instalar en el celular

Abre la URL en el celular y usa **"Agregar a pantalla de inicio"** (en Android también aparece el botón "Instalar"). Una vez instalada en Android, SetSnap aparece en el menú **Compartir** de WhatsApp y la galería: compartes el mensaje o la foto del setlist y se carga sola.

## Apagar Render

Cuando confirmes que todo funciona en Cloudflare, borra el servicio en Render para no tener dos versiones publicadas.

## Probar en tu computadora

```bash
npm install
cp .dev.vars.example .dev.vars   # rellena SPOTIFY_CLIENT_ID y, si quieres, GEMINI_API_KEY
npm run dev
```

Abre `http://127.0.0.1:8788` y agrega `http://127.0.0.1:8788/` a las Redirect URIs de Spotify.
