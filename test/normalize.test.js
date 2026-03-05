'use strict';

const assert = require('assert');
const { normalizeForMatch, removeDiacritics } = require('../lib/normalize');

assert.strictEqual(normalizeForMatch(''), '');
assert.strictEqual(normalizeForMatch(null), '');
assert.strictEqual(normalizeForMatch('  Hello  World  '), 'hello world');
assert.strictEqual(normalizeForMatch('Asunción'), 'asuncion');
assert.strictEqual(removeDiacritics('café'), 'cafe');
assert.strictEqual(removeDiacritics('naïve'), 'naive');

const normalized = normalizeForMatch('  Asunción  –  Café  ');
assert.strictEqual(normalized, 'asuncion – cafe');

assert.strictEqual(normalizeForMatch('MÚSICA'), 'musica');

console.log('normalize tests passed');
process.exit(0);
