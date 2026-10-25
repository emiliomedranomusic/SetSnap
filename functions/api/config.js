/**
 * Configuración pública para el frontend. El Client ID de Spotify no es
 * secreto (con PKCE no se usa client secret).
 */
export function onRequestGet({ env }) {
    return Response.json(
        {
            spotifyClientId: env.SPOTIFY_CLIENT_ID || null,
            ocrEnabled: Boolean(env.GEMINI_API_KEY),
        },
        { headers: { 'Cache-Control': 'public, max-age=300' } }
    );
}
