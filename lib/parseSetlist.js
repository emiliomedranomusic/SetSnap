'use strict';

/**
 * Parsing flexible del textbox setlist.
 * Acepta:
 * - "Canción - Artista"
 * - "Artista - Canción" (detectado por heurística: si el segundo token es más "título-like")
 * - "Canción x Artista", "Canción — Artista", "Canción / Artista", "Canción by Artista", "Canción de Artista"
 * - "Solo canción" (sin artista)
 * Tolera comillas, paréntesis (feat.), espacios extra.
 */
const SEPARATORS = [
    ' - ',
    ' – ',  // en dash
    ' — ',  // em dash
    ' / ',
    ' x ',
    ' by ',
    ' de ',
];

/**
 * Heurística simple: cuál parte suena más a título vs artista.
 * - Títulos suelen tener paréntesis (feat.), comillas, o ser más largos/varios términos.
 * - Si la primera parte es una sola palabra y la segunda tiene varias o es más larga, asumir "Artista - Canción".
 */
function looksMoreLikeTitle(part) {
    const t = part.trim();
    if (!t) return false;
    const hasParens = /\(|\)/.test(t);
    const hasFeat = /\bfeat\.?\b/i.test(t) || /\bfeaturing\b/i.test(t);
    const hasQuotes = /["']/.test(t);
    return hasParens || hasFeat || hasQuotes;
}

/**
 * Parsea una línea en { title, artist }.
 * Si hay un solo separador y ambas partes podrían ser título/artista, probamos
 * "primera = título, segunda = artista" por defecto; si la segunda parece más título, invertimos.
 */
function parseLine(rawLine) {
    const raw = (rawLine && String(rawLine)).trim();
    if (!raw) return null;

    let title = raw;
    let artist = '';

    for (const sep of SEPARATORS) {
        const idx = raw.indexOf(sep);
        if (idx === -1) continue;

        const parts = raw.split(sep);
        const first = parts[0].trim();
        const rest = parts.slice(1).join(sep).trim();

        if (!first) continue;

        if (parts.length === 2 && rest) {
            const firstWordCount = first.split(/\s+/).filter(Boolean).length;
            const secondWordCount = rest.split(/\s+/).filter(Boolean).length;
            const secondLooksLikeTitle = looksMoreLikeTitle(rest) && (!looksMoreLikeTitle(first) || secondWordCount > firstWordCount);
            if (secondLooksLikeTitle) {
                title = rest;
                artist = first;
            } else {
                title = first;
                artist = rest;
            }
            break;
        }

        if (first && rest) {
            title = first;
            artist = rest;
            break;
        }
    }

    title = cleanToken(title);
    artist = cleanToken(artist);

    if (!title) return null;

    return { rawLine: raw, title, artist: artist || '' };
}

function cleanToken(s) {
    if (!s) return '';
    return s
        .replace(/^["']|["']$/g, '')
        .trim();
}

/**
 * Parsea texto multilínea en array de { rawLine, title, artist }.
 */
function parseSetlist(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');
    const items = [];
    for (const line of lines) {
        const item = parseLine(line);
        if (item) items.push(item);
    }
    return items;
}

module.exports = { parseSetlist, parseLine, SEPARATORS };
