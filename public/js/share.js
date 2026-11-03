/**
 * Setlist compartible: se codifica completo en el #hash de la URL
 * (comprimido), así no hace falta servidor ni base de datos y la banda
 * puede verlo sin cuenta de Spotify.
 */

function toBase64url(bytes) {
    let str = '';
    for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(s) {
    const str = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
    return bytes;
}

async function pipe(bytes, stream) {
    const out = new Blob([bytes]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(out).arrayBuffer());
}

/**
 * setlist: { name, playlistUrl?, songs: [{ title, artist, id?, note?, bpm?, key? }] }
 */
export async function encodeSetlist(setlist) {
    const compact = {
        n: setlist.name || '',
        p: setlist.playlistUrl || '',
        s: setlist.songs.map((x) => {
            const row = [x.title || '', x.artist || '', x.id || '', x.note || ''];
            if (x.bpm || x.key) row.push(x.bpm || 0, x.key || '');
            return row;
        }),
    };
    const bytes = new TextEncoder().encode(JSON.stringify(compact));
    if (typeof CompressionStream === 'function') {
        return `z${toBase64url(await pipe(bytes, new CompressionStream('deflate-raw')))}`;
    }
    return `j${toBase64url(bytes)}`;
}

export async function decodeSetlist(code) {
    let bytes = fromBase64url(code.slice(1));
    if (code[0] === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    const c = JSON.parse(new TextDecoder().decode(bytes));
    return {
        name: c.n || '',
        playlistUrl: c.p || '',
        songs: (c.s || []).map(([title, artist, id, note, bpm, key]) => ({ title, artist, id, note, bpm: bpm || null, key: key || '' })),
    };
}

export async function buildShareUrl(setlist) {
    return `${window.location.origin}/#s=${await encodeSetlist(setlist)}`;
}

export function setlistToText(setlist, playlistLabel = 'Playlist') {
    const lines = setlist.songs.map((x, i) => {
        let line = `${i + 1}. ${x.title}`;
        if (x.artist) line += ` - ${x.artist}`;
        if (x.note) line += ` (${x.note})`;
        const feat = [x.key, x.bpm ? `${x.bpm} BPM` : ''].filter(Boolean).join(' · ');
        if (feat) line += ` [${feat}]`;
        return line;
    });
    const header = setlist.name ? `${setlist.name}\n\n` : '';
    const footer = setlist.playlistUrl ? `\n\n${playlistLabel}: ${setlist.playlistUrl}` : '';
    return header + lines.join('\n') + footer;
}
