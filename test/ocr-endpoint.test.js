import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryKV, mockFetch } from './helpers.js';
import { onRequestPost as extract } from '../functions/api/extract-setlist.js';

const geminiOk = () => Response.json({ candidates: [{ content: { parts: [{ text: '{"items":[{"title":"Creep","artist":"Radiohead"}]}' }] } }] });

function upload(bytes, headers = {}) {
    const form = new FormData();
    form.append('image', new Blob([bytes], { type: 'image/jpeg' }), 'x.jpg');
    return new Request('https://x/api/extract-setlist', { method: 'POST', body: form, headers: { 'CF-Connecting-IP': '9.9.9.9', ...headers } });
}

test('sin cuenta: funciona con límite por IP', async () => {
    const env = { GEMINI_API_KEY: 'g', OCR_GUEST_DAILY: '2', SETSNAP_KV: memoryKV() };
    const m = mockFetch([['https://generativelanguage.googleapis.com/', geminiOk]]);
    try {
        const r1 = await extract({ request: upload(new Uint8Array([1])), env });
        const d1 = await r1.json();
        assert.equal(r1.status, 200);
        assert.equal(d1.items[0].title, 'Creep');
        assert.equal(d1.remaining, 1);
        // Misma imagen: sale de caché y no cuenta
        const again = await (await extract({ request: upload(new Uint8Array([1])), env })).json();
        assert.equal(again.cached, true);
        assert.equal((await extract({ request: upload(new Uint8Array([2])), env })).status, 200);
        assert.equal((await extract({ request: upload(new Uint8Array([3])), env })).status, 429);
    } finally {
        m.restore();
    }
});

test('OCR_GUESTS=0 exige sesión de Spotify', async () => {
    const env = { GEMINI_API_KEY: 'g', OCR_GUESTS: '0', SETSNAP_KV: memoryKV() };
    const res = await extract({ request: upload(new Uint8Array([1])), env });
    assert.equal(res.status, 401);
});

test('token de Spotify inválido cuenta como invitado, no como usuario', async () => {
    const env = { GEMINI_API_KEY: 'g', SETSNAP_KV: memoryKV() };
    const m = mockFetch([
        ['https://api.spotify.com/v1/me', () => new Response('{}', { status: 401 })],
        ['https://generativelanguage.googleapis.com/', geminiOk],
    ]);
    try {
        const res = await extract({ request: upload(new Uint8Array([4]), { Authorization: 'Bearer falso' }), env });
        assert.equal(res.status, 200);
        assert.ok([...env.SETSNAP_KV.map.keys()].some((k) => k.startsWith('ocr:ip:9.9.9.9')));
    } finally {
        m.restore();
    }
});
