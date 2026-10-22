# El match con Don Quijote

Juego de cartas educativo para 2 a 4 jugadores y un árbitro, en un mismo computador,
con un **editor de niveles** para preparar el material de las cartas.

## 1. Ejecutar la aplicación

1. Abran `src/index.html` con doble clic en **Chrome, Edge o Firefox**.
   No necesita servidor ni internet. Sin conexión, los títulos usan una tipografía de respaldo.
2. Usen siempre **el mismo navegador y la misma carpeta**: los datos se guardan en ese navegador.
3. Si el navegador no permite guardar (por ejemplo, una ventana privada, o Safari al abrir archivos
   locales), la aplicación muestra un aviso rojo. En ese caso funciona, pero todo se pierde al cerrar.
   Alternativa: abrir la carpeta con un servidor local, por ejemplo
   `python3 -m http.server 8000 --directory src`, y entrar en `http://localhost:8000`.

## 2. Crear y editar niveles

Menú principal → **Editor de niveles** → **Nuevo nivel** (nombre y descripción).

El editor tiene cinco secciones:

- **Episodios y cartas.** Lista con búsqueda (por título o número de capítulo), filtro por parte
  y orden por capítulo o por orden cronológico. Cada episodio muestra si está completo o qué le falta.
  - **Nuevo episodio** crea una carta vacía.
  - **Duplicar** crea una copia con un identificador nuevo. La copia queda en la reserva y con el
    orden cronológico vacío, para que lo revisen.
  - **Eliminar** pide confirmación.
- **Preguntas.** Por episodio pueden:
  - añadir varias preguntas, editarlas, reordenarlas con ▲ ▼ y eliminarlas;
  - escribir para cada una la respuesta de referencia (privada para el árbitro) y un criterio de evaluación;
  - escribir notas privadas del episodio.
- **Tablero.** Vista previa de los 30 espacios (6 × 5). Toquen un espacio y luego otro para
  intercambiarlos, o arrástrenlos. Desde la reserva se colocan episodios con «Colocar» o arrastrando.
  - Solo los episodios del tablero participan en la partida.
  - El número del espacio no es el identificador del episodio.
  - Mover cartas no cambia el orden cronológico.
- **Configuración.**
  - Nombre, descripción, estado (provisional o aprobado) y edición de referencia.
  - Formato del tablero: columnas, filas y si se exige llenarlo entero.
  - Reglas: pregunta al azar o la primera, tipo de puntuación, fin anticipado y mezclar posiciones.
  - Guardado automático.
- **Importar y exportar.** Ver la sección 4.

**Guardado.** El indicador de la barra superior muestra «Guardado», «Cambios sin guardar»,
«Guardando…», «Error al guardar» o «Conflicto».
- Con el guardado automático activo, los cambios se guardan unos segundos después de editar.
- El botón **Guardar** guarda al instante.
- **Guardar como copia** crea un nivel independiente y deja el original como estaba.
- Si otra pestaña guardó el mismo nivel antes, el editor no sobrescribe: ofrece guardar los
  cambios como copia, recargar la otra versión o sobrescribirla tras confirmar.

## 3. Imágenes y preguntas

- En **Episodios y cartas** → «Imagen del episodio» → **Subir imagen** (PNG, JPEG o WebP).
  - Se ve una vista previa.
  - **Cambiar imagen** la reemplaza sin tocar la descripción ni las preguntas.
  - **Quitar imagen** la elimina del episodio.
- Las imágenes se guardan en el navegador (IndexedDB), no como rutas temporales.
  Las de más de 1600 px se reducen para ahorrar espacio.
- Si una imagen falta o no se puede cargar, el episodio muestra el aviso «Imagen no encontrada».
  El informe del nivel la cuenta como referencia rota.
- Sin imagen, se puede elegir un **emblema provisional** (molino, bacía, jaula…).

## 4. Guardar, exportar e importar niveles

- **Exportar nivel** (biblioteca o sección *Importar y exportar*) crea un `.zip` con:
  - `nivel.json`, con todos los datos del nivel;
  - `imagenes/`, con las imágenes reales;
  - `LEEME.txt`.

  `nivel.json` nombra cada imagen con su ruta relativa dentro de `imagenes/`.
- **Copia de seguridad de la biblioteca**: un solo `.zip` con todos los niveles y sus imágenes.
- **Importar nivel o copia** acepta esos `.zip`, o un `.json` suelto (sin imágenes; se avisa).
  - Antes de guardar se muestra un informe: estructura, identificadores duplicados, imágenes
    incluidas o faltantes y campos obligatorios ausentes.
  - Si el nivel ya existe, se puede importar como nivel nuevo o reemplazarlo; reemplazar exige
    pulsar un botón explícito.

## 5. Jugar, guardar y recuperar partidas

- Menú → **Jugar** → elijan un nivel → **informe de validación**.
  - El informe cuenta imágenes, descripciones, episodios sin preguntas o sin imagen,
    identificadores duplicados, capítulos ausentes, referencias rotas y si se cumple el formato.
  - Los errores impiden empezar; las advertencias no.
- Al preparar la partida se usa la **última versión guardada** del nivel, se hace una instantánea
  independiente y se barajan las descripciones. Editar el nivel después no afecta a esa partida.
