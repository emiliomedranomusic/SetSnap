/**
 * Extracción de setlist desde imagen con Gemini (API REST, sin SDK, para que
 * funcione igual en Cloudflare Workers y en Node).
 *
 * Para gastar lo menos posible:
 * - modelos Flash-Lite (configurable con GEMINI_MODEL; si un modelo ya no
 *   existe se prueba el siguiente de la lista)
 * - "thinking" al mínimo
 * - salida mínima forzada con responseSchema (solo title/artist/note)
 */

export const DEFAULT_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.1-flash-lite-preview', 'gemini-2.5-flash-lite'];
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

async function callModel(base64, mimeType, model, apiKey, fetchFn) {
    const url = `${ENDPOINT}/${encodeURIComponent(model)}:generateContent`;
    let thinking = true;
    for (let attempt = 0; ; attempt++) {
        const res = await fetchFn(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify(buildGeminiRequest(base64, mimeType, model, { thinking })),
        });
        const data = await res.json().catch(() => null);
        if (res.ok) return { items: parseGeminiResponse(data), usage: data?.usageMetadata || null, model };

        const detail = data?.error?.message || '';
        // Un modelo que no acepta la config de "thinking": se reintenta sin ella.
        if (res.status === 400 && thinking && /thinking/i.test(detail)) {
            thinking = false;
            continue;
        }
        if ((res.status === 429 || res.status === 503) && attempt < 2) {
            await sleep(1500 * 2 ** attempt);
            continue;
        }
        if (res.status === 404) throw Object.assign(new Error(`El modelo "${model}" no existe o ya no está disponible.`), { modelMissing: true });
        if (res.status === 429) throw new Error('Gemini está saturado o se acabó la cuota. Intenta en unos minutos.');
        throw new Error(`Error de Gemini (${res.status}). ${detail}`.trim());
    }
}

/**
 * Extrae el setlist probando los modelos en orden (si uno ya no existe,
 * pasa al siguiente). Reintenta ante 429/503.
 * @returns {Promise<{ items: Array<{title, artist, note}>, usage: object|null, model: string }>}
 */
export async function extractSetlistFromImage(bytes, mimeType, { apiKey, model, fetchFn = fetch } = {}) {
    if (!apiKey) throw new Error('Falta GEMINI_API_KEY.');
    const models = model ? [model, ...DEFAULT_MODELS.filter((m) => m !== model)] : DEFAULT_MODELS;
    const base64 = bytesToBase64(bytes);
    for (const m of models) {
        try {
            return await callModel(base64, mimeType, m, apiKey, fetchFn);
        } catch (err) {
            if (!err.modelMissing) throw err;
            console.warn(`[gemini] ${err.message} Probando el siguiente modelo.`);
        }
    }
    throw new Error('Ningún modelo de Gemini está disponible. Configura GEMINI_MODEL con un modelo vigente.');
}
