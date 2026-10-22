/* Pruebas del motor de reglas. Ejecutar con: node --test tests/ */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../game.js');
const N = require('../niveles.js');

// Carga el material de demostración (asigna window.MATERIAL_QUIJOTE).
const window = {};
new Function('window', fs.readFileSync(path.join(__dirname, '../data/episodes.js'), 'utf8'))(window);
const MATERIAL = () => JSON.parse(JSON.stringify(window.MATERIAL_QUIJOTE));
const NIVEL = () => N.desdeMaterialAntiguo(MATERIAL(), { nombre: 'Demo' });

function rngSemilla(seed) { // mulberry32
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function partida(n = 2, extra = {}) {
  const nombres = ['Ana', 'Benja', 'Cata', 'Diego'].slice(0, n);
  return M.crearPartida({ nivel: NIVEL(), nombres, arbitro: 'Profe', rng: rngSemilla(7), ...extra });
}
const posDe = (s, id) => s.tablero.indexOf(id);
const posIncorrecta = (s, id) => s.tablero.findIndex((x, i) => x && x !== id && M.imagenDisponible(s, i));

function jugarCorrecta(s, aceptar) {
  const id = M.robar(s);
  M.seleccionar(s, posDe(s, id));
  M.confirmarSeleccion(s);
  assert.equal(M.verificarCoincidencia(s, rngSemilla(1)), true);
  M.evaluarRespuesta(s, aceptar, '');
  return id;
}
function jugarIncorrecta(s) {
  const id = M.robar(s);
  M.seleccionar(s, posIncorrecta(s, id));
  M.confirmarSeleccion(s);
  assert.equal(M.verificarCoincidencia(s), false);
  M.cerrarIncorrecta(s);
  return id;
}

test('1. comenzar una partida con dos jugadores', () => {
  const s = partida(2);
  assert.equal(s.jugadores.length, 2);
  assert.equal(s.tablero.length, 30);
  assert.equal(s.tablero.filter(Boolean).length, 12);
  assert.equal(s.mazo.length, 12);
  assert.equal(s.fase, 'juego');
  assert.equal(s.demostracion, true);
});

test('2. comenzar una partida con cuatro jugadores; rechaza 1 y 5 jugadores', () => {
  assert.equal(partida(4).jugadores.length, 4);
  assert.throws(() => M.crearPartida({ nivel: NIVEL(), nombres: ['A'], arbitro: 'P' }), /2 a 4/);
  assert.throws(() => M.crearPartida({ nivel: NIVEL(), nombres: ['A', 'B', 'C', 'D', 'E'], arbitro: 'P' }), /2 a 4/);
  assert.throws(() => M.crearPartida({ nivel: NIVEL(), nombres: ['A', 'B'], arbitro: 'a' }), /árbitro no puede/);
  assert.throws(() => M.crearPartida({ nivel: NIVEL(), nombres: ['A', 'a'], arbitro: 'P' }), /nombres distintos/);
});

test('3. robar una descripción y seleccionar (y cambiar) una imagen', () => {
  const s = partida();
  const id = M.robar(s);
  assert.equal(s.jugada.descripcionId, id);
  assert.equal(s.mazo.length, 11);
  M.seleccionar(s, posIncorrecta(s, id));
  M.seleccionar(s, posDe(s, id)); // cambio de selección antes de confirmar
  assert.equal(s.jugada.seleccion, posDe(s, id));
  assert.throws(() => M.robar(s), /jugada pendiente/);
  const vacia = s.tablero.indexOf(null);
  assert.throws(() => M.seleccionar(s, vacia), /vacía/);
});

test('4. combinación incorrecta: la imagen vuelve, la descripción va al fondo y pasa el turno', () => {
  const s = partida();
  const id = jugarIncorrecta(s);
  assert.equal(s.mazo[s.mazo.length - 1], id);
  assert.equal(s.mazo.length, 12);
  assert.equal(s.activo, 1);
  assert.equal(s.turno, 2);
  assert.equal(s.jugadores[0].piezas.length, 0);
  assert.equal(s.historial[0].resultado, 'combinacion_incorrecta');
  assert.equal(Object.keys(s.ganadas).length, 0);
});

test('5. combinación correcta y respuesta rechazada: no hay pieza', () => {
  const s = partida();
  const id = jugarCorrecta(s, false);
  assert.equal(s.jugadores[0].piezas.length, 0);
  assert.equal(s.mazo[s.mazo.length - 1], id);
  assert.ok(M.imagenDisponible(s, posDe(s, id)));
  assert.equal(s.historial[0].resultado, 'respuesta_rechazada');
});

test('6. combinación y respuesta aceptadas: la pieza se conserva con su metadato', () => {
  const s = partida();
  const id = jugarCorrecta(s, true);
  assert.deepEqual(s.jugadores[0].piezas, [id]);
  assert.equal(s.ganadas[id], 0);
  assert.equal(s.mazo.includes(id), false);
  assert.equal(typeof s.episodios[id].ordenCronologico, 'number');
  assert.equal(typeof s.episodios[id].capitulo, 'number');
});

test('7. los turnos se alternan entre cuatro jugadores', () => {
  const s = partida(4);
  const vistos = [];
  for (let i = 0; i < 6; i++) { vistos.push(s.activo); jugarIncorrecta(s); }
  assert.deepEqual(vistos, [0, 1, 2, 3, 0, 1]);
  assert.equal(s.turno, 7);
});

test('8. no se puede usar una imagen ya ganada', () => {
  const s = partida();
  const ganada = jugarCorrecta(s, true);
  M.robar(s);
  assert.throws(() => M.seleccionar(s, posDe(s, ganada)), /ya la ganó Ana/);
});

test('9. la partida termina al agotar las descripciones', () => {
  const s = partida(3);
  let vueltas = 0;
  while (s.fase === 'juego' && vueltas++ < 200) {
    if (vueltas % 3 === 0) jugarIncorrecta(s); else jugarCorrecta(s, vueltas % 4 !== 0);
  }
  assert.equal(s.fase, 'transicion');
  assert.equal(s.mazo.length, 0);
  assert.equal(s.jugada, null);
  const total = s.jugadores.reduce((a, j) => a + j.piezas.length, 0);
  assert.equal(total, 12);
  assert.throws(() => M.robar(s), /fase de juego/);
});

test('10. ordenar piezas y calcular la puntuación cronológica', () => {
  const s = partida(2);
  while (s.fase === 'juego') jugarCorrecta(s, true);
  M.iniciarCronologia(s, rngSemilla(3));
  const [ana, benja] = s.jugadores;
  // Nadie recibe el orden correcto de regalo.
  assert.notDeepEqual(ana.orden, M.ordenCorrecto(s, ana.piezas));
  // Ana ordena todo bien con movimientos; Benja deja su orden inicial.
  const objetivo = M.ordenCorrecto(s, ana.piezas);
  objetivo.forEach((id, destino) => M.moverPieza(s, 0, ana.orden.indexOf(id), destino));
  assert.deepEqual(ana.orden, objetivo);
  assert.throws(() => M.pasarAValidacion(s), /Falta que confirme/);
  M.confirmarOrden(s, 0);
  assert.throws(() => M.moverPieza(s, 0, 0, 1), /ya confirmó/);
  M.confirmarOrden(s, 1);
  M.pasarAValidacion(s);
  const r = M.validarSecuencias(s);
  const fila = r.tabla.find(t => t.nombre === 'Ana');
  assert.equal(fila.correctas, ana.piezas.length);
  const filaB = r.tabla.find(t => t.nombre === 'Benja');
  const esperado = benja.orden.filter((id, i) => id === M.ordenCorrecto(s, benja.piezas)[i]).length;
  assert.equal(filaB.correctas, esperado);
  assert.deepEqual(r.ganadores, ['Ana']);
  assert.equal(r.empate, false);
  assert.equal(r.secuencia.length, 12);
});

test('10b. puntuación por posición vs. subsecuencia', () => {
  const s = partida();
  const ids = M.ordenCorrecto(s, Object.keys(s.episodios)).slice(0, 4); // a b c d
  const desplazado = [ids[3], ids[0], ids[1], ids[2]];                    // d a b c
  assert.equal(M.puntuar(s, desplazado, 'posicion').correctas, 0);
  assert.equal(M.puntuar(s, desplazado, 'subsecuencia').correctas, 3);
});

test('11. empate: se declara sin regla de desempate', () => {
  const s = partida(2);
  // Ambos ganan 0 piezas: fin anticipado sin jugadas.
  M.terminarAnticipado(s);
  M.iniciarCronologia(s);
  assert.equal(M.todosConfirmados(s), true);
  M.pasarAValidacion(s);
  const r = M.validarSecuencias(s);
  assert.equal(r.empate, true);
  assert.deepEqual(r.ganadores, ['Ana', 'Benja']);
});

test('11b. empate con piezas', () => {
  const s = partida(2);
  jugarCorrecta(s, true); jugarCorrecta(s, true); // una pieza cada uno
  M.terminarAnticipado(s);
  M.iniciarCronologia(s);
  M.confirmarOrden(s, 0); M.confirmarOrden(s, 1);
  M.pasarAValidacion(s);
  const r = M.validarSecuencias(s);
  assert.equal(r.tabla[0].correctas, 1);
  assert.equal(r.tabla[1].correctas, 1);
  assert.equal(r.empate, true);
});

test('12. reiniciar: una partida nueva parte desde cero', () => {
  const s = partida();
  jugarCorrecta(s, true);
  const nueva = partida();
  assert.equal(nueva.turno, 1);
  assert.equal(nueva.jugadores[0].piezas.length, 0);
  assert.equal(Object.keys(nueva.ganadas).length, 0);
  assert.equal(nueva.mazo.length, 12);
});

test('13. datos incompletos: errores bloquean, avisos no', () => {
  const n = NIVEL();
  n.episodios[1].id = 'ep-01';                 // id duplicado
  n.episodios[2].descripcion = '';             // descripción vacía
  n.episodios[3].ordenCronologico = 1;         // orden repetido
  n.episodios[4].preguntas = [];               // aviso
  n.episodios[5].emblema = '';                 // aviso
  n.episodios[6].capitulo = '';                // capítulo ausente
  n.episodios[7].imagen = 'img:no-existe';     // referencia rota
  const v = N.validarNivel(n, { imagenExiste: () => false });
  assert.equal(v.puedeJugar, false);
  assert.ok(v.errores.some(e => /repetido/.test(e) && /ep-01/.test(e)));
  assert.ok(v.errores.some(e => /descripción está vacía/.test(e)));
  assert.ok(v.errores.some(e => /orden cronológico 1 está repetido/.test(e)));
  assert.ok(v.errores.some(e => /número de capítulo/.test(e)));
  assert.ok(v.errores.some(e => /referencia rota/.test(e)));
  assert.ok(v.avisos.some(e => /no tiene preguntas/.test(e)));
  assert.ok(v.avisos.some(e => /marcador provisional/.test(e)));
  assert.ok(v.avisos.some(e => /respuesta de referencia/.test(e)));
  assert.equal(v.conteos.imagenesRotas, 1);
  assert.equal(v.conteos.descripcionesVacias, 1);
  assert.throws(() => M.crearPartida({ nivel: n, nombres: ['A', 'B'], arbitro: 'P', imagenExiste: () => false }), /tiene errores/);
  // Formato exigido: 30 imágenes
  const exacto = NIVEL(); exacto.config.exigirCompleto = true;
  const ve = N.validarNivel(exacto);
  assert.equal(ve.cumpleFormato, false);
  assert.ok(ve.errores[0].includes('exige 30 imágenes'));
  // Un episodio sin preguntas sigue siendo jugable: el árbitro decide sin pregunta.
  const sinPreg = NIVEL();
  sinPreg.episodios.forEach(e => { e.preguntas = []; });
  const s = M.crearPartida({ nivel: sinPreg, nombres: ['A', 'B'], arbitro: 'P' });
  const id = M.robar(s); M.seleccionar(s, s.tablero.indexOf(id)); M.confirmarSeleccion(s);
  M.verificarCoincidencia(s);
  assert.equal(s.jugada.preguntaIdx, null);
  M.evaluarRespuesta(s, true);
  assert.equal(s.jugadores[0].piezas.length, 1);
});

test('14. no se puede saltar una fase con acciones pendientes', () => {
  const s = partida();
  assert.throws(() => M.confirmarSeleccion(s), /robar una descripción/);
  assert.throws(() => M.verificarCoincidencia(s), /robar una descripción/);
  M.robar(s);
  assert.throws(() => M.confirmarSeleccion(s), /Elijan una imagen/);
  assert.throws(() => M.verificarCoincidencia(s), /elegir y confirmar/);
  M.seleccionar(s, posDe(s, s.jugada.descripcionId));
  M.confirmarSeleccion(s);
  assert.throws(() => M.seleccionar(s, 0), /ya fue confirmada/);
  assert.throws(() => M.evaluarRespuesta(s, true), /coincidencia correcta/);
  assert.throws(() => M.terminarAnticipado(s), /jugada pendiente/);
  assert.throws(() => M.iniciarCronologia(s), /pausa antes/);
  M.verificarCoincidencia(s);
  assert.throws(() => M.cerrarIncorrecta(s), /devolución/);
  assert.throws(() => M.evaluarRespuesta(s, 'sí'), /Respuesta aceptada/);
  assert.equal(s.activo, 0, 'el turno no avanza mientras la jugada está pendiente');
  M.evaluarRespuesta(s, true, 'Buena respuesta');
  assert.equal(s.activo, 1);
  assert.equal(s.historial[0].observacion, 'Buena respuesta');
});

test('15. el estado se puede guardar y recuperar (JSON)', () => {
  const s = partida();
  jugarCorrecta(s, true);
  const copia = JSON.parse(JSON.stringify(s));
  M.robar(copia);
  assert.equal(copia.jugada.etapa, 'seleccion');
});

test('16. la partida usa una instantánea: cambiar el nivel después no la altera', () => {
  const nivel = NIVEL();
  const s = M.crearPartida({ nivel, nombres: ['A', 'B'], arbitro: 'P' });
  nivel.episodios[0].titulo = 'Cambiado en el editor';
  nivel.episodios[0].preguntas = [];
  assert.equal(s.episodios['ep-01'].titulo, 'El hidalgo que se hace caballero andante');
  assert.equal(s.episodios['ep-01'].preguntas.length, 2);
  assert.equal(s.nivel.nombre, 'Demo');
});

test('17. episodios en la reserva no participan; tablero de otro tamaño', () => {
  const n = NIVEL();
  N.redimensionar(n, 4, 2);                 // 8 espacios: 4 episodios a la reserva
  n.config.exigirCompleto = true;
  const s = M.crearPartida({ nivel: n, nombres: ['A', 'B'], arbitro: 'P' });
  assert.equal(s.tablero.length, 8);
  assert.equal(s.mazo.length, 8);
  assert.equal(s.columnas, 4);
});

test('18. describir el estado de una partida guardada con jugada pendiente', () => {
  const s = partida();
  M.robar(s);
  M.seleccionar(s, posDe(s, s.jugada.descripcionId));
  M.confirmarSeleccion(s);
  const d = M.describirEstado(JSON.parse(JSON.stringify(s)));
  assert.match(d.pendiente, /falta que el árbitro compruebe/);
});

test('19. migrar una partida de la primera versión', () => {
  const vieja = partida();
  vieja.version = 1; delete vieja.nivel; delete vieja.columnas;
  Object.values(vieja.episodios).forEach(e => { e.preguntas = e.preguntas.map(p => p.texto); });
  const m = M.migrarPartida(vieja);
  assert.equal(m.version, 2);
  assert.equal(typeof Object.values(m.episodios)[0].preguntas[0].texto, 'string');
});
