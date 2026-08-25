(function (root) {
  "use strict";

  const LEAGUE_NAMES = {
    premier: "Premier League", laliga: "LaLiga", seriea: "Serie A",
    bundesliga: "Bundesliga", ligue1: "Ligue 1"
  };

  function hashSeed(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function seededRandom(seedText) {
    let state = hashSeed(String(seedText)) || 1;
    return function random() {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffle(items, random) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function normalize(text) {
    return String(text ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, " ").trim();
  }

  function birthYear(player) { return Number(player.birth?.slice(0, 4)) || null; }
  function birthDecade(player) { const year = birthYear(player); return year ? Math.floor(year / 10) * 10 : null; }
  function playerHasClub(player, id) { return player.clubs.some(club => club.id === id); }

  function buildCondition(label, detail, family, test, players) {
    const matches = players.filter(test).map(player => player.id);
    return { id: `${family}:${normalize(label)}`, label, detail, family, matches, set: new Set(matches), test };
  }

  function buildConditionPools(players) {
    const nationalityCounts = new Map();
    const clubCounts = new Map();
    for (const player of players) {
      for (const country of player.nationalities) nationalityCounts.set(country, (nationalityCounts.get(country) || 0) + 1);
      for (const club of player.clubs) clubCounts.set(club.id, { club, count: (clubCounts.get(club.id)?.count || 0) + 1 });
    }
    const nationalities = [...nationalityCounts].filter(([country, count]) =>
      count >= 25 && count <= 500 && country !== "Reino Unido"
    ).sort((a, b) => b[1] - a[1]).slice(0, 28).map(([country]) => country);
    const clubs = [...clubCounts.values()].filter(item => item.count >= 28)
      .sort((a, b) => b.count - a.count).slice(0, 55).map(item => item.club);
    const positions = ["Portero", "Defensa", "Centrocampista", "Delantero"];
    const decades = [1970, 1980, 1990, 2000];
    const leagues = Object.keys(LEAGUE_NAMES);
    const rows = [];
    const cols = [];

    for (const country of nationalities) {
      for (const position of positions) {
        const condition = buildCondition(`${position} · ${country}`, `Nacionalidad: ${country}. Posición: ${position}.`, "nacion-posicion",
          player => player.nationalities.includes(country) && player.positions.includes(position), players);
        if (condition.matches.length >= 12 && condition.matches.length <= 180) rows.push(condition);
      }
      for (const league of leagues) {
        const condition = buildCondition(`${country} · ${LEAGUE_NAMES[league]}`, `Nacionalidad: ${country}. Jugó en ${LEAGUE_NAMES[league]}.`, "nacion-liga",
          player => player.nationalities.includes(country) && player.leagues.includes(league), players);
        if (condition.matches.length >= 14 && condition.matches.length <= 220) rows.push(condition);
      }
    }

    for (const position of positions) {
      for (const decade of decades) {
        const condition = buildCondition(`${position} · nac. ${decade}s`, `Posición: ${position}. Nació entre ${decade} y ${decade + 9}.`, "posicion-decada",
          player => player.positions.includes(position) && birthDecade(player) === decade, players);
        if (condition.matches.length >= 20 && condition.matches.length <= 260) rows.push(condition);
      }
    }

    for (const club of clubs) {
      cols.push(buildCondition(club.name, `Jugó en ${club.name} desde 1990.`, "club",
        player => playerHasClub(player, club.id), players));
    }
    for (let i = 0; i < leagues.length; i++) {
      for (let j = i + 1; j < leagues.length; j++) {
        const a = leagues[i], b = leagues[j];
        const condition = buildCondition(`${LEAGUE_NAMES[a]} + ${LEAGUE_NAMES[b]}`, `Jugó en ambas ligas.`, "doble-liga",
          player => player.leagues.includes(a) && player.leagues.includes(b), players);
        if (condition.matches.length >= 20) cols.push(condition);
      }
    }
    for (const league of leagues) {
      for (const decade of decades) {
        const condition = buildCondition(`${LEAGUE_NAMES[league]} · nac. ${decade}s`, `Jugó en ${LEAGUE_NAMES[league]} y nació en los ${decade}.`, "liga-decada",
          player => player.leagues.includes(league) && birthDecade(player) === decade, players);
        if (condition.matches.length >= 24) cols.push(condition);
      }
    }
    return { rows, cols };
  }

  function intersection(a, b) {
    const small = a.matches.length <= b.matches.length ? a : b;
    const other = small === a ? b : a;
    return small.matches.filter(id => other.set.has(id));
  }

  function hasDistinctAssignment(cells) {
    const ordered = cells.map((ids, index) => ({ ids, index })).sort((a, b) => a.ids.length - b.ids.length);
    const used = new Set();
    function visit(index) {
      if (index === ordered.length) return true;
      for (const id of ordered[index].ids) {
        if (used.has(id)) continue;
        used.add(id);
        if (visit(index + 1)) return true;
        used.delete(id);
      }
      return false;
    }
    return visit(0);
  }

  function generateGrid(players, seedText) {
    const random = seededRandom(seedText);
    const pools = buildConditionPools(players);
    const rowOrder = shuffle(pools.rows, random);
    const colOrder = shuffle(pools.cols, random);
    for (let attempt = 0; attempt < 9000; attempt++) {
      const rows = [rowOrder[(attempt * 3) % rowOrder.length], rowOrder[(attempt * 3 + 1) % rowOrder.length], rowOrder[(attempt * 3 + 2) % rowOrder.length]];
      const offset = Math.floor(random() * colOrder.length);
      const cols = [colOrder[offset], colOrder[(offset + 1 + attempt) % colOrder.length], colOrder[(offset + 7 + attempt * 2) % colOrder.length]];
      if (new Set(rows.map(item => item.id)).size < 3 || new Set(cols.map(item => item.id)).size < 3) continue;
      if (new Set(rows.map(item => item.family)).size === 1 && rows[0].family === "posicion-decada") continue;
      const cells = [];
      let valid = true;
      for (const row of rows) for (const col of cols) {
        const ids = intersection(row, col);
        if (ids.length < 2 || ids.length > 32) { valid = false; break; }
        cells.push(ids);
      }
      if (valid && hasDistinctAssignment(cells)) return { rows, cols, cells };
    }
    throw new Error("No se pudo generar una cuadrícula robusta con estos datos.");
  }

  function dateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function selectDaily(players, key, predicate = () => true) {
    const pool = players.filter(predicate);
    const random = seededRandom(key);
    return pool[Math.floor(random() * pool.length)];
  }

  function careerSpan(player) {
    const years = player.clubs.flatMap(club => [club.start, club.end]).filter(Number.isFinite);
    if (!years.length) return 0;
    const first = Math.min(...years);
    const last = Math.max(...years);
    return Math.max(0, last - first);
  }

  const api = { LEAGUE_NAMES, normalize, birthYear, birthDecade, seededRandom, shuffle, generateGrid, selectDaily, dateKey, careerSpan, hasDistinctAssignment };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PIZARRA_CORE = api;
})(typeof window !== "undefined" ? window : globalThis);
