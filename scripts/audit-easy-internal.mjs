import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { createRequire } from "node:module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_FILE = resolve(ROOT, "data", "players.js");
const CORRECTIONS_FILE = resolve(ROOT, "data", "official-corrections.js");
const AUDIT_CORRECTIONS_FILE = resolve(ROOT, "data", "audit-corrections.js");
const RESOLVED = process.argv.includes("--resolved");
const OUT_FILE = resolve(ROOT, "audit", RESOLVED ? "easy-resolved-report.json" : "easy-internal-report.json");
const EASY_MIN_SITELINKS = 60;
const CURRENT_YEAR = 2026;
const HISTORICAL_NATIONALITIES = new Set([
  "Alemania Oriental", "Checoslovaquia", "Unión Soviética", "Yugoslavia",
  "República Federal Socialista de Yugoslavia", "Serbia y Montenegro"
]);

async function loadData() {
  const context = { window: {} };
  vm.runInNewContext(await readFile(DATA_FILE, "utf8"), context);
  return context.window.PIZARRA_DATA;
}

async function loadCorrections() {
  const context = { window: {} };
  if (RESOLVED) vm.runInNewContext(await readFile(AUDIT_CORRECTIONS_FILE, "utf8"), context);
  vm.runInNewContext(await readFile(CORRECTIONS_FILE, "utf8"), context);
  return { ...(context.window.PIZARRA_AUDIT_CORRECTIONS || {}), ...(context.window.PIZARRA_OFFICIAL_CORRECTIONS || {}) };
}

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, " ").trim();
}

function issue(code, severity, player, details, relation = null) {
  return {
    code, severity, playerId: player.id, player: player.name,
    ...(relation ? { relation } : {}), details
  };
}

const data = await loadData();
const corrections = await loadCorrections();
if (RESOLVED) createRequire(import.meta.url)("../core.js").applyCorrections(data.players, corrections);
const players = data.players.filter(player => player.sitelinks >= EASY_MIN_SITELINKS);
const findings = [];
const nameIndex = new Map();
const clubRegistry = new Map(data.clubs.map(club => [club.id, club]));

