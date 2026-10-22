@AGENTS.md

## Notas para Claude Code

- Skills del proyecto (en `.claude/skills/`):
  - `/probar`: ejecuta las pruebas que correspondan al cambio e informa el resultado real.
  - `/revisar-material`: valida un nivel o el material de demostración sin inventar contenido.
  - `/cambiar-regla`: procedimiento para modificar o añadir una regla del juego.
- Subagente `revisor-reglas` (en `.claude/agents/`): revisa un cambio contra los invariantes del
  juego. Úsalo antes de dar por terminado cualquier cambio en `src/game.js`, `src/niveles.js`,
  `src/db.js` o `src/transferencia.js`.
- Para publicar un nivel o el juego, sigue `docs/publicar-niveles.md`. No edites a mano
  `src/niveles/*.js`: se generan con `npm run incluir`.
- `.claude/settings.json` ya permite las pruebas, la validación y los comandos de git de solo
  lectura. `npm install` y `pip install` piden confirmación: el proyecto no debe tener dependencias.
