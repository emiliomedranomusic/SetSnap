import { rankTracks, getStatus, AUTO_ACCEPT_THRESHOLD } from './scoring.js';

const MAX_MATCHES = 8;
const CONCURRENCY = 3;

function quote(s) {
    return `"${String(s).replace(/"/g, '')}"`;
}

/**
 * Consultas a probar en orden. La primera (texto libre) suele bastar y cubre
 * ambas orientaciones; las demás solo se usan si no hubo buena coincidencia.
 */
export function buildQueries(item) {
    const t = item.title.trim();
    const a = (item.artist || '').trim();
    if (!a) return [t, `track:${quote(t)}`];
    // "Creep by Radiohead" o "Stand by Me": la línea completa sirve para ambos casos.
    if (item.whole) return [item.whole, `track:${quote(t)} artist:${quote(a)}`, `track:${quote(item.whole)}`];
    const queries = [`${t} ${a}`, `track:${quote(t)} artist:${quote(a)}`];
    if (!item.ordered) queries.push(`track:${quote(a)} artist:${quote(t)}`);
    queries.push(t);
    return queries;
}

/**
 * Busca una línea en Spotify y devuelve candidatos ordenados por score.
 * `searchFn(query)` devuelve un array de tracks de Spotify.
 */
export async function searchItem(item, searchFn) {
    const seen = new Map();
    let ranked = [];
    for (const q of buildQueries(item)) {
        const tracks = await searchFn(q);
        for (const tr of tracks) {
            if (tr?.uri && !seen.has(tr.uri)) seen.set(tr.uri, tr);
        }
        ranked = rankTracks(item, [...seen.values()]);
        if (ranked[0] && ranked[0].score >= AUTO_ACCEPT_THRESHOLD) break;
    }
    const matches = ranked.slice(0, MAX_MATCHES);
    const bestScore = matches[0] ? matches[0].score : null;
    return { matches, bestScore, status: getStatus(bestScore) };
}

/**
 * Busca todas las líneas con concurrencia limitada.
 * onProgress(doneCount, total) se llama tras cada línea.
 */
export async function searchAll(items, searchFn, onProgress) {
    const results = new Array(items.length);
    let next = 0;
    let done = 0;
    async function worker() {
        while (next < items.length) {
            const i = next++;
            try {
                results[i] = { ...items[i], ...(await searchItem(items[i], searchFn)) };
            } catch (err) {
                if (err.needsLogin || err.status === 403) throw err;
                results[i] = { ...items[i], matches: [], bestScore: null, status: 'not_found', error: err.message };
            }
            onProgress?.(++done, items.length);
        }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
    return results;
}
