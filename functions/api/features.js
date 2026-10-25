/**
 * POST /api/features  { songs: [{ id?, title, artist }] }
 * → { features: [{ bpm, key }|null], pending }
 *
 * BPM y tonalidad: ReccoBeats (por ID de Spotify) y, de respaldo,
 * GetSongBPM (por título y artista). Todo queda en caché para todos.
 */
import { findFeatures } from '../../lib/server/features.js';
import { json, clientIp, tr, memoryLimiter } from '../../lib/server/common.js';

const MAX_SONGS = 100;
const overLimit = memoryLimiter(10 * 60 * 1000, 60);

export async function onRequestPost({ request, env }) {
    if (overLimit(clientIp(request))) {
        return json(429, { success: false, message: tr(request, 'Demasiadas consultas seguidas. Espera unos minutos.', 'Too many requests in a row. Wait a few minutes.') }, { 'Retry-After': '60' });
    }
    let body;
    try {
        body = await request.json();
    } catch {
        return json(400, { success: false, message: tr(request, 'Petición inválida.', 'Invalid request.') });
    }
    const songs = (Array.isArray(body?.songs) ? body.songs : [])
        .slice(0, MAX_SONGS)
        .map((s) => ({
            id: typeof s?.id === 'string' && /^[A-Za-z0-9]{22}$/.test(s.id) ? s.id : '',
            title: String(s?.title || '').slice(0, 200),
            artist: String(s?.artist || '').slice(0, 200),
        }));
    if (!songs.some((s) => s.title || s.id)) return json(400, { success: false, message: tr(request, 'No hay canciones.', 'No songs.') });
    const { features, pending } = await findFeatures(env, songs);
    return json(200, { success: true, features, pending });
}
