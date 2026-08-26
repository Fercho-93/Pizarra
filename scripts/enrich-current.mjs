import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = resolve(ROOT, "data", "players.js");
const OUTPUT = resolve(ROOT, "data", "enrichment.js");
const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "PizarraFootball/1.1 (data quality audit)";
const TODAY = new Date().toISOString().slice(0, 10);
const CURRENT_YEAR = Number(TODAY.slice(0, 4));

const raw = await readFile(INPUT, "utf8");
const data = JSON.parse(raw.replace(/^window\.PIZARRA_DATA = /, "").replace(/;\s*$/, ""));
const players = new Map(data.players.map(player => [player.id, player]));
const clubs = new Map(data.clubs.map(club => [club.id, club]));
const batches = [];
const ids = [...players.keys()];
for (let index = 0; index < ids.length; index += 80) batches.push(ids.slice(index, index + 80));

const sleep = milliseconds => new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
const entityId = uri => uri?.split("/").pop() ?? null;
const date = value => String(value || "").match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;

async function query(batch, attempt = 1) {
  const values = batch.map(id => `wd:${id}`).join(" ");
  const sparql = `
    SELECT ?player ?number ?club ?start ?end WHERE {
      VALUES ?player { ${values} }
      ?player p:P1618 ?statement.
      ?statement ps:P1618 ?number;
                 pq:P54 ?club.
      OPTIONAL { ?statement pq:P580 ?start. }
      OPTIONAL { ?statement pq:P582 ?end. }
    }
  `;
  try {
    const response = await fetch(`${ENDPOINT}?query=${encodeURIComponent(sparql)}&format=json`, {
      headers: { Accept: "application/sparql-results+json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(25000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()).results.bindings;
  } catch (error) {
    if (attempt >= 4) throw error;
    await sleep(attempt * 1000);
    return query(batch, attempt + 1);
  }
}

const candidates = new Map();
for (let index = 0; index < batches.length; index++) {
  const rows = await query(batches[index]);
  for (const row of rows) {
    const playerId = entityId(row.player?.value);
    const clubId = entityId(row.club?.value);
    const shirtNumber = Number(row.number?.value);
    const start = date(row.start?.value);
    const end = date(row.end?.value);
    const player = players.get(playerId);
    if (!player || !clubs.has(clubId) || !Number.isInteger(shirtNumber) || shirtNumber < 1 || shirtNumber > 99) continue;
    if (end && end < TODAY) continue;
    const activeMembership = player.clubs.find(club => club.id === clubId && (!club.end || club.end >= CURRENT_YEAR));
    if (!activeMembership) continue;
    const candidate = { playerId, clubId, shirtNumber, start, end };
    const previous = candidates.get(playerId);
    if (!previous || Number(!end) > Number(!previous.end) || (start || "") > (previous.start || "")) candidates.set(playerId, candidate);
  }
  console.log(`[${index + 1}/${batches.length}] ${rows.length} dorsales contextuales`);
  await sleep(180);
}

const profiles = {};
for (const candidate of candidates.values()) {
  const club = clubs.get(candidate.clubId);
  profiles[candidate.playerId] = {
    club: { id: club.id, name: club.name, league: club.league, leagueName: club.leagueName },
    shirtNumber: candidate.shirtNumber,
    verifiedAt: TODAY,
    source: "https://www.wikidata.org/wiki/Property:P1618",
    method: "Dorsal contextualizado con club y pertenencia vigente al mismo club"
  };
}

await writeFile(OUTPUT, `window.PIZARRA_ENRICHMENT = ${JSON.stringify(profiles)};\n`, "utf8");
console.log(`Guardados ${Object.keys(profiles).length} perfiles actuales contrastados en ${OUTPUT}`);

