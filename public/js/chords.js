/**
 * Links a acordes, tabs y partituras de cada canción.
 *
 * Ninguno de estos sitios tiene API pública, pero no hace falta: armamos
 * el link de búsqueda (o un "voy a tener suerte" de DuckDuckGo limitado al
 * sitio, que abre directo el primer resultado). Cuesta $0 y no depende de
 * cuotas. Si un sitio cambia su URL de búsqueda, se corrige aquí.
 */

const enc = encodeURIComponent;

/** DuckDuckGo "\" = abrir directo el primer resultado; con site: queda dentro del sitio. */
function lucky(site, q) {
    return `https://duckduckgo.com/?q=${enc(`\\site:${site} ${q}`)}`;
}

export const CHORD_SITES = [
    { id: 'cifraclub', name: 'Cifra Club', short: 'CC', url: (q) => lucky('cifraclub.com.br', q) },
    { id: 'ultimate', name: 'Ultimate Guitar', short: 'UG', url: (q) => `https://www.ultimate-guitar.com/search.php?search_type=title&value=${enc(q)}` },
    { id: 'lacuerda', name: 'La Cuerda', short: 'LC', url: (q) => lucky('lacuerda.net', q) },
    { id: 'musescore', name: 'MuseScore', short: 'MS', url: (q) => `https://musescore.com/sheetmusic?text=${enc(q)}` },
    { id: 'songsterr', name: 'Songsterr', short: 'SG', url: (q) => `https://www.songsterr.com/?pattern=${enc(q)}` },
    // iReal Pro no tiene páginas por canción: sus cifrados se comparten en el foro.
    { id: 'irealpro', name: 'iReal Pro', short: 'iR', url: (q) => `https://duckduckgo.com/?q=${enc(`site:irealpro.com ${q}`)}` },
];

const DEFAULTS = { es: ['cifraclub', 'lacuerda', 'ultimate'], en: ['ultimate', 'songsterr'] };

/** Texto de búsqueda: título sin "(Remastered)", "- Live", "feat." + artista principal. */
export function chordQuery(title, artist) {
    const cleanTitle = String(title || '')
        .replace(/\s[-–]\s.*$/, '')
        .replace(/\s*[([][^)\]]*[)\]]/g, '')
        .trim();
    const mainArtist = String(artist || '').split(/,|&| feat\.? | ft\.? /i)[0].trim();
    return `${cleanTitle} ${mainArtist}`.trim();
}

export function chordLinks(title, artist, siteIds) {
    const q = chordQuery(title, artist);
    if (!q) return [];
    return CHORD_SITES.filter((s) => siteIds.includes(s.id)).map((s) => ({ id: s.id, name: s.name, short: s.short, url: s.url(q) }));
}

export function defaultSites(lang) {
    return DEFAULTS[lang] || DEFAULTS.es;
}

export function validSites(ids) {
    return (Array.isArray(ids) ? ids : []).filter((id) => CHORD_SITES.some((s) => s.id === id));
}
