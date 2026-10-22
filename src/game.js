/*
 * El match con Don Quijote — motor de reglas.
 * No toca la interfaz: recibe el estado de la partida, lo valida y lo modifica.
 * Funciona en el navegador (window.MotorQuijote) y en Node (pruebas automáticas).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./niveles.js'));
  else root.MotorQuijote = factory(root.NivelesQuijote);
})(typeof self !== 'undefined' ? self : this, function (N) {
  'use strict';

  var TABLERO = { columnas: 6, filas: 5, total: 30 }; // formato predeterminado

  /*
   * Reglas que el grupo aún no ha decidido. Cada nivel guarda las suyas en su
   * configuración (Editor de niveles → Configuración); estos son los valores iniciales.
   *  - seleccionPregunta: 'aleatoria' (una al azar entre las del episodio) o 'primera'.
   *  - puntuacion: 'posicion' (cuenta cada pieza que está en su posición correcta)
   *                o 'subsecuencia' (cuenta la secuencia más larga en orden correcto).
   *  - permitirFinAnticipado: el árbitro puede cerrar la fase de juego sin agotar el mazo.
   */
  var REGLAS_PROVISIONALES = {
    seleccionPregunta: 'aleatoria',
    puntuacion: 'posicion',
    permitirFinAnticipado: true
  };

  class ErrorJuego extends Error {
    constructor(mensaje) { super(mensaje); this.name = 'ErrorJuego'; }
  }

  function texto(v) { return typeof v === 'string' && v.trim() !== ''; }
  function entero(v) { var n = Number(v); return Number.isInteger(n) ? n : null; }
  function numero(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return Number.isFinite(n) ? n : null; }

  function barajar(lista, rng) {
    rng = rng || Math.random;
    var a = lista.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------- Episodios en la partida ---------- */

  // Copia de un episodio con los números ya convertidos y solo las preguntas con texto.
  function episodioParaJuego(ep) {
    var e = N.normalizarEpisodio(ep);
    return {
      id: e.id, titulo: e.titulo.trim(), parte: Number(e.parte), capitulo: Number(e.capitulo),
      ordenCronologico: Number(e.ordenCronologico), descripcion: e.descripcion.trim(),
      imagen: e.imagen, emblema: e.emblema,
      preguntas: e.preguntas.filter(function (p) { return texto(p.texto); })
        .map(function (p) { return { texto: p.texto.trim(), respuesta: p.respuesta.trim(), notas: p.notas.trim() }; }),
      notasArbitro: e.notasArbitro.trim(),
      provisional: e.provisional
    };
  }

  /* ---------- Creación de la partida ---------- */

  /*
   * op: { nivel, nombres[], arbitro, rng?, imagenExiste? }
   * La partida trabaja sobre una instantánea del nivel: cambios posteriores en el
   * editor no la afectan.
   */
  function crearPartida(op) {
    op = op || {};
    var rng = op.rng || Math.random;
    if (!op.nivel) throw new ErrorJuego('Elijan un nivel para jugar.');
    var nivel = N.instantanea(op.nivel);
    var v = N.validarNivel(nivel, { imagenExiste: op.imagenExiste });
    if (!v.puedeJugar) {
      throw new ErrorJuego('El nivel tiene errores: ' + v.errores[0] +
        (v.errores.length > 1 ? ' (y ' + (v.errores.length - 1) + ' más)' : '') +
        '. Corríjanlos en el Editor de niveles.');
    }
    var nombres = (op.nombres || []).map(function (n) { return String(n || '').trim(); });
    if (nombres.length < 2 || nombres.length > 4) throw new ErrorJuego('La partida necesita de 2 a 4 jugadores.');
    if (nombres.some(function (n) { return !n; })) throw new ErrorJuego('Escriban el nombre de cada jugador.');
    var vistos = {};
    nombres.forEach(function (n) {
      var k = n.toLowerCase();
      if (vistos[k]) throw new ErrorJuego('Hay dos jugadores llamados «' + n + '». Usen nombres distintos.');
      vistos[k] = true;
    });
    var arbitro = String(op.arbitro || '').trim();
    if (!arbitro) throw new ErrorJuego('Escriban el nombre del árbitro.');
    if (vistos[arbitro.toLowerCase()]) throw new ErrorJuego('El árbitro no puede ser también jugador.');

    var cfg = nivel.config;
    var episodios = {};
    var tablero = nivel.tablero.slice();
    tablero.forEach(function (id) {
      if (id) {
        var ep = nivel.episodios.filter(function (e) { return e.id === id; })[0];
        episodios[id] = episodioParaJuego(ep);
      }
    });
    if (cfg.barajarTablero) tablero = barajar(tablero, rng);
    var ids = Object.keys(episodios);

    return {
      version: 2,
      id: N.nuevoId('partida'),
      creada: new Date().toISOString(),
      nivel: { id: nivel.id, nombre: nivel.nombre, version: nivel.version, descripcion: nivel.descripcion },
      fase: 'juego',
      reglas: {
        seleccionPregunta: cfg.seleccionPregunta,
        puntuacion: cfg.puntuacion,
        permitirFinAnticipado: cfg.permitirFinAnticipado
      },
      demostracion: !v.cumpleFormato || cfg.estado !== 'aprobado' || ids.length < TABLERO.total,
      totalEpisodios: ids.length,
      columnas: cfg.columnas,
      filas: cfg.filas,
      episodios: episodios,
      tablero: tablero,
      mazo: barajar(ids, rng),
      ganadas: {},
      jugadores: nombres.map(function (n, i) {
        return { indice: i, nombre: n, piezas: [], orden: [], ordenConfirmado: false };
      }),
      arbitro: arbitro,
      activo: 0,
      turno: 1,
      jugada: null,
      historial: [],
      finAnticipado: false,
      resultados: null
    };
  }

  // Convierte una partida guardada por la primera versión del juego al formato actual.
  function migrarPartida(s) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.jugadores) || !s.episodios) return null;
    if (s.version === 2) return s;
    Object.keys(s.episodios).forEach(function (id) {
      var ep = s.episodios[id];
      if (ep.preguntas && typeof ep.preguntas[0] === 'string') ep.preguntas = episodioParaJuego(ep).preguntas;
      else if (!ep.preguntas) ep.preguntas = [];
    });
    s.version = 2;
    s.id = s.id || N.nuevoId('partida');
    s.creada = s.creada || new Date().toISOString();
    s.nivel = s.nivel || { id: null, nombre: 'Material de la primera versión', version: 0, descripcion: '' };
    s.columnas = s.columnas || 6;
    s.filas = s.filas || Math.ceil(s.tablero.length / (s.columnas || 6));
    return s;
  }

  /* ---------- Comprobaciones ---------- */

  var NOMBRE_FASE = {
    juego: 'la fase de juego', transicion: 'la pausa antes de la fase cronológica',
    cronologia: 'la fase cronológica', validacion: 'la validación del árbitro', resultados: 'los resultados'
  };
  function exigirFase(s, fase) {
    if (s.fase !== fase) throw new ErrorJuego('Esta acción solo es posible durante ' + NOMBRE_FASE[fase] + '.');
  }
  function exigirEtapa(s, etapa) {
    exigirFase(s, 'juego');
    if (!s.jugada) throw new ErrorJuego('No hay ninguna jugada en curso. Primero hay que robar una descripción.');
    if (s.jugada.etapa !== etapa) {
      var msg = {
        seleccion: 'La elección ya fue confirmada; ahora decide el árbitro.',
        verificacion: 'Primero el jugador debe elegir y confirmar una imagen.',
        incorrecta: 'La jugada no está en espera de devolución de cartas.',
        pregunta: 'La pregunta solo se evalúa cuando el árbitro confirma una coincidencia correcta.'
      }[etapa];
      throw new ErrorJuego(msg);
    }
  }

  function imagenDisponible(s, pos) {
    var id = s.tablero[pos];
    return !!id && !Object.prototype.hasOwnProperty.call(s.ganadas, id);
  }

  function resumen(s) {
    var conMaterial = s.tablero.filter(Boolean).length;
    var disponibles = 0;
    for (var i = 0; i < s.tablero.length; i++) if (imagenDisponible(s, i)) disponibles++;
    return { conMaterial: conMaterial, disponibles: disponibles, enMazo: s.mazo.length, ganadas: Object.keys(s.ganadas).length };
  }

  /* ---------- Fases A–E: turnos ---------- */

  // Fase A
  function robar(s) {
    exigirFase(s, 'juego');
    if (s.jugada) throw new ErrorJuego('Hay una jugada pendiente. Resuélvanla antes de robar otra descripción.');
    if (!s.mazo.length) throw new ErrorJuego('No quedan descripciones en el mazo.');
    var id = s.mazo.shift();
    s.jugada = { jugador: s.activo, descripcionId: id, seleccion: null, etapa: 'seleccion', correcta: null, preguntaIdx: null };
    return id;
  }

  // Fase B
  function seleccionar(s, pos) {
    exigirEtapa(s, 'seleccion');
    pos = entero(pos);
    if (pos === null || pos < 0 || pos >= s.tablero.length) throw new ErrorJuego('Esa casilla no existe.');
    if (!s.tablero[pos]) throw new ErrorJuego('Esa casilla está vacía: no tiene material.');
    if (!imagenDisponible(s, pos)) {
      var dueño = s.jugadores[s.ganadas[s.tablero[pos]]];
      throw new ErrorJuego('Esa imagen ya la ganó ' + (dueño ? dueño.nombre : 'otro jugador') + '.');
    }
    s.jugada.seleccion = pos;
  }

  function confirmarSeleccion(s) {
    exigirEtapa(s, 'seleccion');
    if (s.jugada.seleccion === null) throw new ErrorJuego('Elijan una imagen del tablero antes de confirmar.');
    s.jugada.etapa = 'verificacion';
  }

  // Fase C (control del árbitro)
  function verificarCoincidencia(s, rng) {
    exigirEtapa(s, 'verificacion');
    var correcta = s.tablero[s.jugada.seleccion] === s.jugada.descripcionId;
    s.jugada.correcta = correcta;
    if (correcta) {
      s.jugada.etapa = 'pregunta';
      s.jugada.preguntaIdx = elegirPregunta(s, rng);
    } else {
      s.jugada.etapa = 'incorrecta';
    }
    return correcta;
  }

  function elegirPregunta(s, rng) {
    var n = s.episodios[s.jugada.descripcionId].preguntas.length;
    if (!n) return null;
    if (s.reglas.seleccionPregunta === 'primera') return 0;
    return Math.floor((rng || Math.random)() * n);
  }

  function cambiarPregunta(s) {
    exigirEtapa(s, 'pregunta');
    var n = s.episodios[s.jugada.descripcionId].preguntas.length;
    if (n < 2) throw new ErrorJuego('Este episodio tiene una sola pregunta en el material.');
    s.jugada.preguntaIdx = (s.jugada.preguntaIdx + 1) % n;
  }

  function cerrarIncorrecta(s) {
    exigirEtapa(s, 'incorrecta');
    registrar(s, 'combinacion_incorrecta', '');
    s.mazo.push(s.jugada.descripcionId);
    terminarTurno(s);
  }

  // Fase D
  function evaluarRespuesta(s, aceptada, observacion) {
    exigirEtapa(s, 'pregunta');
    if (typeof aceptada !== 'boolean') throw new ErrorJuego('El árbitro debe elegir «Respuesta aceptada» o «Respuesta rechazada».');
    var id = s.jugada.descripcionId;
    if (aceptada) {
      if (Object.prototype.hasOwnProperty.call(s.ganadas, id)) throw new ErrorJuego('Esa pieza ya pertenece a otro jugador.');
      s.ganadas[id] = s.activo;
      s.jugadores[s.activo].piezas.push(id);
      registrar(s, 'pieza_ganada', observacion);
    } else {
      s.mazo.push(id);
      registrar(s, 'respuesta_rechazada', observacion);
    }
    terminarTurno(s);
  }

  function registrar(s, resultado, observacion) {
    var j = s.jugada;
    s.historial.push({
      turno: s.turno, jugador: s.activo, nombre: s.jugadores[s.activo].nombre,
      descripcionId: j.descripcionId, casilla: j.seleccion, imagenId: s.tablero[j.seleccion],
      pregunta: j.preguntaIdx, resultado: resultado,
      observacion: texto(observacion) ? observacion.trim().slice(0, 280) : ''
    });
  }

  // Fase E
  function terminarTurno(s) {
    s.jugada = null;
    s.activo = (s.activo + 1) % s.jugadores.length;
    s.turno += 1;
    if (s.mazo.length === 0) s.fase = 'transicion';
  }

  function terminarAnticipado(s) {
    exigirFase(s, 'juego');
    if (!s.reglas.permitirFinAnticipado) throw new ErrorJuego('Las reglas de esta partida no permiten terminar antes de agotar el mazo.');
    if (s.jugada) throw new ErrorJuego('Hay una jugada pendiente. Resuélvanla antes de terminar la fase de juego.');
    s.finAnticipado = true;
    s.fase = 'transicion';
  }

  /* ---------- Fase cronológica ---------- */

  function ordenCorrecto(s, ids) {
    return ids.slice().sort(function (a, b) { return s.episodios[a].ordenCronologico - s.episodios[b].ordenCronologico; });
  }

  function mismoOrden(a, b) { return a.length === b.length && a.every(function (x, i) { return x === b[i]; }); }

  // Desordena las piezas para que nadie reciba el orden correcto de regalo.
  function desordenar(s, ids, rng) {
    if (ids.length < 2) return ids.slice();
    var correcto = ordenCorrecto(s, ids);
    for (var k = 0; k < 12; k++) {
      var p = barajar(ids, rng);
      if (!mismoOrden(p, correcto)) return p;
    }
    return correcto.slice(1).concat(correcto[0]);
  }

  function iniciarCronologia(s, rng) {
    exigirFase(s, 'transicion');
    s.jugadores.forEach(function (j) {
      j.orden = desordenar(s, j.piezas, rng);
      j.ordenConfirmado = j.piezas.length === 0;
    });
    s.fase = 'cronologia';
  }

  function jugadorValido(s, j) {
    var p = s.jugadores[entero(j)];
    if (!p) throw new ErrorJuego('Ese jugador no existe.');
    return p;
  }

  function moverPieza(s, j, desde, hasta) {
    exigirFase(s, 'cronologia');
    var p = jugadorValido(s, j);
    if (p.ordenConfirmado) throw new ErrorJuego(p.nombre + ' ya confirmó su orden. Pulsen «Modificar» para cambiarlo.');
    desde = entero(desde); hasta = entero(hasta);
    var n = p.orden.length;
    if (desde === null || hasta === null || desde < 0 || desde >= n || hasta < 0 || hasta >= n) throw new ErrorJuego('Ese movimiento no es posible.');
    var pieza = p.orden.splice(desde, 1)[0];
    p.orden.splice(hasta, 0, pieza);
  }

  function confirmarOrden(s, j) {
    exigirFase(s, 'cronologia');
    jugadorValido(s, j).ordenConfirmado = true;
  }

  function reabrirOrden(s, j) {
    exigirFase(s, 'cronologia');
    var p = jugadorValido(s, j);
    if (!p.piezas.length) throw new ErrorJuego(p.nombre + ' no tiene piezas que ordenar.');
    p.ordenConfirmado = false;
  }

  function todosConfirmados(s) { return s.jugadores.every(function (j) { return j.ordenConfirmado; }); }

  function pasarAValidacion(s) {
    exigirFase(s, 'cronologia');
    var falta = s.jugadores.filter(function (j) { return !j.ordenConfirmado; }).map(function (j) { return j.nombre; });
    if (falta.length) throw new ErrorJuego('Falta que confirme su orden: ' + falta.join(', ') + '.');
    s.fase = 'validacion';
  }

  function volverACronologia(s) {
    exigirFase(s, 'validacion');
    s.fase = 'cronologia';
  }

  /* ---------- Puntuación ---------- */

  function puntuar(s, orden, modo) {
    var correcto = ordenCorrecto(s, orden);
    var marcas;
    if (modo === 'subsecuencia') {
      // Subsecuencia creciente más larga: piezas que mantienen entre sí el orden correcto.
      var v = orden.map(function (id) { return s.episodios[id].ordenCronologico; });
      var largo = [], previo = [];
      for (var i = 0; i < v.length; i++) {
        largo[i] = 1; previo[i] = -1;
        for (var k = 0; k < i; k++) if (v[k] < v[i] && largo[k] + 1 > largo[i]) { largo[i] = largo[k] + 1; previo[i] = k; }
      }
      var mejor = -1;
      for (var m = 0; m < v.length; m++) if (mejor < 0 || largo[m] > largo[mejor]) mejor = m;
      var enSecuencia = {};
      for (var c = mejor; c >= 0; c = previo[c]) enSecuencia[c] = true;
      marcas = orden.map(function (id, idx) { return !!enSecuencia[idx]; });
    } else {
      marcas = orden.map(function (id, idx) { return id === correcto[idx]; });
    }
    return {
      correctas: marcas.filter(Boolean).length,
      detalle: orden.map(function (id, idx) { return { id: id, correcta: marcas[idx] }; }),
      ordenCorrecto: correcto
    };
  }

  function validarSecuencias(s) {
    exigirFase(s, 'validacion');
    var tabla = s.jugadores.map(function (j) {
      var p = puntuar(s, j.orden, s.reglas.puntuacion);
      return { indice: j.indice, nombre: j.nombre, piezas: j.piezas.length, correctas: p.correctas, detalle: p.detalle, ordenCorrecto: p.ordenCorrecto };
    });
    var max = Math.max.apply(null, tabla.map(function (t) { return t.correctas; }));
    var ganadores = tabla.filter(function (t) { return t.correctas === max; }).map(function (t) { return t.nombre; });
    s.resultados = {
      tabla: tabla,
      maximo: max,
      ganadores: ganadores,
      empate: ganadores.length > 1,
      secuencia: ordenCorrecto(s, Object.keys(s.episodios)).map(function (id) {
        return { id: id, ganadaPor: Object.prototype.hasOwnProperty.call(s.ganadas, id) ? s.ganadas[id] : null };
      }),
      modo: s.reglas.puntuacion
    };
    s.fase = 'resultados';
    return s.resultados;
  }

  /* ---------- Descripción para la pantalla «Continuar partida» ---------- */

  function describirEstado(s) {
    var activo = s.jugadores[s.activo];
    var r = resumen(s);
    var fase, pendiente = '';
    if (s.fase === 'juego') {
      fase = 'Fase de juego, turno ' + s.turno + '. Le toca a ' + activo.nombre + '.';
      if (s.jugada) {
        pendiente = {
          seleccion: activo.nombre + ' robó una descripción y todavía está eligiendo la imagen.',
          verificacion: activo.nombre + ' confirmó una imagen; falta que el árbitro compruebe la coincidencia.',
          incorrecta: 'El árbitro comprobó que la combinación es incorrecta; falta devolver las cartas.',
          pregunta: 'La imagen era correcta; falta que el árbitro evalúe la respuesta a la pregunta.'
        }[s.jugada.etapa];
      }
    } else if (s.fase === 'transicion') fase = 'Terminó la fase de juego; falta comenzar la fase cronológica.';
    else if (s.fase === 'cronologia') {
      var listos = s.jugadores.filter(function (j) { return j.ordenConfirmado; }).length;
      fase = 'Fase cronológica: ' + listos + ' de ' + s.jugadores.length + ' jugadores confirmaron su orden.';
    } else if (s.fase === 'validacion') fase = 'Esperando la validación del árbitro.';
    else fase = 'Partida terminada.';
    return {
      fase: fase,
      pendiente: pendiente,
      piezas: s.jugadores.map(function (j) { return { nombre: j.nombre, piezas: j.piezas.length }; }),
      enMazo: r.enMazo,
      disponibles: r.disponibles,
      terminada: s.fase === 'resultados'
    };
  }

  return {
    TABLERO: TABLERO,
    episodioParaJuego: episodioParaJuego,
    migrarPartida: migrarPartida,
    describirEstado: describirEstado,
    REGLAS_PROVISIONALES: REGLAS_PROVISIONALES,
    ErrorJuego: ErrorJuego,
    barajar: barajar,
    crearPartida: crearPartida,
    imagenDisponible: imagenDisponible,
    resumen: resumen,
    robar: robar,
    seleccionar: seleccionar,
    confirmarSeleccion: confirmarSeleccion,
    verificarCoincidencia: verificarCoincidencia,
    cambiarPregunta: cambiarPregunta,
    cerrarIncorrecta: cerrarIncorrecta,
    evaluarRespuesta: evaluarRespuesta,
    terminarAnticipado: terminarAnticipado,
    iniciarCronologia: iniciarCronologia,
    moverPieza: moverPieza,
    confirmarOrden: confirmarOrden,
    reabrirOrden: reabrirOrden,
    todosConfirmados: todosConfirmados,
    pasarAValidacion: pasarAValidacion,
    volverACronologia: volverACronologia,
    ordenCorrecto: ordenCorrecto,
    puntuar: puntuar,
    validarSecuencias: validarSecuencias
  };
});
