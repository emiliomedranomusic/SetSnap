> **Documento histórico.** Describe la versión con servidor Express. La app actual es estática con login PKCE y una función serverless para el OCR (ver README).

# Auditoría del repo y plan por fases

## 1. Auditoría

### Arquitectura actual
- **Backend:** Node.js + Express 5, un solo archivo `server.js` (~177 líneas).
- **Frontend:** SPA en `public/index.html` (HTML + JS inline + Tailwind CDN).
- **Sesión:** `express-session` + `session-file-store` en `./sessions`.
- **APIs:** Spotify (spotify-web-api-node), Google/YouTube (googleapis) — YouTube se elimina.

### Fallas / deuda técnica
- **YouTube:** Toda la lógica YouTube (OAuth, callback, búsqueda, rama en create-playlist) se elimina para el MVP.
- **Parsing:** Solo client-side, pocos separadores; sin normalización ni manejo de "Artista - Canción", "x", "—", "/", ni "solo canción" explícito.
- **Matching:** Sin scoring ni fuzzy; se usa el primer resultado de Spotify por línea; no hay panel de no encontradas ni modo manual.
- **UX:** Un solo flujo "Crear playlist" sin paso previo de búsqueda/validación; sin conteos (detectadas / auto / manual / no encontradas); sin Reset/Copy report/Download.
- **Playlist:** Nombre por defecto genérico; sin descripción ni opción explícita privado/público.
- **Dependencias no usadas en código:** `axios`, `cheerio`, `connect-loki`, `lowdb`, `open`; `@spotify/web-api-ts-sdk` en package.json pero el server usa `spotify-web-api-node`.
- **Tests:** Ninguno.
- **Auth Spotify:** Authorization Code (sin PKCE); refresh token ya implementado. Se mantiene tal cual (PKCE no es obligatorio con backend que guarda el secret).

### Lista de cambios (YouTube y limpieza)
- **server.js:** Quitar `googleapis`, `oauth2Client`, `googleScopes`, listeners de tokens, `searchAndAddYoutubeVideos`, rutas `/login/youtube` y `/callback/youtube`, rama `platform === 'youtube'` en `/api/create-playlist`.
- **public/index.html:** Quitar botón YouTube, variable `createYoutubeButton`, rama YouTube en `ensureCorrectHostForPlatform`, listener del botón YouTube.
- **package.json:** Quitar `googleapis` (y opcionalmente `axios`, `cheerio` si no se usan).
- **.env / documentación:** Quitar referencias a `GOOGLE_*`; documentar en `.env.example` solo Spotify (y luego Gemini).

---

## 2. Plan por fases

### Fase 1 – MVP base (solo Spotify, sin YouTube)
- Eliminar todo lo relacionado con YouTube (backend, frontend, dependencias, variables de entorno).
- Un solo botón "Conectar con Spotify" y flujo "Buscar / Crear" en la UI.

### Fase 2 – Parsing y normalización
- Parsing flexible en backend (y reutilizable en cliente para feedback inmediato): aceptar "Canción - Artista", "Artista - Canción", "Canción x/—/ by / de Artista", "Solo canción"; tolerar comillas, paréntesis (feat.), espacios extra.
- Módulo de normalización: casefold, trim, colapsar espacios, quitar diacríticos (ej. Asuncion = Asunción).
- Tests unitarios para parsing y normalización (casos: acentos, feat., inversión artista/canción).

### Fase 3 – Matching y scoring
- Búsqueda Spotify por línea devolviendo N resultados (ej. top 5).
- Normalización de título/artista de la línea y de cada resultado; fuzzy matching (token sort / similarity); ponderación artista + título; score 0–100.
- Umbrales: auto-aceptar si score ≥ X (ej. 85), manual si Y ≤ score < X (ej. 50–85), no encontrada si score < Y.
- API que devuelva por línea: `rawLine`, `title`, `artist`, `matches[]` con `{ track, score }`, `resolvedUri` si auto-aceptado, `status`: 'found' | 'manual' | 'not_found'.

