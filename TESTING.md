# Tests — Tenis de Mesa

Dos capas de tests, **ambas corren localmente**:

| Capa | Herramienta | Qué cubre | Comando |
|------|-------------|-----------|---------|
| **Unit** | Vitest + jsdom | Lógica pura y acciones de `app.js`, `store.js` y los helpers del `worker/worker.js` | `npm test` |
| **E2E** | Playwright | La app real corriendo en un navegador (login, navegación, alta de datos) | `npm run test:e2e` |

## Comandos

```bash
npm test            # unit tests (rápido)
npm run test:watch  # unit en modo watch (mientras desarrollás)
npm run test:cov    # unit + reporte de cobertura (coverage/ + consola)
npm run test:e2e    # Playwright E2E (levanta un server estático solo)
npm run test:e2e:ui # Playwright en modo UI interactivo
npm run test:all    # unit + e2e (lo que conviene correr antes de cada cambio)
```

> **Flujo recomendado:** `npm run test:all` antes de cada commit. Si tocás solo lógica,
> alcanza con `npm test`; si tocás la UI, sumá `npm run test:e2e`.

La primera vez, instalá el navegador de Playwright: `npx playwright install chromium`.

## Cómo está armado

El proyecto es **vanilla JS clásico** (sin módulos): `app.js` define ~150 funciones y unas pocas
variables de estado (`let DB`, `let view`, ...) en el scope del script, sin `export`. Para testearlo:

- **`vitest.config.js`** incluye un plugin de Vite que, al importar `app.js`/`worker.js`, le agrega
  un *footer* que exporta las funciones internas (y unos setters de estado) como un objeto `__APP`/`__WK`.
  Quita la llamada `boot()` para que el import no arranque la app contra Firebase/DOM real. Como solo
  agrega líneas al final, la **cobertura sigue mapeando a los archivos reales**.
- **`tests/unit/harness.js`** carga ese módulo, prepara el DOM base (copia de `index.html`) y expone
  helpers: `reset()`, `seedDB()`, `login(USERS.x)`.
- **`tests/unit/fixtures.js`** construye torneos/categorías/partidos para los tests de grupos, llave,
  Elo y award.
- **`store.js`** se testea con un **fake de Firebase** (`tests/unit/store.test.js`) que fuerza el camino
  "Firebase habilitado".

Para los E2E, **`tests/e2e/server.mjs`** sirve los archivos reales pero reemplaza `firebase-config.js`
por una config vacía → la app entra en **modo local (localStorage)** y no necesita emulador.

## Estado de cobertura (unit)

- `store.js`: ~99%
- `app.js`: ~55% — cubierta toda la lógica pura (puntajes, elegibilidad, grupos, llave, Elo, award,
  permisos, ajustes, pagos) + los flujos de acción principales (CRUD jugadores/gimnasios/categorías/torneos,
  inscripción, carga de resultados) + render de todas las vistas. Lo que falta es sobre todo UI muy
  interactiva (editor de gimnasios con drag&drop, popovers, generación de PDF/WhatsApp, customizador de
  carta, apariencia con canvas).
- `worker/worker.js`: ~34% — router + validaciones + helpers de scoring. Las rutas profundas
  (MercadoPago / Firestore REST / firmado JWT) requieren mockear `fetch` + claves de servicio.

Para sumar cobertura, agregá el nombre de la función nueva a `EXPORT_NAMES` en `vitest.config.js`
y escribí el test en `tests/unit/`.
