# El match con Don Quijote — guía para agentes

Instrucciones para cualquier agente de programación que trabaje en este repositorio
(Claude Code las carga desde `CLAUDE.md`). Léelas completas antes de cambiar código.

## Qué es

Juego de cartas educativo para la asignatura de Lenguaje, sobre *Don Quijote de la Mancha*.
Se juega en un solo computador: de 2 a 4 jugadores y un árbitro humano. Los jugadores asocian
imágenes con descripciones de episodios. El árbitro hace una pregunta sobre el episodio y acepta o
rechaza la respuesta oral. Al final, cada jugador ordena sus piezas por capítulo.

Incluye un **editor de niveles**. Cada nivel reúne:
- episodios, con sus imágenes y preguntas;
- el tablero;
- las reglas de ese nivel.

El juego tiene **dos modos de almacenamiento**, que se eligen solos al arrancar:

- **Compartido**: el sitio está publicado en Cloudflare Pages y responde `api/estado`. Los niveles y
  las imágenes viven en la base de datos D1 y todos los ven; cualquiera puede crear y editar, sin
  aprobación. Las partidas quedan en cada navegador. Guía: [`docs/servidor-compartido.md`](docs/servidor-compartido.md).
- **Local**: archivo abierto con doble clic, un sitio estático o un servidor que no responde. Todo
  queda en el navegador (IndexedDB) y se puede exportar o importar en ZIP.

Además, los niveles pueden viajar **dentro del juego** (`src/niveles/`, `npm run incluir`), como se
explica en [`docs/publicar-niveles.md`](docs/publicar-niveles.md). Con el servidor compartido ya no
hace falta; queda para cargar niveles iniciales o como respaldo.

Usuarios: un grupo escolar y su profesor. **La interfaz debe poder usarse sin saber programar.**

## Comandos

| Comando | Qué hace |
|---|---|
| `npm test` | Pruebas del motor, el modelo de niveles, el ZIP, el almacenamiento, la transferencia, los niveles incluidos, la API del servidor y el cliente remoto (Node ≥ 22.13, sin instalar nada) |
| `npm run test:e2e` | En Chromium: partida y editor (modo local), niveles incluidos, y dos navegadores contra el servidor local (modo compartido). Requiere `pip install playwright` y `playwright install chromium` |
| `npm run compartido` | Servidor local con niveles compartidos (SQLite en `.datos/`) en http://localhost:8787. Opciones `--clave`, `--red`, `--memoria`, `--puerto` |
| `npm run construir` | Prepara `_sitio/` (src/ sin tests, tools, servidor ni api/). Es el comando de compilación de Cloudflare Pages |
| `npm run diagnosticar -- <url> [--clave X] [--escribir]` | Prueba el sitio publicado paso a paso: página, API, base de datos, clave, escritura, conflicto e imagen. Dice qué corregir |
| `python3 src/tests/compartido_e2e.py --url <url> [--clave X]` | Dos navegadores contra el sitio publicado: crean, ven y editan un nivel de prueba y lo eliminan al final |
| `npm run incluir -- <nivel.zip>` | Incluye un nivel exportado en el juego publicado (`src/niveles/`). También `--lista`, `--quitar <id \| archivo>` y `--permitir-errores` |
| `npm run validar -- <archivo>` | Informe de validación de un nivel `.zip`, `.json` o de `src/data/episodes.js`. Admite `--json`. Sale con 0 si se puede jugar, 1 si hay errores y 2 si no pudo leer el archivo |
| `npm run servir` | Sirve `src/` en http://localhost:8000. Normalmente basta con abrir `src/index.html` con doble clic |

No hay `npm install`: el proyecto no tiene dependencias. `construir` solo copia archivos.

## Mapa del código

Todo el código está en `src/`. El detalle está en [`docs/arquitectura.md`](docs/arquitectura.md).

