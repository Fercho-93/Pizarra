# Política de auditoría de datos de Pizarra

## Alcance inicial

La primera fase cubre los jugadores disponibles en dificultad Fácil (`sitelinks >= 60`). Cada dato se audita como una afirmación independiente: identidad, nacimiento, nacionalidad, posición y relación jugador–club.

## Qué significa cada campo

- **Jugó en un club:** disputó al menos un partido oficial con el primer equipo. No cuentan cantera, filial, periodos de prueba ni etapas como entrenador. Una cesión sí cuenta si hubo participación oficial.
- **Posición:** categoría amplia reconocida por una fuente: Portero, Defensa, Centrocampista o Delantero. Se pueden conservar varias si la trayectoria acredita un cambio real de demarcación.
- **Nacionalidad:** se separará en el futuro la ciudadanía de la selección representada. Hasta entonces, cualquier conflicto entre ambas se marca para revisión y no se corrige automáticamente.
- **Fechas:** los años de inicio y fin deben referirse a la etapa en el primer equipo. `end: null` solo significa que la relación estaba vigente en la fecha de comprobación.
- **Dorsal:** siempre es un dato actual y debe incluir fecha de consulta.

## Jerarquía de evidencias

1. Perfil, plantilla, comunicado o memoria oficial del club.
2. Competición, federación nacional, UEFA o FIFA.
3. Wikipedia con revisión permanente y referencias identificables.
4. Prensa fiable que cite el fichaje, debut, salida o nacionalidad.

Wikidata se usa para descubrir y comparar datos, no como confirmación independiente de una importación que ya procede de Wikidata. Transfermarkt puede orientar una revisión manual, pero no se extrae automáticamente.

## Estados

- `verified`: la evidencia respalda la afirmación.
- `conflict`: una fuente presenta un dato diferente.
- `incomplete`: falta información necesaria.
- `pending`: todavía no existe evidencia suficiente.
- `not-applicable`: el campo no corresponde al jugador o al modo de juego.

## Reglas de corrección

- Una coincidencia Wikipedia–Wikidata sirve para priorizar, pero no reemplaza una fuente primaria cuando el dato es reciente o existe una discrepancia.
- Nunca se modifica automáticamente un dato en conflicto.
- Toda corrección incluye URL, editor, fecha de consulta y campos respaldados.
- Las correcciones auditadas viven en `data/official-corrections.js`, separadas de la importación original.
- El informe debe conservar tanto los aciertos como los conflictos y pendientes.

## Criterio para los juegos

Las relaciones conflictivas no deben utilizarse para generar una cuadrícula. Cuando la cobertura de evidencias sea suficiente, Fácil se limitará a datos `verified`; hasta entonces, las exclusiones se aplicarán únicamente a conflictos confirmados para evitar vaciar el juego.

