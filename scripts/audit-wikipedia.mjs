import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { createRequire } from "node:module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_FILE = resolve(ROOT, "data", "players.js");
const EVIDENCE_FILE = resolve(ROOT, "audit", "wikipedia-easy-evidence.json");
const MIN_SITELINKS = 60;
const DEFAULT_DELAY = 220;
const USER_AGENT = "PizarraFootballDataAudit/1.0 (https://github.com/Fercho-93/Pizarra; Wikimedia verification)";

const args = new Map(process.argv.slice(2).map(value => {
  const [key, raw = "true"] = value.replace(/^--/, "").split("=");
  return [key, raw];
}));
const delayMs = Number(args.get("delay") ?? DEFAULT_DELAY);
const limit = Number(args.get("limit") ?? Infinity);
const resume = args.get("resume") !== "false";
const concurrency = Math.max(1, Math.min(4, Number(args.get("concurrency") ?? 3)));
const resolved = args.has("resolved");
const REPORT_FILE = resolve(ROOT, "audit", resolved ? "wikipedia-easy-resolved-report.json" : "wikipedia-easy-report.json");

const wait = ms => new Promise(resolveWait => setTimeout(resolveWait, ms));
const clean = value => String(value ?? "")
  .replace(/<!--[^]*?-->/g, " ")
  .replace(/<ref\b[^>]*>[^]*?<\/ref>|<ref\b[^>]*\/>/gi, " ")
  .replace(/\{\{(?:nowrap|small|flagicon|flag)\|([^{}|]+)(?:\|[^{}]*)?\}\}/gi, "$1")
  .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, "$1")
  .replace(/'{2,}/g, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();
const norm = value => clean(value).replace(/\([^)]*\)/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/\./g, "").replace(/&/g, " and ").replace(/\b(fc|cf|afc|ssc|ac|as|ss|ogc|rc|sc|sv|vfb|tsg|bsc|us|calcio|football|futbol|club|de|del|the)\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ").trim();

async function loadData() {
  const context = { window: {} };
  vm.runInNewContext(await readFile(DATA_FILE, "utf8"), context);
  return context.window.PIZARRA_DATA;
}

async function api(url, attempts = 8) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (response.ok) return response.json();
    if (attempt === attempts) throw new Error(`${response.status} ${response.statusText}: ${url}`);
    const retryAfter = Number(response.headers.get("retry-after"));
    await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(30_000, 1500 * 2 ** (attempt - 1)));
  }
}

async function entitySitelinks(ids) {
  const output = {};
  for (let start = 0; start < ids.length; start += 50) {
    const batch = ids.slice(start, start + 50);
    const url = new URL("https://www.wikidata.org/w/api.php");
    url.search = new URLSearchParams({ action: "wbgetentities", ids: batch.join("|"), props: "sitelinks", sitefilter: "enwiki|eswiki", format: "json", origin: "*" });
    const json = await api(url);
    Object.assign(output, json.entities);
    await wait(delayMs);
  }
  return output;
}

