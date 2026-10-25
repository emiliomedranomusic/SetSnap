/**
 * Extracción de setlist desde imagen con Gemini (API REST, sin SDK, para que
 * funcione igual en Cloudflare Workers y en Node).
 *
 * Para gastar lo menos posible:
 * - modelos Flash-Lite (configurable con GEMINI_MODEL). Si un modelo ya no
 *   existe, está saturado o agotó su cuota (gratis, cada modelo tiene la
 *   suya) se prueba el siguiente de la lista.
 * - "thinking" al mínimo
 * - salida mínima forzada con responseSchema (solo title/artist/note)
 */

export const DEFAULT_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.1-flash-lite-preview', 'gemini-2.5-flash-lite'];
export const DEFAULT_MODEL = DEFAULT_MODELS[0];
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const PROMPT = `Transcribe the setlist (list of songs) in this image. It may be handwritten, printed or a screenshot of a chat.
Return one entry per song, in the same order as the image.
- title: the song title exactly as written (fix obvious OCR typos only).
- artist: the artist if it is written next to the song, otherwise null. Do not guess artists that are not written.
- note: musical annotations written next to the song (key like "G" or "Am", BPM, capo), otherwise null.
Skip headers such as "Setlist", "Set 1", dates, venue names and chat metadata.`;

const RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        items: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    title: { type: 'STRING' },
                    artist: { type: 'STRING', nullable: true },
                    note: { type: 'STRING', nullable: true },
                },
                required: ['title'],
            },
        },
    },
    required: ['items'],
};

export function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

/** Config para apagar el "thinking" (se cobra como salida) según la familia. */
export function thinkingConfigFor(model) {
    if (/^gemini-2\.5/.test(model)) return { thinkingBudget: 0 };
    if (/^gemini-[3-9]/.test(model)) return { thinkingLevel: 'minimal' };
    return null;
}

export function buildGeminiRequest(base64Image, mimeType, model = DEFAULT_MODEL, { thinking = true } = {}) {
    const generationConfig = {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0,
        maxOutputTokens: 4096,
    };
    const thinkingConfig = thinking ? thinkingConfigFor(model) : null;
    if (thinkingConfig) generationConfig.thinkingConfig = thinkingConfig;
    return {
        contents: [{
            parts: [
                { text: PROMPT },
                { inline_data: { mime_type: mimeType || 'image/jpeg', data: base64Image } },
            ],
        }],
        generationConfig,
    };
}

function clean(value) {
    if (value == null) return '';
    const s = String(value).trim();
    return /^(null|undefined|n\/a)$/i.test(s) ? '' : s;
}

/** Convierte la respuesta de Gemini en [{ title, artist, note }]. */
export function parseGeminiResponse(data) {
    const text = (data?.candidates?.[0]?.content?.parts || [])
        .map((p) => p.text || '')
        .join('')
        .trim();
    if (!text) {
        const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason;
        throw new Error(`Gemini no devolvió texto${reason ? ` (${reason})` : ''}.`);
    }
    let parsed;
    try {
        parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    } catch {
        throw new Error('Gemini devolvió una respuesta que no es JSON válido.');
    }
    const items = Array.isArray(parsed) ? parsed : parsed?.items;
    if (!Array.isArray(items)) return [];
    return items
        .map((it) => ({ title: clean(it?.title), artist: clean(it?.artist), note: clean(it?.note) }))
        .filter((it) => it.title);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Llama a un modelo con reintentos. buildBody(thinking) arma el cuerpo y
 * parse(data) interpreta la respuesta.
 */
async function callModel(model, apiKey, fetchFn, buildBody, parse) {
    const url = `${ENDPOINT}/${encodeURIComponent(model)}:generateContent`;
    let thinking = true;
    for (let attempt = 0; ; attempt++) {
        const res = await fetchFn(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify(buildBody(thinking)),
        });
        const data = await res.json().catch(() => null);
        if (res.ok) return { ...parse(data), usage: data?.usageMetadata || null, model };

        const detail = data?.error?.message || '';
        // Un modelo que no acepta la config de "thinking": se reintenta sin ella.
        if (res.status === 400 && thinking && /thinking/i.test(detail)) {
            thinking = false;
            continue;
        }
        if ((res.status === 429 || res.status === 503) && attempt < 1) {
            await sleep(1500);
            continue;
        }
        if (res.status === 404) throw Object.assign(new Error(`El modelo "${model}" no existe o ya no está disponible.`), { tryNext: true });
        if (res.status === 429 || res.status === 503) {
            throw Object.assign(new Error(`El modelo "${model}" está saturado o agotó su cuota.`), { tryNext: true, busy: true });
        }
        throw new Error(`Error de Gemini (${res.status}). ${detail}`.trim());
    }
}

