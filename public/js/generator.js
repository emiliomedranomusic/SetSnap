/**
 * Generador de setlists por evento, a partir del catálogo etiquetado.
 * Corre en el navegador, sin APIs ni costo.
 */
import { CATALOG, GENRES } from './catalog.js';

/** Momentos de cada evento: qué parte del setlist ocupan y qué canciones van. */
export const EVENTS = {
    wedding: [
        { id: 'ceremony', share: 0.12, fit: (s) => s.romantic && s.energy <= 2, order: 'shuffle' },
        { id: 'dinner', share: 0.33, fit: (s) => s.energy >= 2 && s.energy <= 3, order: 'shuffle' },
        { id: 'dance', share: 0.45, fit: (s) => s.energy >= 4, order: 'rise' },
        { id: 'closing', share: 0.1, fit: (s) => s.anthem && s.energy >= 3, order: 'rise' },
    ],
    party: [
        { id: 'warmup', share: 0.2, fit: (s) => s.energy >= 3 && s.energy <= 4, order: 'rise' },
        { id: 'dance', share: 0.7, fit: (s) => s.energy >= 4, order: 'rise' },
        { id: 'closing', share: 0.1, fit: (s) => s.anthem && s.energy >= 3, order: 'rise' },
    ],
    restaurant: [
        { id: 'ambient', share: 1, fit: (s) => s.energy <= 3, order: 'shuffle' },
    ],
    corporate: [
        { id: 'ambient', share: 0.4, fit: (s) => s.energy >= 2 && s.energy <= 3, order: 'shuffle' },
        { id: 'dance', share: 0.5, fit: (s) => s.energy >= 4, order: 'rise' },
        { id: 'closing', share: 0.1, fit: (s) => s.anthem && s.energy >= 3, order: 'rise' },
    ],
};

/** Géneros marcados por defecto en cada evento (se pueden cambiar). */
export const DEFAULT_GENRES = {
    wedding: GENRES.filter((g) => !['urbano', 'country'].includes(g)),
    party: GENRES.filter((g) => !['jazz', 'bolero', 'country'].includes(g)),
    restaurant: GENRES.filter((g) => !['urbano', 'merengue'].includes(g)),
    corporate: GENRES.filter((g) => !['urbano', 'country'].includes(g)),
};

export const SIZES = [10, 15, 30, 45, 60];

/** PRNG con semilla (mulberry32): la misma semilla da el mismo setlist. */
function random(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffle(list, rand) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

const songId = (s) => `${s.title}|${s.artist}`.toLowerCase();

/** Reparte `total` entre los momentos según su proporción (mínimo 1 si cabe). */
export function sectionSizes(sections, total) {
    const sizes = sections.map((s) => Math.max(total >= sections.length ? 1 : 0, Math.round(total * s.share)));
    // El redondeo se ajusta en el momento más grande (normalmente el baile o el ambiente).
    const biggest = sizes.indexOf(Math.max(...sizes));
    sizes[biggest] = Math.max(0, sizes[biggest] + total - sizes.reduce((a, b) => a + b, 0));
    return sizes;
}

/**
 * opts: { event, langs: ['es','en'], genres: [...], size, seed, catalog? }
 * → { sections: [{ id, songs: [...] }], total, short }  (short = cuántas faltaron)
 */
export function generateSetlist({ event = 'wedding', langs = ['es', 'en'], genres, size = 30, seed = 1, catalog = CATALOG } = {}) {
    const plan = EVENTS[event] || EVENTS.wedding;
    const allowedGenres = genres?.length ? genres : DEFAULT_GENRES[event] || GENRES;
    const rand = random(seed);
    const pool = shuffle(
        catalog.filter((s) => !s.seasonal && langs.includes(s.lang) && allowedGenres.includes(s.genre)),
        rand
    );
    const used = new Set();
    const perArtist = new Map();
    const langCount = { es: 0, en: 0 };
    const maxPerArtist = Math.max(2, Math.ceil(size / 15));
    const sizes = sectionSizes(plan, size);

    const take = (candidates, n, lastArtist) => {
        const picked = [];
        let prev = lastArtist;
        const ok = (s) => !used.has(songId(s)) && (perArtist.get(s.artist) || 0) < maxPerArtist;
        while (picked.length < n) {
            let options = candidates.filter((s) => ok(s) && s.artist !== prev);
            if (!options.length) options = candidates.filter(ok);
            if (!options.length) break;
            // Con dos idiomas, se elige del que va quedando atrás.
            if (langs.length > 1) {
                const behind = langCount.es <= langCount.en ? 'es' : 'en';
                const inLang = options.filter((s) => s.lang === behind);
                if (inLang.length) options = inLang;
            }
            const song = options[0];
            picked.push(song);
            used.add(songId(song));
            perArtist.set(song.artist, (perArtist.get(song.artist) || 0) + 1);
            langCount[song.lang] = (langCount[song.lang] || 0) + 1;
            prev = song.artist;
        }
        return picked;
    };

    const sections = [];
    let lastArtist = null;
    plan.forEach((section, i) => {
        const n = sizes[i];
        if (!n) return;
        const fitting = pool.filter(section.fit);
        let songs = take(fitting, n, lastArtist);
        // Si no alcanzan las que encajan perfecto, se completa con energía parecida.
        if (songs.length < n) {
            const target = avgEnergy(fitting);
            const near = pool.filter((s) => Math.abs(s.energy - target) <= 1);
            songs = songs.concat(take(near, n - songs.length, songs.at(-1)?.artist ?? lastArtist));
        }
        if (section.order === 'rise') songs = spreadArtists([...songs].sort((a, b) => a.energy - b.energy), lastArtist);
        if (songs.length) {
            sections.push({ id: section.id, songs });
            lastArtist = songs.at(-1).artist;
        }
    });
    const total = sections.reduce((a, s) => a + s.songs.length, 0);
    return { sections, total, short: Math.max(0, size - total) };
}

/**
 * Orden de menos a más energía sin dos canciones seguidas del mismo artista:
 * toma siempre la de menor energía cuyo artista no sea el anterior.
 */
export function spreadArtists(sorted, prevArtist = null) {
    const rest = [...sorted];
    const out = [];
    let prev = prevArtist;
    while (rest.length) {
        let i = rest.findIndex((s) => s.artist !== prev);
        if (i === -1) i = 0;
        const [song] = rest.splice(i, 1);
        out.push(song);
        prev = song.artist;
    }
    // Si al final quedaron dos juntas, se mueve una al hueco libre más cercano.
    for (let i = 1; i < out.length; i++) {
        if (out[i].artist !== out[i - 1].artist) continue;
        const [song] = out.splice(i, 1);
        const fits = (p) => (p === 0 ? prevArtist : out[p - 1].artist) !== song.artist && out[p]?.artist !== song.artist;
        let best = -1;
        for (let p = 0; p <= out.length; p++) {
            if (fits(p) && (best === -1 || Math.abs(p - i) < Math.abs(best - i))) best = p;
        }
        out.splice(best === -1 ? i : best, 0, song);
    }
    return out;
}

function avgEnergy(list) {
    if (!list.length) return 3;
    return list.reduce((a, s) => a + s.energy, 0) / list.length;
}

/** Setlist → texto para el cuadro (los encabezados "Momento:" no se buscan). */
export function setlistText(result, sectionName) {
    return result.sections
        .map((s) => [`${sectionName(s.id)}:`, ...s.songs.map((x) => `${x.title} - ${x.artist}`)].join('\n'))
        .join('\n\n');
}
