/**
 * Precarga de la caché de YouTube con canciones famosas, usando la cuota
 * que sobra cada día. Cada canción se resuelve primero en Spotify (con la
 * cuenta central) para guardarla con el mismo ID que usarán los usuarios.
 */
import { SEED_SONGS } from '../../data/seed-songs.js';
import { parseLine } from '../../public/js/parser.js';
import { normalizeTokens } from '../../public/js/scoring.js';
import { searchItem } from '../../public/js/search.js';
import { centralApi } from './central.js';
import { kvStore, safePut, intEnv } from './common.js';
import { findVideos, searchesLeft } from './youtube.js';
import { tagSongs } from '../gemini.js';
import { catalogLine } from '../../public/js/catalog.js';

const CURSOR_KEY = 'seed:cursor';
const EXTRA_KEY = 'seed:extra';
const TAGS_KEY = 'catalog:extra'; // { songKey: "Título|Artista|es|pop|3|rs" }
const TAG_BATCH = 50;
const MAX_TAG_CALLS = 10; // por invocación (límite de peticiones de Workers)
const BATCH = 6; // ~4 búsquedas en Spotify + 1 en YouTube por canción, dentro del límite de peticiones

export async function seedList(env) {
    let extra = [];
    try {
        extra = JSON.parse((await kvStore(env).get(EXTRA_KEY)) || '[]');
    } catch {
        extra = [];
    }
    const seen = new Set();
    return [...SEED_SONGS, ...extra].filter((line) => {
        const k = String(line).toLowerCase().trim();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

/** Clave para comparar canciones aunque cambie el formato ("Perfect - Ed Sheeran, X" = "perfect|ed sheeran"). */
export function songKey(line) {
    const item = parseLine(line);
    if (!item) return '';
    let { title, artist } = item;
    // "Hotel California - 2013 Remaster - Eagles": primera parte = título, última = artista.
    const parts = String(line).split(' - ');
    if (parts.length >= 3) {
        title = parts[0];
        artist = parts[parts.length - 1];
    }
    const mainArtist = (artist || '').split(/,|&| feat\.? | ft\.? | y | and /i)[0];
    return `${normalizeTokens(title)}|${normalizeTokens(mainArtist)}`;
}

/**
 * Agrega canciones a la lista de precarga. Devuelve cuáles eran nuevas y
 * cuántas ya estaban (sirve para comparar una playlist con la lista).
 */
export async function addSeedSongs(env, lines) {
    const kv = kvStore(env);
    let extra = [];
    try {
        extra = JSON.parse((await kv.get(EXTRA_KEY)) || '[]');
    } catch {
        extra = [];
    }
    const known = new Set((await seedList(env)).map(songKey));
    const added = [];
    let already = 0;
    for (const raw of lines) {
        const line = String(raw).trim().slice(0, 200);
        const key = songKey(line);
        if (!key) continue;
        if (known.has(key)) {
            already++;
            continue;
        }
        known.add(key);
        added.push(line);
    }
    const next = [...extra, ...added].slice(-5000);
    if (added.length) await kv.put(EXTRA_KEY, JSON.stringify(next));
    // Etiqueta para el generador lo nuevo y lo que haya quedado pendiente.
    const tagging = await tagPending(env, next);
    return { added, already, extra: next.length, ...tagging };
}

/** "Título - Artista1, Artista2" → { title, artist } (mismo criterio que songKey). */
export function splitLine(line) {
    const parts = String(line).split(' - ');
    if (parts.length >= 3) return { title: parts[0].trim(), artist: parts[parts.length - 1].trim() };
    const item = parseLine(line);
    return { title: item?.title || String(line).trim(), artist: item?.artist || '' };
}

export async function readTags(env) {
    try {
        return JSON.parse((await kvStore(env).get(TAGS_KEY)) || '{}');
    } catch {
        return {};
    }
}

/**
 * Etiqueta con Gemini las canciones agregadas que aún no tienen etiquetas.
 * → { tagged, pendingTags, tagError? }
 */
export async function tagPending(env, extra) {
    const tags = await readTags(env);
    const pending = [];
    const seen = new Set();
    for (const line of extra) {
        const key = songKey(line);
        if (!key || tags[key] || seen.has(key)) continue;
        seen.add(key);
        pending.push({ key, ...splitLine(line) });
    }
    if (!pending.length) return { tagged: 0, pendingTags: 0 };
    if (!env.GEMINI_API_KEY) return { tagged: 0, pendingTags: pending.length, tagError: 'no-gemini' };

    let tagged = 0;
    let tagError;
    for (let i = 0, calls = 0; i < pending.length && calls < MAX_TAG_CALLS; i += TAG_BATCH, calls++) {
        const batch = pending.slice(i, i + TAG_BATCH);
        try {
            const res = await tagSongs(batch, { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || undefined });
            batch.forEach((song, j) => {
                const t = res.tags[j];
                if (!t) return;
                tags[song.key] = catalogLine(song, t);
                tagged++;
            });
        } catch (err) {
            tagError = err.message;
            break;
        }
    }
    if (tagged) await kvStore(env).put(TAGS_KEY, JSON.stringify(tags));
    return { tagged, pendingTags: pending.length - tagged, ...(tagError ? { tagError } : {}) };
}

/** Líneas etiquetadas de las canciones agregadas (para el generador). */
export async function extraCatalog(env) {
    return Object.values(await readTags(env));
}

export async function seedStatus(env) {
    const list = await seedList(env);
    const cursor = Number(await kvStore(env).get(CURSOR_KEY)) || 0;
    const tagged = Object.keys(await readTags(env)).length;
    return { cursor: Math.min(cursor, list.length), total: list.length, searchesLeft: await searchesLeft(env), tagged };
}

async function centralSearch(env, query) {
    const params = new URLSearchParams({ q: query, type: 'track', limit: '10', market: env.SEED_MARKET || 'MX' });
    const res = await centralApi(env, `/search?${params}`);
    if (!res.ok) throw Object.assign(new Error(`Spotify ${res.status}`), { status: res.status });
    const data = await res.json();
    return data?.tracks?.items?.filter(Boolean) || [];
}

/**
 * Procesa el siguiente bloque. Devuelve { processed, cached, cursor, total, done, reason }.
 * reason: 'no-budget' si ya no queda cuota hoy (sin Odesli).
 */
export async function runSeedBatch(env) {
    const kv = kvStore(env);
    const list = await seedList(env);
    let cursor = Number(await kv.get(CURSOR_KEY)) || 0;
    if (cursor >= list.length) return { processed: 0, cursor, total: list.length, done: true };

    // Se deja una reserva de búsquedas para los usuarios del día.
    const reserve = intEnv(env.YOUTUBE_SEED_RESERVE, 20);
    const budget = env.ODESLI_API_KEY ? BATCH : Math.min(BATCH, (await searchesLeft(env)) - reserve);
    if (budget <= 0) return { processed: 0, cursor, total: list.length, done: false, reason: 'no-budget' };

    const batch = list.slice(cursor, cursor + budget);
    const songs = [];
    for (const line of batch) {
        const item = parseLine(line);
        if (!item) continue;
        const res = await searchItem(item, (q) => centralSearch(env, q));
        const best = res.status === 'found' ? res.matches[0].track : null;
        if (best) songs.push({ id: best.id, title: best.name, artist: (best.artists || []).map((a) => a.name).join(' ') });
    }
    const result = songs.length ? await findVideos(env, songs, { budget }) : { videos: [], limited: false };
    if (result.limited && result.searches === 0) {
        return { processed: 0, cursor, total: list.length, done: false, reason: 'no-budget' };
    }
    cursor += batch.length;
    await safePut(kv, CURSOR_KEY, String(cursor));
    return {
        processed: batch.length,
        resolved: songs.length,
        withVideo: result.videos.filter(Boolean).length,
        cursor,
        total: list.length,
        done: cursor >= list.length,
    };
}
