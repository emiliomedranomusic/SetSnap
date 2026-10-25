/**
 * Parsing de setlists pegados (WhatsApp, notas, listas impresas).
 *
 * Cada línea se limpia (numeración, viñetas, emojis, prefijos de WhatsApp,
 * anotaciones de tono/BPM/capo) y se separa en { title, artist }.
 * El orden "Canción - Artista" vs "Artista - Canción" NO se adivina aquí:
 * la búsqueda puntúa ambas orientaciones y se queda con la mejor.
 */

// Separadores explícitos entre canción y artista, en orden de prioridad.
// No se usan " de " ni " x " porque rompen títulos ("Amor de mis amores").
const SEPARATORS = [' - ', ' – ', ' — ', ' | ', ' / ', '\t'];
// Separadores con dirección conocida: "Canción by/por Artista".
const DIRECTIONAL_SEPARATORS = [' by ', ' por '];

const KEY_TOKEN = String.raw`(?:[A-G]|Do|Re|Mi|Fa|Sol|La|Si)(?:#|b|♯|♭)?(?:\s?(?:m|min|maj|menor|mayor|major|minor))?`;
// Contenido de un paréntesis que es una anotación musical, no parte del título.
const NOTE_CONTENT_RE = new RegExp(
    String.raw`^(?:(?:en|in)\s+${KEY_TOKEN}|(?:tono|tonalidad|key|capo|cejilla)\b.*|\d{2,3}\s?bpm|bpm\s?\d{2,3}|${KEY_TOKEN})$`,
    'i'
);
const TRAILING_NOTE_RE = new RegExp(
    String.raw`\s+[-–—|/]?\s*((?:tono|tonalidad|key)\s*:?\s*${KEY_TOKEN}|en\s+${KEY_TOKEN}|capo\s*:?\s*\d+|\d{2,3}\s?bpm)\s*$`,
    'i'
);
// Paréntesis que describen una versión (se quedan en el título, no son artista).
const VERSION_WORDS_RE = /\b(live|en vivo|vivo|remix|remaster(ed)?|versi[oó]n|version|ac[uú]stic[oa]?|acoustic|unplugged|demo|edit|mix|instrumental|cover|feat\.?|ft\.?|featuring|with|con|from|radio|extended|original|mono|stereo|deluxe|bonus|karaoke|intro|outro|medley|popurr[ií]|parte|part|pt\.?)\b/i;

const WHATSAPP_IOS_RE = /^\[\d{1,2}[:.]\d{2}(?:[:.]\d{2})?(?:\s?[ap]\.?\s?m\.?)?,\s?\d{1,2}\/\d{1,2}\/\d{2,4}\]\s?[^:]{1,40}:\s*/i;
const WHATSAPP_ANDROID_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4},?\s\d{1,2}:\d{2}(?:\s?[ap]\.?\s?m\.?)?\s[-–]\s[^:]{1,40}:\s*/i;
const HEADER_RE = /^(set\s*list|setlist|lista|repertorio|set\s*\d+|\d+\s*(?:er|do|ro|to|°|º)?\s*set|(?:primer|segundo|tercer|cuarto)\s+set|encore|bis|intermedio|descanso|break|pausa)\b[^-–—|/]*:?$/i;
const EMOJI_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu;

function stripWhatsAppPrefix(line) {
    return line.replace(WHATSAPP_IOS_RE, '').replace(WHATSAPP_ANDROID_RE, '');
}

function hasSeparator(s) {
    return SEPARATORS.some((sep) => s.includes(sep)) || DIRECTIONAL_SEPARATORS.some((sep) => s.toLowerCase().includes(sep));
}

/**
 * Quita numeración de lista ("1.", "2)", "3.-", "#4") sin romper títulos
 * que empiezan con número ("1999 - Prince", "22", "7 rings").
 */
function stripNumbering(line) {
    const s = line.replace(/^#?\d{1,3}\s*[.)]\s*-?\s*/, '');
    if (s !== line) return s;
    // "1 - Creep - Radiohead": solo si después queda otro separador.
    const m = line.match(/^#?\d{1,3}\s*[-–—:]\s+(.*)$/);
    if (m && hasSeparator(m[1])) return m[1];
    return line.replace(/^#\d{1,3}\s+/, '');
}

function cleanToken(s) {
    if (!s) return '';
    return s
        .replace(/^["'“”«»‘’]+|["'“”«»‘’]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Extrae anotaciones (tono, BPM, capo) a `notes` y las quita del texto.
 */
function extractNotes(text) {
    const notes = [];
    let s = text.replace(/\s*[([]([^()[\]]{1,30})[)\]]/g, (whole, inner) => {
        if (NOTE_CONTENT_RE.test(inner.trim())) {
            notes.push(inner.trim());
            return '';
        }
        return whole;
    });
    let m;
    while ((m = s.match(TRAILING_NOTE_RE))) {
        notes.unshift(m[1].trim());
        s = s.slice(0, m.index);
    }
    return { text: s.trim(), notes };
}

/**
 * Parsea una línea en { rawLine, title, artist, note }.
 * Devuelve null para líneas vacías o encabezados ("Set 1:", "Encore").
 */
function parseLine(rawLine) {
    const raw = rawLine == null ? '' : String(rawLine).trim();
    if (!raw) return null;

    let s = stripWhatsAppPrefix(raw);
    s = s.replace(EMOJI_RE, ' ');
    // Viñetas y símbolos al inicio (•, *, -, >, ▪, ✓...).
    s = s.replace(/^[^\p{L}\p{N}"'“«¿¡(#]+/u, '');
    s = stripNumbering(s).trim();
    if (!s) return null;
    if (HEADER_RE.test(s) || (/:$/.test(s) && !hasSeparator(s))) return null;

    const { text, notes } = extractNotes(s);
    s = text;
    if (!s) return null;

    let title = s;
    let artist = '';
    let ordered = false; // true si el formato fija la orientación (by/por)

    const lower = s.toLowerCase();
    const directional = DIRECTIONAL_SEPARATORS.find((sep) => lower.includes(sep));
    const sep = SEPARATORS.find((x) => s.includes(x));
    if (sep) {
        const idx = s.indexOf(sep);
        title = s.slice(0, idx);
        artist = s.slice(idx + sep.length);
    } else if (directional) {
        const idx = lower.lastIndexOf(directional);
        title = s.slice(0, idx);
        artist = s.slice(idx + directional.length);
        ordered = true;
    } else {
        // "Me voy (Julieta Venegas)": paréntesis final que no describe una versión.
        const m = s.match(/^(.+?)\s*\(([^()]{2,40})\)$/);
        if (m && !VERSION_WORDS_RE.test(m[2])) {
            title = m[1];
            artist = m[2];
        }
    }

    title = cleanToken(title);
    artist = cleanToken(artist);
    if (!title && artist) {
        title = artist;
        artist = '';
    }
    if (!title) return null;

    return { rawLine: raw, title, artist, note: notes.join(', '), ordered };
}

/**
 * Parsea texto multilínea en un array de { rawLine, title, artist, note }.
 */
function parseSetlist(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];
    return rawText
        .split(/\r?\n/)
        .map(parseLine)
        .filter(Boolean);
}

export { parseSetlist, parseLine, SEPARATORS };
