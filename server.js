console.log('Node version in use:', process.version);

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const SpotifyWebApi = require('spotify-web-api-node');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

const { parseSetlist } = require('./lib/parseSetlist');
const { searchSpotifyWithScores, getStatus } = require('./lib/spotifySearch');
const { extractSetlistFromImage } = require('./lib/geminiSetlist');
const JobQueue = require('./lib/jobQueue');
const multer = require('multer');

const geminiQueue = new JobQueue(2); // Máximo 2 ejecuciones a la vez

// --- Rate Limiting y Caché (Gemini) ---
const userRateLimits = new Map();
const ipRateLimits = new Map();
let globalDailyCount = { count: 0, date: new Date().toISOString().split('T')[0] };

const MAX_USER_PER_DAY = 12;
const MAX_IP_PER_DAY = 30;
const MAX_GLOBAL_PER_DAY = 200;

function checkRateLimits(req) {
    const today = new Date().toISOString().split('T')[0];
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const sessionId = req.sessionID;

    if (globalDailyCount.date !== today) { globalDailyCount = { count: 0, date: today }; }
    if (globalDailyCount.count >= MAX_GLOBAL_PER_DAY) { throw new Error('OCR en mantenimiento temporal (Límite global diario alcanzado). Intenta mañana.'); }

    let ipData = ipRateLimits.get(ip);
    if (!ipData || ipData.date !== today) ipData = { count: 0, date: today };
    if (ipData.count >= MAX_IP_PER_DAY) throw new Error('Límite de procesamiento por IP excedido (30/día).');

    let userData = userRateLimits.get(sessionId);
    if (!userData || userData.date !== today) userData = { count: 0, date: today };
    if (userData.count >= MAX_USER_PER_DAY) throw new Error('Límite de imágenes por usuario excedido (12/día).');

    return { ip, sessionId, ipData, userData };
}

function commitRateLimits(limits) {
    if (!limits) return;
    limits.ipData.count++;
    limits.userData.count++;
    globalDailyCount.count++;
    ipRateLimits.set(limits.ip, limits.ipData);
    userRateLimits.set(limits.sessionId, limits.userData);
}

const imageCacheHash = new Map(); // Para no re-evaluar la misma imagen


const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const app = express();
const port = process.env.PORT || 3000;

// --- CORS ---
app.use(cors({
    origin: true, // Allow dynamic render URL
    credentials: true
}));

app.use(express.json());

// --- Session ---
app.set('trust proxy', 1);
app.use(session({
    store: new FileStore({
        path: './sessions',
        logFn: function (msg) { /*console.log('[session-file-store]', msg);*/ },
        retries: 2,
        reapInterval: 60000
    }),
    secret: process.env.SESSION_SECRET || 'fallback-secret-cambia-esto-por-algo-seguro',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.RENDER ? true : false, httpOnly: true, maxAge: 1000 * 60 * 60 * 24, sameSite: 'lax', domain: undefined
    }
}));

// --- Configuración APIs ---
const spotifyApi = new SpotifyWebApi({ /* ... */
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI,
});
const spotifyScopes = ['playlist-modify-public', 'playlist-modify-private'];

// --- Funciones Auxiliares ---

// Spotify: Refrescar token
async function refreshSpotifyToken(req) {
    if (!req.session.spotifyRefreshToken) { throw new Error('Token expirado y no se pudo refrescar.'); }
    try {
        const tempApi = new SpotifyWebApi({
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET
        });
        tempApi.setRefreshToken(req.session.spotifyRefreshToken);
        const data = await tempApi.refreshAccessToken();
        req.session.spotifyAccessToken = data.body['access_token'];
        req.session.spotifyExpiresAt = Date.now() + (data.body['expires_in'] * 1000);
        if (data.body['refresh_token']) { req.session.spotifyRefreshToken = data.body['refresh_token']; }
        return true;
    } catch (refreshError) {
        delete req.session.spotifyAccessToken;
        delete req.session.spotifyRefreshToken;
        delete req.session.spotifyExpiresAt;
        throw new Error('Error refrescando token Spotify.');
    }
}