- La partida se guarda sola después de cada jugada. **Guardar partida** confirma el guardado.
  Pueden salir en cualquier momento, incluso con una jugada pendiente: queda registrada y se
  retoma exactamente en ese punto.
- **Continuar partida** (menú) o **Partidas guardadas**:
  - muestran el nivel y su versión, los jugadores en orden y el estado en que quedó;
  - piden confirmación antes de reanudar;
  - permiten **Eliminar** una partida guardada, con confirmación.

## 6. Límites del guardado

Los datos viven solo en este navegador y en este computador. Se pierden si:
- se borran los datos de navegación;
- usan una ventana privada;
- cambian de equipo o de navegador.

El navegador también puede borrarlos si se queda sin espacio. En la biblioteca pueden pedirle que
los conserve, pero no siempre acepta. Para conservarlos de verdad, exporten los niveles o una
copia de seguridad.

## 7. Archivos

Todo el código está en `src/`. En la raíz solo queda este README.

| Archivo | Contenido |
|---|---|
| `src/index.html`, `src/styles.css` | Estructura y diseño |
| `src/niveles.js` | Modelo de nivel, validación, duplicado, tablero, paquetes de exportación |
| `src/game.js` | Reglas, turnos, árbitro, cronología y puntuación (trabaja sobre una instantánea) |
| `src/zip.js` | Lectura y escritura de ZIP sin dependencias |
| `src/db.js` | Almacenamiento en IndexedDB: niveles, imágenes, partidas, conflictos, espacio |
| `src/transferencia.js` | Exportación e importación de niveles y copias de seguridad |
| `src/ui-base.js`, `src/ui-juego.js`, `src/ui-editor.js`, `src/app.js` | Interfaz y arranque |
| `src/sincronizar.js` | Instala y actualiza los niveles incluidos en el juego |
| `src/niveles/` | Niveles incluidos en el juego (los genera `npm run incluir`) |
| `src/data/episodes.js` | Material de demostración (12 episodios provisionales) para el primer nivel |
| `src/assets/` | Carpeta para ilustraciones con ruta fija (opcional) |
| `src/tests/` | Pruebas automáticas |

## 8. Pruebas

- Motor, modelo, ZIP, almacenamiento y niveles incluidos: `npm test`
- Interfaz completa en Chromium, cerrando y reabriendo el navegador:
  `npm run test:e2e` (requiere `pip install playwright` y `playwright install chromium`).

## 9. Publicar el juego y compartir niveles por un enlace

El juego se puede publicar gratis en GitHub Pages, con un enlace fijo para mandar por WhatsApp. Los
niveles aprobados viajan dentro del juego (`src/niveles/`): quien abre el enlace los recibe y se
actualizan solos cuando publican una versión nueva.

Ciclo de cada actualización:

```
npm run incluir -- ~/Downloads/nivel-exportado.zip
git add src/niveles && git commit -m "Nivel …" && git push
```

La guía detallada, paso a paso, está en [`docs/publicar-niveles.md`](docs/publicar-niveles.md).

## 10. Trabajar con un agente de programación

La raíz del repositorio está preparada para trabajar con un agente como Claude Code:

| Archivo | Para qué sirve |
|---|---|
| `AGENTS.md` | Guía principal para cualquier agente: comandos, mapa del código, restricciones técnicas, invariantes del juego, reglas sobre el contenido literario y forma de trabajar |
| `CLAUDE.md` | Carga `AGENTS.md` en Claude Code y describe sus herramientas propias |
| `.claude/settings.json` | Permisos: las pruebas y la validación se ejecutan sin preguntar; instalar paquetes, `git commit` y `git push` piden confirmación |
| `.claude/skills/probar` | `/probar`: ejecuta las pruebas que corresponden al cambio e informa el resultado real |
| `.claude/skills/revisar-material` | `/revisar-material`: valida un nivel y señala dudas literarias sin inventar contenido |
| `.claude/skills/cambiar-regla` | `/cambiar-regla`: procedimiento para modificar o añadir una regla del juego |
| `.claude/agents/revisor-reglas.md` | Subagente que revisa un cambio contra los invariantes del juego |
| `docs/arquitectura.md` | Cómo se conectan los módulos, el ciclo de una acción, la partida, el editor y las imágenes |
| `docs/formato-nivel.md` | Esquema del nivel, de la configuración, del ZIP exportado y de las partidas guardadas |
| `docs/decisiones-pendientes.md` | Reglas que el grupo aún debe decidir y dónde se cambia cada una |
| `docs/publicar-niveles.md` | Guía para publicar el juego en GitHub Pages e incluir niveles |
| `package.json` | Comandos: `npm test`, `npm run test:e2e`, `npm run validar -- <archivo>`, `npm run incluir -- <archivo>` y `npm run servir`. No tiene dependencias |
| `src/tools/validar-nivel.js` | Informe de validación de un nivel desde la terminal (también en `--json`) |
| `src/tools/incluir-nivel.js` | Incluye niveles exportados en el juego publicado |
| `.github/workflows/publicar.yml` | Prueba y publica el juego en GitHub Pages en cada `push` |

Para empezar, abran Claude Code en la raíz de la carpeta. Lee `CLAUDE.md` automáticamente.
