import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = resolve(ROOT, "data", "players.js");
const EVIDENCE = resolve(ROOT, "data", "official-evidence.js");
const OUT = resolve(ROOT, "audit", "easy-official-report.json");
const EASY_MIN_SITELINKS = 60;

async function load(file) {
  const context = { window: {} };
  vm.runInNewContext(await readFile(file, "utf8"), context);
  return context.window;
}

function samePeriod(actual, official) {
  return actual.start === official.start && actual.end === official.end;
}

const dataWindow = await load(DATA);
const evidenceWindow = await load(EVIDENCE);
const data = dataWindow.PIZARRA_DATA;
const evidence = evidenceWindow.PIZARRA_OFFICIAL_EVIDENCE;
const easyPlayers = data.players.filter(player => player.sitelinks >= EASY_MIN_SITELINKS);

const findings = [];
const pendingEvidence = [];
let verifiedRelations = 0;
let mismatches = 0;
let pendingRelations = 0;

for (const player of easyPlayers) {
  const record = evidence.evidence[player.id];
  if (!record) {
    pendingRelations += player.clubs.length;
    pendingEvidence.push({
      id: player.id,
      name: player.name,
      positions: player.positions,
      clubs: player.clubs.map(club => ({ id: club.id, name: club.name, start: club.start, end: club.end }))
    });
    continue;
  }

  const officialByClub = new Map(record.clubs.map(club => [club.id, club]));
  const currentByClub = new Map(player.clubs.map(club => [club.id, club]));
  const relationFindings = [];

  for (const official of record.clubs) {
    const current = currentByClub.get(official.id);
    if (!current) {
      mismatches++;
      relationFindings.push({ clubId: official.id, status: "missing", official });
    } else if (!samePeriod(current, official)) {
      mismatches++;
      relationFindings.push({ clubId: official.id, status: "period-mismatch", imported: current, official });
    } else {
      verifiedRelations++;
      relationFindings.push({ clubId: official.id, status: "verified", official });
    }
  }

  for (const current of player.clubs) {
    if (!officialByClub.has(current.id)) pendingRelations++;
  }

  const positionVerified = record.positions.every(position => player.positions.includes(position));
  if (!positionVerified) mismatches++;
  findings.push({
    id: player.id,
    name: player.name,
    source: record.source,
    position: { status: positionVerified ? "verified" : "mismatch", imported: player.positions, official: record.positions },
    clubs: relationFindings
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  scope: { difficulty: "easy", minSitelinks: EASY_MIN_SITELINKS, players: easyPlayers.length },
  policy: "Solo se marca como verificado un dato con una URL oficial registrada. Sin evidencia oficial, el estado es pendiente.",
  summary: {
    playerClubRelations: easyPlayers.reduce((total, player) => total + player.clubs.length, 0),
    playersWithOfficialEvidence: findings.length,
    verifiedRelations,
    mismatches,
    pendingRelations
  },
  findings,
  pendingEvidence
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report.summary));

