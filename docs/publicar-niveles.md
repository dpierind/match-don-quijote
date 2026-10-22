# Publicar el juego y compartir niveles por un enlace

> **Desde el 22 de octubre de 2026 el juego usa niveles compartidos en un servidor**
> ([`servidor-compartido.md`](servidor-compartido.md)): los niveles se crean en el juego y todos los
> ven al instante, sin commits. Esta guía sigue sirviendo para incluir niveles dentro del juego
> (niveles iniciales o respaldo) y para publicar sin servidor.

Esta guía explica cómo publicar «El match con Don Quijote» en un enlace fijo que puedes mandar por
WhatsApp, y cómo incluir en él los niveles del grupo, de modo que quien abra el enlace reciba
siempre la última versión del juego y de los niveles.

## Cómo funciona

```
Tu computador                                    GitHub                         Quien abre el enlace
──────────────                                   ──────                         ────────────────────
1. Editas el nivel en el juego (localhost)
2. Lo exportas  → primera-parte.zip
3. npm run incluir -- primera-parte.zip
   → src/niveles/primera-parte.js
4. git commit + git push  ───────────────────►  5. Ejecuta las pruebas
                                                   y publica src/ en
                                                   tu-usuario.github.io/…  ───►  6. Abre o recarga el enlace:
                                                                                    el nivel se instala o se
                                                                                    actualiza solo
```

- **El enlace siempre es el mismo.** Cada `git push` actualiza lo que ve la gente en uno o dos minutos.
- **Los niveles viajan dentro del juego** (`src/niveles/`), con sus imágenes. Al abrir el enlace, el
  juego instala los nuevos y actualiza los que cambiaron.
- **Cada persona conserva sus datos.** Sus partidas guardadas, y los niveles que cree, quedan en su
  navegador y no se pierden con las actualizaciones. Las partidas en curso siguen usando la versión
  del nivel con que empezaron.
- Si alguien edita en su navegador un nivel incluido y luego llega una versión nueva, se instala la
  versión nueva y sus cambios se guardan como copia, con el nombre «(mis cambios)». Nunca se pierde nada.

## Lo que necesitas

| Necesitas | Cómo comprobarlo |
|---|---|
| Node.js 18 o superior | `node --version` |
| git | `git --version` (si macOS ofrece instalar las herramientas de desarrollo, acepta) |
| Una cuenta de GitHub | Créala gratis en https://github.com/signup |
| Chrome, Edge o Firefox | Para editar los niveles |

Todos los comandos se escriben en la **Terminal**, dentro de la carpeta del proyecto:

```
cd ~/Documents/code_repo/match-don-quijote
```

---

## Parte A. Publicar el juego por primera vez

Se hace una sola vez y toma unos 15 minutos.

### A1. Comprueba que todo funciona

```
npm test
```

Debe terminar con `# fail 0`. Si algo falla, no sigas: el sitio tampoco se publicaría, porque
GitHub ejecuta estas mismas pruebas antes de publicar.

### A2. Prepara el repositorio de git

Si es la primera vez que usas git en este computador, dile tu nombre y correo (aparecen en el historial):

```
git config --global user.name "Tu Nombre"
git config --global user.email "tu-correo@ejemplo.com"
```

Luego crea el repositorio con un primer commit:

```
git init -b main
git add .
git commit -m "Primera versión de El match con Don Quijote"
```

### A3. Crea el repositorio en GitHub y súbelo

**Opción recomendada: GitHub CLI.** Se instala una vez y evita problemas con contraseñas.

```
brew install gh
gh auth login
```

Si no tienes Homebrew, instálalo antes desde https://brew.sh, o usa la opción manual.

En `gh auth login`, elige **GitHub.com → HTTPS → Login with a web browser** y sigue las
instrucciones. Después:

```
gh repo create match-don-quijote --public --source=. --remote=origin --push
```

Ese comando crea el repositorio en tu cuenta y sube el proyecto.

**Opción manual:**

1. Entra a https://github.com/new.
2. *Repository name*: `match-don-quijote`. Elige **Public** y **no** marques README, .gitignore ni licencia.
3. Pulsa **Create repository** y luego, en la Terminal:
   ```
   git remote add origin https://github.com/TU-USUARIO/match-don-quijote.git
   git push -u origin main
   ```
   Si te pide contraseña, GitHub no acepta la de tu cuenta: usa la opción con GitHub CLI o crea un
   *token* en *Settings → Developer settings → Personal access tokens*.

> **¿Por qué público?** GitHub Pages es gratis con repositorios públicos. Con uno privado necesitas
> un plan de pago, o usar Netlify o Cloudflare Pages. Ten en cuenta que en un repositorio público
> cualquiera puede ver el código y los niveles, incluidas las respuestas de referencia del árbitro.
> El juego las oculta a los jugadores, pero no son secretas para quien lea el repositorio.

### A4. Activa GitHub Pages

