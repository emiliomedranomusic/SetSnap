/**
 * POST /api/central/playlist
 *
 * Crear:   { name, description, uris }              → { id, url, name, editToken }
 * Agregar: { playlistId, editToken, uris }          → { added }
 *
 * La playlist se crea pública en la cuenta central y la persona recibe el
 * link. El editToken (válido 2 días) permite agregar las canciones que
 * quedaron pendientes sin que cualquiera con el link pueda modificarla.
 */
import { centralApi, CentralError } from '../../../lib/server/central.js';
import { kvStore, safePut, json, clientIp, today, sha256Hex, randomToken, dailyLimits, intEnv } from '../../../lib/server/common.js';

const URI_RE = /^spotify:track:[A-Za-z0-9]{22}$/;
const MAX_URIS = 250;
const EDIT_TTL = 2 * 24 * 60 * 60;

function cleanText(s, max) {
    return String(s ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function spotifyError(res) {
    const data = await res.json().catch(() => null);
    console.error('[central] playlist', res.status, data?.error?.message);
    if (res.status === 429) return json(429, { success: false, message: 'Spotify está ocupado. Intenta en unos segundos.' });
    if (res.status === 403) return json(502, { success: false, message: 'Spotify rechazó la petición de la cuenta central (403). Avísale al administrador.' });
    return json(502, { success: false, message: `Spotify respondió ${res.status}.` });
}

async function addItems(env, playlistId, uris) {
    for (let i = 0; i < uris.length; i += 100) {
        const res = await centralApi(env, `/playlists/${encodeURIComponent(playlistId)}/items`, {
            method: 'POST',
            body: { uris: uris.slice(i, i + 100) },
        });
        if (!res.ok) return res;
    }
    return null;
}

export async function onRequestPost({ request, env }) {
    let body;
    try {
        body = await request.json();
    } catch {
        return json(400, { success: false, message: 'Petición inválida.' });
    }
    const uris = Array.isArray(body?.uris) ? [...new Set(body.uris)] : [];
    if (!uris.length || uris.length > MAX_URIS || !uris.every((u) => typeof u === 'string' && URI_RE.test(u))) {
        return json(400, { success: false, message: `Manda entre 1 y ${MAX_URIS} canciones válidas.` });
    }
    const kv = kvStore(env);

    try {
        // --- Agregar a una playlist creada antes en esta misma sesión ---
        if (body.playlistId) {
            const playlistId = String(body.playlistId);
            const stored = await kv.get(`central:edit:${playlistId}`);
            if (!stored || !body.editToken || stored !== (await sha256Hex(String(body.editToken)))) {
                return json(403, { success: false, message: 'Ya no se puede modificar esta playlist. Crea una nueva.' });
            }
            const failed = await addItems(env, playlistId, uris);
            if (failed) return spotifyError(failed);
            return json(200, { success: true, added: uris.length });
        }

        // --- Crear ---
        const day = today();
        const ip = clientIp(request);
        const limits = await dailyLimits(kv, [
            { name: 'ip', key: `central:pl:ip:${ip}:${day}`, max: intEnv(env.CENTRAL_PLAYLISTS_PER_IP, 15) },
            { name: 'global', key: `central:pl:g:${day}`, max: intEnv(env.CENTRAL_PLAYLISTS_DAILY, 300) },
        ]);
        if (limits.exceeded === 'global') {
            return json(429, { success: false, message: 'SetSnap llegó a su límite de playlists por hoy. Conecta tu Spotify o intenta mañana.' });
        }
        if (limits.exceeded) {
            return json(429, { success: false, message: 'Llegaste al límite de playlists por hoy en modo sin cuenta. Intenta mañana.' });
        }

        const name = cleanText(body.name, 100) || `Setlist - ${day}`;
        const userDescription = cleanText(body.description, 200);
        const description = `${userDescription ? `${userDescription} · ` : ''}Creada con SetSnap`.slice(0, 300);

        const created = await centralApi(env, '/me/playlists', {
            method: 'POST',
            body: { name, description, public: true },
        });
        if (!created.ok) return spotifyError(created);
        await limits.add(1);
        const playlist = await created.json();

        const failed = await addItems(env, playlist.id, uris);
        if (failed) return spotifyError(failed);

        const editToken = randomToken(16);
        await safePut(kv, `central:edit:${playlist.id}`, await sha256Hex(editToken), { expirationTtl: EDIT_TTL });
        console.log('[central] playlist creada', playlist.id, uris.length, 'canciones');

        return json(200, {
            success: true,
            id: playlist.id,
            name: playlist.name || name,
            url: playlist.external_urls?.spotify || `https://open.spotify.com/playlist/${playlist.id}`,
            editToken,
            added: uris.length,
        });
    } catch (err) {
        if (err instanceof CentralError) return json(err.status, { success: false, message: err.message });
        throw err;
    }
}
