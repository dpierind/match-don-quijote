"""Prueba en Chromium del modo compartido: dos personas usan el juego a la vez, como durante
una demostración.

Ejecutar:
  python3 src/tests/compartido_e2e.py
      contra el servidor local (src/tools/servidor-local.js); incluye clave y falta de conexión.
  python3 src/tests/compartido_e2e.py --url https://SU-SITIO [--clave LA-CLAVE]
      contra el sitio publicado: dos navegadores crean, ven y editan un nivel de prueba, y al
      final lo eliminan. No modifica los niveles existentes.
Requiere Node 22.13+ y Playwright.
"""
import pathlib, socket, struct, subprocess, sys, tempfile, time, zlib, shutil
from playwright.sync_api import sync_playwright

SRC = pathlib.Path(__file__).resolve().parent.parent
TMP = pathlib.Path(tempfile.mkdtemp(prefix="quijote-compartido-"))
resultados, errores, procesos = [], [], []
URL_EXTERNA = sys.argv[sys.argv.index("--url") + 1] if "--url" in sys.argv else None
CLAVE = sys.argv[sys.argv.index("--clave") + 1] if "--clave" in sys.argv else ""
creados = []


def ok(nombre, cond):
    resultados.append((nombre, bool(cond)))
    print(("OK   " if cond else "FALLA") + " " + nombre, flush=True)


