(function () {
  "use strict";

  const data = window.PIZARRA_DATA;
  const core = window.PIZARRA_CORE;
  const app = document.getElementById("app");
  const toast = document.getElementById("toast");
  const players = data?.players ?? [];
  const verifiedPlayers = { ...(window.PIZARRA_ENRICHMENT ?? {}), ...(window.PIZARRA_VERIFIED ?? {}) };
  const playerById = new Map(players.map(player => [player.id, player]));
  const today = core.dateKey();
  const TODAY_LABEL = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const state = {
    view: "home", selected: {}, grid: null, gridMode: "daily", gridDifficulty: "medium",
    trajectory: null, trajectoryMode: "daily", trajectoryDifficulty: "medium",
    identity: null, identityMode: "daily", identityDifficulty: "medium",
    duel: null, duelMode: "daily", duelDifficulty: "medium", duelBest: Number(localStorage.getItem("pizarra-duel-best")) || 0
  };
  const GAME_MODES = {
    daily: { label: "Diario", description: "La misma prueba para todos · se renueva a las 00:00" },
    infinite: { label: "Infinito", description: "Juega tantas partidas como quieras" },
    timed: { label: "Contrarreloj", description: "Tres segundos de preparación y 3:00 para completar la prueba" },
    flawless: { label: "Sin errores", description: "Un único fallo termina la partida" }
  };
  const DIFFICULTIES = {
    easy: { label: "Fácil", minSitelinks: 60, description: "Figuras y clubes muy reconocibles" },
    medium: { label: "Medio", minSitelinks: 50, description: "Nombres conocidos con alguna sorpresa" },
    hard: { label: "Difícil", minSitelinks: 40, description: "Carreras menos evidentes y jugadores secundarios" },
    expert: { label: "Experto", minSitelinks: 35, description: "Toda la base, incluidos los perfiles más rebuscados" }
  };
  const IDENTITY_PROFILE_VERSION = 12;
  let gameTimer = null;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function safeParse(value, fallback) {
    try { return JSON.parse(value) ?? fallback; } catch (_) { return fallback; }
  }

  function gameKey(name) { return `pizarra-${name}-${today}`; }
  function markDone(name) { localStorage.setItem(gameKey(name), "done"); }
  function isDone(name) { return localStorage.getItem(gameKey(name)) === "done"; }
  function formatUpdated() {
    return new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeStyle: "short" }).format(new Date(data.updatedAt));
  }
  function playerMeta(player) {
    return `${player.positions[0] || "Jugador"} · ${player.nationalities[0] || "—"}`;
  }
  function birthYear(player) { return core.birthYear(player); }
  function primaryClub(player) { return verifiedPlayers[player.id]?.club || [...player.clubs].sort((a, b) => (b.start || 0) - (a.start || 0))[0]; }
  function shirtNumber(player) { return verifiedPlayers[player.id]?.shirtNumber ?? player.shirtNumber ?? null; }
  function isIdentityEligible(player) {
    const profile = verifiedPlayers[player.id];
    return Boolean(profile?.club && Number.isInteger(profile.shirtNumber) && player.positions.length && player.nationalities.length && birthYear(player));
  }

  function nav() {
    const items = [
      ["home", "⌂", "Inicio"], ["grid", "▦", "3×3"], ["trajectory", "↗", "Trayectoria"],
      ["identity", "?", "Quién soy"], ["duel", "⇅", "Duelo"]
    ];
    return `<nav class="bottom-nav" aria-label="Juegos">${items.map(([id, icon, label]) => `
      <button class="nav-btn ${state.view === id ? "active" : ""}" data-view="${id}"><span>${icon}</span>${label}</button>
    `).join("")}</nav>`;
  }

  function topbar() {
    return `<header class="topbar">
      <button class="brand" data-view="home" aria-label="Volver al inicio">
        <span class="brand-mark">P</span><span class="brand-copy"><strong>Pizarra</strong><small>Puzles diarios de fútbol</small></span>
      </button>
    </header>`;
  }

  function render() {
    let content;
    if (state.view === "grid") content = renderGrid();
    else if (state.view === "trajectory") content = renderTrajectory();
    else if (state.view === "identity") content = renderIdentity();
    else if (state.view === "duel") content = renderDuel();
    else if (state.view === "info") content = renderInfo();
    else content = renderHome();
    app.innerHTML = `<div class="shell">${topbar()}${content}</div>${nav()}`;
    bindSearchInputs();
    if (state.view === "grid" && state.grid) ensureGridTimer(state.grid);
    else if (["trajectory", "identity", "duel"].includes(state.view) && state[state.view]) ensureChallengeTimer(state.view, state[state.view]);
    requestAnimationFrame(() => document.querySelector("[data-autofocus]")?.focus());
  }

  function renderHome() {
    const done = ["grid", "trajectory", "identity", "duel"].filter(isDone).length;
    return `<section class="hero">
      <div class="eyebrow">${escapeHtml(TODAY_LABEL)} · edición diaria</div>
      <h1>Cuatro formas de leer el fútbol.</h1>
      <p class="lead">Cruza carreras, sigue trayectorias y mide tu intuición con una selección histórica actualizada de las cinco grandes ligas.</p>
      <p class="help general-note">Las trayectorias y los hechos del juego se contabilizan desde 1990.</p>
      <div class="score-strip two-stat">
        <div class="score-stat"><strong>${done}/4</strong><small>diarios</small></div>
        <div class="score-stat"><strong>${state.duelBest}</strong><small>mejor racha</small></div>
      </div>
      <div class="game-list">
        ${gameCard("grid", "01", "Cuadrícula 3×3", "Una condición por encabezado, nueve respuestas y ningún jugador repetido.")}
        ${gameCard("trajectory", "02", "Trayectoria", "Adivina al jugador siguiendo sus clubes en las cinco grandes ligas.")}
        ${gameCard("identity", "03", "Quién soy", "Ocho intentos para comparar nacionalidad, liga, equipo, posición, edad y dorsal.")}
        ${gameCard("duel", "04", "Mayor o menor", "Compara carreras y encadena tantos aciertos como puedas.")}
      </div>
    </section>`;
  }

  function gameCard(id, number, title, description) {
    const status = isDone(id) ? "Completado hoy" : "Nuevo hoy";
    return `<button class="game-card" data-view="${id}" data-number="${number}"><span><span class="status">${status}</span><b>${title}</b><p>${description}</p></span></button>`;
  }

  function clearGameTimer() {
    if (gameTimer) clearInterval(gameTimer);
    gameTimer = null;
  }

  function modePicker(type, mode) {
    return `<div class="mode-picker" aria-label="Modo de juego">${Object.entries(GAME_MODES).map(([id, option]) => `<button class="mode-option ${id === mode ? "active" : ""}" data-game="${type}" data-game-mode="${id}" ${id === mode ? "disabled" : ""}>${escapeHtml(option.label)}</button>`).join("")}</div>`;
  }

  function difficultyPicker(type, difficulty) {
    return `<div class="difficulty-picker" aria-label="Dificultad">${Object.entries(DIFFICULTIES).map(([id, option]) => `<button class="difficulty-option ${id === difficulty ? "active" : ""}" data-game="${type}" data-difficulty="${id}" ${id === difficulty ? "disabled" : ""}>${escapeHtml(option.label)}</button>`).join("")}</div>`;
  }

  function difficultyPool(difficulty, predicate = () => true) {
    const minimum = DIFFICULTIES[difficulty]?.minSitelinks ?? DIFFICULTIES.medium.minSitelinks;
    return players.filter(player => player.sitelinks >= minimum && predicate(player));
  }

  function difficultyHelp(difficulty) {
    return DIFFICULTIES[difficulty]?.description ?? DIFFICULTIES.medium.description;
  }

  function timedState(mode) {
    return { preparing: mode === "timed", prepEndsAt: mode === "timed" ? Date.now() + 3000 : null, endsAt: null, lostReason: "" };
  }

  function gridSeed(mode, difficulty) {
    return mode === "daily" ? `grid:${today}:${difficulty}` : `grid:${mode}:${difficulty}:${Date.now()}:${Math.random()}`;
  }

  function initGrid() {
    if (state.grid) return;
    const mode = state.gridMode;
    const difficulty = state.gridDifficulty;
    const puzzle = core.generateGrid(difficultyPool(difficulty), gridSeed(mode, difficulty));
    const saved = mode === "daily" ? safeParse(localStorage.getItem(gameKey(`grid-state-${difficulty}`)), null) : null;
    const answers = saved?.answers?.length === 9 ? saved.answers : Array(9).fill(null);
    state.grid = {
      ...puzzle, mode, difficulty, answers, active: null, errors: saved?.errors || 0,
      preparing: mode === "timed", prepEndsAt: mode === "timed" ? Date.now() + 3000 : null,
      endsAt: null, lost: false, lostReason: ""
    };
  }

  function resetGrid(mode = state.gridMode) {
    clearGameTimer();
    state.gridMode = mode;
    state.grid = null;
    state.selected.grid = null;
  }

  function remainingSeconds(game) {
    return game.mode === "timed" ? Math.max(0, Math.ceil((game.endsAt - Date.now()) / 1000)) : null;
  }

  function preparationSeconds(game) {
    return Math.max(0, Math.ceil((game.prepEndsAt - Date.now()) / 1000));
  }

  function formatTimer(seconds) {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function expireTimedGrid(game) {
    if (game.mode === "timed" && game.preparing) return false;
    if (game.mode === "timed" && !game.lost && !game.answers.every(Boolean) && remainingSeconds(game) <= 0) {
      game.active = null;
      game.lost = true;
      game.lostReason = "Se acabó el tiempo.";
      clearGameTimer();
      return true;
    }
    return false;
  }

  function ensureGridTimer(game) {
    clearGameTimer();
    if (game.mode !== "timed" || game.lost || game.answers.every(Boolean)) return;
    gameTimer = setInterval(() => {
      if (game.preparing) {
        const seconds = preparationSeconds(game);
        const timer = document.querySelector("[data-game-timer]");
        if (seconds > 0) { if (timer) timer.textContent = `Prepárate · ${seconds}`; return; }
        game.preparing = false;
        game.endsAt = Date.now() + 180000;
        render();
        return;
      }
      if (expireTimedGrid(game)) { render(); return; }
      const timer = document.querySelector("[data-game-timer]");
      if (timer) timer.textContent = formatTimer(remainingSeconds(game));
    }, 250);
  }

  function expireTimedChallenge(type, game) {
    if (game.mode !== "timed" || game.preparing || game.complete || game.lost) return false;
    if (remainingSeconds(game) > 0) return false;
    game.lost = true;
    game.lostReason = type === "duel" ? `Tiempo terminado: ${game.score || 0} aciertos.` : "Se acabó el tiempo.";
    clearGameTimer();
    return true;
  }

  function ensureChallengeTimer(type, game) {
    clearGameTimer();
    if (game.mode !== "timed" || game.complete || game.lost) return;
    gameTimer = setInterval(() => {
      if (game.preparing) {
        const seconds = preparationSeconds(game);
        const timer = document.querySelector("[data-game-timer]");
        if (seconds > 0) { if (timer) timer.textContent = `Prepárate · ${seconds}`; return; }
        game.preparing = false;
        game.endsAt = Date.now() + 180000;
        render();
        return;
      }
      if (expireTimedChallenge(type, game)) { render(); return; }
      const timer = document.querySelector("[data-game-timer]");
      if (timer) timer.textContent = formatTimer(remainingSeconds(game));
    }, 250);
  }

  function challengeSeed(type, mode, difficulty) {
    return mode === "daily" ? `${type}:${today}:${difficulty}` : `${type}:${mode}:${difficulty}:${Date.now()}:${Math.random()}`;
  }

  function resetChallenge(type, mode = state[`${type}Mode`]) {
    clearGameTimer();
    state[`${type}Mode`] = mode;
    state[type] = null;
    state.selected[type] = null;
  }

  function setDifficulty(type, difficulty) {
    clearGameTimer();
    state[`${type}Difficulty`] = difficulty;
    state[type] = null;
    state.selected[type] = null;
  }

  function saveGrid() {
    if (state.grid.mode === "daily") localStorage.setItem(gameKey(`grid-state-${state.grid.difficulty}`), JSON.stringify({ answers: state.grid.answers, errors: state.grid.errors }));
  }

  function renderGrid() {
    initGrid();
    const game = state.grid;
    expireTimedGrid(game);
    const complete = game.answers.every(Boolean);
    if (complete && game.mode === "daily") markDone("grid");
    let grid = `<div class="grid-corner"><strong>3×3</strong><small>sin repetir</small></div>`;
    for (const col of game.cols) grid += conditionHtml(col, "col-condition");
    for (let row = 0; row < 3; row++) {
      grid += conditionHtml(game.rows[row], "row-condition");
      for (let col = 0; col < 3; col++) {
        const index = row * 3 + col;
        const answer = game.answers[index];
        const player = answer ? playerById.get(answer.id) : null;
        grid += `<button class="grid-cell ${answer ? "filled" : ""}" data-grid-cell="${index}" ${answer || game.lost || game.preparing ? "disabled" : ""}>
          ${player ? `<strong>${escapeHtml(player.name)}</strong>` : `<span class="sr-only">Añadir jugador</span>`}
        </button>`;
      }
    }
    return `<section>
      <div class="game-header"><div class="eyebrow">${escapeHtml(GAME_MODES[game.mode].label)} · ${escapeHtml(DIFFICULTIES[game.difficulty].label)} · ${game.mode === "daily" ? today : "3×3"}</div><div class="game-header-line"><h2>Cuadrícula</h2><span class="badge">${game.mode === "timed" ? `<span data-game-timer>${game.preparing ? `Prepárate · ${preparationSeconds(game)}` : formatTimer(remainingSeconds(game))}</span>` : `${game.answers.filter(Boolean).length}/9`}</span></div>
      <p class="help">${escapeHtml(GAME_MODES[game.mode].description)}. ${escapeHtml(difficultyHelp(game.difficulty))}. Cruza una condición de la fila con una condición de la columna.</p></div>
      ${modePicker("grid", game.mode)}
      ${difficultyPicker("grid", game.difficulty)}
      <div class="score-strip two-stat"><div class="score-stat"><strong>${game.errors}</strong><small>fallos</small></div><div class="score-stat"><strong>${9 - game.answers.filter(Boolean).length}</strong><small>pendientes</small></div></div>
      <div class="grid-scroll"><div class="football-grid">${grid}</div></div>
      ${game.active !== null && !game.answers[game.active] && !game.lost ? renderGridEntry(game.active) : ""}
      ${complete || game.lost ? renderGridResult(complete) : ""}
    </section>`;
  }

  function conditionHtml(condition, extraClass = "") {
    return `<button class="condition ${extraClass}" data-condition="${escapeHtml(condition.detail)}"><b>${escapeHtml(condition.label)}</b></button>`;
  }

  function renderGridEntry(index) {
    const row = state.grid.rows[Math.floor(index / 3)], col = state.grid.cols[index % 3];
    return `<div class="panel"><div class="eyebrow">Casilla ${index + 1}</div><h3>${escapeHtml(row.label)} × ${escapeHtml(col.label)}</h3>
      <p class="muted">Tiene que cumplir: ${escapeHtml(row.detail)} ${escapeHtml(col.detail)}</p>
      ${searchBox("grid", "Escribe un jugador…")}
      <div class="actions"><button class="btn btn-primary" data-action="submit-grid">Comprobar</button><button class="btn btn-secondary" data-action="close-grid">Cancelar</button></div>
    </div>`;
  }

  function renderGridResult(complete) {
    const game = state.grid;
    const title = complete ? "Cuadrícula completa" : "Partida terminada";
    const detail = complete ? `${game.errors} fallos. ¡Cuadrícula resuelta!` : game.lostReason;
    return `<div class="result"><h3>${title}</h3><p>${escapeHtml(detail)}</p><div class="actions">${complete && game.mode === "daily" ? `<button class="btn btn-primary" data-action="share-grid">Compartir resultado</button>` : ""}<button class="btn btn-secondary" data-action="new-grid">${game.mode === "daily" ? "Jugar otro modo" : "Nueva cuadrícula"}</button></div></div>`;
  }

  function initTrajectory() {
    if (state.trajectory) return;
    const mode = state.trajectoryMode;
    const difficulty = state.trajectoryDifficulty;
    const pool = difficultyPool(difficulty, candidate => candidate.clubs.length >= 3 && candidate.positions.length);
    const player = core.selectDaily(pool, challengeSeed("trajectory", mode, difficulty));
    const saved = mode === "daily" ? safeParse(localStorage.getItem(gameKey(`trajectory-state-${difficulty}`)), {}) : {};
    state.trajectory = { player, mode, difficulty, attempts: saved.attempts || 0, complete: Boolean(saved.complete), lost: Boolean(saved.lost), ...timedState(mode) };
  }

  function renderTrajectory() {
    initTrajectory();
    const game = state.trajectory;
    expireTimedChallenge("trajectory", game);
    const revealed = game.complete || game.lost ? game.player.clubs.length : Math.min(game.player.clubs.length, game.attempts + 1);
    return `<section>
      <div class="game-header"><div class="eyebrow">${escapeHtml(GAME_MODES[game.mode].label)} · ${escapeHtml(DIFFICULTIES[game.difficulty].label)} · Trayectoria</div><div class="game-header-line"><h2>¿Quién recorrió este camino?</h2><span class="badge">${game.mode === "timed" ? `<span data-game-timer>${game.preparing ? `Prepárate · ${preparationSeconds(game)}` : formatTimer(remainingSeconds(game))}</span>` : `${Math.max(0, 5 - game.attempts)} intentos`}</span></div>
      <p class="help">${escapeHtml(GAME_MODES[game.mode].description)}. ${escapeHtml(difficultyHelp(game.difficulty))}. Solo mostramos su recorrido por los clubes incluidos en las cinco grandes ligas.</p></div>
      ${modePicker("trajectory", game.mode)}
      ${difficultyPicker("trajectory", game.difficulty)}
      <div class="career">${game.player.clubs.map((club, index) => `<div class="career-row ${index < revealed ? "" : "hidden-club"}"><span class="year">${club.start || "—"}${club.end ? `–${club.end}` : ""}</span><span class="dot"></span><span><b>${index < revealed ? escapeHtml(club.name) : "Club oculto"}</b><small>${escapeHtml(core.LEAGUE_NAMES[club.league] || club.leagueName)}</small></span></div>`).join("")}</div>
      ${!game.complete && !game.lost && !game.preparing ? `<div class="panel">${game.attempts >= 2 ? `<p class="muted">Pista: ${escapeHtml(game.player.positions.join(" / "))}</p>` : ""}${searchBox("trajectory", "¿Qué jugador es?")}<div class="actions"><button class="btn btn-primary" data-action="submit-trajectory">Responder</button><button class="btn btn-secondary" data-action="reveal-trajectory">Revelar otro club</button></div></div>` : game.complete || game.lost ? renderSimpleResult(game.complete, game.player, game.attempts, "trajectory", game) : ""}
    </section>`;
  }

  function initIdentity() {
    if (state.identity) return;
    const mode = state.identityMode;
    const difficulty = state.identityDifficulty;
    const pool = difficultyPool(difficulty, candidate => candidate.clubs.length >= 2 && isIdentityEligible(candidate));
    const player = core.selectDaily(pool, challengeSeed("identity", mode, difficulty));
    const saved = mode === "daily" ? safeParse(localStorage.getItem(gameKey(`identity-state-${difficulty}`)), {}) : {};
    const hasNewState = saved.profileVersion === IDENTITY_PROFILE_VERSION && saved.targetId === player.id && Array.isArray(saved.guesses);
    state.identity = { player, mode, difficulty, guesses: hasNewState ? saved.guesses : [], complete: hasNewState && Boolean(saved.complete), lost: hasNewState && Boolean(saved.lost), ...timedState(mode) };
  }

  function hasSharedValue(left, right) {
    return left.some(value => right.includes(value));
  }

  function identityComparison(guess, target) {
    const guessClub = primaryClub(guess), targetClub = primaryClub(target);
    const guessAge = new Date().getFullYear() - birthYear(guess);
    const targetAge = new Date().getFullYear() - birthYear(target);
    const guessNumber = shirtNumber(guess), targetNumber = shirtNumber(target);
    const age = guessAge === targetAge ? { state: "match", text: "Coincide" } :
      targetAge > guessAge ? { state: "higher", text: "↑ Mayor" } : { state: "lower", text: "↓ Menor" };
    return [
      { label: "Nacionalidad", state: hasSharedValue(guess.nationalities, target.nationalities) ? "match" : "miss", text: hasSharedValue(guess.nationalities, target.nationalities) ? "Coincide" : "No" },
      { label: "Liga", state: guessClub?.league === targetClub?.league ? "match" : "miss", text: guessClub?.league === targetClub?.league ? "Coincide" : "No" },
      { label: "Equipo", state: guessClub?.id === targetClub?.id ? "match" : "miss", text: guessClub?.id === targetClub?.id ? "Coincide" : "No" },
      { label: "Posición", state: hasSharedValue(guess.positions, target.positions) ? "match" : "miss", text: hasSharedValue(guess.positions, target.positions) ? "Coincide" : "No" },
      { label: "Edad", ...age },
      { label: "Dorsal", state: guessNumber === null || targetNumber === null ? "unknown" : guessNumber === targetNumber ? "match" : "miss", text: guessNumber === null || targetNumber === null ? "Sin dato" : guessNumber === targetNumber ? "Coincide" : "No" }
    ];
  }

  function renderIdentity() {
    initIdentity();
    const game = state.identity;
    expireTimedChallenge("identity", game);
    const remaining = Math.max(0, 8 - game.guesses.length);
    return `<section>
      <div class="game-header"><div class="eyebrow">${escapeHtml(GAME_MODES[game.mode].label)} · ${escapeHtml(DIFFICULTIES[game.difficulty].label)} · Identidad</div><div class="game-header-line"><h2>¿Quién soy?</h2><span class="badge">${game.mode === "timed" ? `<span data-game-timer>${game.preparing ? `Prepárate · ${preparationSeconds(game)}` : formatTimer(remainingSeconds(game))}</span>` : `${remaining}/8 intentos`}</span></div><p class="help">${escapeHtml(GAME_MODES[game.mode].description)}. ${escapeHtml(difficultyHelp(game.difficulty))}. Tras cada jugador, compara Nacionalidad, Liga, Equipo, Posición, Edad y Dorsal con el futbolista misterioso.</p></div>
      ${modePicker("identity", game.mode)}
      ${difficultyPicker("identity", game.difficulty)}
      <div class="identity-key" aria-label="Cómo leer los resultados"><span class="match">Coincide</span><span class="miss">No coincide</span><span class="higher">↑ Mayor</span><span class="lower">↓ Menor</span></div>
      ${game.guesses.length ? `<div class="comparison-list">${game.guesses.map(id => { const guess = playerById.get(id); const results = identityComparison(guess, game.player); return `<article class="comparison-row"><strong>${escapeHtml(guess.name)}</strong><div class="comparison-cells">${results.map(item => `<span class="comparison-cell ${item.state}"><small>${item.label}</small><b>${item.text}</b></span>`).join("")}</div></article>`; }).join("")}</div>` : `<div class="empty-comparison">Introduce tu primer jugador para ver la comparación.</div>`}
      ${!game.complete && !game.lost && !game.preparing ? `<div class="panel">${searchBox("identity", "Escribe un jugador…")}<div class="actions"><button class="btn btn-primary" data-action="submit-identity">Comparar jugador</button></div></div>` : game.complete || game.lost ? renderSimpleResult(game.complete, game.player, Math.max(0, game.guesses.length - 1), "identity", game) : ""}
    </section>`;
  }

  function renderSimpleResult(won, player, attempts, type, game) {
    const ending = won ? `Lo resolviste usando ${attempts + 1} intento${attempts ? "s" : ""}.` : game.lostReason || (game.mode === "daily" ? "Mañana habrá un nuevo jugador." : "Puedes comenzar otra partida.");
    return `<div class="result"><h3>${won ? "¡Correcto!" : "Fin del intento"}</h3><p>Era <strong>${escapeHtml(player.name)}</strong> · ${escapeHtml(playerMeta(player))}.</p><p>${escapeHtml(ending)}</p><button class="btn btn-secondary" data-new-game="${type}">${game.mode === "daily" ? "Jugar otro modo" : "Nueva partida"}</button></div>`;
  }

  const METRICS = [
    { id: "clubs", label: "¿Quién pasó por más clubes de la base?", short: "clubes", value: player => player.clubs.length },
    { id: "leagues", label: "¿Quién jugó en más ligas grandes diferentes?", short: "ligas", value: player => player.leagues.length },
    { id: "age", label: "¿Quién tiene más edad?", short: "años", value: player => new Date().getFullYear() - birthYear(player) },
    { id: "span", label: "¿Quién tuvo la trayectoria más larga en la base?", short: "años", value: player => core.careerSpan(player) }
  ];

  function initDuel() {
    if (state.duel) return;
    const mode = state.duelMode;
    const difficulty = state.duelDifficulty;
    state.duel = { mode, difficulty, streak: 0, best: state.duelBest, score: 0, round: 0, complete: false, lost: false, ...timedState(mode) };
    nextDuel();
  }

  function resetDuel(mode = state.duelMode) {
    clearGameTimer();
    state.duelMode = mode;
    state.duel = null;
  }

  function nextDuel(keepLeft) {
    const game = state.duel;
    const random = game.mode === "daily" ? core.seededRandom(`duel:${today}:${game.difficulty}:${game.round}`) : Math.random;
    const metric = METRICS[Math.floor(random() * METRICS.length)];
    const pool = difficultyPool(game.difficulty, player => metric.value(player) > 0);
    let left = keepLeft && pool.some(player => player.id === keepLeft.id) ? keepLeft : pool[Math.floor(random() * pool.length)];
    let guard = 0;
    while (metric.value(left) <= 0 && guard++ < 100) left = pool[Math.floor(random() * pool.length)];
    let right; guard = 0;
    do { right = pool[Math.floor(random() * pool.length)]; guard++; }
    while ((right.id === left.id || metric.value(right) === metric.value(left) || metric.value(right) <= 0) && guard < 200);
    state.duel = { ...game, metric, left, right, answered: false, correct: null, round: game.round + 1 };
  }

  function renderDuel() {
    initDuel();
    const game = state.duel, metric = game.metric;
    expireTimedChallenge("duel", game);
    const badge = game.mode === "timed" ? `<span data-game-timer>${game.preparing ? `Prepárate · ${preparationSeconds(game)}` : formatTimer(remainingSeconds(game))}</span>` : game.mode === "daily" ? "1 duelo" : `Racha ${game.streak}`;
    const result = game.lost ? `<div class="result"><h3>Partida terminada</h3><p>${escapeHtml(game.lostReason)}</p><button class="btn btn-secondary" data-new-game="duel">${game.mode === "daily" ? "Jugar otro modo" : "Nueva partida"}</button></div>` : game.answered ? `<div class="result"><h3>${game.correct ? "¡Acierto!" : "Fallo"}</h3><p>${escapeHtml(game.right.name)} registra ${metric.value(game.right)} ${metric.short}.</p>${game.complete ? `<button class="btn btn-secondary" data-new-game="duel">Jugar otro modo</button>` : `<button class="btn btn-primary" data-action="next-duel">Siguiente duelo</button>`}</div>` : "";
    return `<section>
      <div class="game-header"><div class="eyebrow">${escapeHtml(GAME_MODES[game.mode].label)} · ${escapeHtml(DIFFICULTIES[game.difficulty].label)} · Duelo</div><div class="game-header-line"><h2>Mayor o menor</h2><span class="badge">${badge}</span></div><p class="help">${escapeHtml(GAME_MODES[game.mode].description)}. ${escapeHtml(difficultyHelp(game.difficulty))}. ${escapeHtml(metric.label)}${game.mode === "timed" ? ` · ${game.score} aciertos` : ""}</p></div>
      ${modePicker("duel", game.mode)}
      ${difficultyPicker("duel", game.difficulty)}
      <div class="duel">
        ${duelCard(game.left, metric.value(game.left), metric.short, false)}<div class="duel-vs">VS</div>${duelCard(game.right, metric.value(game.right), metric.short, !game.answered)}
      </div>
      ${!game.answered && !game.lost && !game.preparing ? `<div class="duel-actions"><button class="btn btn-secondary" data-duel-choice="lower">Tiene menos</button><button class="btn btn-primary" data-duel-choice="higher">Tiene más</button></div>` : result}
    </section>`;
  }

  function duelCard(player, value, unit, hidden) {
    return `<article class="player-card"><div><div class="shirt">${escapeHtml(player.name.slice(0, 1))}</div><b>${escapeHtml(player.name)}</b><p>${escapeHtml(playerMeta(player))}</p></div><div class="metric-value ${hidden ? "hidden" : ""}">${hidden ? "?" : value}<small> ${hidden ? "" : unit}</small></div></article>`;
  }

  function renderInfo() {
    return `<section><div class="eyebrow">Transparencia</div><h2>Datos del juego</h2><p class="lead">La fecha de actualización aparece dentro de la aplicación para que nunca parezca que una trayectoria antigua es información en directo.</p>
      <div class="info-list">
        <article class="info-card"><h3>Actualización</h3><p>${escapeHtml(formatUpdated())}</p><p class="muted">${escapeHtml(data.scope)}</p></article>
        <article class="info-card"><h3>Fuente abierta</h3><p>Trayectorias, fechas, nacionalidades y posiciones proceden de <a href="${escapeHtml(data.sourceUrl)}" target="_blank" rel="noreferrer">Wikidata</a>, cuyos datos estructurados se publican bajo CC0.</p></article>
        <article class="info-card"><h3>Qué significa “jugó en”</h3><p>La base registra una vinculación del jugador con el club desde 1990. No implica necesariamente titularidad, un mínimo de partidos o que toda su carrera esté incluida.</p></article>
        <article class="info-card"><h3>Dificultad</h3><p>Los niveles ordenan la notoriedad, no la calidad deportiva. Fácil prioriza jugadores y clubes con mayor cobertura enciclopédica; Experto abre toda la selección, incluidos perfiles menos conocidos.</p></article>
        <article class="info-card"><h3>Actualizar en el futuro</h3><p>El proyecto incluye <code>scripts/update-data.mjs</code>. Al ejecutarlo vuelve a consultar la fuente y reconstruye la selección de 2.400 jugadores.</p></article>
      </div>
    </section>`;
  }

  function searchBox(context, placeholder) {
    return `<div class="input-wrap"><input class="text-input" data-search="${context}" data-autofocus autocomplete="off" placeholder="${escapeHtml(placeholder)}" /><div class="suggestions" data-suggestions="${context}" hidden></div></div>`;
  }

  function bindSearchInputs() {
    document.querySelectorAll("[data-search]").forEach(input => {
      input.addEventListener("input", () => updateSuggestions(input));
      input.addEventListener("keydown", event => { if (event.key === "Enter") submitForContext(input.dataset.search); });
    });
  }

  function updateSuggestions(input) {
    const context = input.dataset.search;
    const container = document.querySelector(`[data-suggestions="${context}"]`);
    const query = core.normalize(input.value);
    state.selected[context] = null;
    if (query.length < 2) { container.hidden = true; return; }
    const difficulty = state[context]?.difficulty || state[`${context}Difficulty`] || "medium";
    const minimum = DIFFICULTIES[difficulty].minSitelinks;
    const matches = players.filter(player => player.sitelinks >= minimum && core.normalize(player.name).includes(query) && (context !== "identity" || isIdentityEligible(player)))
      .sort((a, b) => Number(core.normalize(b.name).startsWith(query)) - Number(core.normalize(a.name).startsWith(query)) || b.sitelinks - a.sitelinks).slice(0, 7);
    container.innerHTML = matches.map(player => `<button class="suggestion" data-select-player="${player.id}" data-context="${context}"><span><b>${escapeHtml(player.name)}</b></span><span>›</span></button>`).join("");
    container.hidden = !matches.length;
  }

  function selectedPlayer(context) { return playerById.get(state.selected[context]); }
  function submitForContext(context) {
    if (context === "grid") submitGrid();
    if (context === "trajectory") submitGuess("trajectory");
    if (context === "identity") submitIdentity();
  }

  function submitGrid() {
    const player = selectedPlayer("grid");
    const game = state.grid;
    if (expireTimedGrid(game) || game.lost) return render();
    if (!player) return showToast("Selecciona un jugador de la lista.");
    if (game.answers.some(answer => answer?.id === player.id)) return showToast("Ese jugador ya está en la cuadrícula.");
    if (!game.cells[game.active].includes(player.id)) {
      game.errors++;
      if (game.mode === "flawless") {
        game.active = null;
        game.lost = true;
        game.lostReason = "Un fallo termina la partida en este modo.";
      }
      saveGrid();
      state.selected.grid = null;
      showToast(game.lost ? "Partida terminada." : "No cumple las dos condiciones.");
      render();
      return;
    }
    game.answers[game.active] = { id: player.id };
    game.active = null;
    state.selected.grid = null;
    saveGrid();
    if (game.answers.every(Boolean)) clearGameTimer();
    render();
  }

  function submitGuess(type) {
    const game = state[type];
    if (expireTimedChallenge(type, game) || game.lost || game.preparing) return render();
    const player = selectedPlayer(type);
    if (!player) return showToast("Selecciona un jugador de la lista.");
    if (player.id === game.player.id) {
      game.complete = true;
      if (game.mode === "daily") markDone(type);
      clearGameTimer();
    } else {
      game.attempts++;
      game.lost = game.mode === "flawless" || game.attempts >= 5;
      game.lostReason = game.mode === "flawless" ? "Un fallo termina la partida en este modo." : "Has agotado los intentos.";
      showToast(game.lost ? "Partida terminada." : "No es él. Se ha revelado una pista.");
    }
    if (game.mode === "daily") localStorage.setItem(gameKey(`${type}-state-${game.difficulty}`), JSON.stringify({ attempts: game.attempts, complete: game.complete, lost: game.lost }));
    state.selected[type] = null;
    render();
  }

  function submitIdentity() {
    const game = state.identity;
    if (expireTimedChallenge("identity", game) || game.lost || game.preparing) return render();
    const player = selectedPlayer("identity");
    if (!player) return showToast("Selecciona un jugador de la lista.");
    if (game.guesses.includes(player.id)) return showToast("Ese jugador ya está comparado.");
    game.guesses.push(player.id);
    if (player.id === game.player.id) {
      game.complete = true;
      if (game.mode === "daily") markDone("identity");
      clearGameTimer();
    } else if (game.mode === "flawless" || game.guesses.length >= 8) {
      game.lost = true;
      game.lostReason = game.mode === "flawless" ? "Un fallo termina la partida en este modo." : "Has agotado los 8 intentos.";
    } else {
      showToast("Comparación añadida.");
    }
    if (game.mode === "daily") localStorage.setItem(gameKey(`identity-state-${game.difficulty}`), JSON.stringify({ profileVersion: IDENTITY_PROFILE_VERSION, targetId: game.player.id, guesses: game.guesses, complete: game.complete, lost: game.lost }));
    state.selected.identity = null;
    render();
  }

  function reveal(type) {
    const game = state[type];
    if (expireTimedChallenge(type, game) || game.lost || game.preparing) return render();
    game.attempts++;
    game.lost = game.attempts >= 5;
    if (game.lost) game.lostReason = "Has agotado las pistas disponibles.";
    if (game.mode === "daily") localStorage.setItem(gameKey(`${type}-state-${game.difficulty}`), JSON.stringify({ attempts: game.attempts, complete: game.complete, lost: game.lost }));
    render();
  }

  async function shareGrid() {
    const blocks = state.grid.answers.map(() => "🟩");
    const rows = [blocks.slice(0,3).join(""), blocks.slice(3,6).join(""), blocks.slice(6,9).join("")].join("\n");
    const text = `Pizarra 3×3 · ${today}\n${rows}\n${state.grid.errors} fallos`;
    try {
      if (navigator.share) await navigator.share({ title: "Pizarra 3×3", text });
      else { await navigator.clipboard.writeText(text); showToast("Resultado copiado."); }
    } catch (_) {}
  }

  document.addEventListener("click", event => {
    const view = event.target.closest("[data-view]")?.dataset.view;
    if (view) { clearGameTimer(); state.view = view; render(); return; }
    const suggestion = event.target.closest("[data-select-player]");
    if (suggestion) {
      const context = suggestion.dataset.context, player = playerById.get(suggestion.dataset.selectPlayer);
      state.selected[context] = player.id;
      const input = document.querySelector(`[data-search="${context}"]`);
      input.value = player.name;
      document.querySelector(`[data-suggestions="${context}"]`).hidden = true;
      return;
    }
    const cell = event.target.closest("[data-grid-cell]");
    if (cell) { state.grid.active = Number(cell.dataset.gridCell); state.selected.grid = null; render(); return; }
    const modeButton = event.target.closest("[data-game-mode]");
    if (modeButton) {
      const type = modeButton.dataset.game, mode = modeButton.dataset.gameMode;
      if (type === "grid") resetGrid(mode);
      else if (type === "duel") resetDuel(mode);
      else resetChallenge(type, mode);
      render(); return;
    }
    const difficultyButton = event.target.closest("[data-difficulty]");
    if (difficultyButton) {
      setDifficulty(difficultyButton.dataset.game, difficultyButton.dataset.difficulty);
      render(); return;
    }
    const condition = event.target.closest("[data-condition]");
    if (condition) { showToast(condition.dataset.condition); return; }
    const choice = event.target.closest("[data-duel-choice]")?.dataset.duelChoice;
    if (choice) {
      const game = state.duel;
      if (expireTimedChallenge("duel", game) || game.lost || game.preparing) return render();
      const left = game.metric.value(game.left), right = game.metric.value(game.right);
      game.correct = choice === "higher" ? right > left : right < left;
      game.answered = true;
      game.streak = game.correct ? game.streak + 1 : 0;
      if (game.correct) game.score++;
      if (!game.correct && game.mode === "flawless") { game.lost = true; game.lostReason = "Un fallo termina la partida en este modo."; }
      if (game.mode === "daily") { game.complete = true; markDone("duel"); }
      game.best = Math.max(game.best, game.streak);
      state.duelBest = Math.max(state.duelBest, game.best);
      localStorage.setItem("pizarra-duel-best", game.best);
      render(); return;
    }
    const newGame = event.target.closest("[data-new-game]")?.dataset.newGame;
    if (newGame) {
      const currentMode = state[`${newGame}Mode`];
      const nextMode = currentMode === "daily" ? "infinite" : currentMode;
      if (newGame === "duel") resetDuel(nextMode); else resetChallenge(newGame, nextMode);
      render(); return;
    }
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "submit-grid") submitGrid();
    if (action === "close-grid") { state.grid.active = null; render(); }
    if (action === "share-grid") shareGrid();
    if (action === "new-grid") { resetGrid(state.gridMode === "daily" ? "infinite" : state.gridMode); render(); }
    if (action === "submit-trajectory") submitGuess("trajectory");
    if (action === "reveal-trajectory") reveal("trajectory");
    if (action === "submit-identity") submitIdentity();
    if (action === "next-duel") { nextDuel(state.duel.right); render(); }
  });

  if (!data || players.length < 100) {
    app.innerHTML = `<div class="loading"><strong>No se pudo cargar la base de jugadores.</strong></div>`;
    return;
  }
  render();
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./service-worker.js?v=14").catch(() => {});
})();

