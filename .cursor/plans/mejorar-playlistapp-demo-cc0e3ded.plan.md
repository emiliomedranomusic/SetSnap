<!-- cc0e3ded-9367-405a-81ad-369d00e50729 274b440d-b29b-4bb7-8a43-f2130e2b9771 -->
# Plan de Mejora: PlaylistApp MVP (Solo Spotify)

## Contexto de Decisiones Previas

Basado en análisis extenso de cuotas de APIs:

- **MVP enfocado en Spotify** (YouTube se agregará después con modelo BYOK)
- **Spotify no tiene cuotas de "unidades"** como YouTube - solo rate limits manejables
- **Límites por canciones, no por playlists** (más justo: 2 playlists de 10 canciones = 1 playlist de 20)
- **Feature killer PRO**: Exportar con tempo (BPM) y tonalidad usando Spotify Audio Features API

## Análisis de la Aplicación Actual

**Fortalezas:**

- Integración funcional con Spotify y YouTube APIs
- OAuth2 implementado correctamente con CSRF protection
- UI moderna con Tailwind CSS
- Manejo de errores robusto

**Problemas Identificados:**

1. **Enfoque dual Spotify/YouTube** - debe ser solo Spotify para MVP
2. **Sin límites de uso** - necesita contador de canciones por día
3. **No optimizada para móviles** - falta PWA
4. **Credenciales expuestas** - falta archivo `.env`
5. **Sin feature PRO clara** - falta exportación con BPM/tonalidad
6. **Sin autenticación de usuarios** - depende 100% de OAuth
7. **Sessions en archivos** - cambiar a Supabase
8. **Sin modo demo** - requiere login obligatorio
9. **Archivos innecesarios** - carpeta "Ejemplos web" no se usa

## Mejoras a Implementar

### 1. Arquitectura y Seguridad (Solo Spotify MVP)

**Backend refactorizado:**

- `routes/auth.js` - Google OAuth (identificación) + Spotify OAuth (playlists)
- `routes/playlist.js` - crear playlists solo en Spotify
- `routes/export.js` - **NUEVO**: exportar con BPM/tonalidad (PRO)
- `services/spotify.js` - búsqueda, creación, Audio Features API
- `services/export.js` - generar CSV/Excel/PDF con datos musicales
- `services/cacheService.js` - caché de búsquedas (velocidad, no cuota)
- `middleware/checkUsage.js` - **límite por canciones/día**, no por playlists
- `middleware/auth.js` - verificar Google + Spotify tokens

**Cambios de infraestructura:**

- Reemplazar `lowdb` + sessions en archivos por **Supabase (PostgreSQL)**
- Implementar helmet.js para seguridad
- Implementar `compression` middleware
- CORS configurado para producción

### 2. Sistema de Límites por Canciones

**Modelo Free:**

- 20 canciones/día total
- No importa si es 1 playlist de 20 o 2 de 10
- Tracking por usuario registrado o IP para anónimos

**Modelo PRO ($3-5/mes):**

- 100 canciones/día
- Exportación a CSV/Excel/PDF con:
  - Nombre de playlist
  - Orden de canciones
  - Título y artista
  - **Tempo (BPM)**
  - **Tonalidad (key + mode)**
  - Duración, energía, danceability (opcionales)

**Modelo Premium Plus ($15-20/mes):**

- 300 canciones/día
- Multiusuario (bandas, equipos)
- Plantillas de setlists

### 3. Base de Datos (Supabase PostgreSQL)

**Tablas necesarias:**

```sql
users (
  id, 
  google_id, 
  email, 
  plan_type (FREE/PRO/PREMIUM), 
  subscription_status,
  created_at
)

spotify_tokens (
  user_id,
  access_token_encrypted,
  refresh_token_encrypted,
  expires_at
)

daily_usage (
  user_id,
  date,
  songs_count,
  playlists_created
)

spotify_cache (
  search_query_hash,
  track_id,
  track_name,
  artist_name,
  tempo,
  key,
  mode,
  cached_at
)

playlists_history (
  user_id,
  playlist_name,
  platform (spotify),
  song_count,
  created_at
)
```

