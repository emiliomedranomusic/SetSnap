import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryKV, mockFetch, req } from './helpers.js';
import { resetCentralMemo, TOKEN_KEY } from '../lib/server/central.js';
import { onRequestGet as health, runChecks } from '../functions/api/admin/health.js';

test('diagnóstico: exige clave y muestra cada integración', async () => {
    resetCentralMemo();
    const env = { ADMIN_KEY: 'k', SPOTIFY_CLIENT_ID: 'cid', GEMINI_API_KEY: 'g', YOUTUBE_API_KEY: 'y', SETSNAP_KV: memoryKV() };
    env.SETSNAP_KV.map.set(TOKEN_KEY, JSON.stringify({ refreshToken: 'r', accessToken: 'a', expiresAt: Date.now() + 3_600_000, displayName: 'SetSnap' }));
    const m = mockFetch([
        ['https://api.spotify.com/v1/search', () => Response.json({ tracks: { items: [] } })],
        ['https://generativelanguage.googleapis.com/', () => Response.json({ models: [{ name: 'models/gemini-3.1-flash-lite' }] })],
        ['https://www.googleapis.com/youtube/v3/videos', () => Response.json({ items: [{ id: 'dQw4w9WgXcQ' }] })],
        ['https://api.reccobeats.com/', () => Response.json({ content: [{ href: 'https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp', tempo: 148, key: 1, mode: 1 }] })],
    ]);
    try {
        assert.equal((await health({ request: req('https://x/api/admin/health'), env })).status, 403);
        const checks = await runChecks(env);
        const byName = Object.fromEntries(checks.map((c) => [c.name, c]));
        assert.equal(byName['Almacenamiento (KV: SETSNAP_KV)'].status, 'ok');
        assert.equal(byName['Spotify: cuenta central (modo sin cuenta)'].status, 'ok');
        assert.match(byName['Gemini (fotos y etiquetas)'].detail, /gemini-3\.1-flash-lite/);
        assert.equal(byName['YouTube (lista sin login)'].status, 'ok');
        assert.match(byName['BPM y tonalidad: ReccoBeats'].detail, /C# · 148 BPM/);
        assert.equal(byName['BPM y tonalidad: GetSongBPM (respaldo)'].status, 'warn');
        const page = await health({ request: req('https://x/api/admin/health?key=k'), env });
        assert.match(await page.text(), /Diagnóstico de SetSnap/);
    } finally {
        m.restore();
    }
});

test('diagnóstico: sin KV ni llaves lo dice claro', async () => {
    resetCentralMemo();
    const checks = await runChecks({});
    const kv = checks.find((c) => c.name.startsWith('Almacenamiento'));
    assert.equal(kv.status, 'error');
    assert.equal(checks.find((c) => c.name === 'Spotify: Client ID').status, 'error');
});
