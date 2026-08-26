import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async path => JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
const first = await readJson("audit/manual-critical-a.json");
const second = await readJson("audit/manual-critical-b.json");

// Nombres usados por la revisión manual B. El QID, y no el texto, es la
// identidad canónica para evitar confundir clubes con nombres parecidos.
const CLUB_IDS = {
  "Sevilla FC": "Q10329",
  "Manchester City": "Q50602",
  "AC Milan": "Q1543",
  "Real Madrid": "Q8682",
  "Athletic Club": "Q8687",
  "Borussia Mönchengladbach": "Q101959",
  "VfB Stuttgart": "Q4512",
  "Bayern Múnich": "Q15789",
  "Borussia Dortmund": "Q41420",
  "Bayer Leverkusen": "Q104761",
  Chelsea: "Q9616",
  "Manchester United": "Q18656",
  Juventus: "Q1422",
  Villarreal: "Q12297",
  Liverpool: "Q1130849",
  Napoli: "Q2641",
  Inter: "Q631",
  "FC Barcelona": "Q7156",
  Everton: "Q5794",
  "Paris Saint-Germain": "Q483020",
  Arsenal: "Q9617"
};

const corrections = {};
function target(record) {
  return corrections[record.playerId] ??= {
    verifiedAt: record.checkedAt,
    sources: [],
    positions: undefined,
    clubPeriods: {}
  };
}
function addSource(out, record) {
  if (record.sourceUrl && !out.sources.includes(record.sourceUrl)) out.sources.push(record.sourceUrl);
}
function setPeriods(out, clubId, periods) {
  if (!clubId || !periods?.length) return;
  out.clubPeriods[clubId] = periods.map(period => ({ start: period.start ?? period[0] ?? null, end: period.end ?? period[1] ?? null }));
}
function idFor(name) {
  const id = CLUB_IDS[name];
  if (!id) throw new Error(`Falta QID para el club revisado: ${name}`);
  return id;
}

for (const record of first.records) {
  if (record.verdict !== "conflict") continue;
  const out = target(record);
  addSource(out, record);
  const data = record.correctData ?? {};
  if (data.positions) out.positions = data.positions;
  if (data.clubs) {
    const grouped = Map.groupBy(data.clubs, club => club.clubId);
    for (const [clubId, periods] of grouped) setPeriods(out, clubId, periods);
  }
  if (data.clubId) {
    setPeriods(out, data.clubId, [{ start: data.seniorStart ?? data.start, end: data.end }]);
  }
}

for (const record of second.reviews) {
  if (record.verdict !== "conflict") continue;
  const out = target(record);
  addSource(out, record);
  const data = record.correctData ?? {};
  if (data.positions) out.positions = data.positions;
  if (data.position) out.positions = [data.position];
  if (data.club && data.periods) setPeriods(out, idFor(data.club), data.periods);
  if (data.otherClub) {
    const periods = data.otherClub.periods ?? [data.otherClub.period];
    setPeriods(out, idFor(data.otherClub.club), periods);
  }
  for (const club of data.clubs ?? []) setPeriods(out, idFor(club.club), club.periods);
  if (data.seniorFirstTeam) {
    setPeriods(out, idFor(data.seniorFirstTeam.club), [data.seniorFirstTeam.period]);
  }
}

// Tres alertas altas inequívocas resueltas con la revisión permanente de
// Wikipedia: un nombre defectuoso y dos relaciones de cantera/sénior.
corrections.Q41533 = {
  verifiedAt: "2026-08-26",
  sources: ["https://en.wikipedia.org/w/index.php?title=Frank_Lampard&oldid=1371314748"],
  name: "Frank Lampard"
};
corrections.Q4254043 = {
  ...(corrections.Q4254043 ?? { verifiedAt: "2026-08-26", sources: [] }),
  sources: [...new Set([...(corrections.Q4254043?.sources ?? []), "https://en.wikipedia.org/w/index.php?title=Divock_Origi&oldid=1367971425"])],
  clubPeriods: { ...(corrections.Q4254043?.clubPeriods ?? {}), Q19516: [{ start: 2012, end: 2014 }, { start: 2014, end: 2015 }] }
};
corrections.Q185572 = {
  ...(corrections.Q185572 ?? { verifiedAt: "2026-08-26", sources: [] }),
  sources: [...new Set([...(corrections.Q185572?.sources ?? []), "https://en.wikipedia.org/w/index.php?title=Mikel_Arteta&oldid=1370650253"])],
  clubPeriods: { ...(corrections.Q185572?.clubPeriods ?? {}), Q7156: [] }
};

for (const correction of Object.values(corrections)) {
  if (!correction.positions) delete correction.positions;
  if (!correction.clubPeriods || !Object.keys(correction.clubPeriods).length) delete correction.clubPeriods;
}

const payload = `window.PIZARRA_AUDIT_CORRECTIONS = ${JSON.stringify(corrections, null, 2)};\n`;
await writeFile(resolve(ROOT, "data", "audit-corrections.js"), payload, "utf8");
console.log(JSON.stringify({ players: Object.keys(corrections).length }, null, 2));

