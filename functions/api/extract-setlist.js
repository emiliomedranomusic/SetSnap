/**
 * POST /api/extract-setlist  (multipart, campo "image")
 * Header opcional: Authorization: Bearer <token de Spotify del usuario>
 *
 * Con sesión de Spotify: límite diario por usuario. Sin sesión (modo sin
 * cuenta): límite diario por IP, más bajo. Además hay un tope global para
 * que el costo de Gemini tenga techo; imágenes repetidas salen de caché.
 */
import { extractSetlistFromImage } from '../../lib/gemini.js';
import { kvStore, safePut, json, clientIp, today, sha256Hex, dailyLimits, intEnv, tr } from '../../lib/server/common.js';

const MAX_BYTES = 6 * 1024 * 1024;
const CACHE_TTL = 30 * 24 * 60 * 60;

async function spotifyUserId(request) {
    const auth = request.headers.get('Authorization') || '';
    if (!/^Bearer\s+\S+/.test(auth)) return null;
    const res = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: auth } });
    if (!res.ok) return null;
    const me = await res.json().catch(() => null);
    return me?.id || null;
}

export async function onRequestPost({ request, env }) {
    if (!env.GEMINI_API_KEY) {
        return json(503, { success: false, message: tr(request, 'La lectura de fotos no está configurada (falta GEMINI_API_KEY).', 'Photo reading is not set up (missing GEMINI_API_KEY).') });
    }

    const userId = await spotifyUserId(request);
    const guestsAllowed = env.OCR_GUESTS !== '0';
    if (!userId && !guestsAllowed) {
        return json(401, { success: false, needsLogin: true, message: tr(request, 'Conecta tu cuenta de Spotify para leer fotos.', 'Connect your Spotify account to read photos.') });
    }
    const allowed = (env.ALLOWED_SPOTIFY_USERS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (userId && allowed.length && !allowed.includes(userId)) {
        return json(403, { success: false, message: tr(request, 'Tu cuenta no tiene acceso a la lectura de fotos.', "Your account doesn't have access to photo reading.") });
    }

    let file;
    try {
        file = (await request.formData()).get('image');
    } catch {
        return json(400, { success: false, message: tr(request, 'Petición inválida.', 'Invalid request.') });
    }
    if (!file || typeof file !== 'object' || !file.size) {
        return json(400, { success: false, message: tr(request, 'Falta la imagen.', 'Missing image.') });
    }
    if (file.size > MAX_BYTES) return json(413, { success: false, message: tr(request, 'La imagen es demasiado grande (máx. 6 MB).', 'The image is too large (max 6 MB).') });
    const mimeType = file.type || 'image/jpeg';
    if (!mimeType.startsWith('image/')) return json(415, { success: false, message: tr(request, 'El archivo debe ser una imagen.', 'The file must be an image.') });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const kv = kvStore(env);
    const cacheKey = `ocr:img:${await sha256Hex(bytes)}`;
    const cached = await kv.get(cacheKey);
    if (cached) return json(200, { success: true, items: JSON.parse(cached), cached: true });

    const day = today();
    const personal = userId
        ? { name: 'person', key: `ocr:u:${userId}:${day}`, max: intEnv(env.OCR_USER_DAILY, 12) }
        : { name: 'person', key: `ocr:ip:${clientIp(request)}:${day}`, max: intEnv(env.OCR_GUEST_DAILY, 5) };
    const limits = await dailyLimits(kv, [
        personal,
        { name: 'global', key: `ocr:g:${day}`, max: intEnv(env.OCR_GLOBAL_DAILY, 200) },
    ]);
    if (limits.exceeded === 'global') {
        return json(429, { success: false, message: tr(request, 'La lectura de fotos llegó a su límite diario. Intenta mañana o pega el texto.', 'Photo reading reached its daily limit. Try tomorrow or paste the text.') });
    }
    if (limits.exceeded) {
        return json(429, { success: false, message: tr(request, `Llegaste a tu límite de ${personal.max} fotos por día. Intenta mañana o pega el texto.`, `You reached your limit of ${personal.max} photos per day. Try tomorrow or paste the text.`) });
    }

    // Se cuenta antes de llamar: Gemini cobra aunque la respuesta salga mal.
    await limits.add(1);

    try {
        const { items, usage, model } = await extractSetlistFromImage(bytes, mimeType, {
            apiKey: env.GEMINI_API_KEY,
            model: env.GEMINI_MODEL || undefined,
        });
        if (usage) console.log('[ocr] tokens', model, JSON.stringify(usage));
        if (items.length) await safePut(kv, cacheKey, JSON.stringify(items), { expirationTtl: CACHE_TTL });
        return json(200, { success: true, items, remaining: Math.max(0, limits.remaining('person') - 1) });
    } catch (err) {
        console.error('[ocr] error', err.message);
        return json(502, { success: false, message: tr(request, err.message || 'No se pudo procesar la imagen.', "Couldn't read the image. Try a sharper photo or paste the text.") });
    }
}