function extractTemplate(text, names) {
  const lower = text.toLowerCase();
  let start = -1;
  for (const name of names) {
    const candidate = lower.indexOf(`{{${name.toLowerCase()}`);
    if (candidate >= 0 && (start < 0 || candidate < start)) start = candidate;
  }
  if (start < 0) return null;
  let depth = 0;
  for (let index = start; index < text.length - 1; index++) {
    const pair = text.slice(index, index + 2);
    if (pair === "{{") { depth++; index++; }
    else if (pair === "}}") {
      depth--; index++;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

function templateFields(template) {
  const fields = {};
  let depthCurly = 0;
  let depthSquare = 0;
  let segment = "";
  const parts = [];
  for (let index = 2; index < template.length - 2; index++) {
    const pair = template.slice(index, index + 2);
    if (pair === "{{") { depthCurly++; segment += pair; index++; continue; }
    if (pair === "}}" && depthCurly) { depthCurly--; segment += pair; index++; continue; }
    if (pair === "[[") { depthSquare++; segment += pair; index++; continue; }
    if (pair === "]]" && depthSquare) { depthSquare--; segment += pair; index++; continue; }
    if (template[index] === "|" && depthCurly === 0 && depthSquare === 0) { parts.push(segment); segment = ""; continue; }
    segment += template[index];
  }
  parts.push(segment);
  for (const part of parts.slice(1)) {
    const equals = part.indexOf("=");
    if (equals > 0) fields[part.slice(0, equals).trim().toLowerCase()] = part.slice(equals + 1).trim();
  }
  return fields;
}

function parseBirth(raw) {
  const iso = raw?.match(/(19|20)\d{2}[-|]\s*(1[0-2]|0?[1-9])[-|]\s*(3[01]|[12]\d|0?[1-9])(?:\D|$)/);
  if (iso) return `${iso[1]}${iso[0].slice(2, 4)}-${String(Number(iso[2])).padStart(2, "0")}-${String(Number(iso[3])).padStart(2, "0")}`;
  const dmy = clean(raw).match(/(\d{1,2})\s+(?:de\s+)?([A-Za-záéíóú]+)\s+(?:de\s+)?((?:19|20)\d{2})/i);
  if (!dmy) return null;
  const months = { january:1,enero:1,february:2,febrero:2,march:3,marzo:3,april:4,abril:4,may:5,mayo:5,june:6,junio:6,july:7,julio:7,august:8,agosto:8,september:9,septiembre:9,october:10,octubre:10,november:11,noviembre:11,december:12,diciembre:12 };
  const month = months[norm(dmy[2])];
  return month ? `${dmy[3]}-${String(month).padStart(2, "0")}-${String(Number(dmy[1])).padStart(2, "0")}` : null;
}

function positionCategories(raw) {
  const value = norm(raw);
  const result = [];
  if (/goalkeeper|portero|guardameta/.test(value)) result.push("Portero");
  if (/defender|defensa|centre back|center back|full back|left back|right back|sweeper/.test(value)) result.push("Defensa");
  if (/midfielder|centrocampista|mediocampista|volante|winger|extremo/.test(value)) result.push("Centrocampista");
  if (/forward|striker|delantero|atacante/.test(value)) result.push("Delantero");
  return [...new Set(result)];
}

function parseYears(raw) {
  const years = [...clean(raw).matchAll(/(?:19|20)\d{2}/g)].map(match => Number(match[0]));
  if (!years.length) return { start: null, end: null };
  const ongoing = /present|actualidad|presente|–\s*$|-\s*$/.test(clean(raw).toLowerCase());
  return { start: years[0], end: ongoing ? null : years.at(-1) };
}

function extractCareer(fields) {
  const spells = [];
  for (let index = 1; index <= 40; index++) {
    const club = fields[`clubs${index}`] ?? fields[`club${index}`];
    const years = fields[`years${index}`] ?? fields[`años${index}`] ?? fields[`temporadas${index}`];
    if (club) spells.push({ club: clean(club).replace(/^→\s*/, ""), years: clean(years), ...parseYears(years) });
  }
  return spells;
}

function clubLookup(clubs, clubEntities) {
  const extraAliases = {
    Q1543: ["Milan"], Q2693: ["Parma"], Q704: ["Lyon", "Olympique Lyonnais"], Q2052: ["Fiorentina"],
    Q132885: ["Marseille"], Q19516: ["Lille"], Q15789: ["Bayern Munich", "Bayern München"], Q218372: ["Brest"],
    Q2074: ["Genoa"], Q8780: ["Espanyol"], Q8701: ["Atlético Madrid"], Q19509: ["Rennes"],
    Q4512: ["Stuttgart"], Q1120838: ["Como"], Q105254: ["Mainz", "Mainz 05"], Q104761: ["Bayer Leverkusen", "Leverkusen"],
    Q19490: ["Nottingham Forest"], Q8760: ["Deportivo La Coruña", "Deportivo"], Q19580: ["Coventry City"],
    Q8749: ["Celta Vigo", "Celta"], Q8823: ["Levante"], Q22707: ["Hoffenheim"], Q141971: ["Union Berlin", "1. FC Union Berlin"],
    Q1886: ["Atalanta"], Q8723: ["Real Betis", "Betis"], Q10286: ["Osasuna"], Q223620: ["Alavés", "Alaves"],
    Q501693: ["Troyes"],
    Q9616: ["Chelsea"], Q2739: ["Roma"], Q483020: ["Paris Saint-Germain", "PSG"], Q7156: ["Barcelona"],
    Q8682: ["Real Madrid"], Q1422: ["Juventus"], Q631: ["Inter Milan", "Internazionale"], Q2609: ["Lazio"],
    Q51976: ["Werder Bremen", "Werder"], Q51974: ["Hamburg", "Hamburger SV"], Q9617: ["Arsenal"],
    Q1130849: ["Liverpool"], Q18656: ["Manchester United"], Q50602: ["Manchester City"], Q18741: ["Tottenham Hotspur", "Tottenham"],
    Q5794: ["Everton"], Q18716: ["Newcastle United"], Q18708: ["Fulham"], Q41420: ["Borussia Dortmund", "Dortmund"],
    Q32494: ["Schalke 04", "Schalke"], Q101959: ["Borussia Mönchengladbach", "Borussia Monchengladbach"], Q38245: ["Eintracht Frankfurt"],
    Q180305: ["Monaco"], Q185163: ["Nice"], Q191843: ["Lens"], Q126334: ["Strasbourg"], Q182876: ["Auxerre"]
  };
  const lookup = [];
  for (const club of clubs) {
    const entity = clubEntities[club.id] ?? {};
    const aliases = [club.name, entity.sitelinks?.enwiki?.title, entity.sitelinks?.eswiki?.title, ...(extraAliases[club.id] ?? [])].filter(Boolean).map(norm);
    lookup.push({ club, aliases: [...new Set(aliases)] });
  }
  return lookup;
}

function matchClub(value, lookup) {
  const needle = norm(value);
  return lookup.find(item => item.aliases.some(alias => alias === needle))?.club ?? null;
}

function aggregateSpells(spells, lookup) {
  const grouped = new Map();
  for (const spell of spells) {
    const club = matchClub(spell.club, lookup);
    if (!club) continue;
    const current = grouped.get(club.id) ?? { clubId: club.id, clubName: club.name, spells: [] };
    current.spells.push(spell);
    grouped.set(club.id, current);
  }
  for (const value of grouped.values()) {
    const starts = value.spells.map(spell => spell.start).filter(Boolean);
    const ends = value.spells.map(spell => spell.end);
    value.start = starts.length ? Math.min(...starts) : null;
    value.end = ends.includes(null) ? null : (ends.filter(Boolean).length ? Math.max(...ends.filter(Boolean)) : null);
  }
  return grouped;
}

async function articleRevision(site, title) {
  const language = site.slice(0, 2);
  const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
  url.search = new URLSearchParams({ action: "query", prop: "revisions", titles: title, rvprop: "ids|timestamp|content", rvslots: "main", redirects: "1", formatversion: "2", format: "json", origin: "*" });
  const json = await api(url);
  const page = json.query?.pages?.[0];
  const revision = page?.revisions?.[0];
  if (!page || page.missing || !revision) return null;
  return { language, title: page.title, pageId: page.pageid, revisionId: revision.revid, revisionTimestamp: revision.timestamp, wikitext: revision.slots?.main?.content ?? "" };
}

function fieldStatus(imported, reference, comparable = true) {
  if (!comparable || reference == null || (Array.isArray(reference) && !reference.length)) return "incompleto";
  if (Array.isArray(imported)) return imported.some(value => reference.includes(value)) ? "coincide" : "conflicto";
  return imported === reference ? "coincide" : "conflicto";
}

async function readPriorEvidence() {
  if (!resume) return { records: {} };
  try { return JSON.parse(await readFile(EVIDENCE_FILE, "utf8")); } catch { return { records: {} }; }
}

const data = await loadData();
if (resolved) {
  const context = { window: {} };
  vm.runInNewContext(await readFile(resolve(ROOT, "data", "audit-corrections.js"), "utf8"), context);
  vm.runInNewContext(await readFile(resolve(ROOT, "data", "official-corrections.js"), "utf8"), context);
  createRequire(import.meta.url)("../core.js").applyCorrections(data.players, {
    ...(context.window.PIZARRA_AUDIT_CORRECTIONS ?? {}),
    ...(context.window.PIZARRA_OFFICIAL_CORRECTIONS ?? {})
  });
}
const easy = data.players.filter(player => player.sitelinks >= MIN_SITELINKS).slice(0, limit);
const [playerEntities, clubEntities, prior] = await Promise.all([
  entitySitelinks(easy.map(player => player.id)),
  entitySitelinks(data.clubs.map(club => club.id)),
  readPriorEvidence()
]);
const lookup = clubLookup(data.clubs, clubEntities);
const records = prior.records ?? {};
let processed = 0;

await mkdir(dirname(EVIDENCE_FILE), { recursive: true });
async function processPlayer(player) {
  if (records[player.id]?.revisionId) return;
  const entity = playerEntities[player.id];
  const sitelink = entity?.sitelinks?.enwiki ? ["enwiki", entity.sitelinks.enwiki.title] : entity?.sitelinks?.eswiki ? ["eswiki", entity.sitelinks.eswiki.title] : null;
  if (!sitelink) {
    records[player.id] = { id: player.id, name: player.name, status: "incompleto", reason: "sin artículo en enwiki o eswiki" };
    return;
  }
  const article = await articleRevision(...sitelink);
  if (!article) {
    records[player.id] = { id: player.id, name: player.name, status: "incompleto", reason: "no se pudo obtener la revisión" };
    return;
  }
  const template = extractTemplate(article.wikitext, ["Infobox football biography", "Ficha de deportista", "Ficha de futbolista"]);
  const fields = template ? templateFields(template) : {};
  const birth = parseBirth(fields.birth_date ?? fields.fecha_nacimiento ?? fields.nacimiento);
  const positions = positionCategories(fields.position ?? fields.posición ?? fields.posicion);
  const spells = extractCareer(fields);
  records[player.id] = {
    id: player.id,
    name: player.name,
    status: template ? "extraído" : "incompleto",
    reason: template ? null : "infobox compatible no encontrada",
    language: article.language,
    title: article.title,
    pageId: article.pageId,
    revisionId: article.revisionId,
    revisionTimestamp: article.revisionTimestamp,
    sourceUrl: `https://${article.language}.wikipedia.org/w/index.php?title=${encodeURIComponent(article.title.replace(/ /g, "_"))}&oldid=${article.revisionId}`,
    extracted: { birth, positions, career: spells }
  };
  processed++;
  if (concurrency === 1 && processed % 10 === 0) {
    await writeFile(EVIDENCE_FILE, `${JSON.stringify({ generatedAt: new Date().toISOString(), policy: "Evidencia estructurada extraída de revisiones permanentes de Wikipedia; requiere revisión de conflictos.", records }, null, 2)}\n`);
  }
  if (processed % 25 === 0) console.log(`Procesados ${processed}; último: ${player.name}`);
  await wait(delayMs);
}

const queue = easy.filter(player => !records[player.id]?.revisionId);
let cursor = 0;
await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
  while (cursor < queue.length) {
    const player = queue[cursor++];
    await processPlayer(player);
  }
}));