for (const player of players) {
  const birthYear = Number(String(player.birth || "").slice(0, 4));
  const normalizedName = normalize(player.name);
  if (!nameIndex.has(normalizedName)) nameIndex.set(normalizedName, []);
  nameIndex.get(normalizedName).push({ id: player.id, name: player.name, birth: player.birth });

  const birthTime = Date.parse(player.birth);
  if (!player.birth || !Number.isFinite(birthTime) || birthYear < 1900 || birthYear > CURRENT_YEAR) {
    findings.push(issue("missing-or-invalid-birth", "critical", player, { birth: player.birth }));
  }

  const correction = corrections[player.id];
  if (correction && !RESOLVED) {
    const baseComparable = {
      positions: player.positions,
      clubs: player.clubs.map(({ id, start, end }) => ({ id, start, end }))
    };
    const correctedComparable = {
      positions: correction.positions || player.positions,
      clubs: (correction.clubs || player.clubs).map(({ id, start, end }) => ({ id, start, end }))
    };
    if (JSON.stringify(baseComparable) !== JSON.stringify(correctedComparable)) {
      findings.push(issue("official-correction-not-consolidated-in-base", "critical", player, {
        source: correction.source, verifiedAt: correction.verifiedAt,
        base: baseComparable, corrected: correctedComparable
      }));
    }
  }

  if (!player.name || player.name !== player.name.trim() || /\s{2,}|[\d<>\[\]{}]/.test(player.name)) {
    findings.push(issue("defective-name", "high", player, { name: player.name }));
  }
  if (!Array.isArray(player.positions) || player.positions.length === 0) {
    findings.push(issue("missing-position", "critical", player, { positions: player.positions || null }));
  } else {
    const uniquePositions = [...new Set(player.positions)];
    if (uniquePositions.length !== player.positions.length) {
      findings.push(issue("duplicate-position", "high", player, { positions: player.positions }));
    }
    if (uniquePositions.includes("Portero") && uniquePositions.some(position => position !== "Portero")) {
      findings.push(issue("goalkeeper-outfield-position", "high", player, { positions: uniquePositions }));
    } else if (uniquePositions.length >= 3) {
      findings.push(issue("broad-position-classification", "medium", player, { positions: uniquePositions }));
    }
  }

  if (!Array.isArray(player.nationalities) || player.nationalities.length === 0) {
    findings.push(issue("missing-nationality", "critical", player, { nationalities: player.nationalities || null }));
  } else {
    const uniqueNationalities = [...new Set(player.nationalities)];
    if (uniqueNationalities.length !== player.nationalities.length) {
      findings.push(issue("duplicate-nationality", "high", player, { nationalities: player.nationalities }));
    }
    if (uniqueNationalities.length >= 3) {
      findings.push(issue("many-nationalities", "medium", player, { nationalities: uniqueNationalities }));
    }
    const historical = uniqueNationalities.filter(country => HISTORICAL_NATIONALITIES.has(country));
    if (historical.length) {
      findings.push(issue("historical-nationality", "medium", player, { nationalities: uniqueNationalities, historical }));
    }
  }

  if (!Array.isArray(player.clubs) || player.clubs.length === 0) {
    findings.push(issue("missing-clubs", "critical", player, {}));
    continue;
  }


  const derivedLeagues = [...new Set(player.clubs.map(club => club.league))];
  const declaredLeagues = [...new Set(player.leagues || [])];
  const missingDeclared = derivedLeagues.filter(league => !declaredLeagues.includes(league));
  const extraDeclared = declaredLeagues.filter(league => !derivedLeagues.includes(league));
  if (missingDeclared.length || extraDeclared.length) {
    findings.push(issue("player-league-index-mismatch", "high", player, {
      declared: declaredLeagues, derived: derivedLeagues, missingDeclared, extraDeclared
    }));
  }

  const byClub = new Map();
  const openRelations = [];
  for (const club of player.clubs) {
    const relation = { clubId: club.id, club: club.name, start: club.start, end: club.end };
    if (!byClub.has(club.id)) byClub.set(club.id, []);
    byClub.get(club.id).push(club);

    if (!Number.isInteger(club.start)) {
      findings.push(issue("missing-or-invalid-start", "critical", player, { start: club.start }, relation));
    }
    if (club.end !== null && !Number.isInteger(club.end)) {
      findings.push(issue("invalid-end", "critical", player, { end: club.end }, relation));
    }
    if (Number.isInteger(club.start) && club.start > CURRENT_YEAR) {
      findings.push(issue("future-start", "critical", player, { currentYear: CURRENT_YEAR }, relation));
    }
    if (Number.isInteger(club.end) && club.end > CURRENT_YEAR) {
      findings.push(issue("future-end", "critical", player, { currentYear: CURRENT_YEAR }, relation));
    }
    if (Number.isInteger(club.start) && Number.isInteger(club.end) && club.end < club.start) {
      findings.push(issue("end-before-start", "critical", player, {}, relation));
    }
    if (birthYear && Number.isInteger(club.start)) {
      const age = club.start - birthYear;
      if (age < 14) findings.push(issue("impossible-senior-start-age", "critical", player, { birthYear, age }, relation));
      else if (age <= 15) findings.push(issue("possible-youth-or-reserve-relation", "high", player, { birthYear, age }, relation));
    }
    if (club.end === null) openRelations.push(club);
    const registered = clubRegistry.get(club.id);
    if (!registered) {
      findings.push(issue("club-not-in-registry", "critical", player, {}, relation));
    } else if (registered.name !== club.name || registered.league !== club.league) {
      findings.push(issue("club-registry-mismatch", "high", player, {
        registry: { name: registered.name, league: registered.league },
        relation: { name: club.name, league: club.league }
      }, relation));
    }
    if (/\b(?:B|II|U-?\d{2}|Sub-?\d{2}|Reservas?|Reserves?|Academy|Juvenil)\b/i.test(club.name)) {
      findings.push(issue("possible-youth-or-reserve-club", "high", player, {}, relation));
    }
  }

  for (const [clubId, relations] of byClub) {
    const periodKeys = relations.map(({ start, end }) => `${start ?? "?"}:${end ?? "?"}`);
    if (new Set(periodKeys).size !== periodKeys.length) {
      findings.push(issue("exact-duplicate-club-relation", "high", player, {
        clubId, periods: relations.map(({ start, end }) => ({ start, end }))
      }));
    }
  }
  if (openRelations.length > 1) {
    findings.push(issue("multiple-open-clubs", "critical", player, {
      clubs: openRelations.map(({ id, name, start }) => ({ id, name, start }))
    }));
  }
  for (const open of openRelations) {
    const later = player.clubs.filter(club => club.id !== open.id && Number.isInteger(club.start) && club.start > open.start);
    if (later.length) {
      findings.push(issue("open-club-followed-by-later-club", "medium", player, {
        openClub: { id: open.id, name: open.name, start: open.start },
        laterClubs: later.map(({ id, name, start, end }) => ({ id, name, start, end }))
      }));
    } else if (Number.isInteger(open.start) && open.start <= CURRENT_YEAR - 8) {
      findings.push(issue("long-open-club-needs-current-status-check", "medium", player, {
        yearsOpen: CURRENT_YEAR - open.start
      }, { clubId: open.id, club: open.name, start: open.start, end: open.end }));
    }
    if (birthYear && CURRENT_YEAR - birthYear >= 43) {
      findings.push(issue("open-club-at-unusual-current-age", "high", player, {
        currentAge: CURRENT_YEAR - birthYear,
        note: "Puede ser una relación desactualizada; algunos porteros sí compiten después de los 42."
      }, { clubId: open.id, club: open.name, start: open.start, end: open.end }));
    }
  }

  for (let left = 0; left < player.clubs.length; left++) {
    for (let right = left + 1; right < player.clubs.length; right++) {
      const a = player.clubs[left];
      const b = player.clubs[right];
      if (!Number.isInteger(a.start) || !Number.isInteger(b.start)) continue;
      const overlapStart = Math.max(a.start, b.start);
      const overlapEnd = Math.min(a.end ?? CURRENT_YEAR, b.end ?? CURRENT_YEAR);
      const fullYears = overlapEnd - overlapStart;
      if (fullYears >= 1) {
        const overlapSeverity = fullYears >= 4 ? "critical" : fullYears >= 2 ? "high" : "medium";
        findings.push(issue("overlapping-club-periods", overlapSeverity, player, {
          overlap: { start: overlapStart, end: overlapEnd, fullYears },
          periods: [a, b].map(({ id, name, start, end }) => ({ id, name, start, end })),
          note: fullYears >= 2 ? "Posible fusión de dos etapas o fechas incorrectas; revisar cesiones." : "Puede ser una cesión o efecto de precisión anual."
        }));
      }
    }
  }
}

