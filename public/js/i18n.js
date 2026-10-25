/**
 * Textos de la interfaz en español e inglés.
 * t('clave', { n: 3 }) reemplaza {n}. En el HTML: data-i18n="clave"
 * (texto), data-i18n-html (HTML), data-i18n-placeholder, data-i18n-title
 * y data-i18n-aria (aria-label).
 */

const dict = {
    es: {
        'meta.description': 'Pega o fotografía un setlist y conviértelo en una playlist de Spotify en segundos.',
        'header.lang': 'Cambiar idioma',
        'header.theme': 'Cambiar tema (sistema, claro, oscuro)',
        'header.install': 'Instalar',
        'header.useMySpotify': 'Usar mi Spotify',
        'header.connectedAs': 'Conectado como',
        'header.logout': 'Salir',
        'offline': 'Sin conexión. Puedes escribir el setlist; para buscar necesitas internet.',

        'editor.label': 'Setlist',
        'editor.photo': 'Foto del setlist',
        'editor.placeholder': 'Pega aquí el setlist que te mandaron, una canción por línea.\n\n1. Creep - Radiohead\n2. Radiohead - Karma Police\n3. Amor de mis amores (en G)\n\nDa igual el orden canción/artista, la numeración o los mensajes de WhatsApp.',
        'editor.drop': 'Suelta la imagen para leer el setlist',
        'editor.pasteHint': 'También puedes pegar una captura (Ctrl+V)',
        'editor.example': 'Probar con un ejemplo',
        'editor.clear': 'Borrar',
        'editor.shortcut': 'Ctrl + Enter para buscar',
        'editor.lines': '{n} canciones detectadas',
        'editor.line': '1 canción detectada',
        'editor.exampleText': '1. Creep - Radiohead\n2) Radiohead - Karma Police\n3.- Amor de mis amores (en G)\n[10:32, 24/10/2026] Juan: Despacito - Luis Fonsi\n• Bésame mucho\nLa Bamba',

        'dest.legend': 'Destino',
        'dest.new': 'Playlist nueva',
        'dest.existing': 'Agregar a una existente',
        'dest.existingNeedsLogin': 'Conecta tu Spotify para agregar a tus playlists',
        'name.label': 'Nombre',
        'name.placeholder': 'Setlist - fecha de hoy',
        'desc.label': 'Descripción',
        'desc.placeholder': 'Opcional',
        'public.label': 'Playlist pública',
        'existing.label': 'Playlist',
        'existing.connect': 'Conecta Spotify para ver tus playlists',
        'existing.loading': 'Cargando tus playlists…',
        'existing.choose': 'Elige una playlist…',
        'existing.none': 'No tienes playlists propias',
        'existing.failed': 'No se pudieron cargar',
        'existing.skip': 'No repetir canciones que ya están en la playlist',

        'mode.legend': 'Modo',
        'mode.review': 'Revisar (recomendado)',
        'mode.auto': 'Crear directo',
        'mode.reviewHelp': 'Te muestra cada coincidencia para confirmarla antes de crear la playlist. El botón para crearla queda fijo abajo.',
        'mode.autoHelp': 'Agrega de una vez las coincidencias seguras. Las dudosas quedan abajo para que las elijas.',
        'search.button': 'Buscar canciones',
        'search.buttonAuto': 'Buscar y crear playlist',
        'search.buttonAutoExisting': 'Buscar y agregar',
        'guest.note': 'No necesitas cuenta: la playlist se crea en el perfil de SetSnap y te damos el link para guardarla o copiarla a tu Spotify.',
        'login.button': 'Conectar con Spotify',
        'login.fbNote': 'Si instalaste la app, entra con tu email de Spotify: el inicio de sesión con <b>Facebook</b> puede fallar dentro de apps instaladas.',

        'results.onlyPending': 'Solo las que hay que revisar',
        'results.share': 'Compartir con la banda',
        'results.copy': 'Copiar como texto',
        'results.youtube': 'Lista en YouTube',
        'results.csv': 'Exportar CSV',
        'results.print': 'Imprimir / PDF',
        'results.reset': 'Empezar de nuevo',
        'results.lines': '{n} líneas',
        'results.found': '{n} encontradas',
        'results.toReview': '{n} por revisar',
        'results.notFound': '{n} no encontradas',
        'results.nonePending': 'No hay líneas pendientes por revisar. 🎉',
        'footer': 'Usa la API oficial de Spotify. No estamos afiliados a Spotify.',

        'badge.skipped': 'Omitida',
        'badge.duplicate': 'Repetida',
        'badge.added': 'En la playlist',
        'badge.found': 'Encontrada',
        'badge.review': 'Revisar',
        'badge.notFound': 'No encontrada',
        'row.choose': 'Elegir',
        'row.chosen': 'Elegida',
        'row.openSpotify': 'Abrir en Spotify',
        'row.searching': 'Buscando…',
        'row.willSkip': 'No se agregará a la playlist.',
        'row.noResults': 'Spotify no devolvió resultados. Prueba editando la búsqueda.',
        'row.searchAgain': 'Buscar otra vez',
        'row.search': 'Buscar',
        'row.hideOptions': 'Ocultar opciones',
        'row.showOptions': 'Ver opciones ({n})',
        'row.cancel': 'Cancelar',
        'row.edit': 'Editar búsqueda',
        'row.include': 'Incluir',
        'row.skip': 'Omitir',
        'row.searchedAs': 'Buscado como:',

        'commit.create': 'Crear playlist ({n})',
        'commit.addTo': 'Agregar a playlist ({n})',
        'commit.addMore': 'Agregar {n} más',
        'commit.allAdded': 'Todo agregado',
        'commit.target': 'Playlist: {name}',
        'commit.missing': '{n} sin agregar (omitidas o sin coincidencia)',
        'commit.allMatched': 'Todas las canciones tienen coincidencia',

        'status.error': 'Algo salió mal.',
        'status.loggedOut': 'Sesión de Spotify cerrada.',
        'status.connected': '¡Conectado a Spotify! Pega tu setlist y pulsa Buscar.',
        'status.needText': 'Pega al menos una canción en el setlist.',
        'status.needLogin': 'Conecta tu cuenta de Spotify primero.',
        'status.choosePlaylist': 'Elige la playlist a la que quieres agregar las canciones.',
        'status.searchingN': 'Buscando {n} canciones en Spotify…',
        'status.searchProgress': 'Buscando… {done}/{total}',
        'status.foundSome': '{found} de {total} encontradas con seguridad. Revisa {n} líneas marcadas y crea la playlist.',
        'status.foundSomeOne': '{found} de {total} encontradas con seguridad. Revisa 1 línea marcada y crea la playlist.',
        'status.foundAll': '¡Las {total} canciones encontradas! Revisa si quieres y crea la playlist.',
        'status.nothingChosen': 'No hay canciones elegidas para agregar.',
        'status.noSafeMatches': 'No hubo coincidencias seguras para crear la playlist. Elige las canciones abajo y pulsa Crear.',
        'status.checkingExisting': 'Revisando qué canciones ya están en la playlist…',
        'status.creating': 'Creando la playlist…',
        'status.adding': 'Agregando {n} canciones…',
        'status.copied': 'Copiado.',
        'status.copyPrompt': 'Copia el texto:',
        'status.linkCopied': 'Link copiado. Pégalo en el grupo de la banda: no necesitan cuenta para verlo.',
        'status.setlistCopied': 'Setlist copiado como texto.',
        'status.badShareLink': 'El link del setlist está incompleto o dañado.',
        'status.missingClientId': 'Falta configurar SPOTIFY_CLIENT_ID en el servidor (ver README).',
        'status.textReceived': 'Texto recibido. Revisa y pulsa Buscar.',
        'status.shareNeedsSw': 'Para compartir fotos a SetSnap, abre la app una vez y vuelve a intentarlo.',
        'status.imageReceivedLogin': 'Recibí una imagen. Conecta Spotify para leerla.',
        'status.csvReady': 'CSV descargado. Puedes importarlo en TuneMyMusic o Soundiiz para pasarlo a Deezer, Apple Music, Tidal, Amazon Music o YouTube Music.',

        'ocr.disabled': 'La lectura de fotos no está activada en este servidor.',
        'ocr.needLogin': 'Conecta tu cuenta de Spotify para leer fotos de setlists.',
        'ocr.reading': '✨ Leyendo la imagen…',
        'ocr.noSongs': 'No encontré canciones en la imagen. Prueba con una foto más nítida.',
        'ocr.appendConfirm': '¿Agregar estas canciones al final del texto actual?\n\nAceptar = agregar · Cancelar = reemplazar',
        'ocr.done': 'Se leyeron {n} canciones. Revisa el texto y pulsa Buscar.',
        'ocr.remaining': ' Te quedan {n} lecturas hoy.',
        'ocr.failed': 'No se pudo leer la imagen ({status}).',

        'done.created': 'Playlist creada: “{name}”',
        'done.addedTo': 'Se agregaron {n} canciones a “{name}”',
        'done.inPlaylist': '{n} canciones en la playlist.',
        'done.alreadyThere': '{n} ya estaban y no se repitieron.',
        'done.pending': '{n} de {total} quedan pendientes abajo.',
        'done.open': 'Abrir en Spotify',
        'done.copyTitle': '¿La quieres en tu cuenta para editarla?',
        'done.copyHelp': 'La playlist está en el perfil de SetSnap. Ábrela en Spotify, toca <b>⋯</b> → <b>Agregar a otra playlist</b> → <b>Nueva playlist</b> y tendrás tu propia copia. También puedes darle a <b>Guardar</b> (+) para tenerla en tu biblioteca tal cual.',
        'done.description': 'Creada con SetSnap',

        'yt.none': 'No hay canciones para armar la lista.',
        'yt.searching': 'Buscando los videos en YouTube…',
        'yt.outOfQuota': 'Se acabaron las búsquedas de YouTube de hoy. Las canciones que ya alguien buscó salen al instante; intenta mañana con las demás.',
        'yt.noVideos': 'No encontré videos para estas canciones.',
        'yt.open': 'Abrir en YouTube',
        'yt.part': ' (parte {n})',
        'yt.missing': '{n} de {total} sin video',
        'yt.missingQuota': ' (se acabaron las búsquedas de hoy)',
        'yt.saveHint': 'YouTube la abre como lista sin nombre. Para conservarla, guárdala desde YouTube.',

        'share.title': 'Setlist: {name}',
        'share.label': 'Setlist compartido',
        'share.count': '{n} canciones',
        'share.openPlaylist': 'Abrir playlist',
        'share.copy': 'Copiar texto',
        'share.copied': 'Setlist copiado.',
        'share.youtube': 'Escuchar en YouTube',
        'share.use': 'Usar en SetSnap',
        'share.listen': 'Escuchar en Spotify',
        'share.playlistLine': 'Playlist',

        'spotify.authError': 'Error de autenticación ({status})',
        'spotify.cancelled': 'Cancelaste el inicio de sesión en Spotify.',
        'spotify.badState': 'El inicio de sesión expiró o no es válido. Intenta de nuevo.',
        'spotify.expired': 'Tu sesión de Spotify expiró. Conéctate de nuevo.',
        'spotify.forbidden': 'Spotify rechazó la petición (403). Tu cuenta debe estar agregada en User Management del Dashboard de la app. Mientras tanto puedes salir y usar el modo sin cuenta.',
        'spotify.rateLimited': 'Spotify está limitando las peticiones. Espera un momento e intenta de nuevo.',
        'spotify.error': 'Error de Spotify ({status})',
        'server.error': 'Error del servidor ({status})',

        'playlist.needLogin': 'Es un link de playlist de Spotify. Para cargar sus canciones conecta tu Spotify (solo funciona con playlists tuyas o colaborativas).',
        'playlist.loading': 'Cargando las canciones de la playlist…',
        'playlist.loaded': 'Se cargaron {n} canciones de “{name}”. Revisa y pulsa Buscar.',
        'playlist.forbidden': 'Spotify solo deja leer playlists tuyas o colaborativas. Abre la playlist en Spotify, cópiala a tu cuenta e intenta otra vez.',
        'admin.button': 'Comparar con la precarga',
        'admin.keyPrompt': 'Clave de administrador (ADMIN_KEY):',
        'admin.result': '{added} canciones nuevas agregadas a la precarga; {already} ya estaban.',
        'admin.newOnes': 'Nuevas:',
        'admin.denied': 'Clave de administrador incorrecta.',
        'footer.support': '☕ Apóyanos',
        'version.legend': 'Versión',
        'version.original': 'Original',
        'version.karaoke': 'Karaoke',
        'version.instrumental': 'Instrumental',
        'version.karaokeHelp': 'Busca la versión karaoke de cada canción en Spotify, y en YouTube los videos con letra para cantar.',
        'version.instrumentalHelp': 'Busca la versión instrumental (sin voz) de cada canción, ideal para ensayar o como pista.',
        'version.suffixKaraoke': 'Karaoke',
        'version.suffixInstrumental': 'Instrumental',
        'chords.label': 'Acordes en',
        'chords.choose': 'Elige dónde buscar acordes',
        'chords.none': 'ninguno',
        'chords.title': 'Acordes de esta canción en {site}',
        'theme.system': 'Tema: sistema',
        'theme.light': 'Tema: claro',
        'theme.dark': 'Tema: oscuro',
        'update.ready': 'Hay una versión nueva de SetSnap.',
        'update.reload': 'Actualizar',
    },
    en: {
        'meta.description': 'Paste or snap a photo of a setlist and turn it into a Spotify playlist in seconds.',
        'header.lang': 'Change language',
        'header.theme': 'Change theme (system, light, dark)',
        'header.install': 'Install',
        'header.useMySpotify': 'Use my Spotify',
        'header.connectedAs': 'Signed in as',
        'header.logout': 'Log out',
        'offline': "You're offline. You can type the setlist; searching needs internet.",

        'editor.label': 'Setlist',
        'editor.photo': 'Setlist photo',
        'editor.placeholder': 'Paste the setlist you got here, one song per line.\n\n1. Creep - Radiohead\n2. Radiohead - Karma Police\n3. Amor de mis amores (in G)\n\nSong/artist order, numbering or WhatsApp messages don\'t matter.',
        'editor.drop': 'Drop the image to read the setlist',
        'editor.pasteHint': 'You can also paste a screenshot (Ctrl+V)',
        'editor.example': 'Try an example',
        'editor.clear': 'Clear',
        'editor.shortcut': 'Ctrl + Enter to search',
        'editor.lines': '{n} songs detected',
        'editor.line': '1 song detected',
        'editor.exampleText': '1. Creep - Radiohead\n2) Radiohead - Karma Police\n3. Hotel California / Eagles (in Bm)\n[10:32, 10/24/2026] John: Despacito - Luis Fonsi\n• Stand by Me\nSeptember - Earth, Wind & Fire',

        'dest.legend': 'Destination',
        'dest.new': 'New playlist',
        'dest.existing': 'Add to an existing one',
        'dest.existingNeedsLogin': 'Connect your Spotify to add to your playlists',
        'name.label': 'Name',
        'name.placeholder': "Setlist - today's date",
        'desc.label': 'Description',
        'desc.placeholder': 'Optional',
        'public.label': 'Public playlist',
        'existing.label': 'Playlist',
        'existing.connect': 'Connect Spotify to see your playlists',
        'existing.loading': 'Loading your playlists…',
        'existing.choose': 'Choose a playlist…',
        'existing.none': "You don't have playlists of your own",
        'existing.failed': "Couldn't load them",
        'existing.skip': "Don't repeat songs already in the playlist",

        'mode.legend': 'Mode',
        'mode.review': 'Review (recommended)',
        'mode.auto': 'Create right away',
        'mode.reviewHelp': 'Shows every match so you can confirm it before creating the playlist. The create button stays pinned at the bottom.',
        'mode.autoHelp': 'Adds the confident matches right away. The doubtful ones stay below for you to pick.',
        'search.button': 'Search songs',
        'search.buttonAuto': 'Search and create playlist',
        'search.buttonAutoExisting': 'Search and add',
        'guest.note': "No account needed: the playlist is created on SetSnap's profile and you get the link to save it or copy it to your Spotify.",
        'login.button': 'Connect with Spotify',
        'login.fbNote': 'If you installed the app, log in with your Spotify email: <b>Facebook</b> login may fail inside installed apps.',

        'results.onlyPending': 'Only the ones to review',
        'results.share': 'Share with the band',
        'results.copy': 'Copy as text',
        'results.youtube': 'YouTube list',
        'results.csv': 'Export CSV',
        'results.print': 'Print / PDF',
        'results.reset': 'Start over',
        'results.lines': '{n} lines',
        'results.found': '{n} found',
        'results.toReview': '{n} to review',
        'results.notFound': '{n} not found',
        'results.nonePending': 'Nothing left to review. 🎉',
        'footer': 'Uses the official Spotify API. Not affiliated with Spotify.',

        'badge.skipped': 'Skipped',
        'badge.duplicate': 'Duplicate',
        'badge.added': 'In playlist',
        'badge.found': 'Found',
        'badge.review': 'Review',
        'badge.notFound': 'Not found',
        'row.choose': 'Choose',
        'row.chosen': 'Chosen',
        'row.openSpotify': 'Open in Spotify',
        'row.searching': 'Searching…',
        'row.willSkip': "Won't be added to the playlist.",
        'row.noResults': 'Spotify returned no results. Try editing the search.',
        'row.searchAgain': 'Search again',
        'row.search': 'Search',
        'row.hideOptions': 'Hide options',
        'row.showOptions': 'See options ({n})',
        'row.cancel': 'Cancel',
        'row.edit': 'Edit search',
        'row.include': 'Include',
        'row.skip': 'Skip',
        'row.searchedAs': 'Searched as:',

        'commit.create': 'Create playlist ({n})',
        'commit.addTo': 'Add to playlist ({n})',
        'commit.addMore': 'Add {n} more',
        'commit.allAdded': 'All added',
        'commit.target': 'Playlist: {name}',
        'commit.missing': '{n} not added (skipped or no match)',
        'commit.allMatched': 'Every song has a match',

        'status.error': 'Something went wrong.',
        'status.loggedOut': 'Logged out of Spotify.',
        'status.connected': 'Connected to Spotify! Paste your setlist and hit Search.',
        'status.needText': 'Paste at least one song in the setlist.',
        'status.needLogin': 'Connect your Spotify account first.',
        'status.choosePlaylist': 'Choose the playlist to add the songs to.',
        'status.searchingN': 'Searching {n} songs on Spotify…',
        'status.searchProgress': 'Searching… {done}/{total}',
        'status.foundSome': '{found} of {total} found confidently. Review the {n} marked lines and create the playlist.',
        'status.foundSomeOne': '{found} of {total} found confidently. Review the marked line and create the playlist.',
        'status.foundAll': 'All {total} songs found! Review if you like and create the playlist.',
        'status.nothingChosen': 'No songs chosen to add.',
        'status.noSafeMatches': 'There were no confident matches to create the playlist. Pick the songs below and hit Create.',
        'status.checkingExisting': 'Checking which songs are already in the playlist…',
        'status.creating': 'Creating the playlist…',
        'status.adding': 'Adding {n} songs…',
        'status.copied': 'Copied.',
        'status.copyPrompt': 'Copy the text:',
        'status.linkCopied': "Link copied. Paste it in the band's group: they don't need an account to see it.",
        'status.setlistCopied': 'Setlist copied as text.',
        'status.badShareLink': 'The setlist link is incomplete or broken.',
        'status.missingClientId': 'SPOTIFY_CLIENT_ID is not set up on the server (see README).',
        'status.textReceived': 'Text received. Review it and hit Search.',
        'status.shareNeedsSw': 'To share photos to SetSnap, open the app once and try again.',
        'status.imageReceivedLogin': 'Got an image. Connect Spotify to read it.',
        'status.csvReady': 'CSV downloaded. You can import it into TuneMyMusic or Soundiiz to move it to Deezer, Apple Music, Tidal, Amazon Music or YouTube Music.',

        'ocr.disabled': 'Photo reading is not enabled on this server.',
        'ocr.needLogin': 'Connect your Spotify account to read setlist photos.',
        'ocr.reading': '✨ Reading the image…',
        'ocr.noSongs': "I couldn't find songs in the image. Try a sharper photo.",
        'ocr.appendConfirm': 'Add these songs to the end of the current text?\n\nOK = add · Cancel = replace',
        'ocr.done': 'Read {n} songs. Review the text and hit Search.',
        'ocr.remaining': ' {n} reads left today.',
        'ocr.failed': "Couldn't read the image ({status}).",

        'done.created': 'Playlist created: “{name}”',
        'done.addedTo': 'Added {n} songs to “{name}”',
        'done.inPlaylist': '{n} songs in the playlist.',
        'done.alreadyThere': "{n} were already there and weren't repeated.",
        'done.pending': '{n} of {total} still pending below.',
        'done.open': 'Open in Spotify',
        'done.copyTitle': 'Want it in your own account to edit it?',
        'done.copyHelp': "The playlist lives on SetSnap's profile. Open it in Spotify, tap <b>⋯</b> → <b>Add to other playlist</b> → <b>New playlist</b> and you'll have your own copy. You can also hit <b>Save</b> (+) to keep it in your library as is.",
        'done.description': 'Made with SetSnap',

        'yt.none': 'No songs to build the list.',
        'yt.searching': 'Finding the videos on YouTube…',
        'yt.outOfQuota': "Today's YouTube searches ran out. Songs someone already searched come up instantly; try the rest tomorrow.",
        'yt.noVideos': "I couldn't find videos for these songs.",
        'yt.open': 'Open in YouTube',
        'yt.part': ' (part {n})',
        'yt.missing': '{n} of {total} without video',
        'yt.missingQuota': " (today's searches ran out)",
        'yt.saveHint': 'YouTube opens it as an untitled list. To keep it, save it from YouTube.',

        'share.title': 'Setlist: {name}',
        'share.label': 'Shared setlist',
        'share.count': '{n} songs',
        'share.openPlaylist': 'Open playlist',
        'share.copy': 'Copy text',
        'share.copied': 'Setlist copied.',
        'share.youtube': 'Listen on YouTube',
        'share.use': 'Use in SetSnap',
        'share.listen': 'Listen on Spotify',
        'share.playlistLine': 'Playlist',

        'spotify.authError': 'Authentication error ({status})',
        'spotify.cancelled': 'You cancelled the Spotify login.',
        'spotify.badState': 'The login expired or is invalid. Try again.',
        'spotify.expired': 'Your Spotify session expired. Connect again.',
        'spotify.forbidden': "Spotify rejected the request (403). Your account must be added under User Management in the app's Dashboard. Meanwhile you can log out and use no-account mode.",
        'spotify.rateLimited': 'Spotify is rate limiting requests. Wait a moment and try again.',
        'spotify.error': 'Spotify error ({status})',
        'server.error': 'Server error ({status})',

        'playlist.needLogin': 'That is a Spotify playlist link. Connect your Spotify to load its songs (only works with your own or collaborative playlists).',
        'playlist.loading': 'Loading the playlist songs…',
        'playlist.loaded': 'Loaded {n} songs from “{name}”. Review and hit Search.',
        'playlist.forbidden': 'Spotify only allows reading your own or collaborative playlists. Open it in Spotify, copy it to your account and try again.',
        'admin.button': 'Compare with preload',
        'admin.keyPrompt': 'Admin key (ADMIN_KEY):',
        'admin.result': '{added} new songs added to the preload; {already} were already there.',
        'admin.newOnes': 'New:',
        'admin.denied': 'Wrong admin key.',
        'footer.support': '☕ Support us',
        'version.legend': 'Version',
        'version.original': 'Original',
        'version.karaoke': 'Karaoke',
        'version.instrumental': 'Instrumental',
        'version.karaokeHelp': 'Finds the karaoke version of each song on Spotify, and sing-along lyric videos on YouTube.',
        'version.instrumentalHelp': 'Finds the instrumental (no vocals) version of each song, great for rehearsing or as a backing track.',
        'version.suffixKaraoke': 'Karaoke',
        'version.suffixInstrumental': 'Instrumental',
        'chords.label': 'Chords on',
        'chords.choose': 'Choose where to look for chords',
        'chords.none': 'none',
        'chords.title': 'Chords for this song on {site}',
        'theme.system': 'Theme: system',
        'theme.light': 'Theme: light',
        'theme.dark': 'Theme: dark',
        'update.ready': 'A new version of SetSnap is available.',
        'update.reload': 'Update',
    },
};

const STORAGE_KEY = 'setsnap.lang';
export const LANGS = ['es', 'en'];

function detect() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (LANGS.includes(saved)) return saved;
    } catch {
        // sin almacenamiento
    }
    const nav = (navigator.languages || [navigator.language || 'es'])[0] || 'es';
    return /^en\b/i.test(nav) ? 'en' : 'es';
}

let lang = typeof navigator === 'undefined' ? 'es' : detect();

export function getLang() {
    return lang;
}

export function setLang(next) {
    if (!LANGS.includes(next)) return;
    lang = next;
    try {
        localStorage.setItem(STORAGE_KEY, next);
    } catch {
        // sin almacenamiento
    }
    applyStatic();
}

export function t(key, vars = {}) {
    const text = dict[lang]?.[key] ?? dict.es[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

/** Aplica las traducciones a los elementos con data-i18n*. */
export function applyStatic(root = document) {
    document.documentElement.lang = lang;
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = t('meta.description');
}

/** Para fetch: el servidor responde en el idioma de la app. */
export function langHeaders() {
    return { 'Accept-Language': lang };
}

export const _dict = dict; // para tests
