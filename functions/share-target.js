/**
 * Respaldo del "Compartir → SetSnap" (Web Share Target). Normalmente el
 * service worker atiende este POST; si todavía no está activo, al menos
 * rescatamos el texto compartido.
 */
export async function onRequestPost({ request }) {
    let text = '';
    let hadFile = false;
    try {
        const form = await request.formData();
        text = ['title', 'text', 'url'].map((k) => form.get(k)).filter((v) => typeof v === 'string' && v.trim()).join('\n');
        hadFile = form.getAll('image').some((f) => typeof f === 'object' && f && f.size > 0);
    } catch {
        // Cuerpo inválido: solo redirigimos al inicio.
    }
    const params = new URLSearchParams();
    if (text) params.set('text', text.slice(0, 8000));
    if (hadFile) params.set('shared', 'nosw');
    const query = params.toString();
    return Response.redirect(new URL(`/${query ? `?${query}` : ''}`, request.url), 303);
}

export function onRequestGet({ request }) {
    return Response.redirect(new URL('/', request.url), 303);
}
