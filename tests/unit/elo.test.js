import { describe, it, expect, beforeEach } from 'vitest';
import { app, reset } from './harness.js';
import { dbWithPlayers, addTournament, winMatch } from './fixtures.js';

beforeEach(reset);

describe('pairKey / pairName', () => {
  it('pairKey es estable sin importar el orden', () => {
    expect(app.pairKey(['b', 'a'])).toBe(app.pairKey(['a', 'b']));
    expect(app.pairKey(['a', 'b'])).toBe('a|b');
  });
  it('pairName usa los nombres de los jugadores', () => {
    const db = dbWithPlayers([100, 100]);
    expect(app.pairName({ players: ['p0', 'p1'] })).toBe('Jug0 Apellido0 / Jug1 Apellido1');
  });
});

describe('matchElo', () => {
  it('suma cero y respeta el mínimo de ±1', () => {
    const db = dbWithPlayers([1000, 1000]);
    const { cat } = addTournament(db, { rule: { type: 'level', level: 4 }, teams: [['p0'], ['p1']] });
    cat.seedRatings = { e0: 1000, e1: 1000 };
    // iguales => K*(1-0.5)=6
    expect(app.matchElo(cat, 'e0', 'e1')).toBe(6);
  });
  it('batacazo (gana el de menos puntos) otorga más', () => {
    const db = dbWithPlayers([400, 1000]);
    const { cat } = addTournament(db, { teams: [['p0'], ['p1']] });
    cat.seedRatings = { e0: 400, e1: 1000 };
    const upset = app.matchElo(cat, 'e0', 'e1'); // gana el débil
    const expected = app.matchElo(cat, 'e1', 'e0'); // gana el fuerte
    expect(upset).toBeGreaterThan(expected);
    expect(expected).toBeGreaterThanOrEqual(1);
  });
});

describe('seedRatingOf', () => {
  it('usa el snapshot si existe', () => {
    const db = dbWithPlayers([500]);
    const { cat } = addTournament(db, { teams: [['p0']] });
    cat.seedRatings = { e0: 999 };
    expect(app.seedRatingOf(cat, 'e0')).toBe(999);
  });
  it('sin snapshot, promedia los puntos actuales', () => {
    const db = dbWithPlayers([400, 600]);
    const { cat } = addTournament(db, { teams: [['p0', 'p1']] });
    expect(app.seedRatingOf(cat, 'e0')).toBe(500);
  });
  it('entrante inexistente => NEW_PLAYER_POINTS', () => {
    const db = dbWithPlayers([100]);
    const { cat } = addTournament(db);
    expect(app.seedRatingOf(cat, 'zzz')).toBe(app.NEW_PLAYER_POINTS);
  });
});

describe('snapshotSeed', () => {
  it('solo congela en categorías que puntúan', () => {
    const db = dbWithPlayers([300, 400]);
    const { cat } = addTournament(db, { rule: { type: 'open' }, teams: [['p0'], ['p1']] });
    app.snapshotSeed(cat);
    expect(cat.seedRatings).toBeUndefined(); // open no puntúa
  });
  it('congela los ratings de los entrantes en categorías de nivel', () => {
    const db = dbWithPlayers([300, 500]);
    const { cat } = addTournament(db, { rule: { type: 'level', level: 4 }, teams: [['p0'], ['p1']] });
    app.snapshotSeed(cat);
    expect(cat.seedRatings.e0).toBe(300);
    expect(cat.seedRatings.e1).toBe(500);
  });
});

describe('entHasGuest / matchEloOf', () => {
  it('partido contra invitado no suma puntos', () => {
    const db = dbWithPlayers([500, 500], { playerOverride: i => (i === 1 ? { schoolId: app.GUEST_SCHOOL } : {}) });
    const { cat } = addTournament(db, { rule: { type: 'level', level: 4 }, teams: [['p0'], ['p1']] });
    cat.seedRatings = { e0: 500, e1: 500 };
    expect(app.entHasGuest(cat, 'e1')).toBe(true);
    const m = {}; winMatch(m, 'a');
    expect(app.matchEloOf(cat, m, 'e0', 'e1')).toBe(null);
  });
  it('matchEloOf devuelve ganador/perdedor/n en partido válido', () => {
    const db = dbWithPlayers([500, 500]);
    const { cat } = addTournament(db, { rule: { type: 'level', level: 4 }, teams: [['p0'], ['p1']] });
    cat.seedRatings = { e0: 500, e1: 500 };
    const m = { bestOf: 3 }; winMatch(m, 'a', 2);
    const e = app.matchEloOf(cat, m, 'e0', 'e1');
    expect(e).toMatchObject({ winId: 'e0', loseId: 'e1' });
    expect(e.n).toBeGreaterThanOrEqual(1);
  });
  it('categoría que no puntúa => null', () => {
    const db = dbWithPlayers([500, 500]);
    const { cat } = addTournament(db, { rule: { type: 'open' }, teams: [['p0'], ['p1']] });
    const m = {}; winMatch(m, 'a');
    expect(app.matchEloOf(cat, m, 'e0', 'e1')).toBe(null);
  });
  it('BYE o partido sin ganador => null', () => {
    const db = dbWithPlayers([500, 500]);
    const { cat } = addTournament(db, { rule: { type: 'level', level: 4 }, teams: [['p0'], ['p1']] });
    cat.seedRatings = { e0: 500, e1: 500 };
    expect(app.matchEloOf(cat, {}, 'e0', 'BYE')).toBe(null);
    expect(app.matchEloOf(cat, { sets: [] }, 'e0', 'e1')).toBe(null);
  });
});

describe('eloLabel', () => {
  it('devuelve markup con +N/−N para partidos válidos', () => {
    const db = dbWithPlayers([500, 500]);
    const { cat } = addTournament(db, { rule: { type: 'level', level: 4 }, teams: [['p0'], ['p1']] });
    cat.seedRatings = { e0: 500, e1: 500 };
    const m = { bestOf: 3 }; winMatch(m, 'a', 2);
    const label = app.eloLabel(cat, m, 'e0', 'e1');
    expect(label).toContain('elo-up');
    expect(label).toContain('elo-down');
  });
  it('partido inválido => string vacío', () => {
    const db = dbWithPlayers([500, 500]);
    const { cat } = addTournament(db, { rule: { type: 'open' }, teams: [['p0'], ['p1']] });
    expect(app.eloLabel(cat, {}, 'e0', 'e1')).toBe('');
  });
});

describe('pairRecord', () => {
  it('crea el registro de la pareja con puntos promedio', () => {
    const db = dbWithPlayers([400, 600]);
    const { cat } = addTournament(db, { format: 'double', teams: [['p0', 'p1']] });
    const pr = app.pairRecord(['p0', 'p1'], 'Dobles A', true);
    expect(pr.points).toBe(500);
    expect(pr.players.sort()).toEqual(['p0', 'p1']);
    // idempotente: misma pareja+categoría devuelve el mismo registro
    expect(app.pairRecord(['p1', 'p0'], 'Dobles A')).toBe(pr);
  });
  it('sin create y sin registro => undefined', () => {
    const db = dbWithPlayers([400, 600]);
    addTournament(db, { format: 'double', teams: [['p0', 'p1']] });
    expect(app.pairRecord(['p0', 'p1'], 'Otra')).toBeFalsy();
  });
});
