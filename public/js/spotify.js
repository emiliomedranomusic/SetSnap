/**
 * Cliente de Spotify 100% en el navegador (Authorization Code + PKCE).
 * No necesita client secret ni servidor: el token vive en localStorage.
 *
 * Endpoints según los cambios de Spotify de febrero 2026:
 * - crear playlist: POST /me/playlists
 * - agregar canciones: POST /playlists/{id}/items
 * - búsqueda: limit máximo 10
 */

const API = 'https://api.spotify.com/v1';
const ACCOUNTS = 'https://accounts.spotify.com';
const SCOPES = ['playlist-modify-public', 'playlist-modify-private', 'playlist-read-private'];
const TOKEN_KEY = 'setsnap.spotifyToken';
const PKCE_KEY = 'setsnap.pkce';
export const SEARCH_LIMIT = 10;

let clientId = null;

export function configure(id) {
    clientId = id;
}

function redirectUri() {
    return `${window.location.origin}/`;
}

function storage() {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function readToken() {
    try {
        return JSON.parse(storage()?.getItem(TOKEN_KEY) || 'null');
    } catch {
        return null;
    }
}

function saveToken(data, previous) {
    const token = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || previous?.refreshToken || null,
        expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    };
    storage()?.setItem(TOKEN_KEY, JSON.stringify(token));
    return token;
}

export function logout() {
    storage()?.removeItem(TOKEN_KEY);
}

export function isLoggedIn() {
    return Boolean(readToken()?.accessToken);
}

function base64url(bytes) {
    let str = '';
    bytes.forEach((b) => { str += String.fromCharCode(b); });
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return base64url(bytes).slice(0, length);
}

export async function login() {
    if (!clientId) throw new Error('Falta configurar SPOTIFY_CLIENT_ID.');
    // Spotify solo acepta http en 127.0.0.1, no en "localhost".
    if (window.location.hostname === 'localhost') {
        window.location.hostname = '127.0.0.1';
        return;
    }
    const verifier = randomString(64);
    const state = randomString(16);
    const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    storage()?.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope: SCOPES.join(' '),
        redirect_uri: redirectUri(),
        state,
        code_challenge_method: 'S256',
        code_challenge: challenge,
        show_dialog: 'true',
    });
    window.location.href = `${ACCOUNTS}/authorize?${params}`;
}

async function tokenRequest(body) {
    const res = await fetch(`${ACCOUNTS}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error_description || data.error || `Error de autenticación (${res.status})`);
    return data;
}

/**
 * Si la URL trae ?code= de Spotify, lo cambia por un token.
 * Devuelve true si procesó un callback (con éxito o con error).
 */
export async function handleRedirect() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');
    if (!code && !error) return false;

    const pkce = JSON.parse(storage()?.getItem(PKCE_KEY) || 'null');
    storage()?.removeItem(PKCE_KEY);
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);

    if (error) throw new Error(error === 'access_denied' ? 'Cancelaste el inicio de sesión en Spotify.' : `Spotify: ${error}`);
    if (!pkce || params.get('state') !== pkce.state) throw new Error('El inicio de sesión expiró o no es válido. Intenta de nuevo.');

    const data = await tokenRequest({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri(),
        code_verifier: pkce.verifier,
    });
    saveToken(data);
    return true;
}

let refreshing = null;

async function getAccessToken() {
    const token = readToken();
    if (!token) throw Object.assign(new Error('Conecta tu cuenta de Spotify.'), { needsLogin: true });
    if (Date.now() < token.expiresAt - 60_000) return token.accessToken;
    if (!token.refreshToken) {
        logout();
        throw Object.assign(new Error('Tu sesión de Spotify expiró. Conéctate de nuevo.'), { needsLogin: true });
    }
    refreshing ||= tokenRequest({ grant_type: 'refresh_token', refresh_token: token.refreshToken })
        .then((data) => saveToken(data, token).accessToken)
        .catch(() => {
            logout();
            throw Object.assign(new Error('Tu sesión de Spotify expiró. Conéctate de nuevo.'), { needsLogin: true });
        })
        .finally(() => { refreshing = null; });
    return refreshing;
}

export { getAccessToken };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function describeError(status, data) {
    const msg = data?.error?.message || data?.error_description || '';
    if (status === 401) return 'Tu sesión de Spotify expiró. Conéctate de nuevo.';
    if (status === 403) {
        return 'Spotify rechazó la petición (403). Si la app está en "Development Mode", tu cuenta debe estar agregada en '
            + 'User Management del Dashboard y el dueño de la app necesita Spotify Premium.' + (msg ? ` Detalle: ${msg}` : '');
    }
    if (status === 429) return 'Spotify está limitando las peticiones. Espera un momento e intenta de nuevo.';
    return `Error de Spotify (${status})${msg ? `: ${msg}` : ''}`;
}

async function api(path, { method = 'GET', body, retries = 2 } = {}) {
    const token = await getAccessToken();
    const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && retries > 0) {
        const wait = Math.min(Number(res.headers.get('Retry-After') || 1), 10) * 1000;
        await sleep(wait);
        return api(path, { method, body, retries: retries - 1 });
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        if (res.status === 401) logout();
        throw Object.assign(new Error(describeError(res.status, data)), { status: res.status, needsLogin: res.status === 401 });
    }
    return data;
}

export async function getMe() {
    return api('/me');
}

export async function searchTracks(query) {
    const params = new URLSearchParams({ q: query, type: 'track', limit: String(SEARCH_LIMIT), market: 'from_token' });
    const data = await api(`/search?${params}`);
    return data?.tracks?.items?.filter(Boolean) || [];
}

/** Playlists que el usuario puede editar (propias o colaborativas). */
export async function getEditablePlaylists(userId) {
    const out = [];
    let url = '/me/playlists?limit=50';
    for (let page = 0; url && page < 6; page++) {
        const data = await api(url);
        for (const p of data?.items || []) {
            if (p && (p.owner?.id === userId || p.collaborative)) out.push(p);
        }
        url = data?.next || null;
    }
    return out;
}

/** URIs que ya están en una playlist (para no duplicar). */
export async function getPlaylistUris(playlistId) {
    const uris = new Set();
    let url = `/playlists/${encodeURIComponent(playlistId)}/items?limit=50`;
    for (let page = 0; url && page < 40; page++) {
        const data = await api(url);
        for (const it of data?.items || []) {
            const t = it?.item || it?.track;
            if (t?.uri) uris.add(t.uri);
        }
        url = data?.next || null;
    }
    return uris;
}

export async function createPlaylist({ name, description, isPublic }) {
    return api('/me/playlists', {
        method: 'POST',
        body: { name, description, public: Boolean(isPublic) },
    });
}

export async function addItems(playlistId, uris) {
    for (let i = 0; i < uris.length; i += 100) {
        await api(`/playlists/${encodeURIComponent(playlistId)}/items`, {
            method: 'POST',
            body: { uris: uris.slice(i, i + 100) },
        });
    }
}
