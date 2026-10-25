/**
 * BPM y tonalidad de cada canción.
 *
 * 1. ReccoBeats (gratis, sin llave): por ID de Spotify, hasta 40 por llamada.
 * 2. GetSongBPM (gratis con llave y link obligatorio a getsongbpm.com):
 *    respaldo por título + artista para lo que ReccoBeats no tenga.
 *
 * Cada resultado se guarda en KV para siempre (lo que no se encontró, un
 * mes), así cada canción se consulta una sola vez para todos los usuarios.
 */
import { kvStore, safePut, today, DAY_TTL, intEnv } from './common.js';

const RECCO_URL = 'https://api.reccobeats.com/v1/audio-features';
const GSB_URL = 'https://api.getsong.co';
const RECCO_BATCH = 40;
const MISS_TTL = 30 * 24 * 60 * 60;
// Workers gratis permite ~50 peticiones salientes por invocación.
const MAX_GSB_PER_CALL = 20;

// Nombres como los usan los músicos (Eb/Ab/Bb en vez de D#/G#/A#).
const PITCHES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** key (0-11, -1 = sin detectar) + mode (1 mayor, 0 menor) → "G" / "Am". */
export function keyName(key, mode) {
    if (key == null || key === '') return '';
    const k = Number(key);
    if (!Number.isInteger(k) || k < 0 || k > 11) return '';
    return PITCHES[k] + (Number(mode) === 0 ? 'm' : '');
}

