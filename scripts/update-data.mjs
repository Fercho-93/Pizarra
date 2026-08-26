import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "data", "players.js");
const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "PizarraFootball/1.0 (personal offline football puzzle)";

const LEAGUES = [
  { id: "Q9448", code: "premier", name: "Premier League", country: "Inglaterra" },
  { id: "Q324867", code: "laliga", name: "LaLiga", country: "España" },
  { id: "Q15804", code: "seriea", name: "Serie A", country: "Italia" },
  { id: "Q82595", code: "bundesliga", name: "Bundesliga", country: "Alemania" },
  { id: "Q13394", code: "ligue1", name: "Ligue 1", country: "Francia" }
];

const EXTRA_CLUBS = [
  { id: "Q7156", name: "F. C. Barcelona", league: "laliga", leagueName: "LaLiga" },
  { id: "Q9616", name: "Chelsea F. C.", league: "premier", leagueName: "Premier League" }
];

const sleep = ms => new Promise(resolvePromise => setTimeout(resolvePromise, ms));

async function sparql(query, attempt = 1) {
  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/sparql-results+json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(25000)
    });
  } catch (error) {
    if (attempt < 4) {
      await sleep(900 * attempt);
      return sparql(query, attempt + 1);
    }
    throw error;
  }
  if (!response.ok) {
    if (attempt < 4 && [429, 500, 502, 503, 504].includes(response.status)) {
      await sleep(900 * attempt);
      return sparql(query, attempt + 1);
    }
    throw new Error(`Wikidata respondió ${response.status}: ${await response.text()}`);
  }
  return (await response.json()).results.bindings;
}

function value(binding, key) {
  return binding[key]?.value ?? null;
}

function entityId(uri) {
  return uri?.split("/").pop() ?? null;
}

function yearFromDate(date) {
  if (!date) return null;
  const match = String(date).match(/^([+-]?\d{4,})/);
  return match ? Number(match[1]) : null;
}

function isoDate(date) {
  if (!date) return null;
  const match = String(date).match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

function normalizePosition(label = "") {
  const text = String(label ?? "").toLocaleLowerCase("es");
  if (/portero|guardameta|goalkeeper/.test(text)) return "Portero";
  if (/defensa|defender|lateral|back|líbero|libero/.test(text)) return "Defensa";
  if (/centrocampista|mediocampista|midfielder|medio/.test(text)) return "Centrocampista";
  if (/delantero|forward|striker|extremo|winger|atacante/.test(text)) return "Delantero";
  return null;
}

async function getCurrentClubs(league) {
  const rows = await sparql(`
    SELECT DISTINCT ?club ?clubLabel WHERE {
      ?club wdt:P31/wdt:P279* wd:Q476028;
            wdt:P118 wd:${league.id}.
      SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en,mul". }
    }
    ORDER BY ?clubLabel
  `);
  return rows.map(row => ({
    id: entityId(value(row, "club")),
    name: value(row, "clubLabel"),
    league: league.code,
    leagueName: league.name
  })).filter(club => club.id && club.name);
}

async function getClubPlayers(club) {
  const rows = await sparql(`
    SELECT DISTINCT ?player ?playerLabel ?birth ?country ?countryLabel ?position ?positionLabel
      ?start ?end ?matches ?sitelinks WHERE {
      ?player p:P54 ?membership;
              wdt:P569 ?birth;
              wdt:P106 wd:Q937857.
      ?membership ps:P54 wd:${club.id}.
      OPTIONAL { ?membership pq:P580 ?start. }
      OPTIONAL { ?membership pq:P582 ?end. }
      OPTIONAL { ?membership pq:P1350 ?matches. }
      OPTIONAL { ?player wdt:P27 ?country. }
      OPTIONAL { ?player wdt:P413 ?position. }
      OPTIONAL { ?player wikibase:sitelinks ?sitelinks. }
      FILTER(YEAR(?birth) >= 1965)
      FILTER(!BOUND(?end) || YEAR(?end) >= 1990)
      SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en,mul". }
    }
  `);
  return rows.map(row => ({
    id: entityId(value(row, "player")),
    name: value(row, "playerLabel"),
    birth: isoDate(value(row, "birth")),
    countryId: entityId(value(row, "country")),
    country: value(row, "countryLabel"),
    position: normalizePosition(value(row, "positionLabel")),
    start: yearFromDate(value(row, "start")),
    end: yearFromDate(value(row, "end")),
    matches: Number(value(row, "matches")) || null,
    sitelinks: Number(value(row, "sitelinks")) || 0,
    club
  })).filter(row => row.id && row.name && !/^Q\d+$/.test(row.name) && (row.start || row.end || row.matches) && !(row.start && row.end && row.start > row.end));
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
      await sleep(120);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, run));
  return results;
}

