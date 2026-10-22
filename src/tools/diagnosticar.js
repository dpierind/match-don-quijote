#!/usr/bin/env node
/*
 * Diagnóstico del juego publicado: comprueba paso a paso que el sitio, la API, la base de datos y
 * la clave del grupo funcionen, y dice qué corregir.
 *
 * Uso:
 *   npm run diagnosticar -- https://match-don-quijote.pages.dev
 *   npm run diagnosticar -- https://… --clave LA-CLAVE        (prueba también la clave)
 *   npm run diagnosticar -- https://… --clave LA-CLAVE --escribir
 *        crea un nivel de prueba, lo lee como si fuera otro dispositivo, provoca un conflicto,
 *        sube una imagen y elimina el nivel. No toca los niveles existentes.
 *   … --json                                                   (resultado para scripts o agentes)
 *
 * Código de salida: 0 si todo funciona, 1 si algo falla.
 */
'use strict';

const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

function unir(base, ruta) { return base.replace(/\/+$/, '') + '/' + ruta; }

async function pedir(obtener, url, init) {
  try {
    const r = await obtener(url, Object.assign({ redirect: 'follow' }, init || {}));
    const tipo = r.headers.get('content-type') || '';
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch (e) { json = null; }
    return { estado: r.status, tipo, texto, json };
  } catch (e) {
    return { estado: 0, tipo: '', texto: '', json: null, error: (e && (e.cause && e.cause.code || e.message)) || String(e) };
  }
}

/*
 * Devuelve { ok, pasos: [{ nombre, ok, detalle, arreglo? }], resumen: { modo, requiereClave, niveles } }.
 * op: { clave, escribir, fetch }
 */
