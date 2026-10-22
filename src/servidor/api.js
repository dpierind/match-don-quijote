/*
 * El match con Don Quijote — API del servidor compartido.
 *
 * Guarda los niveles y sus imágenes en una base de datos (Cloudflare D1 o SQLite local) para que
 * todos los que abren el juego vean los mismos niveles. Cualquiera puede crear, modificar o
 * eliminar niveles; si se define la variable CLAVE_GRUPO, las escrituras exigen esa clave.
 *
 * Rutas (todas bajo …/api/):
 *   GET    estado                  → { ok, servicio, versionApi, requiereClave, claveValida?, ahora }
 *   GET    niveles                 → { niveles: [nivel completo] }
 *   GET    niveles?resumen=1       → { niveles: [{ id, version, nombre, modificado }] }
 *   GET    niveles/<id>            → nivel | 404
 *   PUT    niveles/<id>            ← { nivel, versionEsperada?, soloNuevo? } → nivel guardado | 409 conflicto/existe
 *   DELETE niveles/<id>            → { ok } (lo retira; queda en el historial)
 *   GET    imagenes                → { ids: [...] }
 *   POST   imagenes                ← bytes de la imagen (Content-Type) → { id }
 *   GET    imagenes/<id>           → bytes de la imagen
 *
 * Errores: { codigo, mensaje } con códigos clave, conflicto, existe, no_encontrado, muy_grande,
 * formato, solicitud, metodo, fallo.
 *
 * Este archivo no usa nada propio de Node ni de Cloudflare: recibe un Request y devuelve un
 * Response. functions/api/[[ruta]].js lo conecta con Cloudflare Pages y
 * src/tools/servidor-local.js con Node. No se publica como parte del sitio.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../niveles.js'));
  else root.ApiQuijote = factory(root.NivelesQuijote);
})(typeof self !== 'undefined' ? self : this, function (N) {
  'use strict';

  var VERSION_API = 1;
  var MAX_NIVEL = 1500000;            // bytes del JSON de un nivel
  var MAX_IMAGEN = 1400000;           // bytes de una imagen (se guarda en base64 dentro de la base de datos)
  var HISTORIAL_POR_NIVEL = 50;       // versiones anteriores que se conservan por nivel
  var TIPOS = { 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/jpeg': [0xff, 0xd8, 0xff], 'image/gif': [0x47, 0x49, 0x46, 0x38], 'image/webp': [0x52, 0x49, 0x46, 0x46] };

  var ESQUEMA = [
    'CREATE TABLE IF NOT EXISTS niveles (id TEXT PRIMARY KEY, version INTEGER NOT NULL, nombre TEXT NOT NULL, modificado TEXT NOT NULL, eliminado INTEGER NOT NULL DEFAULT 0, contenido TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS historial (id TEXT NOT NULL, version INTEGER NOT NULL, modificado TEXT NOT NULL, contenido TEXT NOT NULL, PRIMARY KEY (id, version))',
    'CREATE TABLE IF NOT EXISTS imagenes (id TEXT PRIMARY KEY, tipo TEXT NOT NULL, tamano INTEGER NOT NULL, datos TEXT NOT NULL, creada TEXT NOT NULL)'
  ];
  var esquemaListo = new WeakSet();

  async function asegurarEsquema(db) {
    if (esquemaListo.has(db)) return;
    await db.batch(ESQUEMA.map(function (sql) { return db.prepare(sql); }));
    esquemaListo.add(db);
  }

  /* ---------- Respuestas ---------- */

  function json(datos, estado, extra) {
    var h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    return new Response(JSON.stringify(datos), { status: estado || 200, headers: h });
  }
  function error(estado, codigo, mensaje, extra) {
    var cuerpo = { codigo: codigo, mensaje: mensaje };
    if (extra) Object.keys(extra).forEach(function (k) { cuerpo[k] = extra[k]; });
    return json(cuerpo, estado);
  }

  /* ---------- Utilidades ---------- */

  function bytesABase64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function base64ABytes(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  async function sha256(bytes) {
    var h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return Array.from(h).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  function coincideFirma(bytes, tipo) {
    var f = TIPOS[tipo];
    if (!f || bytes.length < 12) return false;
    for (var i = 0; i < f.length; i++) if (bytes[i] !== f[i]) return false;
    if (tipo === 'image/webp') return String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === 'WEBP';
    return true;
  }
  function idValido(id) { return typeof id === 'string' && /^[A-Za-z0-9._~-]{1,80}$/.test(id); }

  function autorizado(request, env) {
    var clave = env && env.CLAVE_GRUPO;
    if (!clave) return true;
    return request.headers.get('X-Clave-Grupo') === String(clave);
  }

  function filaANivel(fila) {
    if (!fila || fila.eliminado) return null;
    return JSON.parse(fila.contenido);
  }

  /* ---------- Niveles ---------- */

  async function listarNiveles(db, resumen) {
    if (resumen) {
      var r = await db.prepare('SELECT id, version, nombre, modificado FROM niveles WHERE eliminado = 0 ORDER BY modificado DESC').all();
      return json({ niveles: r.results || [] });
    }
    var t = await db.prepare('SELECT contenido, eliminado FROM niveles WHERE eliminado = 0 ORDER BY modificado DESC').all();
    return json({ niveles: (t.results || []).map(filaANivel) });
  }

  async function obtenerNivel(db, id) {
    var fila = await db.prepare('SELECT contenido, eliminado FROM niveles WHERE id = ?').bind(id).first();
    var n = filaANivel(fila);
    return n ? json(n) : error(404, 'no_encontrado', 'Ese nivel no existe o fue eliminado.');
  }

  async function guardarNivel(db, id, cuerpo) {
    if (!cuerpo || typeof cuerpo.nivel !== 'object' || !cuerpo.nivel) return error(400, 'solicitud', 'Falta el nivel.');
    var esperada = cuerpo.versionEsperada;
    var fila = await db.prepare('SELECT version, contenido, eliminado FROM niveles WHERE id = ?').bind(id).first();
    var vivo = fila && !fila.eliminado;

    if (cuerpo.soloNuevo && vivo) {
      return error(409, 'existe', 'Ya existe un nivel con ese identificador.', { actual: filaANivel(fila) });
    }
    if (esperada !== undefined && esperada !== null) {
      if (vivo && fila.version !== esperada) {
        return error(409, 'conflicto', 'Otra persona guardó este nivel mientras lo editaban.', { actual: filaANivel(fila) });
      }
      if (!vivo && esperada > 0) {
        return error(409, 'conflicto', 'Otra persona eliminó este nivel mientras lo editaban.', { actual: null });
      }
    }

    var nivel = N.normalizarNivel(cuerpo.nivel);
    nivel.id = id;
    nivel.version = (fila ? fila.version : 0) + 1;
    nivel.modificado = new Date().toISOString();
    if (!vivo && !cuerpo.nivel.creado) nivel.creado = nivel.modificado;
    var contenido = JSON.stringify(nivel);
    if (contenido.length > MAX_NIVEL) return error(413, 'muy_grande', 'El nivel es demasiado grande para guardarlo.');

    var escritura = fila
      ? db.prepare('UPDATE niveles SET version = ?, nombre = ?, modificado = ?, eliminado = 0, contenido = ? WHERE id = ? AND version = ?')
        .bind(nivel.version, nivel.nombre, nivel.modificado, contenido, id, fila.version)
      : db.prepare('INSERT INTO niveles (id, version, nombre, modificado, eliminado, contenido) VALUES (?, ?, ?, ?, 0, ?)')
        .bind(id, nivel.version, nivel.nombre, nivel.modificado, contenido);
    var resultado;
    try {
      resultado = await db.batch([
        escritura,
        // Copia al historial solo si la escritura anterior realmente se aplicó.
        db.prepare('INSERT OR REPLACE INTO historial (id, version, modificado, contenido) SELECT id, version, modificado, contenido FROM niveles WHERE id = ? AND version = ?').bind(id, nivel.version),
        db.prepare('DELETE FROM historial WHERE id = ? AND version <= ?').bind(id, nivel.version - HISTORIAL_POR_NIVEL)
      ]);
    } catch (e) {
      resultado = null; // otra escritura simultánea creó el nivel primero
    }
    var cambios = resultado && resultado[0] && resultado[0].meta ? resultado[0].meta.changes : 0;
    if (!cambios) {
      var ahora = await db.prepare('SELECT version, contenido, eliminado FROM niveles WHERE id = ?').bind(id).first();
      return error(409, 'conflicto', 'Otra persona guardó este nivel al mismo tiempo.', { actual: filaANivel(ahora) });
    }
    return json(nivel);
  }

  async function eliminarNivel(db, id) {
    var r = await db.prepare('UPDATE niveles SET eliminado = 1, version = version + 1, modificado = ? WHERE id = ? AND eliminado = 0')
      .bind(new Date().toISOString(), id).run();
    if (!r.meta || !r.meta.changes) return error(404, 'no_encontrado', 'Ese nivel no existe o ya fue eliminado.');
    return json({ ok: true });
  }

  /* ---------- Imágenes ---------- */

  async function subirImagen(db, request) {
    var tipo = String(request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!TIPOS[tipo]) return error(415, 'formato', 'Formato de imagen no admitido. Usen PNG, JPEG, WebP o GIF.');
    var bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length) return error(400, 'solicitud', 'La imagen está vacía.');
    if (bytes.length > MAX_IMAGEN) return error(413, 'muy_grande', 'La imagen pesa más de 1,4 MB. Usen una imagen más liviana.');
    if (!coincideFirma(bytes, tipo)) return error(415, 'formato', 'El archivo no parece una imagen ' + tipo.split('/')[1].toUpperCase() + '.');
    var id = 'h' + (await sha256(bytes)).slice(0, 32);
    await db.prepare('INSERT OR IGNORE INTO imagenes (id, tipo, tamano, datos, creada) VALUES (?, ?, ?, ?, ?)')
      .bind(id, tipo, bytes.length, bytesABase64(bytes), new Date().toISOString()).run();
    return json({ id: id, tipo: tipo, tamano: bytes.length }, 201);
  }

  async function obtenerImagen(db, id) {
    var fila = await db.prepare('SELECT tipo, datos FROM imagenes WHERE id = ?').bind(id).first();
    if (!fila) return error(404, 'no_encontrado', 'Esa imagen no existe.');
    // El identificador depende del contenido: la imagen nunca cambia y se puede guardar en caché.
    return new Response(base64ABytes(fila.datos), {
      status: 200,
      headers: { 'Content-Type': fila.tipo, 'Cache-Control': 'public, max-age=31536000, immutable' }
    });
  }

  async function listarImagenes(db) {
    var r = await db.prepare('SELECT id FROM imagenes').all();
    return json({ ids: (r.results || []).map(function (f) { return f.id; }) });
  }

  /* ---------- Enrutador ---------- */

  async function manejar(request, env) {
    var db = env && env.DB;
    if (!db) return error(500, 'fallo', 'El servidor no tiene una base de datos configurada (falta el enlace «DB»).');
    var url = new URL(request.url);
    var i = url.pathname.indexOf('/api/');
    var partes = (i >= 0 ? url.pathname.slice(i + 5) : '').split('/').filter(Boolean).map(decodeURIComponent);
    var metodo = request.method.toUpperCase();
    var escribe = metodo === 'PUT' || metodo === 'POST' || metodo === 'DELETE';

    try {
      if (partes[0] === 'estado' && partes.length === 1 && metodo === 'GET') {
        await asegurarEsquema(db);
        var requiere = !!(env && env.CLAVE_GRUPO);
        var estado = { ok: true, servicio: 'match-quijote', versionApi: VERSION_API, requiereClave: requiere, ahora: new Date().toISOString() };
        // Si se envió una clave, se informa si es correcta (sirve para avisar al escribirla).
        if (requiere && request.headers.get('X-Clave-Grupo')) estado.claveValida = autorizado(request, env);
        return json(estado);
      }
      if (escribe && !autorizado(request, env)) {
        return error(401, 'clave', 'Falta la clave del grupo o es incorrecta. Escríbanla en el Editor de niveles.');
      }
      await asegurarEsquema(db);

      if (partes[0] === 'niveles') {
        if (partes.length === 1 && metodo === 'GET') return listarNiveles(db, url.searchParams.get('resumen') === '1');
        if (partes.length === 2) {
          var id = partes[1];
          if (!idValido(id)) return error(400, 'solicitud', 'Identificador de nivel no válido.');
          if (metodo === 'GET') return obtenerNivel(db, id);
          if (metodo === 'PUT') {
            var texto = await request.text();
            if (texto.length > MAX_NIVEL * 1.2) return error(413, 'muy_grande', 'El nivel es demasiado grande para guardarlo.');
            var cuerpo;
            try { cuerpo = JSON.parse(texto); } catch (e) { return error(400, 'solicitud', 'El cuerpo no es un JSON válido.'); }
            return guardarNivel(db, id, cuerpo);
          }
          if (metodo === 'DELETE') return eliminarNivel(db, id);
        }
      }
      if (partes[0] === 'imagenes') {
        if (partes.length === 1 && metodo === 'GET') return listarImagenes(db);
        if (partes.length === 1 && metodo === 'POST') return subirImagen(db, request);
        if (partes.length === 2 && metodo === 'GET') {
          if (!idValido(partes[1])) return error(400, 'solicitud', 'Identificador de imagen no válido.');
          return obtenerImagen(db, partes[1]);
        }
      }
      return error(partes.length ? 405 : 404, partes.length ? 'metodo' : 'no_encontrado', 'Ruta o método no disponible: ' + metodo + ' /api/' + partes.join('/'));
    } catch (e) {
      return error(500, 'fallo', 'Error del servidor: ' + ((e && e.message) || e));
    }
  }

  return { manejar: manejar, VERSION_API: VERSION_API, MAX_IMAGEN: MAX_IMAGEN, ESQUEMA: ESQUEMA };
});
