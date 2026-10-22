/*
 * El match con Don Quijote — modelo de niveles.
 * Un nivel reúne episodios (cartas), su tablero y su configuración.
 * Este archivo no usa el navegador: solo transforma y valida datos.
 * Funciona en el navegador (window.NivelesQuijote) y en Node (pruebas).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NivelesQuijote = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FORMATO_NIVEL = 'match-quijote-nivel';
  var FORMATO_BIBLIOTECA = 'match-quijote-biblioteca';
  var VERSION_FORMATO = 1;
  var LIMITE_CAPITULOS = { 1: 52, 2: 74 };
  var LIMITES_TABLERO = { min: 1, max: 10 };

  var CONFIG_DEFECTO = {
    columnas: 6,
    filas: 5,
    exigirCompleto: true,        // todos los espacios del tablero deben tener un episodio
    barajarTablero: false,       // mezclar las posiciones de las imágenes al empezar cada partida
    seleccionPregunta: 'aleatoria', // 'aleatoria' | 'primera'
    puntuacion: 'posicion',      // 'posicion' | 'subsecuencia'
    permitirFinAnticipado: true,
    estado: 'provisional',       // 'provisional' | 'aprobado'
    edicionReferencia: ''
  };

  function texto(v) { return typeof v === 'string' && v.trim() !== ''; }
  function str(v) { return v === undefined || v === null ? '' : String(v); }
  function entero(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return Number.isInteger(n) ? n : null; }
  function numero(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return Number.isFinite(n) ? n : null; }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function ahora() { return new Date().toISOString(); }
  function nuevoId(prefijo) {
    return prefijo + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }
  function limitar(v, min, max, defecto) { var n = entero(v); if (n === null) return defecto; return Math.max(min, Math.min(max, n)); }
  function crudo(v) { return v === undefined || v === null ? '' : v; }

  /* ---------- Normalización ---------- */

  function normalizarPregunta(p, respuestaAntigua) {
    if (typeof p === 'string') return { id: nuevoId('p'), texto: p, respuesta: str(respuestaAntigua), notas: '' };
    p = p && typeof p === 'object' ? p : {};
    return { id: texto(p.id) ? p.id : nuevoId('p'), texto: str(p.texto), respuesta: str(p.respuesta), notas: str(p.notas) };
  }

  // Acepta el formato antiguo (preguntas como texto + respuestasReferencia) y el nuevo (objetos).
  function normalizarEpisodio(ep) {
    ep = ep && typeof ep === 'object' ? ep : {};
    var pr = Array.isArray(ep.preguntas) ? ep.preguntas : [];
    var rr = Array.isArray(ep.respuestasReferencia) ? ep.respuestasReferencia : [];
    return {
      id: str(ep.id).trim(),
      titulo: str(ep.titulo),
      parte: crudo(ep.parte),
      capitulo: crudo(ep.capitulo),
      ordenCronologico: crudo(ep.ordenCronologico),
      descripcion: str(ep.descripcion),
      imagen: str(ep.imagen).trim(),
      emblema: str(ep.emblema).trim(),
      preguntas: pr.map(function (p, i) { return normalizarPregunta(p, rr[i]); }),
      notasArbitro: str(ep.notasArbitro),
      provisional: ep.provisional !== false
    };
  }

  function normalizarConfig(c) {
    var cfg = Object.assign({}, CONFIG_DEFECTO, c && typeof c === 'object' ? c : {});
    cfg.columnas = limitar(cfg.columnas, LIMITES_TABLERO.min, LIMITES_TABLERO.max, 6);
    cfg.filas = limitar(cfg.filas, LIMITES_TABLERO.min, LIMITES_TABLERO.max, 5);
    cfg.exigirCompleto = cfg.exigirCompleto !== false;
    cfg.barajarTablero = cfg.barajarTablero === true;
    cfg.seleccionPregunta = cfg.seleccionPregunta === 'primera' ? 'primera' : 'aleatoria';
    cfg.puntuacion = cfg.puntuacion === 'subsecuencia' ? 'subsecuencia' : 'posicion';
    cfg.permitirFinAnticipado = cfg.permitirFinAnticipado !== false;
    cfg.estado = cfg.estado === 'aprobado' ? 'aprobado' : 'provisional';
    cfg.edicionReferencia = str(cfg.edicionReferencia);
    return cfg;
  }

  function normalizarNivel(n) {
    n = n && typeof n === 'object' ? n : {};
    var config = normalizarConfig(n.config);
    var episodios = Array.isArray(n.episodios) ? n.episodios.map(normalizarEpisodio) : [];
    var espacios = config.columnas * config.filas;
    var ids = {};
    episodios.forEach(function (e) { if (e.id) ids[e.id] = true; });
    var vistos = {};
    var tablero = (Array.isArray(n.tablero) ? n.tablero.slice(0, espacios) : []).map(function (x) {
      if (!x || !ids[x] || vistos[x]) return null;   // un episodio ocupa como máximo un espacio
      vistos[x] = true;
      return x;
    });
    while (tablero.length < espacios) tablero.push(null);
    var creado = n.creado || ahora();
    return {
      id: texto(n.id) ? n.id : nuevoId('nivel'),
      nombre: texto(n.nombre) ? n.nombre.trim() : 'Nivel sin nombre',
      descripcion: str(n.descripcion),
      version: entero(n.version) || 0,
      creado: creado,
      modificado: n.modificado || creado,
      config: config,
      episodios: episodios,
      tablero: tablero,
      origen: normalizarOrigen(n.origen)
    };
  }

  /*
   * Origen de un nivel incluido en el juego (src/niveles/). Lo escribe la sincronización:
   *   id           identificador del nivel incluido (si no coincide con nivel.id, es una copia)
   *   huella       huella del paquete con que se instaló
   *   versionLocal versión guardada justo después de instalarlo; si nivel.version es mayor,
   *                alguien lo editó en este navegador
   */
  function normalizarOrigen(o) {
    if (!o || typeof o !== 'object' || !texto(o.id) || !texto(o.huella)) return null;
    return { id: o.id, huella: o.huella, versionLocal: entero(o.versionLocal) || 0, instalado: str(o.instalado) };
  }

  function esIncluido(nivel) { return !!(nivel && nivel.origen && nivel.origen.id === nivel.id); }
  function editadoLocalmente(nivel) { return esIncluido(nivel) && nivel.version > nivel.origen.versionLocal; }

  function nuevoNivel(datos) {
    datos = datos || {};
    return normalizarNivel({ nombre: datos.nombre, descripcion: datos.descripcion, config: datos.config });
  }

  // Convierte el material de la primera versión ({meta, episodios} o una lista) en un nivel.
  function desdeMaterialAntiguo(material, datos) {
    datos = datos || {};
    var lista = Array.isArray(material) ? material : (material && Array.isArray(material.episodios) ? material.episodios : []);
    var meta = (material && material.meta) || {};
    var nivel = normalizarNivel({
      nombre: datos.nombre || meta.titulo || 'Material importado',
      descripcion: datos.descripcion !== undefined ? datos.descripcion : str(meta.nota),
      config: {
        exigirCompleto: lista.length === 30,
        estado: meta.estado === 'aprobado' ? 'aprobado' : 'provisional',
        edicionReferencia: meta.edicionReferencia || ''
      },
      episodios: lista
    });
    var usados = {};
    var pos = 0;
    nivel.episodios.forEach(function (e) {
      if (e.id && !usados[e.id] && pos < nivel.tablero.length) { nivel.tablero[pos++] = e.id; usados[e.id] = true; }
    });
    return nivel;
  }

  function instantanea(nivel) { return copia(normalizarNivel(nivel)); }

  /* ---------- Episodios ---------- */

  function idLibre(nivel, base) {
    var usados = {};
    nivel.episodios.forEach(function (e) { usados[e.id] = true; });
    base = str(base).trim() || 'ep';
    if (!usados[base]) return base;
    var c = base + '-copia', k = 2;
    while (usados[c]) { c = base + '-copia-' + k; k++; }
    return c;
  }

  function siguienteIdEpisodio(nivel) {
    var usados = {};
    nivel.episodios.forEach(function (e) { usados[e.id] = true; });
    for (var n = 1; n < 10000; n++) {
      var id = 'ep-' + (n < 10 ? '0' + n : n);
      if (!usados[id]) return id;
    }
    return nuevoId('ep');
  }

  function crearEpisodio(nivel) {
    var ep = normalizarEpisodio({ id: siguienteIdEpisodio(nivel), titulo: '', parte: 1, preguntas: [] });
    nivel.episodios.push(ep);
    return nivel.episodios.length - 1;
  }

  // La copia recibe un id nuevo y queda en la reserva. El orden cronológico se deja vacío
  // para que el grupo lo revise: dos episodios no pueden compartir posición en la secuencia.
  function duplicarEpisodio(nivel, indice) {
    var orig = nivel.episodios[indice];
    if (!orig) throw new Error('Ese episodio no existe.');
    var c = copia(orig);
    c.id = idLibre(nivel, orig.id || 'ep');
    c.titulo = (orig.titulo || 'Episodio') + ' (copia)';
    c.ordenCronologico = '';
    c.preguntas = c.preguntas.map(function (p) { return Object.assign({}, p, { id: nuevoId('p') }); });
    nivel.episodios.splice(indice + 1, 0, c);
    return indice + 1;
  }

  function eliminarEpisodio(nivel, indice) {
    var ep = nivel.episodios[indice];
    if (!ep) return;
    var repetido = nivel.episodios.filter(function (e) { return e.id === ep.id; }).length > 1;
    nivel.episodios.splice(indice, 1);
    if (!repetido) nivel.tablero = nivel.tablero.map(function (x) { return x === ep.id ? null : x; });
  }

  // Cambia el id de un episodio y actualiza su espacio del tablero.
  function renombrarEpisodio(nivel, indice, nuevo) {
    var ep = nivel.episodios[indice];
    if (!ep) return;
    nuevo = str(nuevo).trim();
    var viejo = ep.id;
    var compartido = nivel.episodios.filter(function (e) { return e.id === viejo; }).length > 1;
    ep.id = nuevo;
    if (!compartido && viejo) {
      nivel.tablero = nivel.tablero.map(function (x) { return x === viejo ? (nuevo || null) : x; });
    }
  }

  function moverPregunta(ep, desde, hasta) {
    if (hasta < 0 || hasta >= ep.preguntas.length) return;
    var p = ep.preguntas.splice(desde, 1)[0];
    ep.preguntas.splice(hasta, 0, p);
  }

  /* ---------- Tablero ---------- */

  function espacios(nivel) { return nivel.config.columnas * nivel.config.filas; }

  function enReserva(nivel) {
    var puestos = {};
    nivel.tablero.forEach(function (x) { if (x) puestos[x] = true; });
    return nivel.episodios.map(function (e, i) { return i; }).filter(function (i) {
      var e = nivel.episodios[i];
      return !(e.id && puestos[e.id]);
    });
  }

  function asignarEspacio(nivel, pos, id) {
    if (pos < 0 || pos >= nivel.tablero.length) throw new Error('Ese espacio no existe.');
    if (id) nivel.tablero = nivel.tablero.map(function (x) { return x === id ? null : x; });
    nivel.tablero[pos] = id || null;
  }

  function intercambiarEspacios(nivel, a, b) {
    var t = nivel.tablero[a]; nivel.tablero[a] = nivel.tablero[b]; nivel.tablero[b] = t;
  }

  function llenarVacios(nivel) {
    var reserva = enReserva(nivel).map(function (i) { return nivel.episodios[i]; })
      .filter(function (e) { return e.id && nivel.episodios.filter(function (x) { return x.id === e.id; }).length === 1; });
    var colocados = 0;
    for (var p = 0; p < nivel.tablero.length && reserva.length; p++) {
      if (!nivel.tablero[p]) { nivel.tablero[p] = reserva.shift().id; colocados++; }
    }
    return colocados;
  }

  function mezclarTablero(nivel, rng) {
    rng = rng || Math.random;
    var a = nivel.tablero;
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
  }

  function vaciarTablero(nivel) { nivel.tablero = nivel.tablero.map(function () { return null; }); }

  // Cambia el tamaño del tablero. Los episodios que ya no caben pasan a espacios libres o a la reserva.
  function redimensionar(nivel, columnas, filas) {
    columnas = limitar(columnas, LIMITES_TABLERO.min, LIMITES_TABLERO.max, 6);
    filas = limitar(filas, LIMITES_TABLERO.min, LIMITES_TABLERO.max, 5);
    var total = columnas * filas;
    var viejo = nivel.tablero;
    var nuevo = viejo.slice(0, total);
    while (nuevo.length < total) nuevo.push(null);
    var fuera = viejo.slice(total).filter(Boolean);
    var retirados = [];
    fuera.forEach(function (id) {
      var libre = nuevo.indexOf(null);
      if (libre >= 0) nuevo[libre] = id; else retirados.push(id);
    });
    nivel.config.columnas = columnas;
    nivel.config.filas = filas;
    nivel.tablero = nuevo;
    return { retirados: retirados };
  }

  function cuantosRetiraria(nivel, columnas, filas) {
    var total = columnas * filas;
    var ocupados = nivel.tablero.filter(Boolean).length;
    return Math.max(0, ocupados - total);
  }

  /* ---------- Imágenes ---------- */

  function esImagenGuardada(ref) { return typeof ref === 'string' && ref.indexOf('img:') === 0; }
  function idImagen(ref) { return esImagenGuardada(ref) ? ref.slice(4) : null; }

  function referenciasImagen(nivel) {
    var ids = [];
    (nivel.episodios || []).forEach(function (e) {
      var id = idImagen(e.imagen);
      if (id && ids.indexOf(id) < 0) ids.push(id);
    });
    return ids;
  }

  /* ---------- Validación ---------- */

  /*
   * Informe de un nivel. Solo los episodios colocados en el tablero participan en la partida;
   * sus problemas son errores. Los de la reserva se informan como avisos, salvo los
   * identificadores repetidos, que siempre son errores.
   * op.imagenExiste(id) indica si una imagen guardada sigue disponible.
   */
  function validarNivel(nivel, op) {
    op = op || {};
    var existe = op.imagenExiste || function () { return true; };
    var cfg = nivel.config;
    var total = cfg.columnas * cfg.filas;
    var errores = [], avisos = [], porEpisodio = [];
    var conteoIds = {};
    nivel.episodios.forEach(function (e) { if (e.id) conteoIds[e.id] = (conteoIds[e.id] || 0) + 1; });
    var puestos = {};
    nivel.tablero.forEach(function (x) { if (x) puestos[x] = true; });
    var ordenes = {};
    var c = {
      episodios: nivel.episodios.length, enTablero: 0, espacios: total, reserva: 0,
      imagenes: 0, descripciones: 0, sinPreguntas: 0, sinImagen: 0, descripcionesVacias: 0,
      idsDuplicados: 0, sinCapitulo: 0, sinOrden: 0, imagenesRotas: 0
    };
    Object.keys(conteoIds).forEach(function (k) { if (conteoIds[k] > 1) c.idsDuplicados++; });

    nivel.episodios.forEach(function (ep, i) {
      var e = [], a = [];
      var nombre = texto(ep.titulo) ? '«' + ep.titulo.trim() + '»' : 'Episodio sin título (n.º ' + (i + 1) + ')';
      var juega = !!(ep.id && puestos[ep.id]);
      var duplicado = ep.id && conteoIds[ep.id] > 1;
      if (!texto(ep.id)) e.push('falta el identificador');
      else if (duplicado) e.push('el identificador «' + ep.id + '» está repetido');
      if (!texto(ep.titulo)) e.push('falta el título');
      var parte = entero(ep.parte);
      if (parte !== 1 && parte !== 2) e.push('falta indicar la parte de la obra (primera o segunda)');
      var cap = entero(ep.capitulo);
      if (cap === null || cap < 1) e.push('falta el número de capítulo');
      else if ((parte === 1 || parte === 2) && cap > LIMITE_CAPITULOS[parte]) {
        a.push('el capítulo ' + cap + ' supera los ' + LIMITE_CAPITULOS[parte] + ' capítulos habituales de esa parte; revísenlo con su edición');
      }
      var orden = numero(ep.ordenCronologico);
      if (orden === null) e.push('falta el orden cronológico');
      if (!texto(ep.descripcion)) e.push('la descripción está vacía');

      var imgId = idImagen(ep.imagen);
      var rota = false;
      if (!ep.imagen) a.push(ep.emblema ? 'sin imagen: se mostrará un emblema provisional' : 'sin imagen: se mostrará un marcador provisional con el título');
      else if (imgId && !existe(imgId)) { rota = true; e.push('la imagen guardada no se encuentra (referencia rota); súbanla de nuevo o quítenla'); }

      var validas = (ep.preguntas || []).filter(function (p) { return texto(p.texto); });
      if (!validas.length) a.push('no tiene preguntas para el árbitro');
      else {
        var sinRef = validas.filter(function (p) { return !texto(p.respuesta); }).length;
        if (sinRef) a.push(sinRef === 1 ? 'una pregunta no tiene respuesta de referencia' : sinRef + ' preguntas no tienen respuesta de referencia');
      }

      if (juega) {
        c.enTablero++;
        if (texto(ep.descripcion)) c.descripciones++; else c.descripcionesVacias++;
        if (!ep.imagen) c.sinImagen++;
        else if (rota) c.imagenesRotas++;
        else c.imagenes++;
        if (!validas.length) c.sinPreguntas++;
        if (cap === null || cap < 1) c.sinCapitulo++;
        if (orden === null) c.sinOrden++;
        else if (ordenes[orden] !== undefined) e.push('el orden cronológico ' + orden + ' está repetido (también lo usa ' + ordenes[orden] + ')');
        else ordenes[orden] = nombre;
        e.forEach(function (m) { errores.push(nombre + ': ' + m); });
        a.forEach(function (m) { avisos.push(nombre + ': ' + m); });
      } else {
        c.reserva++;
        if (duplicado) errores.push(nombre + ' (reserva): el identificador «' + ep.id + '» está repetido');
        a.unshift('está en la reserva: no participará en la partida');
      }
      porEpisodio.push({ errores: e, avisos: a, enTablero: juega, nombre: nombre });
    });

    var cumpleFormato = cfg.exigirCompleto ? c.enTablero === total : c.enTablero >= 2;
    if (c.enTablero < 2) errores.unshift('Se necesitan al menos 2 episodios en el tablero para jugar.');
    if (cfg.exigirCompleto && c.enTablero !== total) {
      errores.unshift('El formato exige ' + total + ' imágenes (' + cfg.columnas + ' × ' + cfg.filas + '), pero el tablero tiene ' + c.enTablero + '.');
    } else if (!cfg.exigirCompleto && c.enTablero < total) {
      avisos.unshift('El tablero tiene ' + c.enTablero + ' de ' + total + ' espacios ocupados; los demás quedarán vacíos.');
    }
    if (c.reserva) avisos.unshift(c.reserva + (c.reserva === 1 ? ' episodio está en la reserva y no participará.' : ' episodios están en la reserva y no participarán.'));
    if (cfg.estado !== 'aprobado') avisos.unshift('El nivel está marcado como provisional (no aprobado por el grupo).');

    return {
      errores: errores, avisos: avisos, porEpisodio: porEpisodio, conteos: c,
      cumpleFormato: cumpleFormato, puedeJugar: errores.length === 0, espacios: total
    };
  }

  /* ---------- Paquetes de exportación (solo datos) ---------- */

  // rutas: { idImagen: 'imagenes/archivo.png' }
  function nivelConRutas(nivel, rutas) {
    var n = copia(nivel);
    delete n.origen;   // el origen describe la instalación en este navegador, no el contenido
    n.episodios.forEach(function (e) {
      var id = idImagen(e.imagen);
      if (id) e.imagen = rutas[id] || '';
    });
    return n;
  }

  function paqueteNivel(nivel, rutas) {
    return { formato: FORMATO_NIVEL, versionFormato: VERSION_FORMATO, aplicacion: 'El match con Don Quijote', exportado: ahora(), nivel: nivelConRutas(nivel, rutas || {}) };
  }

  function paqueteBiblioteca(niveles, rutas) {
    return {
      formato: FORMATO_BIBLIOTECA, versionFormato: VERSION_FORMATO, aplicacion: 'El match con Don Quijote', exportado: ahora(),
      niveles: niveles.map(function (n) { return nivelConRutas(n, rutas || {}); })
    };
  }

  /*
   * Interpreta el JSON de un archivo importado.
   * Devuelve { tipo, niveles: [nivel crudo], problemas: [errores que impiden importar] }.
   */
  function leerPaquete(json) {
    var problemas = [];
    var niveles = [];
    var tipo = null;
    if (!json || typeof json !== 'object') {
      problemas.push('El archivo no contiene datos con la estructura esperada.');
    } else if (json.formato === FORMATO_NIVEL) {
      tipo = 'nivel';
      if (!json.nivel || typeof json.nivel !== 'object') problemas.push('Falta la sección «nivel».');
      else niveles = [json.nivel];
    } else if (json.formato === FORMATO_BIBLIOTECA) {
      tipo = 'biblioteca';
      if (!Array.isArray(json.niveles)) problemas.push('Falta la lista «niveles».');
      else niveles = json.niveles;
    } else if (Array.isArray(json) || (Array.isArray(json.episodios) && !json.formato)) {
      tipo = 'material-antiguo';
      niveles = [desdeMaterialAntiguo(json)];
    } else {
      problemas.push('El archivo no es un nivel de «El match con Don Quijote».');
    }
    if (json && json.versionFormato && json.versionFormato > VERSION_FORMATO) {
      problemas.push('El archivo se creó con una versión más nueva del juego (formato ' + json.versionFormato + ').');
    }
    niveles.forEach(function (n, i) {
      if (!n || typeof n !== 'object' || !Array.isArray(n.episodios)) {
        problemas.push('El nivel n.º ' + (i + 1) + ' no tiene una lista «episodios».');
      }
    });
    return { tipo: tipo, niveles: problemas.length ? [] : niveles, problemas: problemas };
  }

  return {
    FORMATO_NIVEL: FORMATO_NIVEL,
    FORMATO_BIBLIOTECA: FORMATO_BIBLIOTECA,
    VERSION_FORMATO: VERSION_FORMATO,
    CONFIG_DEFECTO: CONFIG_DEFECTO,
    LIMITES_TABLERO: LIMITES_TABLERO,
    nuevoId: nuevoId,
    copia: copia,
    normalizarPregunta: normalizarPregunta,
    normalizarEpisodio: normalizarEpisodio,
    normalizarNivel: normalizarNivel,
    nuevoNivel: nuevoNivel,
    desdeMaterialAntiguo: desdeMaterialAntiguo,
    instantanea: instantanea,
    esIncluido: esIncluido,
    editadoLocalmente: editadoLocalmente,
    idLibre: idLibre,
    siguienteIdEpisodio: siguienteIdEpisodio,
    crearEpisodio: crearEpisodio,
    duplicarEpisodio: duplicarEpisodio,
    eliminarEpisodio: eliminarEpisodio,
    renombrarEpisodio: renombrarEpisodio,
    moverPregunta: moverPregunta,
    espacios: espacios,
    enReserva: enReserva,
    asignarEspacio: asignarEspacio,
    intercambiarEspacios: intercambiarEspacios,
    llenarVacios: llenarVacios,
    mezclarTablero: mezclarTablero,
    vaciarTablero: vaciarTablero,
    redimensionar: redimensionar,
    cuantosRetiraria: cuantosRetiraria,
    esImagenGuardada: esImagenGuardada,
    idImagen: idImagen,
    referenciasImagen: referenciasImagen,
    validarNivel: validarNivel,
    paqueteNivel: paqueteNivel,
    paqueteBiblioteca: paqueteBiblioteca,
    leerPaquete: leerPaquete
  };
});
