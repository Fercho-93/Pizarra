import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_FILE = path.join(ROOT, "data", "players.js");
const ALIASES_FILE = path.join(ROOT, "audit", "club-aliases.json");
const REPORT_FILE = path.join(ROOT, "audit", "club-normalization-report.json");
const EASY_MIN_SITELINKS = 60;
const EXPECTED_EASY_CLUBS = 93;

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(DATA_FILE, "utf8"), context, { filename: DATA_FILE });
const data = context.window.PIZARRA_DATA;

const commonAliases = {
  Q19568: ["Bournemouth"], Q9617: ["Arsenal", "Arsenal FC"], Q18711: ["Aston Villa", "Aston Villa FC"],
  Q19571: ["Brentford", "Brentford FC"], Q19453: ["Brighton", "Brighton and Hove Albion", "Brighton & Hove Albion"],
  Q19580: ["Coventry City", "Coventry"], Q19467: ["Crystal Palace", "Crystal Palace FC"], Q5794: ["Everton", "Everton FC"],
  Q18708: ["Fulham", "Fulham FC"], Q19477: ["Hull City", "Hull"], Q9653: ["Ipswich Town", "Ipswich"],
  Q1128631: ["Leeds United", "Leeds"], Q1130849: ["Liverpool", "Liverpool FC"], Q50602: ["Manchester City", "Man City"],
  Q18656: ["Manchester United", "Man United", "Man Utd"], Q18716: ["Newcastle United", "Newcastle"],
  Q19490: ["Nottingham Forest", "Forest"], Q18739: ["Sunderland", "Sunderland AFC"], Q18741: ["Tottenham", "Tottenham Hotspur", "Spurs"],
  Q290781: ["Almería", "UD Almería"], Q8687: ["Athletic Bilbao", "Athletic Club de Bilbao"], Q8701: ["Atlético", "Atlético Madrid", "Atleti"],
  Q10286: ["Osasuna", "CA Osasuna"], Q223620: ["Alavés", "Deportivo Alavés"], Q10512: ["Elche", "Elche CF"],
  Q8806: ["Getafe", "Getafe CF"], Q8823: ["Levante", "Levante UD"], Q8857: ["Málaga", "Málaga CF"],
  Q12236: ["Racing Santander", "Racing de Santander"], Q10300: ["Rayo", "Rayo Vallecano"], Q8723: ["Betis", "Real Betis"],
  Q8749: ["Celta", "Celta de Vigo", "RC Celta"], Q8780: ["Espanyol", "RCD Espanyol"], Q8760: ["Deportivo", "Deportivo La Coruña", "RC Deportivo"],
  Q8682: ["Real Madrid", "Real Madrid CF"], Q10315: ["Real Sociedad"], Q10329: ["Sevilla", "Sevilla FC"],
  Q10333: ["Valencia", "Valencia CF"], Q12297: ["Villarreal", "Villarreal CF"], Q7156: ["Barcelona", "FC Barcelona", "Barça"],
  Q1543: ["AC Milan", "Milan"], Q289482: ["AC Monza", "Monza"], Q2739: ["AS Roma", "Roma"], Q2052: ["Fiorentina"],
  Q1886: ["Atalanta"], Q1893: ["Bologna", "Bologna FC"], Q1900: ["Cagliari"], Q1120838: ["Como", "Como 1907"],
  Q845043: ["Frosinone"], Q2074: ["Genoa", "Genoa CFC"], Q631: ["Inter", "Inter Milan", "Internazionale"],
  Q1422: ["Juventus FC", "Juve"], Q2693: ["Parma", "Parma Calcio"], Q2641: ["Napoli", "SSC Napoli"],
  Q2609: ["Lazio", "SS Lazio"], Q2768: ["Torino", "Torino FC"], Q13391: ["Lecce", "US Lecce"],
  Q2798: ["Udinese"], Q8603: ["Sassuolo", "US Sassuolo"], Q501245: ["Venezia", "Venezia FC"],
  Q105254: ["Mainz", "Mainz 05", "FSV Mainz 05"], Q104761: ["Bayer Leverkusen", "Leverkusen"],
  Q41420: ["Dortmund", "BVB"], Q101959: ["Borussia Monchengladbach", "Mönchengladbach", "Gladbach"],
  Q38245: ["Eintracht", "Eintracht Frankfurt"], Q15789: ["Bayern", "Bayern Munich", "Bayern München", "FC Bayern"],
  Q104770: ["Colonia", "Köln", "FC Köln", "1. FC Köln"], Q141971: ["Union Berlin", "1. FC Union Berlin"],
  Q32494: ["Schalke", "Schalke 04"], Q51974: ["Hamburgo", "Hamburger SV", "HSV"], Q702455: ["Leipzig", "RB Leipzig"],
  Q106394: ["Friburgo", "Freiburg", "SC Freiburg"], Q160532: ["Paderborn", "SC Paderborn"], Q692691: ["Elversberg"],
  Q22707: ["Hoffenheim", "TSG Hoffenheim"], Q4512: ["Stuttgart", "VfB Stuttgart"], Q51976: ["Bremen", "Werder"],
  Q180305: ["Monaco", "AS Monaco"], Q845137: ["Angers"], Q182876: ["Auxerre", "AJ Auxerre"],
  Q501693: ["Troyes", "ESTAC Troyes"], Q48911: ["Lorient", "FC Lorient"], Q328658: ["Le Havre", "Le Havre AC"],
  Q210864: ["Le Mans", "Le Mans FC"], Q19516: ["Lille", "LOSC", "LOSC Lille"], Q185163: ["Niza", "Nice", "OGC Nice"],
  Q704: ["Lyon", "Olympique Lyonnais", "OL"], Q132885: ["Marsella", "Marseille", "Olympique Marseille", "OM"],
  Q1051013: ["Paris FC"], Q483020: ["PSG", "Paris Saint-Germain", "Paris Saint Germain"], Q191843: ["Lens", "RC Lens"],
  Q126334: ["Estrasburgo", "Strasbourg", "RC Strasbourg"], Q218372: ["Brest", "Stade Brestois"],
  Q19509: ["Rennes", "Stade Rennais"], Q19518: ["Toulouse", "Toulouse FC"], Q9616: ["Chelsea", "Chelsea FC"]
};

