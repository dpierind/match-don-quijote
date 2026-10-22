/*
 * El match con Don Quijote — almacenamiento persistente.
 * Usa IndexedDB del navegador con tres almacenes:
 *   niveles   — cada nivel completo (episodios, preguntas, tablero, configuración)
 *   imagenes  — imágenes subidas (Blob). Son inmutables: cambiar una imagen crea otra.
 *   partidas  — partidas guardadas, con la instantánea del nivel que usan.
 * Si el navegador no permite IndexedDB, funciona en memoria y lo indica (modo 'memoria').
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./niveles.js'));
  else root.AlmacenQuijote = factory(root.NivelesQuijote);
})(typeof self !== 'undefined' ? self : this, function (N) {
  'use strict';

  var NOMBRE_BD = 'match-quijote';
  var VERSION_BD = 1;
  var ALMACENES = ['niveles', 'imagenes', 'partidas'];

  class ErrorAlmacen extends Error {
    constructor(codigo, mensaje, extra) {
      super(mensaje);
      this.name = 'ErrorAlmacen';
      this.codigo = codigo;
      if (extra) Object.keys(extra).forEach(function (k) { this[k] = extra[k]; }, this);
    }
  }

  function traducir(e) {
    if (e instanceof ErrorAlmacen) return e;
    var nombre = e && e.name;
    var msg = (e && e.message) || '';
    if (nombre === 'QuotaExceededError' || /quota/i.test(msg)) {
      return new ErrorAlmacen('sin_espacio', 'No hay suficiente espacio en este navegador para guardar. Eliminen imágenes, niveles o partidas que no usen, o exporten una copia de seguridad antes de liberar espacio.');
    }
    if (nombre === 'InvalidStateError' || nombre === 'SecurityError' || nombre === 'NotAllowedError') {
      return new ErrorAlmacen('no_permitido', 'El navegador no permitió completar la operación (puede ser una ventana privada o un bloqueo de datos del sitio).');
    }
    return new ErrorAlmacen('fallo', 'No se pudo completar la operación de guardado' + (msg ? ': ' + msg : '') + '.');
  }

  // Copia profunda; los Blob de las imágenes se conservan tal cual (son inmutables).
  function clonar(v) {
    if (v && typeof v === 'object' && v.blob) {
      var resto = Object.assign({}, v); delete resto.blob;
      var c = JSON.parse(JSON.stringify(resto)); c.blob = v.blob; return c;
    }
    return v === undefined || v === null ? v : JSON.parse(JSON.stringify(v));
  }

  /* ---------- IndexedDB ---------- */

  function abrirIDB() {
    return new Promise(function (resolver, rechazar) {
      if (typeof indexedDB === 'undefined' || !indexedDB) {
        rechazar(new ErrorAlmacen('no_permitido', 'Este navegador no ofrece IndexedDB.'));
        return;
      }
      var r;
      try { r = indexedDB.open(NOMBRE_BD, VERSION_BD); } catch (e) { rechazar(traducir(e)); return; }
      r.onupgradeneeded = function () {
        var db = r.result;
        ALMACENES.forEach(function (s) { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' }); });
      };
      r.onsuccess = function () { resolver(r.result); };
      r.onerror = function () { rechazar(traducir(r.error)); };
      r.onblocked = function () {
        rechazar(new ErrorAlmacen('bloqueado', 'Hay otra pestaña con una versión anterior del juego abierta. Ciérrenla y vuelvan a cargar esta página.'));
      };
    });
  }

  function backendIDB(db) {
    // Ejecuta fn(store, terminar) dentro de una transacción. fn usa callbacks y llama terminar(valor).
    function tx(almacen, modo, fn) {
      return new Promise(function (resolver, rechazar) {
        var t, resultado, error = null;
        try { t = db.transaction(almacen, modo); } catch (e) { rechazar(traducir(e)); return; }
        t.oncomplete = function () { if (error) rechazar(error); else resolver(resultado); };
        t.onabort = function () { rechazar(error || traducir(t.error)); };
        t.onerror = function () { /* se resuelve en onabort */ };
        try {
          fn(t.objectStore(almacen), function (v) { resultado = v; }, function (e) { error = e; t.abort(); });
        } catch (e) { error = traducir(e); try { t.abort(); } catch (x) { /* ya abortada */ } }
      });
    }
    return {
      todos: function (a) { return tx(a, 'readonly', function (st, ok) { var r = st.getAll(); r.onsuccess = function () { ok(r.result); }; }); },
      claves: function (a) { return tx(a, 'readonly', function (st, ok) { var r = st.getAllKeys(); r.onsuccess = function () { ok(r.result); }; }); },
      obtener: function (a, id) { return tx(a, 'readonly', function (st, ok) { var r = st.get(id); r.onsuccess = function () { ok(r.result || null); }; }); },
      poner: function (a, v) { return tx(a, 'readwrite', function (st, ok) { st.put(v).onsuccess = function () { ok(v); }; }); },
      borrar: function (a, id) { return tx(a, 'readwrite', function (st, ok) { st.delete(id).onsuccess = function () { ok(true); }; }); },
      // Lee, comprueba y escribe en la misma transacción (evita carreras entre pestañas).
      actualizar: function (a, id, decidir) {
        return tx(a, 'readwrite', function (st, ok, fallar) {
          var r = st.get(id);
          r.onsuccess = function () {
            var nuevo;
            try { nuevo = decidir(r.result || null); } catch (e) { fallar(e); return; }
            st.put(nuevo).onsuccess = function () { ok(nuevo); };
          };
        });
      }
    };
  }

  /* ---------- Memoria (respaldo) ---------- */

  function backendMemoria() {
    var datos = {};
    ALMACENES.forEach(function (a) { datos[a] = new Map(); });
    return {
      todos: async function (a) { return Array.from(datos[a].values()).map(clonar); },
      claves: async function (a) { return Array.from(datos[a].keys()); },
      obtener: async function (a, id) { var v = datos[a].get(id); return v ? clonar(v) : null; },
      poner: async function (a, v) { datos[a].set(v.id, clonar(v)); return v; },
      borrar: async function (a, id) { datos[a].delete(id); return true; },
      actualizar: async function (a, id, decidir) {
        var actual = datos[a].get(id);
        var nuevo = decidir(actual ? clonar(actual) : null);
        datos[a].set(id, clonar(nuevo));
        return nuevo;
      }
    };
  }

  /* ---------- API ---------- */

  function crearApi(b, modo, motivo) {
    async function envolver(p) { try { return await p; } catch (e) { throw traducir(e); } }

    var api = {
      modo: modo,
      motivo: motivo || '',
      ErrorAlmacen: ErrorAlmacen,

      listarNiveles: function () { return envolver(b.todos('niveles')); },
      obtenerNivel: function (id) { return envolver(b.obtener('niveles', id)); },

      /*
       * Guarda un nivel y aumenta su versión. Si se indica versionEsperada y el nivel
       * guardado tiene otra versión (lo cambió otra pestaña), no sobrescribe: lanza
       * un ErrorAlmacen 'conflicto' con el nivel actual en .actual.
       */
      guardarNivel: function (nivel, op) {
        op = op || {};
        var copia = N.normalizarNivel(clonar(nivel));
        return envolver(b.actualizar('niveles', copia.id, function (actual) {
          if (op.versionEsperada !== undefined && op.versionEsperada !== null) {
            if (actual && actual.version !== op.versionEsperada) {
              throw new ErrorAlmacen('conflicto', 'Este nivel se guardó desde otra pestaña o ventana mientras lo editaban.', { actual: actual });
            }
            if (!actual && op.versionEsperada > 0) {
              throw new ErrorAlmacen('conflicto', 'Este nivel se eliminó desde otra pestaña o ventana mientras lo editaban.', { actual: null });
            }
          } else if (actual && op.soloNuevo) {
            throw new ErrorAlmacen('existe', 'Ya existe un nivel con ese identificador.', { actual: actual });
          }
          copia.version = (actual ? actual.version : (copia.version || 0)) + 1;
          copia.modificado = new Date().toISOString();
          if (!actual && !copia.creado) copia.creado = copia.modificado;
          return copia;
        }));
      },
      eliminarNivel: function (id) { return envolver(b.borrar('niveles', id)); },

      guardarImagen: function (datos) {
        var id = N.nuevoId('img');
        var reg = {
          id: id, blob: datos.blob, nombre: datos.nombre || '', tipo: datos.tipo || (datos.blob && datos.blob.type) || '',
          ancho: datos.ancho || 0, alto: datos.alto || 0, tamano: (datos.blob && datos.blob.size) || 0, creada: new Date().toISOString()
        };
        return envolver(b.poner('imagenes', reg)).then(function () { return id; });
      },
      obtenerImagen: function (id) { return envolver(b.obtener('imagenes', id)); },
      idsImagenes: function () { return envolver(b.claves('imagenes')); },
      eliminarImagen: function (id) { return envolver(b.borrar('imagenes', id)); },

      listarPartidas: function () { return envolver(b.todos('partidas')); },
      obtenerPartida: function (id) { return envolver(b.obtener('partidas', id)); },
      guardarPartida: function (reg) { return envolver(b.poner('partidas', clonar(reg))); },
      eliminarPartida: function (id) { return envolver(b.borrar('partidas', id)); },

      // Elimina imágenes que ningún nivel, partida guardada ni borrador abierto utiliza.
      limpiarHuerfanas: async function (refsExtra) {
        var usadas = {};
        (refsExtra || []).forEach(function (id) { usadas[id] = true; });
        var niveles = await api.listarNiveles();
        niveles.forEach(function (n) { N.referenciasImagen(n).forEach(function (id) { usadas[id] = true; }); });
        var partidas = await api.listarPartidas();
        partidas.forEach(function (p) {
          var eps = (p.estado && p.estado.episodios) || {};
          Object.keys(eps).forEach(function (k) { var id = N.idImagen(eps[k].imagen); if (id) usadas[id] = true; });
        });
        var ids = await api.idsImagenes();
        var borradas = 0;
        for (var i = 0; i < ids.length; i++) {
          if (!usadas[ids[i]]) { await api.eliminarImagen(ids[i]); borradas++; }
        }
        return borradas;
      },

      estimacion: async function () {
        try {
          if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
            return await navigator.storage.estimate();
          }
        } catch (e) { /* no disponible */ }
        return null;
      },
      estaPersistido: async function () {
        try { if (navigator.storage && navigator.storage.persisted) return await navigator.storage.persisted(); } catch (e) { /* no disponible */ }
        return null;
      },
      pedirPersistencia: async function () {
        try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { /* no disponible */ }
        return null;
      }
    };
    return api;
  }

  async function abrir(op) {
    op = op || {};
    if (op.forzarMemoria) return crearApi(backendMemoria(), 'memoria', 'modo de prueba');
    try {
      var db = await abrirIDB();
      return crearApi(backendIDB(db), 'indexeddb', '');
    } catch (e) {
      var err = traducir(e);
      return crearApi(backendMemoria(), 'memoria', err.message);
    }
  }

  return { abrir: abrir, ErrorAlmacen: ErrorAlmacen };
});
