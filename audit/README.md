# Auditoría de datos · dificultad Fácil

Fecha: 26 de agosto de 2026

## Resultado

- 369 jugadores y 1.037 relaciones jugador–club comprobados automáticamente.
- 369 artículos comparados con una revisión permanente de Wikipedia (enlace con `oldid`).
- 72 alertas críticas revisadas manualmente mediante 64 registros de evidencia.
- 63 conflictos confirmados; 64 jugadores reciben alguna corrección contrastada.
- Alertas críticas internas: 72 antes, 0 después.
- No quedan posiciones vacías en los jugadores de dificultad Fácil.

## Qué se corrigió

- El generador ya conserva por separado las distintas etapas de un jugador en el mismo club.
- Se retiraron etapas de cantera que se estaban contando como primer equipo.
- Se completaron posiciones respaldadas por clubes o federaciones.
- Se corrigieron casos individuales como Rüdiger, Leão, Arteta, Origi y Lampard.
- Los clubes se identifican por QID y por alias; no solo por el nombre visible.

## Qué sigue abierto

Quedan 36 señales de prioridad alta, todas por solapamientos temporales. No son errores confirmados: muchas pueden ser cesiones o diferencias de precisión anual. Permanecen en la cola de revisión y no se han corregido sin evidencia suficiente.

Wikipedia funciona aquí como detector y evidencia reproducible, no como autoridad automática. Las correcciones manuales priorizan fichas oficiales de clubes, federaciones y competiciones.

## Evidencias

- [Política de auditoría](./AUDIT_POLICY.md)
- [Informe consolidado](./easy-consolidated-report.json)
- [Comparación completa con Wikipedia](./wikipedia-easy-report.json)
- [Comparación después de correcciones](./wikipedia-easy-resolved-report.json)
- [Evidencias Wikipedia con revisión permanente](./wikipedia-easy-evidence.json)
- [Revisión crítica A](./manual-critical-a.json)
- [Revisión crítica B](./manual-critical-b.json)
- [Chequeo interno antes](./easy-internal-report.json)
- [Chequeo interno después](./easy-resolved-report.json)