function buildPlayers(rows) {
  const players = new Map();
  for (const row of rows.flat()) {
    let player = players.get(row.id);
    if (!player) {
      player = {
        id: row.id,
        name: row.name,
        birth: row.birth,
        nationalities: new Map(),
        positions: new Set(),
        clubs: new Map(),
        sitelinks: row.sitelinks
      };
      players.set(row.id, player);
    }
    if (row.countryId && row.country) player.nationalities.set(row.countryId, row.country);
    if (row.position) player.positions.add(row.position);
    player.sitelinks = Math.max(player.sitelinks, row.sitelinks);
    const current = player.clubs.get(row.club.id);
    const membership = {
      id: row.club.id,
      name: row.club.name,
      league: row.club.league,
      leagueName: row.club.leagueName,
      start: row.start,
      end: row.end
    };
    if (!current) player.clubs.set(row.club.id, membership);
    else {
      current.start = Math.min(current.start ?? 9999, row.start ?? 9999);
      if (current.start === 9999) current.start = null;
      current.end = Math.max(current.end ?? 0, row.end ?? 0);
      if (current.end === 0) current.end = null;
    }
  }

  return [...players.values()].map(player => {
    const clubs = [...player.clubs.values()].sort((a, b) =>
      (a.start ?? 9999) - (b.start ?? 9999) || a.name.localeCompare(b.name, "es")
    );
    return {
      id: player.id,
      name: player.name,
      birth: player.birth,
      nationalities: [...player.nationalities.values()].sort((a, b) => a.localeCompare(b, "es")),
      positions: [...player.positions],
      clubs,
      leagues: [...new Set(clubs.map(club => club.league))],
      sitelinks: player.sitelinks
    };
  }).filter(player =>
    player.birth && player.nationalities.length && player.clubs.length
  ).sort((a, b) => b.sitelinks - a.sitelinks || a.name.localeCompare(b.name, "es"))
    .slice(0, 2400);
}

async function main() {
  console.log("Consultando los clubes actuales de las cinco grandes ligas…");
  const leagueClubs = await Promise.all(LEAGUES.map(getCurrentClubs));
  const clubs = [...leagueClubs.flat(), ...EXTRA_CLUBS].filter((club, index, all) =>
    all.findIndex(candidate => candidate.id === club.id) === index
  );
  console.log(`${clubs.length} clubes encontrados. Consultando trayectorias históricas…`);

  const rows = await mapPool(clubs, 3, async (club, index) => {
    try {
      const result = await getClubPlayers(club);
      if ((index + 1) % 10 === 0 || index === clubs.length - 1) {
        console.log(`[${index + 1}/${clubs.length}] ${club.name}: ${result.length} filas`);
      }
      return result;
    } catch (error) {
      console.warn(`[${index + 1}/${clubs.length}] ${club.name}: omitido (${error.message})`);
      return [];
    }
  });

  const players = buildPlayers(rows);
  const updatedAt = new Date().toISOString();
  const payload = {
    updatedAt,
    source: "Wikidata (CC0)",
    sourceUrl: "https://www.wikidata.org/",
    scope: "Selección de 2.400 jugadores con mayor cobertura enciclopédica, nacidos desde 1965 y vinculados desde 1990 a clubes de Premier League, LaLiga, Serie A, Bundesliga o Ligue 1.",
    leagues: LEAGUES,
    clubs,
    players
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `window.PIZARRA_DATA = ${JSON.stringify(payload)};\n`, "utf8");
  console.log(`Guardados ${players.length} jugadores en ${OUT}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

