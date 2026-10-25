# SetSnap

Convierte el setlist que te mandaron (texto de WhatsApp, lista impresa o foto escrita a mano) en una playlist de Spotify en segundos. Pensado para músicos: pegas, revisas lo dudoso y listo.

## Qué hace

- **Sin cuenta.** Cualquiera puede usarlo sin iniciar sesión: la playlist se crea en la cuenta central de SetSnap y la persona recibe el link para guardarla o copiarla a su Spotify. Quien tenga acceso puede usar **su propio Spotify** (y agregar a sus playlists).
- **Pega el setlist tal cual.** Entiende numeración (`1.`, `2)`, `3.-`), viñetas, emojis, mensajes copiados de WhatsApp, `Canción - Artista` o `Artista - Canción` (da igual el orden: busca ambas y se queda con la mejor), `Canción by/por Artista`, `Canción (Artista)` o solo el título.
- **Separa el tono y el tempo.** `La Bamba (en G)`, `Tono: Am`, `capo 2`, `120 bpm` se guardan como nota y no ensucian la búsqueda.
- **Foto del setlist (OCR con Gemini).** Toma una foto, súbela, pega una captura con Ctrl+V o arrástrala. En Android, instalada como app, puedes usar **Compartir → SetSnap** desde WhatsApp o la galería.
- **Revisar o crear directo.** En "Revisar antes" ves cada coincidencia, puedes elegir otra opción, editar la búsqueda u omitir la línea. En "Crear directo" se agregan las coincidencias seguras y las dudosas quedan abajo para resolverlas.
- **Playlist nueva o existente**, sin repetir canciones que ya estén.
- **Para la banda:** link para compartir el setlist (no necesitan cuenta, el setlist va dentro del link), copiar como texto e imprimir / guardar como PDF en letra grande con el tono de cada canción.
- **Lista en YouTube sin login.** Arma una lista de YouTube con los videos del setlist (sin cuenta). Cada canción se busca una sola vez y queda en caché para todos, para siempre; ~600 éxitos en inglés y español se precargan solos.
- **Acordes de cada canción** en Cifra Club, Ultimate Guitar, La Cuerda, MuseScore, Songsterr o iReal Pro (eliges los sitios). Son links de búsqueda: sin APIs ni costo. También aparecen en el setlist compartido, para que cada músico los abra.
- **Versión karaoke o instrumental:** busca esas versiones en Spotify (y videos karaoke en YouTube) en vez de la original. La banda sigue viendo el nombre original de cada canción.
- **Pega un link de playlist de Spotify** y se cargan sus canciones como setlist (con tu cuenta; Spotify solo deja leer playlists propias o colaborativas).
- **Exportar CSV** para pasar el setlist a Deezer, Apple Music, Tidal, Amazon Music o YouTube Music con TuneMyMusic o Soundiiz.
- **Español e inglés, modo claro/oscuro** (sigue al sistema o se elige a mano), instalable como app, aviso sin conexión, atajo Ctrl+Enter y accesible con teclado.

## Arquitectura

```
public/                 Sitio estático (lo que se publica)
  index.html
  js/app.js             Interfaz
  js/parser.js          Parsing del setlist
  js/scoring.js         Puntuación de coincidencias (0-100)
  js/search.js          Estrategia de búsqueda en Spotify
  js/spotify.js         Login PKCE y API de Spotify desde el navegador
  js/guest.js           Modo sin cuenta y YouTube (llama a /api/central y /api/youtube)
  js/ocr.js             Reduce la foto y la manda al OCR
  js/share.js           Link compartible y exportar a texto
  sw.js                 Service worker (caché + "Compartir → SetSnap")
functions/              Cloudflare Pages Functions (lo único con servidor)
  api/config.js         Config pública (Client ID y qué funciones están activas)
  api/extract-setlist.js  OCR: límites diarios (por cuenta o por IP), caché, Gemini
  api/central/          Modo sin cuenta: connect/callback (admin), search, playlist, status
  api/youtube.js        Lista de YouTube sin login
  share-target.js       Respaldo de "Compartir" si el service worker no está activo
lib/gemini.js           Llamada a Gemini (REST, sin SDK)
  api/admin/seed.js     Precarga de la caché de YouTube (administrador)
lib/server/             Cuenta central, YouTube, precarga y utilidades (KV, límites)
data/seed-songs.js      Canciones famosas que se precargan
.github/workflows/      Tarea nocturna de precarga
test/                   Tests (node --test)
```

