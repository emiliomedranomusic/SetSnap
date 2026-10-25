/**
 * Utilidades compartidas por las Pages Functions.
 */

const memory = new Map();

/**
 * Workers KV (binding SETSNAP_KV). Si no está configurado se usa memoria,
 * que solo vive mientras dure el isolate: sirve para desarrollo, no para
 * producción.
 */
export function kvStore(env) {
    if (env.SETSNAP_KV) return env.SETSNAP_KV;
    return {
        async get(key) {
            const hit = memory.get(key);
            if (!hit) return null;
            if (hit.expires && hit.expires < Date.now()) {
                memory.delete(key);
                return null;
            }
            return hit.value;
        },
        async put(key, value, opts = {}) {
            memory.set(key, { value, expires: opts.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : 0 });
        },
        async delete(key) {
            memory.delete(key);
        },
    };
}

/** put que no rompe la petición si KV falla (p. ej. límite de escrituras). */
export async function safePut(kv, key, value, opts) {
    try {
        await kv.put(key, value, opts);
    } catch (err) {
        console.warn('[kv] put falló', key, err?.message);
    }
}

export function json(status, body, headers = {}) {
    return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export function clientIp(request) {
    return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Real-IP') || 'unknown';
}

export function today() {
    return new Date().toISOString().slice(0, 10);
}

export const DAY_TTL = 2 * 24 * 60 * 60;

export async function sha256Hex(data) {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(bytes = 24) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Contadores diarios. check() devuelve el nombre del primer límite
 * alcanzado (o null); add() suma a todos.
 * limits: [{ name, key, max }]
 */
export async function dailyLimits(kv, limits) {
    const counts = await Promise.all(limits.map((l) => kv.get(l.key).then((v) => Number(v) || 0)));
    return {
        exceeded: limits.find((l, i) => counts[i] >= l.max)?.name || null,
        remaining: (name) => {
            const i = limits.findIndex((l) => l.name === name);
            return i === -1 ? null : Math.max(0, limits[i].max - counts[i]);
        },
        async add(n = 1) {
            await Promise.all(limits.map((l, i) => safePut(kv, l.key, String(counts[i] + n), { expirationTtl: DAY_TTL })));
        },
    };
}

export function intEnv(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && value !== '' && value != null ? n : fallback;
}

export async function isAdmin(env, key) {
    if (!env.ADMIN_KEY || !key) return false;
    // Comparar hashes evita filtrar la clave por tiempos de respuesta.
    return (await sha256Hex(String(key))) === (await sha256Hex(env.ADMIN_KEY));
}
