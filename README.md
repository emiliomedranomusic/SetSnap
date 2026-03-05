# Setlist → Spotify Playlist

Crea una playlist en Spotify a partir de un setlist en texto (o desde una foto del setlist con Gemini). Inspirado en el flujo de [Spotlistr Textbox Search](https://www.spotlistr.com/search/textbox).

## Requisitos

- Node.js 18+
- Cuenta de desarrollador en [Spotify Dashboard](https://developer.spotify.com/dashboard) (para Client ID y Secret)
- Opcional: [Google AI Studio](https://aistudio.google.com/) API key para extraer setlist desde imagen

## Setup

1. Clona o descarga el proyecto.
2. Instala dependencias:
   ```bash
   npm install
   ```
3. Copia `.env.example` a `.env` y rellena:
   - `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`
   - `SPOTIFY_REDIRECT_URI`: debe ser exactamente la URL de callback que registres en el Dashboard de Spotify (ej. `http://127.0.0.1:3000/callback/spotify`)
   - `SESSION_SECRET`: una cadena aleatoria segura
   - Opcional: `GEMINI_API_KEY` para la función de subir imagen de setlist
4. En el Dashboard de Spotify, añade en "Redirect URIs" la misma `SPOTIFY_REDIRECT_URI`.
5. Arranca el servidor:
   ```bash
   node server.js
   ```
6. Abre en el navegador **http://127.0.0.1:3000** (Spotify recomienda 127.0.0.1 para desarrollo).

## Uso

1. **Conectar con Spotify**: inicia sesión con tu cuenta de Spotify (permisos para crear playlists).
2. **Setlist**: escribe o pega una canción por línea. Formatos soportados:
   - `Canción - Artista`
   - `Artista - Canción` (se detecta por contexto, p. ej. "feat.")
   - `Canción / Artista`, `Canción x Artista`, `Canción by Artista`, `Canción de Artista`
   - Solo título (se buscará por nombre).
3. **Opciones**: modo Automático (acepta la mejor coincidencia si el score es alto) o Manual (elige tú por cada línea). Nombre y descripción de la playlist; por defecto es privada.
4. **Buscar**: parsea el setlist y busca en Spotify. Se muestra por cada línea el estado (encontrada, manual, no encontrada) y un porcentaje de coincidencia.
5. **Manual / No encontradas**: en líneas ambiguas o no encontradas puedes elegir una de las sugerencias o marcar "No encontrada / Omitir".
6. **Crear playlist**: crea la playlist en Spotify con las canciones resueltas.

### Imagen → texto (Gemini)

Si configuraste `GEMINI_API_KEY`, puedes subir una foto o captura del setlist. La app extrae el texto con Gemini y rellena el cuadro de setlist; luego puedes pulsar Buscar como siempre.

## Variables de entorno

| Variable | Descripción |
|--------|-------------|
| `SPOTIFY_CLIENT_ID` | Client ID de tu app en Spotify Dashboard |
| `SPOTIFY_CLIENT_SECRET` | Client Secret |
| `SPOTIFY_REDIRECT_URI` | URI de callback (ej. `http://127.0.0.1:3000/callback/spotify`) |
| `SESSION_SECRET` | Secreto para la sesión (cambiar en producción) |
| `GEMINI_API_KEY` | Opcional. API key de Google AI Studio para extraer setlist desde imagen |
| `AUTO_ACCEPT_THRESHOLD` | Opcional. Score mínimo (0–100) para aceptar automáticamente una coincidencia (default: 85) |
| `MANUAL_THRESHOLD` | Opcional. Score mínimo para mostrar opciones en modo manual (por debajo = no encontrada) (default: 50) |

## Scoring y umbrales

- Cada línea del setlist se busca en Spotify y se compara con los resultados usando **similitud de texto** (título y artista), **normalización** (minúsculas, quitar acentos, espacios) y **fuzzy matching**.
- Se asigna un **score 0–100** por resultado (ponderando artista y título).
- **Umbrales**:
  - Score ≥ `AUTO_ACCEPT_THRESHOLD` (default 85) → se acepta automáticamente la mejor coincidencia.
  - Score entre `MANUAL_THRESHOLD` y `AUTO_ACCEPT_THRESHOLD` (default 50–85) → se muestran sugerencias para elegir manualmente.
  - Score &lt; `MANUAL_THRESHOLD` → "No encontrada"; se pueden ver igualmente las primeras sugerencias para elegir o omitir.

## Tests

Tests unitarios de parsing y normalización:

```bash
node test/parseSetlist.test.js
node test/normalize.test.js
```

## Estructura del proyecto

- `server.js`: Express, rutas de login Spotify, `/api/parse-setlist`, `/api/search-spotify`, `/api/create-playlist`, `/api/extract-setlist-from-image`
- `lib/parseSetlist.js`: parsing flexible del textbox (separadores, inversión artista/canción)
- `lib/normalize.js`: normalización y quitar diacríticos para matching
- `lib/spotifySearch.js`: búsqueda en Spotify con scoring y umbrales
- `lib/geminiSetlist.js`: extracción de setlist desde imagen (Gemini)
- `public/index.html`: frontend (setlist, opciones, búsqueda, panel de resultados, crear playlist)

## Limitaciones

- Solo Spotify (sin YouTube).
- La app no guarda imágenes; se envían a Gemini y se descartan tras la respuesta.
- Para producción conviene usar HTTPS y un `SESSION_SECRET` fuerte; configurar correctamente las URIs en Spotify.

## Licencia / atribución

Utiliza la API oficial de Spotify. Este proyecto no está afiliado a Spotify.
