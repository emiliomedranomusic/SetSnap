/**
 * Configuración pública para el frontend. El Client ID de Spotify no es
 * secreto (con PKCE no se usa client secret).
 */
import { isCentralConnected } from '../../lib/server/central.js';

export async function onRequestGet({ env }) {
    const ocrEnabled = Boolean(env.GEMINI_API_KEY);
    return Response.json(
        {
            spotifyClientId: env.SPOTIFY_CLIENT_ID || null,
            centralEnabled: await isCentralConnected(env).catch(() => false),
            ocrEnabled,
            ocrGuests: ocrEnabled && env.OCR_GUESTS !== '0',
            youtubeEnabled: Boolean(env.YOUTUBE_API_KEY || env.ODESLI_API_KEY),
        },
        { headers: { 'Cache-Control': 'public, max-age=60' } }
    );
}
