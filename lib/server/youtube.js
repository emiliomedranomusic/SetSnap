/**
 * Encuentra el video de YouTube de cada canción.
 *
 * El costo está en la búsqueda (la API de YouTube da ~100 búsquedas al día
 * gratis), así que cada canción se busca UNA sola vez y el resultado queda
 * en KV para siempre, para todos los usuarios. Cada 6 meses se comprueba
 * que el video siga existiendo (videos.list: 1 unidad por hasta 50 videos)
 * y solo si desapareció se vuelve a buscar.
 * Si hay llave de Odesli (song.link) se usa primero: convierte el track de
 * Spotify a YouTube sin gastar cuota.
 */
import { kvStore, safePut, DAY_TTL, intEnv } from './common.js';

const RECHECK_AFTER_MS = 180 * 24 * 60 * 60 * 1000;
const MISS_TTL = 30 * 24 * 60 * 60; // "no encontrada" se reintenta al mes
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
// Workers gratis permite ~50 peticiones salientes por invocación.
const MAX_FETCHES_PER_CALL = 40;

function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export const VERSIONS = ['karaoke', 'instrumental'];

export function cacheKey(song) {
    const suffix = VERSIONS.includes(song.version) ? `:${song.version}` : '';
    if (song.id && /^[A-Za-z0-9]{22}$/.test(song.id)) return `yt:sp:${song.id}${suffix}`;
    return `yt:q:${norm(`${song.title} ${song.artist}`).slice(0, 200)}${suffix}`;
}

/** La cuota de YouTube se reinicia a medianoche hora del Pacífico. */
export function quotaDay(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
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

/** Valor guardado: {"v": videoId|null, "t": ms}. Acepta el formato viejo (texto plano). */
export function parseEntry(raw) {
    if (raw == null) return null;
    if (raw === '-') return { v: null, t: 0 };
    if (VIDEO_ID_RE.test(raw)) return { v: raw, t: 0 };
    try {
        const e = JSON.parse(raw);
        return { v: VIDEO_ID_RE.test(e?.v || '') ? e.v : null, t: Number(e?.t) || 0 };
    } catch {
        return null;
    }
}

async function saveEntry(kv, key, videoId) {
    const value = JSON.stringify({ v: videoId || null, t: Date.now() });
    await safePut(kv, key, value, videoId ? undefined : { expirationTtl: MISS_TTL });
}

async function viaOdesli(song, key) {
    // Odesli solo conoce la versión original.
    if (!key || !song.id || song.version) return undefined;
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
        q: `${song.title} ${song.artist || ''} ${VERSIONS.includes(song.version) ? song.version : ''}`.replace(/\s+/g, ' ').trim(),
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

/** IDs que siguen existiendo en YouTube (1 unidad de cuota por llamada de hasta 50). */
async function stillAvailable(ids, key) {
    const alive = new Set();
    for (let i = 0; i < ids.length; i += 50) {
        const params = new URLSearchParams({ part: 'id', id: ids.slice(i, i + 50).join(','), key });
        const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
        if (!res.ok) return null; // no se pudo comprobar: se dan por buenos
        const data = await res.json().catch(() => null);
        for (const item of data?.items || []) alive.add(item.id);
    }
    return alive;
}

/**
 * songs: [{ id?, title, artist }] → { videos: [videoId|null], limited }
 * limited = true si quedaron canciones sin buscar (cuota diaria o límite
 * de peticiones por llamada).
 * opts.budget: máximo de búsquedas nuevas que puede gastar esta llamada.
 */
export async function findVideos(env, songs, opts = {}) {
    const kv = kvStore(env);
    const keys = songs.map(cacheKey);
    const entries = (await Promise.all(keys.map((k) => kv.get(k)))).map(parseEntry);
    const videos = entries.map((e) => e?.v || null);
    let fetches = 0;

    // Revalidar los que llevan más de 6 meses sin comprobarse.
    const stale = entries.map((e, i) => (e?.v && Date.now() - e.t > RECHECK_AFTER_MS ? i : -1)).filter((i) => i >= 0);
    const toSearch = entries.map((e, i) => (e == null ? i : -1)).filter((i) => i >= 0);
    if (stale.length && env.YOUTUBE_API_KEY) {
        const ids = stale.map((i) => entries[i].v);
        fetches += Math.ceil(ids.length / 50);
        const alive = await stillAvailable(ids, env.YOUTUBE_API_KEY);
        if (alive) {
            for (const i of stale) {
                if (alive.has(entries[i].v)) {
                    await saveEntry(kv, keys[i], entries[i].v);
                } else {
                    videos[i] = null;
                    toSearch.push(i);
                }
            }
        }
    }
    if (!toSearch.length) return { videos, limited: false };

    const counterKey = `yt:searches:${quotaDay()}`;
    const maxSearches = intEnv(env.YOUTUBE_DAILY_SEARCHES, 90);
    let used = Number(await kv.get(counterKey)) || 0;
    const budget = Math.min(opts.budget ?? Infinity, Math.max(0, maxSearches - used));
    let searches = 0;
    let limited = false;

    for (const i of toSearch) {
        if (fetches >= MAX_FETCHES_PER_CALL) {
            limited = true;
            break;
        }
        const song = songs[i];
        let id;
        if (env.ODESLI_API_KEY && song.id && !song.version) {
            fetches++;
            id = await viaOdesli(song, env.ODESLI_API_KEY).catch(() => undefined);
        }
        if (id === undefined && env.YOUTUBE_API_KEY) {
            if (searches >= budget) {
                limited = true;
                continue;
            }
            try {
                searches++;
                fetches++;
                id = await viaYouTubeSearch(song, env.YOUTUBE_API_KEY);
            } catch (err) {
                if (err.quota) {
                    limited = true;
                    used = maxSearches;
                    break;
                }
                throw err;
            }
        }
        if (id === undefined) continue; // sin fuente disponible: no se guarda
        videos[i] = id;
        await saveEntry(kv, keys[i], id);
    }
    if (searches) await safePut(kv, counterKey, String(Math.min(maxSearches, used + searches)), { expirationTtl: DAY_TTL });
    return { videos, limited, searches };
}

/** Búsquedas de YouTube que quedan hoy. */
export async function searchesLeft(env) {
    const used = Number(await kvStore(env).get(`yt:searches:${quotaDay()}`)) || 0;
    return Math.max(0, intEnv(env.YOUTUBE_DAILY_SEARCHES, 90) - used);
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