async function diagnosticar(sitio, op) {
  op = op || {};
  const obtener = op.fetch || fetch;
  const pasos = [];
  const resumen = { modo: 'desconocido', requiereClave: null, niveles: null };
  const paso = (nombre, ok, detalle, arreglo) => { ok = !!ok; pasos.push({ nombre, ok, detalle, arreglo: ok ? undefined : arreglo }); return ok; };
  const cab = (conClave) => (conClave && op.clave ? { 'X-Clave-Grupo': op.clave } : {});
  const host = (() => { try { return new URL(sitio).hostname; } catch (e) { return ''; } })();
  const esWorker = /\.workers\.dev$/i.test(host);

  // 1. La página del juego
  const pagina = await pedir(obtener, unir(sitio, ''));
  if (!paso('El sitio responde', pagina.estado > 0, pagina.estado ? 'HTTP ' + pagina.estado : 'sin respuesta: ' + pagina.error,
    'Revisen la dirección y su conexión a internet.')) return { ok: false, pasos, resumen };
  paso('La página es el juego', /El match con Don Quijote/.test(pagina.texto), 'HTTP ' + pagina.estado + ', ' + (pagina.tipo.split(';')[0] || 'sin tipo'),
    'La dirección no muestra el juego. Revisen que el directorio de salida sea «_sitio» y el comando de compilación «npm run construir».');

  // 2. La API
  const estado = await pedir(obtener, unir(sitio, 'api/estado'), { headers: { 'Cache-Control': 'no-store' } });
  const api = estado.json && estado.json.servicio === 'match-quijote' && !estado.json.estatico && estado.estado === 200;
  let arregloApi;
  if (estado.json && estado.json.estatico) {
    arregloApi = 'Se publicó src/ sin construir (o es GitHub Pages): el sitio no tiene API. En Cloudflare, el directorio de salida debe ser «_sitio» y el comando «npm run construir».';
  } else if (estado.json && estado.json.mensaje) {
    arregloApi = 'La API existe pero falla: «' + estado.json.mensaje + '». ' +
      (/«DB»/.test(estado.json.mensaje) ? 'Agreguen el enlace D1 con el nombre exacto DB (Settings → Bindings) y vuelvan a publicar.' : '');
  } else if (/<html|<!doctype/i.test(estado.texto.slice(0, 500))) {
    arregloApi = esWorker
      ? 'Proyecto de tipo Worker: el repositorio trae wrangler.jsonc. Pongan el «database_id» de D1 en wrangler.jsonc y, en el Worker (Settings → Build), usen como comando de compilación «npm run construir» y como comando de despliegue «npx wrangler deploy» (docs/servidor-compartido.md, parte W).'
      : 'api/estado devuelve la página del juego: la carpeta functions/ no se publicó. Revisen que el proyecto sea de tipo Pages, que «Root directory» esté vacío y que functions/ esté en el repositorio (git ls-files functions).';
  } else {
    arregloApi = esWorker
      ? 'Proyecto de tipo Worker: el repositorio trae wrangler.jsonc. Pongan el «database_id» de D1 en wrangler.jsonc y, en el Worker (Settings → Build), usen como comando de compilación «npm run construir» y como comando de despliegue «npx wrangler deploy» (docs/servidor-compartido.md, parte W).'
      : 'La API no responde como se espera (HTTP ' + estado.estado + '). Revisen la carpeta functions/ y el último registro de compilación.';
  }
  if (!paso('La API del juego responde (api/estado)', api, 'HTTP ' + estado.estado + ' ' + (estado.tipo.split(';')[0] || '') + ' · ' + estado.texto.slice(0, 120).replace(/\s+/g, ' '), arregloApi)) {
    resumen.modo = 'local (sin servidor): los niveles quedan en cada navegador';
    return { ok: false, pasos, resumen };
  }
  resumen.modo = 'compartido';
  resumen.requiereClave = !!estado.json.requiereClave;

  // 3. Base de datos (lectura)
  const lista = await pedir(obtener, unir(sitio, 'api/niveles?resumen=1'));
  const leeBd = lista.estado === 200 && lista.json && Array.isArray(lista.json.niveles);
  if (leeBd) resumen.niveles = lista.json.niveles.map((n) => n.nombre + ' (v' + n.version + ')');
  paso('La base de datos responde (lista de niveles)', leeBd,
    leeBd ? lista.json.niveles.length + ' niveles' : 'HTTP ' + lista.estado + ' · ' + lista.texto.slice(0, 160),
    'Revisen el enlace D1 «DB» del proyecto y vuelvan a publicar.');

  // 4. Clave del grupo
  paso('Clave del grupo activa en el servidor', true,
    resumen.requiereClave ? 'sí: crear, modificar y eliminar exigen la clave' : 'no: cualquiera con el enlace puede editar');
  if (!resumen.requiereClave && op.clave) {
    paso('El servidor conoce la clave indicada', false, 'el servidor no tiene CLAVE_GRUPO',
      'Definan CLAVE_GRUPO como «Secret» en el entorno Production (Settings → Variables and Secrets) y vuelvan a publicar (Deployments → Retry deployment). Las variables solo se aplican en una publicación nueva.');
  }
  if (resumen.requiereClave && op.clave) {
    const conClave = await pedir(obtener, unir(sitio, 'api/estado'), { headers: cab(true) });
    paso('La clave indicada es correcta', conClave.json && conClave.json.claveValida === true,
      'claveValida = ' + (conClave.json && conClave.json.claveValida),
      'La clave no coincide con CLAVE_GRUPO. Revisen mayúsculas y espacios, o vuelvan a definirla y publiquen de nuevo.');
  }

  // 5. Escritura (opcional)
  if (op.escribir) {
    const id = 'diagnostico-' + Date.now().toString(36);
    const nivel = { id, nombre: 'Prueba de diagnóstico (se elimina sola)', episodios: [] };
    const json = { 'Content-Type': 'application/json' };
    if (resumen.requiereClave) {
      const sin = await pedir(obtener, unir(sitio, 'api/niveles/' + id), { method: 'PUT', headers: json, body: JSON.stringify({ nivel, soloNuevo: true }) });
      paso('Sin clave, el servidor rechaza crear niveles', sin.estado === 401, 'HTTP ' + sin.estado,
        'El servidor aceptó una escritura sin clave: revisen CLAVE_GRUPO.');
      if (!op.clave) {
        paso('Prueba de escritura', false, 'falta la clave', 'Repitan con --clave LA-CLAVE para probar la escritura.');
        return { ok: pasos.every((p) => p.ok), pasos, resumen };
      }
    }
    const crear = await pedir(obtener, unir(sitio, 'api/niveles/' + id), { method: 'PUT', headers: Object.assign({}, json, cab(true)), body: JSON.stringify({ nivel, soloNuevo: true }) });
    const creado = crear.estado === 200 && crear.json && crear.json.version === 1;
    paso('Crear un nivel en el servidor', creado, 'HTTP ' + crear.estado + ' · ' + crear.texto.slice(0, 120),
      crear.estado === 401 ? 'La clave fue rechazada.' : 'La base de datos no aceptó la escritura: revisen el enlace D1 «DB».');
    if (creado) {
      const otro = await pedir(obtener, unir(sitio, 'api/niveles?resumen=1'), { headers: { 'Cache-Control': 'no-store' } });
      const visto = otro.json && otro.json.niveles.some((n) => n.id === id);
      paso('Otro dispositivo ve el nivel nuevo', !!visto, visto ? 'aparece en la lista' : 'no aparece',
        'La lista no refleja la escritura: puede haber una caché delante de /api. Revisen reglas de caché en Cloudflare.');
      const conf = await pedir(obtener, unir(sitio, 'api/niveles/' + id), { method: 'PUT', headers: Object.assign({}, json, cab(true)), body: JSON.stringify({ nivel, versionEsperada: 0 }) });
      paso('Dos personas guardando a la vez: conflicto detectado', conf.estado === 409, 'HTTP ' + conf.estado, 'El servidor no detectó el conflicto.');
      const img = await pedir(obtener, unir(sitio, 'api/imagenes'), { method: 'POST', headers: Object.assign({ 'Content-Type': 'image/png' }, cab(true)), body: PNG });
      paso('Subir una imagen', img.estado === 201 || img.estado === 200, 'HTTP ' + img.estado + ' · ' + img.texto.slice(0, 80), 'El servidor no aceptó la imagen.');
      const borrar = await pedir(obtener, unir(sitio, 'api/niveles/' + id), { method: 'DELETE', headers: cab(true) });
      paso('Eliminar el nivel de prueba', borrar.estado === 200, 'HTTP ' + borrar.estado, 'No se pudo eliminar el nivel de prueba «' + id + '»: elimínenlo desde el editor.');
    }
  }
  return { ok: pasos.every((p) => p.ok), pasos, resumen };
}

