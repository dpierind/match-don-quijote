#!/usr/bin/env node
/*
 * Servidor local con niveles compartidos: sirve el juego (src/) y la API (src/servidor/api.js)
 * con una base de datos SQLite en .datos/servidor-local.sqlite.
 * Sirve para probar en el computador el mismo funcionamiento que en Cloudflare, incluso con
 * varios navegadores o dispositivos de la misma red Wi-Fi.
 *
 * Uso:
 *   npm run compartido                     → http://localhost:8787
 *   npm run compartido -- --puerto 9000
 *   npm run compartido -- --clave molinos  → exige la clave del grupo para editar
 *   npm run compartido -- --memoria        → base de datos temporal (se borra al cerrar)
 *   npm run compartido -- --red            → acepta conexiones desde otros dispositivos de la red
 *
 * Requiere Node 22.13 o superior (usa node:sqlite).
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const api = require('../servidor/api.js');
const { crearD1 } = require('./d1-local.js');

const RAIZ = path.resolve(__dirname, '..');
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon'
};
const OCULTOS = /^\/(tests|tools|servidor)(\/|$)/;

function opcion(nombre, defecto) {
  const i = process.argv.indexOf('--' + nombre);
  if (i < 0) return defecto;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

function iniciar(op) {
  op = op || {};
  const archivo = op.memoria ? ':memory:' : (op.archivo || path.join(RAIZ, '..', '.datos', 'servidor-local.sqlite'));
  if (archivo !== ':memory:') fs.mkdirSync(path.dirname(archivo), { recursive: true });
  const env = { DB: crearD1(archivo) };
  if (op.clave) env.CLAVE_GRUPO = String(op.clave);

  const servidor = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
      if (url.pathname.startsWith('/api/')) {
        const trozos = [];
        for await (const t of req) trozos.push(t);
        const cuerpo = trozos.length ? Buffer.concat(trozos) : undefined;
        const peticion = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : cuerpo });
        const r = await api.manejar(peticion, env);
        const cab = {};
        r.headers.forEach((v, k) => { cab[k] = v; });
        res.writeHead(r.status, cab);
        res.end(Buffer.from(await r.arrayBuffer()));
        return;
      }
      let ruta = decodeURIComponent(url.pathname);
      if (ruta.endsWith('/')) ruta += 'index.html';
      if (OCULTOS.test(ruta)) { res.writeHead(404); res.end('No encontrado'); return; }
      const destino = path.join(RAIZ, path.normalize(ruta).replace(/^(\.\.[/\\])+/, ''));
      if (!destino.startsWith(RAIZ) || !fs.existsSync(destino) || fs.statSync(destino).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('No encontrado');
        return;
      }
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(destino).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(destino).pipe(res);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Error: ' + e.message);
    }
  });
  return new Promise((resolver) => {
    servidor.listen(op.puerto || 0, op.host || '127.0.0.1', () => resolver({ servidor, puerto: servidor.address().port, archivo, cerrar: () => { servidor.close(); env.DB.cerrar(); } }));
  });
}

if (require.main === module) {
  const red = !!opcion('red', false);
  iniciar({ puerto: Number(opcion('puerto', 8787)), clave: opcion('clave', ''), memoria: !!opcion('memoria', false), host: red ? '0.0.0.0' : '127.0.0.1' })
    .then(({ puerto, archivo }) => {
      console.log('El match con Don Quijote — servidor local con niveles compartidos');
      console.log('  Juego:  http://localhost:' + puerto + '/');
      if (red) {
        Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal)
          .forEach((i) => console.log('  En la red: http://' + i.address + ':' + puerto + '/'));
      }
      console.log('  Datos:  ' + (archivo === ':memory:' ? 'temporales (se borran al cerrar)' : archivo));
      console.log('  Para detenerlo: Ctrl + C');
    })
    .catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { iniciar };
