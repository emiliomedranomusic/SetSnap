import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { memoryKV, mockFetch, req } from './helpers.js';
import { resetCentralMemo, TOKEN_KEY } from '../lib/server/central.js';
import { onRequestGet as connect } from '../functions/api/central/connect.js';
import { onRequestGet as callback } from '../functions/api/central/callback.js';
import { onRequestGet as search, overLimit } from '../functions/api/central/search.js';
import { onRequestPost as playlist } from '../functions/api/central/playlist.js';
import { onRequestGet as config } from '../functions/api/config.js';

const BASE = 'https://setsnap.test';
const URI = (n) => `spotify:track:${String(n).padStart(22, 'a')}`;
let env;

beforeEach(() => {
    resetCentralMemo();
    env = { SPOTIFY_CLIENT_ID: 'cid', ADMIN_KEY: 'secreto', SETSNAP_KV: memoryKV() };
});

function connectedToken(extra = {}) {
    env.SETSNAP_KV.map.set(TOKEN_KEY, JSON.stringify({ refreshToken: 'r1', accessToken: 'a1', expiresAt: Date.now() + 3_600_000, ...extra }));
}

test('connect exige la clave de administrador', async () => {
    assert.equal((await connect({ request: req(`${BASE}/api/central/connect`), env })).status, 403);
    assert.equal((await connect({ request: req(`${BASE}/api/central/connect?key=mal`), env })).status, 403);
    const res = await connect({ request: req(`${BASE}/api/central/connect?key=secreto`), env });
    assert.equal(res.status, 302);
    const loc = new URL(res.headers.get('Location'));
    assert.equal(loc.origin, 'https://accounts.spotify.com');
    assert.equal(loc.searchParams.get('redirect_uri'), `${BASE}/api/central/callback`);
    assert.equal(loc.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(env.SETSNAP_KV.map.has(`central:pkce:${loc.searchParams.get('state')}`));
});

test('callback guarda el token y config activa el modo sin cuenta', async () => {
    const res = await connect({ request: req(`${BASE}/api/central/connect?key=secreto`), env });
    const state = new URL(res.headers.get('Location')).searchParams.get('state');
    const m = mockFetch([
        ['https://accounts.spotify.com/api/token', (url, init) => {
            assert.match(init.body.toString(), /code_verifier=/);
            return Response.json({ access_token: 'a1', refresh_token: 'r1', expires_in: 3600 });
        }],
        ['https://api.spotify.com/v1/me', () => Response.json({ id: 'setsnap', display_name: 'SetSnap' })],
    ]);
    try {
        const page = await callback({ request: req(`${BASE}/api/central/callback?code=c&state=${state}`), env });
        assert.equal(page.status, 200);
        assert.match(await page.text(), /SetSnap/);
        const saved = JSON.parse(env.SETSNAP_KV.map.get(TOKEN_KEY));
        assert.equal(saved.refreshToken, 'r1');
        assert.equal(saved.userId, 'setsnap');
        assert.equal((await (await config({ env })).json()).centralEnabled, true);
    } finally {
        m.restore();
    }
});

test('callback rechaza un state desconocido', async () => {
    const page = await callback({ request: req(`${BASE}/api/central/callback?code=c&state=otro`), env });
    assert.equal(page.status, 400);
});

test('config: sin cuenta central conectada no se activa', async () => {
    const data = await (await config({ env })).json();
    assert.equal(data.centralEnabled, false);
    assert.equal(data.youtubeEnabled, false);
});

test('search usa el token central, el país del visitante y renueva si expiró', async () => {
    connectedToken({ accessToken: 'viejo', expiresAt: Date.now() - 1000 });
    const m = mockFetch([
        ['https://accounts.spotify.com/api/token', () => Response.json({ access_token: 'nuevo', refresh_token: 'r2', expires_in: 3600 })],
        ['https://api.spotify.com/v1/search', (url, init) => {
            assert.equal(init.headers.Authorization, 'Bearer nuevo');
            assert.equal(new URL(url).searchParams.get('market'), 'MX');
            assert.equal(new URL(url).searchParams.get('limit'), '10');
            return Response.json({ tracks: { items: [{ id: 'x', uri: URI(1), name: 'Creep', artists: [{ name: 'Radiohead', id: 'z' }], album: { name: 'Pablo Honey', images: [{ url: 'big', width: 640 }, { url: 'mid', width: 300 }] } }] } });
        }],
    ]);
    try {
        const request = req(`${BASE}/api/central/search?q=creep`);
        Object.defineProperty(request, 'cf', { value: { country: 'MX' } });
        const res = await search({ request, env });
        const data = await res.json();
        assert.equal(res.status, 200);
        assert.equal(data.tracks[0].name, 'Creep');
        assert.deepEqual(data.tracks[0].album.images, [{ url: 'mid', width: 300 }]);
        assert.equal(JSON.parse(env.SETSNAP_KV.map.get(TOKEN_KEY)).refreshToken, 'r2', 'guarda el refresh token rotado');
    } finally {
        m.restore();
    }
});

test('search sin cuenta central conectada', async () => {
    const res = await search({ request: req(`${BASE}/api/central/search?q=creep`), env });
    assert.equal(res.status, 503);
});

test('search: si Spotify limita (429) se lo pasa al navegador con Retry-After', async () => {
    connectedToken();
    const m = mockFetch([['https://api.spotify.com/v1/search', () => new Response('{}', { status: 429, headers: { 'Retry-After': '3' } })]]);
    try {
        const res = await search({ request: req(`${BASE}/api/central/search?q=creep`), env });
        assert.equal(res.status, 429);
        assert.equal(res.headers.get('Retry-After'), '3');
    } finally {
        m.restore();
    }
});

test('playlist: crea pública, agrega canciones y devuelve editToken', async () => {
    connectedToken();
    const m = mockFetch([
        ['https://api.spotify.com/v1/me/playlists', (url, init) => {
            const b = JSON.parse(init.body);
            assert.equal(b.public, true);
            assert.equal(b.name, 'Boda Ana');
            assert.equal(b.description, 'Hola · Creada con SetSnap');
            return Response.json({ id: 'pl1', name: 'Boda Ana', external_urls: { spotify: 'https://open.spotify.com/playlist/pl1' } }, { status: 201 });
        }],
        [/\/v1\/playlists\/pl1\/items$/, () => Response.json({ snapshot_id: 's' }, { status: 201 })],
    ]);
    try {
        const uris = Array.from({ length: 120 }, (_, i) => URI(i));
        const res = await playlist({ request: req(`${BASE}/api/central/playlist`, { method: 'POST', body: { name: 'Boda <b>Ana</b>'.replace(/<\/?b>/g, ''), description: 'Hola', uris } }), env });
        const data = await res.json();
        assert.equal(res.status, 200, JSON.stringify(data));
        assert.equal(data.url, 'https://open.spotify.com/playlist/pl1');
        assert.ok(data.editToken);
        const adds = m.calls.filter((c) => c.url.endsWith('/items'));
        assert.equal(adds.length, 2, 'en bloques de 100');
        assert.equal(JSON.parse(adds[0].init.body).uris.length, 100);

        // Agregar más con el editToken
        const more = await playlist({ request: req(`${BASE}/api/central/playlist`, { method: 'POST', body: { playlistId: 'pl1', editToken: data.editToken, uris: [URI(999)] } }), env });
        assert.equal(more.status, 200);
        // Sin token válido no se puede
        const denied = await playlist({ request: req(`${BASE}/api/central/playlist`, { method: 'POST', body: { playlistId: 'pl1', editToken: 'otro', uris: [URI(5)] } }), env });
        assert.equal(denied.status, 403);
    } finally {
        m.restore();
    }
});

test('playlist: valida URIs', async () => {
    connectedToken();
    for (const uris of [[], ['spotify:track:corto'], ['https://evil'], Array.from({ length: 251 }, (_, i) => URI(i))]) {
        const res = await playlist({ request: req(`${BASE}/api/central/playlist`, { method: 'POST', body: { uris } }), env });
        assert.equal(res.status, 400);
    }
});

test('playlist: límite diario por IP', async () => {
    connectedToken();
    env.CENTRAL_PLAYLISTS_PER_IP = '2';
    let n = 0;
    const m = mockFetch([
        ['https://api.spotify.com/v1/me/playlists', () => Response.json({ id: `pl${++n}`, name: 'x', external_urls: {} }, { status: 201 })],
        [/\/items$/, () => Response.json({}, { status: 201 })],
    ]);
    try {
        const make = () => playlist({ request: req(`${BASE}/api/central/playlist`, { method: 'POST', body: { uris: [URI(1)] } }), env });
        assert.equal((await make()).status, 200);
        assert.equal((await make()).status, 200);
        const third = await make();
        assert.equal(third.status, 429);
        assert.match((await third.json()).message, /límite/);
    } finally {
        m.restore();
    }
});

test('si el refresh token dejó de servir, mensaje claro', async () => {
    connectedToken({ accessToken: null, expiresAt: 0 });
    const m = mockFetch([['https://accounts.spotify.com/api/token', () => Response.json({ error: 'invalid_grant' }, { status: 400 })]]);
    try {
        const res = await search({ request: req(`${BASE}/api/central/search?q=x`), env });
        assert.equal(res.status, 503);
        assert.match((await res.json()).message, /reconectarse/);
    } finally {
        m.restore();
    }
});

test('search: límite por IP en memoria', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 400; i++) assert.equal(overLimit('5.5.5.5', t0), false);
    assert.equal(overLimit('5.5.5.5', t0), true);
    assert.equal(overLimit('6.6.6.6', t0), false, 'otra IP no se afecta');
    assert.equal(overLimit('5.5.5.5', t0 + 11 * 60 * 1000), false, 'se reinicia tras la ventana');
});

test('mensajes en inglés si la app lo pide', async () => {
    const res = await search({ request: req(`${BASE}/api/central/search?q=x`, { headers: { 'Accept-Language': 'en' } }), env });
    assert.match((await res.json()).message, /not set up/);
});
