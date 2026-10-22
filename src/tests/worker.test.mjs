/* Pruebas del punto de entrada de Cloudflare Workers (src/servidor/worker.mjs). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import worker from '../servidor/worker.mjs';

const require = createRequire(import.meta.url);
const { crearD1, disponible } = require('../tools/d1-local.js');
const opciones = { skip: disponible ? false : 'node:sqlite no está disponible (requiere Node 22.13 o superior)' };

const ASSETS = { fetch: async (req) => new Response('archivo ' + new URL(req.url).pathname, { status: 200 }) };

test('el Worker envía /api/* a la API y el resto a los archivos del juego', opciones, async () => {
  const env = { DB: crearD1(), ASSETS };
  const estado = await worker.fetch(new Request('https://x.workers.dev/api/estado'), env);
  assert.equal((await estado.json()).servicio, 'match-quijote');
  const pagina = await worker.fetch(new Request('https://x.workers.dev/index.html'), env);
  assert.equal(await pagina.text(), 'archivo /index.html');
  const guardado = await worker.fetch(new Request('https://x.workers.dev/api/niveles/n1', { method: 'PUT', body: JSON.stringify({ nivel: { id: 'n1', nombre: 'Desde el Worker' } }) }), env);
  assert.equal((await guardado.json()).version, 1);
  const lista = await (await worker.fetch(new Request('https://x.workers.dev/api/niveles?resumen=1'), env)).json();
  assert.deepEqual(lista.niveles.map((n) => n.nombre), ['Desde el Worker']);
});

test('el Worker con clave del grupo', opciones, async () => {
  const env = { DB: crearD1(), ASSETS, CLAVE_GRUPO: 'molinos' };
  const sin = await worker.fetch(new Request('https://x.workers.dev/api/niveles/n1', { method: 'PUT', body: JSON.stringify({ nivel: { id: 'n1' } }) }), env);
  assert.equal(sin.status, 401);
  const con = await worker.fetch(new Request('https://x.workers.dev/api/niveles/n1', { method: 'PUT', headers: { 'X-Clave-Grupo': 'molinos' }, body: JSON.stringify({ nivel: { id: 'n1' } }) }), env);
  assert.equal(con.status, 200);
});

test('mensajes claros si falta un enlace', async () => {
  const sinDb = await worker.fetch(new Request('https://x.workers.dev/api/estado'), { ASSETS });
  assert.match((await sinDb.json()).mensaje, /enlace «DB»/);
  const sinAssets = await worker.fetch(new Request('https://x.workers.dev/'), {});
  assert.match(await sinAssets.text(), /ASSETS/);
});
