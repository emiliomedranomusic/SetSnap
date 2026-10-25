import { getAccessToken } from './spotify.js';

const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.85;

/**
 * Reduce la imagen a MAX_SIDE px y la convierte a JPEG. Menos píxeles =
 * menos tokens en Gemini y subida más rápida desde el celular.
 */
export async function shrinkImage(file) {
    let bitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch {
        return file; // Formato que el navegador no decodifica: se manda tal cual.
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.type === 'image/jpeg' && file.size < 1.5 * 1024 * 1024) {
        bitmap.close?.();
        return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    return blob || file;
}

/**
 * Manda la imagen a la función /api/extract-setlist y devuelve las líneas
 * como texto "Canción - Artista (nota)".
 */
export async function extractSetlistText(file) {
    const token = await getAccessToken();
    const image = await shrinkImage(file);
    const form = new FormData();
    form.append('image', image, 'setlist.jpg');

    const res = await fetch('/api/extract-setlist', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
        throw new Error(data.message || `No se pudo leer la imagen (${res.status}).`);
    }
    const lines = (data.items || [])
        .map((it) => {
            let line = it.title || '';
            if (!line) return '';
            if (it.artist) line += ` - ${it.artist}`;
            if (it.note) line += ` (${it.note})`;
            return line;
        })
        .filter(Boolean);
    return { lines, remaining: data.remaining };
}
