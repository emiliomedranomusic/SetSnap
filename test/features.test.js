import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryKV, mockFetch, req } from './helpers.js';
import { keyName, normalizeKey, roundBpm, parseRecco, parseGetSongBpm, findFeatures, featureKey } from '../lib/server/features.js';
import { onRequestPost as features } from '../functions/api/features.js';

const SP = (n) => String(n).padStart(22, 'c');
const recco = (items) => Response.json({ content: items.map(([id, tempo, key, mode]) => ({ id: `uuid-${id}`, href: `https://open.spotify.com/track/${id}`, tempo, key, mode })) });

test('nombres de tonalidad', () => {
    assert.equal(keyName(7, 1), 'G');
    assert.equal(keyName(9, 0), 'Am');
    assert.equal(keyName(3, 1), 'Eb');
    assert.equal(keyName(-1, 1), '');
    assert.equal(keyName(null, 1), '');
    assert.equal(normalizeKey('G♯m'), 'Abm');
    assert.equal(normalizeKey('F#'), 'F#');
    assert.equal(normalizeKey('Bb Major'), 'Bb');
    assert.equal(normalizeKey('C minor'), 'Cm');
    assert.equal(normalizeKey('Db'), 'C#');
    assert.equal(normalizeKey(''), '');
    assert.equal(roundBpm('92.6'), 93);
    assert.equal(roundBpm(0), null);
    assert.equal(roundBpm('n/a'), null);
});

test('parseRecco empareja por el link de Spotify', () => {
    const m = parseRecco({ content: [{ id: 'uuid', href: `https://open.spotify.com/track/${SP(1)}`, tempo: 91.97, key: 7, mode: 1 }, { href: 'raro' }] });
    assert.deepEqual(m.get(SP(1)), { bpm: 92, key: 'G' });
    assert.equal(m.size, 1);
});

test('parseGetSongBpm elige la canción y el artista correctos', () => {
    const data = { search: [
        { title: 'Creep', tempo: '120', key_of: 'C', artist: { name: 'TLC' } },
        { title: 'Creep', tempo: '92', key_of: 'G', artist: { name: 'Radiohead' } },
    ] };
    assert.deepEqual(parseGetSongBpm(data, { title: 'Creep', artist: 'Radiohead' }), { bpm: 92, key: 'G' });
    assert.equal(parseGetSongBpm({ search: { error: 'no result' } }, { title: 'X', artist: '' }), null);
    assert.equal(parseGetSongBpm(null, { title: 'X' }), null);
});

test('ReccoBeats primero (en bloques de 40), GetSongBPM de respaldo, todo en caché', async () => {
    const env = { GETSONGBPM_API_KEY: 'g', SETSNAP_KV: memoryKV() };
    const songs = [
        ...Array.from({ length: 41 }, (_, i) => ({ id: SP(i + 1), title: `T${i}`, artist: 'A' })),
        { id: '', title: 'Bésame Mucho', artist: 'Luis Miguel' },
    ];
    const reccoCalls = [];
    const m = mockFetch([
        ['https://api.reccobeats.com/v1/audio-features', (url) => {
            const ids = new URL(url).searchParams.get('ids').split(',');
            reccoCalls.push(ids.length);
            // ReccoBeats no tiene la #2
            return recco(ids.filter((id) => id !== SP(2)).map((id) => [id, 100, 9, 0]));
        }],
        ['https://api.getsong.co/search/', (url) => {
            const lookup = new URL(url).searchParams.get('lookup');
            if (lookup.startsWith('song:Bésame')) return Response.json({ search: [{ title: 'Bésame Mucho', tempo: '78', key_of: 'Dm', artist: { name: 'Luis Miguel' } }] });
            return Response.json({ search: [{ title: 'T1', tempo: '130', key_of: 'E', artist: { name: 'A' } }] });
        }],
    ]);
    try {
        const r1 = await findFeatures(env, songs);
        assert.deepEqual(reccoCalls, [40, 1]);
        assert.deepEqual(r1.features[0], { bpm: 100, key: 'Am' });
        assert.deepEqual(r1.features[1], { bpm: 130, key: 'E' }, 'respaldo GetSongBPM');
        assert.deepEqual(r1.features[41], { bpm: 78, key: 'Dm' }, 'sin ID de Spotify: GetSongBPM');
        const before = m.calls.length;
        const r2 = await findFeatures(env, songs);
        assert.equal(m.calls.length, before, 'la segunda vez todo sale de caché');
        assert.deepEqual(r2.features, r1.features);
        assert.ok(env.SETSNAP_KV.map.has(featureKey(songs[41])));
    } finally {
        m.restore();
    }
});

test('sin llave de GetSongBPM: lo que falta queda como "no encontrado" y no se vuelve a pedir', async () => {
    const env = { SETSNAP_KV: memoryKV() };
    const m = mockFetch([['https://api.reccobeats.com/', () => recco([])]]);
    try {
        const r = await findFeatures(env, [{ id: SP(1), title: 'X', artist: 'Y' }]);
        assert.deepEqual(r.features, [null]);
        await findFeatures(env, [{ id: SP(1), title: 'X', artist: 'Y' }]);
        assert.equal(m.calls.length, 1);
    } finally {
        m.restore();
    }
});

test('si ReccoBeats falla por red, no se guarda como "no encontrado"', async () => {
    const env = { SETSNAP_KV: memoryKV() };
    const m = mockFetch([['https://api.reccobeats.com/', () => new Response('', { status: 503 })]]);
    try {
        await findFeatures(env, [{ id: SP(1), title: 'X', artist: 'Y' }]);
        assert.equal(env.SETSNAP_KV.map.size, 0);
    } finally {
        m.restore();
    }
});

test('endpoint /api/features', async () => {
    const env = { SETSNAP_KV: memoryKV() };
    const m = mockFetch([['https://api.reccobeats.com/', () => recco([[SP(1), 120.4, 0, 1]])]]);
    try {
        const res = await features({ request: req('https://x/api/features', { method: 'POST', body: { songs: [{ id: SP(1), title: 'A', artist: 'B' }, { id: 'malo', title: 'C' }] } }), env });
        const data = await res.json();
        assert.equal(res.status, 200);
        assert.deepEqual(data.features[0], { bpm: 120, key: 'C' });
        const bad = await features({ request: req('https://x/api/features', { method: 'POST', body: { songs: [] } }), env });
        assert.equal(bad.status, 400);
    } finally {
        m.restore();
    }
});