/** Prueba los modelos en orden: si uno no existe, está saturado o agotó su cuota, pasa al siguiente. */
async function withModelFallback({ apiKey, model, fetchFn = fetch }, buildBodyFor, parse) {
    if (!apiKey) throw new Error('Falta GEMINI_API_KEY.');
    const models = model ? [model, ...DEFAULT_MODELS.filter((m) => m !== model)] : DEFAULT_MODELS;
    let anyBusy = false;
    for (const m of models) {
        try {
            return await callModel(m, apiKey, fetchFn, (thinking) => buildBodyFor(m, thinking), parse);
        } catch (err) {
            if (!err.tryNext) throw err;
            anyBusy ||= Boolean(err.busy);
            console.warn(`[gemini] ${err.message} Probando el siguiente modelo.`);
        }
    }
    throw new Error(anyBusy
        ? 'Gemini está saturado o se acabó la cuota de hoy. Intenta en unos minutos o pega el texto.'
        : 'Ningún modelo de Gemini está disponible. Configura GEMINI_MODEL con un modelo vigente.');
}

/**
 * Extrae el setlist de una imagen.
 * @returns {Promise<{ items: Array<{title, artist, note}>, usage: object|null, model: string }>}
 */
export async function extractSetlistFromImage(bytes, mimeType, opts = {}) {
    const base64 = bytesToBase64(bytes);
    return withModelFallback(
        opts,
        (m, thinking) => buildGeminiRequest(base64, mimeType, m, { thinking }),
        (data) => ({ items: parseGeminiResponse(data) })
    );
}

// ---------- Etiquetado de canciones para el generador ----------

export const TAG_GENRES = ['pop', 'rock', 'balada', 'disco', 'jazz', 'salsa', 'cumbia', 'bachata', 'merengue', 'tropical', 'urbano', 'regional', 'bolero', 'country'];

const TAG_PROMPT = `You are a music expert helping live musicians (weddings, parties, restaurants) build setlists.
For each numbered song ("Title - Artist") return one entry with the same index i:
- lang: "es" if the lyrics are mainly in Spanish, otherwise "en".
- genre: the closest of ${TAG_GENRES.join(', ')}. Use "disco" for disco/funk/soul/R&B, "jazz" for jazz standards and crooners, "balada" for slow pop ballads, "regional" for mariachi/ranchera/banda/norteño/corridos, "urbano" for reggaeton/trap/latin urban, "tropical" for vallenato and other tropical styles.
- energy: integer 1-5 for a live event: 1 very calm (ceremony), 2 soft (dinner), 3 medium, 4 danceable, 5 dance-floor peak.
- romantic: true if it fits a wedding ceremony or first dance.
- anthem: true if it is a famous sing-along that works to close the night.
- seasonal: true only for Christmas/holiday songs.`;

const TAG_SCHEMA = {
    type: 'OBJECT',
    properties: {
        items: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    i: { type: 'INTEGER' },
                    lang: { type: 'STRING', enum: ['es', 'en'] },
                    genre: { type: 'STRING', enum: TAG_GENRES },
                    energy: { type: 'INTEGER' },
                    romantic: { type: 'BOOLEAN' },
                    anthem: { type: 'BOOLEAN' },
                    seasonal: { type: 'BOOLEAN' },
                },
                required: ['i', 'lang', 'genre', 'energy'],
            },
        },
    },
    required: ['items'],
};

export function buildTagRequest(songs, model, { thinking = true } = {}) {
    const list = songs.map((s, i) => `${i + 1}. ${s.title}${s.artist ? ` - ${s.artist}` : ''}`).join('\n');
    const generationConfig = { responseMimeType: 'application/json', responseSchema: TAG_SCHEMA, temperature: 0, maxOutputTokens: 8192 };
    const thinkingConfig = thinking ? thinkingConfigFor(model) : null;
    if (thinkingConfig) generationConfig.thinkingConfig = thinkingConfig;
    return { contents: [{ parts: [{ text: `${TAG_PROMPT}\n\nSongs:\n${list}` }] }], generationConfig };
}

/** Respuesta → etiquetas por posición ([{ lang, genre, energy, romantic, anthem, seasonal }|null]). */
export function parseTagResponse(data, count) {
    const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
    let parsed;
    try {
        parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    } catch {
        throw new Error('Gemini devolvió una respuesta que no es JSON válido.');
    }
    const tags = new Array(count).fill(null);
    for (const it of parsed?.items || []) {
        const idx = Number(it?.i) - 1;
        if (!(idx >= 0 && idx < count)) continue;
        const energy = Math.min(5, Math.max(1, Math.round(Number(it.energy) || 3)));
        if (!['es', 'en'].includes(it.lang) || !TAG_GENRES.includes(it.genre)) continue;
        tags[idx] = { lang: it.lang, genre: it.genre, energy, romantic: Boolean(it.romantic), anthem: Boolean(it.anthem), seasonal: Boolean(it.seasonal) };
    }
    return tags;
}

/** Etiqueta hasta ~50 canciones por llamada: songs [{ title, artist }]. */
export async function tagSongs(songs, opts = {}) {
    return withModelFallback(
        opts,
        (m, thinking) => buildTagRequest(songs, m, { thinking }),
        (data) => ({ tags: parseTagResponse(data, songs.length) })
    );
}
