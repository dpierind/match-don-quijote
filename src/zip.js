/*
 * El match con Don Quijote — lectura y escritura de archivos ZIP, sin dependencias.
 * Escribe sin compresión (las imágenes PNG/JPEG/WebP ya vienen comprimidas).
 * Lee archivos sin compresión y comprimidos con «deflate» (el formato habitual de
 * Windows, macOS y Linux) usando DecompressionStream, disponible en los navegadores actuales.
 * No admite ZIP64 (archivos de más de 4 GB) ni archivos cifrados.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ZipQuijote = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TABLA_CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(datos) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(s) { return new TextEncoder().encode(s); }

  function fechaDos(d) {
    d = d || new Date();
    var hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    var dia = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { hora: hora, dia: dia };
  }

  class ErrorZip extends Error { constructor(m) { super(m); this.name = 'ErrorZip'; } }

  /* entradas: [{ nombre: 'carpeta/archivo.png', datos: Uint8Array | string }] → Uint8Array */
  function crearZip(entradas) {
    var f = fechaDos();
    var locales = [], central = [], desplazamiento = 0;
    entradas.forEach(function (e) {
      var nombre = utf8(e.nombre);
      var datos = typeof e.datos === 'string' ? utf8(e.datos) : e.datos;
      var crc = crc32(datos);
      var local = new Uint8Array(30 + nombre.length);
      var v = new DataView(local.buffer);
      v.setUint32(0, 0x04034b50, true);
      v.setUint16(4, 20, true);        // versión necesaria
      v.setUint16(6, 0x0800, true);    // nombres en UTF-8
      v.setUint16(8, 0, true);         // sin compresión
      v.setUint16(10, f.hora, true);
      v.setUint16(12, f.dia, true);
      v.setUint32(14, crc, true);
      v.setUint32(18, datos.length, true);
      v.setUint32(22, datos.length, true);
      v.setUint16(26, nombre.length, true);
      v.setUint16(28, 0, true);
      local.set(nombre, 30);
      locales.push(local, datos);

      var c = new Uint8Array(46 + nombre.length);
      var w = new DataView(c.buffer);
      w.setUint32(0, 0x02014b50, true);
      w.setUint16(4, 20, true);
      w.setUint16(6, 20, true);
      w.setUint16(8, 0x0800, true);
      w.setUint16(10, 0, true);
      w.setUint16(12, f.hora, true);
      w.setUint16(14, f.dia, true);
      w.setUint32(16, crc, true);
      w.setUint32(20, datos.length, true);
      w.setUint32(24, datos.length, true);
      w.setUint16(28, nombre.length, true);
      w.setUint32(42, desplazamiento, true);
      c.set(nombre, 46);
      central.push(c);
      desplazamiento += local.length + datos.length;
    });
    var tamCentral = central.reduce(function (a, c) { return a + c.length; }, 0);
    var fin = new Uint8Array(22);
    var x = new DataView(fin.buffer);
    x.setUint32(0, 0x06054b50, true);
    x.setUint16(8, entradas.length, true);
    x.setUint16(10, entradas.length, true);
    x.setUint32(12, tamCentral, true);
    x.setUint32(16, desplazamiento, true);
    var partes = locales.concat(central, [fin]);
    var total = partes.reduce(function (a, p) { return a + p.length; }, 0);
    var salida = new Uint8Array(total), pos = 0;
    partes.forEach(function (p) { salida.set(p, pos); pos += p.length; });
    return salida;
  }

  async function inflar(datos) {
    if (typeof DecompressionStream === 'undefined') {
      throw new ErrorZip('Este navegador no puede descomprimir el archivo ZIP. Usen un ZIP exportado por el juego o un navegador actualizado.');
    }
    var flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(flujo).arrayBuffer());
  }

  /* Uint8Array → Promise<{ nombre: Uint8Array }>. Las carpetas se omiten. */
  async function leerZip(bytes) {
    if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
    var v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var fin = -1;
    for (var i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
      if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
    }
    if (fin < 0) throw new ErrorZip('El archivo no es un ZIP válido o está dañado.');
    var cantidad = v.getUint16(fin + 10, true);
    var inicioCentral = v.getUint32(fin + 16, true);
    if (inicioCentral === 0xFFFFFFFF || cantidad === 0xFFFF) throw new ErrorZip('El ZIP usa el formato ZIP64, que no se admite.');
    var dec = new TextDecoder('utf-8');
    var archivos = {};
    var p = inicioCentral;
    for (var k = 0; k < cantidad; k++) {
      if (v.getUint32(p, true) !== 0x02014b50) throw new ErrorZip('El índice del ZIP está dañado.');
      var banderas = v.getUint16(p + 8, true);
      var metodo = v.getUint16(p + 10, true);
      var crc = v.getUint32(p + 16, true);
      var tamComp = v.getUint32(p + 20, true);
      var largoNombre = v.getUint16(p + 28, true);
      var largoExtra = v.getUint16(p + 30, true);
      var largoComent = v.getUint16(p + 32, true);
      var local = v.getUint32(p + 42, true);
      var nombre = dec.decode(bytes.subarray(p + 46, p + 46 + largoNombre));
      p += 46 + largoNombre + largoExtra + largoComent;
      if (nombre.slice(-1) === '/') continue;
      if (banderas & 1) throw new ErrorZip('El archivo «' + nombre + '» está cifrado y no se puede leer.');
      if (v.getUint32(local, true) !== 0x04034b50) throw new ErrorZip('El ZIP está dañado cerca de «' + nombre + '».');
      var inicio = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      var comp = bytes.subarray(inicio, inicio + tamComp);
      var datos;
      if (metodo === 0) datos = comp.slice();
      else if (metodo === 8) datos = await inflar(comp);
      else throw new ErrorZip('El archivo «' + nombre + '» usa un método de compresión no admitido.');
      if (crc32(datos) !== crc) throw new ErrorZip('El archivo «' + nombre + '» está dañado (la suma de control no coincide).');
      archivos[nombre.replace(/^\.\//, '')] = datos;
    }
    return archivos;
  }

  function esZip(bytes) {
    return bytes && bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 3 || bytes[2] === 5);
  }

  return { crearZip: crearZip, leerZip: leerZip, esZip: esZip, crc32: crc32, ErrorZip: ErrorZip };
});