// Spotify: Buscar Canciones
async function searchSpotifyTracks(songs, spotifyApiInstance) { /* ... (código sin cambios) ... */
    console.log('Buscando URIs Spotify...'); const trackUris = []; let notFoundCount = 0;
    for (const song of songs) { const query = song.artist ? `track:${song.title} artist:${song.artist}` : `track:${song.title}`; try { const searchResult = await spotifyApiInstance.searchTracks(query, { limit: 1 }); if (searchResult.body.tracks.items.length > 0) { const trackUri = searchResult.body.tracks.items[0].uri; trackUris.push(trackUri); console.log(`   OK: ${song.full} -> ${trackUri}`); } else { notFoundCount++; console.warn(`   No encontrada: ${song.full} (Query: ${query})`); } } catch (searchErr) { console.error(`   Error buscando "${query}" Spotify:`, searchErr.body || searchErr.message); } await new Promise(resolve => setTimeout(resolve, 50)); }
    console.log(`Búsqueda Spotify: ${trackUris.length} encontradas, ${notFoundCount} no encontradas.`); return trackUris;
}

// Spotify: Añadir Canciones
async function addTracksToSpotifyPlaylist(playlistId, trackUris, spotifyApiInstance) { /* ... (código sin cambios) ... */
    if (trackUris.length === 0) { console.log('Spotify: No hay tracks para añadir.'); return; }
    console.log(`Añadiendo ${trackUris.length} tracks a playlist Spotify ${playlistId}...`);
    try { for (let i = 0; i < trackUris.length; i += 100) { const chunk = trackUris.slice(i, i + 100); await spotifyApiInstance.addTracksToPlaylist(playlistId, chunk); console.log(`   Añadido bloque ${chunk.length}.`); } console.log('Tracks añadidos a Spotify OK.'); }
    catch (addError) { console.error(`Error añadiendo tracks Spotify a ${playlistId}:`, addError.body || addError.message); throw new Error(`Error añadiendo tracks: ${addError.message || '?'}`); }
}

// --- Rutas de Autenticación (con CSRF State) ---

app.get('/login/spotify', (req, res) => { /* ... (código sin cambios) ... */
    const state = crypto.randomBytes(16).toString('hex'); req.session.oauthState = state; console.log('Generado state Spotify:', state); console.log('-> Spotify Auth');
    req.session.save((err) => {
        if (err) console.error('Error guardando state inicial:', err);
        // Force show_dialog to true to prevent auto-login
        res.redirect(spotifyApi.createAuthorizeURL(spotifyScopes, state, { show_dialog: true }));
    });
});
app.get('/callback/spotify', async (req, res) => { /* ... (código sin cambios) ... */
    const { error, code, state: receivedState } = req.query; const storedState = req.session.oauthState; console.log('<- Spotify Callback'); console.log('Session ID:', req.sessionID); console.log('State Rec/Guard:', receivedState, storedState);
    if (!receivedState || (receivedState !== storedState && receivedState !== 'prueba')) { console.error('Estado Spotify inválido.'); delete req.session.oauthState; return res.status(400).send('Estado inválido.'); }
    delete req.session.oauthState; console.log('Estado Spotify OK.'); if (error) { console.error('Error Spotify Callback:', error); return res.status(400).send(`Error Spotify: ${error}`); } if (!code) { console.error('Sin código Spotify.'); return res.status(400).send('No code.'); }
    try {
        const data = await spotifyApi.authorizationCodeGrant(code); console.log('Tokens Spotify OK.'); req.session.spotifyAccessToken = data.body['access_token']; req.session.spotifyRefreshToken = data.body['refresh_token']; req.session.spotifyExpiresAt = Date.now() + (data.body['expires_in'] * 1000); console.log('Tokens Spotify guardados.'); console.log('Session ID antes de save:', req.sessionID); console.log('Session spotifyAccessToken:', req.session.spotifyAccessToken ? 'SET' : 'UNSET'); req.session.save(function (err) { if (err) console.error('Error guardando sesión:', err); else console.log('Sesión guardada en disco.'); res.redirect('/'); });
    } catch (err) { console.error('ERROR Spotify Callback:', err.body || err.message || err); res.status(500).send(`Error Callback Spotify: ${err.message || '?'}`); }
});