const findings = easy.map(player => {
  const evidence = records[player.id];
  if (!evidence?.extracted) return { id: player.id, name: player.name, overall: "incompleto", reason: evidence?.reason ?? "sin evidencia" };
  const referenceClubs = aggregateSpells(evidence.extracted.career, lookup);
  const clubs = player.clubs.map(imported => {
    const reference = referenceClubs.get(imported.id);
    if (!reference) return { clubId: imported.id, clubName: imported.name, imported: { start: imported.start, end: imported.end }, status: evidence.extracted.career.length ? "conflicto" : "incompleto", reason: "club no localizado en la trayectoria de la infobox" };
    // Cada etapa importada debe coincidir con una etapa real concreta. Comparar
    // solo el mínimo y máximo ocultaba regresos fusionados (2003–09 + 2021–22
    // aparecía erróneamente como una etapa válida 2003–22).
    const exact = reference.spells.some(spell => imported.start === spell.start && imported.end === spell.end);
    return { clubId: imported.id, clubName: imported.name, imported: { start: imported.start, end: imported.end }, wikipedia: { start: reference.start, end: reference.end, spells: reference.spells }, status: exact ? "coincide" : "conflicto" };
  });
  const birthStatus = fieldStatus(player.birth, evidence.extracted.birth);
  const positionStatus = fieldStatus(player.positions, evidence.extracted.positions);
  const statuses = [birthStatus, positionStatus, ...clubs.map(club => club.status)];
  return {
    id: player.id, name: player.name, sourceUrl: evidence.sourceUrl, revisionId: evidence.revisionId,
    overall: statuses.includes("conflicto") ? "conflicto" : statuses.includes("incompleto") ? "incompleto" : "coincide",
    birth: { imported: player.birth, wikipedia: evidence.extracted.birth, status: birthStatus },
    positions: { imported: player.positions, wikipedia: evidence.extracted.positions, status: positionStatus }, clubs
  };
});

