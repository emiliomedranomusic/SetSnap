/**
 * GET /api/admin/health?key=ADMIN_KEY
 * Diagnóstico para el administrador: prueba en vivo cada integración y
 * muestra ✅ / ⚠️ / ❌ con el detalle. Útil justo después de desplegar.
 */
import { kvStore, isAdmin } from '../../../lib/server/common.js';
import { readCentralToken, getCentralAccessToken, centralApi } from '../../../lib/server/central.js';
import { DEFAULT_MODELS } from '../../../lib/gemini.js';
import { parseRecco, parseGetSongBpm } from '../../../lib/server/features.js';
import { seedStatus } from '../../../lib/server/seed.js';

const SAMPLE_SPOTIFY_ID = '3n3Ppam7vgaVa1iaRUc9Lp'; // Mr. Brightside - The Killers
const SAMPLE_VIDEO_ID = 'dQw4w9WgXcQ';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function check(name, fn) {
    try {
        const r = await fn();
        return { name, ...r };
    } catch (err) {
        return { name, status: 'error', detail: `No se pudo conectar o falló la prueba: ${err.message}` };
    }
}

const ok = (detail) => ({ status: 'ok', detail });
const warn = (detail) => ({ status: 'warn', detail });
const fail = (detail) => ({ status: 'error', detail });

