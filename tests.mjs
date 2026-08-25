import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const core = require("./core.js");
const context = { window: {} };
vm.runInNewContext(await readFile(new URL("./data/players.js", import.meta.url), "utf8"), context);
const data = context.window.PIZARRA_DATA;

assert.equal(data.players.length, 2400, "La selección debe contener 2.400 jugadores");
assert.equal(new Set(data.players.map(player => player.id)).size, data.players.length, "No debe haber jugadores duplicados");
assert.ok(data.players.every(player => player.name && player.birth && player.clubs.length), "Todos los jugadores deben tener ficha utilizable");
assert.ok(data.players.some(player => /Lionel Messi/i.test(player.name)), "Debe incluir a Lionel Messi");
assert.ok(data.players.some(player => /Cristiano Ronaldo/i.test(player.name)), "Debe incluir a Cristiano Ronaldo");

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
const identity = core.selectDaily(data.players, "identity:test", player => player.clubs.length >= 2 && player.positions.length && player.sitelinks >= 45);
assert.ok(identity.clubs.length >= 2);

console.log(`✓ ${data.players.length} jugadores validados`);
console.log("✓ 120 cuadrículas robustas, resolubles y sin repeticiones validadas");
console.log("✓ Selección diaria de Trayectoria y Quién soy validada");

