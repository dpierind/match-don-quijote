# Arquitectura

## Principios

- **Sin compilación ni dependencias.** Los archivos de `src/` se cargan tal cual con `<script>` desde
  `index.html` y funcionan en `file://`.
- **Núcleo puro y probado en Node.** `niveles.js`, `game.js`, `zip.js` y `transferencia.js` no usan
  el DOM. `db.js` usa IndexedDB en el navegador y, en Node, un almacén en memoria (`abrir({ forzarMemoria: true })`).
- **La interfaz no decide reglas.** Las funciones de `ui-*.js` llaman al núcleo, capturan sus
  errores y redibujan.

## Dependencias entre archivos

```
data/episodes.js ─┐
niveles.js ───────┼─► game.js
                  ├─► db.js
zip.js ───────────┴─► transferencia.js (usa niveles.js y zip.js)

ui-base.js  (window.Quijote: estado, render, eventos)
  ├─ ui-juego.js   (menú, partidas)
  └─ ui-editor.js  (biblioteca, editor)
sincronizar.js (niveles incluidos de src/niveles/)
app.js      (arranque: abre db, migra v1, sincroniza los incluidos, crea la demostración si no hay niveles, muestra el menú)
```

Globales en el navegador: `NivelesQuijote`, `MotorQuijote`, `ZipQuijote`, `AlmacenQuijote`,
`TransferenciaQuijote`, `Quijote` y `MATERIAL_QUIJOTE`.

## Ciclo de una acción de interfaz

1. El usuario pulsa un elemento con `data-accion="nombre"`.
2. `ui-base.js` ignora la repetición del mismo control en menos de 400 ms y ejecuta `Q.acciones.nombre(dataset)`.
3. La acción llama al núcleo. Si es asíncrona, se dibuja antes y después de la espera.
4. Un error se muestra con `Q.mostrarError`. Solo los fallos inesperados van a la consola.
5. `Q.render()` reconstruye la pantalla y las capas (ventanas, árbitro, editor) y restaura el foco por `data-foco`.

Escritura en campos: `input` se despacha a `Q.alEscribir[prefijo]` y `change` a `Q.alCambiar[prefijo]`.
El editor no redibuja mientras se escribe: actualiza el estado, marca el cambio y refresca en sitio
los avisos (`refrescoParcial`).

## Partida

```
crearPartida(nivel guardado) ── instantánea + validación + barajado
        │
fase 'juego'
  jugada.etapa: seleccion → verificacion → (incorrecta | pregunta) → fin del turno
        │  (mazo vacío o fin anticipado sin jugada pendiente)
fase 'transicion' → 'cronologia' → 'validacion' → 'resultados'
```

- `Q.ui.partida` es el estado completo: un objeto JSON sin referencias al nivel original.
- Tras cada acción, `ui-juego.js` la guarda en el almacén `partidas` (`Q.guardarPartida`).
- `describirEstado(s)` produce el texto de la pantalla «Continuar partida».

## Editor

- Abre una **copia** del nivel guardado (`Q.ed.nivel`) y recuerda su `versionBase`.
- Cada cambio llama a `marcarCambio()`. Con el guardado automático activo, se guarda 2,5 s después.
- `guardar()` llama a `db.guardarNivel(nivel, { versionEsperada: versionBase })`. Si otra pestaña
  guardó antes, se produce un `conflicto`: se pausa el autoguardado y se ofrecen tres opciones.
  - Guardar como copia.
  - Recargar la otra versión.
  - Sobrescribir, con confirmación.
- Al salir con cambios: se intenta guardar y, si no se puede, se pregunta (`Q.confirmarSalidaEditor`).

## Imágenes

- Al subir, `procesarImagen()` valida el tipo (PNG, JPEG, WebP o GIF), reduce a 1600 px si
  hace falta y guarda el `Blob` en el almacén `imagenes`.
- El episodio guarda `imagen: 'img:<id>'`. Cambiar la imagen crea otra nueva; la anterior queda
  hasta que `limpiarHuerfanas()` comprueba que nadie la usa: ni niveles, ni partidas guardadas, ni el
  borrador abierto.
- `Q.arte(ep)` dibuja la imagen. Si no hay imagen, dibuja el emblema provisional o un marcador con
  el título; si la referencia está rota, un aviso.

## Modo compartido (servidor)

```
app.js: AlmacenQuijote.abrir() → Q.dbLocal
        RemotoQuijote.detectar()  ─ estado → Q.db = RemotoQuijote.crear({ local: Q.dbLocal })   (modo «servidor»)
                                  ─ sinServidor (file://, sitio estático) → Q.db = Q.dbLocal
                                  ─ error → Q.db = Q.dbLocal y aviso «No hay conexión con el servidor»
```

- `remoto.js` tiene la misma interfaz que `db.js`. Niveles e imágenes van por la API; partidas y
  estimación de espacio van al almacén local. Por eso el editor y el juego no distinguen el modo,
  salvo en textos (`Q.compartido()`).
- API (`src/servidor/api.js`), tablas en D1:
  - `niveles(id, version, nombre, modificado, eliminado, contenido)`;
  - `historial(id, version, modificado, contenido)`, con 50 versiones por nivel;
  - `imagenes(id, tipo, tamano, datos base64, creada)`.

  Las tablas se crean solas. `PUT niveles/:id` hace una comparación de versión en un `batch`
  transaccional: `UPDATE … WHERE version = ?`.
- `ui-compartido.js` revisa `GET niveles?resumen=1` cada 8 s en *menú, Jugar, Biblioteca y editor*:
  - si la lista mostrada difiere, la vuelve a cargar;
  - en el editor, carga la versión nueva solo si no hay cambios pendientes.
- Clave del grupo: cabecera `X-Clave-Grupo`, guardada en `localStorage`. Un 401 abre la ventana de
  la clave. `GET estado` con la cabecera responde `claveValida`.
- Imágenes: en modo compartido, `Q.imagenExiste` da por existente toda imagen que no haya fallado
  al cargar, porque otras personas suben imágenes en cualquier momento.

## Niveles incluidos

```
Autor: Editor → Exportar (.zip) → npm run incluir → src/niveles/<archivo>.js + indice.js → git push
GitHub Actions: npm test → publica src/ en Pages
Navegador: app.js carga niveles/indice.js?t=… → sincronizar() → para cada entrada:
  mismo origen y misma huella             → nada
  no existe                                → instalar (imágenes base64 → IndexedDB)
  idéntico al exportado (navegador autor)  → vincular (solo se le pone origen)
  creado aquí y más reciente que publicado → omitir
  editado localmente                       → copia «(mis cambios)» y luego actualizar
  sin cambios locales                      → actualizar
```

`niveles/<archivo>.js` asigna `window.NIVELES_INCLUIDOS_DATOS[id] = { huella, generado, nivel, imagenes }`.
Las imágenes van en base64 para que funcione también en `file://`, donde no se puede usar `fetch`.

## Exportación

- `transferencia.exportarNivel` y `exportarBiblioteca` arman el ZIP con `zip.crearZip`.
- `Q.ofrecerArchivo` lo entrega:
  - en claude.ai, mediante la capacidad `downloads`, que requiere declararla al publicar;
  - en local, con una descarga normal del navegador.
- `transferencia.analizar` lee y valida sin guardar. `prepararNivel` guarda las imágenes y devuelve
  el nivel listo. La interfaz decide si se importa como nuevo o si reemplaza, con confirmación.
