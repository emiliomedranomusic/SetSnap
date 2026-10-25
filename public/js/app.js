import { parseSetlist, parseLine } from './parser.js';
import { MANUAL_THRESHOLD } from './scoring.js';
import { searchAll, searchItem } from './search.js';
import * as spotify from './spotify.js';
import * as guest from './guest.js';
import { extractSetlistText } from './ocr.js';
import { buildShareUrl, decodeSetlist, setlistToText } from './share.js';

const $ = (id) => document.getElementById(id);
const els = {
    account: $('account'),
    editor: $('editor'),
    shareView: $('share-view'),
    textarea: $('song-list'),
    lineCount: $('line-count'),
    ocrControls: $('ocr-controls'),
    ocrHint: $('ocr-hint'),
    imageInput: $('image-input'),
    photoButton: $('photo-button'),
    dropZone: $('drop-zone'),
    dropOverlay: $('drop-overlay'),
    newFields: $('new-playlist-fields'),
    existingFields: $('existing-playlist-fields'),
    existingSelect: $('existing-playlist'),
    skipExisting: $('skip-existing'),
    name: $('playlist-name'),
    description: $('playlist-description'),
    isPublic: $('playlist-public'),
    modeHelp: $('mode-help'),
    searchButton: $('search-button'),
    searchLabel: $('search-label'),
    loginBox: $('login-box'),
    loginButton: $('login-button'),
    guestNote: $('guest-note'),
    publicToggle: $('public-toggle'),
    destinationExisting: document.querySelector('input[name="destination"][value="existing"]'),
    destinationNew: document.querySelector('input[name="destination"][value="new"]'),
    status: $('status'),
    progress: $('progress'),
    progressBar: $('progress-bar'),
    donePanel: $('done-panel'),
    resultsPanel: $('results-panel'),
    resultsSummary: $('results-summary'),
    resultsList: $('results-list'),
    onlyPending: $('only-pending'),
    commitBar: $('commit-bar'),
    commitInfo: $('commit-info'),
    commitButton: $('commit-button'),
    commitLabel: $('commit-label'),
    printSheet: $('print-sheet'),
};

const state = {
    config: { spotifyClientId: null, centralEnabled: false, ocrEnabled: false, ocrGuests: false, youtubeEnabled: false },
    me: null,
    results: [],
    created: null, // { id, url, name, added: Set<uri>, existing, alreadyThere }
    busy: false,
    playlists: null,
};

// ---------- utilidades ----------

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const store = {
    get(key) {
        try { return localStorage.getItem(`setsnap.${key}`); } catch { return null; }
    },
    set(key, value) {
        try { localStorage.setItem(`setsnap.${key}`, value); } catch { /* sin almacenamiento */ }
    },
};

function setStatus(html, type = 'info') {
    const color = { info: 'text-slate-600', error: 'text-red-600', ok: 'text-green-700' }[type];
    els.status.className = `mt-6 text-sm text-center font-medium ${color}`;
    els.status.innerHTML = html;
}

function setProgress(done, total) {
    if (total == null) {
        els.progress.classList.add('hidden');
        return;
    }
    els.progress.classList.remove('hidden');
    els.progressBar.style.width = `${Math.round((done / total) * 100)}%`;
}

function radioValue(name) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value;
}

function defaultPlaylistName() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `Setlist - ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function artistsOf(track) {
    return (track?.artists || []).map((a) => a.name).join(', ');
}

/** "Hotel California - 2013 Remaster" → "Hotel California" (para la hoja de la banda). */
function cleanTrackName(name) {
    return String(name || '')
        .replace(/\s[-–]\s[^-–]*\b(remaster(ed)?|version|versión|edit|mono|stereo|single|bonus|deluxe)\b.*$/i, '')
        .replace(/\s\([^)]*\b(remaster(ed)?|single version|radio edit|mono|stereo)\b[^)]*\)/i, '')
        .trim();
}

function trackUrl(track) {
    return track?.external_urls?.spotify || (track?.id ? `https://open.spotify.com/track/${track.id}` : '');
}

function coverUrl(track) {
    const images = track?.album?.images || [];
    if (!images.length) return '';
    const small = [...images].reverse().find((i) => (i.width || 0) >= 64);
    return (small || images[images.length - 1]).url;
}

