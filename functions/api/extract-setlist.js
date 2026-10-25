/**
 * POST /api/extract-setlist  (multipart, campo "image")
 * Header: Authorization: Bearer <token de Spotify del usuario>
 *
 * Solo usuarios con sesión de Spotify válida pueden usar el OCR. Límites
 * diarios por usuario y globales en Workers KV (binding RATE_LIMIT_KV) para
 * que el costo de Gemini tenga techo; imágenes repetidas salen de caché.
 */
import { extractSetlistFromImage } from '../../lib/gemini.js';

const MAX_BYTES = 6 * 1024 * 1024;
const DAY_TTL = 2 * 24 * 60 * 60;
const CACHE_TTL = 30 * 24 * 60 * 60;

// Respaldo si no hay KV configurado: solo vive mientras dure el isolate.
const memory = new Map();

function store(env) {
    const kv = env.RATE_LIMIT_KV;
    if (kv) return kv;
    return {
        async get(key) { return memory.get(key) ?? null; },
        async put(key, value) { memory.set(key, value); },
    };
}

function json(status, body) {
    return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function spotifyUserId(request) {
    const auth = request.headers.get('Authorization') || '';
    if (!/^Bearer\s+\S+/.test(auth)) return null;
    const res = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: auth } });
    if (!res.ok) return null;
    const me = await res.json().catch(() => null);
    return me?.id || null;
}

async function sha256Hex(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost({ request, env }) {
    if (!env.GEMINI_API_KEY) {
        return json(503, { success: false, message: 'El OCR no está configurado (falta GEMINI_API_KEY).' });
    }

    const userId = await spotifyUserId(request);
    if (!userId) return json(401, { success: false, needsLogin: true, message: 'Conecta tu cuenta de Spotify para usar el OCR.' });

    const allowed = (env.ALLOWED_SPOTIFY_USERS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (allowed.length && !allowed.includes(userId)) {
        return json(403, { success: false, message: 'Tu cuenta no tiene acceso al OCR.' });
    }

    let file;
    try {
        file = (await request.formData()).get('image');
    } catch {
        return json(400, { success: false, message: 'Petición inválida.' });
    }
    if (!file || typeof file !== 'object' || !file.size) {
        return json(400, { success: false, message: 'Falta la imagen.' });
    }
    if (file.size > MAX_BYTES) return json(413, { success: false, message: 'La imagen es demasiado grande (máx. 6 MB).' });
    const mimeType = file.type || 'image/jpeg';
    if (!mimeType.startsWith('image/')) return json(415, { success: false, message: 'El archivo debe ser una imagen.' });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const kv = store(env);
    const hash = await sha256Hex(bytes);
    const cacheKey = `ocr:img:${hash}`;

    const cached = await kv.get(cacheKey);
    if (cached) return json(200, { success: true, items: JSON.parse(cached), cached: true });

    const day = new Date().toISOString().slice(0, 10);
    const userKey = `ocr:u:${userId}:${day}`;
    const globalKey = `ocr:g:${day}`;
    const userLimit = Number(env.OCR_USER_DAILY) || 12;
    const globalLimit = Number(env.OCR_GLOBAL_DAILY) || 200;
    const [userCount, globalCount] = (await Promise.all([kv.get(userKey), kv.get(globalKey)])).map((v) => Number(v) || 0);

    if (globalCount >= globalLimit) {
        return json(429, { success: false, message: 'El OCR llegó a su límite diario. Intenta mañana o pega el texto.' });
    }
    if (userCount >= userLimit) {
        return json(429, { success: false, message: `Llegaste a tu límite de ${userLimit} imágenes por día. Intenta mañana o pega el texto.` });
    }

    // Se cuenta antes de llamar: Gemini cobra aunque la respuesta salga mal.
    await Promise.all([
        kv.put(userKey, String(userCount + 1), { expirationTtl: DAY_TTL }),
        kv.put(globalKey, String(globalCount + 1), { expirationTtl: DAY_TTL }),
    ]);

    try {
        const { items, usage, model } = await extractSetlistFromImage(bytes, mimeType, {
            apiKey: env.GEMINI_API_KEY,
            model: env.GEMINI_MODEL || undefined,
        });
        if (usage) console.log('[ocr] tokens', model, JSON.stringify(usage));
        if (items.length) await kv.put(cacheKey, JSON.stringify(items), { expirationTtl: CACHE_TTL });
        return json(200, { success: true, items, remaining: Math.max(0, userLimit - userCount - 1) });
    } catch (err) {
        console.error('[ocr] error', err.message);
        return json(502, { success: false, message: err.message || 'No se pudo procesar la imagen.' });
    }
}
