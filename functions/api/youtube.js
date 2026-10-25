/**
 * POST /api/youtube  { songs: [{ id?, title, artist }] }
 * → { videos: [videoId|null], urls: [watch_videos...], limited }
 *
 * Arma una lista de YouTube sin iniciar sesión. Los videos ya buscados por
 * cualquier usuario salen de caché y no gastan cuota.
 */
import { findVideos, watchUrls } from '../../lib/server/youtube.js';
import { json, kvStore, clientIp, today, dailyLimits, intEnv } from '../../lib/server/common.js';

const MAX_SONGS = 100;

export async function onRequestPost({ request, env }) {
    if (!env.YOUTUBE_API_KEY && !env.ODESLI_API_KEY) {
        return json(503, { success: false, message: 'YouTube no está configurado en este servidor.' });
    }
    let body;
    try {
        body = await request.json();
    } catch {
        return json(400, { success: false, message: 'Petición inválida.' });
    }
    const songs = (Array.isArray(body?.songs) ? body.songs : [])
        .slice(0, MAX_SONGS)
        .map((s) => ({
            id: typeof s?.id === 'string' ? s.id : '',
            title: String(s?.title || '').slice(0, 200),
            artist: String(s?.artist || '').slice(0, 200),
        }))
        .filter((s) => s.title);
    if (!songs.length) return json(400, { success: false, message: 'No hay canciones.' });

    // Límite por IP para que una sola persona no se gaste la cuota del día.
    const limits = await dailyLimits(kvStore(env), [
        { name: 'ip', key: `yt:ip:${clientIp(request)}:${today()}`, max: intEnv(env.YOUTUBE_LISTS_PER_IP, 20) },
    ]);
    if (limits.exceeded) return json(429, { success: false, message: 'Llegaste al límite de listas de YouTube por hoy.' });

    const { videos, limited } = await findVideos(env, songs);
    await limits.add(1);
    return json(200, { success: true, videos, urls: watchUrls(videos), limited });
}