### Fase 4 – Backend: rutas y flujo
- `POST /api/parse-setlist`: body `{ rawText }` → `{ items: [{ rawLine, title, artist }] }`.
- `POST /api/search-spotify`: body `{ items, mode: 'auto'|'manual' }`; requiere sesión Spotify; devuelve resultados con matches y status por línea.
- `POST /api/create-playlist`: body `{ playlistName?, description?, public?: boolean, resolvedTracks: [{ uri, rawLine }] }`; crear playlist y añadir tracks; nombre por defecto "Setlist - YYYY-MM-DD HH:mm" si no se envía.

### Fase 5 – UX tipo Spotlistr
- Input multiline para setlist; botón principal "Buscar / Crear".
- Después de búsqueda: panel con conteos (detectadas, auto, manual, no encontradas) y lista por línea.
- Modo manual: por cada línea en estado manual, mostrar opciones (título, artista, álbum, duración, link) y permitir elegir o "skip" / "no encontrada".
- Panel "No encontradas / Ambiguas": línea original, score, top N sugerencias para selección manual.
- Botones: Reset, Copy report, Download (CSV/JSON), Crear playlist; todos con estados loading/disabled cuando corresponda.

### Fase 6 – Nombre y opciones de playlist
- Nombre: si no se escribe, usar "Setlist - YYYY-MM-DD HH:mm" (opción A elegida: menos fricción).
- Descripción opcional.
- Opción privado/público (por defecto privado).

### Fase 7 – Imagen → texto (Gemini)
- Módulo aislado: `extractSetlistFromImage(imageBuffer)` → `Promise<{ items: [{ rawLine, title?, artist?, confidence? }] }>`.
- Prompt tipo "función": entrada imagen; salida solo JSON, sin texto extra; estructura `{ items: [{ rawLine, title, artist, confidence }] }`; mantener orden; si no está seguro del artista, `artist: null`.
- Ruta `POST /api/extract-setlist-from-image` (multipart); no guardar imagen; borrar después de procesar.
- Manejo de errores: imagen borrosa, ilegible, etc.

### Fase 8 – Documentación y tests
- README: setup, variables de entorno (Spotify + Gemini), explicación de thresholds y scoring.
- `.env.example` con todas las variables necesarias.
- Tests unitarios para parsing y normalización (y opcionalmente scoring con mocks).

---

## 3. Decisiones asumidas

- **Nombre del playlist:** Opción A — si el usuario no escribe nombre, generar "Setlist - YYYY-MM-DD HH:mm". Justificación: menos fricción y consistencia con flujo "setlist".
- **Umbrales de score:** Auto-aceptar ≥ 85, manual 50–84, no encontrada < 50. Ajustables vía env o config.
- **N resultados para manual / sugerencias:** Top 5 por línea.
- **PKCE:** No migrar a PKCE; el backend guarda client secret y el flujo Authorization Code es válido; refresh token ya está implementado.
- **Dependencias fuzzy:** Añadir `string-similarity` para scoring; diacríticos con función inline (normalize NFD + replace) para no añadir dependencia extra.

---

## 4. Prompt para Gemini (extracción de setlist desde imagen)

Objetivo: que Cursor genere un prompt tipo "función" estricto, JSON-only.

**Input:** imagen del setlist (foto/screenshot de lista de canciones).

**Output:** solo JSON, sin texto adicional fuera del JSON.

**Formato:**

```json
{
  "items": [
    {
      "rawLine": "texto tal cual aparece en la imagen para esta línea",
      "title": "Título de la canción",
      "artist": "Nombre del artista o null si no se puede determinar",
      "confidence": 0.0
    }
  ]
}
```

**Reglas para el modelo:**
- Devolver únicamente el objeto JSON, sin markdown ni explicaciones.
- Una entrada por línea de la lista visible en la imagen.
- Mantener el orden del setlist.
- Si no está seguro del artista, usar `artist: null`.
- `confidence` opcional: valor entre 0 y 1 según certeza (si el modelo lo soporta).
- Si una línea es ilegible o ambigua, incluirla con `rawLine` aproximado y `title`/`artist` lo mejor posible o null; no omitir líneas para mantener orden.

Este bloque puede usarse como instrucción de sistema o como prompt de usuario en Google AI Studio / Gemini API.
