import { describe, it, expect, beforeEach } from 'vitest';
import { app, reset } from './harness.js';
import { dbWithPlayers, addTournament, winMatch } from './fixtures.js';

beforeEach(reset);

describe('nextPow2', () => {
  it('redondea hacia arriba a potencia de 2', () => {
    expect(app.nextPow2(1)).toBe(1);
    expect(app.nextPow2(2)).toBe(2);
    expect(app.nextPow2(3)).toBe(4);
    expect(app.nextPow2(5)).toBe(8);
    expect(app.nextPow2(8)).toBe(8);
    expect(app.nextPow2(9)).toBe(16);
  });
});

describe('seedOrder', () => {
  it('size 2', () => { expect(app.seedOrder(2)).toEqual([1, 2]); });
  it('size 4: 1 y 2 en mitades opuestas', () => { expect(app.seedOrder(4)).toEqual([1, 4, 2, 3]); });
  it('size 8', () => { expect(app.seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]); });
});

describe('isQ / qLabel / isRealEnt', () => {
  it('isQ reconoce los marcadores Q:gi:pos', () => {
    expect(app.isQ('Q:0:0')).toBe(true);
    expect(app.isQ('e0')).toBe(false);
    expect(app.isQ(null)).toBe(false);
  });
  it('qLabel describe la posición', () => {
    expect(app.qLabel('Q:0:0')).toBe('1ro Grupo A');
    expect(app.qLabel('Q:1:1')).toBe('2do Grupo B');
  });
  it('isRealEnt distingue entrantes reales de BYE/Q', () => {
    const db = dbWithPlayers([100, 100]);
    const { cat } = addTournament(db);
    expect(app.isRealEnt(cat, 'e0')).toBe(true);
    expect(app.isRealEnt(cat, 'BYE')).toBe(false);
    expect(app.isRealEnt(cat, 'Q:0:0')).toBe(false);
  });
});

describe('seededQualSlots', () => {
  it('2 grupos => 4 slots, 1ros y 2dos cruzados a mitades opuestas', () => {
    const slots = app.seededQualSlots(2);
    expect(slots).toHaveLength(4);
    // top: 1ro A + 2do B ; bottom: 1ro B + 2do A
    expect(slots).toContain('Q:0:0');
    expect(slots).toContain('Q:1:1');
    expect(slots).toContain('Q:1:0');
    expect(slots).toContain('Q:0:1');
  });
  it('3 grupos => rellena con BYE hasta potencia de 2', () => {
    const slots = app.seededQualSlots(3); // 2*3=6 -> nextPow2=8
    expect(slots).toHaveLength(8);
    expect(slots.filter(s => s === 'BYE').length).toBe(2);
  });
});

// --- Llave completa de 2 grupos de 3 (4 clasificados) ---
function build2groups() {
  const db = dbWithPlayers([800, 700, 600, 500, 400, 300]);
  const { cat } = addTournament(db, { rule: { type: 'level', level: 4 } });
  cat.groups = [['e0', 'e1', 'e2'], ['e3', 'e4', 'e5']];
  cat.matches = app.genMatches(cat.groups, 5);
  // Resultados de grupo: en cada grupo gana el de menor índice, 2do el del medio.
  const res = (a, b, winA) => { const m = cat.matches.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a)); winMatch(m, m.a === a ? (winA ? 'a' : 'b') : (winA ? 'b' : 'a')); };
  res('e0', 'e1', true); res('e0', 'e2', true); res('e1', 'e2', true); // grupo0: e0>e1>e2
  res('e3', 'e4', true); res('e3', 'e5', true); res('e4', 'e5', true); // grupo1: e3>e4>e5
  app.buildBracketStructure(cat);
  return { db, cat };
}

