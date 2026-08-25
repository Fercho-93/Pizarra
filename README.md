# Pizarra

Colección instalable de cuatro puzles de fútbol:

- **Cuadrícula 3×3:** cruces con condiciones compuestas; no se puede repetir jugador.
- **Trayectoria:** adivina al jugador a partir de sus clubes en las cinco grandes ligas.
- **Quién soy:** identidad diaria con seis pistas progresivas.
- **Mayor o menor:** modo infinito de comparación de carreras.

## Probarla

Sirve esta carpeta con cualquier servidor estático. Por ejemplo:

```sh
npx serve .
```

Después abre la dirección indicada. No abras `index.html` directamente si quieres comprobar el modo sin conexión.

## Instalar en iPhone

1. Publica la carpeta en GitHub Pages o cualquier alojamiento HTTPS.
2. Abre la dirección desde Safari.
3. Pulsa **Compartir → Añadir a pantalla de inicio**.
4. Tras la primera carga, la aplicación funciona sin conexión.

## Datos

La copia incluida se generó el 25 de agosto de 2026 a partir de datos estructurados de Wikidata (CC0). Contiene una selección de 2.400 jugadores vinculados desde 1990 a clubes de Premier League, LaLiga, Serie A, Bundesliga o Ligue 1.

Para reconstruir la base con la información disponible en Wikidata en una fecha posterior:

```sh
npm run update:data
```

Las trayectorias muestran únicamente los clubes de la base pertenecientes a esas cinco ligas; no pretenden representar todos los equipos de la carrera de cada jugador.

## Comprobaciones

```sh
npm test
```

Las pruebas validan la estructura de los 2.400 jugadores y generan 120 cuadrículas para asegurar que todas tengan soluciones alternativas y puedan completarse sin repetir nombres.
