# Niveles compartidos con Cloudflare

Con esta configuración, el juego guarda los niveles en un servidor. Cuando alguien crea o modifica
un nivel, todos los que tienen el juego abierto lo ven en pocos segundos, sin commits ni
exportaciones.

**Decisiones del grupo (22 de octubre de 2026):**
- Cualquiera puede crear, modificar o eliminar niveles.
- No hay aprobación: los cambios se ven al guardar.
- Las respuestas de referencia pueden ser legibles para todos, porque se juega en el mismo dispositivo.

## Cómo funciona

```
Navegador de Ana ─┐                     ┌─ Cloudflare Pages: el juego (src/)
Navegador de Beto ┼──►  match-don-quijote.pages.dev ──┤
Navegador de Carla┘                     └─ /api/* → functions/api/[[ruta]].js → base de datos D1
                                                       (niveles, versiones anteriores, imágenes)
```

- **Niveles e imágenes**: en la base de datos D1. Son de todos.
- **Partidas guardadas**: en el navegador de cada persona, como antes.
- **Edición simultánea**: si dos personas guardan el mismo nivel a la vez, la segunda recibe el aviso
  de conflicto y puede guardar sus cambios como copia. Nunca se pisa el trabajo de otra persona.
- **Actualización en vivo**: las pantallas *Jugar*, *Biblioteca* y el editor revisan el servidor
  cada 8 segundos. Si alguien está editando un nivel sin cambios pendientes y otra persona lo
  guarda, se carga la versión nueva.
- **Sin conexión**: si el servidor no responde, el juego avisa y sigue funcionando en ese navegador.
  Lo que se cree así aparece después en *Biblioteca → Solo en este navegador*, con el botón
  **Subir al servidor**.
- **Historial**: el servidor guarda las últimas 50 versiones de cada nivel, incluidos los eliminados
  (ver parte D).
- **Clave del grupo (opcional)**: si la defines, jugar sigue siendo libre, pero para crear, modificar
  o eliminar niveles se pide una clave. **Recomendada**, porque el enlace circula por WhatsApp y,
  sin clave, cualquiera que lo reciba puede borrar niveles.

---

## Parte A. Configurar Cloudflare (una sola vez, unos 20 minutos)

Cloudflare cambia a veces los nombres de los menús. Si algo no coincide exactamente, busca la
opción equivalente.

### A1. Sube el código a GitHub

```
cd ~/Documents/code_repo/match-don-quijote
npm test
git add .
git commit -m "Niveles compartidos con servidor"
git push
```

`npm test` debe terminar sin fallas. Necesita Node 22.13 o superior; revisa tu versión con `node --version`.

### A2. Crea una cuenta en Cloudflare

Entra a https://dash.cloudflare.com/sign-up. El plan gratuito alcanza para el juego y no pide tarjeta.

### A3. Crea la base de datos

1. En el panel de Cloudflare: **Storage & Databases → D1 SQL Database → Create database**.
2. Nombre: `match-quijote`. Ubicación: automática.
3. Pulsa **Create**. No hace falta crear tablas: el juego las crea solo la primera vez.

### A4. Crea el proyecto de Pages conectado a GitHub

1. **Workers & Pages → Create → Pages → Connect to Git**. Si solo ves opciones de «Workers», busca
   la pestaña o el enlace **Pages**.
2. Autoriza a Cloudflare para leer tu GitHub y elige el repositorio `match-don-quijote`.
   **Ojo con las cuentas**: GitHub autoriza la cuenta que esté abierta en el navegador. Hazlo en la
   ventana privada donde estás con tu cuenta (`dpierind`).
3. Configuración de compilación:

   | Campo | Valor |
   |---|---|
   | Project name | `match-don-quijote` (será `match-don-quijote.pages.dev`) |
   | Production branch | `main` |
   | Framework preset | None |
   | Build command | `npm run construir` |
   | Build output directory | `_sitio` |
   | Root directory | (vacío) |

4. En **Environment variables**, agrega `NODE_VERSION` con el valor `22`.
5. Pulsa **Save and Deploy**. La primera publicación termina bien, pero la API todavía no tiene base
   de datos: si abres el juego verás «No hay conexión con el servidor». Es normal hasta el paso A5.

### A5. Conecta la base de datos al proyecto

1. En el proyecto: **Settings → Bindings → Add → D1 database**.
2. **Variable name**: `DB` (exactamente así, en mayúsculas). **D1 database**: `match-quijote`.
3. Guarda.

### A6. (Recomendado) Define la clave del grupo

