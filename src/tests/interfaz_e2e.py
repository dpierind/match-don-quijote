"""Pruebas de punta a punta de la interfaz en Chromium (Playwright).

Juega una partida completa y ejecuta las pruebas obligatorias del editor de niveles,
cerrando y volviendo a abrir el navegador para comprobar la persistencia (IndexedDB).

Ejecutar:  python3 tests/interfaz_e2e.py [carpeta_para_capturas]
Requiere:  pip install playwright && playwright install chromium
"""
import pathlib, shutil, struct, sys, tempfile, zlib, zipfile, json
from playwright.sync_api import sync_playwright

RAIZ = pathlib.Path(__file__).resolve().parent.parent
URL = (RAIZ / "index.html").as_uri()
SALIDA = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(tempfile.mkdtemp()) / "capturas"
SALIDA.mkdir(parents=True, exist_ok=True)
TMP = pathlib.Path(tempfile.mkdtemp(prefix="quijote-e2e-"))
PERFIL = TMP / "perfil"
errores, resultados = [], []


def ok(nombre, cond):
    resultados.append((nombre, bool(cond)))
    print(("OK   " if cond else "FALLA") + " " + nombre, flush=True)


def png(ancho, alto, rgb):
    fila = b"\x00" + bytes(rgb) * ancho
    datos = zlib.compress(fila * alto)
    def trozo(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + trozo(b"IHDR", struct.pack(">IIBBBBB", ancho, alto, 8, 2, 0, 0, 0)) + trozo(b"IDAT", datos) + trozo(b"IEND", b"")


IMAGEN = TMP / "molinos.png"
IMAGEN.write_bytes(png(60, 72, (150, 40, 30)))
NO_IMAGEN = TMP / "notas.txt"
NO_IMAGEN.write_text("esto no es una imagen")


def abrir(p):
    ctx = p.chromium.launch_persistent_context(str(PERFIL), viewport={"width": 1366, "height": 860}, accept_downloads=True)
    pag = ctx.pages[0] if ctx.pages else ctx.new_page()
    pag.on("pageerror", lambda e: errores.append("pageerror: " + str(e)))
    pag.on("console", lambda m: errores.append(m.text) if m.type == "error" and "fonts.g" not in str(m.location.get("url", "")) else None)
    pag.goto(URL)
    pag.wait_for_selector(".menu-principal", timeout=10000)
    return ctx, pag


def ev(pag, js):
    return pag.evaluate("(async () => { const Q = window.Quijote; " + js + " })()")


def texto_indicador(pag):
    return pag.locator("#indicador-guardado").inner_text()


def guardar(pag):
    b = pag.locator("#btn-guardar")
    if b.is_enabled():
        b.click()
    pag.wait_for_function("document.querySelector('#indicador-guardado') && document.querySelector('#indicador-guardado').innerText.startsWith('Guardado')", timeout=8000)


def ir_biblioteca(pag):
    if pag.locator("[data-accion=ir-biblioteca]").count():
        pag.locator("[data-accion=ir-biblioteca]").first.click()
    pag.wait_for_selector("h1:has-text('Biblioteca de niveles')")


def nombres_niveles(pag):
    return ev(pag, "return (await Q.db.listarNiveles()).map(n => n.nombre).sort();")


with sync_playwright() as p:
    ctx, pag = abrir(p)
    ok("se abre con IndexedDB", ev(pag, "return Q.db.modo;") == "indexeddb")
    ok("nivel de demostración creado", any("Demostración" in n for n in nombres_niveles(pag)))
    pag.screenshot(path=str(SALIDA / "01-menu.png"), full_page=True)

    # ---------------- Partida completa con el nivel de demostración ----------------
    pag.click("[data-accion=ir-jugar]")
    pag.wait_for_selector("[data-accion=elegir-nivel]")
    pag.click("[data-accion=elegir-nivel] >> nth=0")
    pag.wait_for_selector(".tabla-informe")
    ok("informe de validación antes de jugar", pag.locator(".tabla-informe").is_visible())
    pag.screenshot(path=str(SALIDA / "02-informe.png"), full_page=True)
    pag.click("[data-accion=ir-config]")
    pag.click("[data-accion=n-jugadores][data-n='4']")
    ok("4 campos de nombre", pag.locator("[data-campo^='cfg.nombre']").count() == 4)
    for i, n in enumerate(["Ana", "Benja", "Cata", "Diego"]):
        pag.fill(f"#jug-{i}", n)
    pag.fill("#arbitro", "Profe")
    pag.click("text=Barajar y preparar el tablero")
    pag.wait_for_selector("text=Comenzar a jugar")
    st = lambda expr: pag.evaluate("(() => { const s = window.Quijote.ui.partida; return " + expr + "; })()")
    ok("partida de 4 jugadores", st("s.jugadores.length") == 4)
    pag.click("text=Comenzar a jugar")
    pag.click("[data-accion=reiniciar]")
    ok("pide confirmación al reiniciar", pag.locator("text=Se eliminará esta partida").is_visible())
    pag.click("[data-accion=modal-boton]")
    pag.wait_for_selector("h1:has-text('Nueva partida')")
    pag.click("[data-accion=n-jugadores][data-n='2']")
    pag.fill("#jug-0", "Ana"); pag.fill("#jug-1", "Benja")
    pag.click("text=Barajar y preparar el tablero")
    pag.wait_for_selector("text=Comenzar a jugar")
    pag.click("text=Comenzar a jugar")
    ok("partida de 2 jugadores", st("s.jugadores.length") == 2)

    pos_ok = lambda: st("s.tablero.indexOf(s.jugada.descripcionId)")
    pos_mal = lambda: st("s.tablero.findIndex((x,i)=>x && x!==s.jugada.descripcionId && !(x in s.ganadas))")

    def elegir(pos):
        pag.click(f".tablero [data-pos='{pos}']")
        pag.click("[data-accion=confirmar-seleccion]")
        pag.click("[data-accion=abrir-arbitro]")
        pag.click("[data-accion=verificar]")

    pag.click("[data-accion=robar]")
    pag.click(f".tablero [data-pos='{pos_mal()}']")
    pag.click(f".tablero [data-pos='{pos_ok()}']")
    ok("cambiar la selección antes de confirmar", st("s.jugada.seleccion") == st("s.tablero.indexOf(s.jugada.descripcionId)"))
    pag.click(f".tablero [data-pos='{pos_mal()}']")
    pag.click("[data-accion=confirmar-seleccion]")
    ok("puerta del árbitro antes del veredicto", pag.locator("text=Soy el árbitro").is_visible() and pag.locator(".veredicto").count() == 0)
    pag.click("[data-accion=abrir-arbitro]"); pag.click("[data-accion=verificar]")
    ok("combinación incorrecta", pag.locator(".veredicto.mal").is_visible())
    pag.click("[data-accion=cerrar-incorrecta]")
    ok("turno pasa al siguiente", st("s.activo") == 1)
    pag.click("[data-accion=robar]"); elegir(pos_ok())
    ok("respuesta de referencia oculta", pag.locator(".referencia").count() == 0)
    pag.click("[data-accion=rechazar]")
    ok("respuesta rechazada no da pieza", st("s.jugadores[1].piezas.length") == 0)
    vueltas = 0
    while st("s.fase") == "juego" and vueltas < 40:
        vueltas += 1
        pag.click("[data-accion=robar]"); elegir(pos_ok())
        pag.click("[data-accion=aceptar]")
    ok("fin de la fase de juego al agotar el mazo", st("s.fase") == "transicion")
    pag.click("[data-accion=iniciar-cronologia]")
    objetivo = pag.evaluate("(() => { const s = window.Quijote.ui.partida; return MotorQuijote.ordenCorrecto(s, s.jugadores[0].piezas); })()")
    for destino, ide in enumerate(objetivo):
        actual = st(f"s.jugadores[0].orden.indexOf('{ide}')")
        while actual > destino:
            pag.click(f".coleccion >> nth=0 >> [data-accion=mover-pieza][data-i='{actual}'][data-d='-1']")
            actual -= 1
    antes = st("s.jugadores[1].orden.slice()")
    if len(antes) > 1:
        pag.drag_and_drop(".coleccion >> nth=1 >> .pieza >> nth=0", ".coleccion >> nth=1 >> .pieza >> nth=-1")
        ok("arrastrar y soltar en la cronología", st("s.jugadores[1].orden[s.jugadores[1].orden.length-1]") == antes[0])
    pag.click("[data-accion=confirmar-orden][data-j='0']"); pag.click("[data-accion=confirmar-orden][data-j='1']")
    pag.click("[data-accion=a-validacion]"); pag.click("[data-accion=validar]")
    r = st("s.resultados")
    ok("puntuación cronológica correcta", r["tabla"][0]["correctas"] == r["tabla"][0]["piezas"])
    pag.screenshot(path=str(SALIDA / "03-resultados.png"), full_page=True)
    pag.click("[data-accion=salir-partida] >> nth=0")

    # ---------------- 1. Crear un nivel y guardarlo ----------------
    pag.wait_for_selector(".menu-principal")
    pag.click("[data-accion=ir-biblioteca]")
    pag.click("[data-accion=nuevo-nivel]")
    pag.fill("#dlg-nombre", "Nivel de prueba")
    pag.fill("#dlg-desc", "Creado por la prueba automática")
    pag.click("button:has-text('Crear nivel')")
    pag.wait_for_selector(".pestanas")
    for k, (titulo, cap, orden) in enumerate([("Los molinos de viento", 8, 1), ("La aventura de los leones", 17, 2)]):
        pag.click("[data-accion=nuevo-ep]")
        pag.fill("#f-titulo", titulo)
        pag.select_option("#f-parte", "1" if k == 0 else "2")
        pag.fill("#f-capitulo", str(cap))
        pag.fill("#f-ordenCronologico", str(orden))
        pag.fill("#f-descripcion", "Descripción de prueba para " + titulo)
    ok("indicador «Cambios sin guardar»", "Cambios sin guardar" in texto_indicador(pag))
    guardar(pag)
    ok("indicador «Guardado» tras guardar", texto_indicador(pag).startswith("Guardado"))
    pag.click("[data-accion=pestana][data-p=tablero]")
    pag.click("[data-accion=llenar-vacios]")
    guardar(pag)
    guardado = ev(pag, "const n = (await Q.db.listarNiveles()).find(x => x.nombre === 'Nivel de prueba'); return {eps: n.episodios.length, tab: n.tablero.filter(Boolean).length, v: n.version};")
    ok("1. nivel creado y guardado (2 episodios en el tablero)", guardado["eps"] == 2 and guardado["tab"] == 2)

    # ---------------- 3. Añadir una pregunta ----------------
    pag.click("[data-accion=pestana][data-p=preguntas]")
    pag.click("[data-accion=sel-ep] >> nth=0")
    pag.click("[data-accion=nueva-preg]")
    pag.fill("#pq-t0", "¿Qué cree ver don Quijote en los molinos?")
    pag.fill("#pq-r0", "Gigantes")
    pag.fill("#pq-n0", "Aceptar si menciona a los gigantes")
    pag.click("[data-accion=nueva-preg]")
    pag.fill("#pq-t1", "¿A quién culpa de su derrota?")
    pag.click("[data-accion=mover-preg][data-k='1'][data-d='-1']")
    ok("reordenar preguntas", pag.locator("#pq-t0").input_value() == "¿A quién culpa de su derrota?")
    guardar(pag)

    # ---------------- 4. Subir una imagen ----------------
    pag.click("[data-accion=pestana][data-p=episodios]")
    pag.click("[data-accion=sel-ep] >> nth=0")
    desc_antes = pag.locator("#f-descripcion").input_value()
    pag.set_input_files("[data-archivo=imagen-ep]", str(NO_IMAGEN))
    pag.wait_for_selector("#toast.error")
    ok("error claro con un archivo que no es imagen", "no se admite" in pag.locator("#toast").inner_text())
    pag.set_input_files("[data-archivo=imagen-ep]", str(IMAGEN))
    pag.wait_for_selector(".vista-previa img")
    ok("vista previa de la imagen subida", pag.locator(".vista-previa img").count() == 1)
    pag.set_input_files("[data-archivo=imagen-ep]", str(IMAGEN))   # reemplazar
    pag.wait_for_timeout(300)
    ok("cambiar la imagen no altera la descripción", pag.locator("#f-descripcion").input_value() == desc_antes)
    guardar(pag)
    pag.screenshot(path=str(SALIDA / "04-editor-imagen.png"))
    pag.click("[data-accion=pestana][data-p=tablero]")
    pag.screenshot(path=str(SALIDA / "05-editor-tablero.png"))

    # ---------------- 2. Cerrar y volver a abrir ----------------
    ctx.close()
    ctx, pag = abrir(p)
    pag.click("[data-accion=ir-biblioteca]")
    pag.wait_for_selector(".tarjeta-nivel")
    ok("2. el nivel sigue tras cerrar y reabrir el navegador", "Nivel de prueba" in nombres_niveles(pag))
    pag.click(".tarjeta-nivel:has-text('Nivel de prueba') >> [data-accion=editar-nivel]")
    pag.wait_for_selector(".pestanas")
    pag.click("[data-accion=sel-ep] >> nth=0")
    pag.wait_for_selector(".vista-previa img", timeout=5000)
    ok("4. la imagen sigue disponible tras reiniciar", pag.locator(".vista-previa img").get_attribute("src").startswith("blob:"))
    pag.click("[data-accion=pestana][data-p=preguntas]")
    pag.click("[data-accion=sel-ep] >> nth=0")
    ok("3. las preguntas se conservan tras reiniciar", pag.locator("#pq-t1").input_value() == "¿Qué cree ver don Quijote en los molinos?" and pag.locator("#pq-r1").input_value() == "Gigantes")

    # ---------------- 11. Indicador, guardado automático y conflicto ----------------
    pag.click("[data-accion=pestana][data-p=configuracion]")
    pag.fill("#c-desc", "Descripción cambiada")
    ok("11a. indicador de cambios sin guardar", "Cambios sin guardar" in texto_indicador(pag))
    pag.wait_for_function("document.querySelector('#indicador-guardado').innerText.startsWith('Guardado')", timeout=8000)
    ok("11b. guardado automático", ev(pag, "return (await Q.db.listarNiveles()).find(x => x.nombre === 'Nivel de prueba').descripcion;") == "Descripción cambiada")
    # Otra «pestaña» guarda el nivel mientras aquí hay cambios pendientes
    ev(pag, "const n = await Q.db.obtenerNivel(Q.ed.nivel.id); n.descripcion = 'Cambio desde otra pestaña'; await Q.db.guardarNivel(n, {versionEsperada: n.version});")
    pag.fill("#c-desc", "Mi cambio local")
    pag.wait_for_selector(".conflicto", timeout=8000)
    ok("11c. conflicto detectado, sin sobrescribir", ev(pag, "return (await Q.db.obtenerNivel(Q.ed.nivel.id)).descripcion;") == "Cambio desde otra pestaña")
    pag.screenshot(path=str(SALIDA / "06-conflicto.png"))
    pag.click("[data-accion=conflicto-recargar]"); pag.click("[data-accion=modal-boton]")
    pag.wait_for_selector(".conflicto", state="detached")
    ok("11d. conflicto resuelto recargando la otra versión", pag.locator("#c-desc").input_value() == "Cambio desde otra pestaña")

    # ---------------- 9. Detectar un nivel incompleto ----------------
    ir_biblioteca(pag)
    pag.click(".tarjeta-nivel:has-text('Nivel de prueba') >> [data-accion=elegir-nivel]")
    pag.wait_for_selector(".tabla-informe")
    ok("9. nivel incompleto: no deja preparar la partida", pag.locator("[data-accion=ir-config]").is_disabled())
    ok("9. el informe explica el formato exigido", pag.locator("text=El formato exige 30 imágenes").count() >= 1)
    pag.screenshot(path=str(SALIDA / "07-informe-incompleto.png"), full_page=True)

    # ---------------- 5. Duplicar y modificar la copia ----------------
    pag.click("[data-accion=duplicar-y-editar]")
    pag.fill("#dlg-nombre", "Copia de prueba")
    pag.click("button:has-text('Duplicar y abrir en el editor')")
    pag.wait_for_selector(".pestanas")
    pag.click("[data-accion=sel-ep] >> nth=0")
    pag.fill("#f-titulo", "Título solo en la copia")
    guardar(pag)
    titulos = ev(pag, "const ns = await Q.db.listarNiveles(); const o = ns.find(x => x.nombre === 'Nivel de prueba'); const c = ns.find(x => x.nombre === 'Copia de prueba'); return [o.episodios.map(e=>e.titulo), c.episodios.map(e=>e.titulo), o.id !== c.id];")
    ok("5. la copia cambió y el original no", "Título solo en la copia" in titulos[1] and "Título solo en la copia" not in titulos[0] and titulos[2])

    # ---------------- 6. Exportar e importar con imágenes ----------------
    ir_biblioteca(pag)
    with pag.expect_download() as info:
        pag.click(".tarjeta-nivel:has-text('Nivel de prueba') >> [data-accion=exportar-nivel]")
    destino = TMP / "nivel-de-prueba.zip"
    info.value.save_as(str(destino))
    with zipfile.ZipFile(destino) as z:
        nombres = z.namelist()
        datos = json.loads(z.read("nivel.json"))
    imgs = [n for n in nombres if n.startswith("imagenes/")]
    refs = [e["imagen"] for e in datos["nivel"]["episodios"] if e["imagen"]]
    ok("6a. el ZIP incluye nivel.json, la imagen y rutas relativas", "nivel.json" in nombres and len(imgs) == 1 and refs == imgs)
    pag.set_input_files("[data-archivo=importar]", str(destino))
    pag.wait_for_selector("text=Ya existe un nivel con este identificador")
    ok("6b. avisa que el nivel ya existe antes de reemplazar", pag.locator("[data-accion=importar-confirmar][data-modo=reemplazar]").count() == 1)
    pag.click("[data-accion=importar-confirmar][data-modo=nuevos]")
    pag.wait_for_selector("text=importado")
    imp = ev(pag, "const ns = await Q.db.listarNiveles(); const n = ns.find(x => x.nombre === 'Nivel de prueba (importado)'); const id = n.episodios.find(e => e.imagen).imagen.slice(4); const reg = await Q.db.obtenerImagen(id); return {preg: n.episodios[0].preguntas.length, img: !!(reg && reg.blob && reg.blob.size > 50)};")
    ok("6c. el nivel importado trae su imagen y sus preguntas", imp["img"] and imp["preg"] == 2)

    # ---------------- 10. Eliminar un nivel sin afectar a otro ----------------
    antes = nombres_niveles(pag)
    pag.click(".tarjeta-nivel:has-text('Copia de prueba') >> [data-accion=eliminar-nivel]")
    ok("10a. pide confirmación nombrando el nivel", pag.locator("#t-mod").inner_text() == "Eliminar «Copia de prueba»")
    pag.click("[data-accion=modal-boton]")
    pag.wait_for_selector(".tarjeta-nivel:has-text('Copia de prueba')", state="detached")
    despues = nombres_niveles(pag)
    ok("10b. solo se eliminó ese nivel", sorted(set(antes) - set(despues)) == ["Copia de prueba"] and "Nivel de prueba" in despues)
    pag.screenshot(path=str(SALIDA / "08-biblioteca.png"), full_page=True)

    # ---------------- 7. Guardar y recuperar una partida (con jugada pendiente) ----------------
    pag.click("[data-accion=ir-menu]")
    pag.click("[data-accion=ir-jugar]")
    pag.wait_for_selector(".nivel-fila")
    pag.click(".nivel-fila:has-text('Demostración') >> [data-accion=elegir-nivel]")
    pag.wait_for_selector(".tabla-informe")
    pag.click("[data-accion=ir-config]")
    pag.click("[data-accion=n-jugadores][data-n='3']")
    for i, n in enumerate(["Luz", "Mateo", "Nora"]):
        pag.fill(f"#jug-{i}", n)
    pag.fill("#arbitro", "Profe")
    pag.click("text=Barajar y preparar el tablero")
    pag.wait_for_selector("text=Comenzar a jugar")
    pag.click("text=Comenzar a jugar")
    pag.click("[data-accion=robar]"); elegir(pos_ok()); pag.click("[data-accion=aceptar]")   # Luz gana una pieza
    pag.click("[data-accion=robar]")
    pag.click(f".tablero [data-pos='{pos_ok()}']")
    pag.click("[data-accion=confirmar-seleccion]")           # queda pendiente del árbitro
    pag.click("[data-accion=abrir-arbitro]")
    pendiente = st("({desc: s.jugada.descripcionId, sel: s.jugada.seleccion, mazo: s.mazo.slice(), id: s.id, titulo: s.episodios[s.tablero[0]].titulo, ep0: s.tablero[0]})")
    pag.keyboard.press("Escape")
    # Guardar partida (el botón está bajo el panel del árbitro: se usa la acción directamente)
    ev(pag, "await Q.guardarPartida(true);")

    # ---------------- 8. Modificar el nivel tras guardar la partida ----------------
    ev(pag, "Q.ui.partida = null; Q.ir('menu'); Q.render();")
    nivel_demo = ev(pag, "const n = (await Q.db.listarNiveles()).find(x => x.nombre.startsWith('Demostración')); return n.id;")
    ev(pag, f"const n = await Q.db.obtenerNivel('{nivel_demo}'); const e = n.episodios.find(x => x.id === '{pendiente['ep0']}'); e.titulo = 'TÍTULO EDITADO DESPUÉS'; await Q.db.guardarNivel(n, {{versionEsperada: n.version}});")
    ctx.close()
    ctx, pag = abrir(p)
    st = lambda expr: pag.evaluate("(() => { const s = window.Quijote.ui.partida; return " + expr + "; })()")
    pag.click("[data-accion=ir-partidas]")
    pag.click(".nivel-fila:has-text('Luz') >> [data-accion=continuar-partida]")
    pag.wait_for_selector("[data-accion=confirmar-continuar]")
    ok("7a. pantalla de confirmación con nivel, jugadores y estado", pag.locator("text=Luz, Mateo, Nora").count() == 1 and pag.locator("text=Jugada pendiente:").count() == 1)
    pag.screenshot(path=str(SALIDA / "09-continuar.png"), full_page=True)
    pag.click("[data-accion=confirmar-continuar]")
    ok("7b. la partida se recupera en el mismo punto", st("s.jugada && s.jugada.etapa") == "verificacion" and st("s.jugada.descripcionId") == pendiente["desc"] and st("JSON.stringify(s.mazo)") == json.dumps(pendiente["mazo"], separators=(",", ":")))
    ok("7c. piezas y jugador activo conservados", st("s.jugadores[0].piezas.length") == 1 and st("s.activo") == 1)
    ok("7d. el árbitro retoma desde su puerta", pag.locator("text=Soy el árbitro").is_visible())
    ok("8. la partida usa la versión original del nivel", st(f"s.episodios['{pendiente['ep0']}'].titulo") == pendiente["titulo"] and pendiente["titulo"] != "TÍTULO EDITADO DESPUÉS")
    pag.click("[data-accion=abrir-arbitro]"); pag.click("[data-accion=verificar]")
    ok("la jugada recuperada se puede resolver", pag.locator(".veredicto.ok").is_visible())
    pag.click("[data-accion=aceptar]")

    # Eliminar partida guardada
    pag.click("[data-accion=salir-partida] >> nth=0")
    pag.wait_for_selector(".menu-principal")
    pag.click("[data-accion=ir-partidas]")
    pag.wait_for_selector(".nivel-fila")
    n_antes = pag.locator(".nivel-fila").count()
    pag.click(".nivel-fila:has-text('Luz') >> [data-accion=eliminar-partida]")
    pag.click("[data-accion=modal-boton]")
    pag.wait_for_timeout(300)
    ok("eliminar partida guardada", pag.locator(".nivel-fila").count() == n_antes - 1)

    # Copia de seguridad de la biblioteca
    pag.click("[data-accion=ir-menu]"); pag.wait_for_selector(".menu-principal"); pag.click("[data-accion=ir-biblioteca]"); pag.wait_for_selector(".tarjeta-nivel")
    with pag.expect_download() as info:
        pag.click("[data-accion=exportar-biblioteca]")
    copia = TMP / "biblioteca.zip"
    info.value.save_as(str(copia))
    with zipfile.ZipFile(copia) as z:
        b = json.loads(z.read("biblioteca.json"))
    ok("copia de seguridad con todos los niveles", len(b["niveles"]) == len(nombres_niveles(pag)))

    # Teléfono en modo oscuro
    movil = ctx.new_page()
    movil.set_viewport_size({"width": 390, "height": 844})
    movil.emulate_media(color_scheme="dark")
    movil.goto(URL); movil.wait_for_selector(".menu-principal")
    movil.click("[data-accion=ir-biblioteca]"); movil.wait_for_selector(".tarjeta-nivel")
    movil.click("[data-accion=editar-nivel] >> nth=0"); movil.wait_for_selector(".pestanas")
    ok("sin desplazamiento horizontal en el teléfono (editor)", movil.evaluate("document.documentElement.scrollWidth") <= 390)
    movil.screenshot(path=str(SALIDA / "10-movil-editor.png"), full_page=True)
    ctx.close()

ok("sin errores de JavaScript", not errores)
if errores:
    print("\n".join(errores))
shutil.rmtree(TMP, ignore_errors=True)
fallas = [n for n, c in resultados if not c]
print(f"\n{len(resultados) - len(fallas)} de {len(resultados)} comprobaciones superadas")
sys.exit(1 if fallas else 0)