| Archivo | Capa | Responsabilidad |
|---|---|---|
| `niveles.js` | Datos (puro) | Modelo de nivel, normalización, validación e informe, duplicado, tablero y paquetes de exportación |
| `game.js` | Reglas (puro) | Partida: turnos, árbitro, cronología, puntuación, instantánea, migración y descripción del estado |
| `zip.js` | Utilidad (pura) | Escribe y lee ZIP sin dependencias |
| `transferencia.js` | Datos | Exportación e importación de niveles y copias de seguridad |
| `db.js` | Persistencia | IndexedDB, con respaldo en memoria: niveles, imágenes, partidas, conflictos y espacio |
| `ui-base.js` | Interfaz | `window.Quijote`: estado, render, eventos, ventanas de confirmación, imágenes y descargas |
| `ui-juego.js` | Interfaz | Menú, elegir nivel e informe, preparación, mesa, árbitro, cronología, resultados y partidas guardadas |
| `ui-editor.js` | Interfaz | Biblioteca y editor: episodios, preguntas, tablero, configuración, importar/exportar, autoguardado |
| `sincronizar.js` | Datos | Instala y actualiza los niveles incluidos; conserva como copia los cambios locales |
| `remoto.js` | Persistencia | Cliente del servidor con **la misma interfaz que `db.js`**: niveles e imágenes en la API, partidas en el almacén local. `detectar()` decide el modo |
| `ui-compartido.js` | Interfaz | Modo compartido: refresco en vivo cada 8 s, recarga del editor, clave del grupo, «Subir al servidor», indicador de modo en el menú y panel «Estado del servidor» |
| `servidor/api.js` | Servidor | API REST sobre D1: niveles con control de versión (409 en conflicto), historial, imágenes por hash, clave opcional. Recibe `Request` y devuelve `Response`; se prueba en Node. **No se publica** |
| `api/estado` | Contenido | Respuesta estática para sitios sin servidor (evita un 404). No se publica en Cloudflare |
| `app.js` | Arranque | Abre el almacenamiento local, detecta el servidor, migra datos de la v1, sincroniza los niveles incluidos y crea la demostración si no hay niveles |
| `niveles/` | Contenido publicado | `indice.js` y un `.js` por nivel incluido, generados por `npm run incluir`. **No se editan a mano** |
| `data/episodes.js` | Contenido | 12 episodios **provisionales** de demostración |
| `tools/validar-nivel.js` | Herramienta | Validación por terminal |
| `tools/incluir-nivel.js` | Herramienta | Genera `niveles/<archivo>.js` e `indice.js` a partir de niveles exportados |
| `tools/servidor-local.js`, `tools/d1-local.js` | Herramienta | Servidor de desarrollo con la API y una base compatible con D1 sobre `node:sqlite` |
| `tools/construir.js` | Herramienta | Prepara `_sitio/` para publicar |
| `tests/` | Pruebas | Node: `motor`, `niveles`, `incluidos`, `servidor`, `remoto`. Playwright: `interfaz_e2e.py`, `incluidos_e2e.py`, `compartido_e2e.py` |

Fuera de `src/`, por exigencia de cada plataforma:
- **El juego publicado es un Worker** (`match-don-quijote.cppierin.workers.dev`): `wrangler.jsonc`
  (raíz) y `src/servidor/worker.mjs` responden `/api/*` y entregan `_sitio/`. Compilación:
  `npm run construir`. Despliegue: `npx wrangler deploy`. D1 se enlaza como `DB` en `wrangler.jsonc`,
  y `CLAVE_GRUPO` es un Secret del panel.
- `functions/api/[[ruta]].js`: alternativa para proyectos de Cloudflare Pages. Solo conecta `/api/*` con `src/servidor/api.js`.
- `.github/workflows/publicar.yml`: publicación en GitHub Pages (modo local). Se quita al pasar a Cloudflare (ver la guía, A10).

## Restricciones técnicas (no negociables)

1. **Debe funcionar con doble clic en `src/index.html` (`file://`).** Por eso:
   - No uses módulos ES (`import`/`export`), `fetch` de archivos locales, empaquetadores ni frameworks.
   - Cada archivo usa el patrón UMD que ya existe: exporta a `module.exports` en Node y a
     `window.<Nombre>` en el navegador.
   - El orden de los `<script>` en `index.html` importa: las dependencias van antes.
   - El material de demostración es un `.js` que asigna `window.MATERIAL_QUIJOTE`. No lo conviertas en `.json`.
   - Excepción: `src/servidor/api.js` corre en Cloudflare (Workers) y en Node. Puede usar `Request`,
     `Response`, `crypto.subtle`, `atob` y `btoa`, pero ninguna API exclusiva de Node ni de Cloudflare.
     Cloudflare lo empaqueta desde `functions/` con `import`, y `require('../niveles.js')` funciona en ambos.
2. **Sin dependencias externas.** Lo único externo son Google Fonts, siempre con tipografías de
   respaldo. No añadas CDN ni paquetes npm.
