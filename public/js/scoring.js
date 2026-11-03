/**
 * Scoring 0-100 entre una línea del setlist y un track de Spotify.
 * Corre igual en el navegador y en Node (tests).
 */

export const AUTO_ACCEPT_THRESHOLD = 85;
export const MANUAL_THRESHOLD = 50;

// Versiones que casi nunca son las que busca un músico, salvo que las pida.
const UNWANTED_VERSION_RE = /\b(karaoke|instrumental|originally performed|in the style of|made famous|tribute|cover|backing track|pista|8[\s-]?bit|lullaby|cuna)\b/;
// Lo que se busca en modo karaoke / instrumental (version del item).
const WANTED_VERSION_RE = {
    karaoke: /\b(karaoke|sing along|singalong|originally performed|in the style of|made famous|backing track|pista)\b/,
    instrumental: /\b(instrumental|karaoke|backing track|pista)\b/,
};
// Versiones válidas pero que no son la de estudio: solo desempatan.
const ALT_VERSION_RE = /\b(live|en vivo|ao vivo|acoustic|acustic[oa]|unplugged|remix|demo|session|sped up|slowed)\b/;

export function removeDiacritics(str) {
    return str.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/** casefold + trim + espacios colapsados + sin acentos. */
export function normalizeForMatch(str) {
    if (str == null || typeof str !== 'string') return '';
    return removeDiacritics(str.trim().toLowerCase().replace(/\s+/g, ' '));
}

/** Normaliza y quita ruido: paréntesis, "feat.", " - Remastered 2011", puntuación. */
export function normalizeTokens(str) {
    return normalizeForMatch(str)
        .replace(/\s[-–—]\s.*$/, ' ')
        .replace(/[([][^)\]]*[)\]]/g, ' ')
        .replace(/\b(feat|ft|featuring)\b\.?.*$/, ' ')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function bigrams(s) {
    const map = new Map();
    for (let i = 0; i < s.length - 1; i++) {
        const bg = s.substring(i, i + 2);
        map.set(bg, (map.get(bg) || 0) + 1);
    }
    return map;
}

/** Coeficiente de Dice sobre bigramas (mismo algoritmo que string-similarity). */
export function dice(a, b) {
    const x = a.replace(/\s+/g, '');
    const y = b.replace(/\s+/g, '');
    if (x === y) return 1;
    if (x.length < 2 || y.length < 2) return 0;
    const first = bigrams(x);
    let intersection = 0;
    for (let i = 0; i < y.length - 1; i++) {
        const bg = y.substring(i, i + 2);
        const count = first.get(bg) || 0;
        if (count > 0) {
            first.set(bg, count - 1);
            intersection++;
        }
    }
    return (2 * intersection) / (x.length + y.length - 2);
}

function tokenSort(s) {
    return s.split(' ').filter(Boolean).sort().join(' ');
}

/** Similitud 0-100 tolerante a orden de palabras. */
export function similarityPercent(a, b) {
    const a1 = normalizeTokens(a);
    const b1 = normalizeTokens(b);
    if (!a1 || !b1) return 0;
    let best = Math.max(dice(a1, b1), dice(tokenSort(a1), tokenSort(b1)));
    // "Despacito" vs "Despacito Remix" o "Shakira" vs "Shakira y Bizarrap".
    if ((` ${b1} `).includes(` ${a1} `) || (` ${a1} `).includes(` ${b1} `)) best = Math.max(best, 0.9);
    return best * 100;
}

function artistNames(track) {
    return (track.artists || []).map((a) => a.name).filter(Boolean);
}

/**
 * Modo karaoke/instrumental: se premia la versión pedida y se castiga la
 * original. Los karaokes suelen venir de otro "artista" (p. ej. "Sing King")
 * y nombrar al original en el título ("Originally Performed by Radiohead").
 */
