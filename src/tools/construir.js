#!/usr/bin/env node
/*
 * Prepara la carpeta que se publica (_sitio/): copia src/ sin las pruebas, las herramientas ni el
 * código del servidor ni la respuesta estática de api/estado. La usan Cloudflare Pages (comando de compilación) y GitHub Actions.
 *
 * Uso: npm run construir
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.resolve(__dirname, '..');
const DESTINO = path.resolve(SRC, '..', '_sitio');
// api/ contiene solo la respuesta estática para sitios sin servidor; en Cloudflare responde la API real.
const EXCLUIR = new Set(['tests', 'tools', 'servidor', 'api']);

fs.rmSync(DESTINO, { recursive: true, force: true });
fs.mkdirSync(DESTINO, { recursive: true });
let archivos = 0;
for (const nombre of fs.readdirSync(SRC)) {
  if (EXCLUIR.has(nombre)) continue;
  fs.cpSync(path.join(SRC, nombre), path.join(DESTINO, nombre), { recursive: true });
}
(function contar(dir) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) contar(p); else archivos++;
  }
})(DESTINO);
console.log('Sitio preparado en _sitio/ (' + archivos + ' archivos).');