3. **Separación de capas.**
   - Las reglas viven en `game.js` y `niveles.js`, que no tocan el DOM y se prueban en Node.
   - La interfaz solo llama a esas funciones y dibuja el resultado.
   - No pongas reglas del juego en `ui-*.js`.
4. **Errores con nombre.**
   - `ErrorJuego`: reglas.
   - `ErrorAlmacen`, con `codigo`: `sin_espacio`, `no_permitido`, `conflicto`, `existe`, `bloqueado`, `fallo`.
   - `ErrorZip`: archivos.
   - `Q.fallo(mensaje)`: errores causados por los datos del usuario.

   Los mensajes explican qué pasó y qué hacer. No uses `alert`, `confirm` ni `prompt`: usa `Q.confirmar(...)`.
5. **Patrón de la interfaz.**
   - Cada botón tiene `data-accion="x"` y su función está en `Q.acciones['x']`.
   - Los campos usan `data-campo="prefijo.algo"`, que se despacha a `Q.alEscribir[prefijo]` o `Q.alCambiar[prefijo]`.
   - Los formularios usan `data-form`, que se despacha a `Q.formularios`.
   - Las capas superpuestas se registran en `Q.capas`.
   - Para arrastrar: `data-arrastre` y `data-soltar`, que se despachan a `Q.arrastre`.
   - `Q.render()` redibuja la pantalla entera. `data-foco` conserva el foco entre redibujos.
   - Para actualizar sin redibujar mientras el usuario escribe, sigue el ejemplo de `refrescoParcial()` en el editor.
6. **Estilos.**
   - Colores como tokens en `:root`, con tema claro y oscuro.
   - Estética de Siglo de Oro: pergamino, crema, marrón, rojo oscuro y oro.
   - Tipografías: IM Fell para títulos, Alegreya para textos y Alegreya Sans para controles.
   - Debe funcionar a 390 px de ancho sin desplazamiento horizontal.
7. **Idioma.**
   - Todo en español: interfaz, mensajes, nombres de funciones y comentarios.
   - La interfaz se dirige al grupo en «ustedes» («Elijan», «Guarden»).
   - Los botones dicen exactamente lo que hacen.

## Invariantes del juego

Las pruebas los cubren. Si un cambio los rompe, está mal.

- De 2 a 4 jugadores más un árbitro, que no puede ser jugador.
- La coincidencia se decide por el **identificador del episodio**, nunca por la posición en el tablero.
- No se roba otra descripción mientras haya una jugada pendiente. El turno no avanza hasta que el árbitro resuelve.
- Combinación incorrecta o respuesta rechazada: no hay pieza, y la descripción va **al final** del mazo.
- Una imagen ganada no se puede volver a elegir ni puede ganarla otro jugador.
- **El árbitro decide las respuestas orales.** El programa no las evalúa ni simula entenderlas.
- La respuesta de referencia es privada: nunca se muestra a los jugadores, ni en la vista de lectura.
- Las piezas conservan sus metadatos (parte, capítulo, orden cronológico) para la fase cronológica.
- Se puntúa solo por piezas correctamente ordenadas. Un empate se declara empate, **sin regla de desempate**.
- La fase de juego termina al agotar el mazo, o por decisión del árbitro si el nivel lo permite, y sin jugada pendiente.
- **Una partida trabaja sobre una instantánea del nivel.** El editor nunca modifica una partida en
  curso ni una guardada. Las ediciones afectan solo a las partidas nuevas.
- Una partida se puede guardar con una jugada pendiente. Al recuperarla, se retoma exactamente en esa etapa.
- El guardado del editor nunca sobrescribe en silencio: si la versión guardada cambió, hay conflicto.
- Copiar un nivel produce un nivel independiente. Eliminar un nivel no afecta a otros niveles ni a las partidas guardadas.
- **Modo compartido**:
  - El servidor es la fuente de verdad de los niveles.
  - `guardarNivel` siempre envía `versionEsperada`; el servidor responde 409 si cambió, y la
    interfaz muestra el conflicto. Nunca se sobrescribe en silencio.
  - Eliminar un nivel lo retira (`eliminado = 1`), pero queda en el historial.
  - Las imágenes se identifican por su contenido (`h` + sha256) y ningún cliente las borra.
  - El editor solo se recarga con la versión de otra persona si no tiene cambios pendientes.
