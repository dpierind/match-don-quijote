#!/usr/bin/env node
/*
 * Valida niveles de «El match con Don Quijote» desde la terminal, sin abrir el navegador.
 *
 * Uso:
 *   node src/tools/validar-nivel.js <archivo> [--json]
 *
 * <archivo> puede ser:
 *   - un nivel exportado (.zip con nivel.json e imagenes/)
 *   - una copia de seguridad de la biblioteca (.zip con biblioteca.json)
 *   - un nivel.json o biblioteca.json suelto
 *   - src/data/episodes.js (material de demostración)
 *
 * Código de salida: 0 si todos los niveles se pueden jugar; 1 si hay errores; 2 si no se pudo leer.
 * --json imprime el informe completo en JSON (útil para agentes y scripts).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const N = require('../niveles.js');
const T = require('../transferencia.js');

async function cargar(ruta) {
  const bytes = new Uint8Array(fs.readFileSync(ruta));
  if (/\.js$/i.test(ruta)) {
    const window = {};
    new Function('window', new TextDecoder().decode(bytes))(window);
    if (!window.MATERIAL_QUIJOTE) throw new Error('El archivo .js no define window.MATERIAL_QUIJOTE.');
    const nivel = N.desdeMaterialAntiguo(window.MATERIAL_QUIJOTE, { nombre: path.basename(ruta) });
    return {
      tipo: 'material-demostracion', problemas: [], avisos: [],
      niveles: [{ nivel, encontradas: [], faltantes: [], conservadas: [], validacion: N.validarNivel(nivel) }]
    };
  }
  return T.analizar(bytes);
}

function imprimir(r, ruta) {
  console.log('Archivo: ' + ruta + (r.tipo ? ' (' + r.tipo + ')' : ''));
  r.problemas.forEach((p) => console.log('  ✗ ' + p));
  r.avisos.forEach((a) => console.log('  ! ' + a));
  for (const x of r.niveles) {
    const v = x.validacion, c = v.conteos, cfg = x.nivel.config;
    console.log('\nNivel: ' + x.nivel.nombre + '  [' + (v.puedeJugar ? 'SE PUEDE JUGAR' : 'NO SE PUEDE JUGAR') + ']');
    console.log('  Formato: ' + cfg.columnas + ' × ' + cfg.filas + ' = ' + v.espacios + ' espacios' +
      (cfg.exigirCompleto ? ' (todos obligatorios)' : ' (pueden quedar vacíos)') + ' · cumple: ' + (v.cumpleFormato ? 'sí' : 'no'));
    console.log('  Episodios: ' + c.episodios + ' · en el tablero: ' + c.enTablero + ' · en la reserva: ' + c.reserva);
    console.log('  Imágenes: ' + c.imagenes + ' · sin imagen: ' + c.sinImagen + ' · rotas: ' + c.imagenesRotas);
    console.log('  Descripciones: ' + c.descripciones + ' · vacías: ' + c.descripcionesVacias);
    console.log('  Sin preguntas: ' + c.sinPreguntas + ' · ids duplicados: ' + c.idsDuplicados +
      ' · sin capítulo: ' + c.sinCapitulo + ' · sin orden: ' + c.sinOrden);
    if (x.faltantes.length) console.log('  Imágenes referidas que no están en el archivo: ' + x.faltantes.join(', '));
    v.errores.forEach((e) => console.log('  ✗ ' + e));
    v.avisos.forEach((a) => console.log('  ! ' + a));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const ruta = args.find((a) => !a.startsWith('--'));
  if (!ruta) {
    console.error('Uso: node src/tools/validar-nivel.js <archivo.zip|.json|episodes.js> [--json]');
    process.exit(2);
  }
  let r;
  try { r = await cargar(ruta); }
  catch (e) { console.error('No se pudo leer ' + ruta + ': ' + e.message); process.exit(2); }

  // Las imágenes faltantes en el archivo son referencias rotas para el informe.
  r.niveles.forEach((x) => {
    if (x.faltantes.length) {
      x.validacion.errores.push(...x.faltantes.map((f) => 'referencia de imagen rota: ' + f));
      x.validacion.conteos.imagenesRotas += x.faltantes.length;
      x.validacion.conteos.imagenes = Math.max(0, x.validacion.conteos.imagenes - x.faltantes.length);
      x.validacion.puedeJugar = false;
    }
  });

  if (json) {
    console.log(JSON.stringify({
      archivo: ruta, tipo: r.tipo, problemas: r.problemas, avisos: r.avisos,
      niveles: r.niveles.map((x) => ({
        id: x.nivel.id, nombre: x.nivel.nombre, puedeJugar: x.validacion.puedeJugar,
        cumpleFormato: x.validacion.cumpleFormato, conteos: x.validacion.conteos,
        errores: x.validacion.errores, avisos: x.validacion.avisos,
        imagenesIncluidas: x.encontradas, imagenesFaltantes: x.faltantes
      }))
    }, null, 2));
  } else imprimir(r, ruta);

  const mal = r.problemas.length || r.niveles.some((x) => !x.validacion.puedeJugar);
  process.exit(r.problemas.length ? 2 : mal ? 1 : 0);
}

main();
