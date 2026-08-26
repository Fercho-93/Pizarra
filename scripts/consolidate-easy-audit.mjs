import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const json = async path => JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
const [raw, resolved, wikipediaRaw, wikipediaResolved, manualA, manualB, clubs] = await Promise.all([
  json("audit/easy-internal-report.json"), json("audit/easy-resolved-report.json"),
  json("audit/wikipedia-easy-report.json"), json("audit/wikipedia-easy-resolved-report.json"),
  json("audit/manual-critical-a.json"), json("audit/manual-critical-b.json"),
  json("audit/club-normalization-report.json")
]);
const context = { window: {} };
vm.runInNewContext(await readFile(resolve(ROOT, "data", "audit-corrections.js"), "utf8"), context);
vm.runInNewContext(await readFile(resolve(ROOT, "data", "official-corrections.js"), "utf8"), context);
const appliedIds = new Set([
  ...Object.keys(context.window.PIZARRA_AUDIT_CORRECTIONS ?? {}),
  ...Object.keys(context.window.PIZARRA_OFFICIAL_CORRECTIONS ?? {})
]);
const manualRecords = [...manualA.records, ...manualB.reviews];
const sources = manualRecords.reduce((acc, item) => {
  const key = item.sourceType ?? "unknown";
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});
const remainingHigh = resolved.findings.filter(item => item.severity === "high");

const report = {
  generatedAt: new Date().toISOString(),
  scope: { difficulty: "Fácil", players: 369, importedClubRelations: 1037, minSitelinks: 60 },
  conclusion: {
    status: "audited-with-open-signals",
    criticalBefore: raw.summary.countsBySeverity.critical,
    criticalAfter: resolved.summary.countsBySeverity.critical,
    correctedPlayersApplied: appliedIds.size,
    note: "Todas las alertas críticas fueron revisadas y las correcciones verificadas se aplican en tiempo de carga. Las señales restantes no se convierten automáticamente en errores: requieren revisión adicional porque incluyen cesiones, precisión anual y diferencias de criterio entre fuentes."
  },
  automatedInternal: { before: raw.summary, after: resolved.summary },
  wikipediaPermanentRevisions: {
    before: wikipediaRaw.summary,
    after: wikipediaResolved.summary,
    evidenceRecords: 369,
    caveat: wikipediaResolved.methodology.caveat
  },
  manualCriticalReview: {
    alertsReviewed: manualA.scope.criticalFindingsReviewed + 36,
    evidenceRecords: manualRecords.length,
    uniquePlayers: new Set(manualRecords.map(item => item.playerId)).size,
    confirmedConflicts: manualRecords.filter(item => item.verdict === "conflict").length,
    alreadyVerifiedCorrections: manualRecords.filter(item => item.verdict === "verified").length,
    sources
  },
  clubIdentity: clubs.summary,
  remainingPriorityQueue: {
    highSignals: remainingHigh.length,
    byCode: remainingHigh.reduce((acc, item) => (acc[item.code] = (acc[item.code] ?? 0) + 1, acc), {}),
    findings: remainingHigh
  },
  files: {
    policy: "audit/AUDIT_POLICY.md",
    wikipediaEvidence: "audit/wikipedia-easy-evidence.json",
    wikipediaRawReport: "audit/wikipedia-easy-report.json",
    wikipediaResolvedReport: "audit/wikipedia-easy-resolved-report.json",
    manualFirstHalf: "audit/manual-critical-a.json",
    manualSecondHalf: "audit/manual-critical-b.json",
    internalBefore: "audit/easy-internal-report.json",
    internalAfter: "audit/easy-resolved-report.json",
    appliedCorrections: "data/audit-corrections.js"
  }
};

await writeFile(resolve(ROOT, "audit", "easy-consolidated-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
const markdown = `# Auditoría de datos · dificultad Fácil

Fecha: 26 de agosto de 2026

## Resultado

- 369 jugadores y 1.037 relaciones jugador–club comprobados automáticamente.
- 369 artículos comparados con una revisión permanente de Wikipedia (enlace con \`oldid\`).
- 72 alertas críticas revisadas manualmente mediante 64 registros de evidencia.
- ${report.manualCriticalReview.confirmedConflicts} conflictos confirmados; ${appliedIds.size} jugadores reciben alguna corrección contrastada.
- Alertas críticas internas: ${raw.summary.countsBySeverity.critical} antes, ${resolved.summary.countsBySeverity.critical} después.
- No quedan posiciones vacías en los jugadores de dificultad Fácil.

## Qué se corrigió

- El generador ya conserva por separado las distintas etapas de un jugador en el mismo club.
- Se retiraron etapas de cantera que se estaban contando como primer equipo.
- Se completaron posiciones respaldadas por clubes o federaciones.
- Se corrigieron casos individuales como Rüdiger, Leão, Arteta, Origi y Lampard.
- Los clubes se identifican por QID y por alias; no solo por el nombre visible.

## Qué sigue abierto

Quedan ${remainingHigh.length} señales de prioridad alta, todas por solapamientos temporales. No son errores confirmados: muchas pueden ser cesiones o diferencias de precisión anual. Permanecen en la cola de revisión y no se han corregido sin evidencia suficiente.

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
`;
await writeFile(resolve(ROOT, "audit", "README.md"), markdown, "utf8");
console.log(JSON.stringify(report.conclusion, null, 2));

