import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeForMatch, removeDiacritics, similarityPercent, scoreTrack, rankTracks, getStatus } from '../public/js/scoring.js';
import { parseLine } from '../public/js/parser.js';
import { buildQueries, searchItem } from '../public/js/search.js';

const track = (name, artists, extra = {}) => ({
    uri: `spotify:track:${name}-${artists.join('-')}`.replace(/\s+/g, ''),
    name,
    artists: artists.map((n) => ({ name: n })),
    album: { name: extra.album || '' },
    ...extra,
});

test('normalización', () => {
    assert.equal(normalizeForMatch('  Hello  World  '), 'hello world');
    assert.equal(normalizeForMatch('Asunción'), 'asuncion');
    assert.equal(normalizeForMatch(null), '');
    assert.equal(removeDiacritics('naïve café'), 'naive cafe');
});

test('similitud ignora acentos, versiones y feat.', () => {
    assert.equal(similarityPercent('Amame', 'Ámame'), 100);
    assert.equal(similarityPercent('Hotel California', 'Hotel California - 2013 Remaster'), 100);
    assert.equal(similarityPercent('Despacito', 'Despacito (feat. Daddy Yankee)'), 100);
    assert.ok(similarityPercent('Creep', 'Karma Police') < 40);
});

test('detecta "Artista - Canción" invertido', () => {
    const item = parseLine('Queen - Bohemian Rhapsody');
    const s = scoreTrack(item, track('Bohemian Rhapsody', ['Queen']));
    assert.equal(s.flipped, true);
    assert.ok(s.score >= 85, `score ${s.score}`);
});

test('"Stand by Me" y "Loco por ti" no se parten en título y artista', () => {
    const stand = parseLine('Stand by Me');
    assert.equal(scoreTrack(stand, track('Stand by Me', ['Ben E. King'])).score, 100);
    assert.ok(scoreTrack(parseLine('Loco por ti'), track('Loco Por Ti', ['Los Rehenes'])).score >= 85);
    // y "Creep by Radiohead" sigue funcionando como canción + artista
    assert.ok(scoreTrack(parseLine('Creep by Radiohead'), track('Creep', ['Radiohead'])).score >= 85);
    assert.deepEqual(buildQueries(parseLine('Stand by Me'))[0], 'Stand by Me');
});

test('"by" no se invierte', () => {
    const item = parseLine('Creep by Radiohead');
    assert.equal(scoreTrack(item, track('Creep', ['Radiohead'])).flipped, false);
});

test('el título manda sobre el artista', () => {
    const item = parseLine('Creep - Radiohead');
    const right = scoreTrack(item, track('Creep', ['Radiohead'])).score;
    const wrongSong = scoreTrack(item, track('Karma Police', ['Radiohead'])).score;
    const wrongArtist = scoreTrack(item, track('Creep', ['TLC'])).score;
    assert.ok(right >= 85);
    assert.ok(wrongSong < 50, `misma banda, otra canción: ${wrongSong}`);
    assert.ok(wrongArtist < 85, `misma canción, otra banda: ${wrongArtist}`);
});

test('penaliza karaoke y covers', () => {
    const item = parseLine('Creep - Radiohead');
    const ranked = rankTracks(item, [
        track('Creep (Karaoke Version)', ['Radiohead Karaoke Band']),
        track('Creep', ['Radiohead']),
    ]);
    assert.equal(ranked[0].track.name, 'Creep');
    assert.ok(ranked[1].score < 85, 'el karaoke nunca se acepta solo');
});

test('prefiere la versión de estudio salvo que se pida en vivo', () => {
    const studio = track('Creep', ['Radiohead']);
    const live = track('Creep - Live', ['Radiohead']);
    assert.equal(rankTracks(parseLine('Creep - Radiohead'), [live, studio])[0].track.name, 'Creep');
    assert.equal(rankTracks(parseLine('Creep live - Radiohead'), [studio, live])[0].track.name, 'Creep - Live');
});

test('en empate gana el primero de Spotify (más popular)', () => {
    const item = parseLine('Creep');
    const ranked = rankTracks(item, [track('Creep', ['Radiohead']), track('Creep', ['Stone Temple Pilots'])]);
    assert.equal(ranked[0].track.artists[0].name, 'Radiohead');
});

