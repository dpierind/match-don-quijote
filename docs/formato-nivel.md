# Formatos de datos

## Nivel

```jsonc
{
  "id": "nivel-…",              // único; no cambia al editar
  "nombre": "Primera parte",
  "descripcion": "",
  "version": 3,                 // sube en cada guardado
  "creado": "2026-10-09T…Z",
  "modificado": "2026-10-21T…Z",
  "config": { /* ver abajo */ },
  "episodios": [ /* ver abajo */ ],
  "tablero": ["ep-04", null, "ep-01", …],  // largo = columnas × filas; ids de episodio o null
  "origen": null                           // o { id, huella, versionLocal, instalado } si vino de src/niveles/
}
```

`tablero` guarda **qué episodio ocupa cada espacio**. El número de espacio (índice + 1) no es el
identificador del episodio. Un episodio ocupa como máximo un espacio. Los que no están en el
tablero quedan en la **reserva** y no participan en la partida.

### Configuración (`config`)

| Campo | Valores | Por defecto | Significado |
|---|---|---|---|
| `columnas`, `filas` | 1–10 | 6, 5 | Formato del tablero |
| `exigirCompleto` | bool | `true` | Todos los espacios deben estar ocupados para jugar |
| `barajarTablero` | bool | `false` | Mezclar las posiciones de las imágenes al empezar cada partida |
| `seleccionPregunta` | `aleatoria` \| `primera` | `aleatoria` | Pregunta que se propone al árbitro |
| `puntuacion` | `posicion` \| `subsecuencia` | `posicion` | Cómo se cuentan las piezas bien ordenadas |
| `permitirFinAnticipado` | bool | `true` | El árbitro puede cerrar la fase de juego antes de agotar el mazo |
| `estado` | `provisional` \| `aprobado` | `provisional` | Aprobación del grupo |
| `edicionReferencia` | texto | `""` | Edición de la novela usada para validar |

### Episodio

```jsonc
{
  "id": "ep-04",                 // obligatorio y único en el nivel
  "titulo": "Los molinos de viento",   // obligatorio
  "parte": 1,                    // obligatorio: 1 o 2
  "capitulo": 8,                 // obligatorio: entero ≥ 1 (aviso si supera 52 o 74)
  "ordenCronologico": 4,         // obligatorio y único entre los episodios del tablero
  "descripcion": "…",            // obligatorio: texto que lee el jugador
  "imagen": "img:<id>",          // opcional: img:<id> (guardada), imagenes/… (en un ZIP) o assets/…
  "emblema": "molino",           // opcional: dibujo provisional si no hay imagen
  "preguntas": [
    { "id": "p-…", "texto": "…", "respuesta": "…", "notas": "criterio de evaluación" }
  ],
  "notasArbitro": "",
  "provisional": true
}
```

Emblemas disponibles: `libro`, `espada`, `insula`, `molino`, `manta`, `bacia`, `cadenas`, `flor`,
`jaula`, `caballo`, `luna`, `vela`.

### Validación (`validarNivel`)

- **Errores (impiden jugar):**
  - falta un campo obligatorio;
  - identificador duplicado (también si está en la reserva);
  - orden cronológico repetido en el tablero;
  - descripción vacía;
  - referencia de imagen rota;
  - el tablero no cumple el formato exigido;
  - hay menos de 2 episodios en el tablero.
- **Avisos (no impiden jugar):**
  - sin imagen;
  - sin preguntas;
  - preguntas sin respuesta de referencia;
  - capítulo fuera de rango;
  - episodios en la reserva;
  - nivel no aprobado;
  - espacios vacíos permitidos.

Solo los episodios del tablero producen errores de contenido. Los de la reserva producen avisos.

## Paquete exportado (`.zip`)

```
nivel.json        { formato: "match-quijote-nivel", versionFormato: 1, aplicacion, exportado, nivel }
imagenes/<id>.png …  imágenes reales; nivel.json las nombra con estas rutas relativas
LEEME.txt
```

La copia de seguridad de la biblioteca es igual, pero con `biblioteca.json`:
`{ formato: "match-quijote-biblioteca", versionFormato: 1, niveles: [...] }`.

La importación también acepta:
- un `nivel.json` o `biblioteca.json` suelto (sin imágenes; se avisa);
- el material de la v1 (`{ meta, episodios }` o una lista), con preguntas como texto y `respuestasReferencia`.

Los ZIP pueden venir sin compresión o con `deflate`. No se admiten ZIP64 ni ZIP cifrados.

## Nivel incluido (`src/niveles/`)

Lo genera `npm run incluir`. No se edita a mano.

```js
// src/niveles/indice.js
window.NIVELES_INCLUIDOS = [
  { "id": "nivel-…", "nombre": "Primera parte", "huella": "1a2b3c…", "archivo": "niveles/primera-parte.js", "episodios": 30 }
];

// src/niveles/primera-parte.js
(window.NIVELES_INCLUIDOS_DATOS = window.NIVELES_INCLUIDOS_DATOS || {})["nivel-…"] = {
  "huella": "1a2b3c…",      // sha256 del contenido y las imágenes (sin versión ni fechas), 16 caracteres
  "generado": "2026-10-21T…Z",
  "nivel": { /* nivel exportado; imágenes con rutas imagenes/… */ },
  "imagenes": { "imagenes/img-….webp": { "tipo": "image/webp", "datos": "<base64>" } }
};
```

## Partida guardada (almacén `partidas`)

```jsonc
{
  "id": "partida-…",
  "nivelId": "nivel-…", "nivelNombre": "…", "nivelVersion": 3,
  "jugadores": ["Ana", "Benja"], "arbitro": "Profe",
  "fase": "juego", "terminada": false,
  "creada": "…", "guardada": "…",
  "estado": {                    // estado completo de game.js (version 2)
    "version": 2, "id": "partida-…",
    "nivel": { "id", "nombre", "version", "descripcion" },
    "fase": "juego | transicion | cronologia | validacion | resultados",
    "reglas": { "seleccionPregunta", "puntuacion", "permitirFinAnticipado" },
    "episodios": { "<id>": { /* instantánea del episodio */ } },
    "tablero": [...], "columnas": 6, "filas": 5,
    "mazo": ["ep-07", …],         // orden actual; el primero es el siguiente que se roba
    "ganadas": { "ep-04": 0 },    // episodio → índice del jugador
    "jugadores": [{ "indice", "nombre", "piezas": [...], "orden": [...], "ordenConfirmado" }],
    "activo": 1, "turno": 5,
    "jugada": { "jugador", "descripcionId", "seleccion", "etapa", "correcta", "preguntaIdx" } | null,
    "historial": [{ "turno", "jugador", "nombre", "descripcionId", "casilla", "imagenId", "pregunta", "resultado", "observacion" }],
    "finAnticipado": false,
    "resultados": null | { "tabla", "maximo", "ganadores", "empate", "secuencia", "modo" }
  }
}
```

`jugada.etapa`: `seleccion`, `verificacion`, `incorrecta` o `pregunta`.
