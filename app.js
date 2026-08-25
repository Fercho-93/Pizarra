(function () {
  "use strict";

  const data = window.PIZARRA_DATA;
  const core = window.PIZARRA_CORE;
  const app = document.getElementById("app");
  const toast = document.getElementById("toast");
  const players = data?.players ?? [];
  const playerById = new Map(players.map(player => [player.id, player]));
  const today = core.dateKey();
  const TODAY_LABEL = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const state = {
    view: "home", selected: {}, grid: null, gridMode: "daily", trajectory: null, identity: null,
    duel: { streak: 0, best: Number(localStorage.getItem("pizarra-duel-best")) || 0 }
  };
  const GRID_MODES = {
    daily: { label: "Diario", description: "La misma cuadrícula para todos · se renueva a las 00:00" },
    infinite: { label: "Infinito", description: "Una nueva cuadrícula cada vez que quieras" },
    timed: { label: "Contrarreloj", description: "Completa la cuadrícula antes de que se agoten 3:00" },
    flawless: { label: "Sin errores", description: "Un único fallo termina la partida" }
  };
  let gridTimer = null;

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
  function primaryClub(player) { return [...player.clubs].sort((a, b) => (b.start || 0) - (a.start || 0))[0]; }

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
    requestAnimationFrame(() => document.querySelector("[data-autofocus]")?.focus());
  }

  function renderHome() {
    const done = ["grid", "trajectory", "identity"].filter(isDone).length;
    return `<section class="hero">
      <div class="eyebrow">${escapeHtml(TODAY_LABEL)} · edición diaria</div>
      <h1>Cuatro formas de leer el fútbol.</h1>
      <p class="lead">Cruza carreras, sigue trayectorias y mide tu intuición con una selección histórica actualizada de las cinco grandes ligas.</p>
      <p class="help general-note">Las trayectorias y los hechos del juego se contabilizan desde 1990.</p>
      <div class="score-strip two-stat">
        <div class="score-stat"><strong>${done}/3</strong><small>diarios</small></div>
        <div class="score-stat"><strong>${state.duel.best}</strong><small>mejor racha</small></div>
      </div>
      <div class="game-list">
        ${gameCard("grid", "01", "Cuadrícula 3×3", "Una condición por encabezado, nueve respuestas y ningún jugador repetido.")}
        ${gameCard("trajectory", "02", "Trayectoria", "Adivina al jugador siguiendo sus clubes en las cinco grandes ligas.")}
        ${gameCard("identity", "03", "Quién soy", "Una identidad oculta y seis pistas que se revelan una a una.")}
        ${gameCard("duel", "04", "Mayor o menor", "Compara carreras y encadena tantos aciertos como puedas.", true)}
      </div>
    </section>`;
  }

  function gameCard(id, number, title, description, endless = false) {
    const status = endless ? "Sin límite" : isDone(id) ? "Completado hoy" : "Nuevo hoy";
    return `<button class="game-card" data-view="${id}" data-number="${number}"><span><span class="status">${status}</span><b>${title}</b><p>${description}</p></span></button>`;
  }

  function clearGridTimer() {
    if (gridTimer) clearInterval(gridTimer);
    gridTimer = null;
  }

  function gridSeed(mode) {
    return mode === "daily" ? `grid:${today}` : `grid:${mode}:${Date.now()}:${Math.random()}`;
  }

  function initGrid() {
    if (state.grid) return;
    const mode = state.gridMode;
    const puzzle = core.generateGrid(players, gridSeed(mode));
    const saved = mode === "daily" ? safeParse(localStorage.getItem(gameKey("grid-state")), null) : null;
    const answers = saved?.answers?.length === 9 ? saved.answers : Array(9).fill(null);
    state.grid = {
      ...puzzle, mode, answers, active: null, errors: saved?.errors || 0,
      endsAt: mode === "timed" ? Date.now() + 180000 : null, lost: false, lostReason: ""
    };
  }

  function resetGrid(mode = state.gridMode) {
    clearGridTimer();
    state.gridMode = mode;
    state.grid = null;
    state.selected.grid = null;
  }

  function remainingSeconds(game) {
    return game.mode === "timed" ? Math.max(0, Math.ceil((game.endsAt - Date.now()) / 1000)) : null;
  }

  function formatTimer(seconds) {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function expireTimedGrid(game) {
    if (game.mode === "timed" && !game.lost && !game.answers.every(Boolean) && remainingSeconds(game) <= 0) {
      game.active = null;
      game.lost = true;
      game.lostReason = "Se acabó el tiempo.";
      clearGridTimer();
      return true;
    }
    return false;
  }

  function ensureGridTimer(game) {
    clearGridTimer();
    if (game.mode !== "timed" || game.lost || game.answers.every(Boolean)) return;
    gridTimer = setInterval(() => {
      if (expireTimedGrid(game)) { render(); return; }
      const timer = document.querySelector("[data-grid-timer]");
      if (timer) timer.textContent = formatTimer(remainingSeconds(game));
    }, 250);
  }

  function rarityFor(player) {
    const index = players.findIndex(item => item.id === player.id);
    return Math.max(4, Math.round(99 - (index / Math.max(1, players.length - 1)) * 95));
  }

  function saveGrid() {
    if (state.grid.mode === "daily") localStorage.setItem(gameKey("grid-state"), JSON.stringify({ answers: state.grid.answers, errors: state.grid.errors }));
  }

  function renderGrid() {
    initGrid();
    const game = state.grid;
    expireTimedGrid(game);
    const complete = game.answers.every(Boolean);
    const score = game.answers.reduce((total, answer) => total + (answer?.rarity || 0), 0);
    if (complete && game.mode === "daily") markDone("grid");
    let grid = `<div class="grid-corner"><strong>3×3</strong><small>sin repetir</small></div>`;
    for (const col of game.cols) grid += conditionHtml(col, "col-condition");
    for (let row = 0; row < 3; row++) {
      grid += conditionHtml(game.rows[row], "row-condition");
      for (let col = 0; col < 3; col++) {
        const index = row * 3 + col;
        const answer = game.answers[index];
        const player = answer ? playerById.get(answer.id) : null;
        grid += `<button class="grid-cell ${answer ? "filled" : ""}" data-grid-cell="${index}" ${answer || game.lost ? "disabled" : ""}>
          ${player ? `<strong>${escapeHtml(player.name)}</strong><small>Rareza ${answer.rarity}%</small>` : `<span class="sr-only">Añadir jugador</span>`}
        </button>`;
      }
    }
    return `<section>
      <div class="game-header"><div class="eyebrow">${escapeHtml(GRID_MODES[game.mode].label)} · ${game.mode === "daily" ? today : "3×3"}</div><div class="game-header-line"><h2>Cuadrícula</h2><span class="badge">${game.mode === "timed" ? `<span data-grid-timer>${formatTimer(remainingSeconds(game))}</span>` : `${game.answers.filter(Boolean).length}/9`}</span></div>
      <p class="help">${escapeHtml(GRID_MODES[game.mode].description)}. Cruza una condición de la fila con una condición de la columna.</p></div>
      <div class="mode-picker" aria-label="Modo de juego">${Object.entries(GRID_MODES).map(([id, mode]) => `<button class="mode-option ${id === game.mode ? "active" : ""}" data-grid-mode="${id}" ${id === game.mode ? "disabled" : ""}>${escapeHtml(mode.label)}</button>`).join("")}</div>
      <div class="score-strip"><div class="score-stat"><strong>${score}</strong><small>rareza total</small></div><div class="score-stat"><strong>${game.errors}</strong><small>fallos</small></div><div class="score-stat"><strong>${9 - game.answers.filter(Boolean).length}</strong><small>pendientes</small></div></div>
      <div class="grid-scroll"><div class="football-grid">${grid}</div></div>
      ${game.active !== null && !game.answers[game.active] && !game.lost ? renderGridEntry(game.active) : ""}
      ${complete || game.lost ? renderGridResult(score, complete) : ""}
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

  function renderGridResult(score, complete) {
    const game = state.grid;
    const title = complete ? "Cuadrícula completa" : "Partida terminada";
    const detail = complete ? `Rareza ${score} · ${game.errors} fallos. Cuanto más bajo, más originales fueron tus respuestas.` : game.lostReason;
    return `<div class="result"><h3>${title}</h3><p>${escapeHtml(detail)}</p><div class="actions">${complete && game.mode === "daily" ? `<button class="btn btn-primary" data-action="share-grid">Compartir resultado</button>` : ""}<button class="btn btn-secondary" data-action="new-grid">${game.mode === "daily" ? "Jugar otro modo" : "Nueva cuadrícula"}</button></div></div>`;
  }

  function initTrajectory() {
    if (state.trajectory) return;
    const player = core.selectDaily(players, `trajectory:${today}`, candidate => candidate.clubs.length >= 3 && candidate.positions.length && candidate.sitelinks >= 35);
    const saved = safeParse(localStorage.getItem(gameKey("trajectory-state")), {});
    state.trajectory = { player, attempts: saved.attempts || 0, complete: Boolean(saved.complete), lost: Boolean(saved.lost) };
  }

  function renderTrajectory() {
    initTrajectory();
    const game = state.trajectory;
    const revealed = game.complete || game.lost ? game.player.clubs.length : Math.min(game.player.clubs.length, game.attempts + 1);
    return `<section>
      <div class="game-header"><div class="eyebrow">Trayectoria diaria · ${today}</div><div class="game-header-line"><h2>¿Quién recorrió este camino?</h2><span class="badge">${Math.max(0, 5 - game.attempts)} intentos</span></div>
      <p class="help">Solo mostramos su recorrido por los clubes incluidos en las cinco grandes ligas.</p></div>
      <div class="career">${game.player.clubs.map((club, index) => `<div class="career-row ${index < revealed ? "" : "hidden-club"}"><span class="year">${club.start || "—"}${club.end ? `–${club.end}` : ""}</span><span class="dot"></span><span><b>${index < revealed ? escapeHtml(club.name) : "Club oculto"}</b><small>${escapeHtml(core.LEAGUE_NAMES[club.league] || club.leagueName)}</small></span></div>`).join("")}</div>
      ${!game.complete && !game.lost ? `<div class="panel">${game.attempts >= 2 ? `<p class="muted">Pista: ${escapeHtml(game.player.positions.join(" / "))}</p>` : ""}${searchBox("trajectory", "¿Qué jugador es?")}<div class="actions"><button class="btn btn-primary" data-action="submit-trajectory">Responder</button><button class="btn btn-secondary" data-action="reveal-trajectory">Revelar otro club</button></div></div>` : renderSimpleResult(game.complete, game.player, game.attempts)}
    </section>`;
  }

  function initIdentity() {
    if (state.identity) return;
    const player = core.selectDaily(players, `identity:${today}`, candidate => candidate.sitelinks >= 45 && candidate.clubs.length >= 2 && candidate.positions.length);
    const saved = safeParse(localStorage.getItem(gameKey("identity-state")), {});
    state.identity = { player, attempts: saved.attempts || 0, complete: Boolean(saved.complete), lost: Boolean(saved.lost) };
  }

  function identityClues(player) {
    const club = [...player.clubs].sort((a, b) => (a.start || 9999) - (b.start || 9999))[0];
    const year = birthYear(player);
    return [
      ["Nacionalidad", player.nationalities.join(" / ")],
      ["Generación", `Nació en la década de ${Math.floor(year / 10) * 10}`],
      ["Posición", player.positions.join(" / ")],
      ["Ligas", `Pasó por ${player.leagues.length} de las cinco grandes ligas`],
      ["Club", `Jugó en ${club?.name || "un club de la base"}`],
      ["Nacimiento", `Nació en ${year}`]
    ];
  }

  function renderIdentity() {
    initIdentity();
    const game = state.identity;
    const clues = identityClues(game.player);
    const revealed = game.complete || game.lost ? clues.length : Math.min(clues.length, game.attempts + 1);
    return `<section>
      <div class="game-header"><div class="eyebrow">Identidad diaria · ${today}</div><div class="game-header-line"><h2>¿Quién soy?</h2><span class="badge">Pista ${revealed}/6</span></div><p class="help">Cada fallo descubre una pista más precisa.</p></div>
      <div class="clues">${clues.map(([title, value], index) => `<div class="clue ${index < revealed ? "" : "locked"}"><span class="clue-index">${index + 1}</span><span class="clue-text"><small>${escapeHtml(title)}</small><b>${index < revealed ? escapeHtml(value) : "Pista bloqueada"}</b></span></div>`).join("")}</div>
      ${!game.complete && !game.lost ? `<div class="panel">${searchBox("identity", "Escribe un jugador…")}<div class="actions"><button class="btn btn-primary" data-action="submit-identity">Responder</button><button class="btn btn-secondary" data-action="reveal-identity">Pedir pista</button></div></div>` : renderSimpleResult(game.complete, game.player, game.attempts)}
    </section>`;
  }

  function renderSimpleResult(won, player, attempts) {
    return `<div class="result"><h3>${won ? "¡Correcto!" : "Fin del intento"}</h3><p>Era <strong>${escapeHtml(player.name)}</strong> · ${escapeHtml(playerMeta(player))}.</p><p>${won ? `Lo resolviste usando ${attempts + 1} pista${attempts ? "s" : ""}.` : "Mañana habrá un nuevo jugador."}</p></div>`;
  }

  const METRICS = [
    { id: "clubs", label: "¿Quién pasó por más clubes de la base?", short: "clubes", value: player => player.clubs.length },
    { id: "leagues", label: "¿Quién jugó en más ligas grandes diferentes?", short: "ligas", value: player => player.leagues.length },
    { id: "age", label: "¿Quién tiene más edad?", short: "años", value: player => new Date().getFullYear() - birthYear(player) },
    { id: "span", label: "¿Quién tuvo la trayectoria más larga en la base?", short: "años", value: player => core.careerSpan(player) }
  ];

  function nextDuel(keepLeft) {
    const random = Math.random;
    const metric = METRICS[Math.floor(random() * METRICS.length)];
    let left = keepLeft || players[Math.floor(random() * Math.min(900, players.length))];
    let guard = 0;
    while (metric.value(left) <= 0 && guard++ < 100) left = players[Math.floor(random() * Math.min(900, players.length))];
    let right; guard = 0;
    do { right = players[Math.floor(random() * Math.min(1200, players.length))]; guard++; }
    while ((right.id === left.id || metric.value(right) === metric.value(left) || metric.value(right) <= 0) && guard < 200);
    state.duel = { ...state.duel, metric, left, right, answered: false, correct: null };
  }

  function renderDuel() {
    if (!state.duel.metric) nextDuel();
    const game = state.duel, metric = game.metric;
    return `<section>
      <div class="game-header"><div class="eyebrow">Modo infinito</div><div class="game-header-line"><h2>Mayor o menor</h2><span class="badge">Racha ${game.streak}</span></div><p class="help">${escapeHtml(metric.label)}</p></div>
      <div class="duel">
        ${duelCard(game.left, metric.value(game.left), metric.short, false)}<div class="duel-vs">VS</div>${duelCard(game.right, metric.value(game.right), metric.short, !game.answered)}
      </div>
      ${!game.answered ? `<div class="duel-actions"><button class="btn btn-secondary" data-duel-choice="lower">Tiene menos</button><button class="btn btn-primary" data-duel-choice="higher">Tiene más</button></div>` : `<div class="result"><h3>${game.correct ? "¡Acierto!" : "Racha terminada"}</h3><p>${escapeHtml(game.right.name)} registra ${metric.value(game.right)} ${metric.short}.</p><button class="btn btn-primary" data-action="next-duel">Siguiente duelo</button></div>`}
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
    const matches = players.filter(player => core.normalize(player.name).includes(query))
      .sort((a, b) => Number(core.normalize(b.name).startsWith(query)) - Number(core.normalize(a.name).startsWith(query)) || b.sitelinks - a.sitelinks).slice(0, 7);
    container.innerHTML = matches.map(player => `<button class="suggestion" data-select-player="${player.id}" data-context="${context}"><span><b>${escapeHtml(player.name)}</b></span><span>›</span></button>`).join("");
    container.hidden = !matches.length;
  }

  function selectedPlayer(context) { return playerById.get(state.selected[context]); }
  function submitForContext(context) {
    if (context === "grid") submitGrid();
    if (context === "trajectory") submitGuess("trajectory");
    if (context === "identity") submitGuess("identity");
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
    game.answers[game.active] = { id: player.id, rarity: rarityFor(player) };
    game.active = null;
    state.selected.grid = null;
    saveGrid();
    if (game.answers.every(Boolean)) clearGridTimer();
    render();
  }

  function submitGuess(type) {
    const game = state[type];
    const player = selectedPlayer(type);
    if (!player) return showToast("Selecciona un jugador de la lista.");
    if (player.id === game.player.id) {
      game.complete = true;
      markDone(type);
    } else {
      game.attempts++;
      game.lost = game.attempts >= (type === "identity" ? 6 : 5);
      showToast("No es él. Se ha revelado una pista.");
    }
    localStorage.setItem(gameKey(`${type}-state`), JSON.stringify({ attempts: game.attempts, complete: game.complete, lost: game.lost }));
    state.selected[type] = null;
    render();
  }

  function reveal(type) {
    const game = state[type];
    game.attempts++;
    game.lost = game.attempts >= (type === "identity" ? 6 : 5);
    localStorage.setItem(gameKey(`${type}-state`), JSON.stringify({ attempts: game.attempts, complete: game.complete, lost: game.lost }));
    render();
  }

  async function shareGrid() {
    const blocks = state.grid.answers.map(answer => answer.rarity <= 35 ? "🟩" : answer.rarity <= 70 ? "🟨" : "🟥");
    const rows = [blocks.slice(0,3).join(""), blocks.slice(3,6).join(""), blocks.slice(6,9).join("")].join("\n");
    const score = state.grid.answers.reduce((sum, answer) => sum + answer.rarity, 0);
    const text = `Pizarra 3×3 · ${today}\n${rows}\nRareza ${score} · ${state.grid.errors} fallos`;
    try {
      if (navigator.share) await navigator.share({ title: "Pizarra 3×3", text });
      else { await navigator.clipboard.writeText(text); showToast("Resultado copiado."); }
    } catch (_) {}
  }

  document.addEventListener("click", event => {
    const view = event.target.closest("[data-view]")?.dataset.view;
    if (view) { state.view = view; render(); return; }
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
    const gridMode = event.target.closest("[data-grid-mode]")?.dataset.gridMode;
    if (gridMode) { resetGrid(gridMode); render(); return; }
    const condition = event.target.closest("[data-condition]");
    if (condition) { showToast(condition.dataset.condition); return; }
    const choice = event.target.closest("[data-duel-choice]")?.dataset.duelChoice;
    if (choice) {
      const game = state.duel, left = game.metric.value(game.left), right = game.metric.value(game.right);
      game.correct = choice === "higher" ? right > left : right < left;
      game.answered = true;
      game.streak = game.correct ? game.streak + 1 : 0;
      game.best = Math.max(game.best, game.streak);
      localStorage.setItem("pizarra-duel-best", game.best);
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
    if (action === "submit-identity") submitGuess("identity");
    if (action === "reveal-identity") reveal("identity");
    if (action === "next-duel") { nextDuel(state.duel.right); render(); }
  });

  if (!data || players.length < 100) {
    app.innerHTML = `<div class="loading"><strong>No se pudo cargar la base de jugadores.</strong></div>`;
    return;
  }
  render();
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./service-worker.js?v=6").catch(() => {});
})();

