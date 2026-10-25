/**
 * Modo sin cuenta: búsqueda y playlists con la cuenta central de SetSnap
 * (a través de /api/central/*), sin que la persona inicie sesión.
 */

import { t, langHeaders } from './i18n.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(url, init = {}, retries = 2) {
    const res = await fetch(url, { ...init, headers: { ...langHeaders(), ...(init.headers || {}) } });
    if (res.status === 429 && retries > 0) {
        const wait = Math.min(Number(res.headers.get('Retry-After') || 2), 10) * 1000;
        await sleep(wait);
        return call(url, init, retries - 1);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
        throw Object.assign(new Error(data.message || t('server.error', { status: res.status })), { status: res.status });
    }
    return data;
}

export async function searchTracks(query) {
    const data = await call(`/api/central/search?q=${encodeURIComponent(query)}`);
    return data.tracks || [];
}

export async function createPlaylist({ name, description, uris }) {
    return call('/api/central/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, uris }),
    });
}

export async function addItems(playlistId, editToken, uris) {
    return call('/api/central/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistId, editToken, uris }),
    });
}

/** Lista de YouTube sin login: devuelve { urls, found, total, limited }. */
export async function youtubeLists(songs, version) {
    const data = await call('/api/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version, songs: songs.map((s) => ({ id: s.id || '', title: s.title, artist: s.artist || '' })) }),
    });
    return {
        urls: data.urls || [],
        found: (data.videos || []).filter(Boolean).length,
        total: songs.length,
        limited: Boolean(data.limited),
    };
}
