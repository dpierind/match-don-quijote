/*
 * El match con Don Quijote — arranque.
 * Abre el almacenamiento local y busca el servidor del juego (api/estado). Si lo encuentra, los
 * niveles e imágenes se comparten con todos (modo compartido, src/remoto.js); si no, todo queda
 * en este navegador como antes. Después migra los datos de la primera versión, instala o actualiza los
 * niveles incluidos en el juego (src/niveles/), crea el nivel de demostración si la biblioteca
 * queda vacía y limpia imágenes que nadie usa.
 */
(async function () {
  'use strict';
  var Q = window.Quijote, N = Q.N, M = Q.M;
  Q.render();

  Q.dbLocal = await window.AlmacenQuijote.abrir();
  Q.db = Q.dbLocal;
  var deteccion = await window.RemotoQuijote.detectar({ protocolo: location.protocol });
  Q.deteccion = deteccion;
  if (deteccion.estado) {
    Q.servidor = deteccion.estado;
    Q.db = window.RemotoQuijote.crear({ local: Q.dbLocal, clave: Q.claveGrupo });
  } else if (deteccion.error) {
    Q.servidorError = deteccion.error;
  }

  // Migración de la primera versión (material y partida en localStorage).
  try {
    var viejoMaterial = localStorage.getItem('matchQuijote.material.v1');
    if (viejoMaterial) {
      var nivelViejo = N.desdeMaterialAntiguo(JSON.parse(viejoMaterial), { nombre: 'Material editado en la primera versión' });
      await Q.dbLocal.guardarNivel(nivelViejo);
      localStorage.removeItem('matchQuijote.material.v1');
    }
    var viejaPartida = localStorage.getItem('matchQuijote.partida.v1');
    if (viejaPartida) {
      var s = M.migrarPartida(JSON.parse(viejaPartida));
      if (s) {
        await Q.dbLocal.guardarPartida({
          id: s.id, nivelId: null, nivelNombre: s.nivel.nombre, nivelVersion: 0,
          jugadores: s.jugadores.map(function (j) { return j.nombre; }), arbitro: s.arbitro,
          fase: s.fase, terminada: s.fase === 'resultados', creada: s.creada, guardada: new Date().toISOString(), estado: s
        });
      }
      localStorage.removeItem('matchQuijote.partida.v1');
    }
  } catch (e) { console.warn('No se pudieron migrar los datos de la primera versión', e); }

  // Niveles incluidos en el juego (src/niveles/). El índice se carga siempre fresco para
  // recibir las actualizaciones publicadas; cada nivel se descarga solo si cambió.
  var incluidos = [];
  try {
    await cargarScript('niveles/indice.js?t=' + Date.now());
    incluidos = Array.isArray(window.NIVELES_INCLUIDOS) ? window.NIVELES_INCLUIDOS : [];
  } catch (e) { console.warn('No se encontró niveles/indice.js; no hay niveles incluidos.'); }
  if (incluidos.length) {
    try {
      var inf = await window.SincronizarQuijote.sincronizar({
        db: Q.db,
        indice: incluidos,
        cargarDatos: async function (entrada) {
          await cargarScript(entrada.archivo + '?h=' + encodeURIComponent(entrada.huella));
          return (window.NIVELES_INCLUIDOS_DATOS || {})[entrada.id];
        }
      });
      var avisos = [];
      if (inf.instalados.length) avisos.push((inf.instalados.length === 1 ? 'Nivel nuevo: ' : 'Niveles nuevos: ') + inf.instalados.join(', ') + '.');
      if (inf.actualizados.length) avisos.push((inf.actualizados.length === 1 ? 'Nivel actualizado: ' : 'Niveles actualizados: ') + inf.actualizados.join(', ') + '.');
      inf.conservados.forEach(function (c) { avisos.push('Sus cambios en «' + c.nombre + '» se guardaron como «' + c.copia + '».'); });
      if (inf.errores.length) Q.toast('No se pudieron instalar algunos niveles incluidos: ' + inf.errores.join(' · '), 'error');
      else if (avisos.length) setTimeout(function () { Q.toast(avisos.join(' ')); }, 300);
    } catch (e) { Q.mostrarError(e, 'No se pudieron instalar los niveles incluidos'); }
  }

  // Nivel de demostración, solo si la biblioteca está vacía y el juego no trae niveles propios.
  try {
    var niveles = await Q.db.listarNiveles();
    if (!niveles.length && !incluidos.length && window.MATERIAL_QUIJOTE) {
      var demo = N.desdeMaterialAntiguo(JSON.parse(JSON.stringify(window.MATERIAL_QUIJOTE)), {
        nombre: 'Demostración · 12 episodios provisionales',
        descripcion: 'Episodios de ejemplo para probar el juego. No es el material aprobado por el grupo. El tablero admite jugar con espacios vacíos.'
      });
      // Identificador fijo: si dos personas abren el juego a la vez, el servidor crea uno solo.
      demo.id = 'nivel-demostracion';
      try { await Q.db.guardarNivel(demo, { soloNuevo: true }); }
      catch (e) { if (e.codigo !== 'existe' && !(Q.compartido() && e.codigo === 'clave')) throw e; }
    }
    await Q.dbLocal.limpiarHuerfanas([]);
    if (!Q.compartido()) (await Q.db.idsImagenes()).forEach(function (id) { Q.imagenes.conocidas.add(id); });
  } catch (e) { Q.mostrarError(e, 'No se pudo preparar la biblioteca'); }

  await Q.cargarListas();
  Q.ir('menu');
  Q.render();
  if (Q.iniciarRefresco) Q.iniciarRefresco();

  function cargarScript(src) {
    return new Promise(function (resolver, rechazar) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolver(); };
      s.onerror = function () { s.remove(); rechazar(new Error('No se pudo cargar ' + src.split('?')[0])); };
      document.head.appendChild(s);
    });
  }
})();
