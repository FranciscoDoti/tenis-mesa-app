// Constructores de datos para los tests de torneo (grupos / llave / Elo / award).
import { app } from './harness.js';

// Crea un DB mínimo con 1 org + 1 escuela y N jugadores con puntos dados.
// `points` es un array; cada jugador queda con id p0,p1,... y nombre "Jug0", etc.
export function dbWithPlayers(points = [], opts = {}) {
  const org = { id: 'org_byd', name: 'BYD', schools: [{ id: 'sch_bari', name: 'Bariloche' }, { id: 'sch_dina', name: 'Dina' }] };
  const players = points.map((pts, i) => ({
    id: 'p' + i, firstName: 'Jug' + i, lastName: 'Apellido' + i,
    category: app.levelFromPoints(pts), points: pts, openPoints: 0,
    orgId: 'org_byd', schoolId: 'sch_bari', gender: i % 2 ? 'F' : 'M',
    ...(opts.playerOverride ? opts.playerOverride(i) : {}),
  }));
  const db = {
    orgs: [org], players, gyms: [], news: [], payAccounts: [], payments: [],
    users: [], tournaments: [],
    settings: JSON.parse(JSON.stringify(app.DEFAULT_SETTINGS)),
  };
  app.__setDB(db);
  return db;
}

// Agrega un torneo con una categoría (single por defecto) y un entrante por jugador.
// Devuelve { t, cat }.
export function addTournament(db, catOver = {}) {
  const cat = {
    id: 'c0', name: catOver.name || 'Mayores', format: catOver.format || 'single',
    rule: catOver.rule || { type: 'open' }, rules: { sets: 5, groupMin: 3, groupMax: 4 },
    setsFormat: catOver.setsFormat || 'all5', championPoints: catOver.championPoints != null ? catOver.championPoints : 20,
    cost: catOver.cost || 0, entrants: [], groups: null, matches: null, bracket: null, thirdPlace: null, closed: false,
    ...catOver,
  };
  // un entrante por jugador (o por pareja si se pasan teams)
  if (catOver.teams) {
    cat.entrants = catOver.teams.map((players, i) => ({ id: 'e' + i, players }));
  } else {
    cat.entrants = db.players.map((p, i) => ({ id: 'e' + i, players: [p.id] }));
  }
  const t = {
    id: 't0', name: 'Torneo Test', date: '2026-07-11', orgId: 'org_byd', schoolId: 'sch_bari',
    open: catOver.open != null ? catOver.open : true, started: true,
    categorias: [cat],
  };
  db.tournaments.push(t);
  cat._tid = t.id;
  return { t, cat };
}

// Marca todos los sets de un partido para que gane `side` ('a'|'b') con `n` sets (a 11-0).
export function winMatch(m, side, n = 3) {
  m.sets = Array.from({ length: n }, () => (side === 'a' ? [11, 0] : [0, 11]));
}

// Stubbea render para aislar la lógica de las acciones (evita re-render completo del DOM).
export function stubRender() {
  app.__setRender(() => {});
}
