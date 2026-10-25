/**
 * GET /api/central/connect?key=ADMIN_KEY
 * Solo para el administrador: conecta la cuenta de Spotify central.
 * Ábrelo en una ventana de incógnito con la sesión de la cuenta "SetSnap".
 */
import { ACCOUNTS, SCOPES } from '../../../lib/server/central.js';
import { kvStore, randomToken, isAdmin } from '../../../lib/server/common.js';

function base64url(bytes) {
    let str = '';
    bytes.forEach((b) => { str += String.fromCharCode(b); });
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function onRequestGet({ request, env }) {
    const url = new URL(request.url);
    if (!env.SPOTIFY_CLIENT_ID) return new Response('Falta SPOTIFY_CLIENT_ID.', { status: 503 });
    if (!env.ADMIN_KEY) return new Response('Falta configurar ADMIN_KEY.', { status: 503 });
    if (!(await isAdmin(env, url.searchParams.get('key')))) return new Response('No autorizado.', { status: 403 });

    const verifier = randomToken(48);
    const state = randomToken(16);
    const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    await kvStore(env).put(`central:pkce:${state}`, verifier, { expirationTtl: 600 });

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: env.SPOTIFY_CLIENT_ID,
        scope: SCOPES.join(' '),
        redirect_uri: `${url.origin}/api/central/callback`,
        state,
        code_challenge_method: 'S256',
        code_challenge: challenge,
        show_dialog: 'true',
    });
    return Response.redirect(`${ACCOUNTS}/authorize?${params}`, 302);
}