def puerto_libre():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def arrancar(puerto, *extra):
    p = subprocess.Popen(["node", str(SRC / "tools/servidor-local.js"), "--memoria", "--puerto", str(puerto), *extra],
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    procesos.append(p)
    for _ in range(100):
        try:
            socket.create_connection(("127.0.0.1", puerto), timeout=0.2).close()
            return p
        except OSError:
            time.sleep(0.1)
    raise RuntimeError("El servidor local no arrancó: " + (p.stdout.read() if p.stdout else ""))


def png(rgb):
    fila = b"\x00" + bytes(rgb) * 40
    def trozo(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + trozo(b"IHDR", struct.pack(">IIBBBBB", 40, 48, 8, 2, 0, 0, 0)) + trozo(b"IDAT", zlib.compress(fila * 48)) + trozo(b"IEND", b"")


IMAGEN = TMP / "molino.png"
IMAGEN.write_bytes(png((40, 90, 150)))


def abrir(nav, url, clave=""):
    ctx = nav.new_context(viewport={"width": 1366, "height": 860})
    if clave:
        ctx.add_init_script("try { localStorage.setItem('matchQuijote.pref.claveGrupo', JSON.stringify(%s)); } catch (e) {}" % repr(clave).replace("'", '"'))
    pag = ctx.new_page()
    pag.on("pageerror", lambda e: errores.append(str(e)))
    pag.on("console", lambda m: errores.append(m.text) if m.type == "error" and "fonts.g" not in str(m.location.get("url", "")) and "status of 40" not in m.text and "ERR_FAILED" not in m.text else None)
    pag.goto(url)
    pag.wait_for_selector(".menu-principal", timeout=15000)
    return ctx, pag


def niveles_servidor(pag):
    return pag.evaluate("(async () => (await Quijote.db.listarNiveles()).map(n => n.nombre).sort())()")


try:
    with sync_playwright() as p:
        nav = p.chromium.launch()
        if URL_EXTERNA:
            URL = URL_EXTERNA.rstrip("/") + "/"
        else:
            puerto = puerto_libre()
            arrancar(puerto)
            URL = f"http://127.0.0.1:{puerto}/"

        ctx_a, ana = abrir(nav, URL, CLAVE)
        ctx_b, beto = abrir(nav, URL, CLAVE)
        modo_ok = ana.evaluate("Quijote.compartido()") and beto.evaluate("Quijote.compartido()")
        ok("detecta el servidor y entra en modo compartido", modo_ok)
        if not modo_ok:
            print("  Detección:", ana.evaluate("JSON.stringify(Quijote.deteccion)"))
            raise SystemExit(1)
        demos = [n for n in niveles_servidor(beto) if n.startswith("Demostración")]
        ok("la demostración existe una sola vez para todos", len(demos) == 1)
        ok("el menú muestra «Niveles compartidos en línea»", "Niveles compartidos en línea" in ana.locator(".chip-modo").inner_text())
        ana.click("[data-accion=ver-estado]")
        ana.click("[data-accion=probar-servidor]")
        ana.wait_for_selector(".lista-prueba li >> nth=2", timeout=10000)
        ok("el panel de estado prueba guardar, ver y eliminar en el servidor", ana.locator(".lista-prueba .bien").count() == 3)
        ana.click("[data-accion=cerrar-estado]")

        # Beto deja abierta la pantalla «Jugar»
        beto.click("[data-accion=ir-jugar]")
        beto.wait_for_selector(".nivel-fila")

        # Ana crea un nivel con imagen
        ana.click("[data-accion=ir-biblioteca]")
        ana.wait_for_selector(".caja-compartida")
        ok("la biblioteca indica que los niveles son compartidos", "Niveles compartidos" in ana.locator(".caja-compartida").inner_text())
        ana.click("[data-accion=nuevo-nivel]")
        ana.fill("#dlg-nombre", "Nivel en vivo")
        ana.click("button:has-text('Crear nivel')")
        ana.wait_for_selector(".pestanas")
        creados.append(ana.evaluate("Quijote.ed.nivel.id"))
        ana.click("[data-accion=nuevo-ep]")
        ana.fill("#f-titulo", "Los molinos de viento")
        ana.fill("#f-capitulo", "8")
        ana.fill("#f-ordenCronologico", "1")
        ana.fill("#f-descripcion", "El caballero confunde unos molinos con gigantes.")
        ana.set_input_files("[data-archivo=imagen-ep]", str(IMAGEN))
        ana.wait_for_selector(".vista-previa img")
        ana.click("#btn-guardar")
        ana.wait_for_function("document.querySelector('#indicador-guardado').innerText.startsWith('Guardado en el servidor')", timeout=8000)
        ok("el indicador dice «Guardado en el servidor»", True)

        # Beto lo ve aparecer sin recargar
        try:
            beto.wait_for_selector(".nivel-fila:has-text('Nivel en vivo')", timeout=15000)
            ok("el nivel nuevo aparece solo en la pantalla del otro jugador", True)
        except Exception:
            ok("el nivel nuevo aparece solo en la pantalla del otro jugador", False)

        # Beto abre el mismo nivel en el editor y ve la imagen que subió Ana
        beto.click("[data-accion=ir-menu]")
        beto.wait_for_selector(".menu-principal")
        beto.click("[data-accion=ir-biblioteca]")
        beto.click(".tarjeta-nivel:has-text('Nivel en vivo') >> [data-accion=editar-nivel]")
        beto.wait_for_selector(".pestanas")
        beto.wait_for_selector(".item-ep img", timeout=8000)
        ok("la imagen subida por una persona se ve en el otro navegador", beto.locator(".item-ep img").get_attribute("src").startswith("blob:"))

        # Ana cambia el nivel: el editor de Beto (sin cambios pendientes) carga la versión nueva
        ana.click("[data-accion=pestana][data-p=configuracion]")
        ana.fill("#c-desc", "Descripción escrita por Ana")
        ana.click("#btn-guardar")
        ana.wait_for_function("document.querySelector('#indicador-guardado').innerText.startsWith('Guardado en el servidor')", timeout=8000)
        beto.click("[data-accion=pestana][data-p=configuracion]")
        try:
            beto.wait_for_function("document.querySelector('#c-desc') && document.querySelector('#c-desc').value === 'Descripción escrita por Ana'", timeout=15000)
            ok("el editor del otro jugador se actualiza solo si no tiene cambios pendientes", True)
        except Exception:
            ok("el editor del otro jugador se actualiza solo si no tiene cambios pendientes", False)

        # Conflicto: Beto escribe y, antes de que se guarde, Ana guarda otra versión
        beto.evaluate("Quijote.ed.autoguardado = false")
        beto.fill("#c-desc", "Cambio de Beto")
        ana.evaluate("(async () => { const n = await Quijote.db.obtenerNivel(Quijote.ed.nivel.id); n.nombre = 'Nivel en vivo (Ana)'; await Quijote.db.guardarNivel(n, {versionEsperada: n.version}); })()")
        beto.click("#btn-guardar")
        beto.wait_for_selector(".conflicto", timeout=8000)
        ok("dos personas editando a la vez: conflicto sin sobrescribir", "Otra persona guardó" in beto.locator(".conflicto").inner_text()
           and "Nivel en vivo (Ana)" in niveles_servidor(beto))
        beto.click("[data-accion=conflicto-copia]")
        beto.fill("#dlg-nombre", "Versión de Beto")
        beto.click("button:has-text('Guardar copia')")
        beto.wait_for_function("document.querySelector('#indicador-guardado') && document.querySelector('#indicador-guardado').innerText.startsWith('Guardado en el servidor')", timeout=8000)
        ok("los cambios en conflicto se pueden guardar como copia compartida", "Versión de Beto" in niveles_servidor(ana))
        creados.append(beto.evaluate("Quijote.ed.nivel.id"))
        beto.screenshot(path=str(TMP / "beto.png"))

        # Partidas: quedan en cada navegador
        ana.click("[data-accion=ir-menu-editor]")
        ana.wait_for_selector(".menu-principal")
        ana.click("[data-accion=ir-jugar]")
        ana.click(".nivel-fila:has-text('Demostración') >> [data-accion=elegir-nivel]")
        ana.click("[data-accion=ir-config]")
        ana.fill("#jug-0", "Ana"); ana.fill("#jug-1", "Luis"); ana.fill("#arbitro", "Profe")
        ana.click("text=Barajar y preparar el tablero")
        ana.wait_for_selector("text=Comenzar a jugar")
        ok("las partidas se guardan en cada navegador, no en el servidor",
           ana.evaluate("(async () => (await Quijote.db.listarPartidas()).length)()") == 1
           and beto.evaluate("(async () => (await Quijote.db.listarPartidas()).length)()") == 0)
        if URL_EXTERNA:
            # Limpieza: elimina los niveles de prueba del sitio publicado.
            for nid in creados:
                ana.evaluate("(async (id) => { try { await Quijote.db.eliminarNivel(id); } catch (e) {} })", nid)
            ok("se eliminaron los niveles de prueba", not any(n.startswith(("Nivel en vivo", "Versión de Beto")) for n in niveles_servidor(ana)))
            ana.evaluate("(async () => { for (const p of await Quijote.db.listarPartidas()) await Quijote.db.eliminarPartida(p.id); })()")
            ctx_a.close(); ctx_b.close()
            nav.close()
            raise SystemExit(0)
        ctx_a.close(); ctx_b.close()

        # ---------- Sitio publicado sin la API (Worker sin configurar) ----------
        ctx_w, wendy = abrir(nav, URL)
        wendy.route("**/api/estado", lambda ruta: ruta.fulfill(status=200, content_type="text/html", body="<!doctype html><html><title>El match con Don Quijote</title></html>"))
        wendy.reload()
        wendy.wait_for_selector(".menu-principal", timeout=20000)
        ok("sitio sin API: el juego avisa en vez de quedar en modo local en silencio",
           not wendy.evaluate("Quijote.compartido()") and "Sin conexión con el servidor" in wendy.locator(".chip-modo").inner_text()
           and wendy.locator("text=devuelve una página en lugar de la API").count() >= 1)
        ctx_w.close()

        # ---------- Servidor con clave del grupo ----------
        puerto2 = puerto_libre()
        arrancar(puerto2, "--clave", "molinos")
        ctx_c, carla = abrir(nav, f"http://127.0.0.1:{puerto2}/")
        carla.click("[data-accion=ir-biblioteca]")
        carla.wait_for_selector(".caja-compartida")
        ok("sin clave, la biblioteca pide escribirla", "necesitan la clave del grupo" in carla.locator(".caja-compartida").inner_text())
        carla.click("[data-accion=nuevo-nivel]")
        carla.fill("#dlg-nombre", "Con clave")
        carla.click("button:has-text('Crear nivel')")
        carla.wait_for_selector("#clave-grupo", timeout=8000)
        ok("al intentar crear sin clave aparece la ventana de la clave", carla.locator("#t-clave").is_visible())
        carla.fill("#clave-grupo", "gigantes")
        carla.click("button:has-text('Guardar clave')")
        try:
            carla.wait_for_selector("#toast:has-text('no es correcta')", timeout=8000)
            ok("una clave incorrecta se rechaza con un mensaje claro", True)
        except Exception:
            ok("una clave incorrecta se rechaza con un mensaje claro", False)
        carla.fill("#clave-grupo", "molinos")
        carla.click("button:has-text('Guardar clave')")
        carla.wait_for_selector("#clave-grupo", state="detached")
        carla.click("[data-accion=nuevo-nivel]")
        carla.fill("#dlg-nombre", "Con clave")
        carla.click("button:has-text('Crear nivel')")
        carla.wait_for_selector(".pestanas")
        ok("con la clave correcta se puede crear", "Con clave" in niveles_servidor(carla))
        ctx_c.close()

        # ---------- Sin conexión y luego «Subir al servidor» ----------
        puerto3 = puerto_libre()
        arrancar(puerto3)
        ctx_d, dani = abrir(nav, f"http://127.0.0.1:{puerto3}/")
        # Simula que la API no responde (la página sí carga, como desde la red de Cloudflare).
        dani.route("**/api/**", lambda ruta: ruta.abort())
        dani.reload()
        dani.wait_for_selector(".menu-principal", timeout=20000)
        ok("sin servidor, avisa y sigue funcionando en este navegador",
           not dani.evaluate("Quijote.compartido()") and dani.locator("text=No hay conexión con el servidor").count() == 1)
        dani.evaluate("(async () => { const n = NivelesQuijote.nuevoNivel({ nombre: 'Creado sin conexión' }); await Quijote.db.guardarNivel(n); })()")
        dani.unroute("**/api/**")
        dani.reload()
        dani.wait_for_selector(".menu-principal", timeout=20000)
        dani.click("[data-accion=ir-biblioteca]")
        dani.wait_for_selector(".solo-locales")
        ok("los niveles creados sin conexión aparecen para subirlos (sin la demostración local)",
           "Creado sin conexión" in dani.locator(".solo-locales").inner_text() and dani.locator(".solo-locales .nivel-fila").count() == 1)
        dani.click("[data-accion=subir-local]")
        dani.click("[data-accion=modal-boton]")
        dani.wait_for_selector(".solo-locales", state="detached", timeout=8000)
        ok("«Subir al servidor» lo comparte y quita la copia local", "Creado sin conexión" in niveles_servidor(dani))
        ctx_d.close()
        nav.close()
except SystemExit:
    pass
finally:
    for pr in procesos:
        if pr.poll() is None:
            pr.terminate()

ok("sin errores de JavaScript", not errores)
if errores:
    print("\n".join(errores[:10]))
shutil.rmtree(TMP, ignore_errors=True)
fallas = [n for n, c in resultados if not c]
print(f"\n{len(resultados) - len(fallas)} de {len(resultados)} comprobaciones superadas")
sys.exit(1 if fallas else 0)