1. En GitHub, abre el repositorio y entra a **Settings → Pages** (en el menú de la izquierda).
2. En **Build and deployment → Source**, elige **GitHub Actions**. No hace falta configurar nada más:
   el proyecto ya trae el flujo `.github/workflows/publicar.yml`.

### A5. Publica por primera vez

Como el primer `push` ocurrió antes de activar Pages, esa primera publicación probablemente falló.
Lánzala de nuevo:

- En GitHub: pestaña **Actions → Publicar el juego → Run workflow → Run workflow**.
- O en la Terminal: `gh workflow run publicar.yml`.

El flujo tiene tres etapas: **pruebas → construir → publicar**. Cuando aparezca el check verde (uno o
dos minutos), el juego está en línea. Si alguna etapa queda en rojo, entra a ella para ver el motivo.

### A6. Abre tu enlace

La dirección es:

```
https://TU-USUARIO.github.io/match-don-quijote/
```

También aparece en *Settings → Pages* y en la etapa «publicar» del flujo. Con GitHub CLI:
`gh api repos/{owner}/{repo}/pages --jq .html_url`.

Ábrela y comprueba que el juego carga.

### A7. Ajusta la vista previa para WhatsApp

WhatsApp muestra título, descripción e imagen al pegar el enlace, pero necesita la dirección
**completa** de la imagen. En `src/index.html`, busca esta línea:

```html
<meta property="og:image" content="assets/vista-previa.png">
```

y cámbiala por tu dirección:

```html
<meta property="og:image" content="https://TU-USUARIO.github.io/match-don-quijote/assets/vista-previa.png">
```

Publica el cambio:

```
git add src/index.html
git commit -m "Vista previa para WhatsApp"
git push
```

Para probarla, mándate el enlace a ti mismo por WhatsApp. WhatsApp guarda la vista previa un tiempo:
si la probaste antes de este cambio, puede tardar en actualizarse.

---

## Parte B. Incluir un nivel o una versión nueva

Repite esta parte cada vez que quieras publicar un nivel o cambios en uno ya publicado.

### B1. Abre tu «taller»

Edita siempre en el mismo lugar. Lo más práctico es tu copia local:

```
npm run servir
```

Abre **http://localhost:8000**. Deja esa Terminal abierta mientras trabajas y abre otra pestaña
(`Cmd + T`) para los demás comandos.

> Tus niveles en edición viven en el navegador con que los creas, y separados según la dirección
> (`localhost:8000`, el archivo con doble clic o tu enlace de GitHub). Elige uno como taller y no
> lo cambies.

### B2. Crea o edita el nivel

En **Editor de niveles**:

- Para un nivel nuevo: **Nuevo nivel**.
- Para una versión nueva de un nivel ya publicado: **Editar** sobre ese mismo nivel.
  **No lo dupliques**: el juego reconoce las versiones por el identificador interno del nivel.
  «Duplicar» y «Guardar como copia» crean un nivel distinto, que se publicaría como otro nivel.

Completa los episodios, las imágenes, las preguntas, el tablero y la configuración. Cuando el grupo
apruebe el material, cambia el estado del nivel a **Aprobado por el grupo** en *Configuración*.

Usa imágenes livianas, idealmente de menos de 300 KB cada una. El editor reduce las muy grandes al
subirlas, pero las imágenes viajan dentro del juego y se descargan en los celulares.

### B3. Revisa que no tenga errores

Ve a **Jugar → Elegir** sobre el nivel. El informe debe decir **«Sin errores»**. Las advertencias
no impiden publicar; los errores sí, porque `npm run incluir` rechaza los niveles con errores.

### B4. Exporta el nivel

En **Editor de niveles → Biblioteca**, pulsa **Exportar** en el nivel. Se descarga un `.zip` en tu
carpeta de Descargas, por ejemplo `~/Downloads/primera-parte.zip`.

Si estabas en el editor con cambios sin guardar, primero pulsa **Guardar**.

### B5. Inclúyelo en el juego

En la otra pestaña de la Terminal:

```
npm run incluir -- ~/Downloads/primera-parte.zip
```

Verás algo así:

```
+ Incluido «Primera parte» → src/niveles/primera-parte.js (30 episodios, 30 imágenes, 4.2 MB)

Niveles incluidos (1):
  · Primera parte  [nivel-…]  30 episodios  →  src/niveles/primera-parte.js
```

- La segunda vez, para el mismo nivel, dirá **«↻ Actualizado»** y reemplazará el mismo archivo.
- Si dice **«ya estaba incluido sin cambios»**, el nivel exportado es idéntico al publicado.
- Si dice **«no se incluyó»**, muestra los errores: corrígelos en el editor, vuelve a exportar y repite.
- Puedes incluir varios archivos a la vez: `npm run incluir -- archivo1.zip archivo2.zip`.

### B6. Pruébalo antes de publicar

1. Recarga **http://localhost:8000**. En la biblioteca, el nivel debe tener la etiqueta
   **«Incluido en el juego»**.
