/* Pruebas del cliente remoto (src/remoto.js) contra el servidor local real. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../db.js');
const N = require('../niveles.js');
const R = require('../remoto.js');
const S = require('../sincronizar.js');
const T = require('../transferencia.js');
const { disponible } = require('../tools/d1-local.js');
const { iniciar } = require('../tools/servidor-local.js');

const opciones = { skip: disponible ? false : 'node:sqlite no está disponible (requiere Node 22.13 o superior)' };
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const w0 = {};
new Function('window', fs.readFileSync(path.join(__dirname, '../data/episodes.js'), 'utf8'))(w0);
const demo = (nombre) => N.desdeMaterialAntiguo(JSON.parse(JSON.stringify(w0.MATERIAL_QUIJOTE)), { nombre: nombre || 'Demo' });

async function jugador(base, clave) {
  return R.crear({ local: await A.abrir({ forzarMemoria: true }), base, clave: () => clave || '' });
}

test('dos personas comparten niveles, imágenes y conflictos', opciones, async (t) => {
  const s = await iniciar({ memoria: true });
  t.after(() => s.cerrar());
  const base = 'http://127.0.0.1:' + s.puerto + '/api/';
  const ana = await jugador(base);
  const beto = await jugador(base);

  // Ana crea un nivel con imagen
  const img = await ana.guardarImagen({ blob: new Blob([PNG], { type: 'image/png' }), tipo: 'image/png' });
  let n = demo('Creado por Ana');
  n.episodios[0].imagen = 'img:' + img;
  n = await ana.guardarNivel(n);
  assert.equal(n.version, 1);

  // Beto lo ve de inmediato, con su imagen
  const deBeto = await beto.listarNiveles();
  assert.deepEqual(deBeto.map((x) => x.nombre), ['Creado por Ana']);
  const reg = await beto.obtenerImagen(img);
  assert.deepEqual(Array.from(new Uint8Array(await reg.blob.arrayBuffer())), Array.from(PNG));
  assert.deepEqual(await beto.idsImagenes(), [img]);
  assert.deepEqual((await beto.resumenNiveles()).map((x) => x.version), [1]);

  // Beto lo edita; Ana, que seguía en la versión 1, recibe un conflicto con la versión de Beto
  const b = Object.assign({}, deBeto[0], { descripcion: 'Editado por Beto' });
  await beto.guardarNivel(b, { versionEsperada: 1 });
  await assert.rejects(
    () => ana.guardarNivel(Object.assign({}, n, { descripcion: 'Editado por Ana' }), { versionEsperada: 1 }),
    (e) => e.codigo === 'conflicto' && e.actual.descripcion === 'Editado por Beto'
  );
  await assert.rejects(() => ana.guardarNivel(n, { soloNuevo: true }), (e) => e.codigo === 'existe');

  // Las partidas quedan en cada navegador
  await ana.guardarPartida({ id: 'p1', estado: {} });
  assert.equal((await ana.listarPartidas()).length, 1);
  assert.equal((await beto.listarPartidas()).length, 0);

  // Eliminar: desaparece para todos
  await beto.eliminarNivel(n.id);
  assert.equal((await ana.listarNiveles()).length, 0);
  assert.equal(await ana.obtenerNivel(n.id), null);

  // Exportar e importar funciona igual con el servidor
  let otro = await ana.guardarNivel(demo('Para exportar'));
  otro.episodios[1].imagen = 'img:' + img;
  otro = await ana.guardarNivel(otro, { versionEsperada: otro.version });
  const exp = await T.exportarNivel(otro, ana);
  assert.equal(exp.imagenes, 1);
  const an = await T.analizar(exp.bytes);
  const listo = await T.prepararNivel(an.niveles[0], an.archivos, beto, { nuevoId: true, nombre: 'Importado por Beto' });
  await beto.guardarNivel(listo, { soloNuevo: true });
  assert.deepEqual((await ana.listarNiveles()).map((x) => x.nombre).sort(), ['Importado por Beto', 'Para exportar']);
});

test('clave del grupo', opciones, async (t) => {
  const s = await iniciar({ memoria: true, clave: 'molinos' });
  t.after(() => s.cerrar());
  const base = 'http://127.0.0.1:' + s.puerto + '/api/';
  const sinClave = await jugador(base);
  const conClave = await jugador(base, 'molinos');
  assert.equal((await sinClave.estado()).requiereClave, true);
  await assert.rejects(() => sinClave.guardarNivel(demo()), (e) => e.codigo === 'clave' && /clave del grupo/.test(e.message));
  await conClave.guardarNivel(demo());
  assert.equal((await sinClave.listarNiveles()).length, 1, 'leer no necesita clave');
});

test('niveles incluidos en el juego se instalan una sola vez en el servidor', opciones, async (t) => {
  const s = await iniciar({ memoria: true });
  t.after(() => s.cerrar());
  const base = 'http://127.0.0.1:' + s.puerto + '/api/';
  const n = demo('Incluido');
  const datos = { huella: 'h1', nivel: n, imagenes: {} };
  const op = (db) => ({ db, indice: [{ id: n.id, nombre: n.nombre, huella: 'h1', archivo: 'niveles/x.js' }], cargarDatos: async () => datos });
  const a = await S.sincronizar(op(await jugador(base)));
  const b = await S.sincronizar(op(await jugador(base)));
  assert.deepEqual(a.instalados, ['Incluido']);
  assert.equal(b.sinCambios, 1);
});

test('detectar el servidor', async () => {
  const resp = (estado, cuerpo, tipo) => async () => new Response(cuerpo, { status: estado, headers: { 'Content-Type': tipo || 'application/json' } });
  assert.ok((await R.detectar({ fetch: resp(200, JSON.stringify({ ok: true, servicio: 'match-quijote' })) })).estado);
  assert.ok((await R.detectar({ host: 'localhost', fetch: resp(404, 'No encontrado', 'text/html') })).sinServidor);
  // Cloudflare sin Functions publicadas: devuelve la página de inicio (200 HTML) → error visible, no modo local silencioso
  const sinFunctions = await R.detectar({ host: 'match-don-quijote.pages.dev', fetch: resp(200, '<!DOCTYPE html><html><title>El match</title></html>', 'text/html') });
  assert.match(sinFunctions.error, /functions\/\) no se publicó/);
  assert.match(sinFunctions.detalle, /página HTML/);
  assert.match((await R.detectar({ host: 'localhost', fetch: resp(200, '<html></html>', 'text/html') })).error, /devuelve una página/);
  // Worker sin la API: 404 en un dominio de Cloudflare → error
  assert.match((await R.detectar({ host: 'match-don-quijote.dpierind.workers.dev', fetch: resp(404, 'Not found', 'text/plain') })).error, /no existe en este sitio/);
  assert.ok((await R.detectar({ protocolo: 'file:' })).sinServidor);
  assert.ok((await R.detectar({ fetch: resp(200, JSON.stringify({ servicio: 'match-quijote', estatico: true }), 'application/octet-stream') })).sinServidor);
  assert.match((await R.detectar({ fetch: resp(500, JSON.stringify({ codigo: 'fallo', mensaje: 'Sin base de datos' })) })).error, /Sin base de datos/);
  assert.ok((await R.detectar({ fetch: async () => { throw new TypeError('red'); } })).error);
  const r = R.crear({ local: null, fetch: async () => { throw new TypeError('red'); } });
  await assert.rejects(() => r.listarNiveles(), (e) => e.codigo === 'sin_conexion');
});
