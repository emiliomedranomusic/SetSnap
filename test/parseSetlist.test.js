'use strict';

const assert = require('assert');
const { parseSetlist, parseLine } = require('../lib/parseSetlist');

assert.deepStrictEqual(parseSetlist(''), []);
assert.deepStrictEqual(parseSetlist(null), []);
assert.deepStrictEqual(parseSetlist('   \n\n  '), []);

const one = parseSetlist('Hello - World');
assert.strictEqual(one.length, 1);
assert.strictEqual(one[0].rawLine, 'Hello - World');
assert.strictEqual(one[0].title, 'Hello');
assert.strictEqual(one[0].artist, 'World');

const two = parseSetlist('A - B\nC - D');
assert.strictEqual(two.length, 2);
assert.strictEqual(two[0].title, 'A');
assert.strictEqual(two[0].artist, 'B');
assert.strictEqual(two[1].title, 'C');
assert.strictEqual(two[1].artist, 'D');

const separators = parseSetlist('Song / Artist\nSong x Artist\nSong by Artist\nSong de Artist');
assert.strictEqual(separators.length, 4);
assert.strictEqual(separators[0].title, 'Song');
assert.strictEqual(separators[0].artist, 'Artist');

const soloTitle = parseSetlist('Forget me nots');
assert.strictEqual(soloTitle.length, 1);
assert.strictEqual(soloTitle[0].title, 'Forget me nots');
assert.strictEqual(soloTitle[0].artist, '');

const feat = parseLine('Something (feat. Someone) - Artist');
assert.strictEqual(feat.title, 'Something (feat. Someone)');
assert.strictEqual(feat.artist, 'Artist');

const inversion = parseLine('Queen - Bohemian Rhapsody');
assert.strictEqual(inversion.title, 'Bohemian Rhapsody');
assert.strictEqual(inversion.artist, 'Queen');

const enDash = parseSetlist('Song – Artist');
assert.strictEqual(enDash.length, 1);
assert.strictEqual(enDash[0].title, 'Song');
assert.strictEqual(enDash[0].artist, 'Artist');

const trimEmpty = parseSetlist('  Title - Artist  \n\n');
assert.strictEqual(trimEmpty.length, 1);
assert.strictEqual(trimEmpty[0].rawLine, 'Title - Artist');
assert.strictEqual(trimEmpty[0].title, 'Title');
assert.strictEqual(trimEmpty[0].artist, 'Artist');

console.log('parseSetlist tests passed');
process.exit(0);