const counts = values => values.reduce((result, value) => ({ ...result, [value]: (result[value] ?? 0) + 1 }), {});
const allClubFindings = findings.flatMap(finding => finding.clubs ?? []);
const report = {
  generatedAt: new Date().toISOString(),
  scope: { difficulty: "facil", state: resolved ? "after-verified-corrections" : "raw-import", minSitelinks: MIN_SITELINKS, players: easy.length, importedClubRelations: easy.reduce((sum, player) => sum + player.clubs.length, 0) },
  methodology: {
    source: "Wikipedia mediante MediaWiki API, priorizando enwiki y usando eswiki como alternativa",
    evidence: "Cada resultado enlaza una revisión permanente (oldid)",
    caveat: "Una discrepancia es una señal para revisión humana, no una corrección automática; Wikipedia puede estar incompleta o usar distintas convenciones de fechas."
  },
  summary: {
    players: counts(findings.map(finding => finding.overall)),
    birth: counts(findings.map(finding => finding.birth?.status ?? "incompleto")),
    positions: counts(findings.map(finding => finding.positions?.status ?? "incompleto")),
    clubs: counts(allClubFindings.map(finding => finding.status))
  },
  findings
};

await writeFile(EVIDENCE_FILE, `${JSON.stringify({ generatedAt: new Date().toISOString(), policy: "Evidencia estructurada extraída de revisiones permanentes de Wikipedia; requiere revisión de conflictos.", records }, null, 2)}\n`);
await writeFile(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));

