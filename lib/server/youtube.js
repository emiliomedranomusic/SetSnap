/**
 * Encuentra el video de YouTube de cada canción.
 *
 * El costo está en la búsqueda (la API de YouTube da ~100 búsquedas al día
 * gratis), así que cada canción se busca UNA sola vez y el resultado queda
 * en KV para todos los usuarios. Si hay llave de Odesli (song.link) se usa
 * primero: convierte el track de Spotify a YouTube sin gastar cuota.
 */
import { kvStore, safePut, today, DAY_TTL, intEnv } from './common.js';

const FOUND_TTL = 180 * 24 * 60 * 60;
const MISS_TTL = 7 * 24 * 60 * 60;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function cacheKey(song) {
    if (song.id && /^[A-Za-z0-9]{22}$/.test(song.id)) return `yt:sp:${song.id}`;
    return `yt:q:${norm(`${song.title} ${song.artist}`).slice(0, 200)}`;
}

export function videoIdFromUrl(url) {
    try {
        const u = new URL(url);
        const v = u.searchParams.get('v') || (u.hostname === 'youtu.be' ? u.pathname.slice(1) : '');
        return VIDEO_ID_RE.test(v) ? v : null;
    } catch {
        return null;
    }
}

async function viaOdesli(song, key) {
    if (!key || !song.id) return undefined;
    const params = new URLSearchParams({ url: `https://open.spotify.com/track/${song.id}`, key });
    const res = await fetch(`https://api.song.link/v1-alpha.1/links?${params}`);
    if (!res.ok) {
        console.warn('[youtube] odesli', res.status);
        return undefined; // undefined = no se pudo consultar; se intenta con YouTube
    }
    const data = await res.json().catch(() => null);
    const links = data?.linksByPlatform || {};
    return videoIdFromUrl(links.youtube?.url) || videoIdFromUrl(links.youtubeMusic?.url) || null;
}

async function viaYouTubeSearch(song, key) {
    const params = new URLSearchParams({
        part: 'id',
        type: 'video',
        maxResults: '1',
        videoCategoryId: '10', // Música
        q: `${song.title} ${song.artist || ''}`.trim(),
        key,
    });
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    if (res.status === 403 || res.status === 429) {
        const data = await res.json().catch(() => null);
        console.warn('[youtube] cuota', res.status, data?.error?.errors?.[0]?.reason);
        throw Object.assign(new Error('quota'), { quota: true });
    }
    if (!res.ok) return undefined;
    const data = await res.json().catch(() => null);
    const id = data?.items?.[0]?.id?.videoId;
    return VIDEO_ID_RE.test(id || '') ? id : null;
}

/**
 * songs: [{ id?, title, artist }] → { videos: [videoId|null], limited }
 * limited = true si quedaron canciones sin buscar por la cuota diaria.
 */
export async function findVideos(env, songs) {
    const kv = kvStore(env);
    const keys = songs.map(cacheKey);
    const cached = await Promise.all(keys.map((k) => kv.get(k)));
    const videos = cached.map((v) => (v && v !== '-' ? v : null));
    const pending = songs.map((s, i) => (cached[i] == null ? i : -1)).filter((i) => i >= 0);
    if (!pending.length) return { videos, limited: false };

    const counterKey = `yt:searches:${today()}`;
    const maxSearches = intEnv(env.YOUTUBE_DAILY_SEARCHES, 90);
    let used = Number(await kv.get(counterKey)) || 0;
    let searches = 0;
    let limited = false;

    for (const i of pending) {
        const song = songs[i];
        let id = await viaOdesli(song, env.ODESLI_API_KEY).catch(() => undefined);
        if (id === undefined && env.YOUTUBE_API_KEY) {
            if (used + searches >= maxSearches) {
                limited = true;
                continue;
            }
            try {
                searches++;
                id = await viaYouTubeSearch(song, env.YOUTUBE_API_KEY);
            } catch (err) {
                if (err.quota) {
                    limited = true;
                    used = maxSearches;
                    continue;
                }
                throw err;
            }
        }
        if (id === undefined) continue; // sin fuente disponible: no se cachea
        videos[i] = id;
        await safePut(kv, keys[i], id || '-', { expirationTtl: id ? FOUND_TTL : MISS_TTL });
    }
    if (searches) await safePut(kv, counterKey, String(used + searches), { expirationTtl: DAY_TTL });
    return { videos, limited };
}

/** Links "watch_videos" (máx. 50 videos por lista). */
export function watchUrls(videoIds) {
    const ids = videoIds.filter(Boolean);
    const urls = [];
    for (let i = 0; i < ids.length; i += 50) {
        urls.push(`https://www.youtube.com/watch_videos?video_ids=${ids.slice(i, i + 50).join(',')}`);
    }
    return urls;
}
