/* Pruebas de la API del servidor compartido (src/servidor/api.js) sobre SQLite local. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../servidor/api.js');
const N = require('../niveles.js');
const { crearD1, disponible } = require('../tools/d1-local.js');

const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const w0 = {};
new Function('window', fs.readFileSync(path.join(__dirname, '../data/episodes.js'), 'utf8'))(w0);
const demo = () => N.desdeMaterialAntiguo(JSON.parse(JSON.stringify(w0.MATERIAL_QUIJOTE)), { nombre: 'Demo' });

const opciones = { skip: disponible ? false : 'node:sqlite no está disponible (requiere Node 22.13 o superior)' };

function servidor(env) {
  env = Object.assign({ DB: crearD1() }, env || {});
  return async function pedir(metodo, ruta, cuerpo, cabeceras) {
    const init = { method: metodo, headers: Object.assign({}, cabeceras || {}) };
    if (cuerpo instanceof Uint8Array) init.body = cuerpo;
    else if (cuerpo !== undefined) { init.body = JSON.stringify(cuerpo); init.headers['Content-Type'] = 'application/json'; }
    const r = await api.manejar(new Request('http://localhost/api/' + ruta, init), env);
    const tipo = r.headers.get('Content-Type') || '';
    return { estado: r.status, datos: tipo.includes('json') ? await r.json() : new Uint8Array(await r.arrayBuffer()), r };
  };
}

test('estado del servicio', opciones, async () => {
  const pedir = servidor();
  const r = await pedir('GET', 'estado');
  assert.equal(r.estado, 200);
  assert.equal(r.datos.servicio, 'match-quijote');
  assert.equal(r.datos.requiereClave, false);
});

test('crear, listar, obtener, actualizar con versión y eliminar', opciones, async () => {
  const pedir = servidor();
  const n = demo();
  let r = await pedir('PUT', 'niveles/' + n.id, { nivel: n, soloNuevo: true });
  assert.equal(r.estado, 200);
  assert.equal(r.datos.version, 1);
  assert.ok(r.datos.modificado);
  const v1 = r.datos;

  r = await pedir('GET', 'niveles');
  assert.equal(r.datos.niveles.length, 1);
  assert.equal(r.datos.niveles[0].episodios.length, 12);
  r = await pedir('GET', 'niveles?resumen=1');
  assert.deepEqual(Object.keys(r.datos.niveles[0]).sort(), ['id', 'modificado', 'nombre', 'version']);

  // Otra persona guarda primero (versión 1 → 2).
  r = await pedir('PUT', 'niveles/' + n.id, { nivel: Object.assign({}, v1, { nombre: 'Cambiado por B' }), versionEsperada: 1 });
  assert.equal(r.estado, 200);
  assert.equal(r.datos.version, 2);
  // Quien seguía en la versión 1 recibe un conflicto con la versión actual.
  r = await pedir('PUT', 'niveles/' + n.id, { nivel: Object.assign({}, v1, { nombre: 'Cambiado por A' }), versionEsperada: 1 });
  assert.equal(r.estado, 409);
  assert.equal(r.datos.codigo, 'conflicto');
  assert.equal(r.datos.actual.nombre, 'Cambiado por B');
  // soloNuevo sobre un nivel existente
  r = await pedir('PUT', 'niveles/' + n.id, { nivel: n, soloNuevo: true });
  assert.equal(r.datos.codigo, 'existe');

  r = await pedir('DELETE', 'niveles/' + n.id);
  assert.equal(r.estado, 200);
  assert.equal((await pedir('GET', 'niveles')).datos.niveles.length, 0);
  assert.equal((await pedir('GET', 'niveles/' + n.id)).estado, 404);
  // Guardar con la versión de antes de eliminarlo: conflicto «eliminado».
  r = await pedir('PUT', 'niveles/' + n.id, { nivel: v1, versionEsperada: 2 });
  assert.equal(r.estado, 409);
  assert.equal(r.datos.actual, null);
  // Se puede volver a crear con el mismo identificador.
  r = await pedir('PUT', 'niveles/' + n.id, { nivel: n, soloNuevo: true });
  assert.equal(r.estado, 200);
  assert.equal(r.datos.version, 4);
});

test('el historial conserva versiones anteriores', opciones, async () => {
  const env = { DB: crearD1() };
  const pedir = servidor(env);
  const n = demo();
  let v = (await pedir('PUT', 'niveles/' + n.id, { nivel: n })).datos;
  v = (await pedir('PUT', 'niveles/' + n.id, { nivel: Object.assign({}, v, { nombre: 'Segunda' }), versionEsperada: v.version })).datos;
  const h = await env.DB.prepare('SELECT version, contenido FROM historial WHERE id = ? ORDER BY version').bind(n.id).all();
  assert.deepEqual(h.results.map((f) => f.version), [1, 2]);
  assert.equal(JSON.parse(h.results[0].contenido).nombre, 'Demo');
});

test('imágenes: subir, deduplicar, obtener y validar', opciones, async () => {
  const pedir = servidor();
  let r = await pedir('POST', 'imagenes', PNG, { 'Content-Type': 'image/png' });
  assert.equal(r.estado, 201);
  const id = r.datos.id;
  assert.match(id, /^h[0-9a-f]{32}$/);
  r = await pedir('POST', 'imagenes', PNG, { 'Content-Type': 'image/png' });
  assert.equal(r.datos.id, id, 'la misma imagen tiene el mismo identificador');
  r = await pedir('GET', 'imagenes/' + id);
  assert.equal(r.r.headers.get('Content-Type'), 'image/png');
  assert.match(r.r.headers.get('Cache-Control'), /immutable/);
  assert.deepEqual(Array.from(r.datos), Array.from(PNG));
  assert.deepEqual((await pedir('GET', 'imagenes')).datos.ids, [id]);
  // Tipo declarado que no coincide con el contenido
  r = await pedir('POST', 'imagenes', PNG, { 'Content-Type': 'image/jpeg' });
  assert.equal(r.datos.codigo, 'formato');
  r = await pedir('POST', 'imagenes', new TextEncoder().encode('hola'), { 'Content-Type': 'text/plain' });
  assert.equal(r.estado, 415);
  const grande = new Uint8Array(api.MAX_IMAGEN + 1); grande.set(PNG.subarray(0, 8));
  r = await pedir('POST', 'imagenes', grande, { 'Content-Type': 'image/png' });
  assert.equal(r.datos.codigo, 'muy_grande');
  assert.equal((await pedir('GET', 'imagenes/hno-existe')).estado, 404);
});

test('clave del grupo: lectura libre, escritura con clave', opciones, async () => {
  const pedir = servidor({ CLAVE_GRUPO: 'molinos' });
  assert.equal((await pedir('GET', 'estado')).datos.requiereClave, true);
  assert.equal((await pedir('GET', 'estado', undefined, { 'X-Clave-Grupo': 'gigantes' })).datos.claveValida, false);
  assert.equal((await pedir('GET', 'estado', undefined, { 'X-Clave-Grupo': 'molinos' })).datos.claveValida, true);
  const n = demo();
  let r = await pedir('PUT', 'niveles/' + n.id, { nivel: n });
  assert.equal(r.estado, 401);
  assert.equal(r.datos.codigo, 'clave');
  r = await pedir('PUT', 'niveles/' + n.id, { nivel: n }, { 'X-Clave-Grupo': 'gigantes' });
  assert.equal(r.estado, 401);
  r = await pedir('PUT', 'niveles/' + n.id, { nivel: n }, { 'X-Clave-Grupo': 'molinos' });
  assert.equal(r.estado, 200);
  assert.equal((await pedir('GET', 'niveles')).estado, 200);
  assert.equal((await pedir('POST', 'imagenes', PNG, { 'Content-Type': 'image/png' })).estado, 401);
});

test('solicitudes inválidas', opciones, async () => {
  const pedir = servidor();
  assert.equal((await pedir('PUT', 'niveles/a b', { nivel: {} })).estado, 400);
  assert.equal((await pedir('PUT', 'niveles/x', {})).datos.codigo, 'solicitud');
  assert.equal((await pedir('PATCH', 'niveles')).estado, 405);
  assert.equal((await pedir('GET', '')).estado, 404);
  const sinDb = await api.manejar(new Request('http://x/api/estado'), {});
  assert.equal(sinDb.status, 500);
  assert.match((await sinDb.json()).mensaje, /enlace «DB»/);
});
