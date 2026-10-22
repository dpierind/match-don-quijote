/*
 * El match con Don Quijote — Editor de niveles.
 * Biblioteca de niveles y editor con cinco secciones: Episodios y cartas, Preguntas,
 * Tablero, Configuración, Importar y exportar.
 * El editor trabaja sobre un borrador; «Guardar» (o el guardado automático) lo escribe
 * en IndexedDB. Si otra pestaña guardó antes, no sobrescribe: avisa del conflicto.
 */
(function () {
  'use strict';

  var Q = window.Quijote, N = Q.N, T = Q.T, esc = Q.esc;

  var E = Q.ed = {
    nivel: null, versionBase: 0, sucio: false, cambios: 0, estado: 'guardado', error: '', conflicto: null,
    ultimoGuardado: '', guardando: null, temporizador: null,
    pestana: 'episodios', epSel: null, busqueda: '', filtroParte: 'todas', orden: 'orden', slotSel: null,
    tamano: null,
    autoguardado: Q.preferencias.leer('autoguardado', true),
    biblioteca: [], importacion: null, dialogo: null, almacen: null
  };
  Q.refsBorrador = function () { return E.nivel ? N.referenciasImagen(E.nivel) : []; };

  var PESTANAS = [
    ['episodios', 'Episodios y cartas'], ['preguntas', 'Preguntas'], ['tablero', 'Tablero'],
    ['configuracion', 'Configuración'], ['transferencia', 'Importar y exportar']
  ];

  /* ---------- Guardado ---------- */

  function textoIndicador() {
    if (!E.nivel) return '';
    var memoria = Q.db && Q.db.modo === 'memoria' ? ' (solo en memoria)' : '';
    switch (E.estado) {
      case 'guardando': return '<span class="estado-guardado">Guardando…</span>';
      case 'sucio': return '<span class="estado-guardado aviso">Cambios sin guardar' + (E.autoguardado ? ' · se guardarán solos' : '') + '</span>';
      case 'error': return '<span class="estado-guardado error">Error al guardar</span>';
      case 'conflicto': return '<span class="estado-guardado error">Conflicto: no se guardó</span>';
      default: return '<span class="estado-guardado ok">' + (Q.compartido() ? 'Guardado en el servidor' : 'Guardado' + memoria) + ' · versión ' + E.versionBase + (E.ultimoGuardado ? ' · ' + esc(E.ultimoGuardado) : '') + '</span>';
    }
  }
  function pintarIndicador() {
    var el = document.getElementById('indicador-guardado');
    if (el) el.innerHTML = textoIndicador();
    var b = document.getElementById('btn-guardar');
    if (b) b.disabled = !E.sucio || E.estado === 'guardando';
  }

  function programarAutoguardado() {
    clearTimeout(E.temporizador);
    if (!E.autoguardado || E.estado === 'conflicto') return;
    E.temporizador = setTimeout(function () { guardar({ auto: true }); }, 2500);
  }

  function marcarCambio() {
    E.cambios++;
    E.sucio = true;
    if (E.estado !== 'conflicto') E.estado = 'sucio';
    pintarIndicador();
    programarAutoguardado();
  }
  Q.marcarCambio = marcarCambio;

  function guardar(op) {
    op = op || {};
    if (!E.nivel) return Promise.resolve(false);
    if (E.estado === 'conflicto' && !op.forzar) {
      if (!op.auto) Q.toast('Hay un conflicto con otra versión del nivel. Elijan una de las opciones del aviso.', 'error');
      return Promise.resolve(false);
    }
    clearTimeout(E.temporizador);
    if (E.guardando) return E.guardando.then(function () { return E.sucio ? guardar(op) : true; });
    var marca = E.cambios;
    E.estado = 'guardando';
    pintarIndicador();
    var esperada = op.forzar ? (E.conflicto && E.conflicto.actual ? E.conflicto.actual.version : null) : E.versionBase;
    E.guardando = Q.db.guardarNivel(E.nivel, { versionEsperada: esperada }).then(function (g) {
      E.versionBase = g.version;
      E.nivel.version = g.version;
      E.nivel.modificado = g.modificado;
      E.conflicto = null;
      E.error = '';
      E.ultimoGuardado = Q.hora();
      if (E.cambios === marca) { E.sucio = false; E.estado = 'guardado'; }
      else { E.estado = 'sucio'; programarAutoguardado(); }
      pintarIndicador();
      if (!op.auto) Q.toast('Cambios guardados (versión ' + g.version + ').');
      return true;
    }, function (e) {
      if (e && e.codigo === 'conflicto') {
        E.estado = 'conflicto';
        E.conflicto = { actual: e.actual };
        Q.render();
        return false;
      }
      E.estado = 'error';
      E.error = e.message;
      pintarIndicador();
      Q.mostrarError(e, 'No se guardaron los cambios');
      return false;
    }).then(function (r) { E.guardando = null; return r; });
    return E.guardando;
  }
  Q.guardarNivelEditor = guardar;

  function cerrarEditor() {
    clearTimeout(E.temporizador);
    E.nivel = null; E.sucio = false; E.estado = 'guardado'; E.conflicto = null; E.epSel = null; E.slotSel = null;
  }

  /*
   * Antes de salir del editor: si hay cambios, intenta guardarlos; si no puede, pregunta.
   * Devuelve true si se puede continuar. Si pregunta, vuelve a ejecutar la acción al decidir.
   */
  Q.confirmarSalidaEditor = async function () {
    if (!E.nivel || Q.ui.pantalla !== 'editor') return true;
    if (!E.sucio) { cerrarEditor(); return true; }
    if (E.autoguardado && E.estado !== 'conflicto') {
      if (await guardar({ auto: true }) && !E.sucio) { cerrarEditor(); return true; }
    }
    var repetir = Q.ultimaAccion;
    Q.confirmar({
      titulo: 'Hay cambios sin guardar',
      texto: 'El nivel «' + E.nivel.nombre + '» tiene cambios que todavía no se han guardado.',
      botones: [
        { texto: 'Guardar y salir', clase: 'btn-primario', accion: async function () { if (await guardar({})) { cerrarEditor(); if (repetir) Q.ejecutar(repetir.nombre, repetir.dataset); } } },
        { texto: 'Salir sin guardar', clase: 'btn-mal', accion: function () { cerrarEditor(); if (repetir) Q.ejecutar(repetir.nombre, repetir.dataset); } }
      ]
    });
    return false;
  };

  window.addEventListener('beforeunload', function (e) {
    if (E.nivel && E.sucio) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------- Biblioteca ---------- */

  async function cargarBiblioteca() {
    E.biblioteca = await Q.db.listarNiveles();
    E.biblioteca.sort(function (a, b) { return a.modificado < b.modificado ? 1 : -1; });
    E.almacen = { estimacion: await Q.db.estimacion(), persistido: await Q.db.estaPersistido() };
    // En modo compartido, los niveles que quedaron solo en este navegador se pueden subir.
    E.soloLocales = [];
    if (Q.compartido() && Q.dbLocal) {
      // La demostración que se crea sin conexión no se ofrece: el servidor tiene la suya.
      try { E.soloLocales = (await Q.dbLocal.listarNiveles()).filter(function (n) { return n.id !== 'nivel-demostracion'; }); }
      catch (e) { E.soloLocales = []; }
    }
  }
  Q.cargarBiblioteca = cargarBiblioteca;

  Q.acciones['ir-biblioteca'] = async function () {
    if (!(await Q.confirmarSalidaEditor())) return;
    await cargarBiblioteca();
    Q.ir('biblioteca');
  };

  function infoAlmacen() {
    var a = E.almacen || {};
    var est = a.estimacion;
    var uso = est && est.quota ? 'Espacio usado: ' + Q.tamano(est.usage) + ' de ' + Q.tamano(est.quota) + ' disponibles para este sitio.' : 'El navegador no informa del espacio disponible.';
    if (Q.compartido()) {
      return '<section class="caja caja-info almacen-info"><h3>Dónde se guardan los datos</h3>' +
        '<p><strong>Los niveles y sus imágenes se guardan en el servidor del juego</strong>: todos los que abren el enlace ven los mismos niveles, y los cambios aparecen en pocos segundos. Las partidas guardadas quedan en este navegador.</p>' +
        '<p class="nota">El servidor conserva las últimas versiones de cada nivel. Aun así, exporten una copia de seguridad de la biblioteca antes de una presentación importante.</p></section>';
    }
    var modo = Q.db.modo === 'indexeddb'
      ? 'Los niveles, imágenes y partidas se guardan en este navegador (IndexedDB).'
      : 'Este navegador no permite guardar: todo se perderá al cerrar la página.';
    var pers = a.persistido === true ? 'El navegador se comprometió a conservar estos datos aunque necesite espacio.'
      : a.persistido === false ? 'El navegador podría borrar estos datos si se queda sin espacio. <button class="btn btn-sutil btn-chico" data-accion="pedir-persistencia">Pedir que los conserve</button>' : '';
    return '<section class="caja caja-info almacen-info"><h3>Dónde se guardan los datos</h3>' +
      '<p>' + modo + ' ' + uso + '</p>' + (pers ? '<p>' + pers + '</p>' : '') +
      '<p class="nota">Los datos quedan solo en este navegador y en este computador. Se pierden si se borran los datos de navegación, si usan una ventana privada o si cambian de equipo o de navegador. Exporten cada nivel o una copia de seguridad de la biblioteca para conservarlos de verdad.</p></section>';
  }

  Q.acciones['pedir-persistencia'] = async function () {
    var r = await Q.db.pedirPersistencia();
    E.almacen = E.almacen || {};
    E.almacen.persistido = await Q.db.estaPersistido();
    Q.toast(r ? 'El navegador conservará los datos de este sitio.' : 'El navegador no aceptó la solicitud. Exporten copias de seguridad con frecuencia.', r ? '' : 'error');
  };

  Q.pantallas.biblioteca = function () {
    var tarjetas = E.biblioteca.map(function (n) {
      var v = N.validarNivel(n, { imagenExiste: Q.imagenExiste });
      return '<li class="tarjeta-nivel">' +
        '<div class="info"><h2>' + esc(n.nombre) + '</h2>' +
        (n.descripcion ? '<p class="nota">' + esc(n.descripcion) + '</p>' : '') +
        '<span class="chips">' + Q.chipValidacion(v) +
        '<span class="chip num">' + Q.plural(n.episodios.length, 'episodio', 'episodios') + '</span>' +
        '<span class="chip num">' + v.conteos.enTablero + ' de ' + v.espacios + ' espacios</span>' +
        (n.config.estado === 'aprobado' ? '<span class="chip chip-ok">Aprobado</span>' : '<span class="chip chip-demo">Provisional</span>') +
        Q.chipIncluido(n) + '</span>' +
        '<span class="nota">Modificado: ' + Q.fecha(n.modificado) + ' · versión ' + n.version + '</span></div>' +
        '<div class="fila-botones">' +
        '<button class="btn btn-primario btn-chico" data-accion="editar-nivel" data-id="' + esc(n.id) + '" data-foco="editar-' + esc(n.id) + '">Editar</button>' +
        '<button class="btn btn-chico" data-accion="elegir-nivel" data-id="' + esc(n.id) + '">Jugar</button>' +
        '<button class="btn btn-sutil btn-chico" data-accion="duplicar-nivel" data-id="' + esc(n.id) + '">Duplicar</button>' +
        '<button class="btn btn-sutil btn-chico" data-accion="exportar-nivel" data-id="' + esc(n.id) + '">Exportar</button>' +
        '<button class="btn btn-sutil btn-chico" data-accion="eliminar-nivel" data-id="' + esc(n.id) + '">Eliminar</button>' +
        '</div></li>';
    }).join('');
    return '<main class="hoja hoja-ancha">' + Q.avisoAlmacen() +
      '<div><button class="btn btn-sutil btn-chico" data-accion="ir-menu">← Menú principal</button></div>' +
      '<header class="cabecera"><span class="eyebrow">Editor de niveles</span><h1>Biblioteca de niveles</h1>' +
      '<p class="lead">Cada nivel reúne sus episodios, imágenes, preguntas, tablero y reglas. Modificar un nivel no cambia los demás ni las partidas guardadas.</p></header>' +
      (Q.bandaCompartida ? Q.bandaCompartida() : '') +
      '<div class="fila-botones">' +
      '<button class="btn btn-primario" data-accion="nuevo-nivel" data-foco="nuevo-nivel">Nuevo nivel</button>' +
      '<label class="btn">Importar nivel o copia<input type="file" class="sr" accept=".zip,.json,application/zip,application/json" data-archivo="importar"></label>' +
      '<button class="btn btn-sutil" data-accion="exportar-biblioteca" ' + (E.biblioteca.length ? '' : 'disabled') + '>Copia de seguridad de la biblioteca</button>' +
      '</div>' +
      (tarjetas ? '<ul class="lista-niveles">' + tarjetas + '</ul>' : '<div class="caja caja-info">La biblioteca está vacía. Creen un nivel nuevo o importen uno.</div>') +
      (Q.seccionSoloLocales ? Q.seccionSoloLocales(E.soloLocales || []) : '') +
      infoAlmacen() + '</main>';
  };

  /* ---------- Diálogo de nombre (nuevo, duplicar, guardar como copia) ---------- */

  function pedirNombre(op) { E.dialogo = Object.assign({ descripcion: '' }, op); }
  Q.alEscribir.dlg = function (c, el) { E.dialogo[c.split('.')[1]] = el.value; };
  Q.formularios.dialogo = async function () {
    var d = E.dialogo;
    if (!d) return;
    var nombre = String(d.nombre || '').trim();
    if (!nombre) { Q.toast('Escriban un nombre para el nivel.', 'error'); return; }
    E.dialogo = null;
    await d.alAceptar(nombre, String(d.descripcion || '').trim());
  };
  Q.acciones['dialogo-cancelar'] = function () { E.dialogo = null; };
  Q.capas.push(function () {
    var d = E.dialogo;
    if (!d) return '';
    return '<div class="velo"><form class="panel" data-form="dialogo" role="dialog" aria-modal="true" aria-labelledby="t-dlg" style="width:min(560px,100%)" novalidate>' +
      '<h2 id="t-dlg">' + esc(d.titulo) + '</h2>' + (d.texto ? '<p>' + esc(d.texto) + '</p>' : '') +
      '<div class="campo"><label for="dlg-nombre">Nombre del nivel</label><input id="dlg-nombre" data-campo="dlg.nombre" data-foco="dlg-nombre" maxlength="80" value="' + esc(d.nombre) + '"></div>' +
      '<div class="campo"><label for="dlg-desc">Descripción (opcional)</label><textarea id="dlg-desc" data-campo="dlg.descripcion" style="min-height:70px" maxlength="400">' + esc(d.descripcion) + '</textarea></div>' +
      '<div class="fila-botones"><button type="submit" class="btn btn-primario">' + esc(d.boton) + '</button><button type="button" class="btn" data-accion="dialogo-cancelar">Cancelar</button></div>' +
      '</form></div>';
  });
  Q.alEscape.push(function () { if (E.dialogo) { E.dialogo = null; return true; } return false; });

  async function abrirEnEditor(nivel, pestana) {
    await Q.cargarImagenes(N.referenciasImagen(nivel));
    E.nivel = N.copia(nivel);
    E.versionBase = nivel.version;
    E.sucio = false; E.cambios = 0; E.estado = 'guardado'; E.conflicto = null; E.error = ''; E.ultimoGuardado = '';
    E.pestana = pestana || 'episodios';
    E.epSel = nivel.episodios.length ? 0 : null;
    E.slotSel = null; E.tamano = null; E.busqueda = '';
    Q.ir('editor');
  }

  Q.acciones['nuevo-nivel'] = function () {
    pedirNombre({
      titulo: 'Nuevo nivel', nombre: '', boton: 'Crear nivel',
      texto: 'El nivel empezará vacío, con un tablero de 6 × 5. Podrán cambiar el formato en Configuración.',
      alAceptar: async function (nombre, descripcion) {
        var g = await Q.db.guardarNivel(N.nuevoNivel({ nombre: nombre, descripcion: descripcion }));
        Q.toast('Nivel «' + g.nombre + '» creado.');
        await abrirEnEditor(g, 'episodios');
      }
    });
  };

  async function duplicarNivel(id, abrir) {
    var orig = await Q.db.obtenerNivel(id);
    if (!orig) throw Q.fallo('Ese nivel ya no existe.');
    pedirNombre({
      titulo: abrir ? 'Duplicar y editar' : 'Duplicar nivel', nombre: orig.nombre + ' (copia)', descripcion: orig.descripcion,
      boton: abrir ? 'Duplicar y abrir en el editor' : 'Duplicar',
      texto: 'Se creará un nivel independiente con el mismo contenido. El original no cambiará.',
      alAceptar: async function (nombre, descripcion) {
        var c = N.copia(orig);
        c.id = N.nuevoId('nivel'); c.nombre = nombre; c.descripcion = descripcion; c.version = 0; c.creado = new Date().toISOString();
        var g = await Q.db.guardarNivel(c, { soloNuevo: true });
        Q.toast('Copia «' + g.nombre + '» creada.');
        if (abrir) await abrirEnEditor(g);
        else await cargarBiblioteca();
      }
    });
  }
  Q.acciones['duplicar-nivel'] = function (d) { return duplicarNivel(d.id, false); };
  Q.acciones['duplicar-y-editar'] = function (d) { return duplicarNivel(d.id, true); };

  Q.acciones['editar-nivel'] = async function (d) {
    if (!(await Q.confirmarSalidaEditor())) return;
    var n = await Q.db.obtenerNivel(d.id);
    if (!n) { Q.toast('Ese nivel ya no existe.', 'error'); return; }
    await abrirEnEditor(n);
  };

  Q.acciones['eliminar-nivel'] = function (d) {
    var n = E.biblioteca.filter(function (x) { return x.id === d.id; })[0] || (E.nivel && E.nivel.id === d.id ? E.nivel : null);
    if (!n) return;
    Q.confirmar({
      titulo: 'Eliminar «' + n.nombre + '»', si: 'Eliminar este nivel', peligro: true,
      texto: 'Se eliminará solo este nivel (' + Q.plural(n.episodios.length, 'episodio', 'episodios') + '). Los demás niveles no cambian y las partidas guardadas con él seguirán funcionando con su copia. ' +
        (Q.compartido() ? 'El nivel desaparecerá para todos los que usan el juego (el servidor guarda sus versiones anteriores). ' : '') +
        (N.esIncluido(n) ? 'Como viene incluido en el juego, se volverá a instalar la próxima vez que abran el juego.' : 'Esta acción no se puede deshacer; exporten el nivel antes si quieren conservarlo.'),
      alSi: async function () {
        await Q.db.eliminarNivel(n.id);
        if (E.nivel && E.nivel.id === n.id) cerrarEditor();
        Q.db.limpiarHuerfanas(Q.refsBorrador()).catch(function () { /* limpieza opcional */ });
        await cargarBiblioteca();
        Q.toast('Nivel «' + n.nombre + '» eliminado.');
        Q.ir('biblioteca');
      }
    });
  };

  /* ---------- Exportación ---------- */

  async function exportarNivel(nivel) {
    Q.toast('Preparando el archivo…');
    var r = await T.exportarNivel(nivel, Q.db);
    var nombre = Q.nombreArchivo(nivel.nombre) + '.zip';
    var res = await Q.ofrecerArchivo(nombre, r.bytes, 'application/zip');
    if (res === 'rechazado') { Q.toast('Exportación cancelada.'); return; }
    Q.toast('Exportado «' + nombre + '» con ' + Q.plural(r.imagenes, 'imagen', 'imágenes') + '.' +
      (r.faltantes.length ? ' Atención: ' + Q.plural(r.faltantes.length, 'imagen no se encontró', 'imágenes no se encontraron') + ' y no se incluyeron.' : ''), r.faltantes.length ? 'error' : '');
  }

  Q.acciones['exportar-nivel'] = async function (d) {
    var n = await Q.db.obtenerNivel(d.id);
    if (!n) throw Q.fallo('Ese nivel ya no existe.');
    await exportarNivel(n);
  };

  Q.acciones['exportar-actual'] = async function () {
    if (!E.nivel) return;
    if (E.sucio) {
      Q.confirmar({
        titulo: 'Hay cambios sin guardar', texto: 'La exportación incluye la última versión guardada del nivel. ¿Qué quieren exportar?',
        botones: [
          { texto: 'Guardar y exportar', clase: 'btn-primario', accion: async function () { if (await guardar({})) await exportarNivel(await Q.db.obtenerNivel(E.nivel.id)); } },
          { texto: 'Exportar la versión guardada', clase: 'btn', accion: async function () { await exportarNivel(await Q.db.obtenerNivel(E.nivel.id)); } }
        ]
      });
      return;
    }
    await exportarNivel(await Q.db.obtenerNivel(E.nivel.id));
  };

  Q.acciones['exportar-biblioteca'] = async function () {
    if (E.nivel && E.sucio) await guardar({ auto: true });
    var niveles = await Q.db.listarNiveles();
    if (!niveles.length) { Q.toast('La biblioteca está vacía.'); return; }
    Q.toast('Preparando la copia de seguridad…');
    var r = await T.exportarBiblioteca(niveles, Q.db);
    var nombre = 'biblioteca-match-quijote-' + new Date().toISOString().slice(0, 10) + '.zip';
    var res = await Q.ofrecerArchivo(nombre, r.bytes, 'application/zip');
    if (res === 'rechazado') { Q.toast('Copia de seguridad cancelada.'); return; }
    Q.toast('Copia de seguridad «' + nombre + '»: ' + Q.plural(niveles.length, 'nivel', 'niveles') + ' y ' + Q.plural(r.imagenes, 'imagen', 'imágenes') + '.');
  };

  /* ---------- Importación ---------- */

  Q.archivos.importar = async function (archivo) {
    if (archivo.size > 500 * 1024 * 1024) throw Q.fallo('El archivo pesa ' + Q.tamano(archivo.size) + '; es demasiado grande para importarlo.');
    var bytes = new Uint8Array(await archivo.arrayBuffer());
    var a = await T.analizar(bytes);
    if (a.problemas.length) {
      Q.confirmar({ titulo: 'No se puede importar «' + archivo.name + '»', html: Q.listaMensajes(a.problemas), botones: [], cancelar: true });
      return;
    }
    var existentes = {};
    for (var i = 0; i < a.niveles.length; i++) {
      var ex = await Q.db.obtenerNivel(a.niveles[i].nivel.id);
      if (ex) existentes[ex.id] = ex;
    }
    E.importacion = { analisis: a, archivo: archivo.name, existentes: existentes };
  };

  Q.capas.push(function () {
    var imp = E.importacion;
    if (!imp) return '';
    var a = imp.analisis;
    var hayExistentes = Object.keys(imp.existentes).length > 0;
    var bloques = a.niveles.map(function (x) {
      var n = x.nivel, v = x.validacion, ex = imp.existentes[n.id];
      return '<div class="bloque-import"><h3>' + esc(n.nombre) + '</h3>' +
        '<p class="chips"><span class="chip num">' + Q.plural(n.episodios.length, 'episodio', 'episodios') + '</span>' +
        '<span class="chip num">' + v.conteos.enTablero + ' de ' + v.espacios + ' espacios</span>' +
        '<span class="chip num">' + Q.plural(x.encontradas.length, 'imagen incluida', 'imágenes incluidas') + '</span>' +
        (v.conteos.idsDuplicados ? '<span class="chip chip-error">' + Q.plural(v.conteos.idsDuplicados, 'identificador duplicado', 'identificadores duplicados') + '</span>' : '') +
        (v.errores.length ? '<span class="chip chip-error">' + Q.plural(v.errores.length, 'error', 'errores') + '</span>' : '<span class="chip chip-ok">Sin errores</span>') + '</p>' +
        (ex ? '<p class="caja caja-aviso">Ya existe un nivel con este identificador en la biblioteca: «' + esc(ex.nombre) + '», versión ' + ex.version + ', modificado ' + Q.fecha(ex.modificado) + '.</p>' : '') +
        (x.faltantes.length ? '<div class="caja caja-error"><strong>Imágenes que no están en el archivo</strong> (se quitará la referencia):' + Q.listaMensajes(x.faltantes, 5) + '</div>' : '') +
        (x.conservadas.length ? '<p class="nota">' + Q.plural(x.conservadas.length, 'imagen apunta', 'imágenes apuntan') + ' a la carpeta assets/ del juego y se conservará la ruta.</p>' : '') +
        (v.errores.length ? '<details><summary>Ver errores y campos obligatorios ausentes</summary>' + Q.listaMensajes(v.errores, 15) + '</details>' : '') +
        '</div>';
    }).join('');
    return '<div class="velo"><div class="panel" role="dialog" aria-modal="true" aria-labelledby="t-imp" style="width:min(760px,100%)">' +
      '<div class="cabecera"><span class="eyebrow">Importar · ' + esc(imp.archivo) + '</span><h2 id="t-imp">' + (a.tipo === 'biblioteca' ? 'Copia de seguridad con ' + Q.plural(a.niveles.length, 'nivel', 'niveles') : 'Revisar el nivel antes de importarlo') + '</h2></div>' +
      (a.avisos.length ? '<div class="caja caja-aviso">' + Q.listaMensajes(a.avisos) + '</div>' : '') + bloques +
      '<p class="nota">Los niveles con errores se pueden importar y corregir en el editor, pero no se podrán jugar hasta corregirlos.</p>' +
      '<div class="fila-botones">' +
      '<button class="btn btn-primario" data-accion="importar-confirmar" data-modo="nuevos" data-foco="imp-nuevos">' + (a.niveles.length > 1 ? 'Importar como niveles nuevos' : 'Importar como nivel nuevo') + '</button>' +
      (hayExistentes ? '<button class="btn btn-mal" data-accion="importar-confirmar" data-modo="reemplazar">Reemplazar ' + (Object.keys(imp.existentes).length > 1 ? 'los existentes' : 'el existente') + '</button>' : '') +
      '<button class="btn" data-accion="importar-cancelar">Cancelar</button></div></div></div>';
  });
  Q.acciones['importar-cancelar'] = function () { E.importacion = null; };
  Q.alEscape.push(function () { if (E.importacion) { E.importacion = null; return true; } return false; });

  Q.acciones['importar-confirmar'] = async function (d) {
    var imp = E.importacion;
    if (!imp) return;
    E.importacion = null;
    var nombres = {};
    (await Q.db.listarNiveles()).forEach(function (n) { nombres[n.nombre] = true; });
    var hechos = [];
    for (var i = 0; i < imp.analisis.niveles.length; i++) {
      var x = imp.analisis.niveles[i];
      var ex = imp.existentes[x.nivel.id];
      var reemplazar = d.modo === 'reemplazar' && ex;
      var op = { nuevoId: !reemplazar && (d.modo === 'nuevos' || !!ex) };
      if (op.nuevoId && nombres[x.nivel.nombre]) op.nombre = x.nivel.nombre + ' (importado)';
      var listo = await T.prepararNivel(x, imp.analisis.archivos, Q.db, op);
      N.referenciasImagen(listo).forEach(function (id) { Q.imagenes.conocidas.add(id); });
      var g = reemplazar ? await Q.db.guardarNivel(listo, { versionEsperada: ex.version }) : await Q.db.guardarNivel(listo, { soloNuevo: true });
      hechos.push(g);
    }
    if (E.nivel && hechos.some(function (g) { return g.id === E.nivel.id; })) cerrarEditor();
    await cargarBiblioteca();
    Q.ir('biblioteca');
    Q.toast(hechos.length === 1 ? 'Nivel «' + hechos[0].nombre + '» importado.' : Q.plural(hechos.length, 'nivel importado', 'niveles importados') + '.');
  };

  /* ---------- Imágenes ---------- */

  var TIPOS_IMAGEN = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

  // Comprueba la imagen y, si es grande, la reduce para ahorrar espacio: como máximo 1600 px y
  // 1,2 MB (el servidor compartido acepta hasta 1,4 MB por imagen).
  var LIMITE_IMAGEN = 1.2 * 1024 * 1024;
  async function procesarImagen(archivo) {
    var tipo = archivo.type || '';
    if (TIPOS_IMAGEN.indexOf(tipo) < 0) throw Q.fallo('El formato de «' + archivo.name + '» no se admite. Usen PNG, JPEG o WebP.');
    if (archivo.size > 30 * 1024 * 1024) throw Q.fallo('La imagen pesa ' + Q.tamano(archivo.size) + '; el máximo es 30 MB.');
    var bmp;
    try { bmp = await createImageBitmap(archivo); }
    catch (e) { throw Q.fallo('No se pudo leer «' + archivo.name + '». Puede estar dañada o no ser una imagen.'); }
    var w = bmp.width, h = bmp.height;
    var reducir = w > 1600 || h > 1600 || archivo.size > LIMITE_IMAGEN;
    if (tipo === 'image/gif') {
      if (bmp.close) bmp.close();
      if (archivo.size > LIMITE_IMAGEN) throw Q.fallo('El GIF pesa ' + Q.tamano(archivo.size) + '; el máximo es 1,2 MB. Usen una imagen PNG, JPEG o WebP.');
      return { blob: archivo, tipo: tipo, nombre: archivo.name, ancho: w, alto: h, reducida: false };
    }
    if (!reducir) { if (bmp.close) bmp.close(); return { blob: archivo, tipo: tipo, nombre: archivo.name, ancho: w, alto: h, reducida: false }; }
    var salida = tipo === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
    var intentos = [[1600, 0.86], [1200, 0.8], [900, 0.75]];
    var blob = null, cw = 0, ch = 0;
    for (var i = 0; i < intentos.length; i++) {
      var k = Math.min(1, intentos[i][0] / Math.max(w, h));
      cw = Math.round(w * k); ch = Math.round(h * k);
      var lienzo = document.createElement('canvas');
      lienzo.width = cw; lienzo.height = ch;
      lienzo.getContext('2d').drawImage(bmp, 0, 0, cw, ch);
      blob = await new Promise(function (r) { lienzo.toBlob(r, salida, intentos[i][1]); });
      if (!blob || blob.type !== salida) blob = await new Promise(function (r) { lienzo.toBlob(r, 'image/jpeg', intentos[i][1]); });
      if (blob && blob.size <= LIMITE_IMAGEN) break;
    }
    if (bmp.close) bmp.close();
    if (!blob) throw Q.fallo('El navegador no pudo procesar la imagen.');
    if (blob.size > LIMITE_IMAGEN) throw Q.fallo('No se pudo reducir «' + archivo.name + '» por debajo de 1,2 MB. Usen una imagen más simple o más pequeña.');
    return { blob: blob, tipo: blob.type, nombre: archivo.name, ancho: cw, alto: ch, reducida: true };
  }

  Q.archivos['imagen-ep'] = async function (archivo) {
    var ep = epActual();
    if (!ep) return;
    var i = E.epSel;
    var p = await procesarImagen(archivo);
    var id = await Q.db.guardarImagen(p);
    Q.imagenes.conocidas.add(id);
    Q.imagenes.urls.set(id, URL.createObjectURL(p.blob));
    Q.imagenes.meta.set(id, { nombre: p.nombre, ancho: p.ancho, alto: p.alto, tamano: p.blob.size, tipo: p.tipo });
    var e2 = E.nivel.episodios[i];
    if (!e2) return;
    var habia = !!e2.imagen;
    e2.imagen = 'img:' + id;      // solo cambia la imagen: textos y preguntas quedan igual
    marcarCambio();
    Q.toast((habia ? 'Imagen reemplazada' : 'Imagen guardada') + (p.reducida ? ' (reducida a ' + p.ancho + ' × ' + p.alto + ' px para ahorrar espacio).' : '.'));
  };

  /* ---------- Editor: utilidades ---------- */

  function epActual() { return E.nivel && E.epSel !== null ? E.nivel.episodios[E.epSel] : null; }
  function validacion() { return N.validarNivel(E.nivel, { imagenExiste: Q.imagenExiste }); }

  function quitarAcentos(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

  function indicesVisibles() {
    var q = quitarAcentos(E.busqueda.trim());
    var lista = E.nivel.episodios.map(function (e, i) { return i; }).filter(function (i) {
      var e = E.nivel.episodios[i];
      if (E.filtroParte !== 'todas' && String(e.parte) !== E.filtroParte) return false;
      if (!q) return true;
      var num = q.replace(/^(cap(itulo)?\.?\s*)/, '');
      if (/^\d+$/.test(num)) return String(e.capitulo) === num;
      return quitarAcentos(e.titulo).indexOf(q) >= 0 || quitarAcentos(e.id).indexOf(q) >= 0;
    });
    function n(v) { var x = Number(v); return v === '' || !Number.isFinite(x) ? Infinity : x; }
    if (E.orden === 'orden') lista.sort(function (a, b) { return n(E.nivel.episodios[a].ordenCronologico) - n(E.nivel.episodios[b].ordenCronologico) || a - b; });
    else if (E.orden === 'capitulo') lista.sort(function (a, b) {
      var x = E.nivel.episodios[a], y = E.nivel.episodios[b];
      return n(x.parte) - n(y.parte) || n(x.capitulo) - n(y.capitulo) || a - b;
    });
    return lista;
  }

  function chipsEpisodio(d) {
    if (!d) return '';
    var html = d.enTablero ? '<span class="chip">En el tablero</span>' : '<span class="chip chip-demo">Reserva</span>';
    if (d.errores.length) html += '<span class="chip chip-error">' + Q.plural(d.errores.length, 'falta', 'faltan') + '</span>';
    else html += '<span class="chip chip-ok">Completo</span>';
    return html;
  }

  function problemasHTML(d) {
    if (!d) return '';
    var avisos = d.avisos.filter(function (a) { return a.indexOf('reserva') < 0; });
    return (d.errores.length ? '<div class="caja caja-error"><strong>Datos obligatorios o incorrectos</strong>' + Q.listaMensajes(d.errores, 10) + '</div>' : '') +
      (avisos.length ? '<div class="caja caja-aviso">' + Q.listaMensajes(avisos, 6) + '</div>' : '') +
      (!d.errores.length && !avisos.length ? '<div class="caja caja-ok">Este episodio está completo.</div>' : '');
  }

  // Actualiza en el sitio los avisos tras escribir, sin redibujar los campos.
  var temporizadorParcial = null;
  function refrescoParcial() {
    clearTimeout(temporizadorParcial);
    temporizadorParcial = setTimeout(function () {
      if (!E.nivel || Q.ui.pantalla !== 'editor') return;
      var v = validacion();
      var caja = document.getElementById('problemas-ep');
      if (caja && E.epSel !== null) caja.innerHTML = problemasHTML(v.porEpisodio[E.epSel]);
      document.querySelectorAll('[data-chips-ep]').forEach(function (el) {
        el.innerHTML = chipsEpisodio(v.porEpisodio[Number(el.dataset.chipsEp)]);
      });
      var resumen = document.getElementById('resumen-validacion');
      if (resumen) resumen.innerHTML = resumenValidacion(v);
    }, 300);
  }

  function resumenValidacion(v) {
    return (v.puedeJugar ? '<span class="chip chip-ok">Listo para jugar</span>' : '<span class="chip chip-error">' + Q.plural(v.errores.length, 'error', 'errores') + ' antes de jugar</span>') +
      (v.avisos.length ? '<span class="chip chip-demo">' + Q.plural(v.avisos.length, 'advertencia', 'advertencias') + '</span>' : '');
  }

  /* ---------- Editor: pantalla ---------- */

  Q.pantallas.editor = function () {
    if (!E.nivel) { Q.ui.pantalla = 'biblioteca'; return Q.pantallas.biblioteca(); }
    var n = E.nivel, v = validacion();
    var totalPreg = n.episodios.reduce(function (a, e) { return a + e.preguntas.length; }, 0);
    var cuentas = { episodios: n.episodios.length, preguntas: totalPreg, tablero: v.conteos.enTablero + '/' + v.espacios };
    var conflicto = '';
    if (E.estado === 'conflicto') {
      var act = E.conflicto && E.conflicto.actual;
      conflicto = '<div class="caja caja-error conflicto" role="alert"><strong>No se guardaron sus cambios.</strong> ' +
        (act ? (Q.compartido() ? 'Otra persona' : 'Otra pestaña o ventana') + ' guardó la versión ' + act.version + ' de este nivel (' + Q.fecha(act.modificado) + ') mientras lo editaban.' : (Q.compartido() ? 'Otra persona eliminó este nivel mientras lo editaban.' : 'Este nivel se eliminó desde otra pestaña o ventana.')) +
        ' El guardado automático quedó en pausa para no sobrescribir nada.' +
        '<div class="fila-botones" style="margin-top:10px">' +
        '<button class="btn btn-primario btn-chico" data-accion="conflicto-copia">Guardar mis cambios como copia</button>' +
        (act ? '<button class="btn btn-chico" data-accion="conflicto-recargar">Descartar mis cambios y abrir la otra versión</button>' : '') +
        '<button class="btn btn-mal btn-chico" data-accion="conflicto-sobrescribir">Sobrescribir con mis cambios</button></div></div>';
    }
    var cuerpo = { episodios: vEpisodios, preguntas: vPreguntas, tablero: vTablero, configuracion: vConfiguracion, transferencia: vTransferencia }[E.pestana](v);
    return '<header class="barra barra-editor">' +
      '<button class="btn btn-sutil btn-chico" data-accion="ir-biblioteca">← Biblioteca</button>' +
      '<div class="titulo-nivel"><span class="eyebrow">Editor de niveles</span><strong id="titulo-nivel">' + esc(n.nombre) + '</strong></div>' +
      '<span id="indicador-guardado" aria-live="polite">' + textoIndicador() + '</span>' +
      '<span id="resumen-validacion" class="chips">' + resumenValidacion(v) + '</span>' +
      '<div class="fila-botones">' +
      '<button id="btn-guardar" class="btn btn-primario btn-chico" data-accion="guardar-nivel" ' + (E.sucio && E.estado !== 'guardando' ? '' : 'disabled') + '>Guardar</button>' +
      '<button class="btn btn-sutil btn-chico" data-accion="guardar-como-copia">Guardar como copia</button>' +
      '<button class="btn btn-sutil btn-chico" data-accion="ir-menu-editor">Menú</button>' +
      '</div></header>' + Q.avisoAlmacen() + conflicto + avisoIncluido(n) +
      '<nav class="pestanas" role="tablist" aria-label="Secciones del editor">' + PESTANAS.map(function (p) {
        var activa = E.pestana === p[0];
        return '<button role="tab" aria-selected="' + activa + '" class="pestana' + (activa ? ' activa' : '') + '" data-accion="pestana" data-p="' + p[0] + '" data-foco="tab-' + p[0] + '">' + p[1] +
          (cuentas[p[0]] !== undefined ? ' <span class="num cuenta">' + cuentas[p[0]] + '</span>' : '') + '</button>';
      }).join('') + '</nav>' +
      '<section class="editor-cuerpo" role="tabpanel">' + cuerpo + '</section>';
  };

  function avisoIncluido(n) {
    if (!N.esIncluido(n)) return '';
    return '<div class="caja caja-info aviso-incluido"><strong>Este nivel viene incluido en el juego.</strong> ' +
      'Pueden editarlo aquí, pero cuando se publique una versión nueva del nivel, se instalará esa versión y sus cambios se guardarán como una copia llamada «' + Q.esc(n.nombre) + ' (mis cambios)». ' +
      'Para cambiar la versión que reciben todos, editen el nivel, expórtenlo y sigan la guía <code>docs/publicar-niveles.md</code>.</div>';
  }

  Q.acciones['pestana'] = function (d) { E.pestana = d.p; };
  Q.acciones['guardar-nivel'] = function () { return guardar({}); };
  Q.acciones['ir-menu-editor'] = async function () {
    if (!(await Q.confirmarSalidaEditor())) return;
    await Q.cargarListas();
    Q.ir('menu');
  };

  Q.acciones['guardar-como-copia'] = function () {
    pedirNombre({
      titulo: 'Guardar como copia', nombre: E.nivel.nombre + ' (copia)', descripcion: E.nivel.descripcion, boton: 'Guardar copia',
      texto: 'Se guardará el contenido actual del editor como un nivel nuevo e independiente. El nivel original queda como estaba en su última versión guardada.',
      alAceptar: guardarComoCopia
    });
  };
  async function guardarComoCopia(nombre, descripcion) {
    var c = N.copia(E.nivel);
    c.id = N.nuevoId('nivel'); c.nombre = nombre; c.descripcion = descripcion; c.version = 0; c.creado = new Date().toISOString();
    var g = await Q.db.guardarNivel(c, { soloNuevo: true });
    clearTimeout(E.temporizador);
    E.nivel = N.copia(g); E.versionBase = g.version; E.sucio = false; E.cambios = 0; E.estado = 'guardado'; E.conflicto = null; E.ultimoGuardado = Q.hora();
    Q.toast('Copia «' + g.nombre + '» guardada. Ahora están editando la copia.');
  }

  Q.acciones['conflicto-copia'] = function () {
    pedirNombre({ titulo: 'Guardar mis cambios como copia', nombre: E.nivel.nombre + ' (mi versión)', descripcion: E.nivel.descripcion, boton: 'Guardar copia', alAceptar: guardarComoCopia });
  };
  Q.acciones['conflicto-recargar'] = function () {
    Q.confirmar({
      titulo: 'Descartar mis cambios', si: 'Descartar y abrir la otra versión', peligro: true,
      texto: 'Se perderán los cambios que hicieron en esta pestaña desde el último guardado.',
      alSi: async function () {
        var n = await Q.db.obtenerNivel(E.nivel.id);
        if (!n) { cerrarEditor(); await cargarBiblioteca(); Q.ir('biblioteca'); return; }
        await abrirEnEditor(n, E.pestana);
        Q.toast('Abierta la versión ' + n.version + '.');
      }
    });
  };
  Q.acciones['conflicto-sobrescribir'] = function () {
    Q.confirmar({
      titulo: 'Sobrescribir la otra versión', si: 'Sobrescribir', peligro: true,
      texto: 'Los cambios guardados desde la otra pestaña o ventana se perderán y quedará solo la versión de este editor.',
      alSi: function () { return guardar({ forzar: true }); }
    });
  };

  /* ---------- Sección: Episodios y cartas ---------- */

  function vListaEpisodios(v, modo) {
    var idx = indicesVisibles();
    var items = idx.map(function (i) {
      var e = E.nivel.episodios[i];
      var sel = E.epSel === i;
      var extra = modo === 'preguntas' ? '<span class="nota num">' + Q.plural(e.preguntas.length, 'pregunta', 'preguntas') + '</span>' : '<span class="chips" data-chips-ep="' + i + '">' + chipsEpisodio(v.porEpisodio[i]) + '</span>';
      return '<li><button class="item-ep' + (sel ? ' activo' : '') + '" data-accion="sel-ep" data-i="' + i + '" data-foco="ep-' + i + '" aria-current="' + sel + '">' +
        '<span class="o num">' + esc(e.ordenCronologico === '' ? '–' : e.ordenCronologico) + '</span>' +
        '<span class="mini">' + Q.arte(e, { editor: true }) + '</span>' +
        '<span class="info"><strong data-titulo-ep="' + i + '">' + esc(e.titulo || 'Sin título') + '</strong>' +
        '<span class="nota">' + Q.refCapitulo(e) + '</span>' + extra + '</span></button></li>';
    }).join('');
    return '<aside class="lista-cartas" aria-label="Lista de episodios">' +
      '<div class="filtros">' +
      '<input type="search" data-campo="edf.busqueda" data-foco="busqueda" placeholder="Buscar por título o capítulo" aria-label="Buscar por título o capítulo" value="' + esc(E.busqueda) + '">' +
      '<div class="dos"><select data-campo="edf.parte" aria-label="Filtrar por parte"><option value="todas"' + (E.filtroParte === 'todas' ? ' selected' : '') + '>Ambas partes</option><option value="1"' + (E.filtroParte === '1' ? ' selected' : '') + '>Primera parte</option><option value="2"' + (E.filtroParte === '2' ? ' selected' : '') + '>Segunda parte</option></select>' +
      '<select data-campo="edf.orden" aria-label="Ordenar la lista"><option value="orden"' + (E.orden === 'orden' ? ' selected' : '') + '>Orden cronológico</option><option value="capitulo"' + (E.orden === 'capitulo' ? ' selected' : '') + '>Parte y capítulo</option><option value="lista"' + (E.orden === 'lista' ? ' selected' : '') + '>Orden de creación</option></select></div>' +
      '</div>' +
      '<button class="btn btn-primario btn-chico" data-accion="nuevo-ep" data-foco="nuevo-ep">Nuevo episodio</button>' +
      '<p class="nota num">' + (idx.length === E.nivel.episodios.length ? Q.plural(idx.length, 'episodio', 'episodios') : idx.length + ' de ' + E.nivel.episodios.length + ' episodios') + '</p>' +
      '<ul class="lista-ep-ed">' + (items || '<li class="nota">No hay episodios que coincidan.</li>') + '</ul></aside>';
  }
  Q.alEscribir.edf = function (c, el) {
    if (c === 'edf.busqueda') { E.busqueda = el.value; Q.render(); }
  };
  Q.alCambiar.edf = function (c, el) {
    if (c === 'edf.parte') E.filtroParte = el.value;
    if (c === 'edf.orden') E.orden = el.value;
    if (c !== 'edf.busqueda') Q.render();
  };

  function campo(id, etiqueta, valor, extra, ayuda) {
    return '<div class="campo"><label for="f-' + id + '">' + etiqueta + '</label><input id="f-' + id + '" data-campo="ep.' + id + '" data-foco="f-' + id + '" value="' + esc(valor) + '" ' + (extra || '') + '>' +
      (ayuda ? '<span class="ayuda">' + ayuda + '</span>' : '') + '</div>';
  }

  function vImagenEpisodio(ep) {
    var id = N.idImagen(ep.imagen);
    var estado;
    if (!ep.imagen) estado = '<p class="nota">Sin imagen. Durante la partida se mostrará ' + (ep.emblema ? 'el emblema provisional elegido.' : 'un marcador provisional con el título.') + '</p>';
    else if (id && !Q.imagenExiste(id)) estado = '<p class="caja caja-error">La imagen guardada no se encuentra o no se puede cargar. Súbanla de nuevo o quítenla.</p>';
    else if (id) {
      var m = Q.imagenes.meta.get(id);
      estado = '<p class="nota">' + (m ? esc(m.nombre || 'Imagen') + ' · ' + m.ancho + ' × ' + m.alto + ' px · ' + Q.tamano(m.tamano) : 'Imagen guardada en este navegador.') + '</p>';
    } else estado = '<p class="nota">Ruta: <code>' + esc(ep.imagen) + '</code> (archivo dentro de la carpeta del juego).</p>';
    var emblemas = '<option value="">Ninguno</option>' + Object.keys(Q.EMBLEMAS).map(function (k) {
      return '<option value="' + k + '"' + (ep.emblema === k ? ' selected' : '') + '>' + Q.NOMBRES_EMBLEMA[k] + '</option>';
    }).join('');
    return '<fieldset class="grupo"><legend>Imagen del episodio</legend><div class="imagen-ed">' +
      '<div class="casilla vista-previa' + (ep.imagen ? ' con-imagen' : '') + '"><span class="arte">' + Q.arte(ep, { editor: true }) + '</span><span class="pie">Vista previa</span></div>' +
      '<div class="imagen-controles">' + estado +
      '<div class="fila-botones"><label class="btn btn-chico">' + (ep.imagen ? 'Cambiar imagen' : 'Subir imagen') +
      '<input type="file" class="sr" accept="image/png,image/jpeg,image/webp,image/gif" data-archivo="imagen-ep" aria-label="' + (ep.imagen ? 'Cambiar imagen' : 'Subir imagen') + '"></label>' +
      (ep.imagen ? '<button class="btn btn-sutil btn-chico" data-accion="quitar-imagen">Quitar imagen</button>' : '') + '</div>' +
      '<span class="ayuda">PNG, JPEG o WebP. Las imágenes de más de 1600 px se reducen para ahorrar espacio. Cambiar la imagen no modifica la descripción ni las preguntas.</span>' +
      '<div class="campo"><label for="f-emblema">Emblema provisional (si no hay imagen)</label><select id="f-emblema" data-campo="ep.emblema">' + emblemas + '</select></div>' +
      '</div></div></fieldset>';
  }

  function vFicha(v) {
    var ep = epActual();
    if (!ep) return '<section class="ficha"><div class="caja caja-info">Elijan un episodio de la lista o creen uno nuevo.</div></section>';
    var i = E.epSel;
    return '<section class="ficha" aria-label="Ficha del episodio">' +
      '<div class="fila-botones ficha-cabecera"><h2>' + esc(ep.titulo || 'Episodio sin título') + '</h2>' +
      '<span class="fila-botones"><button class="btn btn-sutil btn-chico" data-accion="duplicar-ep">Duplicar</button>' +
      '<button class="btn btn-sutil btn-chico" data-accion="eliminar-ep">Eliminar</button></span></div>' +
      '<div id="problemas-ep">' + problemasHTML(v.porEpisodio[i]) + '</div>' +
      '<fieldset class="grupo"><legend>Datos del episodio</legend>' +
      '<div class="dos-col">' + campo('titulo', 'Título del episodio', ep.titulo, 'maxlength="100"') +
      campo('id', 'Identificador único', ep.id, 'maxlength="40" spellcheck="false"', 'Lo usa el juego para comprobar las parejas. No se muestra a los jugadores.') + '</div>' +
      '<div class="tres-col">' +
      '<div class="campo"><label for="f-parte">Parte de la obra</label><select id="f-parte" data-campo="ep.parte">' +
      '<option value=""' + (ep.parte === '' ? ' selected' : '') + '>Sin indicar</option>' +
      '<option value="1"' + (String(ep.parte) === '1' ? ' selected' : '') + '>Primera parte (1605)</option>' +
      '<option value="2"' + (String(ep.parte) === '2' ? ' selected' : '') + '>Segunda parte (1615)</option></select></div>' +
      campo('capitulo', 'Capítulo', ep.capitulo, 'inputmode="numeric"') +
      campo('ordenCronologico', 'Orden cronológico', ep.ordenCronologico, 'inputmode="numeric"', 'Posición en la secuencia final.') + '</div>' +
      '<div class="campo"><label for="f-descripcion">Descripción que leerá el jugador</label><textarea id="f-descripcion" data-campo="ep.descripcion" data-foco="f-descripcion">' + esc(ep.descripcion) + '</textarea>' +
      '<span class="ayuda">Usen paráfrasis propias o citas verificadas con su edición.</span></div>' +
      '<div class="campo"><label for="f-notas">Notas privadas para el árbitro</label><textarea id="f-notas" data-campo="ep.notasArbitro" data-foco="f-notas" style="min-height:64px">' + esc(ep.notasArbitro) + '</textarea></div>' +
      '<label class="casilla-check"><input type="checkbox" data-campo="ep.provisional" ' + (ep.provisional !== false ? 'checked' : '') + '> Material provisional (pendiente de aprobación del grupo)</label>' +
      '</fieldset>' + vImagenEpisodio(ep) +
      '<p class="nota">Las preguntas de este episodio se editan en la sección <button class="enlace" data-accion="pestana" data-p="preguntas">Preguntas</button> (' + Q.plural(ep.preguntas.length, 'pregunta', 'preguntas') + ').</p>' +
      '</section>';
  }

  function vEpisodios(v) {
    return '<div class="editor-dos">' + vListaEpisodios(v, 'episodios') + vFicha(v) + '</div>';
  }

  function aNumero(v) { var t = String(v).trim(); return t !== '' && Number.isFinite(Number(t)) ? Number(t) : t; }

  Q.alEscribir.ep = function (c, el) {
    var ep = epActual();
    if (!ep) return;
    var k = c.split('.')[1];
    if (k === 'id') return;  // el identificador se aplica al salir del campo (change)
    if (k === 'capitulo' || k === 'ordenCronologico') ep[k] = aNumero(el.value);
    else if (k === 'provisional') ep[k] = el.checked;
    else ep[k] = el.value;
    if (k === 'titulo') {
      var t = document.querySelector('[data-titulo-ep="' + E.epSel + '"]');
      if (t) t.textContent = el.value || 'Sin título';
    }
    marcarCambio();
    refrescoParcial();
  };
  Q.alCambiar.ep = function (c, el) {
    var ep = epActual();
    if (!ep) return;
    var k = c.split('.')[1];
    if (k === 'id') {
      var nuevo = el.value.trim();
      if (nuevo !== ep.id) { N.renombrarEpisodio(E.nivel, E.epSel, nuevo); marcarCambio(); refrescoParcial(); }
      return;
    }
    if (k === 'parte') { ep.parte = el.value === '' ? '' : Number(el.value); marcarCambio(); Q.render(); return; }
    if (k === 'emblema') { ep.emblema = el.value; marcarCambio(); Q.render(); return; }
    if (k === 'provisional') { ep.provisional = el.checked; marcarCambio(); refrescoParcial(); }
  };

  Q.acciones['sel-ep'] = async function (d) {
    E.epSel = Number(d.i);
    var ep = epActual();
    var id = ep && N.idImagen(ep.imagen);
    if (id && !Q.imagenes.meta.has(id)) await Q.cargarImagenes([id]);
  };
  Q.acciones['nuevo-ep'] = function () {
    E.busqueda = ''; E.filtroParte = 'todas';
    E.epSel = N.crearEpisodio(E.nivel);
    if (E.pestana !== 'episodios') E.pestana = 'episodios';
    marcarCambio();
    Q.toast('Episodio nuevo creado. Completen sus datos; queda en la reserva hasta colocarlo en el tablero.');
  };
  Q.acciones['duplicar-ep'] = function () {
    var i = N.duplicarEpisodio(E.nivel, E.epSel);
    E.epSel = i;
    marcarCambio();
    Q.toast('Copia creada con el identificador «' + E.nivel.episodios[i].id + '». Está en la reserva; indiquen su orden cronológico.');
  };
  Q.acciones['eliminar-ep'] = function () {
    var ep = epActual();
    if (!ep) return;
    var i = E.epSel;
    Q.confirmar({
      titulo: 'Eliminar episodio', si: 'Eliminar', peligro: true,
      texto: 'Se eliminará «' + (ep.titulo || ep.id || 'sin título') + '» con sus ' + Q.plural(ep.preguntas.length, 'pregunta', 'preguntas') + ' y saldrá del tablero. El cambio se aplica a este nivel cuando se guarde.',
      alSi: function () {
        N.eliminarEpisodio(E.nivel, i);
        E.epSel = E.nivel.episodios.length ? Math.min(i, E.nivel.episodios.length - 1) : null;
        marcarCambio();
        Q.toast('Episodio eliminado.');
      }
    });
  };
  Q.acciones['quitar-imagen'] = function () {
    var ep = epActual();
    if (!ep) return;
    ep.imagen = '';
    marcarCambio();
    Q.toast('Imagen quitada. La descripción y las preguntas no cambiaron.');
  };

  /* ---------- Sección: Preguntas ---------- */

  function vPreguntas(v) {
    var ep = epActual();
    var cuerpo;
    if (!ep) cuerpo = '<section class="ficha"><div class="caja caja-info">Elijan un episodio de la lista.</div></section>';
    else {
      var lista = ep.preguntas.map(function (p, k) {
        return '<div class="pregunta-ed">' +
          '<div class="fila-botones" style="justify-content:space-between"><strong>Pregunta ' + (k + 1) + '</strong><span class="fila-botones">' +
          '<button class="btn btn-sutil btn-chico" data-accion="mover-preg" data-k="' + k + '" data-d="-1" ' + (k === 0 ? 'disabled' : '') + ' aria-label="Subir la pregunta ' + (k + 1) + '">▲</button>' +
          '<button class="btn btn-sutil btn-chico" data-accion="mover-preg" data-k="' + k + '" data-d="1" ' + (k === ep.preguntas.length - 1 ? 'disabled' : '') + ' aria-label="Bajar la pregunta ' + (k + 1) + '">▼</button>' +
          '<button class="btn btn-sutil btn-chico" data-accion="eliminar-preg" data-k="' + k + '">Eliminar</button></span></div>' +
          '<div class="campo"><label for="pq-t' + k + '">Texto de la pregunta</label><textarea id="pq-t' + k + '" data-campo="pq.texto.' + k + '" data-foco="pq-t' + k + '" style="min-height:64px">' + esc(p.texto) + '</textarea></div>' +
          '<div class="campo"><label for="pq-r' + k + '">Respuesta de referencia (privada para el árbitro)</label><textarea id="pq-r' + k + '" data-campo="pq.respuesta.' + k + '" data-foco="pq-r' + k + '" style="min-height:64px" placeholder="Pueden dejarla vacía; el árbitro verá un aviso">' + esc(p.respuesta) + '</textarea></div>' +
          '<div class="campo"><label for="pq-n' + k + '">Criterio de evaluación (opcional)</label><input id="pq-n' + k + '" data-campo="pq.notas.' + k + '" data-foco="pq-n' + k + '" value="' + esc(p.notas) + '" placeholder="Por ejemplo: aceptar si menciona a Frestón"></div>' +
          '</div>';
      }).join('');
      cuerpo = '<section class="ficha" aria-label="Preguntas del episodio">' +
        '<div class="ficha-cabecera"><span class="eyebrow">Preguntas de</span><h2>' + esc(ep.titulo || 'Episodio sin título') + '</h2></div>' +
        '<p class="nota">Por turno se usa ' + (E.nivel.config.seleccionPregunta === 'primera' ? 'primero la primera pregunta' : 'una pregunta al azar') + ' y el árbitro puede pasar a otra. Se cambia en <button class="enlace" data-accion="pestana" data-p="configuracion">Configuración</button>.</p>' +
        (lista || '<div class="caja caja-aviso">Este episodio no tiene preguntas.</div>') +
        '<div><button class="btn btn-chico" data-accion="nueva-preg" data-foco="nueva-preg">Añadir pregunta</button></div>' +
        '<div class="campo"><label for="pq-notas-ep">Notas privadas para el árbitro (todo el episodio)</label><textarea id="pq-notas-ep" data-campo="ep.notasArbitro" data-foco="pq-notas-ep" style="min-height:64px">' + esc(ep.notasArbitro) + '</textarea></div>' +
        '</section>';
    }
    return '<div class="editor-dos">' + vListaEpisodios(v, 'preguntas') + cuerpo + '</div>';
  }

  Q.alEscribir.pq = function (c, el) {
    var ep = epActual();
    if (!ep) return;
    var p = c.split('.');
    var preg = ep.preguntas[Number(p[2])];
    if (!preg) return;
    preg[p[1]] = el.value;
    marcarCambio();
    refrescoParcial();
  };
  Q.acciones['nueva-preg'] = function () {
    var ep = epActual();
    if (!ep) return;
    ep.preguntas.push(N.normalizarPregunta({ texto: '' }));
    marcarCambio();
    setTimeout(function () { var t = document.getElementById('pq-t' + (ep.preguntas.length - 1)); if (t) t.focus(); }, 0);
  };
  Q.acciones['mover-preg'] = function (d) {
    var ep = epActual();
    var k = Number(d.k);
    N.moverPregunta(ep, k, k + Number(d.d));
    marcarCambio();
  };
  Q.acciones['eliminar-preg'] = function (d) {
    var ep = epActual();
    var k = Number(d.k);
    var p = ep.preguntas[k];
    var quitar = function () { ep.preguntas.splice(k, 1); marcarCambio(); };
    if (!p.texto.trim() && !p.respuesta.trim() && !p.notas.trim()) { quitar(); return; }
    Q.confirmar({
      titulo: 'Eliminar la pregunta ' + (k + 1), si: 'Eliminar', peligro: true,
      texto: 'Se eliminará la pregunta con su respuesta de referencia y su criterio de evaluación.',
      alSi: quitar
    });
  };

  /* ---------- Sección: Tablero ---------- */

  function vTablero(v) {
    var n = E.nivel, cfg = n.config;
    var porId = {};
    n.episodios.forEach(function (e, i) { if (e.id && porId[e.id] === undefined) porId[e.id] = i; });
    var espacios = n.tablero.map(function (id, pos) {
      var sel = E.slotSel === pos;
      var ep = id ? n.episodios[porId[id]] : null;
      var contenido = ep
        ? '<span class="arte">' + Q.arte(ep, { editor: true }) + '</span><span class="pie-ed"><b class="num">Espacio ' + (pos + 1) + '</b><span>' + esc(ep.titulo || 'Sin título') + '</span><code>' + esc(ep.id) + '</code></span>'
        : '<span class="arte"></span><span class="pie-ed"><b class="num">Espacio ' + (pos + 1) + '</b><span>Vacío</span></span>';
      return '<button class="espacio' + (ep ? '' : ' vacio') + (sel ? ' seleccionado' : '') + '" data-accion="sel-espacio" data-pos="' + pos + '" data-foco="esp-' + pos + '" aria-pressed="' + sel + '"' +
        ' draggable="' + (ep ? 'true' : 'false') + '" data-arrastre="espacio" data-soltar="espacio">' + contenido + '</button>';
    }).join('');
    var reservaIdx = N.enReserva(n);
    var reserva = reservaIdx.map(function (i) {
      var e = n.episodios[i];
      var valido = e.id && n.episodios.filter(function (x) { return x.id === e.id; }).length === 1;
      return '<li class="reserva-item" draggable="' + valido + '" data-arrastre="reserva" data-i="' + i + '">' +
        '<span class="mini">' + Q.arte(e, { editor: true }) + '</span><span class="info"><strong>' + esc(e.titulo || 'Sin título') + '</strong><span class="nota">' + Q.refCapitulo(e) + '</span></span>' +
        (valido ? '<button class="btn btn-chico" data-accion="colocar" data-i="' + i + '">' + (E.slotSel !== null ? 'Poner en el espacio ' + (E.slotSel + 1) : 'Colocar') + '</button>'
          : '<span class="chip chip-error">Falta un id único</span>') + '</li>';
    }).join('');
    var panelSel = '';
    if (E.slotSel !== null) {
      var idSel = n.tablero[E.slotSel];
      var epSel = idSel ? n.episodios[porId[idSel]] : null;
      panelSel = '<div class="caja caja-info"><strong>Espacio ' + (E.slotSel + 1) + '</strong>: ' + (epSel ? esc(epSel.titulo) + ' <code>' + esc(epSel.id) + '</code>' : 'vacío') +
        '<div class="fila-botones" style="margin-top:8px">' +
        (epSel ? '<button class="btn btn-chico" data-accion="retirar-espacio">Retirar del tablero</button><button class="btn btn-sutil btn-chico" data-accion="ir-a-ep" data-i="' + porId[idSel] + '">Editar este episodio</button>' : '') +
        '<button class="btn btn-sutil btn-chico" data-accion="sel-espacio" data-pos="' + E.slotSel + '">Quitar la selección</button></div>' +
        '<p class="nota" style="margin-top:6px">Toquen otro espacio para intercambiarlos, o elijan un episodio de la reserva para ponerlo aquí.</p></div>';
    }
    var c = v.conteos;
    var aviso = cfg.exigirCompleto && c.enTablero !== v.espacios
      ? '<div class="caja caja-error">El formato exige ' + v.espacios + ' imágenes y hay ' + c.enTablero + '. ' + (c.enTablero < v.espacios ? 'Faltan ' + (v.espacios - c.enTablero) + '.' : '') + '</div>'
      : (!cfg.exigirCompleto && c.enTablero < v.espacios ? '<div class="caja caja-aviso">Hay ' + (v.espacios - c.enTablero) + ' espacios vacíos. Este nivel permite jugar con el tablero incompleto (se cambia en Configuración).</div>' : '');
    return '<div class="editor-tablero">' +
      '<section class="tablero-ed-zona">' +
      '<div class="fila-botones" style="justify-content:space-between"><p><strong class="num">' + c.enTablero + ' de ' + v.espacios + '</strong> espacios ocupados · ' + cfg.columnas + ' columnas × ' + cfg.filas + ' filas</p>' +
      '<span class="fila-botones"><button class="btn btn-chico" data-accion="llenar-vacios" ' + (reservaIdx.length ? '' : 'disabled') + '>Llenar espacios vacíos con la reserva</button>' +
      '<button class="btn btn-sutil btn-chico" data-accion="mezclar-tablero">Mezclar posiciones</button>' +
      '<button class="btn btn-sutil btn-chico" data-accion="vaciar-tablero">Vaciar tablero</button></span></div>' + aviso +
      '<div class="tablero tablero-ed" style="--cols:' + cfg.columnas + ';--filas:' + cfg.filas + '" role="group" aria-label="Vista previa del tablero">' + espacios + '</div>' +
      '<p class="nota">Así se verá el tablero en la partida' + (cfg.barajarTablero ? ', aunque este nivel mezcla las posiciones al empezar' : '') + '. El número del espacio es solo su posición: no es el identificador del episodio. Mover cartas no cambia sus datos ni su orden cronológico. Pueden arrastrar un espacio sobre otro para intercambiarlos.</p>' +
      '</section>' +
      '<aside class="reserva" aria-label="Episodios en la reserva">' + panelSel +
      '<h3>Reserva <span class="num nota">(' + reservaIdx.length + ')</span></h3>' +
      '<p class="nota">Episodios del nivel que no están en el tablero y no participarán en la partida. Arrástrenlos a un espacio o usen «Colocar».</p>' +
      (reserva ? '<ul class="lista-reserva">' + reserva + '</ul>' : '<p class="nota">Todos los episodios están en el tablero.</p>') +
      '</aside></div>';
  }

  Q.acciones['sel-espacio'] = function (d) {
    var pos = Number(d.pos);
    if (E.slotSel === null) { E.slotSel = pos; return; }
    if (E.slotSel === pos) { E.slotSel = null; return; }
    N.intercambiarEspacios(E.nivel, E.slotSel, pos);
    E.slotSel = null;
    marcarCambio();
  };
  Q.acciones['retirar-espacio'] = function () {
    if (E.slotSel === null) return;
    N.asignarEspacio(E.nivel, E.slotSel, null);
    marcarCambio();
  };
  Q.acciones['colocar'] = function (d) {
    var ep = E.nivel.episodios[Number(d.i)];
    var pos = E.slotSel !== null ? E.slotSel : E.nivel.tablero.indexOf(null);
    if (pos < 0) { Q.toast('No hay espacios libres. Retiren un episodio o elijan un espacio para reemplazarlo.', 'error'); return; }
    N.asignarEspacio(E.nivel, pos, ep.id);
    E.slotSel = null;
    marcarCambio();
  };
  Q.acciones['ir-a-ep'] = function (d) { E.epSel = Number(d.i); E.pestana = 'episodios'; };
  Q.acciones['llenar-vacios'] = function () {
    var k = N.llenarVacios(E.nivel);
    if (k) marcarCambio();
    Q.toast(k ? Q.plural(k, 'episodio colocado', 'episodios colocados') + ' en los espacios vacíos.' : 'No había episodios válidos en la reserva o espacios vacíos.');
  };
  Q.acciones['mezclar-tablero'] = function () {
    Q.confirmar({ titulo: 'Mezclar las posiciones', si: 'Mezclar', texto: 'Las cartas cambiarán de espacio al azar. Los episodios y sus datos no cambian.', alSi: function () { N.mezclarTablero(E.nivel); E.slotSel = null; marcarCambio(); } });
  };
  Q.acciones['vaciar-tablero'] = function () {
    Q.confirmar({ titulo: 'Vaciar el tablero', si: 'Vaciar', peligro: true, texto: 'Todos los episodios volverán a la reserva. No se elimina ningún episodio.', alSi: function () { N.vaciarTablero(E.nivel); E.slotSel = null; marcarCambio(); } });
  };
  Q.arrastre.espacio = {
    acepta: function (o) { return o.tipo === 'espacio' || o.tipo === 'reserva'; },
    soltar: function (o, d) {
      var destino = Number(d.pos);
      if (o.tipo === 'espacio') { if (Number(o.datos.pos) !== destino) { N.intercambiarEspacios(E.nivel, Number(o.datos.pos), destino); marcarCambio(); } }
      else { N.asignarEspacio(E.nivel, destino, E.nivel.episodios[Number(o.datos.i)].id); marcarCambio(); }
      E.slotSel = null;
    }
  };

  /* ---------- Sección: Configuración ---------- */

  function opciones(valores, actual) {
    return valores.map(function (v) { return '<option value="' + v[0] + '"' + (String(actual) === String(v[0]) ? ' selected' : '') + '>' + v[1] + '</option>'; }).join('');
  }

  function vConfiguracion() {
    var n = E.nivel, cfg = n.config;
    var t = E.tamano || { columnas: cfg.columnas, filas: cfg.filas };
    var rango = [];
    for (var k = N.LIMITES_TABLERO.min; k <= N.LIMITES_TABLERO.max; k++) rango.push([k, String(k)]);
    var cambiaTamano = t.columnas !== cfg.columnas || t.filas !== cfg.filas;
    var retirarian = cambiaTamano ? N.cuantosRetiraria(n, t.columnas, t.filas) : 0;
    return '<div class="config-ed">' +
      '<fieldset class="grupo"><legend>Nivel</legend>' +
      '<div class="campo"><label for="c-nombre">Nombre</label><input id="c-nombre" data-campo="cn.nombre" data-foco="c-nombre" maxlength="80" value="' + esc(n.nombre) + '"></div>' +
      '<div class="campo"><label for="c-desc">Descripción</label><textarea id="c-desc" data-campo="cn.descripcion" data-foco="c-desc" style="min-height:70px" maxlength="400">' + esc(n.descripcion) + '</textarea></div>' +
      '<div class="dos-col"><div class="campo"><label for="c-estado">Estado del material</label><select id="c-estado" data-campo="cc.estado">' + opciones([['provisional', 'Provisional'], ['aprobado', 'Aprobado por el grupo']], cfg.estado) + '</select></div>' +
      '<div class="campo"><label for="c-edicion">Edición de referencia</label><input id="c-edicion" data-campo="cc.edicionReferencia" data-foco="c-edicion" value="' + esc(cfg.edicionReferencia) + '" placeholder="Editorial, año y editor"></div></div>' +
      '<p class="nota num">Identificador del nivel: <code>' + esc(n.id) + '</code> · versión guardada ' + E.versionBase + ' · creado ' + Q.fecha(n.creado) + ' · modificado ' + Q.fecha(n.modificado) + '</p>' +
      '</fieldset>' +
      '<fieldset class="grupo"><legend>Formato del tablero (configuración avanzada)</legend>' +
      '<p class="nota">El formato predeterminado es de 30 imágenes en 6 columnas × 5 filas.</p>' +
      '<div class="tres-col"><div class="campo"><label for="c-cols">Columnas</label><select id="c-cols" data-campo="ct.columnas">' + opciones(rango, t.columnas) + '</select></div>' +
      '<div class="campo"><label for="c-filas">Filas</label><select id="c-filas" data-campo="ct.filas">' + opciones(rango, t.filas) + '</select></div>' +
      '<div class="campo"><span class="etiqueta">Espacios</span><p class="num total-espacios">' + (t.columnas * t.filas) + '</p></div></div>' +
      (cambiaTamano ? '<div class="caja caja-aviso">' + (retirarian ? 'Con este tamaño, ' + Q.plural(retirarian, 'episodio pasará', 'episodios pasarán') + ' a la reserva.' : 'Ningún episodio saldrá del tablero.') +
        '<div class="fila-botones" style="margin-top:8px"><button class="btn btn-primario btn-chico" data-accion="aplicar-tamano">Aplicar ' + t.columnas + ' × ' + t.filas + '</button><button class="btn btn-sutil btn-chico" data-accion="cancelar-tamano">Cancelar</button></div></div>' : '') +
      '<label class="casilla-check"><input type="checkbox" data-campo="cc.exigirCompleto" ' + (cfg.exigirCompleto ? 'checked' : '') + '> Exigir que todos los espacios tengan un episodio para poder jugar</label>' +
      '<label class="casilla-check"><input type="checkbox" data-campo="cc.barajarTablero" ' + (cfg.barajarTablero ? 'checked' : '') + '> Mezclar las posiciones de las imágenes al empezar cada partida</label>' +
      '</fieldset>' +
      '<fieldset class="grupo"><legend>Reglas de la partida</legend>' +
      '<div class="campo"><label for="c-preg">Pregunta en cada turno</label><select id="c-preg" data-campo="cc.seleccionPregunta">' + opciones([['aleatoria', 'Una al azar entre las del episodio'], ['primera', 'Siempre la primera de la lista']], cfg.seleccionPregunta) + '</select></div>' +
      '<div class="campo"><label for="c-punt">Puntuación de la fase cronológica</label><select id="c-punt" data-campo="cc.puntuacion">' + opciones([['posicion', 'Cada pieza en su posición correcta'], ['subsecuencia', 'Secuencia más larga en orden correcto']], cfg.puntuacion) + '</select></div>' +
      '<label class="casilla-check"><input type="checkbox" data-campo="cc.permitirFinAnticipado" ' + (cfg.permitirFinAnticipado ? 'checked' : '') + '> El árbitro puede terminar la fase de juego antes de agotar el mazo</label>' +
      '</fieldset>' +
      '<fieldset class="grupo"><legend>Guardado</legend>' +
      '<label class="casilla-check"><input type="checkbox" data-campo="cg.autoguardado" ' + (E.autoguardado ? 'checked' : '') + '> Guardar automáticamente unos segundos después de cada cambio</label>' +
      '<p class="nota">El guardado automático se detiene si otra pestaña guardó este nivel antes, para no sobrescribir sus cambios. Esta preferencia vale para este navegador.</p>' +
      '</fieldset>' +
      '<fieldset class="grupo peligro"><legend>Eliminar</legend><button class="btn btn-mal btn-chico" data-accion="eliminar-nivel" data-id="' + esc(n.id) + '">Eliminar este nivel</button></fieldset>' +
      '</div>';
  }

  Q.alEscribir.cn = function (c, el) {
    E.nivel[c.split('.')[1]] = el.value;
    if (c === 'cn.nombre') { var t = document.getElementById('titulo-nivel'); if (t) t.textContent = el.value; }
    marcarCambio();
  };
  Q.alEscribir.cc = function (c, el) {
    var k = c.split('.')[1];
    if (k === 'edicionReferencia') { E.nivel.config[k] = el.value; marcarCambio(); }
  };
  Q.alCambiar.cc = function (c, el) {
    var k = c.split('.')[1];
    if (k === 'edicionReferencia') return;
    E.nivel.config[k] = Q.valorDe(el);
    marcarCambio();
    Q.render();
  };
  Q.alCambiar.ct = function (c, el) {
    var cfg = E.nivel.config;
    E.tamano = E.tamano || { columnas: cfg.columnas, filas: cfg.filas };
    E.tamano[c.split('.')[1]] = Number(el.value);
    Q.render();
  };
  Q.alCambiar.cg = function (c, el) {
    E.autoguardado = el.checked;
    Q.preferencias.guardar('autoguardado', el.checked);
    if (E.autoguardado && E.sucio) programarAutoguardado();
    pintarIndicador();
  };
  Q.acciones['cancelar-tamano'] = function () { E.tamano = null; };
  Q.acciones['aplicar-tamano'] = function () {
    var t = E.tamano;
    if (!t) return;
    var aplicar = function () {
      var r = N.redimensionar(E.nivel, t.columnas, t.filas);
      E.tamano = null; E.slotSel = null;
      marcarCambio();
      Q.toast('Tablero de ' + t.columnas + ' × ' + t.filas + '.' + (r.retirados.length ? ' ' + Q.plural(r.retirados.length, 'episodio pasó', 'episodios pasaron') + ' a la reserva.' : ''));
    };
    var k = N.cuantosRetiraria(E.nivel, t.columnas, t.filas);
    if (!k) { aplicar(); return; }
    Q.confirmar({ titulo: 'Cambiar el tamaño del tablero', si: 'Aplicar', texto: Q.plural(k, 'episodio no cabrá y pasará', 'episodios no cabrán y pasarán') + ' a la reserva. No se elimina ningún episodio.', alSi: aplicar });
  };

  /* ---------- Sección: Importar y exportar ---------- */

  function vTransferencia() {
    return '<div class="config-ed">' +
      '<fieldset class="grupo"><legend>Exportar este nivel</legend>' +
      '<p>Crea un archivo <strong>.zip</strong> con <code>nivel.json</code> (episodios, preguntas, tablero y configuración) y la carpeta <code>imagenes/</code> con todas las imágenes del nivel. Sirve para guardarlo fuera del navegador o llevarlo a otro computador.</p>' +
      '<div class="fila-botones"><button class="btn btn-primario" data-accion="exportar-actual" data-foco="exportar-actual">Exportar nivel (.zip con imágenes)</button></div>' +
      '</fieldset>' +
      '<fieldset class="grupo"><legend>Importar un nivel</legend>' +
      '<p>Acepta un .zip exportado por el juego, una copia de seguridad de la biblioteca o un archivo .json (en ese caso, sin imágenes). Antes de guardar se muestra un informe; nunca se reemplaza un nivel existente sin confirmación.</p>' +
      '<label class="btn">Elegir archivo para importar<input type="file" class="sr" accept=".zip,.json,application/zip,application/json" data-archivo="importar"></label>' +
      '</fieldset>' +
      '<fieldset class="grupo"><legend>Copia de seguridad</legend>' +
      '<p>Un solo .zip con todos los niveles de la biblioteca y sus imágenes.</p>' +
      '<button class="btn" data-accion="exportar-biblioteca">Exportar copia de seguridad de la biblioteca</button>' +
      '</fieldset>' + infoAlmacen() + '</div>';
  }

  /* ---------- Al dibujar ---------- */

  var anteriorAlDibujar = Q.alDibujar;
  Q.alDibujar = function () {
    if (anteriorAlDibujar) anteriorAlDibujar();
    if (Q.ui.pantalla === 'editor' && E.pestana === 'episodios' && E.estado !== 'guardando') pintarIndicador();
  };

  // Al entrar en la pestaña Configuración desde otro lugar, se olvida un tamaño sin aplicar.
  var pestanaAnterior = Q.acciones.pestana;
  Q.acciones.pestana = function (d) { if (d.p !== 'configuracion') E.tamano = null; pestanaAnterior(d); };
})();
