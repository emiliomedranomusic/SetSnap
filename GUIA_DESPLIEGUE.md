# Publicar SetSnap y probar todo (checklist)

Sigue las fases en orden. En total son unos 45–60 minutos. Todo es **gratis**; lo único que necesitas pagado es el **Spotify Premium de tu cuenta** (la dueña de la app en el Dashboard de Spotify).

> Los menús de Cloudflare, Google y Spotify cambian de nombre de vez en cuando. Si algo no coincide exacto, busca la opción con un nombre parecido.

---

## Fase 0 · Antes de empezar

Ten a mano:

- [ ] Tu cuenta de **GitHub** (donde está SetSnap).
- [ ] Tu app del **Spotify Developer Dashboard** ([developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)) y su **Client ID**.
- [ ] Una cuenta de **Cloudflare** (gratis): [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
- [ ] Una cuenta de **Google** (para la llave de Gemini y la de YouTube).
- [ ] Tu **ADMIN_KEY**: invéntate una clave larga (20+ caracteres, sin espacios), por ejemplo con tu administrador de contraseñas. Guárdala: la vas a usar varias veces.
- [ ] Un **Gmail nuevo** (p. ej. `setsnap.playlists@gmail.com`) y, con él, una cuenta **gratis** de Spotify. Es la "cuenta central" donde se crean las playlists de quien no inicia sesión.

---

## Fase 1 · Pasar el código a `main`

1. **Primero apaga Render**: en [dashboard.render.com](https://dashboard.render.com) abre tu servicio → **Settings → Suspend** (o bórralo). Si no, Render intentará desplegar la versión nueva con `node server.js`, que ya no existe, y fallará.
2. En GitHub, abre el repo. Arriba aparece la rama `claude/spotlistr-app-review-kd43a2` con el botón **Compare & pull request** (o pídeme que cree el pull request).
3. Revisa y dale **Merge pull request**.

---

## Fase 2 · Sacar las llaves

**Gemini (fotos y etiquetas)**

1. Entra a [aistudio.google.com](https://aistudio.google.com/) → **Get API key → Create API key**.
2. El plan gratis no pide tarjeta. Copia la llave.

**YouTube (lista sin login)**

1. Entra a [console.cloud.google.com](https://console.cloud.google.com/) → crea un proyecto (p. ej. "SetSnap").
2. **APIs & Services → Library** → busca **YouTube Data API v3** → **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key**. En la llave nueva, **Edit API key → API restrictions → Restrict key → YouTube Data API v3 → Save**. Copia la llave.

**Opcional: botón "Apóyanos"**: crea tu página en [ko-fi.com](https://ko-fi.com) (o Buy Me a Coffee) y copia tu link.

---

## Fase 3 · Cloudflare Pages

**3.1 Crear el proyecto**

1. En [dash.cloudflare.com](https://dash.cloudflare.com): **Workers & Pages → Create → Pages → Connect to Git**. (Si solo ves opciones de Workers, busca el link "Pages" o "Looking to deploy Pages?").
2. Autoriza GitHub y elige el repo **SetSnap**.
3. Configuración:
   - **Production branch:** `main`
   - **Framework preset:** None
   - **Build command:** `npm run build`
   - **Build output directory:** `public`
   - **Environment variables (build):** `NODE_VERSION` = `22`
4. **Save and Deploy**. Al terminar te da tu URL, p. ej. `https://setsnap.pages.dev` (si el nombre está ocupado será algo como `setsnap-abc.pages.dev`). **Usa tu URL real en todos los pasos siguientes** (aquí la escribo como `TU-URL`).

**3.2 Almacenamiento (KV)**

1. **Storage & Databases → KV** (o **Workers & Pages → KV**) → **Create namespace** → nombre `setsnap`.
2. En tu proyecto de Pages: **Settings → Bindings → Add → KV namespace**:
   - **Variable name:** `SETSNAP_KV`
   - **KV namespace:** `setsnap`

**3.3 Variables y secretos** (proyecto → **Settings → Variables and Secrets**, entorno **Production**)

| Nombre | Valor | Tipo |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | Client ID de tu app de Spotify | Texto |
| `ADMIN_KEY` | Tu clave de administrador | **Secret** |
| `GEMINI_API_KEY` | Llave de Gemini | **Secret** |
| `YOUTUBE_API_KEY` | Llave de YouTube | **Secret** |
| `SUPPORT_URL` | Tu link de Ko-fi (opcional) | Texto |

**Ya no hacen falta** `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI` ni `SESSION_SECRET`.

**3.4 Volver a desplegar**: **Deployments** → el último → **⋯ → Retry deployment**. (Las variables y el KV solo se aplican en un despliegue nuevo.)

---

## Fase 4 · Spotify Dashboard

En tu app → **Settings**:

1. **Redirect URIs**: agrega estas dos, exactas (con `https` y la `/` del final en la primera), y guarda:
   - `https://TU-URL/`
   - `https://TU-URL/api/central/callback`
2. **User Management**: agrega nombre + email de:
   - tu cuenta de Spotify,
   - la cuenta central (el Gmail nuevo),
   - tu banda (si quieres que usen "Usar mi Spotify").

   El límite es de 5 usuarios en apps nuevas (las apps viejas pueden tener más). Quien no esté aquí igual puede usar SetSnap **sin cuenta**.

---

## Fase 5 · Conectar la cuenta central

1. Abre una **ventana de incógnito**.
2. Entra a [open.spotify.com](https://open.spotify.com) e inicia sesión con la **cuenta central** (el Gmail nuevo).
3. En esa misma ventana abre: `https://TU-URL/api/central/connect?key=TU_ADMIN_KEY`
4. Acepta los permisos. Debe aparecer **"¡Cuenta central conectada!"**.

---

## Fase 6 · Diagnóstico

Abre `https://TU-URL/api/admin/health?key=TU_ADMIN_KEY`. Prueba en vivo cada pieza y te dice qué falta:

- ✅ funciona · ⚠️ opcional o por revisar · ❌ hay que corregirlo.
- Lo normal en este punto es todo ✅, salvo **GetSongBPM** (⚠️, se configura en la Fase 9).

Si algo sale ❌, revisa la tabla de **Problemas comunes** al final.

---

## Fase 7 · Precarga de canciones y tu repertorio

**Precarga automática** (deja listas en YouTube las ~600 canciones del catálogo):

1. GitHub → tu repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `SETSNAP_URL` = `https://TU-URL` (sin `/` al final)
   - `SETSNAP_ADMIN_KEY` = tu ADMIN_KEY
2. **Actions** → si te lo pide, habilítalas → **Precargar caché de YouTube → Run workflow**. Después corre sola cada noche. Con la cuota gratis, completa la lista en ~9 días.

**Tus canciones** (para comparar con mi lista y meterlas al generador):

1. En tu celular abre `https://TU-URL/?admin` (queda activado en ese dispositivo).
2. Toca **Usar mi Spotify** e inicia sesión con tu cuenta.
3. Pega el link de tu playlist en el cuadro: se cargan sus canciones.
4. Toca **Comparar con la precarga** y escribe tu ADMIN_KEY. Te dice cuántas ya estaban, agrega las nuevas y **las etiqueta con Gemini** para el generador. Si alguna queda sin etiquetar, vuelve a tocar el botón en un rato.

---

## Fase 8 · Prueba completa

Marca cada una:

- [ ] **Sin cuenta:** en una ventana normal (sin iniciar sesión) toca **Probar con un ejemplo → Buscar canciones → Crear playlist → Abrir en Spotify**. En Spotify: **⋯ → Agregar a otra playlist → Nueva playlist** para quedarte con tu copia.
- [ ] **Con tu Spotify:** **Usar mi Spotify** → destino **Agregar a una existente** → elige una playlist tuya.
- [ ] **Foto:** **Foto del setlist** con una lista escrita a mano o una captura de WhatsApp.
- [ ] **BPM y tonalidad:** en los resultados aparece "🎼 G · 92 BPM" en la mayoría de las canciones.
- [ ] **Acordes:** toca Cifra Club / Ultimate Guitar / La Cuerda en una canción; revisa que caiga en la canción correcta.
- [ ] **YouTube:** **Lista en YouTube** → se abre la lista con los videos.
- [ ] **Karaoke:** Versión **Karaoke** → Buscar → aparecen versiones karaoke → **Lista en YouTube** con videos karaoke.
- [ ] **Generador:** **Generar un setlist por evento** → Boda, Ambos, 30 canciones → Generar → Buscar → Crear playlist.
- [ ] **Para la banda:** **Compartir con la banda** → abre el link en otro celular (sin cuenta) · **Imprimir / PDF** · **Exportar CSV**.
- [ ] **Idioma y tema:** botón **EN/ES** y botón de tema (sistema → claro → oscuro).
- [ ] **App en el celular:** Android: menú → **Instalar app**; iPhone (Safari): **Compartir → Agregar a inicio**. En Android, desde WhatsApp: mensaje o foto → **Compartir → SetSnap**.
- [ ] **Diagnóstico** otra vez: `https://TU-URL/api/admin/health?key=TU_ADMIN_KEY`.

---

## Fase 9 · Después

- **GetSongBPM** (respaldo de BPM/tonalidad): ya publicado SetSnap, entra a [getsongbpm.com/api](https://getsongbpm.com/api); pon `https://TU-URL` como sitio y como backlink (el pie de página ya tiene el link que exigen) y tu email. Activa la llave desde el correo y agrégala en Cloudflare como `GETSONGBPM_API_KEY` (Secret) → Retry deployment.
- **Odesli**: manda el correo que preparamos a developers@song.link. Si te dan llave: `ODESLI_API_KEY` (Secret).
- **Borra Render** cuando todo funcione.
- **Dominio propio** (opcional, ~US$10–15/año): en Cloudflare **Pages → Custom domains**. Si lo cambias, actualiza las Redirect URIs de Spotify y el secret `SETSNAP_URL` de GitHub.

---

## Problemas comunes

| Síntoma | Solución |
|---|---|
| Spotify dice **INVALID_CLIENT: Invalid redirect URI** | La Redirect URI no coincide exacta. Revisa `https://TU-URL/` (con `/`) y `https://TU-URL/api/central/callback` en el Dashboard. |
| **403** de Spotify al usar "Usar mi Spotify" | Esa cuenta no está en **User Management**, o tu cuenta (dueña) no tiene Premium. Mientras tanto se puede usar sin cuenta. |
| "El modo sin cuenta no está configurado" | Falta la Fase 5, o el KV no está conectado (diagnóstico ❌ en KV). |
| "La cuenta central necesita reconectarse" | Repite la Fase 5. |
| No aparece **Foto del setlist** | Falta `GEMINI_API_KEY` o no hiciste Retry deployment. |
| No aparece **Lista en YouTube** | Falta `YOUTUBE_API_KEY` o no hiciste Retry deployment. |
| YouTube ❌ "API key not valid" o 403 | Habilita **YouTube Data API v3** en el proyecto de Google Cloud y que la llave esté restringida a esa API. |
| Gemini ❌ "ningún modelo existe" | Pon `GEMINI_MODEL` con un modelo vigente de [ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models). |
| ReccoBeats ❌ o sin BPM en muchas canciones | ReccoBeats no tiene todas (sobre todo las muy nuevas). Configura GetSongBPM (Fase 9). |
| Cifra Club / La Cuerda abren otra canción | Esos links usan "voy a tener suerte" de DuckDuckGo; avísame y se ajusta en `public/js/chords.js`. |
| La app en el celular no se actualiza | Aparece el aviso "Hay una versión nueva" → **Actualizar**. Si no, cierra y abre la app. |
| La tarea de precarga en GitHub dice "Faltan los secrets" | Revisa `SETSNAP_URL` y `SETSNAP_ADMIN_KEY` en GitHub (Fase 7). |

---

## Probar en tu computadora (opcional)

```bash
npm install
cp .dev.vars.example .dev.vars   # rellena SPOTIFY_CLIENT_ID, ADMIN_KEY, etc.
npm run dev                      # http://127.0.0.1:8788
npm test
```

Agrega `http://127.0.0.1:8788/` y `http://127.0.0.1:8788/api/central/callback` a las Redirect URIs de Spotify.
