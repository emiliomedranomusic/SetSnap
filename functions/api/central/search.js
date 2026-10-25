/**
 * GET /api/central/search?q=...
 * Búsqueda de canciones para quien no inició sesión, con la cuenta central.
 * Los resultados se guardan en la caché de Cloudflare: si otra persona ya
 * buscó lo mismo, no se vuelve a llamar a Spotify.
 */
import { centralApi, slimTrack, CentralError } from '../../../lib/server/central.js';
import { json, clientIp } from '../../../lib/server/common.js';

const CACHE_SECONDS = 7 * 24 * 60 * 60;
// Límite por IP en memoria (por isolate): frena abusos sin gastar escrituras
// de KV. Un setlist de 40 canciones usa ~60 búsquedas.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 400;
const hits = new Map();

export function overLimit(ip, now = Date.now()) {
    const entry = hits.get(ip);
    if (!entry || now - entry.start > WINDOW_MS) {
        if (hits.size > 5000) hits.clear();
        hits.set(ip, { start: now, count: 1 });
        return false;
    }
    entry.count++;
    return entry.count > MAX_PER_WINDOW;
}

function edgeCache() {
    try {
        return typeof caches !== 'undefined' && caches.default ? caches.default : null;
    } catch {
        return null;
    }
}

export async function onRequestGet({ request, env }) {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim().slice(0, 200);
    if (!q) return json(400, { success: false, message: 'Falta la búsqueda.' });
    if (overLimit(clientIp(request))) {
        return json(429, { success: false, message: 'Demasiadas búsquedas seguidas. Espera unos minutos.' }, { 'Retry-After': '60' });
    }

    const country = request.cf?.country;
    const market = /^[A-Z]{2}$/.test(country || '') && country !== 'XX' && country !== 'T1' ? country : 'US';
    const cacheKey = new Request(`https://cache.setsnap.internal/search?market=${market}&q=${encodeURIComponent(q.toLowerCase())}`);
    const cache = edgeCache();
    const cached = cache && (await cache.match(cacheKey).catch(() => null));
    if (cached) return cached;

    try {
        const params = new URLSearchParams({ q, type: 'track', limit: '10', market });
        const res = await centralApi(env, `/search?${params}`);
        if (res.status === 429) {
            return json(429, { success: false, message: 'Hay mucha gente buscando. Espera unos segundos.' }, { 'Retry-After': res.headers.get('Retry-After') || '2' });
        }
        const data = await res.json().catch(() => null);
        if (!res.ok) {
            console.error('[central] search', res.status, data?.error?.message);
            return json(502, { success: false, message: `Spotify respondió ${res.status}.` });
        }
        const response = Response.json(
            { success: true, tracks: (data?.tracks?.items || []).filter(Boolean).map(slimTrack) },
            { headers: { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` } }
        );
        if (cache) await cache.put(cacheKey, response.clone()).catch(() => {});
        return response;
    } catch (err) {
        if (err instanceof CentralError) return json(err.status, { success: false, message: err.message });
        throw err;
    }
}
