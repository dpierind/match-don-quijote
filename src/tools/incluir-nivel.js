#!/usr/bin/env node
/*
 * Incluye niveles en el juego publicado (src/niveles/).
 *
 * Uso:
 *   npm run incluir -- <nivel.zip> [más archivos…] [--permitir-errores]
 *       Convierte un nivel exportado (o una copia de seguridad de la biblioteca) en
 *       src/niveles/<archivo>.js con sus imágenes embebidas y actualiza src/niveles/indice.js.
 *       Si el nivel ya estaba incluido (mismo identificador), reemplaza su archivo.
 *   npm run incluir -- --lista
 *       Muestra los niveles incluidos.
 *   npm run incluir -- --quitar <identificador | archivo.js>
 *       Quita un nivel incluido. Quienes ya lo tenían lo conservan en su navegador.
 *   npm run incluir
 *       Sin argumentos: vuelve a generar indice.js a partir de los archivos existentes.
 *
 * Opción para pruebas: --destino <carpeta> (por defecto, src/niveles).
 * Código de salida: 0 bien; 1 el nivel tiene errores; 2 no se pudo leer o escribir.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const N = require('../niveles.js');
const T = require('../transferencia.js');

const TIPOS = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const AVISO_TAMANO = 8 * 1024 * 1024;

function salir(msg, codigo) { console.error(msg); process.exit(codigo); }

function slug(texto) {
  const base = String(texto || 'nivel').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 50);
  return base || 'nivel';
}

function leerIncluidos(destino) {
  if (!fs.existsSync(destino)) return [];
  return fs.readdirSync(destino).filter((f) => /\.js$/.test(f) && f !== 'indice.js').sort().map((archivo) => {
    const window = {};
    try {
      new Function('window', fs.readFileSync(path.join(destino, archivo), 'utf8'))(window);
    } catch (e) {
      salir('No se pudo leer niveles/' + archivo + ': ' + e.message, 2);
    }
    const datos = window.NIVELES_INCLUIDOS_DATOS || {};
    const id = Object.keys(datos)[0];
    if (!id) salir('niveles/' + archivo + ' no contiene un nivel incluido.', 2);
    return { archivo, id, datos: datos[id] };
  });
}

function escribirIndice(destino) {
  const lista = leerIncluidos(destino).map((x) => ({
    id: x.id,
    nombre: x.datos.nivel.nombre,
    huella: x.datos.huella,
    archivo: 'niveles/' + x.archivo,
    episodios: x.datos.nivel.episodios.length
  })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const contenido = '/*\n * Niveles incluidos en el juego. Archivo generado por «npm run incluir»: no lo editen a mano.\n */\n' +
    'window.NIVELES_INCLUIDOS = ' + JSON.stringify(lista, null, 2) + ';\n';
  fs.mkdirSync(destino, { recursive: true });
  fs.writeFileSync(path.join(destino, 'indice.js'), contenido);
  return lista;
}

function imprimirLista(lista) {
  if (!lista.length) { console.log('No hay niveles incluidos.'); return; }
  console.log('Niveles incluidos (' + lista.length + '):');
  lista.forEach((e) => console.log('  · ' + e.nombre + '  [' + e.id + ']  ' + e.episodios + ' episodios  →  src/' + e.archivo));
}

// Huella del contenido: no cambia si se exporta dos veces el mismo nivel sin modificarlo.
function huella(nivel, imagenes) {
  const n = N.copia(nivel);
  delete n.version; delete n.creado; delete n.modificado; delete n.origen;
  const h = crypto.createHash('sha256').update(JSON.stringify(n));
  Object.keys(imagenes).sort().forEach((k) => h.update(k).update(imagenes[k].datos));
  return h.digest('hex').slice(0, 16);
}

