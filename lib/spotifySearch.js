'use strict';

const stringSimilarity = require('string-similarity');
const { normalizeForMatch } = require('./normalize');

const DEFAULT_TOP_N = 10;
const AUTO_ACCEPT_THRESHOLD = 85;
const MANUAL_THRESHOLD = 50;
const SEARCH_LIMIT = 20;

function normalizeTokens(str) {
    const s = normalizeForMatch(str)
        .replace(/\([^)]*\)/g, ' ')
        .replace(/\b(feat|feat\.|ft|ft\.|featuring)\b/g, ' ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return s;
}

function tokenSortKey(str) {
    const s = normalizeTokens(str);
    if (!s) return '';
    return s.split(' ').filter(Boolean).sort().join(' ');
}

function similarityPercent(a, b) {
    const a1 = normalizeTokens(a);
    const b1 = normalizeTokens(b);
    if (!a1 || !b1) return 0;
    const direct = stringSimilarity.compareTwoStrings(a1, b1) * 100;
    const tok = stringSimilarity.compareTwoStrings(tokenSortKey(a1), tokenSortKey(b1)) * 100;
    return Math.max(direct, tok);
}

/**
 * Calcula score 0-100 ponderando título y artista.
 * - artistWeight + titleWeight = 1; artista suele ser más discriminante.
 */
function scoreMatch(inputTitle, inputArtist, trackTitle, trackArtist, artistWeight = 0.5) {
    const titleScore = inputTitle ? similarityPercent(inputTitle, trackTitle) : 50;
    const artistScore = inputArtist
        ? similarityPercent(inputArtist, trackArtist)
        : 100;

    const iw = (inputArtist && String(inputArtist).trim()) ? 0.65 : 0.25;
    let score = (iw * artistScore) + ((1 - iw) * titleScore);

    const nInArtist = normalizeTokens(inputArtist);
    const nTrArtist = normalizeTokens(trackArtist);
    const nInTitle = normalizeTokens(inputTitle);
    const nTrTitle = normalizeTokens(trackTitle);

    if (nInArtist && nTrArtist && nInArtist === nTrArtist) score += 10;
    if (nInTitle && nTrTitle && nInTitle === nTrTitle) score += 10;
    if (nInTitle && nTrTitle && (nTrTitle.startsWith(nInTitle) || nInTitle.startsWith(nTrTitle))) score += 5;

    score = Math.max(0, Math.min(100, score));
    return Math.round(score);
}

/**
 * Busca en Spotify y devuelve resultados con score. Si hay pocos resultados, hace búsqueda de respaldo por solo título.
 * Siempre devuelve candidatos ordenados por coincidencia (score).
 */
async function searchSpotifyWithScores(spotifyApiInstance, item, options = {}) {
    const limit = options.limit ?? SEARCH_LIMIT;
    const topN = options.topN ?? DEFAULT_TOP_N;

    function buildTrack(track) {
        const title = track.name || '';
        const artist = track.artists && track.artists[0] ? track.artists[0].name : '';
        const score = scoreMatch(item.title, item.artist, title, artist);
        const album = track.album || {};
        return {
            track: {
                id: track.id,
                uri: track.uri,
                name: title,
                artists: track.artists || [],
                album: {
                    name: album.name,
                    images: album.images || [],
                },
                duration_ms: track.duration_ms,
                preview_url: track.preview_url || null,
                external_urls: track.external_urls || {},
            },
            score,
            uri: track.uri,
        };
    }

    let allItems = [];
    const t = (item.title && String(item.title).trim()) || '';
    const a = (item.artist && String(item.artist).trim()) || '';

    const queryFielded = a ? `track:"${t}" artist:"${a}"` : `track:"${t}"`;
    const queryQuotedFree = a ? `"${t}" "${a}"` : `"${t}"`;
    const queryPlain = a ? `${t} ${a}` : `${t}`;
    const queryTitleOnly = `track:"${t}"`;

    try {
        const seen = new Set();
        async function addFromQuery(q) {
            if (!q) return;
            const res = await spotifyApiInstance.searchTracks(q, { limit });
            const items = res.body.tracks?.items || [];
            items.forEach((tr) => {
                if (tr && tr.id && !seen.has(tr.id)) {
                    seen.add(tr.id);
                    allItems.push(tr);
                }
            });
        }

        await addFromQuery(queryFielded);
        if (allItems.length < 8) await addFromQuery(queryQuotedFree);
        if (allItems.length < 8) await addFromQuery(queryTitleOnly);
        if (allItems.length < 8) await addFromQuery(queryPlain);
    } catch (err) {
        return { matches: [], error: err.message || 'Search failed' };
    }

    const matches = allItems.map((track) => buildTrack(track));
    matches.sort((a, b) => b.score - a.score);
    const top = matches.slice(0, topN);
    const best = top[0];

    return {
        matches: top,
        bestUri: best ? best.uri : undefined,
        bestScore: best ? best.score : undefined,
    };
}

/**
 * Determina status según umbrales.
 */
function getStatus(score, autoThreshold = AUTO_ACCEPT_THRESHOLD, manualThreshold = MANUAL_THRESHOLD) {
    if (score == null) return 'not_found';
    if (score >= autoThreshold) return 'found';
    if (score >= manualThreshold) return 'manual';
    return 'not_found';
}

module.exports = {
    searchSpotifyWithScores,
    scoreMatch,
    getStatus,
    AUTO_ACCEPT_THRESHOLD,
    MANUAL_THRESHOLD,
    DEFAULT_TOP_N,
};
