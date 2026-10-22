/*
 * Cloudflare Pages Functions: conecta todas las rutas /api/* con la API del juego.
 * La lógica está en src/servidor/api.js (se prueba en Node con «npm test»).
 * Cloudflare exige que esta carpeta se llame «functions» y esté en la raíz del repositorio.
 *
 * Configuración en Cloudflare (ver docs/servidor-compartido.md):
 *   - Enlace D1 llamado «DB» (obligatorio).
 *   - Variable CLAVE_GRUPO (opcional): si existe, crear, modificar o eliminar exige esa clave.
 */
import api from '../../src/servidor/api.js';

export async function onRequest(contexto) {
  return api.manejar(contexto.request, contexto.env);
}
