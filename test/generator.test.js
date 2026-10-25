import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, GENRES } from '../public/js/catalog.js';
import { generateSetlist, sectionSizes, EVENTS, DEFAULT_GENRES, setlistText } from '../public/js/generator.js';
import { parseSetlist } from '../public/js/parser.js';

test('el catálogo está bien etiquetado', () => {
    assert.ok(CATALOG.length > 550, `${CATALOG.length} canciones`);
    const seen = new Set();
    for (const s of CATALOG) {
        assert.ok(s.title && s.artist, JSON.stringify(s));
        assert.ok(['es', 'en'].includes(s.lang), `${s.title}: idioma ${s.lang}`);
        assert.ok(GENRES.includes(s.genre), `${s.title}: género ${s.genre}`);
        assert.ok(s.energy >= 1 && s.energy <= 5, `${s.title}: energía ${s.energy}`);
        const id = `${s.title}|${s.artist}`.toLowerCase();
        assert.ok(!seen.has(id), `repetida: ${id}`);
        seen.add(id);
    }
});

test('reparte el tamaño entre los momentos', () => {
    assert.deepEqual(sectionSizes(EVENTS.wedding, 30), [4, 10, 13, 3]);
    assert.equal(sectionSizes(EVENTS.wedding, 10).reduce((a, b) => a + b), 10);
    assert.deepEqual(sectionSizes(EVENTS.restaurant, 15), [15]);
});

test('boda: momentos en orden, ceremonia romántica y tranquila, baile que sube', () => {
    const r = generateSetlist({ event: 'wedding', langs: ['es', 'en'], size: 45, seed: 7 });
    assert.deepEqual(r.sections.map((s) => s.id), ['ceremony', 'dinner', 'dance', 'closing']);
    assert.equal(r.total, 45);
    assert.ok(r.sections[0].songs.every((s) => s.romantic && s.energy <= 2));
    const dance = r.sections[2].songs.map((s) => s.energy);
    assert.deepEqual(dance, [...dance].sort((a, b) => a - b), 'el baile va de menos a más');
    assert.ok(r.sections[3].songs.every((s) => s.anthem));
    const all = r.sections.flatMap((s) => s.songs);
    assert.equal(new Set(all.map((s) => s.title + s.artist)).size, all.length, 'sin repetidas');
    assert.ok(!all.some((s) => s.seasonal), 'sin canciones de Navidad');
    assert.ok(!all.some((s) => s.genre === 'urbano'), 'boda sin reggaetón por defecto');
});

test('respeta idioma y géneros', () => {
    const r = generateSetlist({ event: 'party', langs: ['es'], genres: ['salsa', 'cumbia'], size: 30, seed: 3 });
    const all = r.sections.flatMap((s) => s.songs);
    assert.ok(all.every((s) => s.lang === 'es' && ['salsa', 'cumbia'].includes(s.genre)));
    assert.ok(all.length >= 25);
});

test('con dos idiomas queda balanceado', () => {
    const all = generateSetlist({ event: 'wedding', langs: ['es', 'en'], size: 30, seed: 11 }).sections.flatMap((s) => s.songs);
    const es = all.filter((s) => s.lang === 'es').length;
    assert.ok(Math.abs(es - (all.length - es)) <= 4, `es=${es} de ${all.length}`);
});

test('el mismo artista no va seguido ni se repite de más', () => {
    const all = generateSetlist({ event: 'party', langs: ['es', 'en'], size: 60, seed: 5 }).sections.flatMap((s) => s.songs);
    const counts = {};
    all.forEach((s, i) => {
        counts[s.artist] = (counts[s.artist] || 0) + 1;
        if (i) assert.notEqual(s.artist, all[i - 1].artist, `seguidas: ${s.artist}`);
    });
    assert.ok(Math.max(...Object.values(counts)) <= 4);
});

test('misma semilla, mismo setlist; otra semilla, otro', () => {
    const a = generateSetlist({ event: 'wedding', size: 30, seed: 42 });
    const b = generateSetlist({ event: 'wedding', size: 30, seed: 42 });
    const c = generateSetlist({ event: 'wedding', size: 30, seed: 43 });
    assert.deepEqual(a, b);
    assert.notDeepEqual(a.sections.flatMap((s) => s.songs), c.sections.flatMap((s) => s.songs));
});

test('si no alcanzan las canciones, avisa cuántas faltaron', () => {
    const r = generateSetlist({ event: 'wedding', langs: ['en'], genres: ['country'], size: 30, seed: 1 });
    assert.ok(r.short > 0);
    assert.equal(r.total + r.short, 30);
});

test('restaurante: tranquilo', () => {
    const all = generateSetlist({ event: 'restaurant', size: 30, seed: 2 }).sections.flatMap((s) => s.songs);
    assert.ok(all.every((s) => s.energy <= 3));
    assert.ok(DEFAULT_GENRES.restaurant.every((g) => g !== 'urbano'));
});

test('el texto generado se busca bien: los encabezados se ignoran', () => {
    const r = generateSetlist({ event: 'wedding', size: 15, seed: 9 });
    const text = setlistText(r, (id) => ({ ceremony: 'Ceremonia', dinner: 'Cóctel y cena', dance: 'Baile', closing: 'Cierre' }[id]));
    assert.match(text, /^Ceremonia:\n/);
    const items = parseSetlist(text);
    assert.equal(items.length, 15);
    assert.ok(items.every((i) => i.artist));
});

test('las canciones agregadas (etiquetadas) entran al generador', async () => {
    const { parseCatalogLine } = await import('../public/js/catalog.js');
    const mine = ['Mi Canción|Mi Banda|es|cumbia|5|s', 'Otra Mía|Mi Banda 2|es|cumbia|5|'].map(parseCatalogLine);
    const r = generateSetlist({ event: 'party', langs: ['es'], genres: ['cumbia'], size: 30, seed: 1, catalog: [...CATALOG, ...mine] });
    const titles = r.sections.flatMap((s) => s.songs.map((x) => x.title));
    assert.ok(titles.includes('Mi Canción') && titles.includes('Otra Mía'));
});
