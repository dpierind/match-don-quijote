/*
 * El match con Don Quijote — pantallas de juego.
 * Menú principal, elección de nivel con su informe, preparación, mesa de juego,
 * panel del árbitro, fase cronológica, resultados y partidas guardadas.
 */
(function () {
  'use strict';

  var Q = window.Quijote, M = Q.M, N = Q.N, esc = Q.esc;

  var J = Q.ui.j = {
    nivel: null,            // nivel elegido para jugar (versión guardada)
    informe: null,
    config: { n: 2, nombres: ['', '', '', ''], arbitro: '' },
    arbitroDentro: false, verReferencia: false, verLectura: false, observacion: '',
    intro: false, reglas: false,
    guardado: { estado: '', hora: '' },
    listaPartidas: [], listaNiveles: [],
    continuar: null         // registro de partida que se va a continuar
  };

  function resetArbitro() { J.arbitroDentro = false; J.verReferencia = false; J.verLectura = false; J.observacion = ''; }
  Q.resetArbitro = resetArbitro;

  /* ---------- Guardado de partidas ---------- */

  function registroPartida(s) {
    return {
      id: s.id,
      nivelId: s.nivel.id, nivelNombre: s.nivel.nombre, nivelVersion: s.nivel.version,
      jugadores: s.jugadores.map(function (j) { return j.nombre; }), arbitro: s.arbitro,
      fase: s.fase, terminada: s.fase === 'resultados',
      creada: s.creada, guardada: new Date().toISOString(),
      estado: s
    };
  }

  Q.guardarPartida = async function (manual) {
    var s = Q.ui.partida;
    if (!s || !Q.db) return false;
    J.guardado = { estado: 'guardando', hora: '' };
    pintarEstadoPartida();
    try {
      await Q.db.guardarPartida(registroPartida(s));
      J.guardado = { estado: 'guardada', hora: Q.hora() };
      pintarEstadoPartida();
      if (manual) {
        var d = M.describirEstado(s);
        Q.toast('Partida guardada.' + (d.pendiente ? ' Quedó registrada la jugada pendiente: ' + d.pendiente : ''));
      }
      return true;
    } catch (e) {
      J.guardado = { estado: 'error', hora: '' };
      pintarEstadoPartida();
      Q.mostrarError(e, 'No se pudo guardar la partida');
      return false;
    }
  };

  function textoEstadoPartida() {
    var g = J.guardado;
    if (Q.db && Q.db.modo === 'memoria') return '<span class="estado-guardado aviso">Sin guardado permanente</span>';
    if (g.estado === 'guardando') return '<span class="estado-guardado">Guardando…</span>';
    if (g.estado === 'guardada') return '<span class="estado-guardado ok">Partida guardada · ' + esc(g.hora) + '</span>';
    if (g.estado === 'error') return '<span class="estado-guardado error">No se pudo guardar</span>';
    return '';
  }
  function pintarEstadoPartida() {
    var el = document.getElementById('estado-partida');
    if (el) el.innerHTML = textoEstadoPartida();
  }

  // Ejecuta una acción del motor y guarda la partida automáticamente.
  function jugar(fn) {
    try {
      fn(Q.ui.partida);
      Q.guardarPartida(false);
      return true;
    } catch (e) {
      if (e && e.name === 'ErrorJuego') Q.toast(e.message, 'error');
      else Q.mostrarError(e);
      return false;
    }
  }

  /* ---------- Bloques compartidos ---------- */

  function grabadoPortada() {
    function molino(x, y, s, a) {
      var g = '<g>';
      g += '<path class="relleno-papel tinta" stroke-width="2" d="M' + (x - 18 * s) + ' ' + y + ' L' + (x - 12 * s) + ' ' + (y - 70 * s) + ' L' + (x + 12 * s) + ' ' + (y - 70 * s) + ' L' + (x + 18 * s) + ' ' + y + ' Z"/>';
      g += '<path fill="url(#rayado)" d="M' + x + ' ' + y + ' L' + x + ' ' + (y - 70 * s) + ' L' + (x + 12 * s) + ' ' + (y - 70 * s) + ' L' + (x + 18 * s) + ' ' + y + ' Z"/>';
      g += '<path class="relleno-papel tinta" stroke-width="2" d="M' + (x - 15 * s) + ' ' + (y - 70 * s) + ' Q' + x + ' ' + (y - 96 * s) + ' ' + (x + 15 * s) + ' ' + (y - 70 * s) + ' Z"/>';
      g += '<path class="relleno-papel tinta" stroke-width="1.6" d="M' + (x - 4 * s) + ' ' + y + ' v' + (-14 * s) + ' a' + (4 * s) + ' ' + (4 * s) + ' 0 0 1 ' + (8 * s) + ' 0 v' + (14 * s) + '"/>';
      var hx = x, hy = y - 76 * s;
      for (var k = 0; k < 4; k++) {
        g += '<g transform="rotate(' + (a + k * 90) + ' ' + hx + ' ' + hy + ')">';
        g += '<line class="tinta" stroke-width="2" x1="' + hx + '" y1="' + hy + '" x2="' + (hx + 66 * s) + '" y2="' + hy + '"/>';
        g += '<rect class="relleno-papel tinta" stroke-width="1.4" x="' + (hx + 16 * s) + '" y="' + (hy - 11 * s) + '" width="' + (50 * s) + '" height="' + (11 * s) + '"/>';
        for (var t = 1; t < 5; t++) {
          var lx = hx + 16 * s + t * 10 * s;
          g += '<line class="tinta" stroke-width="1" x1="' + lx + '" y1="' + (hy - 11 * s) + '" x2="' + lx + '" y2="' + hy + '"/>';
        }
        g += '</g>';
      }
      g += '<circle class="relleno-papel tinta" stroke-width="2" cx="' + hx + '" cy="' + hy + '" r="' + (4 * s) + '"/>';
      return g + '</g>';
    }
    var rayos = '';
    for (var r = 0; r < 16; r++) {
      var an = r * Math.PI / 8;
      rayos += '<line class="tinta" stroke-width="1.3" x1="' + (432 + Math.cos(an) * 34).toFixed(1) + '" y1="' + (78 + Math.sin(an) * 34).toFixed(1) + '" x2="' + (432 + Math.cos(an) * (r % 2 ? 44 : 52)).toFixed(1) + '" y2="' + (78 + Math.sin(an) * (r % 2 ? 44 : 52)).toFixed(1) + '"/>';
    }
    var hierba = '';
    for (var h = 0; h < 22; h++) {
      var hx2 = 34 + h * 21 + (h % 3) * 4, hy2 = 338 + (h % 4) * 6;
      hierba += '<path class="tinta" stroke-width="1.1" fill="none" d="M' + hx2 + ' ' + hy2 + ' l-3 -9 M' + hx2 + ' ' + hy2 + ' l3 -8"/>';
    }
    return '<svg class="grabado" viewBox="0 0 520 380" role="img" aria-labelledby="grabado-t">' +
      '<title id="grabado-t">Grabado original: molinos de viento sobre una colina de La Mancha bajo el sol</title>' +
      '<defs><pattern id="rayado" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line class="tinta" x1="0" y1="0" x2="0" y2="7" stroke-width="1.3"/></pattern>' +
      '<pattern id="rayado-fino" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-20)"><line class="tinta" x1="0" y1="0" x2="0" y2="5" stroke-width=".6"/></pattern></defs>' +
      '<rect class="relleno-papel" x="0" y="0" width="520" height="380"/>' +
      '<rect fill="url(#rayado-fino)" opacity=".35" x="16" y="16" width="488" height="120"/>' +
      '<circle class="relleno-papel tinta" stroke-width="2" cx="432" cy="78" r="28"/>' + rayos +
      '<path class="tinta" fill="none" stroke-width="1.4" d="M70 70 q8 -8 16 0 q8 -8 16 0 M120 56 q6 -6 12 0 q6 -6 12 0 M330 104 q5 -5 10 0 q5 -5 10 0"/>' +
      '<path fill="url(#rayado)" class="tinta" stroke-width="2" d="M16 290 C 110 236, 220 246, 300 268 S 460 244, 504 258 L504 364 L16 364 Z"/>' +
      molino(300, 274, .82, 52) + molino(410, 262, .62, 12) + molino(158, 266, 1.18, 24) +
      '<path class="relleno-papel tinta" stroke-width="2" d="M16 322 C 150 300, 330 334, 504 312 L504 364 L16 364 Z"/>' +
      '<path class="tinta" fill="none" stroke-width="1.4" stroke-dasharray="7 6" d="M60 364 C 120 344, 210 334, 300 330"/>' + hierba +
      '<rect class="tinta" fill="none" stroke-width="3" x="10" y="10" width="500" height="360"/>' +
      '<rect class="tinta" fill="none" stroke-width="1" x="17" y="17" width="486" height="346"/>' +
      '<path class="carmin" d="M260 6 l7 7 -7 7 -7 -7z"/>' +
      '</svg>';
  }

  Q.reglasContenido = function (reglas) {
    var r = reglas || N.CONFIG_DEFECTO;
    return '' +
      '<div class="reglas-grid">' +
      '<div class="regla"><h3><span class="letra">A</span> Robar</h3><p>El jugador activo roba la primera carta del mazo de descripciones y la lee en voz alta.</p></div>' +
      '<div class="regla"><h3><span class="letra">B</span> Elegir</h3><p>Elige en el tablero la imagen que corresponde a esa descripción. Puede cambiarla hasta que confirme.</p></div>' +
      '<div class="regla"><h3><span class="letra">C</span> Verificar</h3><p>El árbitro abre su panel y comprueba la coincidencia. Si no coinciden, la imagen sigue en el tablero, la descripción va al fondo del mazo y juega el siguiente.</p></div>' +
      '<div class="regla"><h3><span class="letra">D</span> Responder</h3><p>Si coinciden, el árbitro formula una pregunta sobre el episodio. Si acepta la respuesta, el jugador gana la pieza; si la rechaza, las cartas vuelven y pasa el turno.</p></div>' +
      '<div class="regla"><h3><span class="letra">E</span> Pasar el turno</h3><p>El turno avanza solo cuando la jugada está resuelta. La fase de juego termina al agotarse el mazo.</p></div>' +
      '<div class="regla"><h3><span class="letra">F</span> Ordenar</h3><p>Cada jugador ordena sus piezas según el capítulo de cada episodio. El árbitro valida y gana quien tenga más piezas correctamente ordenadas. Si hay empate, se declara empate.</p></div>' +
      '</div>' +
      '<div class="provisionales caja caja-info"><h3>Reglas provisionales de este nivel</h3><ul>' +
      '<li>Pregunta: ' + (r.seleccionPregunta === 'aleatoria' ? 'se elige al azar entre las del episodio; el árbitro puede pasar a otra.' : 'se usa primero la primera del episodio; el árbitro puede pasar a otra.') + '</li>' +
      '<li>Puntuación: ' + (r.puntuacion === 'posicion' ? 'una pieza cuenta si queda en la misma posición que tendría en el orden correcto de las piezas de ese jugador.' : 'cuenta la secuencia más larga de piezas que mantienen el orden correcto entre sí.') + '</li>' +
      '<li>Las piezas ganadas siguen visibles en el tablero, atenuadas y con el nombre de quien las ganó.</li>' +
      '<li>' + (r.permitirFinAnticipado ? 'El árbitro puede cerrar la fase de juego antes de agotar el mazo, siempre que no haya una jugada pendiente.' : 'La fase de juego solo termina al agotar el mazo.') + '</li>' +
      '</ul><p class="nota" style="margin-top:6px">Cada nivel define estas reglas en Editor de niveles → Configuración.</p></div>';
  };

  Q.avisoAlmacen = function () {
    if (Q.avisoServidor) {
      var a = Q.avisoServidor();
      if (a) return a;
    }
    if (!Q.db || Q.db.modo !== 'memoria') return '';
    return '<div class="caja caja-error aviso-almacen" role="alert"><strong>Este navegador no permite guardar datos aquí.</strong> ' +
      'Los niveles, imágenes y partidas se perderán al cerrar la página. ' + (Q.db.motivo ? '(' + esc(Q.db.motivo) + ') ' : '') +
      'Exporten sus niveles antes de salir, o abran el juego en Chrome, Edge o Firefox sin ventana privada.</div>';
  };

  function chipValidacion(v) {
    if (v.puedeJugar) return '<span class="chip chip-ok">Listo para jugar</span>';
    return '<span class="chip chip-error">' + Q.plural(v.errores.length, 'error', 'errores') + '</span>';
  }
  Q.chipValidacion = chipValidacion;

  Q.chipIncluido = function (n) {
    if (!N.esIncluido(n)) return '';
    return N.editadoLocalmente(n) ? '<span class="chip chip-incluido">Incluido · con cambios locales</span>' : '<span class="chip chip-incluido">Incluido en el juego</span>';
  };

  function listaMensajes(lista, max) {
    max = max || 6;
    var html = '<ul>' + lista.slice(0, max).map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>';
    if (lista.length > max) html += '<p class="nota">… y ' + (lista.length - max) + ' más.</p>';
    return html;
  }
  Q.listaMensajes = listaMensajes;

  /* ---------- Menú principal ---------- */

  Q.pantallas.menu = function () {
    var abiertas = J.listaPartidas.filter(function (p) { return !p.terminada; });
    var ultima = abiertas.sort(function (a, b) { return a.guardada < b.guardada ? 1 : -1; })[0];
    return '<main>' + Q.avisoAlmacen() +
      '<header class="portada">' +
      '<div class="portada-texto">' +
      '<span class="eyebrow">Juego de cartas · Lenguaje y Literatura</span>' +
      '<h1 class="titulo-juego"><span class="linea1">El match con</span>Don Quijote</h1>' +
      '<p class="lead">Asocien cada descripción con su imagen, respondan la pregunta del árbitro y, al final, reconstruyan el orden de los capítulos.</p>' +
      '<nav class="menu-principal" aria-label="Menú principal">' +
      '<button class="tarjeta-menu" data-accion="ir-jugar" data-foco="menu-jugar"><span class="eyebrow">Jugar</span><strong>Comenzar una partida</strong><span>Elijan un nivel guardado, el número de jugadores y el árbitro.</span></button>' +
      '<button class="tarjeta-menu" data-accion="ir-biblioteca" data-foco="menu-editor"><span class="eyebrow">Editor de niveles</span><strong>Crear y editar niveles</strong><span>Episodios, imágenes, preguntas, tablero, importación y exportación.</span></button>' +
      '</nav>' +
      '<div class="fila-botones">' +
      (ultima ? '<button class="btn btn-primario" data-accion="continuar-partida" data-id="' + esc(ultima.id) + '" data-foco="continuar">Continuar partida <span class="nota-boton">' + esc(ultima.nivelNombre) + '</span></button>' : '') +
      '<button class="btn btn-sutil" data-accion="ir-partidas">Partidas guardadas' + (J.listaPartidas.length ? ' (' + J.listaPartidas.length + ')' : '') + '</button>' +
      '<a class="btn btn-sutil" href="#reglas">Reglas</a>' +
      '</div>' +
      (Q.chipModo ? Q.chipModo() : '') +
      '</div>' +
      '<figure class="portada-ilustracion">' + grabadoPortada() +
      '<figcaption>Ilustración original en estilo de grabado, creada para este juego.</figcaption></figure>' +
      '</header>' +
      '<section class="pliego" id="reglas" aria-labelledby="t-reglas"><h2 id="t-reglas">Cómo se juega</h2>' + Q.reglasContenido() + '</section>' +
      '</main>';
  };

  Q.cargarListas = async function () {
    if (!Q.db) return;
    try {
      var ps = await Q.db.listarPartidas();
      J.listaPartidas = ps.map(function (p) { return Object.assign({}, p, { estado: undefined }); });
      J.listaPartidas.forEach(function (p, i) { p._estado = ps[i].estado; });
    } catch (e) { Q.mostrarError(e, 'No se pudieron leer las partidas guardadas'); }
  };

  /* ---------- Elegir nivel ---------- */

  Q.acciones['ir-menu'] = async function () { await Q.cargarListas(); Q.ir('menu'); };
  Q.acciones['ir-jugar'] = async function () {
    if (!(await Q.confirmarSalidaEditor())) return;
    J.listaNiveles = await Q.db.listarNiveles();
    J.listaNiveles.sort(function (a, b) { return a.modificado < b.modificado ? 1 : -1; });
    Q.ir('jugar');
  };

  Q.pantallas.jugar = function () {
    var filas = J.listaNiveles.map(function (n) {
      var v = N.validarNivel(n, { imagenExiste: Q.imagenExiste });
      return '<li class="nivel-fila">' +
        '<div class="info"><strong>' + esc(n.nombre) + '</strong>' +
        (n.descripcion ? '<span class="nota">' + esc(n.descripcion) + '</span>' : '') +
        '<span class="chips">' + chipValidacion(v) +
        '<span class="chip num">' + v.conteos.enTablero + ' de ' + v.espacios + ' espacios</span>' +
        (n.config.estado === 'aprobado' ? '<span class="chip chip-ok">Aprobado</span>' : '<span class="chip chip-demo">Provisional</span>') +
        Q.chipIncluido(n) + '</span></div>' +
        '<button class="btn btn-primario" data-accion="elegir-nivel" data-id="' + esc(n.id) + '" data-foco="elegir-' + esc(n.id) + '">Elegir</button></li>';
    }).join('');
    return '<main class="hoja hoja-ancha">' + Q.avisoAlmacen() +
      '<div><button class="btn btn-sutil btn-chico" data-accion="ir-menu">← Menú principal</button></div>' +
      '<header class="cabecera"><span class="eyebrow">Jugar</span><h1>Elijan un nivel</h1>' +
      '<p class="lead">Se usará la última versión guardada del nivel. Antes de empezar verán su informe de validación.</p></header>' +
      (filas ? '<ul class="lista-niveles">' + filas + '</ul>' : '<div class="caja caja-info">No hay niveles guardados. Creen uno en el <button class="btn btn-chico" data-accion="ir-biblioteca">Editor de niveles</button></div>') +
      '</main>';
  };

  Q.acciones['elegir-nivel'] = async function (d) {
    var n = await Q.db.obtenerNivel(d.id);
    if (!n) { Q.toast('Ese nivel ya no existe. Puede haberse eliminado en otra pestaña.', 'error'); return; }
    await Q.cargarImagenes(N.referenciasImagen(n));
    J.nivel = n;
    J.informe = N.validarNivel(n, { imagenExiste: Q.imagenExiste });
    Q.ir('informe');
  };

  /* ---------- Informe de validación ---------- */

  Q.informeHTML = function (n, v) {
    var c = v.conteos, cfg = n.config;
    function fila(etiqueta, valor, estado) {
      return '<tr class="' + (estado || '') + '"><th scope="row">' + etiqueta + '</th><td class="n num">' + valor + '</td></tr>';
    }
    return '<div class="tabla-wrap"><table class="tabla tabla-informe"><tbody>' +
      fila('Formato configurado', cfg.columnas + ' × ' + cfg.filas + ' = ' + v.espacios + ' espacios' + (cfg.exigirCompleto ? ' (todos obligatorios)' : ' (pueden quedar vacíos)')) +
      fila('¿Cumple el formato?', v.cumpleFormato ? 'Sí' : 'No', v.cumpleFormato ? 'bien' : 'mal') +
      fila('Episodios en el tablero', c.enTablero) +
      fila('Episodios en la reserva (no juegan)', c.reserva, c.reserva ? 'aviso' : '') +
      fila('Imágenes', c.imagenes) +
      fila('Descripciones', c.descripciones) +
      fila('Episodios sin imagen', c.sinImagen, c.sinImagen ? 'aviso' : '') +
      fila('Episodios sin preguntas', c.sinPreguntas, c.sinPreguntas ? 'aviso' : '') +
      fila('Descripciones vacías', c.descripcionesVacias, c.descripcionesVacias ? 'mal' : '') +
      fila('Identificadores duplicados', c.idsDuplicados, c.idsDuplicados ? 'mal' : '') +
      fila('Capítulos ausentes', c.sinCapitulo, c.sinCapitulo ? 'mal' : '') +
      fila('Órdenes cronológicos ausentes', c.sinOrden, c.sinOrden ? 'mal' : '') +
      fila('Referencias de imágenes rotas', c.imagenesRotas, c.imagenesRotas ? 'mal' : '') +
      '</tbody></table></div>' +
      (v.errores.length ? '<div class="caja caja-error"><strong>Errores que impiden iniciar la partida</strong>' + listaMensajes(v.errores, 12) + '</div>' : '<div class="caja caja-ok"><strong>Sin errores.</strong> El nivel se puede jugar.</div>') +
      (v.avisos.length ? '<div class="caja caja-aviso"><strong>Advertencias (no impiden jugar)</strong>' + listaMensajes(v.avisos, 8) + '</div>' : '');
  };

  Q.pantallas.informe = function () {
    var n = J.nivel, v = J.informe;
    var editando = Q.ed && Q.ed.nivel && Q.ed.nivel.id === n.id && Q.ed.sucio;
    return '<main class="hoja hoja-ancha">' +
      '<div><button class="btn btn-sutil btn-chico" data-accion="ir-jugar">← Elegir otro nivel</button></div>' +
      '<header class="cabecera"><span class="eyebrow">Informe del nivel · versión ' + n.version + '</span><h1>' + esc(n.nombre) + '</h1>' +
      (n.descripcion ? '<p class="lead">' + esc(n.descripcion) + '</p>' : '') + '</header>' +
      (editando ? '<div class="caja caja-aviso">Este nivel tiene cambios sin guardar en el editor. La partida usará la última versión guardada (versión ' + n.version + ').</div>' : '') +
      Q.informeHTML(n, v) +
      '<div class="fila-botones">' +
      '<button class="btn btn-primario" data-accion="ir-config" data-foco="ir-config" ' + (v.puedeJugar ? '' : 'disabled') + '>Preparar la partida</button>' +
      '<button class="btn" data-accion="duplicar-y-editar" data-id="' + esc(n.id) + '">Duplicar y editar</button>' +
      '<button class="btn btn-sutil" data-accion="editar-nivel" data-id="' + esc(n.id) + '">Editar este nivel</button>' +
      '</div></main>';
  };

  /* ---------- Preparación ---------- */

  Q.acciones['ir-config'] = function () { Q.ir('config'); };
  Q.acciones['n-jugadores'] = function (d) { J.config.n = Number(d.n); };
  Q.alEscribir.cfg = function (campo, el) {
    var p = campo.split('.');
    if (p[1] === 'nombre') J.config.nombres[Number(p[2])] = el.value;
    else J.config.arbitro = el.value;
  };

  Q.pantallas.config = function () {
    var c = J.config, n = J.nivel;
    var nombres = '';
    for (var i = 0; i < c.n; i++) {
      nombres += '<div class="campo"><label for="jug-' + i + '">Jugador ' + (i + 1) + '</label>' +
        '<input id="jug-' + i + '" data-campo="cfg.nombre.' + i + '" data-foco="jug-' + i + '" maxlength="24" autocomplete="off" value="' + esc(c.nombres[i]) + '" placeholder="Nombre"></div>';
    }
    return '<main class="hoja">' +
      '<div><button class="btn btn-sutil btn-chico" data-accion="volver-informe">← Informe del nivel</button></div>' +
      '<header class="cabecera"><span class="eyebrow">Preparación · ' + esc(n.nombre) + '</span><h1>Nueva partida</h1></header>' +
      '<form class="hoja" style="padding:0" data-form="config" novalidate>' +
      '<div class="campo"><span class="etiqueta" id="et-n">Número de jugadores</span>' +
      '<div class="segmentado" role="group" aria-labelledby="et-n">' +
      [2, 3, 4].map(function (k) { return '<button type="button" data-accion="n-jugadores" data-n="' + k + '" data-foco="n' + k + '" aria-pressed="' + (c.n === k) + '">' + k + '</button>'; }).join('') +
      '</div></div>' +
      '<div class="nombres">' + nombres + '</div>' +
      '<div class="campo"><label for="arbitro">Árbitro</label>' +
      '<input id="arbitro" data-campo="cfg.arbitro" data-foco="arbitro" maxlength="24" autocomplete="off" value="' + esc(c.arbitro) + '" placeholder="Nombre del árbitro">' +
      '<span class="ayuda">El árbitro no juega: comprueba las coincidencias, hace las preguntas y acepta o rechaza las respuestas.</span></div>' +
      '<div class="fila-botones"><button type="submit" class="btn btn-primario" data-foco="preparar">Barajar y preparar el tablero</button></div>' +
      '</form></main>';
  };
  Q.acciones['volver-informe'] = function () { Q.ir('informe'); };

  Q.formularios.config = async function () {
    var c = J.config;
    // Se vuelve a leer el nivel guardado para usar exactamente su última versión.
    var n = await Q.db.obtenerNivel(J.nivel.id);
    if (!n) throw Q.fallo('Ese nivel ya no existe.');
    var s;
    try {
      s = M.crearPartida({ nivel: n, nombres: c.nombres.slice(0, c.n), arbitro: c.arbitro, imagenExiste: Q.imagenExiste });
    } catch (e) { Q.toast(e.message, 'error'); return; }
    Q.ui.partida = s;
    resetArbitro();
    J.intro = true;
    J.guardado = { estado: '', hora: '' };
    await Q.cargarImagenes(N.referenciasImagen({ episodios: Object.values(s.episodios) }));
    Q.ir('partida');
    await Q.guardarPartida(false);
  };

  /* ---------- Mesa de juego ---------- */

  function vBarra(s) {
    var puedeTerminar = s.fase === 'juego' && s.reglas.permitirFinAnticipado && !s.jugada;
    return '<header class="barra">' +
      '<span class="marca">El match con Don Quijote</span>' +
      '<span class="chip">' + esc(s.nivel.nombre) + ' · v' + s.nivel.version + '</span>' +
      (s.demostracion ? '<span class="chip chip-demo">Material provisional</span>' : '') +
      '<span id="estado-partida">' + textoEstadoPartida() + '</span>' +
      '<div class="fila-botones">' +
      '<button class="btn btn-sutil btn-chico" data-accion="guardar-partida">Guardar partida</button>' +
      '<button class="btn btn-sutil btn-chico" data-accion="ver-reglas">Reglas</button>' +
      (s.fase === 'juego' ? '<button class="btn btn-sutil btn-chico" data-accion="terminar-fase" ' + (puedeTerminar ? '' : 'disabled title="Disponible cuando no hay una jugada pendiente"') + '>Terminar fase de juego</button>' : '') +
      '<button class="btn btn-sutil btn-chico" data-accion="reiniciar">Reiniciar</button>' +
      '<button class="btn btn-sutil btn-chico" data-accion="salir-partida">Menú</button>' +
      '</div></header>';
  }

  function vCasilla(s, pos, estatica) {
    var id = s.tablero[pos];
    var tag = estatica ? 'div' : 'button';
    if (!id) {
      return '<' + tag + ' class="casilla vacia" ' + (estatica ? '' : 'disabled ') + 'aria-label="Casilla ' + (pos + 1) + ': sin material">' +
        '<span class="arte"></span><span class="pie">Sin material</span></' + tag + '>';
    }
    var ep = s.episodios[id];
    var ganada = Q.tiene(s.ganadas, id);
    var sel = !estatica && s.jugada && s.jugada.seleccion === pos;
    var puede = !estatica && s.jugada && s.jugada.etapa === 'seleccion' && !ganada;
    var conImagen = !!ep.imagen;
    var pie = ganada ? 'Ganada · ' + esc(s.jugadores[s.ganadas[id]].nombre) : (conImagen ? 'N.º ' + (pos + 1) : 'Prov. · ' + (pos + 1));
    var clases = 'casilla' + (conImagen ? ' con-imagen' : '') + (ganada ? ' ganada' : '') + (sel ? ' seleccionada' : '');
    var etiqueta = 'Imagen de la casilla ' + (pos + 1) + (ganada ? ', ganada por ' + s.jugadores[s.ganadas[id]].nombre : '') + (sel ? ', elegida' : '');
    var attrs = estatica ? '' : ' data-accion="seleccionar" data-pos="' + pos + '" data-foco="c' + pos + '" aria-pressed="' + (!!sel) + '"' + (puede ? '' : ' disabled');
    return '<' + tag + ' class="' + clases + '"' + attrs + ' aria-label="' + esc(etiqueta) + '">' +
      '<span class="arte">' + Q.arte(ep) + '</span><span class="pie">' + pie + '</span></' + tag + '>';
  }

  function vJuego(s) {
    var r = M.resumen(s);
    var activo = s.jugadores[s.activo];
    var jd = s.jugada;
    var estado, acciones = '', mazo;
    if (!jd) {
      estado = 'Roba una carta del mazo de descripciones.';
      acciones = '<button class="btn btn-primario" data-accion="robar" data-foco="robar">Robar descripción</button>';
      mazo = '<div class="mazo-fila"><div class="dorso' + (s.mazo.length ? '' : ' vacio') + '" aria-hidden="true"></div>' +
        '<div class="mazo-info"><strong class="num">' + s.mazo.length + '</strong><span class="nota">descripciones boca abajo</span></div></div>';
    } else {
      mazo = '<article class="carta-desc ' + (Q.ui.animar === 'carta' ? 'anim-voltear' : '') + '" aria-label="Descripción robada">' +
        '<span class="eyebrow">Descripción robada</span><p>' + esc(s.episodios[jd.descripcionId].descripcion) + '</p></article>';
      if (jd.etapa === 'seleccion') {
        estado = jd.seleccion === null ? 'Lee la descripción y elige en el tablero la imagen que le corresponde.'
          : 'Elegiste la casilla ' + (jd.seleccion + 1) + '. Puedes cambiarla antes de confirmar.';
        acciones = '<button class="btn btn-primario" data-accion="confirmar-seleccion" data-foco="confirmar" ' + (jd.seleccion === null ? 'disabled' : '') + '>Confirmar elección</button>';
      } else estado = 'Elección confirmada. Esperando la decisión del árbitro.';
    }
    var marcador = s.jugadores.map(function (j, i) {
      return '<li class="' + (i === s.activo ? 'activo' : '') + '"><span class="nombre">' + esc(j.nombre) + '</span>' +
        '<span class="piezas num" aria-label="' + j.piezas.length + ' piezas">' + j.piezas.length + '</span></li>';
    }).join('');
    var bitacora = s.historial.slice(-4).reverse().map(function (h) {
      var t = { pieza_ganada: 'ganó una pieza', respuesta_rechazada: 'acertó la imagen, pero la respuesta fue rechazada', combinacion_incorrecta: 'no acertó la imagen' }[h.resultado];
      return '<li><span class="num">T' + h.turno + '</span> · ' + esc(h.nombre) + ' ' + t + '.</li>';
    }).join('');
    var casillas = '';
    for (var p = 0; p < s.tablero.length; p++) casillas += vCasilla(s, p, false);
    return vBarra(s) +
      '<div class="mesa">' +
      '<aside class="atril">' +
      '<section class="jugador-activo ' + (Q.ui.animar === 'turno' ? 'anim-entrar' : '') + '" aria-live="polite">' +
      '<span class="eyebrow">Turno <span class="num">' + s.turno + '</span> · juega</span>' +
      '<h2>' + esc(activo.nombre) + '</h2><p class="estado-jugada">' + estado + '</p></section>' +
      '<section class="mazo-zona" aria-label="Mazo de descripciones">' + mazo +
      (acciones ? '<div class="fila-botones">' + acciones + '</div>' : '') + '</section>' +
      '<section class="marcador" aria-label="Piezas ganadas"><h3>Piezas ganadas</h3><ol>' + marcador + '</ol></section>' +
      '<div class="contadores">' +
      '<div class="contador"><b class="num">' + r.disponibles + '</b><span>imágenes disponibles de ' + r.conMaterial + '</span></div>' +
      '<div class="contador"><b class="num">' + r.enMazo + '</b><span>descripciones en el mazo</span></div></div>' +
      (bitacora ? '<section class="bitacora"><h3>Últimas jugadas</h3><ol>' + bitacora + '</ol></section>' : '') +
      '</aside>' +
      '<section class="tablero-zona" aria-label="Tablero">' +
      '<div class="tablero" style="--cols:' + s.columnas + ';--filas:' + s.filas + '" role="group" aria-label="Tablero de imágenes: ' + s.columnas + ' columnas y ' + s.filas + ' filas">' + casillas + '</div>' +
      '<p class="leyenda-tablero"><span>«Prov.»: ilustración provisional, no definitiva.</span>' +
      (r.conMaterial < s.tablero.length ? '<span>Las casillas punteadas no tienen material.</span>' : '') + '</p>' +
      '</section></div>';
  }

  /* ---------- Panel del árbitro ---------- */

  function vArbitro(s) {
    var jd = s.jugada;
    if (!jd || ['verificacion', 'incorrecta', 'pregunta'].indexOf(jd.etapa) < 0) return '';
    var jugador = s.jugadores[s.activo].nombre;
    var cerrar = '</div></div>';
    if (!J.arbitroDentro) {
      return '<div class="velo"><div class="panel panel-arbitro puerta" role="dialog" aria-modal="true" aria-labelledby="t-arb">' +
        '<div class="sello" aria-hidden="true">Á</div><span class="eyebrow">Turno del árbitro</span>' +
        '<h2 id="t-arb">' + esc(s.arbitro) + ', acércate a la pantalla</h2>' +
        '<p class="lead" style="max-width:44ch">' + esc(jugador) + ' confirmó su elección. Jugadores: esperen sin mirar mientras el árbitro comprueba la jugada.</p>' +
        '<button class="btn btn-primario" data-accion="abrir-arbitro" data-foco="abrir-arbitro">Soy el árbitro: abrir el panel</button>' + cerrar;
    }
    var ep = s.episodios[jd.descripcionId];
    var abrir = '<div class="velo"><div class="panel panel-arbitro" role="dialog" aria-modal="true" aria-labelledby="t-arb">';
    if (J.verLectura && jd.etapa === 'pregunta') {
      var preg = jd.preguntaIdx === null ? null : ep.preguntas[jd.preguntaIdx];
      return '<div class="velo"><div class="panel lectura" role="dialog" aria-modal="true" aria-labelledby="t-lec">' +
        '<span class="eyebrow">Pregunta para ' + esc(jugador) + '</span>' +
        '<p class="pregunta-grande" id="t-lec">' + (preg ? esc(preg.texto) : 'El árbitro formulará la pregunta oralmente.') + '</p>' +
        '<p class="nota">Responde en voz alta. El árbitro decidirá si la respuesta es completa y coherente.</p>' +
        '<div class="fila-botones" style="justify-content:center"><button class="btn" data-accion="cerrar-lectura" data-foco="cerrar-lectura">Volver al panel del árbitro</button></div>' + cerrar;
    }
    var cab = '<div class="cabecera"><span class="eyebrow">Panel del árbitro · ' + esc(s.arbitro) + '</span>';
    if (jd.etapa === 'verificacion') {
      return abrir + cab + '<h2 id="t-arb">Comprobar la coincidencia</h2></div>' +
        '<div class="comparar"><div class="carta-desc"><span class="eyebrow">Descripción robada</span><p>' + esc(ep.descripcion) + '</p></div>' +
        '<div style="display:grid;gap:6px">' + vCasilla(s, jd.seleccion, true) + '<span class="nota">Imagen elegida por ' + esc(jugador) + '</span></div></div>' +
        '<p class="nota">El programa compara el identificador del episodio de las dos cartas. El resultado solo aparece en este panel.</p>' +
        '<div class="fila-botones"><button class="btn btn-primario" data-accion="verificar" data-foco="verificar">Comprobar coincidencia</button></div>' + cerrar;
    }
    if (jd.etapa === 'incorrecta') {
      return abrir + cab + '<h2 id="t-arb">Resultado de la comprobación</h2></div>' +
        '<div class="veredicto mal anim-sello" role="status">✗ La imagen y la descripción no corresponden al mismo episodio.</div>' +
        '<p>Anuncia a ' + esc(jugador) + ' que la combinación es incorrecta. La imagen sigue disponible en el tablero y la descripción pasará al fondo del mazo.</p>' +
        '<div class="fila-botones"><button class="btn btn-primario" data-accion="cerrar-incorrecta" data-foco="cerrar-incorrecta">Devolver las cartas y pasar el turno</button></div>' + cerrar;
    }
    var n = ep.preguntas.length, idx = jd.preguntaIdx, bloquePregunta, bloqueRef = '', notasPreg = '';
    if (!n) {
      bloquePregunta = '<div class="caja caja-aviso">Este episodio no tiene preguntas en el nivel. Formula una pregunta propia sobre el episodio o sigan el criterio que haya acordado el grupo.</div>';
    } else {
      var p = ep.preguntas[idx];
      bloquePregunta = '<div style="display:grid;gap:8px"><span class="eyebrow">Pregunta <span class="num">' + (idx + 1) + '</span> de <span class="num">' + n + '</span></span>' +
        '<p class="pregunta">' + esc(p.texto) + '</p>' +
        (n > 1 ? '<div><button class="btn btn-sutil btn-chico" data-accion="cambiar-pregunta">Usar otra pregunta</button></div>' : '') + '</div>';
      if (!p.respuesta) bloqueRef = '<div class="caja caja-aviso">Esta pregunta todavía no tiene respuesta de referencia. Evalúa la respuesta según los criterios del grupo.</div>';
      else bloqueRef = '<div><button class="btn btn-sutil btn-chico" data-accion="ver-referencia" aria-expanded="' + J.verReferencia + '">' +
        (J.verReferencia ? 'Ocultar respuesta de referencia' : 'Ver respuesta de referencia (solo árbitro)') + '</button></div>' +
        (J.verReferencia ? '<div class="referencia"><span class="eyebrow">Respuesta de referencia · orientativa</span><p>' + esc(p.respuesta) + '</p></div>' : '');
      if (p.notas) notasPreg = '<p class="nota"><strong>Criterio de evaluación:</strong> ' + esc(p.notas) + '</p>';
    }
    return abrir + cab + '<h2 id="t-arb">La imagen es correcta: ahora, la pregunta</h2></div>' +
      '<div class="veredicto ok anim-sello" role="status">✓ La imagen y la descripción corresponden al mismo episodio.</div>' +
      '<div class="ficha-episodio"><h3>' + esc(ep.titulo) + '</h3><span class="chip chip-ok">' + Q.refCapitulo(ep) + '</span>' +
      (ep.provisional ? '<span class="chip chip-demo">Material provisional</span>' : '') + '</div>' +
      bloquePregunta + bloqueRef + notasPreg +
      (ep.notasArbitro ? '<p class="nota"><strong>Nota para el árbitro:</strong> ' + esc(ep.notasArbitro) + '</p>' : '') +
      '<div class="campo"><label for="obs">Observación (opcional)</label><textarea id="obs" data-campo="obs" data-foco="obs" maxlength="280" placeholder="Por ejemplo: respuesta correcta, pero poco desarrollada">' + esc(J.observacion) + '</textarea></div>' +
      '<div class="fila-botones"><button class="btn" data-accion="ver-lectura" data-foco="ver-lectura">Mostrar la pregunta a los jugadores</button></div>' +
      '<div class="fila-botones"><button class="btn btn-ok" data-accion="aceptar" data-foco="aceptar">Respuesta aceptada</button>' +
      '<button class="btn btn-mal" data-accion="rechazar" data-foco="rechazar">Respuesta rechazada</button></div>' + cerrar;
  }
  Q.alEscribir.obs = function (c, el) { J.observacion = el.value; };

  /* ---------- Transición, cronología, validación, resultados ---------- */

  function textoPuntuacion(s) {
    return s.reglas.puntuacion === 'subsecuencia'
      ? 'Cuenta la secuencia más larga de piezas que mantienen entre sí el orden correcto.'
      : 'Cada pieza cuenta si queda en el mismo lugar que tendría en el orden correcto de las piezas de ese jugador.';
  }

  function vTransicion(s) {
    var filas = s.jugadores.map(function (j) { return '<tr><td>' + esc(j.nombre) + '</td><td class="n num">' + j.piezas.length + '</td></tr>'; }).join('');
    return vBarra(s) + '<main class="escena">' +
      '<header><span class="eyebrow">Fin de la fase de juego</span><h1>Comienza la fase cronológica</h1>' +
      '<p class="lead">' + (s.finAnticipado ? 'El árbitro cerró la fase de juego. ' : 'Se agotó el mazo de descripciones. ') +
      'Ahora cada jugador ordenará sus piezas según el capítulo al que pertenece cada episodio, desde el principio de la novela hasta el final.</p>' +
      '<p class="nota">' + textoPuntuacion(s) + ' Las piezas aparecerán desordenadas.</p></header>' +
      '<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Jugador</th><th style="text-align:right">Piezas obtenidas</th></tr></thead><tbody>' + filas + '</tbody></table></div>' +
      '<div class="fila-botones"><button class="btn btn-primario" data-accion="iniciar-cronologia" data-foco="iniciar-cronologia">Comenzar la fase cronológica</button></div></main>';
  }

  function vPieza(s, j, id, i, total, op) {
    var ep = s.episodios[id];
    var mover = '';
    if (op.editable) {
      mover = '<div class="mover">' +
        '<button data-accion="mover-pieza" data-j="' + j + '" data-i="' + i + '" data-d="-1" data-foco="m' + j + '-' + esc(id) + '-u" ' + (i === 0 ? 'disabled' : '') + ' aria-label="Subir «' + esc(ep.titulo) + '»">▲</button>' +
        '<button data-accion="mover-pieza" data-j="' + j + '" data-i="' + i + '" data-d="1" data-foco="m' + j + '-' + esc(id) + '-d" ' + (i === total - 1 ? 'disabled' : '') + ' aria-label="Bajar «' + esc(ep.titulo) + '»">▼</button></div>';
    } else if (op.marca !== undefined) mover = '<span class="marca">' + (op.marca ? '✓ ' : '✗ ') + Q.refCapitulo(ep) + '</span>';
    var clase = 'pieza' + (op.marca === true ? ' bien' : op.marca === false ? ' mal' : '');
    var arr = op.editable ? ' draggable="true" data-arrastre="pieza" data-soltar="pieza"' : '';
    return '<li class="' + clase + '"' + arr + ' data-j="' + j + '" data-i="' + i + '">' +
      '<span class="pos num">' + (i + 1) + '</span><span class="mini">' + Q.arte(ep) + '</span>' +
      '<span class="texto"><strong>' + esc(ep.titulo) + '</strong><span>' + esc(ep.descripcion) + '</span></span>' + mover + '</li>';
  }
  Q.arrastre.pieza = {
    acepta: function (o, d) { return o.tipo === 'pieza' && o.datos.j === d.j; },
    soltar: function (o, d) { jugar(function (s) { M.moverPieza(s, Number(d.j), Number(o.datos.i), Number(d.i)); }); }
  };

  function vCronologia(s) {
    var listas = s.jugadores.map(function (j, k) {
      var conf = j.ordenConfirmado;
      var cuerpo = j.piezas.length
        ? '<ol class="piezas" aria-label="Piezas de ' + esc(j.nombre) + '">' + j.orden.map(function (id, i) { return vPieza(s, k, id, i, j.orden.length, { editable: !conf }); }).join('') + '</ol>'
        : '<p class="nota">No obtuvo piezas durante la partida.</p>';
      var pie = j.piezas.length ? (conf
        ? '<span class="chip chip-ok">Orden confirmado</span><button class="btn btn-sutil btn-chico" data-accion="reabrir-orden" data-j="' + k + '">Modificar</button>'
        : '<button class="btn btn-primario" data-accion="confirmar-orden" data-j="' + k + '" data-foco="conf-' + k + '">Confirmar orden definitivo</button>') : '';
      return '<section class="coleccion' + (conf ? ' confirmada' : '') + '" aria-label="Colección de ' + esc(j.nombre) + '">' +
        '<header><h2>' + esc(j.nombre) + '</h2><span class="chip ' + (conf ? 'chip-ok' : 'chip-demo') + ' num">' + Q.plural(j.piezas.length, 'pieza', 'piezas') + '</span></header>' +
        cuerpo + (pie ? '<div class="fila-botones">' + pie + '</div>' : '') + '</section>';
    }).join('');
    var listos = M.todosConfirmados(s);
    return vBarra(s) + '<main class="escena">' +
      '<header><span class="eyebrow">Fase cronológica</span><h1>Ordenen sus piezas</h1>' +
      '<p class="lead">Cada jugador ordena sus piezas desde el episodio que ocurre primero en la novela hasta el último. Arrastren las tarjetas o usen las flechas.</p>' +
      '<p class="nota">' + textoPuntuacion(s) + '</p></header>' +
      '<div class="colecciones">' + listas + '</div>' +
      '<div class="fila-botones"><button class="btn btn-primario" data-accion="a-validacion" data-foco="a-validacion" ' + (listos ? '' : 'disabled') + '>Llamar al árbitro para validar</button>' +
      (listos ? '' : '<span class="nota">Todos los jugadores deben confirmar su orden.</span>') + '</div></main>';
  }

  function vValidacion(s) {
    var listas = s.jugadores.map(function (j, k) {
      var cuerpo = j.piezas.length ? '<ol class="piezas">' + j.orden.map(function (id, i) { return vPieza(s, k, id, i, j.orden.length, {}); }).join('') + '</ol>' : '<p class="nota">Sin piezas.</p>';
      return '<section class="coleccion"><header><h2>' + esc(j.nombre) + '</h2></header>' + cuerpo + '</section>';
    }).join('');
    return vBarra(s) + '<main class="escena">' +
      '<header><span class="eyebrow">Validación del árbitro</span><h1>' + esc(s.arbitro) + ', revisa las secuencias</h1>' +
      '<p class="lead">Confirma con cada jugador que este es el orden que quiere presentar. Al validar, el programa comparará cada secuencia con el orden del nivel y calculará la puntuación.</p></header>' +
      '<div class="colecciones">' + listas + '</div>' +
      '<div class="fila-botones"><button class="btn btn-primario" data-accion="validar" data-foco="validar">Validar secuencias y calcular la puntuación</button>' +
      '<button class="btn" data-accion="volver-cronologia">Devolver a los jugadores</button></div></main>';
  }

  function vResultados(s) {
    var r = s.resultados;
    var titulo = r.empate ? '<span class="corona">Empate</span><h1>' + r.ganadores.map(esc).join(' y ') + '</h1>'
      : '<span class="corona">Gana la partida</span><h1>' + esc(r.ganadores[0]) + '</h1>';
    var sub = '<p class="lead">' + (r.empate ? 'Empatan con ' : 'Con ') + '<span class="num">' + r.maximo + '</span> ' +
      (r.maximo === 1 ? 'pieza correctamente ordenada' : 'piezas correctamente ordenadas') + '.' + (r.empate ? ' Las reglas no establecen desempate.' : '') + '</p>';
    var filas = r.tabla.map(function (t) {
      return '<tr class="' + (r.ganadores.indexOf(t.nombre) >= 0 ? 'ganador' : '') + '"><td>' + esc(t.nombre) + '</td><td class="n num">' + t.piezas + '</td><td class="n num">' + t.correctas + '</td></tr>';
    }).join('');
    var revisar = r.tabla.map(function (t) {
      var cuerpo = t.detalle.length ? '<ol class="piezas">' + t.detalle.map(function (d, i) { return vPieza(s, t.indice, d.id, i, t.detalle.length, { marca: d.correcta }); }).join('') + '</ol>' : '<p class="nota">Sin piezas.</p>';
      return '<details class="coleccion"><summary><strong>' + esc(t.nombre) + '</strong> · <span class="num">' + t.correctas + '</span> de <span class="num">' + t.piezas + '</span> bien ordenadas</summary>' + cuerpo + '</details>';
    }).join('');
    var secuencia = r.secuencia.map(function (x) {
      var ep = s.episodios[x.id];
      return '<li><span class="o num">' + esc(ep.ordenCronologico) + '</span><span class="t">' + esc(ep.titulo) + ' <span class="nota">· ' + Q.refCapitulo(ep) + '</span></span>' +
        '<span class="q">' + (x.ganadaPor === null ? 'Sin ganar' : 'Pieza de ' + esc(s.jugadores[x.ganadaPor].nombre)) + '</span></li>';
    }).join('');
    return vBarra(s) + '<main class="escena">' +
      '<div class="podio anim-entrar">' + titulo + sub + (s.demostracion ? '<span class="chip chip-demo">Partida con material provisional</span>' : '') + '</div>' +
      '<section><h2 class="subtitulo">Puntuación</h2><div class="tabla-wrap"><table class="tabla"><thead><tr><th>Jugador</th><th style="text-align:right">Piezas obtenidas</th><th style="text-align:right">Bien ordenadas</th></tr></thead><tbody>' + filas + '</tbody></table></div>' +
      '<p class="nota" style="margin-top:8px">' + textoPuntuacion(s) + '</p></section>' +
      '<section style="display:grid;gap:12px"><h2 class="subtitulo">Revisar los resultados</h2><div class="colecciones">' + revisar + '</div></section>' +
      '<section style="display:grid;gap:12px"><h2 class="subtitulo">Secuencia correcta de los episodios</h2><ol class="secuencia">' + secuencia + '</ol></section>' +
      '<div class="fila-botones"><button class="btn btn-primario" data-accion="nueva-partida" data-foco="nueva-partida">Nueva partida con este nivel</button><button class="btn" data-accion="salir-partida">Menú principal</button></div></main>';
  }

  Q.pantallas.partida = function () {
    var s = Q.ui.partida;
    if (!s) { Q.ui.pantalla = 'menu'; return Q.pantallas.menu(); }
    return s.fase === 'juego' ? vJuego(s) : s.fase === 'transicion' ? vTransicion(s) : s.fase === 'cronologia' ? vCronologia(s)
      : s.fase === 'validacion' ? vValidacion(s) : vResultados(s);
  };

  Q.capas.push(function () {
    if (Q.ui.pantalla !== 'partida' || !Q.ui.partida) return '';
    var s = Q.ui.partida, html = '';
    if (s.fase === 'juego') html += vArbitro(s);
    if (J.intro) {
      html += '<div class="velo"><div class="panel" role="dialog" aria-modal="true" aria-labelledby="t-intro">' +
        '<div class="cabecera"><span class="eyebrow">Tablero preparado · ' + esc(s.nivel.nombre) + '</span><h2 id="t-intro">Instrucciones antes de empezar</h2></div>' +
        '<p>Juegan <strong>' + s.jugadores.map(function (j) { return esc(j.nombre); }).join(', ') + '</strong>. Arbitra <strong>' + esc(s.arbitro) + '</strong>. Empieza <strong>' + esc(s.jugadores[0].nombre) + '</strong>.</p>' +
        Q.reglasContenido(s.reglas) +
        (s.demostracion ? '<div class="caja caja-aviso">Este nivel usa material provisional o no completa su tablero (' + s.totalEpisodios + ' de ' + s.tablero.length + ' espacios).</div>' : '') +
        '<div class="fila-botones"><button class="btn btn-primario" data-accion="cerrar-intro" data-foco="cerrar-intro">Comenzar a jugar</button></div></div></div>';
    }
    if (J.reglas) {
      html += '<div class="velo"><div class="panel" role="dialog" aria-modal="true" aria-labelledby="t-reg"><div class="cabecera"><span class="eyebrow">Reglas</span><h2 id="t-reg">Cómo se juega</h2></div>' +
        Q.reglasContenido(s.reglas) + '<div class="fila-botones"><button class="btn btn-primario" data-accion="cerrar-reglas" data-foco="cerrar-reglas">Volver al juego</button></div></div></div>';
    }
    return html;
  });
  Q.alEscape.push(function () {
    if (J.reglas) { J.reglas = false; return true; }
    if (J.verLectura) { J.verLectura = false; return true; }
    return false;
  });

  /* ---------- Acciones de la partida ---------- */

  function evaluar(aceptada) {
    var s = Q.ui.partida, nombre = s.jugadores[s.activo].nombre, obs = J.observacion;
    if (jugar(function (st) { M.evaluarRespuesta(st, aceptada, obs); })) {
      resetArbitro(); Q.ui.animar = 'turno';
      Q.toast(aceptada ? nombre + ' gana la pieza.' : 'Respuesta rechazada. Las cartas vuelven y pasa el turno.');
    }
  }

  Object.assign(Q.acciones, {
    'cerrar-intro': function () { J.intro = false; Q.ui.animar = 'turno'; },
    'ver-reglas': function () { J.reglas = true; },
    'cerrar-reglas': function () { J.reglas = false; },
    'robar': function () { if (jugar(M.robar)) Q.ui.animar = 'carta'; },
    'seleccionar': function (d) { jugar(function (s) { M.seleccionar(s, Number(d.pos)); }); },
    'confirmar-seleccion': function () { if (jugar(M.confirmarSeleccion)) resetArbitro(); },
    'abrir-arbitro': function () { J.arbitroDentro = true; },
    'verificar': function () { jugar(function (s) { M.verificarCoincidencia(s); }); },
    'cerrar-incorrecta': function () {
      if (jugar(M.cerrarIncorrecta)) {
        resetArbitro(); Q.ui.animar = 'turno';
        if (Q.ui.partida.fase === 'juego') Q.toast('Combinación incorrecta. Turno de ' + Q.ui.partida.jugadores[Q.ui.partida.activo].nombre + '.');
      }
    },
    'cambiar-pregunta': function () { if (jugar(M.cambiarPregunta)) J.verReferencia = false; },
    'ver-referencia': function () { J.verReferencia = !J.verReferencia; },
    'ver-lectura': function () { J.verLectura = true; },
    'cerrar-lectura': function () { J.verLectura = false; },
    'aceptar': function () { evaluar(true); },
    'rechazar': function () { evaluar(false); },
    'guardar-partida': function () { return Q.guardarPartida(true); },
    'terminar-fase': function () {
      Q.confirmar({
        titulo: 'Terminar la fase de juego', si: 'Terminar y pasar a la cronología', peligro: true,
        texto: 'Quedan ' + Q.ui.partida.mazo.length + ' descripciones en el mazo. Si terminan ahora, se pasa directamente a la fase cronológica con las piezas ya ganadas.',
        alSi: function () { jugar(M.terminarAnticipado); }
      });
    },
    'reiniciar': function () {
      Q.confirmar({
        titulo: 'Reiniciar la partida', si: 'Reiniciar', peligro: true,
        texto: 'Se eliminará esta partida y volverán a la preparación con el mismo nivel. Los nombres de los jugadores se conservan.',
        alSi: async function () {
          var s = Q.ui.partida;
          try { await Q.db.eliminarPartida(s.id); } catch (e) { Q.mostrarError(e); }
          var n = await Q.db.obtenerNivel(s.nivel.id);
          Q.ui.partida = null;
          if (n) { J.nivel = n; J.informe = N.validarNivel(n, { imagenExiste: Q.imagenExiste }); Q.ir('config'); }
          else { Q.toast('El nivel de esta partida ya no existe. Elijan otro.'); await Q.acciones['ir-jugar'](); }
        }
      });
    },
    'salir-partida': async function () {
      var s = Q.ui.partida;
      if (s) await Q.guardarPartida(false);
      Q.ui.partida = null;
      await Q.cargarListas();
      Q.ir('menu');
      if (s && s.fase !== 'resultados') Q.toast('La partida quedó guardada. Pueden continuarla desde el menú.');
    },
    'iniciar-cronologia': function () { jugar(function (s) { M.iniciarCronologia(s); }); },
    'mover-pieza': function (d) { var j = Number(d.j), i = Number(d.i); jugar(function (s) { M.moverPieza(s, j, i, i + Number(d.d)); }); },
    'confirmar-orden': function (d) { jugar(function (s) { M.confirmarOrden(s, Number(d.j)); }); },
    'reabrir-orden': function (d) { jugar(function (s) { M.reabrirOrden(s, Number(d.j)); }); },
    'a-validacion': function () { jugar(M.pasarAValidacion); },
    'volver-cronologia': function () { jugar(M.volverACronologia); },
    'validar': function () { jugar(M.validarSecuencias); },
    'nueva-partida': async function () {
      var s = Q.ui.partida;
      var n = await Q.db.obtenerNivel(s.nivel.id);
      Q.ui.partida = null;
      if (!n) { Q.toast('El nivel de esta partida ya no existe.', 'error'); Q.ir('menu'); return; }
      J.nivel = n; J.informe = N.validarNivel(n, { imagenExiste: Q.imagenExiste });
      Q.ir(J.informe.puedeJugar ? 'config' : 'informe');
    }
  });

  /* ---------- Partidas guardadas ---------- */

  var NOMBRE_FASE = { juego: 'Fase de juego', transicion: 'Fin de la fase de juego', cronologia: 'Fase cronológica', validacion: 'Validación del árbitro', resultados: 'Terminada' };

  Q.acciones['ir-partidas'] = async function () {
    if (!(await Q.confirmarSalidaEditor())) return;
    await Q.cargarListas();
    Q.ir('partidas');
  };

  Q.pantallas.partidas = function () {
    var lista = J.listaPartidas.slice().sort(function (a, b) { return a.guardada < b.guardada ? 1 : -1; });
    var filas = lista.map(function (p) {
      var d = M.describirEstado(M.migrarPartida(Q.copia(p._estado)));
      return '<li class="nivel-fila">' +
        '<div class="info"><strong>' + esc(p.nivelNombre) + ' <span class="nota">· versión ' + esc(p.nivelVersion) + '</span></strong>' +
        '<span>' + p.jugadores.map(esc).join(', ') + ' · árbitro: ' + esc(p.arbitro) + '</span>' +
        '<span class="chips"><span class="chip ' + (p.terminada ? 'chip-ok' : 'chip-demo') + '">' + NOMBRE_FASE[p.fase] + '</span>' +
        (d.pendiente ? '<span class="chip">Jugada pendiente</span>' : '') +
        '<span class="nota">Guardada: ' + Q.fecha(p.guardada) + '</span></span></div>' +
        '<div class="fila-botones"><button class="btn btn-primario btn-chico" data-accion="continuar-partida" data-id="' + esc(p.id) + '" data-foco="cont-' + esc(p.id) + '">' + (p.terminada ? 'Ver resultados' : 'Continuar') + '</button>' +
        '<button class="btn btn-sutil btn-chico" data-accion="eliminar-partida" data-id="' + esc(p.id) + '">Eliminar</button></div></li>';
    }).join('');
    return '<main class="hoja hoja-ancha">' + Q.avisoAlmacen() +
      '<div><button class="btn btn-sutil btn-chico" data-accion="ir-menu">← Menú principal</button></div>' +
      '<header class="cabecera"><span class="eyebrow">Partidas guardadas</span><h1>Continuar una partida</h1>' +
      '<p class="lead">Cada partida conserva la versión exacta del nivel con que empezó, aunque el nivel se haya editado después.</p></header>' +
      (filas ? '<ul class="lista-niveles">' + filas + '</ul>' : '<div class="caja caja-info">No hay partidas guardadas. Las partidas se guardan solas mientras juegan.</div>') +
      '</main>';
  };

  Q.acciones['continuar-partida'] = async function (d) {
    if (!(await Q.confirmarSalidaEditor())) return;
    var p = await Q.db.obtenerPartida(d.id);
    if (!p) { Q.toast('Esa partida ya no existe.', 'error'); await Q.cargarListas(); return; }
    var estado = M.migrarPartida(p.estado);
    if (!estado) { Q.toast('La partida guardada está dañada y no se puede abrir.', 'error'); return; }
    p.estado = estado;
    J.continuar = p;
    await Q.cargarImagenes(N.referenciasImagen({ episodios: Object.values(estado.episodios) }));
    Q.ir('continuar');
  };

  Q.pantallas.continuar = function () {
    var p = J.continuar, s = p.estado, d = M.describirEstado(s);
    var piezas = d.piezas.map(function (x) { return '<tr><td>' + esc(x.nombre) + '</td><td class="n num">' + x.piezas + '</td></tr>'; }).join('');
    return '<main class="hoja">' +
      '<div><button class="btn btn-sutil btn-chico" data-accion="ir-partidas">← Partidas guardadas</button></div>' +
      '<header class="cabecera"><span class="eyebrow">Continuar partida</span><h1>' + esc(s.nivel.nombre) + '</h1>' +
      '<p class="nota">Versión ' + esc(s.nivel.version) + ' del nivel · guardada el ' + Q.fecha(p.guardada) + '</p></header>' +
      '<div class="caja caja-info"><p><strong>Jugadores, en orden:</strong> ' + s.jugadores.map(function (j) { return esc(j.nombre); }).join(', ') + ' · <strong>Árbitro:</strong> ' + esc(s.arbitro) + '</p>' +
      '<p style="margin-top:6px"><strong>Estado:</strong> ' + esc(d.fase) + '</p>' +
      (d.pendiente ? '<p style="margin-top:6px"><strong>Jugada pendiente:</strong> ' + esc(d.pendiente) + ' Se retomará exactamente en ese punto.</p>' : '') +
      (s.fase === 'juego' ? '<p style="margin-top:6px" class="nota">Quedan ' + d.enMazo + ' descripciones en el mazo y ' + d.disponibles + ' imágenes disponibles.</p>' : '') + '</div>' +
      '<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Jugador</th><th style="text-align:right">Piezas</th></tr></thead><tbody>' + piezas + '</tbody></table></div>' +
      '<div class="fila-botones"><button class="btn btn-primario" data-accion="confirmar-continuar" data-foco="confirmar-continuar">' + (d.terminada ? 'Ver resultados' : 'Continuar la partida') + '</button>' +
      '<button class="btn" data-accion="ir-partidas">Volver</button></div></main>';
  };

  Q.acciones['confirmar-continuar'] = function () {
    Q.ui.partida = J.continuar.estado;
    J.continuar = null;
    resetArbitro();
    J.intro = false;
    J.guardado = { estado: 'guardada', hora: '' };
    Q.ir('partida');
  };

  Q.acciones['eliminar-partida'] = function (d) {
    var p = J.listaPartidas.filter(function (x) { return x.id === d.id; })[0];
    if (!p) return;
    Q.confirmar({
      titulo: 'Eliminar partida guardada', si: 'Eliminar', peligro: true,
      texto: 'Se eliminará la partida de ' + p.jugadores.join(', ') + ' con el nivel «' + p.nivelNombre + '». Esta acción no se puede deshacer.',
      alSi: async function () {
        await Q.db.eliminarPartida(p.id);
        await Q.cargarListas();
        Q.toast('Partida eliminada.');
        Q.db.limpiarHuerfanas(Q.refsBorrador ? Q.refsBorrador() : []).catch(function () { /* limpieza opcional */ });
      }
    });
  };
})();