1. **Settings → Variables and Secrets → Add**.
2. Tipo **Secret**, nombre `CLAVE_GRUPO`, y como valor la clave que acuerden, por ejemplo una palabra
   de la novela.
3. Guarda y comparte la clave solo con el grupo.

### A7. Vuelve a publicar para aplicar los cambios

Los enlaces y variables solo se aplican en una publicación nueva. En **Deployments**, abre el menú
(⋯) de la última publicación y elige **Retry deployment**. También sirve hacer cualquier `git push`.

### A8. Comprueba que funciona

1. Abre `https://match-don-quijote.pages.dev/`, o la dirección que muestre Cloudflare.
2. Entra a **Editor de niveles**. Debe aparecer el recuadro **«Niveles compartidos»**. Si definiste
   la clave, pulsa **Escribir la clave**.
3. Abre la misma dirección en otro navegador o en tu celular. Crea un nivel en uno y entra a
   **Jugar** en el otro: debe aparecer en menos de 10 segundos.

### A9. Ajusta la vista previa de WhatsApp

En `src/index.html`, cambia las dos direcciones `https://dpierind.github.io/match-don-quijote/` por
tu dirección de Cloudflare, en `og:image` y `og:url`. Luego publica:

```
git add src/index.html
git commit -m "Vista previa con la dirección de Cloudflare"
git push
```

Cloudflare publica solo en uno o dos minutos. Puedes seguir el avance en **Deployments**.

### A10. Desactiva GitHub Pages

Así no quedan dos enlaces distintos. La versión de GitHub Pages no tiene servidor y guardaría los
niveles solo en cada navegador.

1. En GitHub: **Settings → Pages → Source: Disabled**. En algunas cuentas aparece como
   **Unpublish site**.
2. Quita el flujo de publicación:
   ```
   git rm .github/workflows/publicar.yml
   git commit -m "Publicación en Cloudflare: se quita GitHub Pages"
   git push
   ```

---

## Parte W. Proyecto de tipo Worker (`*.workers.dev`)

Si Cloudflare creó el proyecto como **Worker** (la dirección termina en `.workers.dev`), la carpeta
`functions/` se ignora. El repositorio trae lo necesario para Workers:

- `wrangler.jsonc`: nombre del Worker, archivos del juego (`_sitio/`) y base de datos D1 (`DB`).
- `src/servidor/worker.mjs`: responde `/api/*` con la misma API y entrega el resto del juego.

Pasos (una sola vez):

1. **Copia el ID de la base de datos**: *Storage & Databases → D1 → match-quijote*, campo
   **Database ID** (un código como `a1b2c3d4-…`). Pégalo en `wrangler.jsonc`, en lugar de
   `PEGAR-AQUI-EL-DATABASE-ID`.
2. **Revisa el nombre**: `"name"` en `wrangler.jsonc` debe ser el nombre del Worker. Para
   `match-don-quijote.cppierin.workers.dev` es `match-don-quijote`.
3. **Configura la compilación del Worker**: en *Workers & Pages → match-don-quijote → Settings → Build*:

   | Campo | Valor |
   |---|---|
   | Build command | `npm run construir` |
   | Deploy command | `npx wrangler deploy` |
   | Root directory | `/` (vacío) |

4. **Clave del grupo (recomendada)**: *Settings → Variables and Secrets → Add*. Tipo **Secret**,
   nombre `CLAVE_GRUPO`. Los Secrets se conservan entre despliegues. No uses una variable de tipo
   texto: `wrangler deploy` las borraría.
5. **Publica**:
   ```
   git add wrangler.jsonc
   git commit -m "Configuración del Worker con la base de datos"
   git push
   ```
   Sigue la compilación en la pestaña **Deployments** o **Builds** del Worker.
6. **Comprueba desde tu computador**:
   ```
   npm run diagnosticar -- https://match-don-quijote.cppierin.workers.dev --clave LA-CLAVE --escribir
   ```
   Todo debe salir con ✓. En el juego, el menú debe mostrar **«Niveles compartidos en línea»**.

Los enlaces de la base de datos ya no se configuran en el panel, sino en `wrangler.jsonc`. Si
agregaste un enlace `DB` a mano en el panel, `wrangler deploy` lo reemplaza por el del archivo.

---

## Parte B. Durante la demostración

- **Enlace para compartir**: `https://match-don-quijote.pages.dev/`.
- **Quien crea niveles**: Editor de niveles → **Nuevo nivel**, o **Editar** sobre uno existente. Los
  cambios se guardan solos en unos segundos. El indicador dice **«Guardado en el servidor»**.
