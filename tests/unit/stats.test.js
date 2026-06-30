import { describe, it, expect, beforeEach } from 'vitest';
import { app, reset } from './harness.js';
import { dbWithPlayers, addTournament, winMatch } from './fixtures.js';

beforeEach(reset);

// Construye una categoría jugada: 1 grupo de 3, e0 gana todo, e1 gana a e2.
function playedCat() {
  const db = dbWithPlayers([800, 600, 400]);
  const { cat } = addTournament(db, { rule: { type: 'level', level: 4 } });
  cat.groups = [['e0', 'e1', 'e2']];
  cat.matches = app.genMatches(cat.groups, 5);
  const res = (a, b, winA) => { const m = cat.matches.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a)); winMatch(m, m.a === a ? (winA ? 'a' : 'b') : (winA ? 'b' : 'a')); };
  res('e0', 'e1', true); res('e0', 'e2', true); res('e1', 'e2', true);
  app.buildBracketStructure(cat);
  return { db, cat };
}

describe('headToHead', () => {
  it('lista los enfrentamientos directos entre dos jugadores', () => {
    playedCat();
    const h2h = app.headToHead('p0', 'p1');
    expect(h2h.length).toBe(1);
    expect(h2h[0].aWon).toBe(true); // p0 le ganó a p1
    expect(h2h[0].cat).toBe('Mayores');
  });
  it('sin enfrentamientos => []', () => {
    playedCat();
    expect(app.headToHead('p0', 'zzz')).toEqual([]);
  });
});

describe('playerStats', () => {
  it('agrega victorias, derrotas, sets y rachas', () => {
    playedCat();
    const s = app.playerStats('p0');
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(0);
    expect(s.played).toBe(2);
    expect(s.winRate).toBe(1);
    expect(s.bestStreak).toBe(2);
    expect(s.tourneys).toBe(1);
  });
  it('jugador del medio: 1 victoria, 1 derrota', () => {
    playedCat();
    const s = app.playerStats('p1');
    expect(s.wins).toBe(1);
    expect(s.losses).toBe(1);
    expect(s.winRate).toBeCloseTo(0.5);
  });
  it('jugador sin partidos => stats en cero', () => {
    dbWithPlayers([100]);
    const s = app.playerStats('p0');
    expect(s).toMatchObject({ wins: 0, losses: 0, played: 0, winRate: 0, tourneys: 0 });
  });
});