### 4. Feature PRO: Exportación con Audio Features

**Implementación:**

- Usar endpoint `GET /audio-features/{id}` de Spotify
- Obtener por cada canción:
  - **tempo** (BPM)
  - **key** (0-11: C, C#, D, D#, E, F, F#, G, G#, A, A#, B)
  - **mode** (0=Minor, 1=Major)
  - energy, danceability, valence (opcionales)

**Formatos de exportación:**

- **CSV**: simple, importable a Excel
- **Excel**: con formato, columnas anchas
- **PDF**: profesional para imprimir (setlist físico)

**Archivos nuevos:**

- `services/audioFeatures.js` - obtener BPM/key de Spotify
- `services/exportCSV.js` - generar CSV
- `services/exportExcel.js` - generar Excel (usar librería `xlsx`)
- `services/exportPDF.js` - generar PDF (usar `jspdf` o `pdfkit`)

### 5. Progressive Web App (PWA)

**Archivos a crear:**

- `public/manifest.json`:
```json
{
  "name": "PlaylistApp - Setlists para Músicos",
  "short_name": "PlaylistApp",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1DB954",
  "icons": [...]
}
```

- `public/service-worker.js` - caché offline básico
- `public/icons/` - 192x192, 512x512 PNG
- Meta tags en `index.html`:
```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#1DB954">
<link rel="apple-touch-icon" href="/icons/icon-192x192.png">
```


### 6. UI/UX Mejorada

**Mejoras en `public/index.html`:**

- Indicador visual: "Te quedan X canciones hoy" (Free) o "Usadas X/100" (PRO)
- Botón "Exportar con BPM/Tonalidad" (solo PRO)
- Modal de upgrade a PRO con beneficios claros
- Toast notifications (usar librería tipo `toastify`)
- Diseño mobile-first
- Skeleton loaders mientras busca canciones

**Nuevas páginas:**

- `/pricing` - planes Free/PRO/Premium
- `/features` - explicar exportación con BPM/tonalidad
- `/dashboard` - historial de playlists, uso diario

### 7. Monetización (Stripe)

**Integración de pagos:**

- `routes/stripe.js` - webhooks, checkout, portal del cliente
- Productos en Stripe:
  - PRO: $3.99-4.99/mes
  - Premium Plus: $14.99-19.99/mes
- Actualizar `plan_type` en DB tras pago exitoso

### 8. Deployment (Vercel + Supabase)

**Configuración:**

- **Frontend + Backend**: Vercel (serverless functions)
- **Base de datos**: Supabase (PostgreSQL + Auth)
- **Variables de entorno**:
  ```
  SPOTIFY_CLIENT_ID
  SPOTIFY_CLIENT_SECRET
  SPOTIFY_REDIRECT_URI
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  GOOGLE_REDIRECT_URI
  SUPABASE_URL
  SUPABASE_ANON_KEY
  SUPABASE_SERVICE_KEY
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  SESSION_SECRET
  ```

- Health check: `GET /api/health`

## Prioridades de Implementación

**Fase 1 - MVP Core (2-3 semanas):**

1. Limpiar código: eliminar YouTube, carpeta "Ejemplos web"
2. Crear `.env`, `.gitignore`, `README.md`
3. Migrar de sessions en archivos a Supabase
4. Implementar límite de canciones/día (middleware)
5. UI: indicador de canciones restantes

**Fase 2 - Feature PRO (1-2 semanas):**

1. Integrar Spotify Audio Features API
2. Crear servicios de exportación (CSV/Excel/PDF)
3. Botón "Exportar" solo para usuarios PRO
4. Integrar Stripe para pagos

**Fase 3 - PWA y Polish (1 semana):**

1. Implementar PWA (manifest, service worker, iconos)
2. Optimizar UI para móviles
3. Toast notifications, loading states
4. Páginas: /pricing, /features, /dashboard

**Fase 4 - Deployment (3-5 días):**

1. Configurar Vercel + Supabase
2. Testing en producción
3. Configurar dominio personalizado
4. Monitoreo y analytics

**Fase 5 - Futuro (YouTube con BYOK):**

1. Implementar wizard semi-automático para API keys propias
2. Agregar límites específicos de YouTube
3. Caché agresivo para YouTube (ahorrar unidades)

## Archivos a Modificar

- `server.js` → refactorizar completamente, eliminar YouTube
- `public/index.html` → agregar PWA tags, indicador de límites, botón exportar
- `package.json` → agregar: `helmet`, `compression`, `@supabase/supabase-js`, `stripe`, `xlsx`, `jspdf`

## Archivos Nuevos a Crear

**Configuración:**

- `.env.example`
- `.gitignore`
- `README.md`
- `vercel.json`

**PWA:**

- `public/manifest.json`
- `public/service-worker.js`
- `public/icons/icon-192x192.png`
- `public/icons/icon-512x512.png`

**Backend:**

- `routes/auth.js`
- `routes/playlist.js`
- `routes/export.js` (PRO feature)
- `routes/stripe.js`
- `services/spotify.js`
- `services/audioFeatures.js`
- `services/exportCSV.js`
- `services/exportExcel.js`
- `services/exportPDF.js`
- `services/cacheService.js`
- `services/supabase.js`
- `middleware/auth.js`
- `middleware/checkUsage.js`
- `middleware/checkPlan.js`

**Database:**

- `db/schema.sql`
- `db/migrations/001_initial.sql`

**Frontend:**

- `public/js/app.js` (modularizar)
- `public/js/pwa.js`
- `public/css/styles.css`
- `public/pricing.html`
- `public/features.html`
- `public/dashboard.html`

## Archivos a Eliminar

- `Ejemplos web/` (carpeta completa - era para scraping descartado)
- `sessions/*.json` (migrar a Supabase)
- `db.json` (no se usa)
- Todo código relacionado con YouTube API (mover a branch separada para futuro)

## Modelo de Negocio Final

**Free (20 canciones/día):**

- Crear playlists en Spotify
- Historial básico
- Monetización: ads opcionales

**PRO ($4.99/mes - 100 canciones/día):**

- Todo de Free
- **Exportar con BPM y tonalidad** (CSV/Excel/PDF)
- Sin ads
- Plantillas de setlists

**Premium Plus ($19.99/mes - 300 canciones/día):**

- Todo de PRO
- Multiusuario (bandas)
- Prioridad en soporte
- Acceso early a YouTube (cuando se lance)

## Costos Estimados

**0-100 usuarios:**

- Vercel: $0 (free tier)
- Supabase: $0 (free tier hasta 500MB)
- Total: **$0/mes**

**100-1,000 usuarios:**

- Vercel: $20/mes
- Supabase Pro: $25/mes
- Total: **$45/mes**

**Ingresos estimados con 100 usuarios (10% conversión a PRO):**

- 10 usuarios × $4.99 = **$49.90/mes**
- Margen: ~$5-50/mes positivo desde el inicio

### To-dos

- [ ] Limpiar archivos innecesarios y crear .gitignore
- [ ] Crear .env.example y configurar variables de entorno
- [ ] Instalar nuevas dependencias (rate-limit, helmet, compression)
- [ ] Implementar PWA (manifest, service worker, iconos)
- [ ] Implementar sistema de rate limiting y modo demo
- [ ] Mejorar sistema de autenticación con Google y modo anónimo
- [ ] Configurar lowdb para gestión de usuarios y límites
- [ ] Refactorizar server.js en módulos separados
- [ ] Mejorar UI para móviles y experiencia de usuario
- [ ] Crear README.md y documentación de deployment
- [ ] Configurar para deployment en Render/Railway