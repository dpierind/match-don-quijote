@AGENTS.md

## Notas para Claude Code

- Skills del proyecto (en `.claude/skills/`):
  - `/probar`: ejecuta las pruebas que correspondan al cambio e informa el resultado real.
  - `/revisar-material`: valida un nivel o el material de demostración sin inventar contenido.
  - `/cambiar-regla`: procedimiento para modificar o añadir una regla del juego.
- Subagente `revisor-reglas` (en `.claude/agents/`): revisa un cambio contra los invariantes del
  juego. Úsalo antes de dar por terminado cualquier cambio en `src/game.js`, `src/niveles.js`,
  `src/db.js` o `src/transferencia.js`.
- El juego publicado usa niveles compartidos en Cloudflare (`docs/servidor-compartido.md`). Para
  probar ese modo, usa `npm run compartido`; cualquier cambio en `src/servidor/api.js` o
  `src/remoto.js` necesita `npm test` y `python3 src/tests/compartido_e2e.py`.
- Para incluir niveles dentro del juego, sigue `docs/publicar-niveles.md`. No edites a mano
  `src/niveles/*.js`: se generan con `npm run incluir`.
- `.claude/settings.json` ya permite las pruebas, la validación y los comandos de git de solo
  lectura. `npm install` y `pip install` piden confirmación: el proyecto no debe tener dependencias.