export async function runChecks(env) {
    return Promise.all([
        check('Almacenamiento (KV: SETSNAP_KV)', async () => {
            if (!env.SETSNAP_KV) return fail('No está el binding SETSNAP_KV: los límites, la cuenta central y las cachés no se guardan.');
            await env.SETSNAP_KV.put('health:ping', String(Date.now()), { expirationTtl: 60 });
            return (await env.SETSNAP_KV.get('health:ping')) ? ok('Lee y escribe bien.') : fail('Escribió pero no pudo leer.');
        }),
        check('Spotify: Client ID', async () => (env.SPOTIFY_CLIENT_ID ? ok('Configurado.') : fail('Falta SPOTIFY_CLIENT_ID.'))),
        check('Spotify: cuenta central (modo sin cuenta)', async () => {
            const token = await readCentralToken(env);
            if (!token) return warn('No conectada. Abre /api/central/connect?key=… con la cuenta central.');
            await getCentralAccessToken(env);
            const res = await centralApi(env, `/search?${new URLSearchParams({ q: 'Mr. Brightside The Killers', type: 'track', limit: '1' })}`);
            if (res.ok) return ok(`Conectada (${token.displayName || token.userId || 'cuenta central'}) y buscando bien.`);
            if (res.status === 403) return fail('Spotify respondió 403: agrega la cuenta central en User Management del Dashboard.');
            return warn(`Conectada, pero Spotify respondió ${res.status} a una consulta de prueba.`);
        }),
        check('Gemini (fotos y etiquetas)', async () => {
            if (!env.GEMINI_API_KEY) return warn('Sin GEMINI_API_KEY: no habrá lectura de fotos ni etiquetado de tus canciones.');
            const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': env.GEMINI_API_KEY } });
            if (!res.ok) return fail(`La llave no funciona (${res.status}).`);
            const names = ((await res.json()).models || []).map((m) => m.name?.replace(/^models\//, ''));
            const wanted = env.GEMINI_MODEL ? [env.GEMINI_MODEL, ...DEFAULT_MODELS] : DEFAULT_MODELS;
            const available = wanted.filter((m) => names.includes(m));
            return available.length
                ? ok(`Llave válida. Modelos disponibles: ${available.join(', ')}.`)
                : fail(`Llave válida, pero ninguno de estos modelos existe: ${wanted.join(', ')}. Pon GEMINI_MODEL con uno vigente.`);
        }),
        check('YouTube (lista sin login)', async () => {
            if (!env.YOUTUBE_API_KEY && !env.ODESLI_API_KEY) return warn('Sin YOUTUBE_API_KEY: el botón "Lista en YouTube" no aparece.');
            if (!env.YOUTUBE_API_KEY) return ok('Solo con Odesli.');
            const params = new URLSearchParams({ part: 'id', id: SAMPLE_VIDEO_ID, key: env.YOUTUBE_API_KEY });
            const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
            if (res.ok) return ok('Llave válida (la prueba gastó 1 unidad de cuota).');
            const data = await res.json().catch(() => null);
            return fail(`YouTube respondió ${res.status}: ${data?.error?.message || 'revisa que la API "YouTube Data API v3" esté habilitada y la llave restringida a ella.'}`);
        }),
        check('BPM y tonalidad: ReccoBeats', async () => {
            const res = await fetch(`https://api.reccobeats.com/v1/audio-features?ids=${SAMPLE_SPOTIFY_ID}`, { headers: { Accept: 'application/json' } });
            if (!res.ok) return fail(`ReccoBeats respondió ${res.status}.`);
            const data = await res.json().catch(() => null);
            const f = parseRecco(data).get(SAMPLE_SPOTIFY_ID);
            return f
                ? ok(`Responde bien: "Mr. Brightside" → ${f.key || '¿?'} · ${f.bpm || '¿?'} BPM.`)
                : warn(`Responde, pero no se pudo leer el resultado de prueba. Respuesta: ${JSON.stringify(data).slice(0, 300)}`);
        }),
        check('BPM y tonalidad: GetSongBPM (respaldo)', async () => {
            if (!env.GETSONGBPM_API_KEY) return warn('Sin GETSONGBPM_API_KEY (opcional): solo se usa ReccoBeats.');
            const params = new URLSearchParams({ api_key: env.GETSONGBPM_API_KEY, type: 'both', lookup: 'song:Creep artist:Radiohead', limit: '5' });
            const res = await fetch(`https://api.getsong.co/search/?${params}`, { headers: { Accept: 'application/json' } });
            if (!res.ok) return fail(`GetSongBPM respondió ${res.status} (¿llave activada?).`);
            const data = await res.json().catch(() => null);
            const f = parseGetSongBpm(data, { title: 'Creep', artist: 'Radiohead' });
            if (f?.bpm && f?.key) return ok(`Responde bien: "Creep" → ${f.key} · ${f.bpm} BPM.`);
            if (f?.bpm) return warn(`Da BPM (${f.bpm}) pero no tonalidad en la búsqueda. Avísale a quien mantiene SetSnap. Respuesta: ${JSON.stringify(data).slice(0, 300)}`);
            return warn(`Responde, pero no se pudo leer el resultado de prueba. Respuesta: ${JSON.stringify(data).slice(0, 300)}`);
        }),
        check('Precarga de YouTube y catálogo', async () => {
            const s = await seedStatus(env);
            return ok(`Precarga: ${s.cursor} de ${s.total} canciones procesadas. Búsquedas de YouTube que quedan hoy: ${s.searchesLeft}. Canciones tuyas etiquetadas para el generador: ${s.tagged}.`);
        }),
        check('Botón "Apóyanos"', async () => (env.SUPPORT_URL ? ok(env.SUPPORT_URL) : warn('Sin SUPPORT_URL (opcional).'))),
    ]);
}

export async function onRequestGet({ request, env }) {
    const url = new URL(request.url);
    if (!(await isAdmin(env, url.searchParams.get('key')))) return new Response('No autorizado.', { status: 403 });
    const checks = await runChecks(env);
    if (url.searchParams.get('format') === 'json') return Response.json({ checks }, { headers: { 'Cache-Control': 'no-store' } });
    const icon = { ok: '✅', warn: '⚠️', error: '❌' };
    const rows = checks.map((c) => `<li><span>${icon[c.status]}</span><div><b>${esc(c.name)}</b><br><small>${esc(c.detail)}</small></div></li>`).join('');
    return new Response(
        `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SetSnap · Diagnóstico</title>
<style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;line-height:1.4;color:#0f172a}ul{list-style:none;padding:0}li{display:flex;gap:.75rem;padding:.75rem 0;border-bottom:1px solid #e2e8f0}small{color:#475569}</style>
<h1>Diagnóstico de SetSnap</h1><ul>${rows}</ul><p><small>✅ funciona · ⚠️ opcional o por revisar · ❌ hay que corregirlo</small></p>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
}