function msToDuration(ms) {
    if (ms == null) return '';
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function handleError(err) {
    console.error(err);
    if (err?.needsLogin) {
        state.me = null;
        renderAccount();
    }
    setStatus(esc(err?.message || 'Algo salió mal.'), 'error');
}

// ---------- cuenta ----------

/** Sin sesión pero con cuenta central: se usa la cuenta de SetSnap. */
function isGuest() {
    return !spotify.isLoggedIn() && state.config.centralEnabled;
}

function canSearch() {
    return spotify.isLoggedIn() || state.config.centralEnabled;
}

function canOcr() {
    return state.config.ocrEnabled && (spotify.isLoggedIn() || state.config.ocrGuests);
}

function searchFn() {
    return spotify.isLoggedIn() ? spotify.searchTracks : guest.searchTracks;
}

function renderAccount() {
    const loggedIn = spotify.isLoggedIn();
    const guestMode = isGuest();
    const showLoginBox = !loggedIn && !guestMode;
    els.searchButton.classList.toggle('hidden', !canSearch());
    els.loginBox.classList.toggle('hidden', !showLoginBox);
    els.loginBox.classList.toggle('flex', showLoginBox);
    els.guestNote.classList.toggle('hidden', !guestMode);
    els.publicToggle.classList.toggle('hidden', guestMode);
    document.querySelectorAll('[data-action="youtube"]').forEach((b) => b.classList.toggle('hidden', !state.config.youtubeEnabled));
    const ocr = canOcr();
    els.ocrControls.classList.toggle('hidden', !ocr);
    els.ocrControls.classList.toggle('flex', ocr);
    els.ocrHint.classList.toggle('hidden', !ocr);

    // Agregar a una playlist existente requiere la cuenta de la persona.
    els.destinationExisting.disabled = !loggedIn;
    els.destinationExisting.closest('label').classList.toggle('opacity-40', !loggedIn);
    els.destinationExisting.closest('label').title = loggedIn ? '' : 'Conecta tu Spotify para agregar a tus playlists';
    if (!loggedIn && els.destinationExisting.checked) {
        els.destinationNew.checked = true;
        updateDestination();
    }

    if (!loggedIn) {
        els.account.innerHTML = state.config.spotifyClientId && guestMode
            ? '<button type="button" id="header-login" class="row-button">Usar mi Spotify</button>'
            : '';
        $('header-login')?.addEventListener('click', login);
        return;
    }
    const name = state.me?.display_name || state.me?.id || 'Spotify';
    els.account.innerHTML = `
        <span class="hidden sm:inline text-slate-500">Conectado como</span>
        <span class="font-semibold text-slate-800 truncate max-w-[9rem]">${esc(name)}</span>
        <button type="button" id="logout-button" class="row-button">Salir</button>`;
    $('logout-button').addEventListener('click', () => {
        spotify.logout();
        state.me = null;
        state.playlists = null;
        renderAccount();
        setStatus('Sesión de Spotify cerrada.');
    });
}

async function loadMe() {
    if (!spotify.isLoggedIn()) return null;
    try {
        state.me = await spotify.getMe();
    } catch (err) {
        if (err.needsLogin) state.me = null;
        else console.warn('No se pudo leer el perfil', err);
    }
    renderAccount();
    return state.me;
}

async function login() {
    try {
        await spotify.login();
    } catch (err) {
        handleError(err);
    }
}

// ---------- formulario ----------

function updateLineCount() {
    const n = parseSetlist(els.textarea.value).length;
    els.lineCount.textContent = n ? `${n} ${n === 1 ? 'canción detectada' : 'canciones detectadas'}` : '';
}

let draftTimer;
function saveDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => store.set('draft', els.textarea.value), 300);
}

function updateMode() {
    const auto = radioValue('mode') === 'auto';
    const existing = radioValue('destination') === 'existing';
    els.searchLabel.textContent = !auto ? 'Buscar canciones' : existing ? 'Buscar y agregar' : 'Buscar y crear playlist';
    els.modeHelp.textContent = auto
        ? 'Agrega de una vez las coincidencias seguras. Las dudosas quedan abajo para que las elijas.'
        : 'Te muestra cada coincidencia para confirmarla antes de crear la playlist. El botón para crearla queda fijo abajo.';
    store.set('mode', radioValue('mode'));
}

async function updateDestination() {
    const existing = radioValue('destination') === 'existing';
    els.newFields.classList.toggle('hidden', existing);
    els.existingFields.classList.toggle('hidden', !existing);
    updateMode();
    renderCommitBar();
    if (existing) await loadPlaylists();
}

async function loadPlaylists() {
    if (state.playlists || !spotify.isLoggedIn()) return;
    els.existingSelect.innerHTML = '<option value="">Cargando tus playlists…</option>';
    try {
        const me = state.me || (await loadMe());
        if (!me) throw Object.assign(new Error('Conecta tu cuenta de Spotify.'), { needsLogin: true });
        state.playlists = await spotify.getEditablePlaylists(me.id);
        const last = store.get('lastPlaylist');
        els.existingSelect.innerHTML = state.playlists.length
            ? '<option value="">Elige una playlist…</option>' + state.playlists
                .map((p) => `<option value="${esc(p.id)}"${p.id === last ? ' selected' : ''}>${esc(p.name)}</option>`)
                .join('')
            : '<option value="">No tienes playlists propias</option>';
    } catch (err) {
        els.existingSelect.innerHTML = '<option value="">No se pudieron cargar</option>';
        handleError(err);
    }
}

// ---------- búsqueda ----------

