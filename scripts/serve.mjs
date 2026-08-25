import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = new URL("../", import.meta.url).pathname.replace(/^\/(.:)/, "$1");
const port = Number(process.env.PORT) || 4173;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };

createServer((request, response) => {
  const clean = decodeURIComponent((request.url || "/").split("?")[0]);
  let file = normalize(join(root, clean === "/" ? "index.html" : clean.replace(/^\//, "")));
  if (!file.startsWith(normalize(root)) || !existsSync(file)) { response.writeHead(404); response.end("Not found"); return; }
  if (statSync(file).isDirectory()) file = join(file, "index.html");
  response.setHeader("Content-Type", types[extname(file)] || "application/octet-stream");
  response.setHeader("Cache-Control", "no-store");
  createReadStream(file).pipe(response);
}).listen(port, "127.0.0.1", () => console.log(`Pizarra disponible en http://127.0.0.1:${port}`));

