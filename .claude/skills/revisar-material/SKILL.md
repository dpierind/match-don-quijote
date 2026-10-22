---
name: revisar-material
description: Revisa un nivel exportado (.zip o .json), una copia de seguridad o el material de demostración de El match con Don Quijote. Informa errores, avisos y dudas literarias sin inventar ni completar contenido.
---

# Revisar el material de un nivel

Entrada: la ruta a un `.zip`, `.json` o `src/data/episodes.js`. Si no te la dan, pregunta cuál revisar.

1. Ejecuta `npm run validar -- <archivo> --json` y lee el informe:
   - código de salida 0: se puede jugar;
   - 1: tiene errores;
   - 2: no se pudo leer.
2. Resume para el grupo, en español y sin jerga técnica:
   - si el nivel se puede jugar y si cumple el formato (por defecto, 30 imágenes en 6 × 5);
   - los **errores** que impiden jugar, agrupados por episodio;
   - las **advertencias**: sin imagen, sin preguntas, preguntas sin respuesta de referencia, capítulos fuera de rango.
3. Revisión literaria. Señala como **dudas**, no como hechos, los datos que conviene verificar con
   la edición de referencia del grupo:
   - capítulos que no corresponden al episodio descrito;
   - órdenes cronológicos que no siguen la secuencia de la novela;
   - descripciones que parecen citas textuales sin fuente;
   - respuestas de referencia discutibles.

   Indica tu grado de seguridad.
4. **No completes campos vacíos ni inventes** episodios, capítulos, citas o respuestas. Si el
   usuario pide redactar contenido nuevo:
   - escribe paráfrasis propias;
   - márcalo como provisional;
   - recuerda que el grupo debe verificarlo.
5. No modifiques el archivo revisado salvo que te lo pidan. Si te lo piden con un nivel exportado,
   lo correcto es editarlo en la aplicación (Editor de niveles) o generar un archivo nuevo, nunca
   sobrescribir el original.

Referencias: `docs/formato-nivel.md` (campos y validación) y `AGENTS.md` (sección «Contenido literario»).
