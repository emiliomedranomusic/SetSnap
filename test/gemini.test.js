import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeminiRequest, parseGeminiResponse, bytesToBase64, extractSetlistFromImage } from '../lib/gemini.js';

const reply = (obj) => ({ candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] } }] });

test('"thinking" al mínimo según la familia del modelo y JSON forzado', () => {
    const req = buildGeminiRequest('AAAA', 'image/jpeg', 'gemini-2.5-flash-lite');
    assert.deepEqual(req.generationConfig.thinkingConfig, { thinkingBudget: 0 });
    assert.equal(req.generationConfig.responseMimeType, 'application/json');
    assert.equal(req.contents[0].parts[1].inline_data.mime_type, 'image/jpeg');
    assert.deepEqual(buildGeminiRequest('AAAA', 'image/png', 'gemini-3.1-flash-lite').generationConfig.thinkingConfig, { thinkingLevel: 'minimal' });
    assert.equal(buildGeminiRequest('AAAA', 'image/png', 'gemini-3.1-flash-lite', { thinking: false }).generationConfig.thinkingConfig, undefined);
});

test('parsea la respuesta y limpia nulls', () => {
    const items = parseGeminiResponse(reply({ items: [
        { title: 'Creep', artist: 'Radiohead', note: null },
        { title: 'La Bamba', artist: 'null', note: 'G' },
        { title: '', artist: 'x' },
    ] }));
    assert.deepEqual(items, [
        { title: 'Creep', artist: 'Radiohead', note: '' },
        { title: 'La Bamba', artist: '', note: 'G' },
    ]);
});

test('tolera bloques ```json', () => {
    const items = parseGeminiResponse(reply('```json\n{"items":[{"title":"Oye"}]}\n```'));
    assert.equal(items[0].title, 'Oye');
});

test('errores claros', () => {
    assert.throws(() => parseGeminiResponse({ candidates: [{ finishReason: 'SAFETY' }] }), /SAFETY/);
    assert.throws(() => parseGeminiResponse(reply('no es json')), /JSON/);
});

test('base64 de imágenes grandes', () => {
    const bytes = new Uint8Array(200_000).map((_, i) => i % 256);
    assert.equal(bytesToBase64(bytes), Buffer.from(bytes).toString('base64'));
});

test('si un modelo agotó su cuota, pasa al siguiente', async () => {
    const tried = [];
    const fetchFn = async (url) => {
        tried.push(decodeURIComponent(url.split('/models/')[1].split(':')[0]));
        if (tried[tried.length - 1] === 'gemini-3.5-flash-lite') return Response.json({ error: { message: 'quota' } }, { status: 429 });
        return Response.json(reply({ items: [{ title: 'Oye' }] }));
    };
    const res = await extractSetlistFromImage(new Uint8Array([1]), 'image/jpeg', { apiKey: 'k', fetchFn });
    assert.deepEqual(tried, ['gemini-3.5-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']);
    assert.equal(res.model, 'gemini-3.1-flash-lite');
});

test('mensaje de saturación si todos los modelos están ocupados', async () => {
    const fetchFn = async () => Response.json({ error: { message: 'quota' } }, { status: 429 });
    await assert.rejects(extractSetlistFromImage(new Uint8Array([1]), 'image/jpeg', { apiKey: 'k', fetchFn }), /saturado/);
});

test('reintenta ante 429 y luego responde', async () => {
    let n = 0;
    const fetchFn = async () => {
        n++;
        if (n === 1) return new Response('{}', { status: 429 });
        return Response.json(reply({ items: [{ title: 'Creep', artist: 'Radiohead' }] }));
    };
    const res = await extractSetlistFromImage(new Uint8Array([1, 2, 3]), 'image/jpeg', { apiKey: 'k', fetchFn });
    assert.equal(n, 2);
    assert.equal(res.items[0].title, 'Creep');
});

test('si el modelo no existe, prueba el siguiente', async () => {
    const tried = [];
    const fetchFn = async (url) => {
        tried.push(decodeURIComponent(url.split('/models/')[1].split(':')[0]));
        if (tried.length < 3) return Response.json({ error: { message: 'not found' } }, { status: 404 });
        return Response.json(reply({ items: [{ title: 'Oye' }] }));
    };
    const res = await extractSetlistFromImage(new Uint8Array([1]), 'image/jpeg', { apiKey: 'k', fetchFn });
    assert.deepEqual(tried, ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.1-flash-lite-preview']);
    assert.equal(res.model, 'gemini-3.1-flash-lite-preview');
});

test('GEMINI_MODEL va primero y error claro si ninguno existe', async () => {
    const tried = [];
    const fetchFn = async (url) => {
        tried.push(url);
        return Response.json({ error: { message: 'not found' } }, { status: 404 });
    };
    await assert.rejects(extractSetlistFromImage(new Uint8Array([1]), 'image/jpeg', { apiKey: 'k', model: 'mi-modelo', fetchFn }), /GEMINI_MODEL/);
    assert.match(tried[0], /mi-modelo/);
    assert.equal(tried.length, 5);
});

test('si el modelo rechaza la config de thinking, reintenta sin ella', async () => {
    const bodies = [];
    const fetchFn = async (url, init) => {
        bodies.push(JSON.parse(init.body));
        if (bodies.length === 1) return Response.json({ error: { message: 'thinking_level is not supported' } }, { status: 400 });
        return Response.json(reply({ items: [{ title: 'Oye' }] }));
    };
    await extractSetlistFromImage(new Uint8Array([1]), 'image/jpeg', { apiKey: 'k', fetchFn });
    assert.ok(bodies[0].generationConfig.thinkingConfig);
    assert.equal(bodies[1].generationConfig.thinkingConfig, undefined);
});
