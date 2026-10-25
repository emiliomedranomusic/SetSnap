import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { _dict } from '../public/js/i18n.js';

const es = Object.keys(_dict.es);
const en = Object.keys(_dict.en);

test('español e inglés tienen las mismas claves', () => {
    assert.deepEqual(es.filter((k) => !en.includes(k)), [], 'faltan en inglés');
    assert.deepEqual(en.filter((k) => !es.includes(k)), [], 'faltan en español');
});

test('las variables {x} coinciden entre idiomas', () => {
    const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const k of es) assert.equal(vars(_dict.es[k]), vars(_dict.en[k]), k);
});

test('todas las claves usadas en el código existen', () => {
    const files = readdirSync('public/js').filter((f) => f.endsWith('.js') && f !== 'i18n.js').map((f) => `public/js/${f}`);
    const used = new Set();
    for (const f of [...files, 'public/index.html']) {
        const src = readFileSync(f, 'utf8');
        for (const m of src.matchAll(/\bt\(\s*'([\w.]+)'/g)) used.add(m[1]);
        for (const m of src.matchAll(/data-i18n(?:-html|-placeholder|-title|-aria)?="([\w.]+)"/g)) used.add(m[1]);
        for (const m of src.matchAll(/t\(\s*`theme\.\$\{/g)) ['theme.system', 'theme.light', 'theme.dark'].forEach((k) => used.add(k));
    }
    const missing = [...used].filter((k) => !es.includes(k));
    assert.deepEqual(missing, []);
});
