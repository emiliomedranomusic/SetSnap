import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { memoryKV, mockFetch, req } from './helpers.js';
import { resetCentralMemo, TOKEN_KEY } from '../lib/server/central.js';
import { quotaDay } from '../lib/server/youtube.js';
import { SEED_SONGS } from '../data/seed-songs.js';
import { onRequestGet as status, onRequestPost as seed } from '../functions/api/admin/seed.js';

let env;
const auth = { Authorization: 'Bearer secreto' };

beforeEach(() => {
    resetCentralMemo();
    env = { ADMIN_KEY: 'secreto', SPOTIFY_CLIENT_ID: 'cid', YOUTUBE_API_KEY: 'k', SETSNAP_KV: memoryKV() };
    env.SETSNAP_KV.map.set(TOKEN_KEY, JSON.stringify({ refreshToken: 'r', accessToken: 'a', expiresAt: Date.now() + 3_600_000 }));
});

// Spotify simulado: devuelve siempre el track que coincide con la consulta.
function spotifyEcho(url) {
    const q = new URL(url).searchParams.get('q').replace(/track:|artist:|"/g, '');
    const [title, ...rest] = q.split(' ');
    const line = SEED_SONGS.find((l) => q.toLowerCase().includes(l.split(' - ')[0].toLowerCase())) || `${title} - ${rest.join(' ')}`;
    const [name, artist] = line.split(' - ');
    const id = Buffer.from(line).toString('hex').slice(0, 22).padEnd(22, '0');
    return Response.json({ tracks: { items: [{ id, uri: `spotify:track:${id}`, name, artists: [{ name: artist }], album: { name: '' } }] } });
}

test('exige la clave de administrador', async () => {
    assert.equal((await status({ request: req('https://x/api/admin/seed'), env })).status, 403);
    assert.equal((await seed({ request: req('https://x/api/admin/seed', { method: 'POST', headers: { Authorization: 'Bearer mal' } }), env })).status, 403);
});

test('procesa bloques, guarda el avance y respeta la reserva para usuarios', async () => {
    env.YOUTUBE_DAILY_SEARCHES = '30';
    env.YOUTUBE_SEED_RESERVE = '20'; // quedan 10 búsquedas para la precarga
    let n = 0;
    const m = mockFetch([
        ['https://api.spotify.com/v1/search', spotifyEcho],
        ['https://www.googleapis.com/youtube/v3/search', () => Response.json({ items: [{ id: { videoId: `vid${String(++n).padStart(8, '0')}` } }] })],
    ]);
    try {
        const r1 = await (await seed({ request: req('https://x/api/admin/seed', { method: 'POST', headers: auth, body: {} }), env })).json();
        assert.equal(r1.processed, 6);
        assert.equal(r1.withVideo, 6);
        const r2 = await (await seed({ request: req('https://x/api/admin/seed', { method: 'POST', headers: auth, body: {} }), env })).json();
        assert.equal(r2.processed, 4, 'solo lo que deja la reserva');
        const r3 = await (await seed({ request: req('https://x/api/admin/seed', { method: 'POST', headers: auth, body: {} }), env })).json();
        assert.equal(r3.processed, 0);
        assert.equal(r3.reason, 'no-budget');
        assert.equal(env.SETSNAP_KV.map.get(`yt:searches:${quotaDay()}`), '10');
        const st = await (await status({ request: req('https://x/api/admin/seed', { headers: auth }), env })).json();
        assert.equal(st.cursor, 10);
        assert.ok(st.total > 500);
        assert.equal(st.searchesLeft, 20);
    } finally {
        m.restore();
    }
});

test('se pueden agregar canciones a la lista', async () => {
    const before = await (await status({ request: req('https://x/api/admin/seed', { headers: auth }), env })).json();
    const res = await (await seed({
        request: req('https://x/api/admin/seed', {
            method: 'POST',
            headers: auth,
            // Formatos distintos de canciones que ya están en la lista
            body: { add: ['Canción Nueva - Banda X', 'Perfect - Ed Sheeran', 'BÉSAME MUCHO - Luis Miguel', 'Hotel California - 2013 Remaster - Eagles', 'Despacito - Luis Fonsi, Daddy Yankee'] },
        }),
        env,
    })).json();
    assert.deepEqual(res.added, ['Canción Nueva - Banda X']);
    assert.equal(res.already, 4);
    const after = await (await status({ request: req('https://x/api/admin/seed', { headers: auth }), env })).json();
    assert.equal(after.total, before.total + 1, 'los repetidos no se duplican');
});

import { onRequestGet as catalog } from '../functions/api/catalog.js';

test('las canciones agregadas se etiquetan con Gemini y llegan al catálogo del generador', async () => {
    env.GEMINI_API_KEY = 'g';
    const m = mockFetch([['https://generativelanguage.googleapis.com/', (url, init) => {
        const text = JSON.parse(init.body).contents[0].parts[0].text;
        assert.match(text, /1\. Canción Rara - Grupo Local/);
        return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ items: [
            { i: 1, lang: 'es', genre: 'cumbia', energy: 4, anthem: true },
            { i: 2, lang: 'en', genre: 'pop', energy: 2, romantic: true },
        ] }) }] } }] });
    }]]);
    try {
        const res = await (await seed({ request: req('https://x/api/admin/seed', { method: 'POST', headers: auth, body: { add: ['Canción Rara - Grupo Local', 'Otra Nueva - Artista Uno, Artista Dos', 'Perfect - Ed Sheeran'] } }), env })).json();
        assert.equal(res.added.length, 2);
        assert.equal(res.tagged, 2);
        assert.equal(res.pendingTags, 0);
        const data = await (await catalog({ env })).json();
        assert.deepEqual(data.songs.sort(), ['Canción Rara|Grupo Local|es|cumbia|4|s', 'Otra Nueva|Artista Uno, Artista Dos|en|pop|2|r']);
    } finally {
        m.restore();
    }
});

test('sin Gemini quedan pendientes y se etiquetan después', async () => {
    const r1 = await (await seed({ request: req('https://x/api/admin/seed', { method: 'POST', headers: auth, body: { add: ['Canción Rara - Grupo Local'] } }), env })).json();
    assert.equal(r1.pendingTags, 1);
    assert.equal(r1.tagError, 'no-gemini');
    env.GEMINI_API_KEY = 'g';
    const m = mockFetch([['https://generativelanguage.googleapis.com/', () => Response.json({ candidates: [{ content: { parts: [{ text: '{"items":[{"i":1,"lang":"es","genre":"cumbia","energy":4}]}' }] } }] })]]);
    try {
        // Volver a mandar (aunque no haya nuevas) etiqueta lo pendiente.
        const r2 = await (await seed({ request: req('https://x/api/admin/seed', { method: 'POST', headers: auth, body: { add: [] } }), env })).json();
        assert.equal(r2.tagged, 1);
        assert.equal(r2.pendingTags, 0);
    } finally {
        m.restore();
    }
});
