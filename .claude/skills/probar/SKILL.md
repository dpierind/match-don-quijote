---
name: probar
description: Ejecuta las pruebas de El match con Don Quijote que corresponden al cambio actual (motor, niveles, interfaz) e informa el resultado real. Usar antes de dar por terminado cualquier cambio de código.
---

# Probar el proyecto

1. Mira qué cambió (`git status` y `git diff --stat`). Si no hay git, usa los archivos que editaste en esta sesión.
2. Ejecuta siempre `npm test`, que cubre motor, niveles, ZIP, almacenamiento y transferencia.
3. Si cambió algo de `src/ui-*.js`, `src/app.js`, `src/index.html` o `src/styles.css`, ejecuta además
   `npm run test:e2e`.
   - Si Playwright o Chromium no están instalados, no los instales sin preguntar: indica la prueba como **pendiente**.
   - El script acepta una carpeta para capturas: `python3 src/tests/interfaz_e2e.py <carpeta>`.
     Si cambiaste la apariencia, revisa las capturas.
4. Si algo falla:
   - Lee el error y la prueba antes de tocar código.
   - Distingue un fallo del programa de un fallo de la prueba. Corrige la causa, no la comprobación.
   - Nunca debilites una prueba que protege un invariante de `AGENTS.md` para que pase.
5. Si añadiste una regla o un flujo nuevo, comprueba que tiene su prueba. Si no, escríbela.
6. Informa en pocas líneas:
   - qué pruebas ejecutaste y cuántas pasaron, con las cifras de la salida;
   - qué quedó pendiente y por qué.

No digas que algo funciona si no lo ejecutaste.
