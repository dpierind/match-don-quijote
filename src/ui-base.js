/*
 * El match con Don Quijote — base de la interfaz.
 * Estado compartido, utilidades, dibujo de pantallas y manejo de eventos.
 * Las pantallas del juego (ui-juego.js) y del editor (ui-editor.js) se registran aquí.
 */
(function () {
  'use strict';

  var Q = window.Quijote = {
    M: window.MotorQuijote,
    N: window.NivelesQuijote,
    Z: window.ZipQuijote,
    T: window.TransferenciaQuijote,
    db: null,
    raiz: document.getElementById('app'),
    ui: { pantalla: 'cargando', modal: null, toast: null, animar: null },
    pantallas: {},      // nombre → función que devuelve HTML
    acciones: {},       // data-accion → función(dataset, elemento)
    capas: [],          // funciones que devuelven HTML de capas superpuestas
    formularios: {},    // data-form → función(form)
    alEscribir: {},     // prefijo de data-campo → función(campo, elemento) en «input»
    alCambiar: {},      // prefijo de data-campo → función(campo, elemento) en «change»
    archivos: {},       // data-archivo → función(File, elemento)
    alEscape: [],       // funciones que devuelven true si cerraron algo
    arrastre: {},       // data-arrastre → { inicio, sobre, soltar }
    imagenes: { urls: new Map(), meta: new Map(), conocidas: new Set(), rotas: new Set(), cargando: new Set() }
  };

  /* ---------- Utilidades ---------- */

  Q.esc = function (s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  Q.copia = function (o) { return JSON.parse(JSON.stringify(o)); };
  Q.tiene = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  Q.nombreParte = function (p) { return Number(p) === 1 ? 'Primera parte' : Number(p) === 2 ? 'Segunda parte' : 'Parte sin indicar'; };
  Q.refCapitulo = function (ep) {
    var cap = ep.capitulo === '' || ep.capitulo === null || ep.capitulo === undefined ? '¿?' : ep.capitulo;
    return Q.nombreParte(ep.parte) + ', cap. ' + Q.esc(cap);
  };
  Q.fecha = function (iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso; }
  };
  Q.hora = function (d) {
    try { return (d || new Date()).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
  };
  Q.tamano = function (bytes) {
    if (!bytes && bytes !== 0) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1).replace('.', ',') + ' MB';
    return (bytes / 1073741824).toFixed(1).replace('.', ',') + ' GB';
  };
  Q.plural = function (n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); };

  Q.preferencias = {
    leer: function (k, def) { try { var v = localStorage.getItem('matchQuijote.pref.' + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } },
    guardar: function (k, v) { try { localStorage.setItem('matchQuijote.pref.' + k, JSON.stringify(v)); } catch (e) { /* preferencia no guardada */ } }
  };

  /* ---------- Mensajes ---------- */

  var temporizadorToast = null;
  Q.toast = function (msg, tipo) {
    Q.ui.toast = { msg: msg, tipo: tipo || '' };
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(function () { Q.ui.toast = null; pintarToast(); }, tipo === 'error' ? 7000 : 4000);
    pintarToast();
  };
  function pintarToast() {
    var viejo = document.getElementById('toast');
    if (viejo) viejo.remove();
    if (!Q.ui.toast) return;
    var d = document.createElement('div');
    d.id = 'toast';
    d.className = 'toast ' + Q.ui.toast.tipo;
    d.setAttribute('role', Q.ui.toast.tipo === 'error' ? 'alert' : 'status');
    d.textContent = Q.ui.toast.msg;
    document.body.appendChild(d);
  }

  // Error previsto, causado por los datos del usuario (no es un fallo del programa).
  Q.fallo = function (mensaje) { var e = new Error(mensaje); e.name = 'ErrorUsuario'; return e; };

  // Muestra el error de una operación con un mensaje comprensible.
  Q.mostrarError = function (e, contexto) {
    var msg = (e && e.message) || 'Ocurrió un error inesperado.';
    if (e && ['ErrorJuego', 'ErrorAlmacen', 'ErrorZip', 'ErrorUsuario'].indexOf(e.name) < 0) console.error(e);
    Q.toast((contexto ? contexto + ': ' : '') + msg, 'error');
  };

  /*
   * Ventana de confirmación dentro de la página (el visor no admite confirm()).
   * op: { titulo, texto, si, peligro, alSi }  o  { titulo, texto, botones: [{ texto, clase, accion }] }
   */
  Q.confirmar = function (op) {
    var botones = op.botones || [{ texto: op.si || 'Aceptar', clase: op.peligro ? 'btn-mal' : 'btn-primario', accion: op.alSi }];
    Q.ui.modal = { titulo: op.titulo, texto: op.texto, html: op.html || '', botones: botones, cancelar: op.cancelar !== false };
  };
  Q.acciones['modal-boton'] = function (d) {
    var m = Q.ui.modal;
    Q.ui.modal = null;
    var b = m && m.botones[Number(d.i)];
    if (b && b.accion) return b.accion();
  };
  Q.acciones['modal-cancelar'] = function () { Q.ui.modal = null; };
  Q.capas.push(function () {
    var m = Q.ui.modal;
    if (!m) return '';
    return '<div class="velo"><div class="panel" role="alertdialog" aria-modal="true" aria-labelledby="t-mod" style="width:min(560px,100%)">' +
      '<h2 id="t-mod">' + Q.esc(m.titulo) + '</h2>' + (m.texto ? '<p>' + Q.esc(m.texto) + '</p>' : '') + m.html +
      '<div class="fila-botones">' + m.botones.map(function (b, i) {
        return '<button class="btn ' + (b.clase || 'btn-primario') + '" data-accion="modal-boton" data-i="' + i + '" data-foco="modal-' + i + '">' + Q.esc(b.texto) + '</button>';
      }).join('') + (m.cancelar ? '<button class="btn" data-accion="modal-cancelar" data-foco="modal-cancelar">Cancelar</button>' : '') + '</div></div></div>';
  });
  Q.alEscape.push(function () { if (Q.ui.modal && Q.ui.modal.cancelar) { Q.ui.modal = null; return true; } return false; });

  /* ---------- Ilustraciones ---------- */

  Q.EMBLEMAS = {
    libro: '<path d="M8 16c8-3 16-3 24 2v34c-8-5-16-5-24-2z"/><path d="M56 16c-8-3-16-3-24 2v34c8-5 16-5 24-2z"/><path d="M13 24h13M13 30h13M13 36h10M38 24h13M38 30h13M38 36h10"/>',
    espada: '<path d="M32 5v6"/><path d="M28 11l4-6 4 6v31h-8z"/><path d="M19 43h26"/><path d="M32 43v11"/><circle cx="32" cy="57" r="3"/>',
    insula: '<path d="M4 47c4-3 8-3 12 0s8 3 12 0 8-3 12 0 8 3 12 0 8-3 8-3"/><path d="M8 55c4-3 8-3 12 0s8 3 12 0 8-3 12 0 8 3 12 0"/><path d="M15 44c5-10 29-10 34 0"/><path d="M34 37V17"/><path d="M34 17c-6-4-12-2-14 3M34 17c6-4 12-2 14 3M34 17c-3-5-9-7-13-5M34 17c3-5 9-7 13-5"/>',
    molino: '<path d="M8 58h48"/><path d="M24 58l3-28h10l3 28z"/><path d="M25 30l7-7 7 7"/><path d="M30 58v-7h4v7"/><circle cx="32" cy="23" r="2"/><path d="M32 23L13 6M32 23L51 6M32 23L11 39M32 23L53 39"/><path d="M17 10l-4 4M21 13l-4 4M47 10l4 4M43 13l4 4M15 35l4 4M19 31l4 4M49 35l-4 4M45 31l-4 4"/>',
    manta: '<path d="M7 45c9 7 41 7 50 0"/><path d="M7 45l-2 7M57 45l2 7"/><circle cx="32" cy="15" r="5"/><path d="M32 20v11M25 25l7-3 7 3M27 38l5-7 5 7"/><path d="M18 18l-4-3M46 18l4-3M20 9l-3-4M44 9l3-4"/>',
    bacia: '<path d="M7 31h50"/><path d="M12 31c0 13 9 21 20 21s20-8 20-21"/><path d="M25 31c0-4 3-7 7-7s7 3 7 7"/><path d="M32 8v8M20 12l4 6M44 12l-4 6"/>',
    cadenas: '<ellipse cx="13" cy="32" rx="9" ry="6"/><ellipse cx="32" cy="32" rx="9" ry="3"/><ellipse cx="51" cy="32" rx="9" ry="6"/><path d="M5 46l7-5M59 18l-7 5M28 46l4-5 4 5"/>',
    flor: '<circle cx="32" cy="20" r="4"/><circle cx="32" cy="11" r="5"/><circle cx="41" cy="18" r="5"/><circle cx="23" cy="18" r="5"/><circle cx="37" cy="28" r="5"/><circle cx="27" cy="28" r="5"/><path d="M32 33v25M32 46c-6-6-12-4-14 0 4 2 10 2 14 0M32 51c6-6 12-4 14 0-4 2-10 2-14 0"/>',
    jaula: '<rect x="10" y="15" width="44" height="39" rx="2"/><path d="M10 15l22-9 22 9"/><circle cx="32" cy="36" r="10"/><path d="M28 34h.5M36 34h.5M29 40c2 1.5 4 1.5 6 0"/><path d="M19 15v39M26 15v39M38 15v39M45 15v39"/>',
    caballo: '<path d="M12 32h30l6-12 7 2-4 10v6H12z"/><path d="M16 38v16M23 38v16M37 38v16M44 38v16"/><path d="M48 20l1-6"/><path d="M6 31l6 3"/><path d="M15 9l2 4 4 1-4 1-2 4-2-4-4-1 4-1zM33 6l1.5 3 3 1-3 1-1.5 3-1.5-3-3-1 3-1z"/>',
    luna: '<path d="M32 5l22 8v16c0 15-10 25-22 30C20 54 10 44 10 29V13z"/><path d="M38 19a12 12 0 1 0 0 22a9.5 9.5 0 1 1 0-22z"/>',
    vela: '<rect x="26" y="27" width="12" height="25"/><path d="M19 52h26l-3 6H22z"/><path d="M32 27v-4"/><path d="M32 23c-5-4-3-11 0-15 3 4 5 11 0 15z"/>'
  };
  Q.NOMBRES_EMBLEMA = {
    libro: 'Libro', espada: 'Espada', insula: 'Ínsula', molino: 'Molino', manta: 'Manta',
    bacia: 'Bacía', cadenas: 'Cadenas', flor: 'Flor', jaula: 'Jaula', caballo: 'Caballo de madera',
    luna: 'Escudo con luna', vela: 'Vela'
  };
  Q.svgEmblema = function (nombre) {
    return '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">' + Q.EMBLEMAS[nombre] + '</svg>';
  };

  /* ---------- Imágenes guardadas (IndexedDB → URL del objeto) ---------- */

  Q.imagenExiste = function (id) { return Q.imagenes.conocidas.has(id) && !Q.imagenes.rotas.has(id); };
  Q.urlImagen = function (id) { return Q.imagenes.urls.get(id) || null; };

  Q.cargarImagenes = async function (ids) {
    var pendientes = ids.filter(function (id) { return id && !Q.imagenes.urls.has(id) && !Q.imagenes.cargando.has(id) && !Q.imagenes.rotas.has(id); });
    if (!pendientes.length || !Q.db) return false;
    pendientes.forEach(function (id) { Q.imagenes.cargando.add(id); });
    await Promise.all(pendientes.map(async function (id) {
      try {
        var reg = await Q.db.obtenerImagen(id);
        if (reg && reg.blob) {
          Q.imagenes.urls.set(id, URL.createObjectURL(reg.blob));
          Q.imagenes.meta.set(id, { nombre: reg.nombre, ancho: reg.ancho, alto: reg.alto, tamano: reg.tamano || reg.blob.size, tipo: reg.tipo });
          Q.imagenes.conocidas.add(id);
        }
        else { Q.imagenes.rotas.add(id); Q.imagenes.conocidas.delete(id); }
      } catch (e) { Q.imagenes.rotas.add(id); }
      Q.imagenes.cargando.delete(id);
    }));
    return true;
  };

  var cargaProgramada = null;
  function pedirCarga(id) {
    if (Q.imagenes.cargando.has(id) || Q.imagenes.rotas.has(id)) return;
    cargaProgramada = cargaProgramada || [];
    cargaProgramada.push(id);
    setTimeout(function () {
      var lote = cargaProgramada; cargaProgramada = null;
      if (lote) Q.cargarImagenes(lote).then(function (hubo) { if (hubo) Q.render(); });
    }, 0);
  }

  // HTML de la ilustración de un episodio. opciones.editor muestra avisos visibles.
  Q.arte = function (ep, opciones) {
    opciones = opciones || {};
    var ref = ep.imagen || '';
    var id = Q.N.idImagen(ref);
    if (id) {
      var url = Q.urlImagen(id);
      if (url) return '<img src="' + url + '" alt="" data-emblema="' + Q.esc(ep.emblema) + '" data-titulo="' + Q.esc(ep.titulo) + '">';
      if (Q.imagenes.rotas.has(id) || (Q.db && !Q.imagenes.conocidas.has(id))) {
        return '<span class="marcador-titulo marcador-roto">' + (opciones.editor ? 'Imagen no encontrada' : Q.esc(ep.titulo)) + '</span>';
      }
      pedirCarga(id);
      return '<span class="marcador-titulo">…</span>';
    }
    if (ref) return '<img src="' + Q.esc(ref) + '" alt="" data-emblema="' + Q.esc(ep.emblema) + '" data-titulo="' + Q.esc(ep.titulo) + '">';
    if (ep.emblema && Q.EMBLEMAS[ep.emblema]) return Q.svgEmblema(ep.emblema);
    return '<span class="marcador-titulo">' + Q.esc(ep.titulo || 'Sin título') + '</span>';
  };

  /* ---------- Archivos para descargar ---------- */

  /*
   * Ofrece un archivo al usuario. En claude.ai usa la capacidad «downloads» (pide confirmación);
   * en un archivo local usa una descarga normal del navegador.
   * Devuelve 'guardado', 'descargado' o 'rechazado'.
   */
  Q.ofrecerArchivo = async function (nombre, bytes, tipo) {
    var blob = new Blob([bytes], { type: tipo || 'application/zip' });
    if (window.claude && typeof window.claude.use === 'function') {
      var descargas = null;
      try { descargas = await window.claude.use('downloads'); } catch (e) { descargas = null; }
      if (descargas) {
        try { await descargas.save({ filename: nombre, data: blob }); return 'guardado'; }
        catch (e) {
          if (e && e.code === 'declined') return 'rechazado';
          if (e && e.code === 'rate_limited') throw Q.fallo('Ya hay una descarga esperando confirmación. Respóndanla e inténtenlo de nuevo.');
          throw Q.fallo('El visor no permitió guardar el archivo (' + ((e && e.code) || 'no disponible') + ').');
        }
      }
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    return 'descargado';
  };

  Q.nombreArchivo = function (texto) {
    var base = String(texto || 'nivel').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60);
    return base || 'nivel';
  };

  /* ---------- Dibujo ---------- */

  Q.render = function () {
    var activo = document.activeElement;
    var foco = activo && activo.dataset ? activo.dataset.foco : null;
    var vista = Q.pantallas[Q.ui.pantalla] || Q.pantallas.menu;
    var html = vista ? vista() : '';
    Q.capas.forEach(function (c) { html += c(); });
    Q.raiz.innerHTML = html;
    Q.ui.animar = null;
    var velo = Q.raiz.querySelector('.velo');
    document.body.style.overflow = velo ? 'hidden' : '';
    var objetivo = foco && Q.raiz.querySelector('[data-foco="' + String(foco).replace(/"/g, '') + '"]');
    if (objetivo && !objetivo.disabled) {
      objetivo.focus({ preventScroll: true });
      if ((objetivo.tagName === 'INPUT' && /^(text|search)$/.test(objetivo.type)) || objetivo.tagName === 'TEXTAREA') {
        try { var l = objetivo.value.length; objetivo.setSelectionRange(l, l); } catch (e) { /* tipo sin selección */ }
      }
    } else if (velo) {
      var primero = velo.querySelector('[data-foco]') || velo.querySelector('button:not(:disabled), input, textarea');
      if (primero && !velo.contains(document.activeElement)) primero.focus({ preventScroll: true });
    }
    if (Q.alDibujar) Q.alDibujar();
  };

  Q.ir = function (pantalla) { Q.ui.pantalla = pantalla; window.scrollTo(0, 0); };

  /* ---------- Eventos ---------- */

  var ultimoClic = { clave: '', t: 0 };
  async function ejecutar(nombre, dataset, el) {
    var f = Q.acciones[nombre];
    if (!f) return;
    if (nombre !== 'modal-boton' && nombre !== 'modal-cancelar') Q.ultimaAccion = { nombre: nombre, dataset: dataset };
    try {
      var r = f(dataset, el);
      if (r && typeof r.then === 'function') { Q.render(); await r; }
    } catch (e) { Q.mostrarError(e); }
    Q.render();
  }
  Q.ejecutar = ejecutar;

  Q.raiz.addEventListener('click', function (e) {
    var b = e.target.closest('[data-accion]');
    if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true') return;
    if (b.tagName === 'A') e.preventDefault();
    // Ignora la repetición del mismo control en menos de 400 ms (dobles clics accidentales).
    var clave = JSON.stringify(b.dataset);
    var ahora = Date.now();
    if (clave === ultimoClic.clave && ahora - ultimoClic.t < 400) return;
    ultimoClic = { clave: clave, t: ahora };
    ejecutar(b.dataset.accion, Object.assign({}, b.dataset), b);
  });

  Q.raiz.addEventListener('submit', function (e) {
    var f = Q.formularios[e.target.dataset.form];
    if (!f) return;
    e.preventDefault();
    Promise.resolve().then(function () { return f(e.target); }).catch(function (err) { Q.mostrarError(err); }).then(Q.render);
  });

  function despachar(tabla, e) {
    var c = e.target.dataset && e.target.dataset.campo;
    if (!c) return false;
    var prefijo = c.split('.')[0];
    if (tabla[prefijo]) { tabla[prefijo](c, e.target); return true; }
    return false;
  }
  Q.valorDe = function (el) { return el.type === 'checkbox' ? el.checked : el.value; };
  Q.raiz.addEventListener('input', function (e) { ultimoClic.clave = ''; despachar(Q.alEscribir, e); });
  Q.raiz.addEventListener('change', function (e) {
    ultimoClic.clave = '';
    if (despachar(Q.alCambiar, e)) return;
    var nombre = e.target.dataset && e.target.dataset.archivo;
    if (nombre && Q.archivos[nombre]) {
      var archivo = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!archivo) return;
      Promise.resolve().then(function () { return Q.archivos[nombre](archivo, e.target); })
        .catch(function (err) { Q.mostrarError(err); }).then(Q.render);
    }
  });

  // Si una imagen con ruta no existe, se reemplaza por el emblema provisional.
  Q.raiz.addEventListener('error', function (e) {
    var img = e.target;
    if (!img || img.tagName !== 'IMG') return;
    var em = img.dataset.emblema;
    var span = document.createElement('span');
    if (em && Q.EMBLEMAS[em]) span.innerHTML = Q.svgEmblema(em);
    else { span.className = 'marcador-titulo marcador-roto'; span.textContent = img.dataset.titulo || 'Imagen no encontrada'; }
    span.title = 'No se pudo cargar la imagen';
    img.replaceWith(span);
  }, true);

  // Arrastrar y soltar: cada elemento indica su tipo con data-arrastre.
  var arrastrando = null;
  function limpiarDestinos() { Q.raiz.querySelectorAll('.destino').forEach(function (x) { x.classList.remove('destino'); }); }
  Q.raiz.addEventListener('dragstart', function (e) {
    var el = e.target.closest && e.target.closest('[data-arrastre][draggable="true"]');
    if (!el) return;
    arrastrando = { tipo: el.dataset.arrastre, datos: Object.assign({}, el.dataset) };
    el.classList.add('arrastrando');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', el.dataset.arrastre); } catch (err) { /* algunos navegadores */ }
  });
  function destinoDe(e) {
    if (!arrastrando) return null;
    var el = e.target.closest && e.target.closest('[data-soltar]');
    if (!el) return null;
    var h = Q.arrastre[el.dataset.soltar];
    if (!h || !h.acepta(arrastrando, Object.assign({}, el.dataset))) return null;
    return { el: el, h: h };
  }
  Q.raiz.addEventListener('dragover', function (e) {
    var d = destinoDe(e);
    if (!d) return;
    e.preventDefault();
    limpiarDestinos();
    d.el.classList.add('destino');
  });
  Q.raiz.addEventListener('drop', function (e) {
    var d = destinoDe(e);
    if (!d) return;
    e.preventDefault();
    var origen = arrastrando;
    arrastrando = null;
    try { d.h.soltar(origen, Object.assign({}, d.el.dataset)); } catch (err) { Q.mostrarError(err); }
    Q.render();
  });
  Q.raiz.addEventListener('dragend', function () {
    arrastrando = null;
    limpiarDestinos();
    Q.raiz.querySelectorAll('.arrastrando').forEach(function (x) { x.classList.remove('arrastrando'); });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    for (var i = 0; i < Q.alEscape.length; i++) if (Q.alEscape[i]()) { Q.render(); return; }
  });

  Q.pantallas.cargando = function () {
    return '<main class="hoja"><p class="lead">Abriendo la biblioteca de niveles…</p></main>';
  };
})();