/** "G#m", "Ab minor", "F♯", "Bb Major" → notación corta ("Abm", "F#", "Bb"). */
export function normalizeKey(text) {
    const s = String(text || '').trim().replace(/♯/g, '#').replace(/♭/g, 'b');
    const m = s.match(/^([A-Ga-g])([#b]?)\s*(m|min|minor|menor|maj|major|mayor)?(?![a-z])/i);
    if (!m) return '';
    const sharps = { 'C#': 'C#', 'D#': 'Eb', 'F#': 'F#', 'G#': 'Ab', 'A#': 'Bb', 'Db': 'C#', 'Eb': 'Eb', 'Gb': 'F#', 'Ab': 'Ab', 'Bb': 'Bb' };
    const base = m[1].toUpperCase() + m[2];
    const note = sharps[base] || (PITCHES.includes(base) ? base : '');
    if (!note) return '';
    const minor = m[3] ? /^m(in(or)?)?$|^menor$/i.test(m[3]) : false;
    return note + (minor ? 'm' : '');
}

export function roundBpm(value) {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) && n >= 30 && n <= 300 ? Math.round(n) : null;
}

function spotifyIdFromHref(href) {
    const m = String(href || '').match(/track\/([A-Za-z0-9]{22})/);
    return m ? m[1] : null;
}

function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function featureKey(song) {
    if (song.id && /^[A-Za-z0-9]{22}$/.test(song.id)) return `feat:sp:${song.id}`;
    return `feat:q:${norm(`${song.title} ${song.artist}`).slice(0, 200)}`;
}

/** Respuesta de ReccoBeats → Map(spotifyId → { bpm, key }). */
export function parseRecco(data) {
    const out = new Map();
    const list = Array.isArray(data?.content) ? data.content : Array.isArray(data) ? data : [];
    for (const item of list) {
        const id = spotifyIdFromHref(item?.href) || (/^[A-Za-z0-9]{22}$/.test(item?.id || '') ? item.id : null);
        if (!id) continue;
        const bpm = roundBpm(item.tempo);
        const key = keyName(item.key, item.mode);
        if (bpm || key) out.set(id, { bpm, key });
    }
    return out;
}

/** → { found: Map(id → {bpm,key}), failed: Set(id) } (failed = no se pudo consultar). */
async function fromRecco(ids) {
    const found = new Map();
    const failed = new Set();
    for (let i = 0; i < ids.length; i += RECCO_BATCH) {
        const batch = ids.slice(i, i + RECCO_BATCH);
        const res = await fetch(`${RECCO_URL}?ids=${batch.join(',')}`, { headers: { Accept: 'application/json' } }).catch(() => null);
        if (!res?.ok) {
            console.warn('[features] reccobeats', res?.status);
            batch.forEach((id) => failed.add(id));
            continue;
        }
        for (const [id, f] of parseRecco(await res.json().catch(() => null))) found.set(id, f);
    }
    return { found, failed };
}

function similar(a, b) {
    const x = norm(a);
    const y = norm(b);
    return Boolean(x && y && (x === y || x.includes(y) || y.includes(x)));
}

/** Respuesta de búsqueda de GetSongBPM → { bpm, key } de la canción que coincide, o null. */
export function parseGetSongBpm(data, song) {
    const raw = data?.search;
    const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && !raw.error ? [raw] : [];
    const artistName = (r) => (Array.isArray(r?.artist) ? r.artist[0]?.name : r?.artist?.name) || '';
    const mainArtist = String(song.artist || '').split(/,|&| feat\.? /i)[0];
    const match = list.find((r) => similar(r?.title, song.title) && (!mainArtist || similar(artistName(r), mainArtist)))
        || list.find((r) => similar(r?.title, song.title));
    if (!match) return null;
    const bpm = roundBpm(match.tempo);
    const key = normalizeKey(match.key_of);
    return bpm || key ? { bpm, key } : null;
}

async function fromGetSongBpm(song, apiKey) {
    const lookup = song.artist ? `song:${song.title} artist:${String(song.artist).split(',')[0]}` : `song:${song.title}`;
    const params = new URLSearchParams({ api_key: apiKey, type: song.artist ? 'both' : 'song', lookup, limit: '5' });
    const res = await fetch(`${GSB_URL}/search/?${params}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
        console.warn('[features] getsongbpm', res.status);
        return undefined; // no se pudo consultar: no se guarda como "no encontrada"
    }
    return parseGetSongBpm(await res.json().catch(() => null), song);
}

export function parseEntry(raw) {
    if (raw == null) return undefined;
    try {
        const e = JSON.parse(raw);
        return e && (e.b || e.k) ? { bpm: e.b || null, key: e.k || '' } : null;
    } catch {
        return undefined;
    }
}

async function save(kv, key, f, source) {
    const value = JSON.stringify(f ? { b: f.bpm || null, k: f.key || '', s: source, t: Date.now() } : { t: Date.now() });
    await safePut(kv, key, value, f ? undefined : { expirationTtl: MISS_TTL });
}

/**
 * songs: [{ id?, title, artist }] → { features: [{ bpm, key }|null], pending }
 * pending = cuántas quedaron sin consultar en esta llamada (se pueden pedir otra vez).
 */
export async function findFeatures(env, songs) {
    const kv = kvStore(env);
    const keys = songs.map(featureKey);
    const cached = await Promise.all(keys.map((k) => kv.get(k).then(parseEntry)));
    const features = cached.map((c) => c || null);
    let missing = songs.map((s, i) => (cached[i] === undefined ? i : -1)).filter((i) => i >= 0);
    if (!missing.length) return { features, pending: 0 };

    // 1) ReccoBeats por ID de Spotify, en bloques de 40.
    const withId = missing.filter((i) => /^[A-Za-z0-9]{22}$/.test(songs[i].id || ''));
    let reccoFailed = new Set();
    if (withId.length) {
        const { found, failed } = await fromRecco(withId.map((i) => songs[i].id));
        reccoFailed = failed;
        for (const i of withId) {
            const f = found.get(songs[i].id);
            if (f) {
                features[i] = f;
                await save(kv, keys[i], f, 'reccobeats');
            }
        }
        missing = missing.filter((i) => !features[i]);
    }

    // 2) GetSongBPM por título y artista (si hay llave), con tope diario.
    let pending = 0;
    if (env.GETSONGBPM_API_KEY && missing.length) {
        const counterKey = `feat:gsb:${today()}`;
        const used = Number(await kv.get(counterKey)) || 0;
        const budget = Math.min(MAX_GSB_PER_CALL, Math.max(0, intEnv(env.GETSONGBPM_DAILY, 2000) - used));
        let calls = 0;
        for (const i of missing) {
            if (calls >= budget) {
                pending++;
                continue;
            }
            calls++;
            const f = await fromGetSongBpm(songs[i], env.GETSONGBPM_API_KEY).catch(() => undefined);
            if (f === undefined) continue;
            features[i] = f;
            await save(kv, keys[i], f, 'getsongbpm');
        }
        if (calls) await safePut(kv, counterKey, String(used + calls), { expirationTtl: DAY_TTL });
    } else {
        // Sin respaldo: lo que ReccoBeats respondió que no tiene se guarda como
        // "no encontrado" (se reintenta al mes); si falló la red, no se guarda.
        for (const i of missing) {
            if (songs[i].id && !reccoFailed.has(songs[i].id)) await save(kv, keys[i], null);
        }
    }
    return { features, pending };
}
