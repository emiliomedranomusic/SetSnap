# Investigación (octubre 2026): otras plataformas, BPM/tonalidad y monetización

## Otras plataformas

| Plataforma | ¿Se puede crear la playlist desde SetSnap? | Detalle |
|---|---|---|
| **YouTube Music** | Parcial | No tiene API oficial. Lo que hay: (1) la lista `watch_videos` sin login (ya implementada; se puede guardar desde YouTube); (2) la YouTube Data API con login de Google crea playlists en la cuenta del usuario, que normalmente aparecen también en YouTube Music. Problemas: 50 unidades por playlist + 50 por canción (un setlist de 30 ≈ 1.550 unidades de 10.000/día ⇒ ~6 setlists/día por proyecto) y el permiso `youtube` exige verificar la app con Google. La ampliación de cuota es gratis pero pasa por una auditoría. |
| **Tidal** | Posible, con aprobación | Tiene API oficial (OAuth con PKCE, permiso `playlists.write`). Registrarse es gratis, pero los términos son **solo para uso no comercial** y ampliar la cuota requiere aprobación de Tidal; hay solicitudes de acceso sin respuesta en su GitHub. Cada persona tendría que iniciar sesión con su Tidal (no hay "cuenta central" razonable). |
| **Deezer** | No | Deezer **cerró el registro de apps nuevas** (2025) y no ha dicho cuándo reabre. Su API pública de lectura sigue existiendo, pero sin app no se pueden crear playlists. |
| **Amazon Music** | No | La Web API está en **beta cerrada**, solo por invitación. |
| **Apple Music** | Sí, pagando | MusicKit JS: requiere Apple Developer Program (US$99/año) y que el usuario tenga Apple Music. No tiene límite de usuarios como Spotify. |

**Puente para todas:** el botón **Exportar CSV** genera un archivo que TuneMyMusic o Soundiiz importan y convierten a cualquier plataforma (Deezer, Apple Music, Tidal, Amazon, YouTube Music). Es lo más práctico mientras esas APIs sigan cerradas.

## BPM y tonalidad

- **Spotify** cerró `audio-features` (tempo, tonalidad) para apps nuevas en noviembre de 2024. No hay forma de recuperarlo.
- **GetSongBPM API**: gratis, con llave por email, 3.000 peticiones/hora, devuelve **tempo y tonalidad**. Condición obligatoria: un link visible a getsongbpm.com. Es la mejor opción.
- **ReccoBeats**: gratis y sin llave, acepta IDs de Spotify y devuelve tempo (y otros datos tipo Spotify). Buen respaldo para BPM; la tonalidad no está confirmada.
- **Deezer**: su API pública tiene un campo `bpm` por canción (sin llave), pero muchas veces viene en 0 y no trae tonalidad.
- **Análisis propio** (Essentia.js en el navegador sobre los 30 s de preview de Deezer/iTunes): gratis e independiente, pero más pesado (~2 MB) y menos exacto en la tonalidad.

**Plan propuesto:** GetSongBPM primero, ReccoBeats como respaldo para BPM, resultados en caché permanente por canción (igual que YouTube). Se mostraría en la revisión, en la hoja impresa y en el setlist compartido, editable a mano porque muchas bandas tocan en otro tono. Falta: registrarse en GetSongBPM y probar con canciones reales (desde este entorno no se pudieron consultar esas APIs).

## Monetización (freemium)

**Restricciones importantes:**
- Spotify en Development Mode es para "proyectos personales no comerciales". Su política sí permite cobrar por apps que *no reproducen música* (un gestor de playlists), pero cobrar mientras se usa Development Mode y una cuenta central es arriesgado: Spotify podría cortar el acceso.
- Tidal: solo uso no comercial.

**Recomendación:** que crear playlists siga siendo **gratis siempre** y cobrar por lo que **no depende de Spotify**: herramientas para la banda.

| | Gratis | Pro (US$3–5/mes o ~US$30/año) |
|---|---|---|
| Pegar texto y crear playlist | Ilimitado (con límites anti-abuso) | Ilimitado |
| Foto del setlist (OCR) | 5 por día | 100 por día |
| Lista de YouTube, CSV, link para la banda | Sí | Sí |
| BPM y tonalidad por canción | — | Sí |
| Guardar setlists (biblioteca) y reordenarlos | Últimos 3 | Ilimitados |
| Hoja de escenario PDF (tono, BPM, notas, tamaño de letra, logo) | Básica | Personalizable |
| Espacio de banda: setlist compartido que se actualiza en vivo | — | Sí |
| Transponer tono / notas por canción | — | Sí |

Para cobrar haría falta: cuentas de usuario (login por email, sin depender de Spotify), una base de datos (Cloudflare D1, gratis) y un procesador de pagos. **Lemon Squeezy o Paddle** convienen más que Stripe directo porque actúan como "merchant of record" y resuelven los impuestos internacionales (México, España, EE. UU.).

**Primer paso sugerido:** lanzar gratis, medir uso, agregar un botón de "Apóyanos" (Ko-fi / Buy Me a Coffee) y construir Pro cuando haya usuarios recurrentes.
