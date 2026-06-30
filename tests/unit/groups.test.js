import { describe, it, expect, beforeEach, vi } from 'vitest';
import { app, reset, login, USERS } from './harness.js';
import { dbWithPlayers, addTournament, winMatch, stubRender } from './fixtures.js';

beforeEach(() => { reset(); });

describe('genMatches', () => {
  it('genera el round-robin de cada grupo', () => {
    const groups = [['a', 'b', 'c'], ['d', 'e']];
    const m = app.genMatches(groups, 5);
    // grupo0: 3 jugadores => 3 partidos; grupo1: 2 => 1. total 4
    expect(m).toHaveLength(4);
    expect(m.every(x => x.bestOf === 5)).toBe(true);
    expect(m.filter(x => x.g === 0)).toHaveLength(3);
    expect(m.filter(x => x.g === 1)).toHaveLength(1);
  });
});

describe('buildGroups', () => {
  it('error si faltan jugadores para el mínimo', () => {
    const r = app.buildGroups(['a', 'b'], 3, 4, null);
    expect(r.ok).toBe(false);
    expect(r.msg).toContain('al menos 3');
  });

  it('arma grupos válidos dentro de [min,max] y no pierde a nadie', () => {
    const ids = Array.from({ length: 8 }, (_, i) => 'p' + i);
    const r = app.buildGroups(ids, 3, 4, null);
    expect(r.ok).toBe(true);
    const flat = r.groups.flat();
    expect(flat.sort()).toEqual(ids.slice().sort());
    r.groups.forEach(g => { expect(g.length).toBeGreaterThanOrEqual(3); expect(g.length).toBeLessThanOrEqual(4); });
  });

  it('siembra: los dos mejores caen en grupos distintos (serpentina)', () => {
    // 8 jugadores, puntos descendentes claros => sin azar de empate los 2 cabezas van separados.
    const ids = Array.from({ length: 8 }, (_, i) => 'p' + i);
    const seed = id => 100 - Number(id.slice(1)); // p0=100 mejor ... p7=93
    const r = app.buildGroups(ids, 4, 4, seed); // fuerza 2 grupos de 4
    expect(r.ok).toBe(true);
    expect(r.groups).toHaveLength(2);
    const g0 = r.groups[0], g1 = r.groups[1];
    const inSame = (a, b) => (g0.includes(a) && g0.includes(b)) || (g1.includes(a) && g1.includes(b));
    expect(inSame('p0', 'p1')).toBe(false); // los 2 mejores en grupos distintos
  });

  it('no hay combinación válida => error', () => {
    // 5 jugadores con grupos exactos de 4 no se puede (5 no es múltiplo válido en [4,4]).
    const r = app.buildGroups(['a', 'b', 'c', 'd', 'e'], 4, 4, null);
    expect(r.ok).toBe(false);
  });
});

describe('entSeedPoints', () => {
  it('promedia los puntos de los jugadores del entrante', () => {
    const db = dbWithPlayers([100, 300]);
    const { cat } = addTournament(db, { teams: [['p0', 'p1']] });
    expect(app.entSeedPoints(cat, 'e0')).toBe(200);
  });
  it('entrante inexistente => 0', () => {
    const db = dbWithPlayers([100]);
    const { cat } = addTournament(db);
    expect(app.entSeedPoints(cat, 'noexiste')).toBe(0);
  });
});

describe('groupStandings', () => {
  it('ordena por partidos ganados, luego diferencia de sets, luego de puntos', () => {
    const db = dbWithPlayers([100, 100, 100]);
    const { cat } = addTournament(db);
    cat.groups = [['e0', 'e1', 'e2']];
    cat.matches = app.genMatches(cat.groups, 5);
    // e0 vence a e1 y e2; e1 vence a e2 => orden e0, e1, e2
    const find = (a, b) => cat.matches.find(m => (m.a === a && m.b === b) || (m.a === b && m.b === a));
    const setWin = (a, b, winA) => { const m = find(a, b); winMatch(m, m.a === a ? (winA ? 'a' : 'b') : (winA ? 'b' : 'a')); };
    setWin('e0', 'e1', true);
    setWin('e0', 'e2', true);
    setWin('e1', 'e2', true);
    const st = app.groupStandings(cat, 0);
    expect(st.map(s => s.id)).toEqual(['e0', 'e1', 'e2']);
    expect(st[0].pg).toBe(2);
  });

  it('partidos sin terminar no cuentan', () => {
    const db = dbWithPlayers([100, 100, 100]);
    const { cat } = addTournament(db);
    cat.groups = [['e0', 'e1', 'e2']];
    cat.matches = app.genMatches(cat.groups, 5);
    const st = app.groupStandings(cat, 0);
    expect(st.every(s => s.pg === 0)).toBe(true);
  });
});

describe('groupComplete / groupStageComplete', () => {
  it('detecta grupo y fase completos', () => {
    const db = dbWithPlayers([100, 100, 100]);
    const { cat } = addTournament(db);
    cat.groups = [['e0', 'e1', 'e2']];
    cat.matches = app.genMatches(cat.groups, 5);
    expect(app.groupComplete(cat, 0)).toBe(false);
    expect(app.groupStageComplete(cat)).toBe(false);
    cat.matches.forEach(m => winMatch(m, 'a'));
    expect(app.groupComplete(cat, 0)).toBe(true);
    expect(app.groupStageComplete(cat)).toBe(true);
  });
});

describe('makeGroups (acción)', () => {
  beforeEach(() => { login(USERS.adminBari); stubRender(); });

  it('arma grupos, partidos y estructura de llave', () => {
    const db = dbWithPlayers(Array.from({ length: 8 }, (_, i) => 800 - i * 50));
    // categoría con regla de nivel => puntúa => snapshotSeed congela los ratings
    const { t, cat } = addTournament(db, { rule: { type: 'level', level: 4 } });
    app.makeGroups(t.id, cat.id);
    expect(cat.groups).toBeTruthy();
    expect(cat.matches.length).toBeGreaterThan(0);
    expect(cat.bracket).toBeTruthy();
    expect(cat.seedRatings).toBeTruthy(); // snapshot del Elo
  });

  it('avisa si no se pueden armar grupos', () => {
    const db = dbWithPlayers([100, 100]); // 2 < groupMin
    const { t, cat } = addTournament(db);
    app.makeGroups(t.id, cat.id);
    expect(globalThis.alert).toHaveBeenCalled();
    expect(cat.groups).toBe(null);
  });

  it('si ya empezó y el usuario cancela el confirm, no re-sortea', () => {
    const db = dbWithPlayers(Array.from({ length: 6 }, () => 300));
    const { t, cat } = addTournament(db);
    app.makeGroups(t.id, cat.id);
    const before = cat.groups;
    cat.matches[0].sets = [[11, 0], [11, 0], [11, 0]]; // ya hay un resultado => "empezó"
    globalThis.confirm.mockReturnValue(false);
    app.makeGroups(t.id, cat.id);
    expect(cat.groups).toBe(before); // sin cambios
  });
});