- La sincronización de niveles incluidos **nunca borra ni pierde datos**:
  - si el nivel local fue editado, se guarda como copia «(mis cambios)» antes de actualizarlo;
  - si es un nivel creado aquí y más reciente que el publicado, no se toca;
  - quitar un nivel del juego no lo borra de los navegadores que ya lo tenían.
- Las reglas no cambian en silencio durante una partida.

## Contenido literario

- **No inventes** episodios, citas, números de capítulo ni hechos de la novela para completar material.
  Si falta un dato, deja el campo vacío y avisa.
- Descripciones y respuestas: paráfrasis propias. Las citas textuales, solo si están verificadas con
  la edición de referencia del grupo, que todavía no está definida.
- La Primera parte (1605) tiene 52 capítulos y la Segunda (1615), 74.
- `src/data/episodes.js` es material **de demostración**: no lo marques como aprobado.
- Imágenes: no copies ilustraciones modernas con derechos de autor. Usa obras de dominio público con
  procedencia verificada, o ilustraciones originales marcadas como provisionales.
- No presentes el juego como listo para una partida definitiva de 30 episodios hasta que el grupo
  apruebe el material.

## Datos y formatos

Detalle en [`docs/formato-nivel.md`](docs/formato-nivel.md).

- **IndexedDB:** base `match-quijote`, versión 1, con los almacenes `niveles`, `imagenes` y `partidas` (`keyPath: 'id'`).
  - Para cambiar el esquema, sube `VERSION_BD` en `db.js` y migra en `onupgradeneeded`.
  - Nunca borres datos del usuario en una migración.
- **Versión del nivel:** cada guardado incrementa `nivel.version`. Guarda con `db.guardarNivel(n, { versionEsperada })` para detectar conflictos.
- **Imágenes:** dentro de la app son `img:<id>`; en un ZIP exportado, `imagenes/<id>.<ext>`.
  Las rutas `assets/...` se conservan tal cual. Las imágenes son inmutables: cambiar una crea otra
  nueva, y `limpiarHuerfanas()` elimina las que nadie usa.
- **Formato de exportación:** `formato` y `versionFormato` en `niveles.js`. Si lo cambias, sube
  `VERSION_FORMATO` y sigue leyendo los archivos antiguos, incluido el material de la v1.
- **Partidas guardadas:** el estado es `version: 2`; `migrarPartida()` convierte las de la v1.
- **Niveles incluidos:**
  - `nivel.origen = { id, huella, versionLocal, instalado }` marca un nivel instalado desde `src/niveles/`.
  - `esIncluido(n)` exige `origen.id === n.id`, así que las copias no cuentan.
  - `editadoLocalmente(n)` compara `n.version` con `origen.versionLocal`.
  - El origen no se exporta.
  - `indice.js` se carga con `?t=` para evitar la caché, y cada nivel con `?h=<huella>`.
- **localStorage:** solo para preferencias pequeñas (`matchQuijote.pref.*`). Nunca para niveles ni imágenes.

## Reglas provisionales y decisiones del grupo

Varias reglas aún no están decididas. Se configuran **por nivel** en `nivel.config`:
- `seleccionPregunta`: `aleatoria` o `primera`;
- `puntuacion`: `posicion` o `subsecuencia`;
- `permitirFinAnticipado`;
- `exigirCompleto`;
- `barajarTablero`;
- `columnas` y `filas`.

Están en [`docs/decisiones-pendientes.md`](docs/decisiones-pendientes.md).

- Si una tarea toca una regla, revisa ese documento primero.
- Si la tarea contradice las reglas originales del grupo, **explica el conflicto y pregunta antes de cambiarla**.
- Una regla nueva se implementa como opción de `nivel.config`, con valor por defecto, prueba y documentación.

## Cómo trabajar

1. Lee los archivos que vas a tocar y sus pruebas antes de editar.
2. Cambio en reglas o datos: escribe o ajusta la prueba en `src/tests/*.test.js` y ejecuta `npm test`.
3. Cambio en la interfaz: además ejecuta `npm run test:e2e`. Si añades un flujo, añade sus comprobaciones.
4. **No afirmes que algo funciona ni que una prueba pasó sin haberla ejecutado.**
   Si no puedes ejecutarla, dila como pendiente.
5. Si cambian las instrucciones de uso, actualiza `README.md`. Si cambian la arquitectura, los
   formatos o las decisiones, actualiza el documento correspondiente de `docs/`.
6. Cambios pequeños y revisables. No reescribas módulos que funcionan para una mejora puntual.
