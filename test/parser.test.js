import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSetlist, parseLine } from '../public/js/parser.js';

const pick = (line) => {
    const r = parseLine(line);
    return r && [r.title, r.artist, r.note];
};

test('entradas vacías', () => {
    assert.deepEqual(parseSetlist(''), []);
    assert.deepEqual(parseSetlist(null), []);
    assert.deepEqual(parseSetlist('   \n\n  '), []);
});

test('separadores básicos', () => {
    assert.deepEqual(pick('Hello - World'), ['Hello', 'World', '']);
    assert.deepEqual(pick('Song – Artist'), ['Song', 'Artist', '']);
    assert.deepEqual(pick('Song — Artist'), ['Song', 'Artist', '']);
    assert.deepEqual(pick('Hotel California / Eagles'), ['Hotel California', 'Eagles', '']);
    assert.deepEqual(pick('Song | Artist'), ['Song', 'Artist', '']);
    assert.deepEqual(pick('Song\tArtist'), ['Song', 'Artist', '']);
});

test('"by" y "por" fijan la orientación', () => {
    const r = parseLine('Creep by Radiohead');
    assert.equal(r.title, 'Creep');
    assert.equal(r.artist, 'Radiohead');
    assert.equal(r.ordered, true);
    assert.deepEqual(pick('Bésame mucho por Luis Miguel'), ['Bésame mucho', 'Luis Miguel', '']);
});

test('no rompe títulos en español con " de " o " x "', () => {
    assert.deepEqual(pick('Amor de mis amores'), ['Amor de mis amores', '', '']);
    assert.deepEqual(pick('Corazón de melón - Cuco Sánchez'), ['Corazón de melón', 'Cuco Sánchez', '']);
    assert.deepEqual(pick('Mix x Mix'), ['Mix x Mix', '', '']);
});

test('quita numeración sin romper títulos con números', () => {
    assert.deepEqual(pick('1. Creep - Radiohead'), ['Creep', 'Radiohead', '']);
    assert.deepEqual(pick('2) Ámame - Alexander Pires'), ['Ámame', 'Alexander Pires', '']);
    assert.deepEqual(pick('3.- Me voy'), ['Me voy', '', '']);
    assert.deepEqual(pick('#4 Despacito'), ['Despacito', '', '']);
    assert.deepEqual(pick('1 - Creep - Radiohead'), ['Creep', 'Radiohead', '']);
    assert.deepEqual(pick('1999 - Prince'), ['1999', 'Prince', '']);
    assert.deepEqual(pick('22 - Taylor Swift'), ['22', 'Taylor Swift', '']);
    assert.deepEqual(pick('7 rings'), ['7 rings', '', '']);
});

test('quita viñetas, emojis y comillas', () => {
    assert.deepEqual(pick('• Bésame mucho'), ['Bésame mucho', '', '']);
    assert.deepEqual(pick('- Creep - Radiohead'), ['Creep', 'Radiohead', '']);
    assert.deepEqual(pick('"Hey Jude" — The Beatles 🎸'), ['Hey Jude', 'The Beatles', '']);
    assert.deepEqual(pick('🎵 La Bamba'), ['La Bamba', '', '']);
});

test('quita prefijos de WhatsApp (iPhone y Android)', () => {
    assert.deepEqual(pick('[10:32, 24/10/2026] Juan: Despacito - Luis Fonsi'), ['Despacito', 'Luis Fonsi', '']);
    assert.deepEqual(pick('24/10/26, 10:33 p. m. - Ana Pérez: Oye - Gente de Zona'), ['Oye', 'Gente de Zona', '']);
});

test('separa tono, BPM y capo como nota', () => {
    assert.deepEqual(pick('La Bamba (en G)'), ['La Bamba', '', 'en G']);
    assert.deepEqual(pick('Corazón de melón - Cuco Sánchez (Tono: Am)'), ['Corazón de melón', 'Cuco Sánchez', 'Tono: Am']);
    assert.deepEqual(pick('Bohemian Rhapsody - Queen - 72 bpm'), ['Bohemian Rhapsody', 'Queen', '72 bpm']);
    assert.deepEqual(pick('La Incondicional en Re'), ['La Incondicional', '', 'en Re']);
    assert.deepEqual(pick('Wonderwall [Am] (capo 2)'), ['Wonderwall', '', 'Am, capo 2']);
});

test('paréntesis final: artista o versión', () => {
    assert.deepEqual(pick('Me voy (Julieta Venegas)'), ['Me voy', 'Julieta Venegas', '']);
    assert.deepEqual(pick('Despacito (Remix)'), ['Despacito (Remix)', '', '']);
    assert.deepEqual(pick('Hasta la Raíz (En Vivo)'), ['Hasta la Raíz (En Vivo)', '', '']);
    assert.deepEqual(pick('Something (feat. Someone) - Artist'), ['Something (feat. Someone)', 'Artist', '']);
});

test('ignora encabezados', () => {
    const items = parseSetlist('SETLIST BODA 🎉\nSet 1:\nCreep\nEncore\nPrimer set\nSet Fire to the Rain - Adele');
    assert.deepEqual(items.map((i) => i.title), ['Creep', 'Set Fire to the Rain']);
});

test('conserva el orden y la línea original', () => {
    const items = parseSetlist('  Title - Artist  \n\nB - C');
    assert.equal(items.length, 2);
    assert.equal(items[0].rawLine, 'Title - Artist');
    assert.equal(items[1].title, 'B');
});
