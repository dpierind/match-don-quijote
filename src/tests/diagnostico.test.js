/* Pruebas de «npm run diagnosticar»: un sitio que funciona y cada configuración incorrecta de Cloudflare. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../servidor/api.js');
const { diagnosticar } = require('../tools/diagnosticar.js');
const { iniciar } = require('../tools/servidor-local.js');
const { disponible, crearD1 } = require('../tools/d1-local.js');

const conSqlite = { skip: disponible ? false : 'node:sqlite no está disponible (requiere Node 22.13 o superior)' };
const INDEX = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

const paso = (r, nombre) => r.pasos.find((p) => p.nombre.startsWith(nombre));

// Simula un sitio: «/» devuelve el juego y «/api/*» lo responde la función indicada.
function sitioFalso(api) {
  return async (url, init) => {
    const u = new URL(url);
    if (!u.pathname.startsWith('/api/')) return new Response(INDEX, { status: 200, headers: { 'Content-Type': 'text/html' } });
    return api(new Request(url, init));
  };
}

test('sitio bien configurado: lectura, escritura, conflicto, imagen y limpieza', conSqlite, async (t) => {
  const s = await iniciar({ memoria: true });
  t.after(() => s.cerrar());
  const r = await diagnosticar('http://127.0.0.1:' + s.puerto, { escribir: true });
  assert.equal(r.ok, true, JSON.stringify(r.pasos.filter((p) => !p.ok)));
  assert.equal(r.resumen.modo, 'compartido');
  assert.equal(r.resumen.requiereClave, false);
  assert.ok(paso(r, 'Otro dispositivo ve el nivel nuevo').ok);
  assert.ok(paso(r, 'Dos personas guardando a la vez').ok);
  // El nivel de prueba se eliminó: no queda nada en el servidor
  const lista = await (await fetch('http://127.0.0.1:' + s.puerto + '/api/niveles')).json();
  assert.equal(lista.niveles.length, 0);
});

test('clave del grupo: correcta, incorrecta y sin clave', conSqlite, async (t) => {
  const s = await iniciar({ memoria: true, clave: 'molinos' });
  t.after(() => s.cerrar());
  const url = 'http://127.0.0.1:' + s.puerto;

  const bien = await diagnosticar(url, { clave: 'molinos', escribir: true });
  assert.equal(bien.ok, true, JSON.stringify(bien.pasos.filter((p) => !p.ok)));
  assert.ok(paso(bien, 'Sin clave, el servidor rechaza').ok);

  const mal = await diagnosticar(url, { clave: 'gigantes', escribir: true });
  assert.equal(mal.ok, false);
  assert.equal(paso(mal, 'La clave indicada es correcta').ok, false);
  assert.match(paso(mal, 'La clave indicada es correcta').arreglo, /no coincide/);
  assert.equal(paso(mal, 'Crear un nivel').ok, false);

  const sin = await diagnosticar(url, { escribir: true });
  assert.equal(paso(sin, 'Prueba de escritura').ok, false);
  assert.match(paso(sin, 'Prueba de escritura').arreglo, /--clave/);
});

test('clave indicada pero el servidor no tiene CLAVE_GRUPO', conSqlite, async (t) => {
  const s = await iniciar({ memoria: true });
  t.after(() => s.cerrar());
  const r = await diagnosticar('http://127.0.0.1:' + s.puerto, { clave: 'molinos' });
  const p = paso(r, 'El servidor conoce la clave');
  assert.equal(p.ok, false);
  assert.match(p.arreglo, /Secret.*Production.*Retry deployment/s);
});

test('Pages sin Functions: api/estado devuelve la página del juego', async () => {
  const r = await diagnosticar('https://match-don-quijote.pages.dev', { fetch: sitioFalso(async () => new Response(INDEX, { status: 200, headers: { 'Content-Type': 'text/html' } })) });
  assert.equal(r.ok, false);
  const p = paso(r, 'La API del juego responde');
  assert.equal(p.ok, false);
  assert.match(p.arreglo, /functions\/ no se publicó/);
  assert.match(r.resumen.modo, /local/);
});

test('proyecto creado como Worker en vez de Pages', async () => {
  const r = await diagnosticar('https://match-don-quijote.dpierind.workers.dev', { fetch: sitioFalso(async () => new Response(INDEX, { status: 200, headers: { 'Content-Type': 'text/html' } })) });
  assert.match(paso(r, 'La API del juego responde').arreglo, /Worker.*wrangler\.jsonc.*npx wrangler deploy/);
  const r404 = await diagnosticar('https://match-don-quijote.dpierind.workers.dev', { fetch: sitioFalso(async () => new Response('Not found', { status: 404 })) });
  assert.match(paso(r404, 'La API del juego responde').arreglo, /Worker/);
});

test('API sin el enlace a la base de datos «DB»', async () => {
  const r = await diagnosticar('https://x.pages.dev', { fetch: sitioFalso((req) => api.manejar(req, {})) });
  const p = paso(r, 'La API del juego responde');
  assert.equal(p.ok, false);
  assert.match(p.arreglo, /enlace D1 con el nombre exacto DB/);
});

test('se publicó src/ sin construir (respuesta estática)', async () => {
  const estatico = fs.readFileSync(path.join(__dirname, '../api/estado'), 'utf8');
  const r = await diagnosticar('https://x.pages.dev', { fetch: sitioFalso(async () => new Response(estatico, { status: 200 })) });
  assert.match(paso(r, 'La API del juego responde').arreglo, /_sitio.*npm run construir/);
});

test('la página no es el juego (directorio de salida equivocado)', async () => {
  const r = await diagnosticar('https://x.pages.dev', {
    fetch: async (url, init) => new URL(url).pathname.startsWith('/api/')
      ? api.manejar(new Request(url, init), { DB: crearD1() })
      : new Response('<html>Hello world</html>', { status: 200, headers: { 'Content-Type': 'text/html' } })
  });
  assert.equal(paso(r, 'La página es el juego').ok, false);
});

test('sitio inalcanzable', async () => {
  const r = await diagnosticar('https://no-existe.pages.dev', { fetch: async () => { throw new TypeError('fetch failed'); } });
  assert.equal(r.ok, false);
  assert.equal(r.pasos.length, 1);
});
