'use strict';

/**
 * Extrae líneas de setlist desde una imagen usando Google Gemini.
 * No guarda la imagen; se espera que el caller borre el buffer después.
 *
 * @param {Buffer} imageBuffer - Contenido de la imagen
 * @param {string} mimeType - Ej: 'image/png', 'image/jpeg'
 * @param {string} apiKey - GEMINI_API_KEY
 * @returns {Promise<{ items: Array<{ rawLine: string, title?: string, artist?: string, confidence?: number }> }>}
 */
async function extractSetlistFromImage(imageBuffer, mimeType, apiKey) {
    if (!apiKey) throw new Error('GEMINI_API_KEY is required');
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `You are a strict JSON-only function. Do not output any text outside the JSON.

Input: an image of a setlist (list of songs, possibly handwritten or printed).

Output: a single JSON object with this exact structure:
{
  "items": [
    {
      "rawLine": "exact or best-effort text of this line as it appears",
      "title": "song title or null if unknown",
      "artist": "artist name or null if unknown or unclear",
      "confidence": 0.0
    }
  ]
}

Rules:
- Return ONLY the JSON object. No markdown, no code fences, no explanation.
- One entry per line of the setlist visible in the image. Preserve order.
- If you are not sure about the artist, set "artist": null.
- confidence: optional number between 0 and 1 indicating how confident you are (0 = not sure, 1 = certain).
- If a line is illegible or ambiguous, still include it with rawLine as best guess and title/artist as null if needed. Do not skip lines to preserve order.`;

    const imagePart = {
        inlineData: {
            data: imageBuffer.toString('base64'),
            mimeType: mimeType || 'image/png',
        },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const text = result.response && result.response.text ? result.response.text() : '';
    if (!text || !text.trim()) throw new Error('Gemini returned empty response');

    let parsed;
    try {
        const cleaned = text.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
        parsed = JSON.parse(cleaned);
    } catch (e) {
        console.error('Raw Gemini Response:', text);
        throw new Error('Gemini response was not valid JSON: ' + (e.message || ''));
    }

    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const normalized = items.map((it) => ({
        rawLine: (it.rawLine != null ? String(it.rawLine) : '').trim(),
        title: it.title != null ? String(it.title).trim() : undefined,
        artist: it.artist != null ? String(it.artist).trim() : undefined,
        confidence: typeof it.confidence === 'number' ? it.confidence : undefined,
    }));

    return { items: normalized };
}

module.exports = { extractSetlistFromImage };
