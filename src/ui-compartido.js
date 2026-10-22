/*
 * El match con Don Quijote — interfaz del modo compartido.
 * Solo actúa cuando el juego encontró su servidor (Q.compartido()):
 *   - refresca las listas de niveles mientras otra persona crea o modifica niveles;
 *   - en el editor, carga la versión nueva si otra persona guardó y aquí no hay cambios pendientes;
 *   - pide y guarda la clave del grupo cuando el servidor la exige;
 *   - permite subir al servidor los niveles que quedaron solo en este navegador.
 */
(function () {
  'use strict';

  var Q = window.Quijote, N = Q.N, esc = Q.esc;
  var C = Q.ui.c = { pidiendoClave: false, claveTexto: '', avisoEliminado: '', revisando: false };
  var INTERVALO_MS = 8000;

  Q.claveGrupo = function () { return Q.preferencias.leer('claveGrupo', ''); };

  /* ---------- Avisos ---------- */

  Q.avisoServidor = function () {
    if (!Q.servidorError) return '';
    return '<div class="caja caja-aviso aviso-almacen" role="alert"><strong>No hay conexión con el servidor del juego.</strong> ' +
      'Pueden jugar, pero los niveles que creen ahora quedarán solo en este navegador. (' + esc(Q.servidorError) + ') ' +
      '<button class="btn btn-chico" data-accion="reintentar-servidor">Reintentar</button></div>';
  };
  Q.acciones['reintentar-servidor'] = function () { location.reload(); };

  Q.bandaCompartida = function () {
    if (!Q.compartido()) return '';
    var clave = '';
    if (Q.servidor && Q.servidor.requiereClave) {
      clave = Q.claveGrupo()
        ? ' <span class="chip chip-ok">Clave del grupo guardada</span> <button class="btn btn-sutil btn-chico" data-accion="pedir-clave">Cambiar clave</button>'
        : ' <strong>Para crear o modificar niveles necesitan la clave del grupo.</strong> <button class="btn btn-chico" data-accion="pedir-clave">Escribir la clave</button>';
    }
    return '<div class="caja caja-compartida"><strong>Niveles compartidos.</strong> Lo que creen o modifiquen aquí lo ven en pocos segundos todos los que usan el juego.' + clave + '</div>';
  };

  /* ---------- Clave del grupo ---------- */

  Q.pedirClave = function () { C.pidiendoClave = true; C.claveTexto = Q.claveGrupo(); };
  Q.acciones['pedir-clave'] = function () { Q.pedirClave(); };
  Q.acciones['cerrar-clave'] = function () { C.pidiendoClave = false; };
  Q.alEscribir.clave = function (c, el) { C.claveTexto = el.value; };
  Q.formularios.clave = async function () {
    var v = String(C.claveTexto || '').trim();
    if (!v) { Q.toast('Escriban la clave del grupo.', 'error'); return; }
    Q.preferencias.guardar('claveGrupo', v);
    var estado;
    try { estado = await Q.db.estado(); } catch (e) { Q.mostrarError(e); return; }
    if (estado.requiereClave && estado.claveValida === false) {
      Q.preferencias.guardar('claveGrupo', '');
      Q.toast('Esa clave no es correcta. Pídanla a quien configuró el juego.', 'error');
      return;
    }
    C.pidiendoClave = false;
    Q.toast('Clave guardada en este navegador. Ya pueden crear y modificar niveles.');
    if (Q.ed && Q.ed.nivel && Q.ed.sucio && Q.guardarNivelEditor) Q.guardarNivelEditor({ auto: true });
  };
  Q.capas.push(function () {
    if (!C.pidiendoClave) return '';
    return '<div class="velo"><form class="panel" data-form="clave" role="dialog" aria-modal="true" aria-labelledby="t-clave" style="width:min(520px,100%)" novalidate>' +
      '<h2 id="t-clave">Clave del grupo</h2>' +
      '<p>Para crear, modificar o eliminar niveles compartidos hace falta la clave que definieron al configurar el juego. Jugar no la necesita.</p>' +
      '<div class="campo"><label for="clave-grupo">Clave</label><input id="clave-grupo" data-campo="clave.texto" data-foco="clave-grupo" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(C.claveTexto) + '"></div>' +
      '<p class="nota">Se guarda solo en este navegador.</p>' +
      '<div class="fila-botones"><button type="submit" class="btn btn-primario">Guardar clave</button><button type="button" class="btn" data-accion="cerrar-clave">Cancelar</button></div>' +
      '</form></div>';
  });
  Q.alEscape.push(function () { if (C.pidiendoClave) { C.pidiendoClave = false; return true; } return false; });

  /* ---------- Niveles que quedaron solo en este navegador ---------- */

  Q.seccionSoloLocales = function (lista) {
    if (!Q.compartido() || !lista.length) return '';
    var filas = lista.map(function (n) {
      return '<li class="nivel-fila"><div class="info"><strong>' + esc(n.nombre) + '</strong>' +
        '<span class="nota">' + Q.plural(n.episodios.length, 'episodio', 'episodios') + ' · modificado ' + Q.fecha(n.modificado) + '</span></div>' +
        '<button class="btn btn-chico" data-accion="subir-local" data-id="' + esc(n.id) + '">Subir al servidor</button></li>';
    }).join('');
    return '<section class="solo-locales"><h2 class="subtitulo">Solo en este navegador</h2>' +
      '<p class="nota">Estos niveles se crearon sin conexión con el servidor y nadie más los ve. Súbanlos para compartirlos.</p>' +
      '<ul class="lista-niveles">' + filas + '</ul></section>';
  };

  Q.acciones['subir-local'] = function (d) {
    Q.confirmar({
      titulo: 'Subir al servidor', si: 'Subir',
      texto: 'El nivel y sus imágenes pasarán al servidor y todos los verán. Después se quitará la copia que está solo en este navegador.',
      alSi: async function () {
        var orig = await Q.dbLocal.obtenerNivel(d.id);
        if (!orig) { Q.toast('Ese nivel ya no está en este navegador.', 'error'); return; }
        var n = N.copia(orig);
        var mapa = {};
        for (var i = 0; i < n.episodios.length; i++) {
          var e = n.episodios[i];
          var id = N.idImagen(e.imagen);
          if (!id) continue;
          if (!mapa[id]) {
            var reg = await Q.dbLocal.obtenerImagen(id);
            mapa[id] = reg && reg.blob ? 'img:' + await Q.db.guardarImagen({ blob: reg.blob, tipo: reg.tipo || reg.blob.type }) : '';
          }
          e.imagen = mapa[id];
        }
        n.version = 0;
        n.origen = null;
        var guardado;
        try {
          guardado = await Q.db.guardarNivel(n, { soloNuevo: true });
        } catch (e) {
          if (e.codigo !== 'existe') throw e;
          n.id = N.nuevoId('nivel');
          n.nombre = n.nombre + ' (de este navegador)';
          guardado = await Q.db.guardarNivel(n, { soloNuevo: true });
        }
        await Q.dbLocal.eliminarNivel(orig.id);
        Q.dbLocal.limpiarHuerfanas([]).catch(function () { /* limpieza opcional */ });
        await Q.cargarBiblioteca();
        Q.toast('«' + guardado.nombre + '» ya está en el servidor.');
      }
    });
  };

  /* ---------- Modo y estado del servidor ---------- */

  Q.chipModo = function () {
    var texto, clase;
    if (Q.compartido()) { texto = 'Niveles compartidos en línea'; clase = 'ok'; }
    else if (Q.servidorError) { texto = 'Sin conexión con el servidor: niveles solo en este navegador'; clase = 'error'; }
    else { texto = 'Niveles guardados solo en este navegador'; clase = ''; }
    return '<button class="chip-modo ' + clase + '" data-accion="ver-estado" data-foco="ver-estado" title="Ver el estado del servidor"><span class="punto" aria-hidden="true"></span>' + texto + '</button>';
  };

  var D = Q.ui.diag = { abierto: false, niveles: null, prueba: null, probando: false };

  Q.acciones['ver-estado'] = async function () {
    D.abierto = true; D.prueba = null; D.niveles = null;
    if (Q.compartido()) {
      try { D.niveles = (await Q.db.resumenNiveles()).length; } catch (e) { D.niveles = 'error: ' + e.message; }
    }
  };
  Q.acciones['cerrar-estado'] = function () { D.abierto = false; };

  // Crea un nivel de prueba, comprueba que se lee de vuelta y lo elimina.
  Q.acciones['probar-servidor'] = async function () {
    D.probando = true; D.prueba = null;
    Q.render();
    var id = 'diagnostico-' + Date.now().toString(36);
    var pasos = [];
    try {
      await Q.db.guardarNivel(N.nuevoNivel({ nombre: 'Prueba de conexión (se elimina sola)' }), { soloNuevo: true }).then(function (n) { id = n.id; });
      pasos.push({ ok: true, texto: 'Se guardó un nivel de prueba en el servidor.' });
      var visto = (await Q.db.resumenNiveles()).some(function (x) { return x.id === id; });
      pasos.push({ ok: visto, texto: visto ? 'Otros dispositivos lo pueden ver.' : 'El nivel no aparece en la lista del servidor.' });
      await Q.db.eliminarNivel(id);
      pasos.push({ ok: true, texto: 'Se eliminó el nivel de prueba.' });
    } catch (e) {
      pasos.push({ ok: false, texto: e.codigo === 'clave' ? 'El servidor pide la clave del grupo y la clave guardada no es correcta o falta.' : (e.message || String(e)) });
    }
    D.prueba = pasos;
    D.probando = false;
  };

  Q.capas.push(function () {
    if (!D.abierto) return '';
    var filas = [];
    var fila = function (k, v) { filas.push('<tr><th scope="row">' + k + '</th><td>' + v + '</td></tr>'); };
    fila('Modo', Q.compartido() ? '<strong>Compartido</strong>: los niveles se guardan en el servidor y los ven todos.'
      : Q.servidorError ? '<strong>Local por falta de servidor</strong>: los niveles quedan solo en este navegador.'
        : '<strong>Local</strong>: los niveles quedan solo en este navegador.');
    fila('Sitio', esc(location.origin + location.pathname));
    fila('Comprobación', esc((Q.deteccion && Q.deteccion.detalle) || '—'));
    if (Q.servidorError) fila('Problema', '<span class="texto-error">' + esc(Q.servidorError) + '</span>');
    if (Q.compartido()) {
      fila('Clave del grupo', Q.servidor && Q.servidor.requiereClave
        ? 'El servidor la exige para editar. ' + (Q.claveGrupo() ? 'Hay una clave guardada en este navegador.' : '<strong>No hay clave guardada.</strong>')
        : 'El servidor no exige clave: cualquiera con el enlace puede editar.');
      fila('Niveles en el servidor', esc(D.niveles === null ? '…' : D.niveles));
    }
    var prueba = '';
    if (D.probando) prueba = '<p class="nota">Probando…</p>';
    else if (D.prueba) prueba = '<ul class="lista-prueba">' + D.prueba.map(function (p) { return '<li class="' + (p.ok ? 'bien' : 'mal') + '">' + (p.ok ? '✓ ' : '✗ ') + esc(p.texto) + '</li>'; }).join('') + '</ul>';
    return '<div class="velo"><div class="panel" role="dialog" aria-modal="true" aria-labelledby="t-estado" style="width:min(640px,100%)">' +
      '<div class="cabecera"><span class="eyebrow">Diagnóstico</span><h2 id="t-estado">Estado del servidor</h2></div>' +
      '<div class="tabla-wrap"><table class="tabla tabla-informe"><tbody>' + filas.join('') + '</tbody></table></div>' + prueba +
      '<div class="fila-botones">' +
      (Q.compartido() ? '<button class="btn btn-primario" data-accion="probar-servidor" data-foco="probar-servidor"' + (D.probando ? ' disabled' : '') + '>Probar guardar en el servidor</button>' : '') +
      (Q.compartido() && Q.servidor && Q.servidor.requiereClave ? '<button class="btn" data-accion="pedir-clave">' + (Q.claveGrupo() ? 'Cambiar la clave' : 'Escribir la clave') + '</button>' : '') +
      (!Q.compartido() ? '<button class="btn" data-accion="reintentar-servidor">Reintentar conexión</button>' : '') +
      '<button class="btn" data-accion="cerrar-estado" data-foco="cerrar-estado">Cerrar</button></div>' +
      '<p class="nota">Para un diagnóstico completo desde el computador: <code>npm run diagnosticar -- ' + esc(location.origin) + ' --clave LA-CLAVE --escribir</code></p>' +
      '</div></div>';
  });
  Q.alEscape.push(function () { if (D.abierto) { D.abierto = false; return true; } return false; });

  /* ---------- Refresco en vivo ---------- */

  function firmaDe(lista) {
    return JSON.stringify((lista || []).map(function (x) { return [x.id, x.version]; }).sort());
  }

  function hayVentanaAbierta() {
    return !!(Q.ui.modal || C.pidiendoClave || (Q.ui.diag && Q.ui.diag.abierto) || (Q.ed && (Q.ed.dialogo || Q.ed.importacion)));
  }

  async function refrescarEditor(resumen) {
    var E = Q.ed;
    if (!E || !E.nivel) return;
    var entrada = resumen.filter(function (x) { return x.id === E.nivel.id; })[0];
    if (!entrada) {
      if (C.avisoEliminado !== E.nivel.id) {
        C.avisoEliminado = E.nivel.id;
        Q.toast('Otra persona eliminó este nivel. Si guardan, se les preguntará qué hacer con sus cambios.', 'error');
      }
      return;
    }
    if (entrada.version <= E.versionBase || E.sucio || E.estado !== 'guardado' || E.guardando) return;
    var n = await Q.db.obtenerNivel(E.nivel.id);
    if (!n || E.sucio || E.estado !== 'guardado' || !E.nivel || E.nivel.id !== n.id) return;
    await Q.cargarImagenes(N.referenciasImagen(n));
    E.nivel = N.copia(n);
    E.versionBase = n.version;
    if (E.epSel !== null && E.epSel >= n.episodios.length) E.epSel = n.episodios.length ? n.episodios.length - 1 : null;
    Q.toast('Otra persona actualizó este nivel. Se cargó la versión ' + n.version + '.');
    Q.render();
  }

  async function revisar() {
    if (!Q.compartido() || C.revisando || document.hidden || hayVentanaAbierta()) return;
    var p = Q.ui.pantalla;
    if (['menu', 'jugar', 'biblioteca', 'editor'].indexOf(p) < 0) return;
    C.revisando = true;
    try {
      var resumen = await Q.db.resumenNiveles();
      if (hayVentanaAbierta() || Q.ui.pantalla !== p) return;
      // Cada pantalla se compara con la lista que está mostrando.
      var mostrada = p === 'jugar' ? Q.ui.j.listaNiveles : p === 'biblioteca' ? (Q.ed && Q.ed.biblioteca) : null;
      if (mostrada && firmaDe(mostrada) === firmaDe(resumen)) return;
      if (p === 'jugar') {
        var lista = await Q.db.listarNiveles();
        lista.sort(function (a, b) { return a.modificado < b.modificado ? 1 : -1; });
        Q.ui.j.listaNiveles = lista;
        Q.render();
      } else if (p === 'biblioteca') {
        await Q.cargarBiblioteca();
        Q.render();
      } else if (p === 'editor') {
        await refrescarEditor(resumen);
      }
    } catch (e) {
      /* sin conexión momentánea: se reintenta en la próxima revisión */
    } finally {
      C.revisando = false;
    }
  }
  Q.revisarCompartido = revisar;

  Q.iniciarRefresco = function () {
    if (!Q.compartido()) return;
    setInterval(revisar, INTERVALO_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) revisar(); });
    window.addEventListener('focus', revisar);
  };
})();
