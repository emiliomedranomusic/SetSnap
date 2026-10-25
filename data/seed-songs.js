/**
 * Canciones que se precargan en la caché de YouTube con la cuota sobrante
 * de cada día (ver /api/admin/seed y .github/workflows/seed-youtube.yml).
 * Salen del catálogo etiquetado (public/js/catalog.js), que también usa el
 * generador de setlists. Para agregar canciones, agrégalas allí.
 */
import { CATALOG } from '../public/js/catalog.js';

export const SEED_SONGS = CATALOG.map((s) => `${s.title} - ${s.artist}`);
