/*
 * Punto de entrada para Cloudflare Workers (proyectos *.workers.dev).
 * - /api/*  → API del juego (src/servidor/api.js), con la base D1 enlazada como «DB».
 * - el resto → archivos del juego publicados en _sitio/ (enlace «ASSETS»).
 * La configuración está en wrangler.jsonc. En proyectos de Cloudflare Pages se usa, en cambio,
 * functions/api/[[ruta]].js; ambos llaman a la misma API.
 */
import api from './api.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return api.manejar(request, env);
    }
    if (!env.ASSETS) return new Response('Falta el enlace «ASSETS» con los archivos del juego (wrangler.jsonc).', { status: 500 });
    return env.ASSETS.fetch(request);
  }
};
