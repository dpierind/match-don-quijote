# Decisiones pendientes del grupo

Mientras el grupo no decida, se usa la interpretación provisional más fiel a las instrucciones
originales. Las marcadas como **configurables** se cambian por nivel en
*Editor de niveles → Configuración*, sin tocar código.

Cuando el grupo tome una decisión, anótenla aquí con la fecha y quiten la duda de la lista.

## Decisiones tomadas

- **2026-10-22 · Niveles compartidos.** Los niveles se guardan en un servidor (Cloudflare Pages + D1) y
  los ve todo el que abre el juego. **Todos pueden crear y modificar niveles** (el grupo es de tres
  personas y se crearán niveles en vivo durante la demostración). **Los cambios no necesitan
  aprobación.** Se acepta que **las respuestas de referencia sean legibles por todos**, porque se
  juega en el mismo dispositivo. La clave del grupo es opcional y se recomienda porque el enlace se
  comparte por WhatsApp.

## Afectan a cómo se gana

| # | Decisión | Interpretación provisional | Dónde se cambia |
|---|---|---|---|
| 1 | Cómo se puntúa una pieza en posición incorrecta dentro de una secuencia parcialmente correcta | Cuenta solo si queda en la misma posición que tendría en el orden correcto de las piezas de ese jugador (`posicion`). Alternativa: la secuencia más larga en orden (`subsecuencia`). Ejemplo: con el orden D-A-B-C, la primera regla da 0 puntos y la segunda da 3 | **Configurable**: `config.puntuacion` |
| 2 | Qué pasa si el mazo nunca se agota (las descripciones rechazadas vuelven al mazo) | El árbitro puede cerrar la fase de juego cuando no hay jugada pendiente | **Configurable**: `config.permitirFinAnticipado` |
| 3 | El orden cronológico ¿es por número de capítulo, por parte y capítulo, o por el momento del acontecimiento? | Se usa el campo `ordenCronologico` de cada episodio, que el grupo define | Datos de cada episodio |

## Pueden quedar como opciones

| # | Decisión | Interpretación provisional | Dónde se cambia |
|---|---|---|---|
| 4 | ¿Pregunta fija o al azar entre las del episodio? | Al azar; el árbitro puede pasar a otra | **Configurable**: `config.seleccionPregunta` |
| 5 | ¿Las piezas ganadas dejan espacios vacíos en el tablero? | Siguen visibles, atenuadas y con el nombre de quien las ganó | Código (`ui-juego.js`, `vCasilla`) |
| 6 | ¿Exactamente 30 parejas de imagen y descripción? | Formato 6 × 5 exigido por defecto; un nivel puede cambiarlo | **Configurable**: `columnas`, `filas`, `exigirCompleto` |
| 7 | ¿Las descripciones devueltas pueden volver a salir? | Sí: vuelven al final del mazo | Regla original; no cambiar sin decisión del grupo |
| 8 | ¿Qué pasa si el mazo se agota con una jugada pendiente? | No puede ocurrir: la carta pendiente está fuera del mazo y la fase termina al resolverla | — |
| 9 | Criterios concretos para aceptar una respuesta «completa y coherente» | El árbitro decide. Cada pregunta admite un criterio de evaluación y una respuesta de referencia | Datos de cada pregunta |
| 10 | ¿Variante sin árbitro? | No existe. La versión oficial siempre tiene árbitro | Requeriría una decisión del grupo |
| 11 | Edición de *Don Quijote* de referencia | No definida | `config.edicionReferencia` de cada nivel |

## Material pendiente

- Los 30 episodios definitivos, con capítulos verificados en la edición de referencia.
- Las imágenes: de dominio público con procedencia verificada, o dibujos propios.
- Revisar los 12 episodios de demostración (`src/data/episodes.js`). Uno tiene a propósito una
  pregunta sin respuesta de referencia, para probar el aviso al árbitro.
- Marcar el nivel definitivo como «Aprobado por el grupo».