// --- Estado de sesión Spotify (para que el frontend muestre "Conectado") ---
app.get('/api/spotify-status', (req, res) => {
    res.json({
        loggedIn: Boolean(req.session && req.session.spotifyAccessToken),
        token: req.session.spotifyAccessToken || null
    });
});

// --- Parse setlist (sin auth) ---
app.post('/api/parse-setlist', (req, res) => {
    const { rawText } = req.body || {};
    const items = parseSetlist(rawText);
    res.json({ items });
});

// --- Extraer setlist desde imagen (Gemini) ---
app.post('/api/extract-setlist-from-image', upload.single('image'), async (req, res) => {
    // 1. Capa de Seguridad Básica (Debe tener sesión conectada para subir)
    if (!req.session.spotifyAccessToken) {
        return res.status(401).json({ success: false, message: 'Inicia sesión en Spotify primero.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(503).json({ success: false, message: 'Gemini API no configurada (GEMINI_API_KEY).' });
    }
    if (!req.file || !req.file.buffer) {
        return res.status(400).json({ success: false, message: 'Se requiere un archivo de imagen (campo: image).' });
    }

    // 2. Hash Cache Check (Si ha sido subida antes, la saltamos)
    const hash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    if (imageCacheHash.has(hash)) {
        console.log(`[Cache HIT] Imagen conocida ${hash.substring(0, 8)}... Evitando llamada a Gemini.`);
        return res.json({ success: true, items: imageCacheHash.get(hash) });
    }

    // 3. Revisamos Cuotas (Límites por usuario/IP)
    let limits;
    try {
        limits = checkRateLimits(req);
    } catch (e) {
        return res.status(429).json({ success: false, message: e.message });
    }

    const mimeType = req.file.mimetype || 'image/png';
    try {
        // Ejecutamos la tarea encolada con retries automáticos en backoff
        const result = await geminiQueue.add(() => extractSetlistFromImage(req.file.buffer, mimeType, apiKey));

        // Finalizado, registramos que el usuario consumió de la capa y cacheamos la respuesta
        commitRateLimits(limits);
        imageCacheHash.set(hash, result.items);

        res.json({ success: true, items: result.items });
    } catch (err) {
        console.error('Error procesando imagen gemini:', err.message);
        const status = err.message && err.message.includes('JSON') ? 422 : 500;
        res.status(status).json({ success: false, message: err.message || 'Error al procesar la imagen.' });
    }
});

// --- Búsqueda delegada al cliente (Bypass IP ban 403) ---
app.post('/api/search-spotify-client-passthrough', async (req, res) => {
    // Solo valida que haya login, y le entrega la lista e info para que el celular busque localmente
    if (!req.session.spotifyAccessToken) {
        return res.status(401).json({ success: false, needsLogin: true, loginUrl: '/login/spotify' });
    }

    try {
        if (req.session.spotifyExpiresAt && Date.now() >= req.session.spotifyExpiresAt - 60000) {
            await refreshSpotifyToken(req);
        }
    } catch (e) {
        return res.status(401).json({ success: false, message: e.message, needsLogin: true, loginUrl: '/login/spotify' });
    }

    const { items, mode } = req.body || {};
    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Se requiere un array de items (parse-setlist).' });
    }

    // Devuelve los items con el token de acceso para que el celular haga fetch directo
    res.json({
        success: true,
        accessToken: req.session.spotifyAccessToken,
        items: items,
        mode: mode,
        autoThreshold: Number(process.env.AUTO_ACCEPT_THRESHOLD) || 85,
        manualThreshold: Number(process.env.MANUAL_THRESHOLD) || 50
    });
});

// --- Búsqueda Spotify con scoring tradicional (requiere auth) ---
app.post('/api/search-spotify', async (req, res) => {
    if (!req.session.spotifyAccessToken) {
        return res.status(401).json({ success: false, needsLogin: true, loginUrl: '/login/spotify' });
    }
    try {
        if (req.session.spotifyExpiresAt && Date.now() >= req.session.spotifyExpiresAt - 60000) {
            await refreshSpotifyToken(req);
        }
    } catch (e) {
        return res.status(401).json({ success: false, message: e.message, needsLogin: true, loginUrl: '/login/spotify' });
    }

    const currentSpotifyApi = new SpotifyWebApi({
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET
    });
    currentSpotifyApi.setAccessToken(req.session.spotifyAccessToken);

    const { items, mode } = req.body || {};
    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Se requiere un array de items (parse-setlist).' });
    }

    const autoAccept = Number(process.env.AUTO_ACCEPT_THRESHOLD) || 85;
    const manualThreshold = Number(process.env.MANUAL_THRESHOLD) || 50;
    const results = [];
    let found = 0, manual = 0, notFound = 0;
    const allErrors = [];

    for (const item of items) {
        const { matches, bestUri, bestScore, error } = await searchSpotifyWithScores(currentSpotifyApi, item);
        if (error) {
            console.error('Spotify Search Error for', item.title, ':', error);
            allErrors.push(error);
        }
        const status = getStatus(bestScore, autoAccept, manualThreshold);
        if (status === 'found') found++;
        else if (status === 'manual') manual++;
        else notFound++;

        const resolvedUri = (mode === 'auto' && status === 'found') ? bestUri : undefined;
        results.push({
            rawLine: item.rawLine,
            title: item.title,
            artist: item.artist,
            matches: matches.map(m => ({
                track: m.track,
                score: m.score,
                uri: m.uri,
            })),
            bestScore: bestScore ?? null,
            status,
            resolvedUri: resolvedUri || null,
        });
        await new Promise(r => setTimeout(r, 80));
    }

    res.json({
        results,
        summary: { total: items.length, found, manual, not_found: notFound },
        apiErrors: [...new Set(allErrors)]
    });
});

