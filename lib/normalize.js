'use strict';

/**
 * Normalización de texto para matching:
 * - casefold (toLowerCase)
 * - trim
 * - colapsar espacios múltiples a uno
 * - quitar diacríticos (Asuncion === Asunción)
 */
function normalizeForMatch(str) {
    if (str == null || typeof str !== 'string') return '';
    let s = str.trim().toLowerCase().replace(/\s+/g, ' ');
    return removeDiacritics(s);
}

function removeDiacritics(str) {
    return str.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

module.exports = { normalizeForMatch, removeDiacritics };
