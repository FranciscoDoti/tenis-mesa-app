import { describe, it, expect, beforeEach } from 'vitest';
import { app, reset, login, USERS } from './harness.js';
import { dbWithPlayers, addTournament, winMatch, stubRender } from './fixtures.js';

beforeEach(() => { reset(); login(USERS.adminBari); stubRender(); });

// Corre una categoría completa de nivel con 1 grupo de 4 (todos clasifican a una llave de 4) y la deja
// lista para cerrar: e0 campeón, e1 finalista, e2 3°, e3 4°.
function runFullCategory(over = {}) {
  // 6 jugadores => 2 grupos de 3 => 4 clasificados => semis + final + 3er puesto (podio completo).
  const db = dbWithPlayers([800, 700, 600, 500, 400, 300]);
  const { t, cat } = addTournament(db, { rule: { type: 'level', level: 4 }, championPoints: 20, ...over });
  app.makeGroups(t.id, cat.id);
  // Resolver grupos: gana siempre el de menor índice de id.
  const rank = id => Number(String(id).slice(1));
  cat.matches.forEach(m => winMatch(m, rank(m.a) <= rank(m.b) ? 'a' : 'b'));
  app.syncBracket(cat);
  // Resolver llave: gana el de mayor ranking (menor índice).
  cat.bracket.forEach((round, r) => round.forEach((m, mi) => {
    const a = app.brContender(cat, r, mi, 'a'), b = app.brContender(cat, r, mi, 'b');
    if (app.isRealEnt(cat, a) && app.isRealEnt(cat, b)) winMatch(m, rank(a) <= rank(b) ? 'a' : 'b');
  }));
  // 3er puesto
  if (cat.thirdPlace) {
    const sa = app.semiLoser(cat, 0), sb = app.semiLoser(cat, 1);
    if (app.isRealEnt(cat, sa) && app.isRealEnt(cat, sb)) winMatch(cat.thirdPlace, rank(sa) <= rank(sb) ? 'a' : 'b');
  }
  return { db, t, cat };
}

describe('awardPoints', () => {
  it('no cierra si la final no tiene ganador', () => {
    const db = dbWithPlayers([800, 600, 400, 200]);
    const { t, cat } = addTournament(db, { rule: { type: 'level', level: 4 } });
    app.makeGroups(t.id, cat.id);
    app.awardPoints(t.id, cat.id);
    expect(cat.closed).toBeFalsy();
    expect(globalThis.alert).toHaveBeenCalled();
  });

  it('cierra la categoría y reparte puntos de podio + Elo', () => {
    const { t, cat, db } = runFullCategory();
    const before = db.players.map(p => p.points);
    app.awardPoints(t.id, cat.id);
    expect(cat.closed).toBe(true);
    expect(cat.awarded).toBeTruthy();
    // el campeón (p0) sumó puntos
    const after = db.players.map(p => p.points);
    expect(after[0]).toBeGreaterThan(before[0]);
    // suma neta de Elo entre jugadores es cero (los puntos de podio la rompen, pero el Elo solo se compensa)
    expect(app.placements(cat)[cat.entrants[0].id]).toBe(1);
  });

  it('respeta el confirm del usuario (si cancela, no cierra)', () => {
    const { t, cat } = runFullCategory();
    globalThis.confirm.mockReturnValue(false);
    app.awardPoints(t.id, cat.id);
    expect(cat.closed).toBeFalsy();
  });

  it('una categoría ya cerrada no se vuelve a otorgar', () => {
    const { t, cat } = runFullCategory();
    app.awardPoints(t.id, cat.id);
    const pts = app.__getDB().players.map(p => p.points);
    app.awardPoints(t.id, cat.id); // segundo intento
    expect(app.__getDB().players.map(p => p.points)).toEqual(pts);
  });

  it('admin de otra escuela no puede otorgar', () => {
    const { t, cat } = runFullCategory();
    login(USERS.adminDina);
    app.awardPoints(t.id, cat.id);
    expect(cat.closed).toBeFalsy();
  });

  it('categoría open (no puntúa) cierra sin tocar puntos', () => {
    const { t, cat, db } = runFullCategory({ rule: { type: 'open' } });
    const before = db.players.map(p => p.points);
    app.awardPoints(t.id, cat.id);
    expect(cat.closed).toBe(true);
    expect(db.players.map(p => p.points)).toEqual(before);
  });

  it('torneo abierto: el campeón suma openPoints (ranking de escuelas)', () => {
    const { t, cat, db } = runFullCategory({ open: true });
    app.awardPoints(t.id, cat.id);
    expect(db.players[0].openPoints).toBeGreaterThan(0);
  });

  it('jugador invitado no suma a ningún ranking', () => {
    const db = dbWithPlayers([800, 600, 400, 200], { playerOverride: i => (i === 0 ? { schoolId: app.GUEST_SCHOOL } : {}) });
    const { t, cat } = addTournament(db, { rule: { type: 'level', level: 4 } });
    app.makeGroups(t.id, cat.id);
    const rank = id => Number(String(id).slice(1));
    cat.matches.forEach(m => winMatch(m, rank(m.a) <= rank(m.b) ? 'a' : 'b'));
    app.syncBracket(cat);
    cat.bracket.forEach((round, r) => round.forEach((m, mi) => {
      const a = app.brContender(cat, r, mi, 'a'), b = app.brContender(cat, r, mi, 'b');
      if (app.isRealEnt(cat, a) && app.isRealEnt(cat, b)) winMatch(m, rank(a) <= rank(b) ? 'a' : 'b');
    }));
    if (cat.thirdPlace) { const sa = app.semiLoser(cat, 0), sb = app.semiLoser(cat, 1); if (app.isRealEnt(cat, sa) && app.isRealEnt(cat, sb)) winMatch(cat.thirdPlace, 'a'); }
    app.awardPoints(t.id, cat.id);
    expect(cat.awarded.e0).toBeUndefined(); // el invitado no recibe puntos
    expect(db.players[0].points).toBe(800); // sin cambios
  });
});

describe('placements en categoría completa', () => {
  it('asigna 1°,2°,3°,4°', () => {
    const { cat } = runFullCategory();
    const place = app.placements(cat);
    const divs = Object.values(place).sort();
    expect(divs).toContain(1);
    expect(divs).toContain(2);
    expect(divs).toContain(3);
  });
});