- **Con tu cuenta**, Spotify se usa directo desde el navegador con Authorization Code + PKCE. No hay client secret ni sesiones.
- **Sin cuenta**, el navegador llama a `/api/central/*` y el servidor usa la cuenta central (su refresh token vive en KV). Las búsquedas se cachean en Cloudflare, así que una canción que ya buscó alguien no vuelve a llamar a Spotify.
- **El OCR y YouTube** van por el servidor porque sus llaves no pueden ir en el navegador. Tienen límites diarios por persona y globales, así que el costo tiene techo.

## Desarrollo local

Requisitos: Node 20 o superior.

```bash
npm install
cp .dev.vars.example .dev.vars   # pon tu SPOTIFY_CLIENT_ID (y GEMINI_API_KEY si quieres OCR)
npm run dev                      # http://127.0.0.1:8788
npm test
```

En el [Dashboard de Spotify](https://developer.spotify.com/dashboard), agrega `http://127.0.0.1:8788/` a **Redirect URIs**. Tiene que ser exacto, con la `/` final. Spotify no acepta `localhost`, solo `127.0.0.1`.

Si cambias clases de Tailwind en el HTML o JS, `npm run dev` recompila el CSS al arrancar. También puedes dejar `npm run dev:css` corriendo en otra terminal.

## Variables

| Variable | Obligatoria | Descripción |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | Sí | Client ID de tu app de Spotify. El Client Secret **ya no se usa**. |
| `GEMINI_API_KEY` | No | Activa la lectura de fotos. Sácala en [Google AI Studio](https://aistudio.google.com/). |
| `GEMINI_MODEL` | No | Modelo a probar primero. Después se prueban, en orden, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.1-flash-lite-preview` y `gemini-2.5-flash-lite`. Se pasa al siguiente si uno no existe, está saturado o agotó su cuota. |
| `OCR_USER_DAILY` | No | Fotos por usuario al día (por defecto 12). |
| `OCR_GLOBAL_DAILY` | No | Fotos en total al día (por defecto 200). Es el techo de gasto. |
| `OCR_GUESTS` | No | `0` para que solo quien inició sesión pueda usar el OCR. Por defecto también pueden usarlo sin cuenta. |
| `OCR_GUEST_DAILY` | No | Fotos al día por IP en modo sin cuenta (por defecto 5). |
| `ALLOWED_SPOTIFY_USERS` | No | IDs de usuario de Spotify separados por coma que pueden usar el OCR con su cuenta. Vacío = cualquiera con sesión. |
| `ADMIN_KEY` | Para el modo sin cuenta | Clave que solo tú conoces, para conectar la cuenta central en `/api/central/connect?key=…`. |
| `CENTRAL_PLAYLISTS_PER_IP` | No | Playlists al día por IP en modo sin cuenta (por defecto 15). |
| `CENTRAL_PLAYLISTS_DAILY` | No | Playlists al día en total en modo sin cuenta (por defecto 300). |
| `YOUTUBE_API_KEY` | No | Activa "Lista en YouTube". API key de Google Cloud con YouTube Data API v3 habilitada. |
| `YOUTUBE_DAILY_SEARCHES` | No | Búsquedas nuevas de YouTube al día (por defecto 90; la cuota gratis da ~100). |
| `YOUTUBE_LISTS_PER_IP` | No | Listas de YouTube al día por IP (por defecto 20). |
| `YOUTUBE_SEED_RESERVE` | No | Búsquedas de YouTube que la precarga nocturna deja libres para los usuarios (por defecto 20). |
| `SEED_MARKET` | No | País de Spotify para resolver la lista de precarga (por defecto `MX`). |
| `SUPPORT_URL` | No | Link de Ko-fi / Buy Me a Coffee. Si está, aparece el botón "☕ Apóyanos". |
| `ODESLI_API_KEY` | No | Llave de Odesli (song.link). Si está, se usa antes que la búsqueda de YouTube y no gasta cuota. |

Binding de KV: `SETSNAP_KV` (límites, token de la cuenta central, caché de YouTube y del OCR). Sin él todo vive en memoria y se pierde: el modo sin cuenta no funcionará en producción.

## Costo del OCR

Cada foto se reduce en el navegador a 1600 px antes de subirse. Se usa un modelo Flash-Lite con el "thinking" al mínimo y una respuesta JSON que solo trae título, artista y nota. Con los precios publicados en 2026, una foto de setlist cuesta del orden de **una décima de centavo de dólar**. Con el tope por defecto de 200 fotos al día, el peor caso son centavos diarios. Las fotos repetidas salen de caché y no se cobran.

Para ver el consumo real, revisa los logs de la función: cada llamada imprime `[ocr] tokens`.

**Gratis:** con una API key del plan gratuito de Google AI Studio (sin tarjeta), los modelos Flash-Lite tienen cientos de peticiones diarias gratis por modelo, y SetSnap salta al siguiente modelo cuando uno se agota. Con el tope de 200 fotos al día, en la práctica el OCR puede costar $0. La contra: en el plan gratuito Google puede usar las imágenes para mejorar sus productos. Para fotos de setlists no suele importar, pero tenlo en cuenta.

## Modo sin cuenta (cuenta central)

1. Crea una cuenta de Spotify solo para esto (por ejemplo con un Gmail "SetSnap"). No necesita Premium: el Premium se le pide al dueño de la app en el Dashboard.
2. En el Dashboard de Spotify, agrega esa cuenta en **User Management** y agrega la Redirect URI `https://TU-DOMINIO/api/central/callback`.
3. Define `ADMIN_KEY` en Cloudflare.
4. Abre una ventana de incógnito, inicia sesión en Spotify **con la cuenta central** y entra a `https://TU-DOMINIO/api/central/connect?key=TU_ADMIN_KEY`. Acepta los permisos.
5. Para revisar que sigue funcionando: `https://TU-DOMINIO/api/central/status?key=TU_ADMIN_KEY`.

Las playlists se crean **públicas** en el perfil de esa cuenta. Quien la recibe puede guardarla o copiarla a su cuenta (en Spotify: ⋯ → Agregar a otra playlist → Nueva playlist). No se hacen colaborativas, así que nadie más puede modificarlas. Durante 2 días, quien la creó puede agregar las canciones que le quedaron pendientes desde SetSnap.

Si Spotify llegara a invalidar el acceso, `status` lo mostrará y basta con repetir el paso 4.

## Lista de YouTube sin login

Usa el link `youtube.com/watch_videos?video_ids=…`, que arma una lista sin cuenta (hasta 50 videos por lista; YouTube la llama "Untitled List" y se puede guardar). No es una función oficial de YouTube, así que podría dejar de funcionar.

Para encontrar el video de cada canción:
- Si hay `ODESLI_API_KEY`, se convierte el track de Spotify a YouTube con Odesli (sin gastar cuota).
- Si no, se busca con la API de YouTube: la cuota gratis da ~100 búsquedas al día.
- **En ambos casos cada canción se busca una sola vez** y el resultado queda en KV **para siempre**, para todos. Cada 6 meses se comprueba que el video siga existiendo (cuesta 1 unidad de cuota por cada 50 videos) y solo si lo borraron se vuelve a buscar.
- **Precarga:** `data/seed-songs.js` trae ~600 canciones famosas en inglés y español (repertorio de eventos). Cada noche, `.github/workflows/seed-youtube.yml` llama a `/api/admin/seed`, que usa las búsquedas que sobraron del día (dejando una reserva para los usuarios). Con ~70 búsquedas libres al día, la lista completa queda en caché en unos 9 días. Para agregar tus propias canciones: abre `https://TU-DOMINIO/?admin` una vez en tu celular (queda activado en ese dispositivo), conecta tu Spotify, pega el link de tu playlist y toca **"Comparar con la precarga"**: te dice cuáles ya estaban y agrega las nuevas. También sirve pegar texto. `/?admin=0` lo desactiva.
- La cuota de YouTube se reinicia a medianoche hora del Pacífico; el contador de SetSnap usa ese mismo día.

## Límites de Spotify (importante)

Desde febrero de 2026, las apps de Spotify en **Development Mode** necesitan que el dueño tenga **Premium** y solo permiten un número pequeño de usuarios. Son 5 en apps nuevas; las anteriores conservan su límite. Cada usuario se agrega a mano en *User Management* del Dashboard. Para abrir la app a cualquiera hace falta **Extended Quota**, que Spotify hoy solo da a organizaciones.

En la práctica: con la **cuenta central**, cualquiera puede crear playlists sin registrarse. El inicio de sesión con la cuenta propia queda para ti y tu banda (agregados en User Management). El **link para compartir el setlist** funciona para cualquiera.

Si ves un error 403, casi siempre es eso: esa cuenta no está agregada en *User Management*.

## Tests

```bash
npm test
```

Cubren el parser (WhatsApp, numeración, tonos, español), el scoring (acentos, orden invertido, karaoke, versiones en vivo), Gemini (reintentos, modelos retirados o sin cuota) y las funciones del servidor: cuenta central (conexión, renovación del token, límites, editToken), YouTube (caché, tope diario, Odesli) y OCR sin cuenta.

## Despliegue

Ver [GUIA_DESPLIEGUE.md](GUIA_DESPLIEGUE.md) (Cloudflare Pages, gratis y sin "dormirse").
