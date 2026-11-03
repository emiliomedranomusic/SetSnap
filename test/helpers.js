/** Utilidades para probar las Pages Functions en Node. */

export function memoryKV() {
    const map = new Map();
    return {
        map,
        async get(k) { return map.has(k) ? map.get(k) : null; },
        async put(k, v) { map.set(k, String(v)); },
        async delete(k) { map.delete(k); },
    };
}

/**
 * Reemplaza globalThis.fetch. routes: [[regex|string, (url, init) => Response]]
 * Devuelve { calls, restore }.
 */
export function mockFetch(routes) {
    const original = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input.url;
        calls.push({ url, init });
        for (const [match, handler] of routes) {
            if (typeof match === 'string' ? url.startsWith(match) : match.test(url)) return handler(url, init);
        }
        throw new Error(`fetch no simulado: ${url}`);
    };
    return { calls, restore: () => { globalThis.fetch = original; } };
}

export function req(url, { method = 'GET', body, headers = {} } = {}) {
    return new Request(url, {
        method,
        headers: { 'CF-Connecting-IP': '1.2.3.4', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
    });
}