- **Quienes juegan**: en **Jugar** ven aparecer los niveles nuevos sin recargar. Para jugar un
  nivel, este debe estar completo: el informe lo indica.
- **Una partida en curso no cambia** aunque editen su nivel: usa la versión con que empezó.
- **Si dos personas editan el mismo nivel**, quien guarda segundo ve el aviso de conflicto con tres
  opciones: guardar como copia (lo más seguro), cargar la otra versión o sobrescribirla.
- **Antes de una presentación importante**: Editor de niveles → **Copia de seguridad de la
  biblioteca**. Descarga un ZIP con todos los niveles e imágenes.

## Parte C. Probar en tu computador

El mismo funcionamiento, con una base de datos local en `.datos/servidor-local.sqlite`:

```
npm run compartido
```

Abre http://localhost:8787 en dos navegadores distintos para simular a dos personas.

- `npm run compartido -- --clave molinos` exige una clave del grupo.
- `npm run compartido -- --red` deja entrar a celulares de la misma red Wi-Fi (muestra la dirección).
  macOS puede pedir permiso de red para Node: acepta.
- `npm run compartido -- --memoria` usa una base de datos temporal que se borra al cerrar.

Para probar con el entorno de Cloudflare mismo (opcional, descarga wrangler):

```
npm run construir
npx wrangler pages dev _sitio --d1 DB=match-quijote-local
```

## Parte D. Recuperar una versión anterior o un nivel eliminado

En Cloudflare: **Storage & Databases → D1 → match-quijote → Console**.

1. Busca el nivel y sus versiones:
   ```sql
   SELECT id, nombre, version, eliminado FROM niveles ORDER BY modificado DESC;
   SELECT version, modificado, json_extract(contenido, '$.nombre') AS nombre
     FROM historial WHERE id = 'ID-DEL-NIVEL' ORDER BY version DESC;
   ```
2. Restaura la versión elegida. Cambia `ID-DEL-NIVEL` (dos veces) y `N`:
   ```sql
   UPDATE niveles SET
     version = version + 1, eliminado = 0,
     modificado = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
     contenido = json_set(
       (SELECT contenido FROM historial WHERE id = 'ID-DEL-NIVEL' AND version = N),
       '$.version', version + 1,
       '$.modificado', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   WHERE id = 'ID-DEL-NIVEL';
   ```
   En unos segundos, el nivel restaurado aparece en todos los navegadores.

## Parte E. Límites

- Imagen: hasta 1,4 MB. El editor reduce solo las imágenes grandes a 1,2 MB como máximo.
- Nivel: hasta unos 1,5 MB de texto, sin contar las imágenes.
- Plan gratuito de Cloudflare: alcanza de sobra para un curso o una demostración. Si el juego se
  usara mucho más, revisa los límites actuales de Pages Functions y D1 en la página de precios de
  Cloudflare.
- Las respuestas de referencia son legibles para quien inspeccione el juego (decisión 3).

## Problemas frecuentes

Primero ejecuta `npm run diagnosticar -- https://SU-SITIO --clave LA-CLAVE --escribir`: prueba cada
pieza y dice qué corregir. En el juego, el indicador del menú (o «Estado del servidor») muestra el modo.

| Qué pasa | Qué hacer |
|---|---|
| La dirección termina en `.workers.dev` y el juego dice que `api/estado` devuelve una página o no existe | El proyecto es un Worker: sigue la parte W |
| El juego dice «No hay conexión con el servidor» y menciona el enlace «DB» | Falta el paso A5, o falta volver a publicar (A7) |
| La biblioteca no muestra «Niveles compartidos» | Estás abriendo otra dirección, por ejemplo la de GitHub Pages o `localhost:8000`. Usa la de Cloudflare |
| Al guardar aparece la ventana «Clave del grupo» | El servidor tiene clave (A6). Escríbela; se guarda en ese navegador |
| «Esa clave no es correcta» | Revisa mayúsculas y espacios, o cámbiala en Cloudflare y vuelve a publicar |
| Un nivel nuevo no aparece en otro dispositivo | Espera unos 10 segundos con la pantalla *Jugar* abierta, o vuelve al menú y entra de nuevo |
| «La imagen pesa más de 1,4 MB» | Usa una imagen más liviana. El editor intenta reducirla, pero algunas no bajan lo suficiente |
| La compilación falla en Cloudflare | Revisa que el comando sea `npm run construir`, la carpeta `_sitio` y la variable `NODE_VERSION` = `22` |
| Borraron un nivel por error | Parte D |