2. Para verlo como lo verá otra persona, abre una **ventana de incógnito** (`Cmd + Shift + N` en
   Chrome) en `http://localhost:8000`. Debe aparecer el aviso **«Nivel nuevo: …»** y el nivel debe
   poder jugarse.

### B7. Publica

```
git add src/niveles
git commit -m "Nivel Primera parte: versión con las preguntas revisadas"
git push
```

En la pestaña **Actions** de GitHub verás el flujo «Publicar el juego». Cuando quede en verde, la
nueva versión está en línea.

### B8. ¿Qué ve la otra persona?

Al abrir o recargar el enlace, el juego le avisa **«Nivel nuevo: …»** o **«Nivel actualizado: …»**.
No tiene que hacer nada más.

> GitHub puede guardar el sitio en caché hasta 10 minutos. La lista de niveles siempre se pide
> fresca, pero si cambiaste el código del juego y alguien no ve el cambio, que recargue la página
> pasados unos minutos.

---

## Parte C. Compartir por WhatsApp

Manda el enlace `https://TU-USUARIO.github.io/match-don-quijote/`. Un mensaje de ejemplo:

> Les comparto «El match con Don Quijote»: https://TU-USUARIO.github.io/match-don-quijote/
> Ábranlo en Chrome o Safari, sin modo incógnito, y guarden el enlace. Cada vez que lo abran tendrán
> la última versión de los niveles. Sus partidas quedan guardadas en su propio navegador.

Recomendaciones para quienes lo reciben:

- **Usar siempre el mismo navegador y el mismo dispositivo.** Las partidas guardadas viven ahí.
- **No usar modo incógnito:** al cerrarlo se pierde todo.
- En el celular, conviene **«Agregar a pantalla de inicio»** (menú Compartir en Safari, o menú ⋮ en
  Chrome) para abrirlo como una aplicación.
- Si WhatsApp abre el enlace en su navegador interno, mejor abrirlo en Chrome o Safari (menú ⋮ →
  *Abrir en el navegador*). El navegador interno puede no conservar los datos.

---

## Parte D. Otras tareas

### Ver qué niveles están incluidos

```
npm run incluir -- --lista
```

### Quitar un nivel del juego

```
npm run incluir -- --quitar primera-parte.js
git add src/niveles
git commit -m "Quitar nivel Primera parte"
git push
```

Quienes ya lo tenían lo **conservan** en su navegador: el juego nunca borra niveles ni partidas de
nadie. Los que abran el enlace por primera vez ya no lo recibirán.

### Cambiar el nombre de un nivel

Cámbialo en *Editor de niveles → Configuración*, exporta, incluye y publica (B4 a B7). Como el
identificador interno no cambia, se actualiza el mismo nivel.

### Publicar cambios del código del juego

Igual que cualquier cambio: `git add`, `git commit` y `git push`. Las pruebas se ejecutan antes de
publicar. Si fallan, el sitio sigue mostrando la versión anterior.

### Revisar un nivel sin abrir el juego

```
npm run validar -- ~/Downloads/primera-parte.zip
```

---

## Problemas frecuentes

| Qué pasa | Qué hacer |
|---|---|
| `npm run incluir` dice «no se incluyó» | El nivel tiene errores. Revisa el informe en *Jugar → Elegir*, corrige en el editor y vuelve a exportar |
| En *Actions*, la etapa «construir» falla en *configure-pages* | Pages no está activado o no está en «GitHub Actions» (A4). Actívalo y vuelve a ejecutar el flujo |
| En *Actions*, falla la etapa «pruebas» | No se publicó nada. Ejecuta `npm test` en tu computador para ver qué falla |
| El enlace da error 404 | Espera a que el flujo termine en verde y revisa que la dirección termine en `/match-don-quijote/` |
| La otra persona no ve el nivel nuevo | Que recargue la página. Si sigue igual, revisa que el `push` incluyera `src/niveles/` (`git status` no debe mostrar archivos pendientes) |
| En tu navegador apareció un nivel «(mis cambios)» | Editaste el nivel después de exportarlo y llegó la versión publicada. La copia tiene tus cambios: revísala, y si es la buena, expórtala e inclúyela |
| `npm run incluir` advierte que el archivo pesa más de 8 MB | Las imágenes son pesadas. Reemplázalas por versiones más livianas en el editor y vuelve a exportar |
| WhatsApp no muestra la imagen de vista previa | Revisa el paso A7: la dirección de `og:image` debe ser completa, con `https://` |
| Alguien perdió sus partidas | Probablemente usó otro navegador, el modo incógnito o borró los datos de navegación. Los niveles incluidos se vuelven a instalar solos; las partidas no se pueden recuperar |

---

## Resumen para cada actualización

```
# 1. En el juego (localhost:8000): editar → Guardar → Exportar
# 2. En la Terminal:
npm run incluir -- ~/Downloads/NOMBRE-DEL-NIVEL.zip
git add src/niveles
git commit -m "Nivel …: qué cambió"
git push
# 3. Esperar el check verde en GitHub → Actions. Listo.
```
