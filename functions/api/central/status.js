/**
 * GET /api/central/status?key=ADMIN_KEY — para el administrador: qué cuenta
 * central está conectada y desde cuándo.
 */
import { readCentralToken, getCentralAccessToken } from '../../../lib/server/central.js';
import { json, isAdmin } from '../../../lib/server/common.js';

export async function onRequestGet({ request, env }) {
    if (!(await isAdmin(env, new URL(request.url).searchParams.get('key')))) return json(403, { success: false });
    const token = await readCentralToken(env);
    if (!token) return json(200, { connected: false });
    let working = true;
    let error = null;
    try {
        await getCentralAccessToken(env);
    } catch (err) {
        working = false;
        error = err.message;
    }
    return json(200, {
        connected: true,
        working,
        error,
        account: token.displayName || token.userId,
        connectedAt: token.connectedAt,
    });
}
