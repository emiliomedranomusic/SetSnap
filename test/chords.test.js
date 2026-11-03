import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chordLinks, chordQuery, CHORD_SITES, defaultSites, validSites } from '../public/js/chords.js';

test('texto de búsqueda limpio', () => {
    assert.equal(chordQuery('Hotel California - 2013 Remaster', 'Eagles'), 'Hotel California Eagles');
    assert.equal(chordQuery('Despacito (feat. Daddy Yankee)', 'Luis Fonsi, Daddy Yankee'), 'Despacito Luis Fonsi');
    assert.equal(chordQuery('La Bamba', ''), 'La Bamba');
});

test('links por sitio, en el orden del catálogo y bien codificados', () => {
    const links = chordLinks('Me Voy', 'Julieta Venegas', ['ultimate', 'cifraclub']);
    assert.deepEqual(links.map((l) => l.id), ['cifraclub', 'ultimate']);
    assert.equal(links[1].url, 'https://www.ultimate-guitar.com/search.php?search_type=title&value=Me%20Voy%20Julieta%20Venegas');
    const cc = new URL(links[0].url);
    assert.equal(cc.hostname, 'duckduckgo.com');
    assert.equal(cc.searchParams.get('q'), String.raw`\site:cifraclub.com.br Me Voy Julieta Venegas`);
    assert.equal(chordLinks('', '', ['ultimate']).length, 0);
});

test('todos los sitios generan URLs https válidas con acentos', () => {
    for (const site of CHORD_SITES) {
        const url = new URL(site.url('Bésame Mucho Luis Miguel'));
        assert.equal(url.protocol, 'https:');
    }
});

test('sitios por defecto y validación', () => {
    assert.deepEqual(defaultSites('es'), ['cifraclub', 'lacuerda', 'ultimate']);
    assert.deepEqual(defaultSites('en'), ['ultimate', 'songsterr']);
    assert.deepEqual(validSites(['ultimate', 'falso', 'irealpro']), ['ultimate', 'irealpro']);
    assert.deepEqual(validSites(null), []);
});