for (const entries of nameIndex.values()) {
  if (entries.length < 2) continue;
  for (const entry of entries) {
    const player = players.find(candidate => candidate.id === entry.id);
    findings.push(issue("duplicate-normalized-name", "high", player, { matches: entries }));
  }
}

const severityRank = { critical: 0, high: 1, medium: 2, low: 3 };
findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.player.localeCompare(b.player, "es") || a.code.localeCompare(b.code));
const countsByCode = Object.fromEntries([...new Set(findings.map(item => item.code))].sort().map(code => [code, findings.filter(item => item.code === code).length]));
const countsBySeverity = Object.fromEntries(["critical", "high", "medium", "low"].map(severity => [severity, findings.filter(item => item.severity === severity).length]));
const affectedPlayers = new Set(findings.map(item => item.playerId));
const cleanPlayers = players.filter(player => !affectedPlayers.has(player.id)).map(player => ({ id: player.id, name: player.name }));

const report = {
  generatedAt: new Date().toISOString(),
  scope: {
    difficulty: "easy", minSitelinks: EASY_MIN_SITELINKS,
    players: players.length,
    playerClubRelations: players.reduce((sum, player) => sum + player.clubs.length, 0),
    currentYear: CURRENT_YEAR
  },
  disclaimer: "Auditoría interna heurística. Detecta incoherencias y riesgos para revisión con evidencia externa; la ausencia de alertas no certifica que un dato sea verdadero.",
  state: RESOLVED ? "after-verified-corrections" : "raw-import",
  summary: {
    findings: findings.length,
    affectedPlayers: affectedPlayers.size,
    cleanPlayers: cleanPlayers.length,
    countsBySeverity,
    countsByCode
  },
  priorityRules: {
    critical: "Incoherencia estructural o cronológica fuerte; excluir temporalmente la afirmación del juego hasta contrastarla.",
    high: "Probable contaminación de cantera/filial, clasificación incompatible o dato que exige revisión prioritaria.",
    medium: "Dato plausible, pero ambiguo, histórico o potencialmente desactualizado."
  },
  findings,
  cleanPlayers
};

await mkdir(dirname(OUT_FILE), { recursive: true });
await writeFile(OUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report.summary, null, 2));

