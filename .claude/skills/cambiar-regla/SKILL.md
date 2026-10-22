---
name: cambiar-regla
description: Procedimiento para modificar o añadir una regla del juego de El match con Don Quijote (turnos, árbitro, preguntas, puntuación, tablero) sin romper los invariantes ni cambiar reglas en silencio.
---

# Cambiar o añadir una regla del juego

1. **Ubica la regla.**
   - Lee `docs/decisiones-pendientes.md` y la sección «Invariantes del juego» de `AGENTS.md`.
   - Si la regla ya es una opción de `nivel.config`, puede bastar con cambiar la configuración del
     nivel en el editor, sin tocar código. Díselo al usuario.
2. **Comprueba contradicciones.** Si el cambio contradice un invariante o una regla original del
   grupo, explica el conflicto y **pregunta antes de implementar**. Ejemplos:
   - que el programa evalúe respuestas;
   - mostrar la respuesta de referencia a los jugadores;
   - desempatar automáticamente.
3. **Implementa como opción del nivel**, con un valor por defecto que mantenga el comportamiento
   actual, salvo que el grupo haya decidido otra cosa:
   - `src/niveles.js`: añade el campo a `CONFIG_DEFECTO` y valídalo en `normalizarConfig`.
   - `src/game.js`: copia la opción a `partida.reglas` en `crearPartida` y aplícala en la función
     del motor que corresponda. La partida debe usar su copia, nunca leer el nivel.
   - `src/ui-editor.js`, `vConfiguracion`: añade el control en «Reglas de la partida».
   - `src/ui-juego.js`, `Q.reglasContenido`: describe la regla para los jugadores.
4. **Pruebas.** En `src/tests/motor.test.js`, una prueba por cada valor de la opción, más un caso
   límite. Ejecuta `/probar`.
5. **Compatibilidad.** Las partidas guardadas antiguas no tienen la opción nueva: que el motor use el
   valor por defecto cuando falte. Si el cambio altera el formato guardado, actualiza `migrarPartida`.
6. **Documentación.**
   - Actualiza `docs/decisiones-pendientes.md` (con fecha si el grupo decidió) y la tabla de
     configuración de `docs/formato-nivel.md`.
   - Si cambia el uso, actualiza `README.md`.
7. Pide al subagente `revisor-reglas` que revise el cambio antes de darlo por terminado.