describe('buildBracketStructure / resolveBracketSlots', () => {
  it('arma la llave y resuelve los clasificados de grupos terminados', () => {
    const { cat } = build2groups();
    expect(cat.bracket).toBeTruthy();
    expect(cat.bracket[0]).toHaveLength(2); // 4 slots => 2 partidos de primera ronda
    // Como ambos grupos terminaron, las hojas Q:* se resolvieron a ids reales.
    const leaves = cat.bracket[0].flatMap(m => [m.a, m.b]);
    expect(leaves).toContain('e0'); // 1ro grupo A
    expect(leaves).toContain('e3'); // 1ro grupo B
    expect(leaves.some(app.isQ)).toBe(false);
    expect(cat.thirdPlace).toBeTruthy();
  });

  it('sin grupos => no arma nada', () => {
    const db = dbWithPlayers([100]);
    const { cat } = addTournament(db);
    cat.groups = null;
    expect(app.buildBracketStructure(cat)).toBe(false);
  });
});

describe('brWinner / brContender / semiLoser / placements', () => {
  it('propaga ganadores, BYE y resuelve campeón/podio', () => {
    const { cat } = build2groups();
    // Semifinales (ronda 0): e0 vs (2do del otro grupo), e3 vs (2do)... jugamos para que ganen e0 y e3.
    cat.bracket[0].forEach(m => {
      // gana el de mayor ranking (menor índice de id) si es real
      const a = m.a, b = m.b;
      const rank = id => Number(String(id).slice(1));
      winMatch(m, rank(a) <= rank(b) ? 'a' : 'b');
    });
    // Final (ronda 1)
    const finalR = cat.bracket.length - 1;
    const fa = app.brContender(cat, finalR, 0, 'a'), fb = app.brContender(cat, finalR, 0, 'b');
    expect(app.isRealEnt(cat, fa) && app.isRealEnt(cat, fb)).toBe(true);
    winMatch(cat.bracket[finalR][0], 'a'); // gana el contender 'a' de la final
    const champ = app.brWinner(cat, finalR, 0);
    expect(champ).toBe(fa);
    // 3er puesto
    const sa = app.semiLoser(cat, 0), sb = app.semiLoser(cat, 1);
    expect(app.isRealEnt(cat, sa)).toBe(true);
    expect(app.isRealEnt(cat, sb)).toBe(true);
    winMatch(cat.thirdPlace, 'a');
    const place = app.placements(cat);
    expect(place[champ]).toBe(1);
    expect(place[fb]).toBe(2);
    // tercero y cuarto asignados
    const thirds = Object.entries(place).filter(([, v]) => v === 3);
    expect(thirds).toHaveLength(1);
  });

  it('BYE: el contrincante pasa sin jugar', () => {
    const db = dbWithPlayers([800, 700, 600]); // 1 grupo de 3 => 2 clasifican => llave 2 con posibles BYE
    const { cat } = addTournament(db, { rule: { type: 'level', level: 4 } });
    cat.groups = [['e0', 'e1', 'e2']];
    cat.matches = app.genMatches(cat.groups, 5);
    cat.matches.forEach(m => winMatch(m, 'a'));
    app.buildBracketStructure(cat);
    // bracket[0] tiene la final entre 1ro y 2do del único grupo (sin BYE porque 2 clasificados = pow2)
    const champR = cat.bracket.length - 1;
    winMatch(cat.bracket[champR][0], 'a');
    expect(app.brWinner(cat, champR, 0)).toBeTruthy();
  });

  it('placements vacío si no hay bracket', () => {
    const db = dbWithPlayers([100]);
    const { cat } = addTournament(db);
    expect(app.placements(cat)).toEqual({});
  });
});

describe('syncBracket', () => {
  it('crea la llave si falta y resuelve hojas listas', () => {
    const { cat } = build2groups();
    cat.bracket = null;
    app.syncBracket(cat);
    expect(cat.bracket).toBeTruthy();
  });
  it('sin grupos no hace nada', () => {
    const db = dbWithPlayers([100]);
    const { cat } = addTournament(db);
    cat.groups = null;
    app.syncBracket(cat);
    expect(cat.bracket).toBeFalsy();
  });
});