function scoreVersion(title, artist, track, version) {
    const trackTitle = track.name || '';
    const names = artistNames(track);
    const hay = normalizeForMatch(`${trackTitle} ${track.album?.name || ''} ${names.join(' ')}`);
    const titleScore = similarityPercent(title, trackTitle);
    let artistScore = 0;
    if (artist) {
        const nArtist = normalizeTokens(artist);
        artistScore = Math.max(0, ...names.map((n) => similarityPercent(artist, n)), nArtist && hay.includes(nArtist) ? 100 : 0);
    }
    let score = artist ? 0.7 * titleScore + 0.3 * artistScore : titleScore;
    if (normalizeTokens(title) === normalizeTokens(trackTitle)) score += 5;
    const wanted = WANTED_VERSION_RE[version];
    score = Math.min(100, score + (wanted.test(hay) ? 10 : -35));
    if (version === 'instrumental' && /\binstrumental\b/.test(hay)) score = Math.min(100, score + 3);
    return { score: Math.round(Math.max(0, score)), titleScore, artistScore };
}

/**
 * Puntúa un track asumiendo una orientación concreta (title/artist).
 */
function scoreOriented(title, artist, track, version) {
    if (WANTED_VERSION_RE[version]) return scoreVersion(title, artist, track, version);
    const trackTitle = track.name || '';
    const titleScore = similarityPercent(title, trackTitle);
    const names = artistNames(track);

    let score;
    let artistScore = 0;
    if (artist) {
        artistScore = Math.max(0, ...names.map((n) => similarityPercent(artist, n)), similarityPercent(artist, names.join(' ')));
        // El título manda: un artista correcto con otra canción no sirve.
        score = 0.6 * titleScore + 0.4 * artistScore;
        if (titleScore >= 95 && artistScore >= 95) score += 10;
    } else {
        score = titleScore;
    }

    const nIn = normalizeTokens(title);
    const nTr = normalizeTokens(trackTitle);
    if (nIn && nIn === nTr) score += 5;

    score = Math.min(100, score);
    const rawTrack = normalizeForMatch(`${trackTitle} ${track.album?.name || ''}`);
    const rawInput = normalizeForMatch(`${title} ${artist}`);
    if (UNWANTED_VERSION_RE.test(rawTrack) && !UNWANTED_VERSION_RE.test(rawInput)) score -= 25;
    if (artist && names.some((n) => UNWANTED_VERSION_RE.test(normalizeForMatch(n)))) score -= 25;
    if (ALT_VERSION_RE.test(normalizeForMatch(trackTitle)) !== ALT_VERSION_RE.test(rawInput)) score -= 4;

    return { score: Math.round(Math.max(0, score)), titleScore, artistScore };
}

/**
 * Score de un track para un item parseado. Si el parser no fijó el orden,
 * prueba "Canción - Artista" y "Artista - Canción" y se queda con el mejor.
 */
export function scoreTrack(item, track) {
    const title = item.title || '';
    const artist = item.artist || '';
    const v = item.version;
    let direct = scoreOriented(title, artist, track, v);
    if (item.whole) {
        const asTitle = scoreOriented(item.whole, '', track, v);
        if (asTitle.score > direct.score) direct = asTitle;
    }
    if (!artist || item.ordered) return { ...direct, flipped: false };
    const flipped = scoreOriented(artist, title, track, v);
    return flipped.score > direct.score ? { ...flipped, flipped: true } : { ...direct, flipped: false };
}

/**
 * Ordena candidatos por score; en empate gana el que Spotify puso primero
 * (más popular), por eso se conserva el índice original.
 */
export function rankTracks(item, tracks) {
    return tracks
        .map((track, rank) => ({ track, rank, ...scoreTrack(item, track) }))
        .sort((a, b) => b.score - a.score || a.rank - b.rank);
}

export function getStatus(score, autoThreshold = AUTO_ACCEPT_THRESHOLD, manualThreshold = MANUAL_THRESHOLD) {
    if (score == null) return 'not_found';
    if (score >= autoThreshold) return 'found';
    if (score >= manualThreshold) return 'manual';
    return 'not_found';
}
