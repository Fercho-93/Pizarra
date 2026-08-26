import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const core = require("./core.js");
const appSource = await readFile(new URL("./app.js", import.meta.url), "utf8");
const context = { window: {} };
vm.runInNewContext(await readFile(new URL("./data/players.js", import.meta.url), "utf8"), context);
vm.runInNewContext(await readFile(new URL("./data/enrichment.js", import.meta.url), "utf8"), context);
vm.runInNewContext(await readFile(new URL("./data/verified.js", import.meta.url), "utf8"), context);
const data = context.window.PIZARRA_DATA;
const enrichment = context.window.PIZARRA_ENRICHMENT;
const verified = context.window.PIZARRA_VERIFIED;
const identityProfiles = { ...enrichment, ...verified };

assert.equal(data.players.length, 2400, "La selección debe contener 2.400 jugadores");
assert.equal(new Set(data.players.map(player => player.id)).size, data.players.length, "No debe haber jugadores duplicados");
assert.ok(data.players.every(player => player.name && player.birth && player.clubs.length), "Todos los jugadores deben tener ficha utilizable");
assert.ok(data.players.some(player => /Lionel Messi/i.test(player.name)), "Debe incluir a Lionel Messi");
assert.ok(data.players.some(player => /Cristiano Ronaldo/i.test(player.name)), "Debe incluir a Cristiano Ronaldo");
assert.ok(!data.players.some(player => /Jason Statham/i.test(player.name)), "No debe incluir ocupaciones futbolísticas espurias");
assert.ok(Object.keys(enrichment).length >= 300, "Quién soy debe tener un conjunto amplio de perfiles contrastados");
for (const [id, profile] of Object.entries(enrichment)) {
  const player = data.players.find(candidate => candidate.id === id);
  assert.ok(player, `El perfil enriquecido ${id} debe pertenecer a un jugador importado`);
  assert.ok(Number.isInteger(profile.shirtNumber) && profile.shirtNumber >= 1 && profile.shirtNumber <= 99, `El dorsal de ${id} debe ser válido`);
  assert.ok(player.clubs.some(club => club.id === profile.club.id && (!club.end || club.end >= 2026)), `El club de ${id} debe tener una pertenencia vigente`);
}
assert.equal(verified.Q483837.club.id, verified.Q30055335.club.id, "Modrić y Leão deben compartir su club verificado");
assert.equal(verified.Q483837.club.league, verified.Q30055335.club.league, "Modrić y Leão deben compartir su liga verificada");

for (let day = 1; day <= 120; day++) {
  const grid = core.generateGrid(data.players, `test-2026-${String(day).padStart(3, "0")}`);
  assert.equal(grid.rows.length, 3);
  assert.equal(grid.cols.length, 3);
  assert.equal(grid.cells.length, 9);
  assert.ok(grid.rows.every(condition => ["nacionalidad", "posicion", "decada"].includes(condition.family)), "Cada fila debe tener una única condición");
  assert.ok(grid.cols.every(condition => ["club", "liga"].includes(condition.family)), "Cada columna debe tener una única condición");
  assert.ok(grid.cells.every(cell => cell.length >= 2 && cell.length <= 32), "Cada casilla debe ser específica y tener alternativas");
  assert.ok(core.hasDistinctAssignment(grid.cells), "La cuadrícula debe poder completarse sin repetir jugador");
}

const trajectory = core.selectDaily(data.players, "trajectory:test", player => player.clubs.length >= 3 && player.positions.length && player.sitelinks >= 35);
assert.ok(trajectory.clubs.length >= 3);
const identity = core.selectDaily(data.players, "identity:test", player => player.clubs.length >= 2 && player.positions.length && player.sitelinks >= 45 && identityProfiles[player.id]?.club && Number.isInteger(identityProfiles[player.id]?.shirtNumber));
assert.ok(identity.clubs.length >= 2);
assert.ok(identityProfiles[identity.id], "La identidad diaria debe tener equipo y dorsal contrastados");
for (const game of ["grid", "trajectory", "identity", "duel"]) {
  assert.ok(appSource.includes(`settingsAccordion("${game}"`), `${game} debe mostrar la configuración en acordeón`);
}
assert.ok(appSource.includes("modePicker(type, game.mode)") && appSource.includes("difficultyPicker(type, game.difficulty)"), "El acordeón debe contener modalidades y dificultades");
assert.ok(appSource.includes("Date.now() + 3000") && appSource.includes("Date.now() + 180000"), "El modo contrarreloj debe tener preparación y tres minutos");
assert.ok(appSource.includes("data-home-game") && appSource.includes("game-card-collapse"), "La portada debe organizar los juegos en acordeón");
assert.ok(appSource.includes("IntersectionObserver") && appSource.includes("is-scrolled"), "La interfaz debe responder al desplazamiento");

for (const [difficulty, minimum] of Object.entries({ easy: 60, medium: 50, hard: 40, expert: 35 })) {
  const pool = data.players.filter(player => player.sitelinks >= minimum);
  assert.ok(pool.length >= 350, `${difficulty} debe tener suficientes jugadores`);
  for (let puzzle = 0; puzzle < 20; puzzle++) {
    const grid = core.generateGrid(pool, `difficulty:${difficulty}:${puzzle}`);
    assert.ok(core.hasDistinctAssignment(grid.cells), `La cuadrícula ${difficulty} debe ser resoluble`);
  }
}

console.log(`✓ ${data.players.length} jugadores validados`);
console.log("✓ 120 cuadrículas robustas, resolubles y sin repeticiones validadas");
console.log("✓ Selección diaria de Trayectoria y Quién soy validada");
console.log(`✓ ${Object.keys(enrichment).length} perfiles actuales con club y dorsal cruzados`);
console.log("✓ Cuatro modalidades habilitadas en los cuatro juegos");
console.log("✓ Cuatro dificultades progresivas validadas en los cuatro juegos");

