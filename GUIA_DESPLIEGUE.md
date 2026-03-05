# 🚀 Cómo publicar tu aplicación para que todos puedan usarla

Actualmente, "SetSnap" funciona solo en tu computadora (`localhost`). Si quieres compartir un enlace con tus amigos y que lo usen desde su celular (incluso instalándolo como App o PWA), debes subirlo a un servidor en la nube.

Aquí tienes la guía más sencilla usando **Render.com** (Es gratis y excelente para proyectos en Node.js).

## Paso 1: Sube el código a GitHub
1. Entra a [GitHub.com](https://github.com) y crea un nuevo repositorio público o privado.
2. Descarga e instala [GitHub Desktop](https://desktop.github.com/).
3. Arrastra la carpeta de tu proyecto (`PlaylistApp 3 EDIT`) a GitHub Desktop.
4. Escribe un nombre para tu "Commit" (ej. *Subiendo Setlist App*) y dale a **Publish Repository**.

## Paso 2: Despliega en Render.com
1. Crea una cuenta gratuita en [Render.com](https://render.com/).
2. Haz clic en **"New +"** arriba a la derecha y selecciona **"Web Service"**.
3. Selecciona **"Build and deploy from a Git repository"** y vincula tu cuenta de GitHub.
4. Selecciona el repositorio que acabas de subir ("PlaylistApp" o el nombre que le pusiste).
5. Configura los siguientes campos:
   * **Name**: `mi-setlist-app` (puedes poner el que quieras).
   * **Environment**: `Node`
   * **Build Command**: `npm install && npm run build:css`
   * **Start Command**: `node server.js`
   * **Plan**: `Free` (Gratis).

## Paso 3: Configura tus Secretos (Environment Variables)
¡Muy importante! En la misma pantalla de Render, baja hasta la sección **Environment Variables** (Variables de Entorno) y agrega las que tienes en tu archivo `.env` local:

| Key | Value |
|---|---|
| `SPOTIFY_CLIENT_ID` | Pega aquí tu Client ID |
| `SPOTIFY_CLIENT_SECRET` | Pega aquí tu Client Secret |
| `SPOTIFY_REDIRECT_URI` | **(Mira el Paso 4)** |
| `SESSION_SECRET` | Pega un texto cualquiera para seguridad |
| `GEMINI_API_KEY` | Pega aquí tu Key de Google Gemini |

## Paso 4: Actualiza Spotify y lanza
1. Render te dará una URL para tu web, por ejemplo: `https://mi-setlist-app.onrender.com`.
2. En la variable `SPOTIFY_REDIRECT_URI` que creaste en el paso 3, escribe: **`https://mi-setlist-app.onrender.com/callback/spotify`**.
3. Haz clic en **Create Web Service**. Va a tardar unos 2 a 5 minutos en subir.
4. Mientras sube, ve a tu [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/).
5. Selecciona tu App de Spotify, ve a **Settings** y busca la sección **Redirect URIs**.
6. **MUY IMPORTANTE**: Agrega la nueva URI `https://mi-setlist-app.onrender.com/callback/spotify` y asegúrate de hacer clic en **Save** o **Add**. *Si no haces esto, Spotify mostrará un error ("INVALID_CLIENT") cuando tus amigos intenten iniciar sesión.*

¡Listo! Cuando Render termine, entra a tu nueva URL desde el móvil. Como le hemos añadido soporte PWA, tu navegador de celular te preguntará "¿Añadir a la pantalla de inicio?". Si le das a sí, se instalará como una App nativa.
