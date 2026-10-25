# SetSnap

Convierte el setlist que te mandaron (texto de WhatsApp, lista impresa o foto escrita a mano) en una playlist de Spotify en segundos. Pensado para músicos: pegas, revisas lo dudoso y listo.

## Qué hace

- **Pega el setlist tal cual.** Entiende numeración (`1.`, `2)`, `3.-`), viñetas, emojis, mensajes copiados de WhatsApp, `Canción - Artista` o `Artista - Canción` (da igual el orden: busca ambas y se queda con la mejor), `Canción by/por Artista`, `Canción (Artista)` o solo el título.
- **Separa el tono y el tempo.** `La Bamba (en G)`, `Tono: Am`, `capo 2`, `120 bpm` se guardan como nota y no ensucian la búsqueda.
- **Foto del setlist (OCR con Gemini).** Toma una foto, súbela, pega una captura con Ctrl+V o arrástrala. En Android, instalada como app, puedes usar **Compartir → SetSnap** desde WhatsApp o la galería.
- **Revisar o crear directo.** En "Revisar antes" ves cada coincidencia, puedes elegir otra opción, editar la búsqueda u omitir la línea. En "Crear directo" se agregan las coincidencias seguras y las dudosas quedan abajo para resolverlas.
- **Playlist nueva o existente**, sin repetir canciones que ya estén.
- **Para la banda:** link para compartir el setlist (no necesitan cuenta, el setlist va dentro del link), copiar como texto e imprimir / guardar como PDF en letra grande con el tono de cada canción.

## Arquitectura

```
public/                 Sitio estático (lo que se publica)
  index.html
  js/app.js             Interfaz
  js/parser.js          Parsing del setlist
  js/scoring.js         Puntuación de coincidencias (0-100)
  js/search.js          Estrategia de búsqueda en Spotify
  js/spotify.js         Login PKCE y API de Spotify desde el navegador
  js/ocr.js             Reduce la foto y la manda al OCR
  js/share.js           Link compartible y exportar a texto
  sw.js                 Service worker (caché + "Compartir → SetSnap")
functions/              Cloudflare Pages Functions (lo único con servidor)
  api/config.js         Client ID público y si el OCR está activo
  api/extract-setlist.js  OCR: valida sesión de Spotify, límites diarios, caché, Gemini
  share-target.js       Respaldo de "Compartir" si el service worker no está activo
lib/gemini.js           Llamada a Gemini (REST, sin SDK)
test/                   Tests (node --test)
```

- **Spotify se usa directo desde el navegador** con Authorization Code + PKCE. No hay client secret, ni sesiones, ni servidor que se duerma.
- **El OCR es la única parte con servidor**, porque la API key de Gemini no puede ir en el navegador. Para usarlo hace falta haber iniciado sesión en Spotify. Tiene límites diarios por usuario y globales, guardados en Workers KV, así que el costo tiene techo.

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
| `GEMINI_MODEL` | No | Modelo a probar primero. Si no existe, se prueban `gemini-3.1-flash-lite`, `gemini-3.1-flash-lite-preview` y `gemini-2.5-flash-lite`. |
| `OCR_USER_DAILY` | No | Fotos por usuario al día (por defecto 12). |
| `OCR_GLOBAL_DAILY` | No | Fotos en total al día (por defecto 200). Es el techo de gasto. |
| `ALLOWED_SPOTIFY_USERS` | No | IDs de usuario de Spotify separados por coma que pueden usar el OCR. Vacío = cualquiera con sesión. |

Binding de KV: `RATE_LIMIT_KV`. Sin él, los límites solo viven en memoria y no son confiables.

## Costo del OCR

Cada foto se reduce en el navegador a 1600 px antes de subirse. Se usa un modelo Flash-Lite con el "thinking" al mínimo y una respuesta JSON que solo trae título, artista y nota. Con los precios publicados en 2026, una foto de setlist cuesta del orden de **una décima de centavo de dólar**. Con el tope por defecto de 200 fotos al día, el peor caso son centavos diarios. Las fotos repetidas salen de caché y no se cobran.

Para ver el consumo real, revisa los logs de la función: cada llamada imprime `[ocr] tokens`.

## Límites de Spotify (importante)

Desde febrero de 2026, las apps de Spotify en **Development Mode** necesitan que el dueño tenga **Premium** y solo permiten un número pequeño de usuarios. Son 5 en apps nuevas; las anteriores conservan su límite. Cada usuario se agrega a mano en *User Management* del Dashboard. Para abrir la app a cualquiera hace falta **Extended Quota**, que Spotify hoy solo da a organizaciones.

En la práctica: SetSnap funciona para ti y tu banda. El **link para compartir el setlist** funciona para cualquiera, aunque no esté registrado.

Si ves un error 403, casi siempre es eso: esa cuenta no está agregada en *User Management*.

## Tests

```bash
npm test
```

Cubren el parser (WhatsApp, numeración, tonos, español), el scoring (acentos, orden invertido, karaoke, versiones en vivo) y la integración con Gemini (respuestas, reintentos, modelos retirados).

## Despliegue

Ver [GUIA_DESPLIEGUE.md](GUIA_DESPLIEGUE.md) (Cloudflare Pages, gratis y sin "dormirse").
