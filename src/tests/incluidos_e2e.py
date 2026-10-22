"""Prueba en Chromium de los niveles incluidos (src/niveles/).

Copia src/ a una carpeta temporal, incluye un nivel con «npm run incluir», abre el juego
(con servidor local y con doble clic) y comprueba la instalación, la actualización y que los
cambios locales se conservan como copia.

Ejecutar:  python3 src/tests/incluidos_e2e.py
"""
import http.server, json, pathlib, shutil, struct, subprocess, sys, tempfile, threading, zlib, functools
from playwright.sync_api import sync_playwright

SRC = pathlib.Path(__file__).resolve().parent.parent
TMP = pathlib.Path(tempfile.mkdtemp(prefix="quijote-incluidos-"))
SITIO = TMP / "src"
shutil.copytree(SRC, SITIO, ignore=shutil.ignore_patterns("__pycache__"))
for f in (SITIO / "niveles").glob("*.js"):
    if f.name != "indice.js":
        f.unlink()
resultados, errores = [], []


def ok(nombre, cond):
    resultados.append((nombre, bool(cond)))
    print(("OK   " if cond else "FALLA") + " " + nombre, flush=True)


def png(rgb):
    fila = b"\x00" + bytes(rgb) * 40
    def trozo(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + trozo(b"IHDR", struct.pack(">IIBBBBB", 40, 48, 8, 2, 0, 0, 0)) + trozo(b"IDAT", zlib.compress(fila * 48)) + trozo(b"IEND", b"")


def exportar(titulo_ep3, nombre_zip):
    """Crea con Node un nivel exportado, con una imagen, como lo haría el Editor de niveles."""
    script = f"""
const fs=require('fs'),N=require('{SITIO}/niveles.js'),A=require('{SITIO}/db.js'),T=require('{SITIO}/transferencia.js');
(async()=>{{
 const w={{}};new Function('window',fs.readFileSync('{SITIO}/data/episodes.js','utf8'))(w);
 const db=await A.abrir({{forzarMemoria:true}});
 const n=N.desdeMaterialAntiguo(w.MATERIAL_QUIJOTE,{{nombre:'Primera parte del grupo'}});
 n.id='nivel-grupo-1'; n.episodios[2].titulo={json.dumps(titulo_ep3)};
 const img=await db.guardarImagen({{blob:new Blob([fs.readFileSync('{TMP}/img.png')],{{type:'image/png'}}),tipo:'image/png'}});
 n.episodios[0].imagen='img:'+img;
 const r=await T.exportarNivel(await db.guardarNivel(n),db);
 fs.writeFileSync('{TMP}/{nombre_zip}',r.bytes);
}})();"""
    subprocess.run(["node", "-e", script], check=True)
    r = subprocess.run(["node", str(SITIO / "tools/incluir-nivel.js"), str(TMP / nombre_zip)], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr


(TMP / "img.png").write_bytes(png((150, 40, 30)))
exportar("Sancho se convierte en escudero", "v1.zip")

class Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


Manejador = functools.partial(Silencioso, directory=str(SITIO))
servidor = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Manejador)
threading.Thread(target=servidor.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{servidor.server_address[1]}/index.html"


def abrir(ctx, url):
    pag = ctx.new_page()
    pag.on("pageerror", lambda e: errores.append(str(e)))
    pag.on("console", lambda m: errores.append(m.text) if m.type == "error" and "fonts.g" not in str(m.location.get("url", "")) else None)
    pag.goto(url)
    pag.wait_for_selector(".menu-principal", timeout=15000)
    return pag


def niveles(pag):
    return pag.evaluate("(async () => (await Quijote.db.listarNiveles()).map(n => ({nombre: n.nombre, origen: !!n.origen && n.origen.id === n.id, t3: (n.episodios[2]||{}).titulo, img: (n.episodios[0]||{}).imagen})))()")


with sync_playwright() as p:
    nav = p.chromium.launch()

    # --- Con servidor (como en GitHub Pages) ---
    ctx = nav.new_context()
    pag = abrir(ctx, URL)
    ns = niveles(pag)
    ok("instala el nivel incluido al abrir", len(ns) == 1 and ns[0]["nombre"] == "Primera parte del grupo" and ns[0]["origen"])
    ok("no crea la demostración si el juego trae niveles", not any("Demostración" in n["nombre"] for n in ns))
    ok("la imagen se guarda en el navegador", ns[0]["img"].startswith("img:"))
    ok("avisa del nivel nuevo", "Nivel nuevo: Primera parte del grupo" in pag.locator("#toast").inner_text())
    pag.click("[data-accion=ir-biblioteca]")
    pag.wait_for_selector(".tarjeta-nivel")
    ok("etiqueta «Incluido en el juego»", pag.locator(".chip-incluido").inner_text() == "Incluido en el juego")
    pag.click("[data-accion=editar-nivel]")
    pag.wait_for_selector(".pestanas")
    ok("aviso en el editor", pag.locator(".aviso-incluido").is_visible())
    ok("la imagen se ve en el editor", pag.locator(".item-ep img").count() >= 1)
    pag.close()

    # Recarga sin cambios: nada que avisar
    pag = abrir(ctx, URL)
    pag.wait_for_timeout(600)
    ok("sin cambios: no reinstala ni avisa", len(niveles(pag)) == 1 and pag.locator("#toast").count() == 0)
    pag.close()

    # El autor publica la versión 2
    exportar("Sancho, escudero (versión 2)", "v2.zip")
    pag = abrir(ctx, URL)
    ns = niveles(pag)
    ok("actualiza el nivel al publicar una versión nueva", len(ns) == 1 and ns[0]["t3"] == "Sancho, escudero (versión 2)")
    ok("avisa de la actualización", "Nivel actualizado" in pag.locator("#toast").inner_text())

    # El destinatario edita el nivel en su navegador
    pag.click("[data-accion=ir-biblioteca]")
    pag.click("[data-accion=editar-nivel]")
    pag.wait_for_selector(".pestanas")
    pag.click("[data-accion=pestana][data-p=configuracion]")
    pag.fill("#c-desc", "Mis notas locales")
    pag.click("#btn-guardar")
    pag.wait_for_function("document.querySelector('#indicador-guardado').innerText.startsWith('Guardado')")
    pag.click("[data-accion=ir-biblioteca]")
    pag.wait_for_selector(".tarjeta-nivel")
    try:
        pag.wait_for_selector(".chip-incluido:has-text('con cambios locales')", timeout=5000)
        ok("etiqueta «con cambios locales»", True)
    except Exception:
        ok("etiqueta «con cambios locales»", False)
    pag.close()

    # Versión 3: los cambios locales se conservan como copia
    exportar("Sancho, escudero (versión 3)", "v3.zip")
    pag = abrir(ctx, URL)
    ns = sorted(niveles(pag), key=lambda n: n["nombre"])
    ok("conserva los cambios locales como copia", [n["nombre"] for n in ns] == ["Primera parte del grupo", "Primera parte del grupo (mis cambios)"])
    ok("la copia no queda marcada como incluida", not ns[1]["origen"])
    ok("el incluido queda en la versión 3", ns[0]["t3"] == "Sancho, escudero (versión 3)")
    ok("avisa dónde quedaron los cambios", "se guardaron como «Primera parte del grupo (mis cambios)»" in pag.locator("#toast").inner_text())
    pag.close()
    ctx.close()

    # --- Abriendo el archivo con doble clic (file://) ---
    ctx = nav.new_context()
    pag = abrir(ctx, (SITIO / "index.html").as_uri())
    ns = niveles(pag)
    ok("también funciona abriendo el archivo con doble clic", len(ns) == 1 and ns[0]["t3"] == "Sancho, escudero (versión 3)")
    pag.close()
    ctx.close()

    # --- Nivel quitado del juego: quienes lo tenían lo conservan ---
    subprocess.run(["node", str(SITIO / "tools/incluir-nivel.js"), "--quitar", "nivel-grupo-1"], check=True, capture_output=True)
    ctx = nav.new_context()
    pag = abrir(ctx, URL)
    ok("sin niveles incluidos vuelve a crear la demostración", any("Demostración" in n["nombre"] for n in niveles(pag)))
    ctx.close()
    nav.close()

servidor.shutdown()
ok("sin errores de JavaScript", not errores)
if errores:
    print("\n".join(errores))
shutil.rmtree(TMP, ignore_errors=True)
fallas = [n for n, c in resultados if not c]
print(f"\n{len(resultados) - len(fallas)} de {len(resultados)} comprobaciones superadas")
sys.exit(1 if fallas else 0)
