/**
 * GET /api/central/callback — Spotify vuelve aquí tras conectar la cuenta central.
 */
import { ACCOUNTS, API, saveCentralToken } from '../../../lib/server/central.js';
import { kvStore } from '../../../lib/server/common.js';

function page(title, message, ok) {
    const color = ok ? '#15803d' : '#b91c1c';
    return new Response(
        `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SetSnap</title>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5">
<h1 style="color:${color};font-size:1.4rem">${title}</h1><p>${message}</p><p><a href="/">Volver a SetSnap</a></p></body>`,
        { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function onRequestGet({ request, env }) {
    const url = new URL(request.url);
    const error = url.searchParams.get('error');
    if (error) return page('No se conectó', `Spotify respondió: ${esc(error)}`, false);

    const state = url.searchParams.get('state') || '';
    const kv = kvStore(env);
    const verifier = state && (await kv.get(`central:pkce:${state}`));
    if (!verifier) return page('Enlace vencido', 'Vuelve a abrir /api/central/connect?key=… e inténtalo de nuevo.', false);
    await kv.delete(`central:pkce:${state}`);

    const res = await fetch(`${ACCOUNTS}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: url.searchParams.get('code') || '',
            redirect_uri: `${url.origin}/api/central/callback`,
            client_id: env.SPOTIFY_CLIENT_ID,
            code_verifier: verifier,
        }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.refresh_token) {
        return page('No se conectó', `Error al obtener el token: ${esc(data.error_description || data.error || res.status)}`, false);
    }

    let me = null;
    try {
        const meRes = await fetch(`${API}/me`, { headers: { Authorization: `Bearer ${data.access_token}` } });
        if (meRes.ok) me = await meRes.json();
    } catch {
        // El perfil es solo informativo.
    }
    await saveCentralToken(env, data, { userId: me?.id || null, displayName: me?.display_name || null });
    return page('¡Cuenta central conectada!', `Las playlists del modo sin cuenta se crearán en <b>${esc(me?.display_name || me?.id || 'esta cuenta')}</b>.`, true);
}