test('artista con varios intérpretes', () => {
    const item = parseLine('Despacito - Luis Fonsi');
    const s = scoreTrack(item, track('Despacito', ['Luis Fonsi', 'Daddy Yankee']));
    assert.ok(s.score >= 85);
});

test('umbrales', () => {
    assert.equal(getStatus(90), 'found');
    assert.equal(getStatus(85), 'found');
    assert.equal(getStatus(60), 'manual');
    assert.equal(getStatus(10), 'not_found');
    assert.equal(getStatus(null), 'not_found');
});

test('consultas: ambas orientaciones solo si no hay "by"', () => {
    assert.equal(buildQueries(parseLine('A - B')).length, 4);
    assert.equal(buildQueries(parseLine('A by B')).length, 3);
    assert.equal(buildQueries(parseLine('A by B'))[0], 'A by B');
    assert.deepEqual(buildQueries(parseLine('Creep')), ['Creep', 'track:"Creep"']);
});

test('searchItem se detiene en cuanto encuentra una coincidencia segura', async () => {
    const calls = [];
    const fake = async (q) => {
        calls.push(q);
        return [track('Bohemian Rhapsody', ['Queen']), track('Bohemian Rhapsody (Karaoke)', ['Sing Along'])];
    };
    const res = await searchItem(parseLine('Queen - Bohemian Rhapsody'), fake);
    assert.equal(calls.length, 1);
    assert.equal(res.status, 'found');
    assert.equal(res.matches[0].track.artists[0].name, 'Queen');
});

test('searchItem sin resultados', async () => {
    const res = await searchItem(parseLine('Canción inexistente - Nadie'), async () => []);
    assert.equal(res.status, 'not_found');
    assert.equal(res.bestScore, null);
});

test('modo karaoke: prefiere la versión karaoke aunque sea de otro "artista"', () => {
    const item = { ...parseLine('Creep - Radiohead'), version: 'karaoke' };
    const ranked = rankTracks(item, [
        track('Creep', ['Radiohead']),
        track('Creep (Originally Performed by Radiohead) [Karaoke Version]', ['Sing Karaoke']),
        track('Creep', ['TLC']),
    ]);
    assert.match(ranked[0].track.name, /Karaoke/);
    assert.ok(ranked[0].score >= 85, `score ${ranked[0].score}`);
    const original = ranked.find((r) => r.track.name === 'Creep' && r.track.artists[0].name === 'Radiohead');
    assert.ok(original.score < 85, 'la original nunca se acepta sola en modo karaoke (queda para revisar)');
});

test('modo karaoke con "Artista - Canción" invertido', () => {
    const item = { ...parseLine('Luis Miguel - La Incondicional'), version: 'karaoke' };
    const s = scoreTrack(item, track('La Incondicional (Karaoke Version)', ['Karaoke Latino'], { album: { name: 'Éxitos de Luis Miguel Karaoke' } }));
    assert.equal(s.flipped, true);
    assert.ok(s.score >= 85, `score ${s.score}`);
});

test('modo instrumental prefiere "instrumental" sobre "karaoke"', () => {
    const item = { ...parseLine('Perfect - Ed Sheeran'), version: 'instrumental' };
    const ranked = rankTracks(item, [
        track('Perfect (Karaoke Version)', ['Sing King']),
        track('Perfect (Instrumental)', ['Ed Sheeran Tribute']),
        track('Perfect', ['Ed Sheeran']),
    ]);
    assert.equal(ranked[0].track.name, 'Perfect (Instrumental)');
    assert.equal(ranked[2].track.name, 'Perfect');
});

test('consultas en modo karaoke', () => {
    assert.deepEqual(buildQueries({ ...parseLine('Creep - Radiohead'), version: 'karaoke' }), ['Creep Radiohead karaoke', 'Creep karaoke', 'track:"Creep" karaoke']);
    assert.deepEqual(buildQueries({ ...parseLine('La Bamba'), version: 'instrumental' }), ['La Bamba instrumental', 'track:"La Bamba" instrumental']);
});