async function doSearch() {
    if (state.busy) return;
    const items = parseSetlist(els.textarea.value);
    if (!items.length) {
        setStatus('Pega al menos una canción en el setlist.', 'error');
        return;
    }
    if (!canSearch()) {
        setStatus('Conecta tu cuenta de Spotify primero.', 'error');
        return;
    }
    const auto = radioValue('mode') === 'auto';
    if (auto && radioValue('destination') === 'existing' && !els.existingSelect.value) {
        setStatus('Elige la playlist a la que quieres agregar las canciones.', 'error');
        return;
    }

    state.busy = true;
    els.searchButton.disabled = true;
    state.created = null;
    els.donePanel.classList.add('hidden');
    setStatus(`Buscando ${items.length} canciones en Spotify…`);
    setProgress(0, items.length);

    try {
        const results = await searchAll(items, searchFn(), (done, total) => {
            setProgress(done, total);
            setStatus(`Buscando… ${done}/${total}`);
        });
        state.results = results.map((r) => ({
            ...r,
            choice: r.status !== 'not_found' && r.matches[0] ? { uri: r.matches[0].track.uri } : null,
            expanded: r.status !== 'found',
            editing: r.status === 'not_found' && !r.matches.length,
        }));
        els.onlyPending.checked = false;
        renderResults();
        els.resultsPanel.classList.remove('hidden');

        const s = summary();
        if (auto) {
            await commit({ onlyFound: true });
            if (s.pending) els.onlyPending.checked = true;
            renderResults();
        } else {
            setStatus(s.pending
                ? `${s.found} de ${s.total} encontradas con seguridad. Revisa ${s.pending} ${s.pending === 1 ? 'línea marcada' : 'líneas marcadas'} y crea la playlist.`
                : `¡Las ${s.total} canciones encontradas! Revisa si quieres y crea la playlist.`, 'ok');
            els.resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    } catch (err) {
        handleError(err);
    } finally {
        state.busy = false;
        els.searchButton.disabled = false;
        setProgress(null);
        renderCommitBar();
    }
}

function summary() {
    const total = state.results.length;
    const found = state.results.filter((r) => r.status === 'found').length;
    const manual = state.results.filter((r) => r.status === 'manual').length;
    const notFound = state.results.filter((r) => r.status === 'not_found').length;
    return { total, found, manual, notFound, pending: manual + notFound };
}

/** URIs a agregar, en orden y sin repetidos. Marca los repetidos en las filas. */
function chosenUris({ onlyFound = false } = {}) {
    const seen = new Set();
    const uris = [];
    state.results.forEach((r) => {
        r.duplicate = false;
        const uri = r.choice?.uri;
        if (!uri) return;
        if (seen.has(uri)) {
            r.duplicate = true;
            return;
        }
        seen.add(uri);
        if (!onlyFound || r.status === 'found') uris.push(uri);
    });
    return uris;
}

function pendingUris() {
    const uris = chosenUris();
    return state.created ? uris.filter((u) => !state.created.added.has(u)) : uris;
}

async function researchRow(idx, text) {
    const row = state.results[idx];
    const parsed = parseLine(text) || { title: text.trim(), artist: '', ordered: false };
    if (!parsed.title) return;
    row.searching = true;
    renderResults();
    try {
        const res = await searchItem(parsed, searchFn());
        Object.assign(row, {
            title: parsed.title,
            artist: parsed.artist,
            ordered: parsed.ordered,
            matches: res.matches,
            bestScore: res.bestScore,
            status: res.status,
            choice: res.matches[0] && res.bestScore >= MANUAL_THRESHOLD ? { uri: res.matches[0].track.uri } : null,
            expanded: true,
            editing: !res.matches.length,
        });
    } catch (err) {
        handleError(err);
    } finally {
        row.searching = false;
        renderResults();
    }
}

// ---------- render de resultados ----------

function rowBadge(r) {
    const added = r.choice?.uri && state.created?.added.has(r.choice.uri);
    if (r.choice?.skip) return ['Omitida', 'bg-slate-100 text-slate-500'];
    if (r.duplicate) return ['Repetida', 'bg-slate-100 text-slate-500'];
    if (added) return ['En la playlist', 'bg-green-100 text-green-800'];
    if (r.status === 'found') return ['Encontrada', 'bg-green-100 text-green-800'];
    if (r.status === 'manual') return ['Revisar', 'bg-amber-100 text-amber-800'];
    return ['No encontrada', 'bg-red-100 text-red-700'];
}

function trackCard(track, score, { selected = false, idx = null } = {}) {
    const img = coverUrl(track);
    const album = track.album?.name;
    const url = trackUrl(track);
    const dur = msToDuration(track.duration_ms);
    const button = idx == null ? '' : `
        <button type="button" data-action="choose" data-idx="${idx}" data-uri="${esc(track.uri)}"
            class="${selected ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'} px-3 py-1.5 rounded-full text-xs font-semibold transition shrink-0">
            ${selected ? 'Elegida' : 'Elegir'}
        </button>`;
    return `
        <div class="flex items-center gap-3 p-2.5 rounded-2xl border ${selected ? 'border-slate-800 bg-slate-50' : 'border-slate-100'}">
            ${img
                ? `<img src="${esc(img)}" alt="" class="w-11 h-11 rounded-lg object-cover shrink-0" loading="lazy">`
                : '<div class="w-11 h-11 rounded-lg bg-slate-100 shrink-0"></div>'}
            <div class="min-w-0 flex-1">
                <div class="font-semibold text-slate-800 truncate text-sm">${esc(track.name)}</div>
                <div class="text-xs text-slate-500 truncate">${esc(artistsOf(track))}${album ? ` · ${esc(album)}` : ''}${dur ? ` · ${dur}` : ''}</div>
            </div>
            <span class="text-xs font-medium text-slate-400 w-9 text-right shrink-0">${score}%</span>
            ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener" title="Abrir en Spotify" class="text-slate-400 hover:text-spotify-green shrink-0"><span class="material-symbols-outlined text-lg">open_in_new</span></a>` : ''}
            ${button}
        </div>`;
}

function renderRow(r, idx) {
    const [label, badgeClass] = rowBadge(r);
    const chosen = r.choice?.uri ? r.matches.find((m) => m.track.uri === r.choice.uri) : null;
    const flipped = r.artist && (chosen || r.matches[0])?.flipped;
    const interpreted = !r.artist ? r.title : flipped ? `${r.artist} · ${r.title}` : `${r.title} · ${r.artist}`;

    let body = '';
    if (r.searching) {
        body = '<p class="text-xs text-slate-500 mt-3">Buscando…</p>';
    } else if (r.choice?.skip) {
        body = '<p class="text-xs text-slate-500 mt-3">No se agregará a la playlist.</p>';
    } else if (chosen && !r.expanded) {
        body = `<div class="mt-3">${trackCard(chosen.track, chosen.score)}</div>`;
    }

    if (!r.searching && r.expanded && !r.choice?.skip) {
        if (r.matches.length) {
            body += `<div class="mt-3 space-y-2">${r.matches
                .map((m) => trackCard(m.track, m.score, { selected: m.track.uri === r.choice?.uri, idx }))
                .join('')}</div>`;
        } else {
            body += '<p class="text-xs text-red-700 mt-3">Spotify no devolvió resultados. Prueba editando la búsqueda.</p>';
        }
    }

    if (r.editing && !r.searching) {
        const value = r.artist ? `${r.title} - ${r.artist}` : r.title;
        body += `
            <form data-action="research" data-idx="${idx}" class="mt-3 flex gap-2">
                <input name="q" value="${esc(value)}" class="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-full px-4 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none" aria-label="Buscar otra vez">
                <button class="row-button bg-slate-900 text-white hover:bg-slate-800">Buscar</button>
            </form>`;
    }

    const actions = [];
    if (!r.choice?.skip && r.matches.length > (r.expanded ? 0 : 1)) {
        actions.push(`<button type="button" class="row-button" data-action="toggle" data-idx="${idx}">${r.expanded ? 'Ocultar opciones' : `Ver opciones (${r.matches.length})`}</button>`);
    }
    if (!r.choice?.skip) actions.push(`<button type="button" class="row-button" data-action="edit" data-idx="${idx}">${r.editing ? 'Cancelar' : 'Editar búsqueda'}</button>`);
    actions.push(r.choice?.skip
        ? `<button type="button" class="row-button" data-action="unskip" data-idx="${idx}">Incluir</button>`
        : `<button type="button" class="row-button" data-action="skip" data-idx="${idx}">Omitir</button>`);

    return `
        <li class="bg-white border border-slate-100 rounded-2xl p-4 shadow-[0_2px_8px_rgb(0,0,0,0.02)]">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <div class="flex items-baseline gap-2">
                        <span class="font-mono text-xs text-slate-400">${idx + 1}</span>
                        <span class="text-sm font-medium text-slate-800 break-words">${esc(r.rawLine)}</span>
                    </div>
                    <div class="text-[11px] text-slate-400 ml-5 mt-0.5">
                        Buscado como: ${esc(interpreted)}${r.note ? ` · <span class="font-semibold text-slate-600">${esc(r.note)}</span>` : ''}
                    </div>
                </div>
                <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${badgeClass}">${label}</span>
            </div>
            ${body}
            <div class="flex flex-wrap justify-end gap-2 mt-3">${actions.join('')}</div>
        </li>`;
}

function renderResults() {
    chosenUris(); // actualiza r.duplicate
    const s = summary();
    els.resultsSummary.innerHTML = `
        <span class="rounded-full px-2.5 py-1 bg-slate-100 text-slate-700">${s.total} líneas</span>
        <span class="rounded-full px-2.5 py-1 bg-green-100 text-green-800">${s.found} encontradas</span>
        ${s.manual ? `<span class="rounded-full px-2.5 py-1 bg-amber-100 text-amber-800">${s.manual} por revisar</span>` : ''}
        ${s.notFound ? `<span class="rounded-full px-2.5 py-1 bg-red-100 text-red-700">${s.notFound} no encontradas</span>` : ''}`;

    const onlyPending = els.onlyPending.checked;
    const html = state.results
        .map((r, idx) => {
            const added = r.choice?.uri && state.created?.added.has(r.choice.uri);
            if (onlyPending && (r.status === 'found' || added)) return '';
            return renderRow(r, idx);
        })
        .join('');
    els.resultsList.innerHTML = html || '<li class="text-sm text-slate-500 text-center py-6">No hay líneas pendientes por revisar. 🎉</li>';
    renderCommitBar();
}

function renderCommitBar() {
    if (!state.results.length) {
        els.commitBar.classList.add('hidden');
        return;
    }
    els.commitBar.classList.remove('hidden');
    const pending = pendingUris().length;
    const skipped = state.results.filter((r) => r.choice?.skip || !r.choice).length;
    if (state.created) {
        els.commitLabel.textContent = pending ? `Agregar ${pending} más` : 'Todo agregado';
        els.commitButton.disabled = !pending || state.busy;
        els.commitInfo.textContent = `Playlist: ${state.created.name}`;
        return;
    }
    const existing = radioValue('destination') === 'existing';
    els.commitLabel.textContent = `${existing ? 'Agregar a playlist' : 'Crear playlist'} (${pending})`;
    els.commitButton.disabled = !pending || state.busy;
    els.commitInfo.textContent = skipped ? `${skipped} sin agregar (omitidas o sin coincidencia)` : 'Todas las canciones tienen coincidencia';
}

// ---------- crear / agregar ----------

async function commit({ onlyFound = false } = {}) {
    const uris = chosenUris({ onlyFound });
    if (!uris.length && !state.created) {
        setStatus('No hay canciones elegidas para agregar.', 'error');
        renderResults();
        return;
    }
    state.busy = true;
    els.commitButton.disabled = true;
    try {
        let target = state.created;
        let pending = target ? uris.filter((u) => !target.added.has(u)) : uris;

        if (!target && radioValue('destination') === 'existing') {
            const id = els.existingSelect.value;
            if (!id) throw new Error('Elige la playlist a la que quieres agregar las canciones.');
            const playlist = state.playlists?.find((p) => p.id === id);
            store.set('lastPlaylist', id);
            target = {
                id,
                name: playlist?.name || 'tu playlist',
                url: playlist?.external_urls?.spotify || `https://open.spotify.com/playlist/${id}`,
                added: new Set(),
                existing: true,
                alreadyThere: 0,
            };
            if (els.skipExisting.checked) {
                setStatus('Revisando qué canciones ya están en la playlist…');
                target.added = await spotify.getPlaylistUris(id);
                const before = pending.length;
                pending = pending.filter((u) => !target.added.has(u));
                target.alreadyThere = before - pending.length;
            }
        } else if (!target && isGuest()) {
            if (!pending.length) throw new Error('No hubo coincidencias seguras para crear la playlist. Elige las canciones abajo y pulsa Crear.');
            setStatus('Creando la playlist…');
            const playlist = await guest.createPlaylist({
                name: els.name.value.trim() || defaultPlaylistName(),
                description: els.description.value.trim(),
                uris: pending,
            });
            target = {
                id: playlist.id,
                name: playlist.name,
                url: playlist.url,
                added: new Set(pending),
                existing: false,
                alreadyThere: 0,
                guest: true,
                editToken: playlist.editToken,
            };
            pending = [];
        } else if (!target) {
            setStatus('Creando la playlist…');
            const name = els.name.value.trim() || defaultPlaylistName();
            const playlist = await spotify.createPlaylist({
                name,
                description: els.description.value.trim() || 'Creada con SetSnap',
                isPublic: els.isPublic.checked,
            });
            target = { id: playlist.id, name: playlist.name || name, url: playlist.external_urls?.spotify, added: new Set(), existing: false, alreadyThere: 0 };
        }

        state.created = target;
        if (pending.length) {
            setStatus(`Agregando ${pending.length} canciones…`);
            if (target.guest) await guest.addItems(target.id, target.editToken, pending);
            else await spotify.addItems(target.id, pending);
            pending.forEach((u) => target.added.add(u));
        }
        target.lastAdded = pending.length;
        renderDone();
        renderResults();
    } catch (err) {
        handleError(err);
        renderCommitBar();
    } finally {
        state.busy = false;
        renderCommitBar();
    }
}

