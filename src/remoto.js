/*
 * El match con Don Quijote — almacenamiento compartido en el servidor.
 *
 * Ofrece la misma interfaz que db.js, para que el editor y el juego no cambien:
 *   - niveles e imágenes → servidor (src/servidor/api.js), los ven todos;
 *   - partidas y preferencias → este navegador (IndexedDB, mediante el almacén local).
 * Los errores llegan como ErrorAlmacen con los mismos códigos (conflicto, existe…) más:
 *   clave (falta la clave del grupo), sin_conexion, muy_grande, formato.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./db.js'), require('./niveles.js'));
  else root.RemotoQuijote = factory(root.AlmacenQuijote, root.NivelesQuijote);
})(typeof self !== 'undefined' ? self : this, function (A, N) {
  'use strict';

  var ErrorAlmacen = A.ErrorAlmacen;
  var ESPERA_MS = 20000;

  /*
   * op: {
   *   local: almacén local (db.js) para partidas,
   *   base: prefijo de la API (por defecto 'api/', relativo a la página),
   *   clave: function () → clave del grupo o '',
   *   fetch: implementación de fetch (para pruebas)
   * }
   */
  function crear(op) {
    op = op || {};
    var local = op.local;
    var base = op.base || 'api/';
    var obtener = op.fetch || function (u, i) { return fetch(u, i); };

    async function pedir(metodo, ruta, cuerpo, tipo) {
      var cab = {};
      var clave = op.clave ? op.clave() : '';
      if (clave) cab['X-Clave-Grupo'] = clave;
      var init = { method: metodo, headers: cab, cache: 'no-store' };
      if (cuerpo !== undefined) {
        if (tipo) { init.body = cuerpo; cab['Content-Type'] = tipo; }
        else { init.body = JSON.stringify(cuerpo); cab['Content-Type'] = 'application/json'; }
      }
      var control = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var temporizador = control ? setTimeout(function () { control.abort(); }, ESPERA_MS) : null;
      if (control) init.signal = control.signal;
      var r;
      try {
        r = await obtener(base + ruta, init);
      } catch (e) {
        throw new ErrorAlmacen('sin_conexion', 'No hay conexión con el servidor del juego. Revisen la conexión a internet e inténtenlo de nuevo.');
      } finally {
        if (temporizador) clearTimeout(temporizador);
      }
      return r;
    }

    async function leerJson(r) {
      try { return await r.json(); } catch (e) { return null; }
    }

    async function fallo(r) {
      var d = await leerJson(r) || {};
      var codigo = d.codigo || (r.status === 401 ? 'clave' : r.status === 413 ? 'muy_grande' : 'fallo');
      var mensaje = d.mensaje || ('El servidor respondió con un error (' + r.status + ').');
      var extra = Object.prototype.hasOwnProperty.call(d, 'actual') ? { actual: d.actual } : null;
      return new ErrorAlmacen(codigo, mensaje, extra);
    }

    async function pedirJson(metodo, ruta, cuerpo) {
      var r = await pedir(metodo, ruta, cuerpo);
      if (!r.ok) throw await fallo(r);
      return leerJson(r);
    }

    var api = {
      modo: 'servidor',
      motivo: '',
      local: local,
      ErrorAlmacen: ErrorAlmacen,

      estado: function () { return pedirJson('GET', 'estado'); },
      resumenNiveles: async function () { return (await pedirJson('GET', 'niveles?resumen=1')).niveles; },

      listarNiveles: async function () { return (await pedirJson('GET', 'niveles')).niveles; },
      obtenerNivel: async function (id) {
        var r = await pedir('GET', 'niveles/' + encodeURIComponent(id));
        if (r.status === 404) return null;
        if (!r.ok) throw await fallo(r);
        return leerJson(r);
      },
      guardarNivel: function (nivel, opciones) {
        opciones = opciones || {};
        var n = N.normalizarNivel(JSON.parse(JSON.stringify(nivel)));
        var cuerpo = { nivel: n };
        if (opciones.versionEsperada !== undefined && opciones.versionEsperada !== null) cuerpo.versionEsperada = opciones.versionEsperada;
        if (opciones.soloNuevo) cuerpo.soloNuevo = true;
        return pedirJson('PUT', 'niveles/' + encodeURIComponent(n.id), cuerpo);
      },
      eliminarNivel: async function (id) {
        var r = await pedir('DELETE', 'niveles/' + encodeURIComponent(id));
        if (!r.ok && r.status !== 404) throw await fallo(r);
        return true;
      },

      guardarImagen: async function (datos) {
        var tipo = datos.tipo || (datos.blob && datos.blob.type) || 'image/png';
        var r = await pedir('POST', 'imagenes', datos.blob, tipo);
        if (!r.ok) throw await fallo(r);
        return (await leerJson(r)).id;
      },
      obtenerImagen: async function (id) {
        var r = await pedir('GET', 'imagenes/' + encodeURIComponent(id));
        if (r.status === 404) return null;
        if (!r.ok) throw await fallo(r);
        var blob = await r.blob();
        return { id: id, blob: blob, tipo: blob.type, nombre: '', ancho: 0, alto: 0, tamano: blob.size };
      },
      idsImagenes: async function () { return (await pedirJson('GET', 'imagenes')).ids; },
      // Las imágenes compartidas no se borran desde un navegador: otro nivel o partida puede usarlas.
      eliminarImagen: async function () { return false; },
      limpiarHuerfanas: function (refs) { return local ? local.limpiarHuerfanas(refs) : Promise.resolve(0); },

      listarPartidas: function () { return local.listarPartidas(); },
      obtenerPartida: function (id) { return local.obtenerPartida(id); },
      guardarPartida: function (reg) { return local.guardarPartida(reg); },
      eliminarPartida: function (id) { return local.eliminarPartida(id); },

      estimacion: function () { return local ? local.estimacion() : Promise.resolve(null); },
      estaPersistido: function () { return local ? local.estaPersistido() : Promise.resolve(null); },
      pedirPersistencia: function () { return local ? local.pedirPersistencia() : Promise.resolve(null); }
    };
    return api;
  }

  /*
   * Comprueba si la página se sirve junto con la API del juego.
   * Devuelve { estado } si hay servidor, { sinServidor: true } si no existe (sitio estático o
   * archivo local) o { error } si existe pero no responde bien.
   */
  async function detectar(op) {
    op = op || {};
    var base = op.base || 'api/';
    var obtener = op.fetch || function (u, i) { return fetch(u, i); };
    if (op.protocolo && !/^https?:$/.test(op.protocolo)) return { sinServidor: true };
    var control = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = control ? setTimeout(function () { control.abort(); }, op.esperaMs || 6000) : null;
    try {
      var r = await obtener(base + 'estado', { cache: 'no-store', signal: control ? control.signal : undefined });
      if (r.status === 404 || r.status === 405) return { sinServidor: true };
      var d = null;
      try { d = await r.json(); } catch (e) { d = null; }
      if (d && d.estatico) return { sinServidor: true };  // src/api/estado: sitio publicado sin servidor
      if (r.ok && d && d.servicio === 'match-quijote') return { estado: d };
      if (!d) return { sinServidor: true };  // respuesta que no es de este juego (p. ej., una página HTML)
      return { error: d.mensaje || ('El servidor respondió con un error (' + r.status + ').') };
    } catch (e) {
      return { error: 'No se pudo conectar con el servidor del juego.' };
    } finally {
      if (t) clearTimeout(t);
    }
  }

  return { crear: crear, detectar: detectar };
});