const historicalEntities = {
  Q116949682: "Club histórico de Turín; no debe confundirse con Torino FC.",
  Q534448: "Club histórico/disuelto de Turín; no debe fusionarse con Torino FC.",
  Q1538737: "Club histórico/disuelto de Turín; no es Inter de Milán.",
  Q665690: "Entidad histórica que participó en la formación de AS Roma.",
  Q1328077: "Club histórico de Fiume/Rijeka; entidad disuelta.",
  Q610482: "Entidad histórica que participó en la formación de AS Roma.",
  Q728986: "Club histórico de Nápoles; no debe fusionarse automáticamente con SSC Napoli.",
  Q3590859: "Entidad histórica de Reims; revisar la relación antes de atribuirla al club moderno.",
  Q2338486: "Club histórico que participó en la formación de Lille OSC.",
  Q1514915: "Club histórico que participó en la formación de Lille OSC.",
  Q2422417: "Toulouse FC histórico (1937); no es la entidad moderna Q19518."
};

function normalize(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/\b(futbol|football|association|club|calcio|societa|sportiva|unione|de|del|di|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function generatedAliases(club) {
  const variants = new Set([club.name, ...(commonAliases[club.id] || [])]);
  const shortened = club.name
    .replace(/Association Football Club/gi, "FC").replace(/Football Club/gi, "FC")
    .replace(/Club de Fútbol/gi, "CF").replace(/Fútbol Club/gi, "FC")
    .replace(/Società Sportiva/gi, "SS").replace(/Unione Sportiva/gi, "US")
    .replace(/\s+/g, " ").trim();
  variants.add(shortened);
  return [...variants].filter(Boolean).sort((a, b) => a.localeCompare(b, "es"));
}

const easyPlayers = data.players.filter(player => player.sitelinks >= EASY_MIN_SITELINKS);
const easyClubIds = new Set(easyPlayers.flatMap(player => player.clubs.map(club => club.id)));
const aliases = data.clubs.map(club => ({
  id: club.id,
  canonicalName: club.name,
  league: club.league,
  inEasyScope: easyClubIds.has(club.id),
  aliases: generatedAliases(club),
  normalizedKeys: [...new Set(generatedAliases(club).map(normalize).filter(Boolean))].sort()
}));

const keyOwners = new Map();
for (const club of aliases) for (const key of club.normalizedKeys) {
  if (!keyOwners.has(key)) keyOwners.set(key, []);
  keyOwners.get(key).push(club.id);
}
const collisions = [...keyOwners].filter(([, ids]) => new Set(ids).size > 1).map(([key, ids]) => ({
  normalizedKey: key,
  clubs: [...new Set(ids)].map(id => ({ id, name: data.clubs.find(club => club.id === id)?.name }))
}));

const easyHistorical = Object.entries(historicalEntities).filter(([id]) => easyClubIds.has(id));
const relationClubIds = new Set(data.players.flatMap(player => player.clubs.map(club => club.id)));
const unknownRelationIds = [...relationClubIds].filter(id => !data.clubs.some(club => club.id === id));
const missingEasyCatalogIds = [...easyClubIds].filter(id => !data.clubs.some(club => club.id === id));

const aliasDocument = {
  generatedAt: new Date().toISOString(),
  source: "data/players.js",
  normalizationPolicy: "Los alias ayudan a emparejar nombres, pero nunca fusionan IDs de Wikidata distintos automáticamente.",
  scope: { allCatalogClubs: data.clubs.length, easyPlayers: easyPlayers.length, easyClubs: easyClubIds.size },
  clubs: aliases
};

const anomalies = [];
if (easyClubIds.size !== EXPECTED_EASY_CLUBS) anomalies.push({
  severity: "warning", type: "scope-count-mismatch", expected: EXPECTED_EASY_CLUBS, actual: easyClubIds.size,
  detail: "El alcance observado en players.js no coincide con los 93 clubes indicados; usar el conjunto derivado de los 369 jugadores Fácil."
});
for (const [id, detail] of Object.entries(historicalEntities)) {
  const club = data.clubs.find(item => item.id === id);
  if (club) anomalies.push({ severity: easyClubIds.has(id) ? "critical" : "warning", type: "historical-entity", id, name: club.name, inEasyScope: easyClubIds.has(id), detail });
}
for (const collision of collisions) anomalies.push({ severity: "warning", type: "alias-collision", ...collision, detail: "No resolver por nombre: conservar el QID y revisar manualmente." });
for (const id of unknownRelationIds) anomalies.push({ severity: "critical", type: "club-missing-from-catalog", id });

const report = {
  generatedAt: aliasDocument.generatedAt,
  sourceUpdatedAt: data.updatedAt,
  scope: aliasDocument.scope,
  summary: {
    aliases: aliases.reduce((sum, club) => sum + club.aliases.length, 0),
    normalizedKeys: keyOwners.size,
    collisions: collisions.length,
    historicalEntities: Object.keys(historicalEntities).filter(id => data.clubs.some(club => club.id === id)).length,
    historicalEntitiesInEasy: easyHistorical.length,
    unknownRelationIds: unknownRelationIds.length,
    missingEasyCatalogIds: missingEasyCatalogIds.length,
    anomalies: anomalies.length
  },
  anomalies
};

fs.mkdirSync(path.dirname(ALIASES_FILE), { recursive: true });
fs.writeFileSync(ALIASES_FILE, `${JSON.stringify(aliasDocument, null, 2)}\n`);
fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));