function imprimir(sitio, r) {
  console.log('Diagnóstico de ' + sitio + '\n');
  for (const p of r.pasos) {
    console.log((p.ok ? '  ✓ ' : '  ✗ ') + p.nombre + (p.detalle ? '  — ' + p.detalle : ''));
    if (p.arreglo) console.log('      Qué hacer: ' + p.arreglo);
  }
  console.log('\nModo del juego: ' + r.resumen.modo);
  if (r.resumen.requiereClave !== null) console.log('Clave del grupo: ' + (r.resumen.requiereClave ? 'activa' : 'no activa'));
  if (r.resumen.niveles) console.log('Niveles en el servidor (' + r.resumen.niveles.length + '): ' + (r.resumen.niveles.join(', ') || 'ninguno'));
  console.log('\n' + (r.ok ? 'Todo funciona.' : 'Hay problemas: sigan los «Qué hacer» de arriba, en orden.'));
}

async function main() {
  const args = process.argv.slice(2);
  const sitio = args.find((a) => /^https?:\/\//.test(a));
  const i = args.indexOf('--clave');
  const clave = i >= 0 ? args[i + 1] : '';
  if (!sitio) {
    console.error('Uso: npm run diagnosticar -- https://SU-SITIO [--clave LA-CLAVE] [--escribir] [--json]');
    process.exit(2);
  }
  const r = await diagnosticar(sitio, { clave, escribir: args.includes('--escribir') });
  if (args.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else imprimir(sitio, r);
  process.exit(r.ok ? 0 : 1);
}

if (require.main === module) main();
module.exports = { diagnosticar };
