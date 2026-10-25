/**
 * Cuenta central de SetSnap ("modo sin cuenta").
 *
 * El dueño conecta UNA cuenta de Spotify (p. ej. una cuenta "SetSnap"
 * creada solo para esto) con /api/central/connect. Su refresh token se
 * guarda en KV y las playlists de quien no inicia sesión se crean ahí;
 * la persona recibe el link y puede copiarla a su propio Spotify.
 */
import { kvStore, safePut } from './common.js';

export const ACCOUNTS = 'https://accounts.spotify.com';
export const API = 'https://api.spotify.com/v1';
export const TOKEN_KEY = 'central:token';
export const SCOPES = ['playlist-modify-public', 'playlist-modify-private'];

let memo = null; // { accessToken, expiresAt } por isolate, para no leer KV en cada búsqueda

export function resetCentralMemo() {
    memo = null;
}

export async function readCentralToken(env) {
    const raw = await kvStore(env).get(TOKEN_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export async function saveCentralToken(env, data, previous = null) {
    const token = {
        refreshToken: data.refresh_token || previous?.refreshToken,
        accessToken: data.access_token,
        expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
        userId: previous?.userId || null,
        displayName: previous?.displayName || null,
        connectedAt: previous?.connectedAt || new Date().toISOString(),
    };
    await kvStore(env).put(TOKEN_KEY, JSON.stringify(token));
    memo = { accessToken: token.accessToken, expiresAt: token.expiresAt };
    return token;
}

export async function isCentralConnected(env) {
    if (!env.SPOTIFY_CLIENT_ID) return false;
    if (memo && Date.now() < memo.expiresAt) return true;
    return Boolean((await readCentralToken(env))?.refreshToken);
}

export class CentralError extends Error {
    constructor(message, en, status = 503) {
        super(message);
        this.en = en;
        this.status = status;
    }
}

/** Access token vigente de la cuenta central (lo renueva si hace falta). */
export async function getCentralAccessToken(env) {
    if (memo && Date.now() < memo.expiresAt - 60_000) return memo.accessToken;
    const token = await readCentralToken(env);
    if (!token?.refreshToken) throw new CentralError('El modo sin cuenta no está configurado todavía.', 'No-account mode is not set up yet.');
    if (token.accessToken && Date.now() < token.expiresAt - 60_000) {
        memo = { accessToken: token.accessToken, expiresAt: token.expiresAt };
        return token.accessToken;
    }
    const res = await fetch(`${ACCOUNTS}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: token.refreshToken,
            client_id: env.SPOTIFY_CLIENT_ID,
        }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        console.error('[central] no se pudo renovar el token', res.status, data.error, data.error_description);
        throw new CentralError('La cuenta central de SetSnap necesita reconectarse. Avísale al administrador.', 'The SetSnap central account needs to be reconnected. Please tell the admin.');
    }
    return (await saveCentralToken(env, data, token)).accessToken;
}

/**
 * Llamada a la API de Spotify con la cuenta central. Si el token caducó
 * entre medias (401) lo renueva una vez.
 */
export async function centralApi(env, path, { method = 'GET', body } = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
        const accessToken = await getCentralAccessToken(env);
        const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        if (res.status === 401 && attempt === 0) {
            memo = null;
            const token = await readCentralToken(env);
            if (token) await safePut(kvStore(env), TOKEN_KEY, JSON.stringify({ ...token, accessToken: null, expiresAt: 0 }));
            continue;
        }
        return res;
    }
    throw new CentralError('La cuenta central de SetSnap necesita reconectarse.', 'The SetSnap central account needs to be reconnected.');
}

/** Track de Spotify reducido a lo que usa el frontend. */
export function slimTrack(t) {
    return {
        id: t.id,
        uri: t.uri,
        name: t.name,
        duration_ms: t.duration_ms,
        external_urls: t.external_urls,
        artists: (t.artists || []).map((a) => ({ name: a.name })),
        album: {
            name: t.album?.name,
            images: (t.album?.images || []).filter((i) => (i.width || 0) <= 300).slice(0, 1),
        },
    };
}
