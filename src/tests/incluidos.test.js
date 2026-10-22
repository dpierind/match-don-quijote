/* Pruebas de los niveles incluidos: herramienta «npm run incluir» y sincronización. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const N = require('../niveles.js');
const A = require('../db.js');
const T = require('../transferencia.js');
const S = require('../sincronizar.js');
const M = require('../game.js');

const HERRAMIENTA = path.join(__dirname, '../tools/incluir-nivel.js');
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const w0 = {};
new Function('window', fs.readFileSync(path.join(__dirname, '../data/episodes.js'), 'utf8'))(w0);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'incluidos-'));
const destino = path.join(tmp, 'niveles');

// Cada prueba empieza sin niveles incluidos.
function limpiar() { fs.rmSync(destino, { recursive: true, force: true }); }

function incluir(...args) {
  const r = spawnSync(process.execPath, [HERRAMIENTA, ...args, '--destino', destino], { encoding: 'utf8' });
  return { codigo: r.status, salida: r.stdout + r.stderr };
}

function cargarIncluidos() {
  const window = {};
  new Function('window', fs.readFileSync(path.join(destino, 'indice.js'), 'utf8'))(window);
  return {
    indice: window.NIVELES_INCLUIDOS,
    cargarDatos: async (entrada) => {
      new Function('window', fs.readFileSync(path.join(tmp, entrada.archivo), 'utf8'))(window);
      return window.NIVELES_INCLUIDOS_DATOS[entrada.id];
    }
  };
}

async function exportar(db, nivel, nombre) {
  const r = await T.exportarNivel(nivel, db);
  const ruta = path.join(tmp, nombre);
  fs.writeFileSync(ruta, r.bytes);
  return ruta;
}

test('flujo completo: incluir, instalar, actualizar, conservar cambios locales y quitar', async () => {
  limpiar();
  // --- Autor: crea el nivel con una imagen y lo exporta ---
  const autor = await A.abrir({ forzarMemoria: true });
  let nivel = N.desdeMaterialAntiguo(JSON.parse(JSON.stringify(w0.MATERIAL_QUIJOTE)), { nombre: 'Primera parte' });
  const img = await autor.guardarImagen({ blob: new Blob([PNG], { type: 'image/png' }), tipo: 'image/png' });
  nivel.episodios[0].imagen = 'img:' + img;
  nivel.episodios[1].imagen = 'img:' + img;
  nivel = await autor.guardarNivel(nivel);
  const zip1 = await exportar(autor, nivel, 'v1.zip');

  let r = incluir(zip1);
  assert.equal(r.codigo, 0, r.salida);
  assert.match(r.salida, /\+ Incluido «Primera parte» → src\/niveles\/primera-parte\.js/);
  r = incluir(zip1);
  assert.match(r.salida, /ya estaba incluido sin cambios/);

  // --- Destinatario: abre el juego por primera vez ---
  const otro = await A.abrir({ forzarMemoria: true });
  let inc = cargarIncluidos();
  assert.equal(inc.indice.length, 1);
  assert.equal(inc.indice[0].archivo, 'niveles/primera-parte.js');
  let inf = await S.sincronizar({ db: otro, ...inc });
  assert.deepEqual(inf.instalados, ['Primera parte']);
  let suyo = await otro.obtenerNivel(nivel.id);
  assert.ok(N.esIncluido(suyo));
  assert.equal(N.editadoLocalmente(suyo), false);
  const ref = N.idImagen(suyo.episodios[0].imagen);
  assert.ok(ref);
  assert.equal(suyo.episodios[1].imagen, suyo.episodios[0].imagen);
  const reg = await otro.obtenerImagen(ref);
  assert.deepEqual(Array.from(new Uint8Array(await reg.blob.arrayBuffer())), Array.from(PNG));
  assert.equal(N.validarNivel(suyo, { imagenExiste: (id) => id === ref }).puedeJugar, true);

  // Abrir otra vez sin cambios: no hace nada.
  inf = await S.sincronizar({ db: otro, ...inc });
  assert.equal(inf.sinCambios, 1);
  assert.equal(inf.instalados.length + inf.actualizados.length, 0);

  // El destinatario empieza una partida con la versión 1.
  const partida = M.crearPartida({ nivel: suyo, nombres: ['A', 'B'], arbitro: 'P' });

  // --- Autor: cambia el nivel y vuelve a incluirlo ---
  nivel.episodios[2].titulo = 'Sancho, escudero (revisado)';
  nivel = await autor.guardarNivel(nivel, { versionEsperada: nivel.version });
  r = incluir(await exportar(autor, nivel, 'v2.zip'));
  assert.match(r.salida, /↻ Actualizado «Primera parte» → src\/niveles\/primera-parte\.js/);

  // --- Destinatario sin cambios locales: se actualiza solo ---
  inc = cargarIncluidos();
  inf = await S.sincronizar({ db: otro, ...inc });
  assert.deepEqual(inf.actualizados, ['Primera parte']);
  suyo = await otro.obtenerNivel(nivel.id);
  assert.equal(suyo.episodios[2].titulo, 'Sancho, escudero (revisado)');
  assert.equal(partida.episodios['ep-03'].titulo, 'Sancho se convierte en escudero', 'la partida conserva su instantánea');

  // --- Destinatario edita el nivel en su navegador ---
  suyo.descripcion = 'Con mis notas';
  suyo = await otro.guardarNivel(suyo, { versionEsperada: suyo.version });
  assert.equal(N.editadoLocalmente(suyo), true);

  // --- Autor publica la versión 3 ---
  nivel.episodios[3].titulo = 'Los molinos (revisado)';
  nivel = await autor.guardarNivel(nivel, { versionEsperada: nivel.version });
  incluir(await exportar(autor, nivel, 'v3.zip'));
  inf = await S.sincronizar({ db: otro, ...cargarIncluidos() });
  assert.deepEqual(inf.actualizados, ['Primera parte']);
  assert.deepEqual(inf.conservados, [{ nombre: 'Primera parte', copia: 'Primera parte (mis cambios)' }]);
  const todos = await otro.listarNiveles();
  const copia = todos.find((n) => n.nombre === 'Primera parte (mis cambios)');
  assert.equal(copia.descripcion, 'Con mis notas');
  assert.equal(N.esIncluido(copia), false);
  suyo = await otro.obtenerNivel(nivel.id);
  assert.equal(suyo.episodios[3].titulo, 'Los molinos (revisado)');
  assert.equal(N.editadoLocalmente(suyo), false);

  // --- Quitar ---
  r = incluir('--quitar', nivel.id);
  assert.equal(r.codigo, 0, r.salida);
  assert.equal(cargarIncluidos().indice.length, 0);
  assert.equal(fs.existsSync(path.join(destino, 'primera-parte.js')), false);
});

test('en el navegador de quien creó el nivel no se generan copias innecesarias', async () => {
  limpiar();
  const autor = await A.abrir({ forzarMemoria: true });
  let nivel = N.desdeMaterialAntiguo(JSON.parse(JSON.stringify(w0.MATERIAL_QUIJOTE)), { nombre: 'Del autor' });
  nivel = await autor.guardarNivel(nivel);
  incluir(await exportar(autor, nivel, 'autor-v1.zip'));
  // Recarga justo después de incluir: el nivel se vincula, sin copias.
  let inf = await S.sincronizar({ db: autor, ...cargarIncluidos() });
  assert.deepEqual(inf.vinculados, ['Del autor']);
  assert.equal((await autor.listarNiveles()).length, 1);
  nivel = await autor.obtenerNivel(nivel.id);
  assert.ok(N.esIncluido(nivel));
  // Sigue editando, exporta e incluye la versión 2: otra vez se vincula, sin copias.
  nivel.descripcion = 'Versión 2';
  nivel = await autor.guardarNivel(nivel, { versionEsperada: nivel.version });
  incluir(await exportar(autor, nivel, 'autor-v2.zip'));
  inf = await S.sincronizar({ db: autor, ...cargarIncluidos() });
  assert.deepEqual(inf.vinculados, ['Del autor']);
  assert.equal(inf.conservados.length, 0);
  assert.equal((await autor.listarNiveles()).length, 1);
  incluir('--quitar', nivel.id);
});

test('un nivel local más reciente que el publicado y que nunca vino del juego no se toca', async () => {
  limpiar();
  const autor = await A.abrir({ forzarMemoria: true });
  let nivel = await autor.guardarNivel(N.desdeMaterialAntiguo(JSON.parse(JSON.stringify(w0.MATERIAL_QUIJOTE)), { nombre: 'En curso' }));
  incluir(await exportar(autor, nivel, 'en-curso.zip'));
  await new Promise((r) => setTimeout(r, 5));
  nivel.descripcion = 'Trabajo sin publicar';
  await autor.guardarNivel(nivel, { versionEsperada: nivel.version });
  const inf = await S.sincronizar({ db: autor, ...cargarIncluidos() });
  assert.deepEqual(inf.omitidos, ['En curso']);
  assert.equal((await autor.obtenerNivel(nivel.id)).descripcion, 'Trabajo sin publicar');
  assert.equal((await autor.listarNiveles()).length, 1);
  incluir('--quitar', nivel.id);
});

test('un nivel con errores no se incluye salvo con --permitir-errores', async () => {
  limpiar();
  const db = await A.abrir({ forzarMemoria: true });
  const n = N.desdeMaterialAntiguo(JSON.parse(JSON.stringify(w0.MATERIAL_QUIJOTE)), { nombre: 'Con errores' });
  n.episodios[0].descripcion = '';
  const ruta = await exportar(db, await db.guardarNivel(n), 'errores.zip');
  let r = incluir(ruta);
  assert.equal(r.codigo, 1);
  assert.match(r.salida, /no se incluyó/);
  assert.match(r.salida, /descripción está vacía/);
  r = incluir(ruta, '--permitir-errores');
  assert.equal(r.codigo, 0, r.salida);
  assert.match(r.salida, /se incluyó con 1 error/);
  incluir('--quitar', 'con-errores.js');
});

test('archivos que no son niveles y entradas dañadas', async () => {
  limpiar();
  const falso = path.join(tmp, 'falso.zip');
  fs.writeFileSync(falso, 'no es un zip');
  assert.equal(incluir(falso).codigo, 2);
  assert.match(incluir('--quitar', 'no-existe').salida, /No hay ningún nivel incluido/);
  const db = await A.abrir({ forzarMemoria: true });
  const inf = await S.sincronizar({
    db,
    indice: [{ id: 'x', nombre: 'X', huella: 'h1', archivo: 'niveles/x.js' }],
    cargarDatos: async () => ({ huella: 'otra', nivel: {} })
  });
  assert.equal(inf.errores.length, 1);
  assert.match(inf.errores[0], /no corresponde al índice/);
});

test('una copia de un nivel incluido no se considera incluida ni se exporta con origen', () => {
  const n = N.normalizarNivel({ id: 'a', nombre: 'A', origen: { id: 'a', huella: 'h', versionLocal: 1 }, version: 1 });
  assert.ok(N.esIncluido(n));
  const c = N.copia(n); c.id = 'b';
  assert.equal(N.esIncluido(N.normalizarNivel(c)), false);
  assert.equal(N.paqueteNivel(n, {}).nivel.origen, undefined);
});