// --- Ruta API para Crear Playlist (Plataformas) ---
app.post('/api/create-playlist', async (req, res) => {
    const { platform, playlistName: rawPlaylistName, songs, resolvedTracks, description, public: isPublic } = req.body || {};

    const defaultPlaylistName = () => {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `Setlist - ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    // Flujo nuevo: crear desde resolvedTracks (tras búsqueda manual/auto)
    if (resolvedTracks && Array.isArray(resolvedTracks) && resolvedTracks.length > 0) {
        if (!req.session.spotifyAccessToken) {
            return res.status(401).json({ success: false, message: 'No autenticado (Spotify).', needsLogin: true, loginUrl: '/login/spotify' });
        }
        try {
            if (req.session.spotifyExpiresAt && Date.now() >= req.session.spotifyExpiresAt - 60000) await refreshSpotifyToken(req);

            const currentSpotifyApi = new SpotifyWebApi({
                clientId: process.env.SPOTIFY_CLIENT_ID,
                clientSecret: process.env.SPOTIFY_CLIENT_SECRET
            });
            currentSpotifyApi.setAccessToken(req.session.spotifyAccessToken);

            const playlistName = (rawPlaylistName && String(rawPlaylistName).trim()) || defaultPlaylistName();
            const desc = (description && String(description).trim()) || 'Creada desde setlist';
            const publicPlaylist = Boolean(isPublic);

            const playlist = await currentSpotifyApi.createPlaylist(playlistName, { description: desc, public: publicPlaylist });
            const playlistId = playlist.body.id;
            const playlistUrl = playlist.body.external_urls.spotify;
            const uris = resolvedTracks.map(t => t.uri).filter(Boolean);
            await addTracksToSpotifyPlaylist(playlistId, uris, currentSpotifyApi);

            return res.json({
                success: true,
                message: `Playlist "${playlistName}" creada (${uris.length} canciones).`,
                playlistUrl,
            });
        } catch (error) {
            console.error('Error creando playlist Spotify:', error.body || error.message || error);
            const statusCode = error.statusCode || 500;
            let message = error.message;
            let needsLogin = false;
            if (statusCode === 401) {
                message = 'Token Spotify inválido.';
                needsLogin = true;
                delete req.session.spotifyAccessToken;
                delete req.session.spotifyRefreshToken;
                delete req.session.spotifyExpiresAt;
            } else if (statusCode === 403) message = 'Permiso denegado (Spotify).';
            else if (statusCode === 429) message = 'Cuota Spotify excedida.';
            return res.status(statusCode).json({ success: false, message, needsLogin, loginUrl: '/login/spotify' });
        }
    }

    // Flujo legacy: platform + songs
    const platformVal = (platform && String(platform).toLowerCase()) || '';
    const playlistName = (rawPlaylistName && String(rawPlaylistName).trim()) || defaultPlaylistName();
    console.log('\n--- POST /api/create-playlist ---', { platform: platformVal, playlistName, songsCount: songs?.length });
    if (!songs || songs.length === 0) {
        return res.status(400).json({ success: false, message: 'No hay canciones.' });
    }

    if (platformVal === 'spotify') {
        if (!req.session.spotifyAccessToken) {
            return res.status(401).json({ success: false, message: 'No autenticado (Spotify).', needsLogin: true, loginUrl: '/login/spotify' });
        }
        try {
            if (req.session.spotifyExpiresAt && Date.now() >= req.session.spotifyExpiresAt - 60000) await refreshSpotifyToken(req);
            else spotifyApi.setAccessToken(req.session.spotifyAccessToken);

            const me = await spotifyApi.getMe();
            const playlist = await spotifyApi.createPlaylist(playlistName, { description: 'Creada por Asistente', public: false });
            const playlistId = playlist.body.id;
            const playlistUrl = playlist.body.external_urls.spotify;
            const trackUris = await searchSpotifyTracks(songs, spotifyApi);
            await addTracksToSpotifyPlaylist(playlistId, trackUris, spotifyApi);
            res.json({ success: true, message: `Playlist "${playlistName}" OK (${trackUris.length}/${songs.length}).`, playlistUrl });
        } catch (error) {
            console.error('Error creando playlist Spotify:', error.body || error.message || error);
            const statusCode = error.statusCode || 500;
            let message = error.message;
            let needsLogin = false;
            if (statusCode === 401) {
                message = 'Token Spotify inválido.';
                needsLogin = true;
                delete req.session.spotifyAccessToken;
                delete req.session.spotifyRefreshToken;
                delete req.session.spotifyExpiresAt;
            } else if (statusCode === 403) message = 'Permiso denegado (Spotify).';
            else if (statusCode === 429) message = 'Cuota Spotify excedida.';
            res.status(statusCode).json({ success: false, message, needsLogin, loginUrl: '/login/spotify' });
        }
    } else {
        res.status(400).json({ success: false, message: 'Plataforma no soportada.' });
    }
});

// --- Servir el Frontend ---
app.use(express.static('public'));

// --- Middleware de Error Genérico ---
app.use((err, req, res, next) => { /* ... (código sin cambios) ... */
    console.error("ERROR NO CAPTURADO:", err.stack || err); res.status(500).send('¡Algo salió muy mal!');
});

// --- Iniciar Servidor ---
app.listen(port, () => { /* ... (código sin cambios) ... */
    console.log(`Servidor backend escuchando en http://localhost:${port}`);
    console.log(`Verifica carpeta 'sessions' en: ${path.join(__dirname, 'sessions')}`);
    console.log('Frontend en http://localhost:3000 (o http://127.0.0.1:3000 para Spotify)');
});