/**
 * GET /api/catalog → { songs: ["Título|Artista|es|pop|3|rs", ...] }
 * Canciones agregadas por el administrador (desde su playlist) ya
 * etiquetadas, para sumarlas al catálogo del generador.
 */
import { extraCatalog } from '../../lib/server/seed.js';

export async function onRequestGet({ env }) {
    return Response.json(
        { success: true, songs: await extraCatalog(env) },
        { headers: { 'Cache-Control': 'public, max-age=300' } }
    );
}
