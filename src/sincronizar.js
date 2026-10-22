/*
 * El match con Don Quijote — niveles incluidos en el juego.
 *
 * Los niveles aprobados pueden publicarse junto con el juego, en src/niveles/:
 *   niveles/indice.js        window.NIVELES_INCLUIDOS = [{ id, nombre, huella, archivo, episodios }]
 *   niveles/<archivo>.js     datos del nivel con sus imágenes embebidas (los genera «npm run incluir»)
 *
 * Al abrir el juego, sincronizar() compara cada nivel incluido con el que hay en este navegador:
 *   - si no existe, lo instala;
 *   - si es exactamente la versión que se exportó (el navegador de quien lo creó), solo lo vincula;
 *   - si existe sin cambios locales y llegó una versión nueva (otra huella), lo actualiza;
 *   - si alguien lo editó en este navegador, guarda esa versión como copia y luego lo actualiza;
 *   - si el nivel local nunca vino del juego y es más reciente que el publicado (quien lo creó
 *     siguió editándolo), no lo toca.
 * Nunca borra niveles ni partidas: las partidas usan su propia copia del nivel.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./niveles.js'));
  else root.SincronizarQuijote = factory(root.NivelesQuijote);
})(typeof self !== 'undefined' ? self : this, function (N) {
  'use strict';

  function base64ABytes(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // Convierte las imágenes embebidas en imágenes guardadas (img:<id>).
  async function guardarImagenes(nivel, imagenes, db) {
    var mapa = {};
    for (var i = 0; i < nivel.episodios.length; i++) {
      var e = nivel.episodios[i];
      var img = e.imagen && imagenes[e.imagen];
      if (!img) continue;
      if (!mapa[e.imagen]) {
        var blob = new Blob([base64ABytes(img.datos)], { type: img.tipo });
        var id = await db.guardarImagen({ blob: blob, tipo: img.tipo, nombre: e.imagen.split('/').pop() });
        mapa[e.imagen] = 'img:' + id;
      }
      e.imagen = mapa[e.imagen];
    }
  }

  // Firma del contenido de un nivel, sin datos de este navegador (versión, fechas, ids de imagen).
  function firma(nivel) {
    var n = N.normalizarNivel(N.copia(nivel));
    return JSON.stringify({
      nombre: n.nombre, descripcion: n.descripcion, config: n.config, tablero: n.tablero,
      episodios: n.episodios.map(function (e) { var c = N.copia(e); c.imagen = e.imagen ? 'imagen' : ''; return c; })
    });
  }

  /*
   * op: { db, indice: [entradas], cargarDatos: async (entrada) => datos }
   * Devuelve { instalados[], actualizados[], vinculados[], omitidos[], conservados[{ nombre, copia }],
   *            sinCambios, errores[] }.
   */
  async function sincronizar(op) {
    var db = op.db;
    var informe = { instalados: [], actualizados: [], vinculados: [], omitidos: [], conservados: [], sinCambios: 0, errores: [] };
    var indice = Array.isArray(op.indice) ? op.indice : [];
    for (var k = 0; k < indice.length; k++) {
      var entrada = indice[k];
      try {
        if (!entrada || !entrada.id || !entrada.huella || !entrada.archivo) throw new Error('la entrada del índice está incompleta');
        var actual = await db.obtenerNivel(entrada.id);
        if (actual && actual.origen && actual.origen.id === actual.id && actual.origen.huella === entrada.huella) {
          informe.sinCambios++;
          continue;
        }
        var datos = await op.cargarDatos(entrada);
        if (!datos || !datos.nivel || datos.huella !== entrada.huella) {
          throw new Error('el archivo ' + entrada.archivo + ' no corresponde al índice; vuelvan a ejecutar «npm run incluir»');
        }

        var publicado = datos.nivel;
        if (actual) {
          // Navegador de quien lo exportó: el nivel guardado es exactamente el publicado.
          if (actual.version === publicado.version && actual.modificado === publicado.modificado && firma(actual) === firma(publicado)) {
            actual.origen = { id: entrada.id, huella: entrada.huella, versionLocal: actual.version + 1, instalado: new Date().toISOString() };
            await db.guardarNivel(actual, { versionEsperada: actual.version });
            informe.vinculados.push(actual.nombre);
            continue;
          }
          // Nivel creado aquí y editado después de exportarlo: es trabajo sin publicar.
          if (!N.esIncluido(actual) && String(actual.modificado) > String(publicado.modificado)) {
            informe.omitidos.push(actual.nombre);
            continue;
          }
        }

        // Conserva los cambios hechos en este navegador antes de reemplazar.
        if (actual && (!N.esIncluido(actual) || N.editadoLocalmente(actual))) {
          var c = N.copia(actual);
          c.id = N.nuevoId('nivel');
          c.nombre = actual.nombre + ' (mis cambios)';
          c.version = 0;
          c.origen = null;
          c.creado = new Date().toISOString();
          var guardada = await db.guardarNivel(c, { soloNuevo: true });
          informe.conservados.push({ nombre: actual.nombre, copia: guardada.nombre });
        }

        var nivel = N.normalizarNivel(N.copia(datos.nivel));
        await guardarImagenes(nivel, datos.imagenes || {}, db);
        nivel.id = entrada.id;
        nivel.version = 0;   // la versión del autor no cuenta: la numeración es de este navegador
        nivel.creado = actual ? actual.creado : new Date().toISOString();
        var siguiente = (actual ? actual.version : 0) + 1;
        nivel.origen = { id: entrada.id, huella: entrada.huella, versionLocal: siguiente, instalado: new Date().toISOString() };
        await db.guardarNivel(nivel, actual ? { versionEsperada: actual.version } : { soloNuevo: true });
        (actual ? informe.actualizados : informe.instalados).push(nivel.nombre);
      } catch (e) {
        // Otra pestaña lo instaló al mismo tiempo: no es un error.
        if (e && (e.codigo === 'existe' || e.codigo === 'conflicto')) continue;
        // Servidor con clave y visitante sin ella: lo instalará quien tenga la clave.
        if (e && e.codigo === 'clave') continue;
        informe.errores.push('«' + ((entrada && entrada.nombre) || (entrada && entrada.id) || 'nivel') + '»: ' + ((e && e.message) || e));
      }
    }
    return informe;
  }

  return { sincronizar: sincronizar, base64ABytes: base64ABytes, firma: firma };
});
