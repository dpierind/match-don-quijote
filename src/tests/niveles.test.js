/* Pruebas del modelo de niveles, ZIP, almacenamiento y transferencia. Ejecutar: node --test tests/ */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const N = require('../niveles.js');
const Z = require('../zip.js');
const A = require('../db.js');
const T = require('../transferencia.js');

const window = {};
new Function('window', fs.readFileSync(path.join(__dirname, '../data/episodes.js'), 'utf8'))(window);
const DEMO = () => N.desdeMaterialAntiguo(JSON.parse(JSON.stringify(window.MATERIAL_QUIJOTE)), { nombre: 'Demo' });
// PNG de 1×1 píxel
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

test('material antiguo → nivel con tablero', () => {
  const n = DEMO();
  assert.equal(n.episodios.length, 12);
  assert.equal(n.tablero.length, 30);
  assert.equal(n.tablero.filter(Boolean).length, 12);
  assert.equal(n.config.exigirCompleto, false);
  assert.equal(typeof n.episodios[0].preguntas[0].texto, 'string');
  assert.ok(n.episodios[0].preguntas[0].respuesta.length > 10);
});

test('duplicar episodio: id nuevo, sin repetir, queda en reserva', () => {
  const n = DEMO();
  const i = N.duplicarEpisodio(n, 0);
  const j = N.duplicarEpisodio(n, 0);
  assert.equal(i, 1); assert.equal(j, 1);
  assert.deepEqual(n.episodios.slice(0, 3).map(e => e.id), ['ep-01', 'ep-01-copia-2', 'ep-01-copia']);
  assert.equal(new Set(n.episodios.map(e => e.id)).size, n.episodios.length);
  assert.equal(n.tablero.includes('ep-01-copia'), false);
  assert.equal(n.episodios[i].ordenCronologico, '');
  assert.notEqual(n.episodios[i].preguntas[0].id, n.episodios[0].preguntas[0].id);
});

test('renombrar episodio mantiene su espacio; eliminar libera el espacio', () => {
  const n = DEMO();
  const pos = n.tablero.indexOf('ep-03');
  N.renombrarEpisodio(n, 2, 'sancho');
  assert.equal(n.tablero[pos], 'sancho');
  N.eliminarEpisodio(n, 2);
  assert.equal(n.tablero[pos], null);
  assert.equal(n.episodios.length, 11);
});

test('tablero: asignar, intercambiar, llenar, redimensionar', () => {
  const n = DEMO();
  N.asignarEspacio(n, 29, 'ep-01');          // mover ep-01 al último espacio
  assert.equal(n.tablero[29], 'ep-01');
  assert.equal(n.tablero.filter(x => x === 'ep-01').length, 1);
  N.intercambiarEspacios(n, 29, 1);
  assert.equal(n.tablero[1], 'ep-01');
  N.vaciarTablero(n);
  assert.equal(N.enReserva(n).length, 12);
  assert.equal(N.llenarVacios(n), 12);
  const r = N.redimensionar(n, 3, 3);
  assert.equal(n.tablero.length, 9);
  assert.equal(r.retirados.length, 3);
  assert.equal(N.enReserva(n).length, 3);
  const v = N.validarNivel(n);
  assert.ok(v.avisos.some(a => /reserva/.test(a)));
  assert.equal(v.conteos.enTablero, 9);
});

test('ZIP: escribir y leer; leer un ZIP comprimido con deflate', async () => {
  const bytes = Z.crearZip([{ nombre: 'nivel.json', datos: '{"a":"ñandú"}' }, { nombre: 'imagenes/x.png', datos: PNG }]);
  const leido = await Z.leerZip(bytes);
  assert.equal(new TextDecoder().decode(leido['nivel.json']), '{"a":"ñandú"}');
  assert.deepEqual(Array.from(leido['imagenes/x.png']), Array.from(PNG));
  // ZIP comprimido creado por Python (deflate), como los de Windows o macOS
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zq-'));
  const destino = path.join(dir, 'p.zip');
  execFileSync('python3', ['-c', `import zipfile;z=zipfile.ZipFile(${JSON.stringify(destino)},'w',zipfile.ZIP_DEFLATED);z.writestr('nivel.json','{"x":"'+'a'*500+'"}');z.close()`]);
  const comp = await Z.leerZip(new Uint8Array(fs.readFileSync(destino)));
  assert.equal(JSON.parse(new TextDecoder().decode(comp['nivel.json'])).x.length, 500);
  // Python también puede abrir el ZIP del juego
  fs.writeFileSync(path.join(dir, 'j.zip'), bytes);
  const lista = execFileSync('python3', ['-c', `import zipfile;print(zipfile.ZipFile(${JSON.stringify(path.join(dir, 'j.zip'))}).testzip())`]).toString().trim();
  assert.equal(lista, 'None');
  await assert.rejects(() => Z.leerZip(new Uint8Array([1, 2, 3])), /no es un ZIP válido/);
});

