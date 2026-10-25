/**
 * Precarga de canciones famosas en la caché de YouTube (solo administrador).
 *
 * GET  /api/admin/seed                 → estado (avance, búsquedas que quedan hoy)
 * POST /api/admin/seed                 → procesa el siguiente bloque
 * POST /api/admin/seed {"add":[...]}   → agrega canciones ("Canción - Artista") a la lista
 *
 * Auth: header "Authorization: Bearer ADMIN_KEY". Lo llama cada noche
 * .github/workflows/seed-youtube.yml.
 */
import { json, isAdmin } from '../../../lib/server/common.js';
import { runSeedBatch, seedStatus, addSeedSongs } from '../../../lib/server/seed.js';
import { CentralError } from '../../../lib/server/central.js';

function adminKey(request) {
    const auth = request.headers.get('Authorization') || '';
    return auth.replace(/^Bearer\s+/i, '') || null;
}

export async function onRequestGet({ request, env }) {
    if (!(await isAdmin(env, adminKey(request)))) return json(403, { success: false });
    return json(200, { success: true, ...(await seedStatus(env)) });
}

export async function onRequestPost({ request, env }) {
    if (!(await isAdmin(env, adminKey(request)))) return json(403, { success: false });
    if (!env.YOUTUBE_API_KEY && !env.ODESLI_API_KEY) return json(503, { success: false, message: 'YouTube no está configurado.' });
    const body = await request.json().catch(() => ({}));
    if (Array.isArray(body?.add)) {
        return json(200, { success: true, extra: await addSeedSongs(env, body.add) });
    }
    try {
        return json(200, { success: true, ...(await runSeedBatch(env)) });
    } catch (err) {
        if (err instanceof CentralError) return json(err.status, { success: false, message: err.message });
        console.error('[seed]', err);
        return json(500, { success: false, message: err.message });
    }
}
