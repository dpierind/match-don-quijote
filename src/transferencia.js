/*
 * El match con Don Quijote — exportación e importación de niveles.
 *
 * Paquete de un nivel (.zip):
 *   nivel.json          datos del nivel; cada imagen se indica con una ruta relativa
 *   imagenes/…          las imágenes usadas, con su archivo real
 *   LEEME.txt           explicación del contenido
 * Copia de seguridad de la biblioteca (.zip): biblioteca.json + imagenes/ + LEEME.txt
 * También se aceptan archivos .json sueltos (sin imágenes) y el material de la primera versión.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./niveles.js'), require('./zip.js'));
  else root.TransferenciaQuijote = factory(root.NivelesQuijote, root.ZipQuijote);
})(typeof self !== 'undefined' ? self : this, function (N, Z) {
  'use strict';

  var EXTENSION = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
  var TIPO = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

  var LEEME_NIVEL = 'Paquete de nivel de «El match con Don Quijote».\n\n' +
    'nivel.json contiene los episodios, las preguntas, el tablero y la configuración.\n' +
    'La carpeta imagenes/ contiene las ilustraciones; nivel.json las nombra con rutas relativas.\n' +
    'Para usarlo: Editor de niveles → Importar nivel, y elijan este archivo .zip.\n';
  var LEEME_BIBLIOTECA = 'Copia de seguridad de la biblioteca de «El match con Don Quijote».\n\n' +
    'biblioteca.json contiene todos los niveles; la carpeta imagenes/ contiene sus ilustraciones.\n' +
    'Para restaurarla: Editor de niveles → Importar nivel o copia, y elijan este archivo .zip.\n';

  async function bytesDe(blob) {
    if (blob instanceof Uint8Array) return blob;
    return new Uint8Array(await blob.arrayBuffer());
  }

  /*
   * Crea el ZIP de uno o varios niveles con todas sus imágenes.
   * Devuelve { bytes, imagenes, faltantes[] } — faltantes: imágenes referidas que ya no existen.
   */
  async function exportar(niveles, almacen, biblioteca) {
    var ids = [];
    niveles.forEach(function (n) { N.referenciasImagen(n).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); }); });
    var rutas = {}, entradas = [], faltantes = [];
    for (var i = 0; i < ids.length; i++) {
      var reg = await almacen.obtenerImagen(ids[i]);
      if (!reg || !reg.blob) { faltantes.push(ids[i]); continue; }
      var ext = EXTENSION[reg.tipo] || EXTENSION[reg.blob.type] || 'png';
      var ruta = 'imagenes/' + ids[i] + '.' + ext;
      rutas[ids[i]] = ruta;
      entradas.push({ nombre: ruta, datos: await bytesDe(reg.blob) });
    }
    var json = biblioteca ? N.paqueteBiblioteca(niveles, rutas) : N.paqueteNivel(niveles[0], rutas);
    entradas.unshift({ nombre: biblioteca ? 'biblioteca.json' : 'nivel.json', datos: JSON.stringify(json, null, 2) });
    entradas.push({ nombre: 'LEEME.txt', datos: biblioteca ? LEEME_BIBLIOTECA : LEEME_NIVEL });
    return { bytes: Z.crearZip(entradas), imagenes: ids.length - faltantes.length, faltantes: faltantes };
  }

  function exportarNivel(nivel, almacen) { return exportar([nivel], almacen, false); }
  function exportarBiblioteca(niveles, almacen) { return exportar(niveles, almacen, true); }

  function limpiarRuta(r) { return String(r || '').replace(/^\.\//, '').replace(/\\/g, '/'); }

  /*
   * Lee un archivo (.zip o .json) y prepara un informe sin guardar nada.
   * Devuelve { tipo, conImagenes, archivos, niveles: [{ nivel, encontradas[], faltantes[], conservadas[], validacion }],
   *            problemas[] (impiden importar), avisos[] }.
   */
  async function analizar(bytes) {
    var res = { tipo: null, conImagenes: false, archivos: {}, niveles: [], problemas: [], avisos: [] };
    var texto;
    try {
      if (Z.esZip(bytes)) {
        res.conImagenes = true;
        res.archivos = await Z.leerZip(bytes);
        var nombres = Object.keys(res.archivos);
        var principal = ['nivel.json', 'biblioteca.json'].filter(function (n) { return res.archivos[n]; })[0] ||
          nombres.filter(function (n) { return /\.json$/i.test(n); }).sort(function (a, b) { return a.split('/').length - b.split('/').length; })[0];
        if (!principal) { res.problemas.push('El ZIP no contiene nivel.json ni biblioteca.json.'); return res; }
        texto = new TextDecoder('utf-8').decode(res.archivos[principal]);
      } else {
        texto = new TextDecoder('utf-8').decode(bytes);
      }
    } catch (e) {
      res.problemas.push(e && e.message ? e.message : 'No se pudo leer el archivo.');
      return res;
    }
    var json;
    try { json = JSON.parse(texto.replace(/^﻿/, '')); }
    catch (e) { res.problemas.push('El contenido no es un JSON válido: ' + e.message); return res; }

    var p = N.leerPaquete(json);
    res.tipo = p.tipo;
    if (p.problemas.length) { res.problemas = res.problemas.concat(p.problemas); return res; }
    if (!res.conImagenes) res.avisos.push('Es un archivo JSON sin imágenes: solo se recuperarán los textos. Los episodios mostrarán ilustraciones provisionales.');

    var idsVistos = {};
    p.niveles.forEach(function (crudo) {
      var nivel = N.normalizarNivel(crudo);
      if (idsVistos[nivel.id]) nivel.id = N.nuevoId('nivel');
      idsVistos[nivel.id] = true;
      var encontradas = [], faltantes = [], conservadas = [];
      nivel.episodios.forEach(function (e) {
        if (!e.imagen) return;
        var ruta = limpiarRuta(e.imagen);
        if (res.archivos[ruta]) {
          var ext = ruta.split('.').pop().toLowerCase();
          if (!TIPO[ext]) faltantes.push(ruta + ' (formato no admitido)');
          else if (encontradas.indexOf(ruta) < 0) encontradas.push(ruta);
        } else if (/^assets\//.test(ruta)) conservadas.push(ruta);
        else faltantes.push(ruta);
      });
      // Las rutas se validan aparte; aquí solo interesan los datos de los episodios.
      var validacion = N.validarNivel(nivel, { imagenExiste: function () { return true; } });
      res.niveles.push({ nivel: nivel, encontradas: encontradas, faltantes: faltantes, conservadas: conservadas, validacion: validacion });
    });
    return res;
  }

  /*
   * Guarda las imágenes de un nivel analizado y devuelve el nivel listo para guardar,
   * con sus imágenes convertidas en referencias internas. No guarda el nivel.
   * op: { nuevoId: bool, nombre: string }
   */
  async function prepararNivel(entrada, archivos, almacen, op) {
    op = op || {};
    var n = N.copia(entrada.nivel);
    var mapa = {};
    for (var i = 0; i < n.episodios.length; i++) {
      var e = n.episodios[i];
      if (!e.imagen) continue;
      var ruta = limpiarRuta(e.imagen);
      var ext = ruta.split('.').pop().toLowerCase();
      if (archivos[ruta] && TIPO[ext]) {
        if (!mapa[ruta]) {
          var tipo = TIPO[ext];
          var id = await almacen.guardarImagen({ blob: new Blob([archivos[ruta]], { type: tipo }), nombre: ruta.split('/').pop(), tipo: tipo });
          mapa[ruta] = 'img:' + id;
        }
        e.imagen = mapa[ruta];
      } else if (!/^assets\//.test(ruta)) {
        e.imagen = '';   // referencia rota: se quita para que no quede apuntando a nada
      }
    }
    if (op.nuevoId) { n.id = N.nuevoId('nivel'); n.creado = new Date().toISOString(); }
    if (op.nombre) n.nombre = op.nombre;
    n.version = 0;
    return n;
  }

  return {
    exportarNivel: exportarNivel,
    exportarBiblioteca: exportarBiblioteca,
    analizar: analizar,
    prepararNivel: prepararNivel,
    EXTENSION: EXTENSION
  };
});