test('almacén: versiones, conflicto, copia independiente', async () => {
  const db = await A.abrir({ forzarMemoria: true });
  const n = DEMO();
  const g1 = await db.guardarNivel(n);
  assert.equal(g1.version, 1);
  const g2 = await db.guardarNivel({ ...g1, nombre: 'Cambiado' }, { versionEsperada: 1 });
  assert.equal(g2.version, 2);
  await assert.rejects(() => db.guardarNivel({ ...g1, nombre: 'Viejo' }, { versionEsperada: 1 }), e => e.codigo === 'conflicto' && e.actual.nombre === 'Cambiado');
  // copia independiente
  const copia = N.copia(g2); copia.id = N.nuevoId('nivel'); copia.nombre = 'Copia'; copia.version = 0;
  await db.guardarNivel(copia);
  copia.episodios[0].titulo = 'Solo en la copia';
  await db.guardarNivel(copia, { versionEsperada: 1 });
  const original = await db.obtenerNivel(g1.id);
  assert.equal(original.episodios[0].titulo, 'El hidalgo que se hace caballero andante');
  // eliminar uno no elimina otro
  await db.eliminarNivel(copia.id);
  assert.equal((await db.listarNiveles()).length, 1);
  assert.ok(await db.obtenerNivel(g1.id));
});

test('exportar e importar un nivel con imágenes', async () => {
  const db = await A.abrir({ forzarMemoria: true });
  const n = DEMO();
  const idImg = await db.guardarImagen({ blob: new Blob([PNG], { type: 'image/png' }), nombre: 'x.png', tipo: 'image/png' });
  n.episodios[0].imagen = 'img:' + idImg;
  n.episodios[1].imagen = 'img:' + idImg;     // la misma imagen en dos cartas
  const guardado = await db.guardarNivel(n);
  const exp = await T.exportarNivel(guardado, db);
  assert.equal(exp.imagenes, 1);
  assert.deepEqual(exp.faltantes, []);

  // Importar en un almacén vacío (otro computador)
  const otro = await A.abrir({ forzarMemoria: true });
  const an = await T.analizar(exp.bytes);
  assert.deepEqual(an.problemas, []);
  assert.equal(an.tipo, 'nivel');
  assert.equal(an.niveles[0].encontradas.length, 1);
  const listo = await T.prepararNivel(an.niveles[0], an.archivos, otro, {});
  const imp = await otro.guardarNivel(listo);
  const ref = N.idImagen(imp.episodios[0].imagen);
  assert.ok(ref);
  assert.equal(imp.episodios[1].imagen, imp.episodios[0].imagen);
  const reg = await otro.obtenerImagen(ref);
  assert.deepEqual(Array.from(new Uint8Array(await reg.blob.arrayBuffer())), Array.from(PNG));
  assert.equal(imp.episodios[0].preguntas.length, 2);
  assert.equal(N.validarNivel(imp, { imagenExiste: id => id === ref }).puedeJugar, true);
});

test('importar: detecta estructura inválida, imágenes faltantes y duplicados', async () => {
  const malo = await T.analizar(new TextEncoder().encode('{"hola":1}'));
  assert.ok(malo.problemas[0].includes('no es un nivel'));
  const roto = await T.analizar(new TextEncoder().encode('{nope'));
  assert.ok(roto.problemas[0].includes('JSON válido'));
  const n = DEMO();
  n.episodios[0].imagen = 'imagenes/no-esta.png';
  n.episodios[2].id = 'ep-01';
  const zip = Z.crearZip([{ nombre: 'nivel.json', datos: JSON.stringify(N.paqueteNivel(n, {})) }]);
  const an = await T.analizar(zip);
  assert.deepEqual(an.niveles[0].faltantes, ['imagenes/no-esta.png']);
  assert.equal(an.niveles[0].validacion.conteos.idsDuplicados, 1);
  const db = await A.abrir({ forzarMemoria: true });
  const listo = await T.prepararNivel(an.niveles[0], an.archivos, db, { nuevoId: true });
  assert.equal(listo.episodios[0].imagen, '');
  assert.notEqual(listo.id, n.id);
  // JSON sin imágenes: se avisa
  const soloJson = await T.analizar(new TextEncoder().encode(JSON.stringify(N.paqueteNivel(DEMO(), {}))));
  assert.ok(soloJson.avisos[0].includes('sin imágenes'));
});

test('copia de seguridad de la biblioteca y limpieza de imágenes huérfanas', async () => {
  const db = await A.abrir({ forzarMemoria: true });
  const a = DEMO(); const b = DEMO(); b.id = N.nuevoId('nivel'); b.nombre = 'Segunda';
  const img = await db.guardarImagen({ blob: new Blob([PNG], { type: 'image/png' }), tipo: 'image/png' });
  const huerfana = await db.guardarImagen({ blob: new Blob([PNG], { type: 'image/png' }), tipo: 'image/png' });
  b.episodios[3].imagen = 'img:' + img;
  await db.guardarNivel(a); await db.guardarNivel(b);
  const exp = await T.exportarBiblioteca(await db.listarNiveles(), db);
  const an = await T.analizar(exp.bytes);
  assert.equal(an.tipo, 'biblioteca');
  assert.equal(an.niveles.length, 2);
  assert.equal(await db.limpiarHuerfanas([]), 1);
  assert.deepEqual(await db.idsImagenes(), [img]);
  assert.ok(!(await db.idsImagenes()).includes(huerfana));
});
