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

La carpeta `functions/` se detecta sola: Cloudflare publica `/api/...` y `/share-target` sin configurar nada más.

## Paso 2: Variables

En el proyecto, ve a **Settings → Variables and Secrets** y agrega:

| Nombre | Valor | Tipo |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | El Client ID de tu app de Spotify | Texto |
| `GEMINI_API_KEY` | Tu API key de Google AI Studio (opcional, para fotos) | **Secret** |
| `ADMIN_KEY` | Una clave larga que solo tú sepas (para el modo sin cuenta) | **Secret** |
| `YOUTUBE_API_KEY` | API key de YouTube (opcional, ver Paso 6) | **Secret** |

Opcionales: límites y modelos (ver la tabla del README).

**Ya no hace falta** `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI` ni `SESSION_SECRET`. Si los tenías en Render, no los copies.

## Paso 3: Almacenamiento (KV)

Aquí se guardan la llave de la cuenta central, los límites diarios y la caché de YouTube y del OCR:

1. Entra a **Storage & Databases → KV** (o **Workers & Pages → KV**) y crea un namespace llamado `setsnap`.
2. En el proyecto, ve a **Settings → Bindings → Add → KV namespace**:
   - **Variable name:** `SETSNAP_KV`
   - **KV namespace:** `setsnap`
3. Vuelve a desplegar (**Deployments → Retry deployment**) para que tome las variables y el binding.

## Paso 4: Spotify

1. Entra a tu app en el [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) → **Settings**.
2. En **Redirect URIs** agrega tu URL **con la `/` final**, por ejemplo `https://setsnap.pages.dev/`, y guarda.
3. En **User Management** agrega el nombre y el email de cada persona que vaya a usar la app (tú, tu banda). En Development Mode solo esas cuentas pueden conectarse, y el dueño de la app necesita Spotify Premium.
4. Puedes borrar la Redirect URI vieja de Render (`.../callback/spotify`).

## Paso 5: Modo sin cuenta (cuenta central)

Así cualquiera puede usar SetSnap sin registrarse: las playlists se crean en una cuenta de SetSnap y la persona recibe el link.

1. Crea un Gmail nuevo (por ejemplo `setsnap.playlists@gmail.com`) y con él una cuenta **gratis** de Spotify.
2. En el Dashboard de Spotify → tu app → **User Management**, agrega esa cuenta (nombre y email).
3. En **Settings → Redirect URIs** agrega `https://setsnap.pages.dev/api/central/callback` (con tu dominio).
4. Abre una **ventana de incógnito**, entra a open.spotify.com con la cuenta nueva, y luego abre `https://setsnap.pages.dev/api/central/connect?key=TU_ADMIN_KEY`. Acepta los permisos.
5. Debe aparecer "¡Cuenta central conectada!". Desde ese momento, SetSnap muestra "No necesitas cuenta" y el botón "Usar mi Spotify" queda como opción.
6. Para revisarla cuando quieras: `https://setsnap.pages.dev/api/central/status?key=TU_ADMIN_KEY`.

## Paso 6 (opcional): Lista en YouTube

1. Entra a [console.cloud.google.com](https://console.cloud.google.com/), crea un proyecto y en **APIs & Services → Library** habilita **YouTube Data API v3**.
2. En **Credentials → Create credentials → API key**. En "API restrictions" limítala a YouTube Data API v3.
3. Ponla en Cloudflare como `YOUTUBE_API_KEY` (Secret) y vuelve a desplegar.

La cuota gratis da ~100 búsquedas nuevas al día; cada canción se busca una sola vez y queda guardada para todos. Si consigues una llave de Odesli (song.link), ponla como `ODESLI_API_KEY` y ya no se gasta cuota de YouTube.

**Precarga de éxitos (recomendado):** para que las ~600 canciones más tocadas ya estén listas desde el principio:

1. En GitHub → tu repo → **Settings → Secrets and variables → Actions → New repository secret**, crea:
   - `SETSNAP_URL` = `https://setsnap.pages.dev` (tu dominio, sin `/` final)
   - `SETSNAP_ADMIN_KEY` = el mismo valor que `ADMIN_KEY`
2. Listo: cada noche corre la tarea "Precargar caché de YouTube". Para correrla ya, entra a **Actions → Precargar caché de YouTube → Run workflow**.
3. Para ver el avance: `curl -H "Authorization: Bearer TU_ADMIN_KEY" https://setsnap.pages.dev/api/admin/seed`

La precarga necesita que la cuenta central esté conectada (Paso 5), porque primero ubica cada canción en Spotify.

## Paso 7: Instalar en el celular

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