async function incluir(ruta, destino, permitirErrores) {
  let bytes;
  try { bytes = new Uint8Array(fs.readFileSync(ruta)); }
  catch (e) { salir('No se pudo leer ' + ruta + ': ' + e.message, 2); }
  const a = await T.analizar(bytes);
  if (a.problemas.length) salir('No se puede incluir ' + ruta + ':\n  ✗ ' + a.problemas.join('\n  ✗ '), 2);
  if (!a.conImagenes) console.warn('Atención: ' + path.basename(ruta) + ' no es un ZIP; el nivel se incluirá sin imágenes.');

  const existentes = leerIncluidos(destino);
  let fallos = 0;
  for (const x of a.niveles) {
    const v = x.validacion;
    const errores = v.errores.concat(x.faltantes.map((f) => 'imagen referida que no está en el archivo: ' + f));
    if (errores.length && !permitirErrores) {
      console.error('✗ «' + x.nivel.nombre + '» no se incluyó: tiene ' + errores.length + ' error(es).');
      errores.slice(0, 10).forEach((e) => console.error('    ' + e));
      if (errores.length > 10) console.error('    … y ' + (errores.length - 10) + ' más.');
      console.error('  Corríjanlos en el Editor de niveles y vuelvan a exportar (o usen --permitir-errores).');
      fallos++;
      continue;
    }
    const nivel = N.copia(x.nivel);
    delete nivel.origen;
    const imagenes = {};
    nivel.episodios.forEach((e) => {
      if (!e.imagen) return;
      const r = e.imagen.replace(/^\.\//, '');
      const archivo = a.archivos[r];
      if (!archivo) { if (!/^assets\//.test(r)) e.imagen = ''; return; }
      const tipo = TIPOS[r.split('.').pop().toLowerCase()];
      if (!tipo) { e.imagen = ''; return; }
      e.imagen = r;
      if (!imagenes[r]) imagenes[r] = { tipo, datos: Buffer.from(archivo).toString('base64') };
    });
    const h = huella(nivel, imagenes);
    const previo = existentes.find((p) => p.id === nivel.id);
    if (previo && previo.datos.huella === h) {
      console.log('= «' + nivel.nombre + '» ya estaba incluido sin cambios (src/niveles/' + previo.archivo + ').');
      continue;
    }
    let nombreArchivo = previo ? previo.archivo : slug(nivel.nombre) + '.js';
    if (!previo) {
      let k = 2;
      while (existentes.some((p) => p.archivo === nombreArchivo) || nombreArchivo === 'indice.js') nombreArchivo = slug(nivel.nombre) + '-' + k++ + '.js';
    }
    const datos = { huella: h, generado: new Date().toISOString(), nivel, imagenes };
    const contenido = '/*\n * Nivel incluido: «' + nivel.nombre.replace(/\*\//g, '* /') + '».\n' +
      ' * Archivo generado por «npm run incluir» a partir de un nivel exportado. No lo editen a mano:\n' +
      ' * editen el nivel en el juego, expórtenlo y vuelvan a ejecutar «npm run incluir».\n */\n' +
      '(window.NIVELES_INCLUIDOS_DATOS = window.NIVELES_INCLUIDOS_DATOS || {})[' + JSON.stringify(nivel.id) + '] = ' + JSON.stringify(datos) + ';\n';
    fs.mkdirSync(destino, { recursive: true });
    fs.writeFileSync(path.join(destino, nombreArchivo), contenido);
    if (!previo) existentes.push({ archivo: nombreArchivo, id: nivel.id, datos });
    const tam = Buffer.byteLength(contenido);
    console.log((previo ? '↻ Actualizado' : '+ Incluido') + ' «' + nivel.nombre + '» → src/niveles/' + nombreArchivo +
      ' (' + nivel.episodios.length + ' episodios, ' + Object.keys(imagenes).length + ' imágenes, ' + (tam / 1048576).toFixed(1) + ' MB)');
    if (errores.length) console.warn('  Atención: se incluyó con ' + errores.length + ' error(es); no se podrá jugar hasta corregirlos.');
    if (tam > AVISO_TAMANO) console.warn('  Atención: el archivo pesa más de 8 MB. En celulares tardará en cargar la primera vez; usen imágenes más livianas.');
  }
  return fallos;
}

async function main() {
  const args = process.argv.slice(2);
  let destino = path.join(__dirname, '..', 'niveles');
  const iDest = args.indexOf('--destino');
  if (iDest >= 0) { destino = path.resolve(args[iDest + 1] || ''); args.splice(iDest, 2); }
  const permitir = args.includes('--permitir-errores');

  if (args.includes('--lista')) { imprimirLista(escribirIndice(destino)); return; }

  const iQuitar = args.indexOf('--quitar');
  if (iQuitar >= 0) {
    const cual = args[iQuitar + 1];
    if (!cual) salir('Indiquen qué nivel quitar: --quitar <identificador | archivo.js>', 2);
    const x = leerIncluidos(destino).find((p) => p.id === cual || p.archivo === cual || p.archivo === path.basename(cual));
    if (!x) salir('No hay ningún nivel incluido con «' + cual + '». Vean la lista con: npm run incluir -- --lista', 2);
    fs.unlinkSync(path.join(destino, x.archivo));
    console.log('− Quitado «' + x.datos.nivel.nombre + '» (src/niveles/' + x.archivo + ').');
    imprimirLista(escribirIndice(destino));
    return;
  }

  const archivos = args.filter((a) => !a.startsWith('--'));
  let fallos = 0;
  for (const r of archivos) fallos += await incluir(r, destino, permitir);
  const lista = escribirIndice(destino);
  console.log('');
  imprimirLista(lista);
  if (archivos.length && !fallos) console.log('\nSiguiente paso: prueben con «npm run servir» y publiquen con git add, commit y push.');
  process.exit(fallos ? 1 : 0);
}

main().catch((e) => salir('Error inesperado: ' + (e && e.stack || e), 2));