function renderDone() {
    const t = state.created;
    if (!t) return;
    const s = summary();
    const leftover = state.results.filter((r) => !r.choice?.skip && !(r.choice?.uri && t.added.has(r.choice.uri))).length;
    const verb = t.existing ? 'Se agregaron' : 'Playlist creada:';
    els.donePanel.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:items-center gap-3">
            <div class="flex-1">
                <p class="font-semibold text-green-800">${verb} ${t.existing ? `${t.lastAdded} canciones a ` : ''}“${esc(t.name)}”</p>
                <p class="text-xs text-green-700 mt-1">
                    ${t.added.size && !t.existing ? `${t.added.size} canciones en la playlist.` : ''}
                    ${t.alreadyThere ? `${t.alreadyThere} ya estaban y no se repitieron.` : ''}
                    ${leftover ? `${leftover} de ${s.total} quedan pendientes abajo.` : ''}
                </p>
            </div>
            ${t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener" class="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full bg-spotify-green text-white text-sm font-semibold no-underline hover:opacity-90">
                <span class="material-symbols-outlined text-lg">open_in_new</span>Abrir en Spotify</a>` : ''}
        </div>
        ${t.guest ? `
        <div class="mt-4 pt-4 border-t border-green-200 text-xs text-green-900 leading-relaxed">
            <p class="font-semibold mb-1">¿La quieres en tu cuenta para editarla?</p>
            <p>La playlist está en el perfil de SetSnap. Ábrela en Spotify, toca <b>⋯</b> → <b>Agregar a otra playlist</b> → <b>Nueva playlist</b> y tendrás tu propia copia. También puedes darle a <b>Guardar</b> (+) para tenerla en tu biblioteca tal cual.</p>
        </div>` : ''}`;
    els.donePanel.classList.remove('hidden');
    setStatus('');
    els.donePanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---------- compartir / exportar ----------

function currentSetlist() {
    const songs = state.results
        .filter((r) => !r.choice?.skip)
        .map((r) => {
            const m = r.choice?.uri ? r.matches.find((x) => x.track.uri === r.choice.uri) : null;
            return m
                ? { title: cleanTrackName(m.track.name), artist: artistsOf(m.track), id: m.track.id, note: r.note }
                : { title: r.title, artist: r.artist, id: '', note: r.note };
        });
    return {
        name: state.created?.name || els.name.value.trim() || defaultPlaylistName(),
        playlistUrl: state.created?.url || '',
        songs,
    };
}

async function openYouTube(setlist) {
    if (!setlist.songs.length) {
        setStatus('No hay canciones para armar la lista.', 'error');
        return;
    }
    setStatus('<span class="animate-pulse">Buscando los videos en YouTube…</span>');
    try {
        const { urls, found, total, limited } = await guest.youtubeLists(setlist.songs);
        if (!urls.length) {
            setStatus(limited
                ? 'Se acabaron las búsquedas de YouTube de hoy. Las canciones que ya alguien buscó salen al instante; intenta mañana con las demás.'
                : 'No encontré videos para estas canciones.', 'error');
            return;
        }
        const links = urls
            .map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-red-600 text-white text-sm font-semibold no-underline hover:opacity-90"><span class="material-symbols-outlined text-lg">smart_display</span>Abrir en YouTube${urls.length > 1 ? ` (parte ${i + 1})` : ''}</a>`)
            .join(' ');
        const missing = total - found;
        const note = missing
            ? `<p class="text-xs text-slate-500 mt-2">${missing} de ${total} sin video${limited ? ' (se acabaron las búsquedas de hoy)' : ''}.</p>`
            : '';
        setStatus(`<div class="flex flex-wrap justify-center gap-2">${links}</div>${note}<p class="text-xs text-slate-500 mt-2">YouTube la abre como lista sin nombre. Para conservarla, guárdala desde YouTube.</p>`, 'info');
        els.status.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
        handleError(err);
    }
}

async function copyText(text, okMessage) {
    try {
        await navigator.clipboard.writeText(text);
        setStatus(okMessage, 'ok');
    } catch {
        window.prompt('Copia el texto:', text);
    }
}

async function shareSetlist(setlist) {
    const url = await buildShareUrl(setlist);
    if (navigator.share) {
        try {
            await navigator.share({ title: setlist.name, text: `Setlist: ${setlist.name}`, url });
            return;
        } catch (err) {
            if (err?.name === 'AbortError') return;
        }
    }
    await copyText(url, 'Link copiado. Pégalo en el grupo de la banda: no necesitan cuenta para verlo.');
}

function printSetlist(setlist) {
    els.printSheet.innerHTML = `
        <h1>${esc(setlist.name)}</h1>
        <ol>${setlist.songs
            .map((x, i) => `<li><span class="num">${i + 1}</span><span><b>${esc(x.title)}</b>${x.artist ? ` <span class="artist">${esc(x.artist)}</span>` : ''}</span>${x.note ? `<span class="note">${esc(x.note)}</span>` : ''}</li>`)
            .join('')}</ol>`;
    window.print();
}

function reset() {
    state.results = [];
    state.created = null;
    els.resultsPanel.classList.add('hidden');
    els.donePanel.classList.add('hidden');
    renderCommitBar();
    setStatus('');
    els.editor.scrollIntoView({ behavior: 'smooth' });
}

// ---------- vista compartida (#s=...) ----------

async function showShareView(code) {
    let setlist;
    try {
        setlist = await decodeSetlist(code);
    } catch {
        setStatus('El link del setlist está incompleto o dañado.', 'error');
        return;
    }
    els.editor.classList.add('hidden');
    els.shareView.classList.remove('hidden');
    els.shareView.innerHTML = `
        <div class="bg-white rounded-xl custom-shadow border border-slate-200 p-5 sm:p-8">
            <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Setlist compartido</p>
            <h1 class="text-2xl font-bold mt-1">${esc(setlist.name || 'Setlist')}</h1>
            <p class="text-sm text-slate-500 mt-1">${setlist.songs.length} canciones</p>
            <div class="flex flex-wrap gap-2 mt-4">
                ${setlist.playlistUrl ? `<a href="${esc(setlist.playlistUrl)}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-spotify-green text-white text-sm font-semibold no-underline hover:opacity-90"><span class="material-symbols-outlined text-lg">play_circle</span>Abrir playlist</a>` : ''}
                <button type="button" data-share="print" class="chip-button"><span class="material-symbols-outlined text-base">print</span>Imprimir / PDF</button>
                <button type="button" data-share="copy" class="chip-button"><span class="material-symbols-outlined text-base">content_copy</span>Copiar texto</button>
                ${state.config.youtubeEnabled ? '<button type="button" data-share="youtube" class="chip-button"><span class="material-symbols-outlined text-base">smart_display</span>Escuchar en YouTube</button>' : ''}
                <button type="button" data-share="use" class="chip-button"><span class="material-symbols-outlined text-base">edit</span>Usar en SetSnap</button>
            </div>
            <ol class="mt-6 divide-y divide-slate-100">
                ${setlist.songs.map((x, i) => `
                    <li class="flex items-center gap-3 py-3">
                        <span class="font-mono text-xs text-slate-400 w-6 text-right">${i + 1}</span>
                        <div class="min-w-0 flex-1">
                            <div class="font-semibold text-slate-800 truncate">${esc(x.title)}</div>
                            ${x.artist ? `<div class="text-xs text-slate-500 truncate">${esc(x.artist)}</div>` : ''}
                        </div>
                        ${x.note ? `<span class="text-xs font-bold border border-slate-300 rounded-md px-2 py-0.5">${esc(x.note)}</span>` : ''}
                        ${x.id ? `<a href="https://open.spotify.com/track/${esc(x.id)}" target="_blank" rel="noopener" title="Escuchar en Spotify" class="text-slate-400 hover:text-spotify-green"><span class="material-symbols-outlined text-xl">play_arrow</span></a>` : ''}
                    </li>`).join('')}
            </ol>
        </div>`;
    els.shareView.addEventListener('click', (e) => {
        const action = e.target.closest('[data-share]')?.dataset.share;
        if (action === 'print') printSetlist(setlist);
        if (action === 'copy') copyText(setlistToText(setlist), 'Setlist copiado.');
        if (action === 'youtube') openYouTube(setlist);
        if (action === 'use') {
            els.textarea.value = setlist.songs
                .map((x) => `${x.title}${x.artist ? ` - ${x.artist}` : ''}${x.note ? ` (${x.note})` : ''}`)
                .join('\n');
            els.name.value = setlist.name;
            saveDraft();
            updateLineCount();
            window.history.replaceState({}, '', '/');
            els.shareView.classList.add('hidden');
            els.editor.classList.remove('hidden');
        }
    });
}

// ---------- OCR ----------

async function runOcr(file) {
    if (!file || !file.type?.startsWith('image/')) return;
    if (!state.config.ocrEnabled) {
        setStatus('La lectura de fotos no está activada en este servidor.', 'error');
        return;
    }
    if (!canOcr()) {
        setStatus('Conecta tu cuenta de Spotify para leer fotos de setlists.', 'error');
        return;
    }
    els.photoButton.disabled = true;
    setStatus('<span class="animate-pulse">✨ Leyendo la imagen…</span>');
    try {
        const { lines, remaining } = await extractSetlistText(file);
        if (!lines.length) throw new Error('No encontré canciones en la imagen. Prueba con una foto más nítida.');
        const current = els.textarea.value.trim();
        if (current && window.confirm('¿Agregar estas canciones al final del texto actual?\n\nAceptar = agregar · Cancelar = reemplazar')) {
            els.textarea.value = `${current}\n${lines.join('\n')}`;
        } else {
            els.textarea.value = lines.join('\n');
        }
        saveDraft();
        updateLineCount();
        const left = typeof remaining === 'number' ? ` Te quedan ${remaining} lecturas hoy.` : '';
        setStatus(`Se leyeron ${lines.length} canciones. Revisa el texto y pulsa Buscar.${left}`, 'ok');
        els.textarea.focus();
    } catch (err) {
        handleError(err);
    } finally {
        els.photoButton.disabled = false;
        els.imageInput.value = '';
    }
}

/** Contenido recibido con "Compartir → SetSnap" (lo guarda el service worker). */
async function consumeSharedContent() {
    if (!('caches' in window)) return;
    try {
        const cache = await caches.open('setsnap-share');
        const textRes = await cache.match('/shared-text');
        if (textRes) {
            const text = (await textRes.text()).trim();
            await cache.delete('/shared-text');
            if (text) {
                els.textarea.value = text;
                saveDraft();
                updateLineCount();
                setStatus('Texto recibido. Revisa y pulsa Buscar.', 'ok');
            }
        }
        const imageRes = await cache.match('/shared-image');
        if (imageRes) {
            if (!canOcr()) {
                setStatus('Recibí una imagen. Conecta Spotify para leerla.', 'info');
                return;
            }
            const blob = await imageRes.blob();
            await cache.delete('/shared-image');
            await runOcr(new File([blob], 'setlist.jpg', { type: blob.type || 'image/jpeg' }));
        }
    } catch (err) {
        console.warn('No se pudo leer el contenido compartido', err);
    }
}

// ---------- eventos ----------

function bindEvents() {
    els.textarea.addEventListener('input', () => {
        updateLineCount();
        saveDraft();
    });
    els.searchButton.addEventListener('click', doSearch);
    els.loginButton.addEventListener('click', login);
    els.commitButton.addEventListener('click', () => commit());
    els.onlyPending.addEventListener('change', renderResults);
    els.isPublic.addEventListener('change', () => store.set('public', els.isPublic.checked ? '1' : '0'));
    document.querySelectorAll('input[name="mode"]').forEach((el) => el.addEventListener('change', updateMode));
    document.querySelectorAll('input[name="destination"]').forEach((el) => el.addEventListener('change', updateDestination));
    els.existingSelect.addEventListener('change', renderCommitBar);

    els.photoButton.addEventListener('click', () => els.imageInput.click());
    els.imageInput.addEventListener('change', () => runOcr(els.imageInput.files?.[0]));

    document.addEventListener('paste', (e) => {
        const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
        if (file && canOcr()) {
            e.preventDefault();
            runOcr(file);
        }
    });
    ['dragenter', 'dragover'].forEach((type) => els.dropZone.addEventListener(type, (e) => {
        if (![...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) return;
        e.preventDefault();
        els.dropOverlay.classList.remove('hidden');
    }));
    ['dragleave', 'drop'].forEach((type) => els.dropZone.addEventListener(type, () => els.dropOverlay.classList.add('hidden')));
    els.dropZone.addEventListener('drop', (e) => {
        const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'));
        if (!file) return;
        e.preventDefault();
        runOcr(file);
    });

    els.resultsList.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const idx = Number(btn.dataset.idx);
        const row = state.results[idx];
        if (!row) return;
        switch (btn.dataset.action) {
            case 'choose':
                row.choice = { uri: btn.dataset.uri };
                row.expanded = false;
                break;
            case 'toggle':
                row.expanded = !row.expanded;
                break;
            case 'edit':
                row.editing = !row.editing;
                break;
            case 'skip':
                row.choice = { skip: true };
                row.editing = false;
                break;
            case 'unskip':
                row.choice = row.matches[0] && row.bestScore >= MANUAL_THRESHOLD ? { uri: row.matches[0].track.uri } : null;
                row.expanded = !row.choice;
                break;
            default:
                return;
        }
        renderResults();
        if (btn.dataset.action === 'edit' && row.editing) {
            els.resultsList.querySelector(`form[data-idx="${idx}"] input`)?.focus();
        }
    });
    els.resultsList.addEventListener('submit', (e) => {
        const form = e.target.closest('form[data-action="research"]');
        if (!form) return;
        e.preventDefault();
        researchRow(Number(form.dataset.idx), form.elements.q.value);
    });

    els.resultsPanel.addEventListener('click', (e) => {
        const action = e.target.closest('.chip-button[data-action]')?.dataset.action;
        if (!action) return;
        if (action === 'share') shareSetlist(currentSetlist()).catch(handleError);
        if (action === 'copy-text') copyText(setlistToText(currentSetlist()), 'Setlist copiado como texto.');
        if (action === 'print') printSetlist(currentSetlist());
        if (action === 'youtube') openYouTube(currentSetlist());
        if (action === 'reset') reset();
    });
}

function restoreForm() {
    const draft = store.get('draft');
    if (draft) els.textarea.value = draft;
    const mode = store.get('mode');
    if (mode) {
        const input = document.querySelector(`input[name="mode"][value="${mode}"]`);
        if (input) input.checked = true;
    }
    els.isPublic.checked = store.get('public') === '1';
}

function applyUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const text = params.get('text');
    const shared = params.get('shared');
    if (!text && !shared) return;
    if (text) {
        els.textarea.value = text;
        saveDraft();
        setStatus('Texto recibido. Revisa y pulsa Buscar.', 'ok');
    }
    if (shared === 'nosw') {
        setStatus('Para compartir fotos a SetSnap, abre la app una vez y vuelve a intentarlo.', 'info');
    }
    window.history.replaceState({}, '', '/');
}

async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        if (res.ok) state.config = await res.json();
    } catch {
        // Sin funciones (servidor estático): se queda la config por defecto.
    }
    spotify.configure(state.config.spotifyClientId);
}

async function init() {
    bindEvents();
    restoreForm();
    updateMode();
    updateLineCount();

    await loadConfig();

    if (window.location.hash.startsWith('#s=')) {
        await showShareView(window.location.hash.slice(3));
    }

    try {
        if (await spotify.handleRedirect()) setStatus('¡Conectado a Spotify! Pega tu setlist y pulsa Buscar.', 'ok');
    } catch (err) {
        handleError(err);
    }

    if (!state.config.spotifyClientId) {
        setStatus('Falta configurar SPOTIFY_CLIENT_ID en el servidor (ver README).', 'error');
    }

    renderAccount();
    applyUrlParams();
    updateLineCount();
    await loadMe();
    await consumeSharedContent();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker no registrado', err));
    }
}

init();
