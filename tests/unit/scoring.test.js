import { describe, it, expect, beforeEach } from 'vitest';
import { app, reset } from './harness.js';

beforeEach(reset);

describe('setWinner (regla a 11, diferencia de 2)', () => {
  it('empate => null', () => {
    expect(app.setWinner([5, 5])).toBe(null);
    expect(app.setWinner([11, 11])).toBe(null);
  });
  it('antes de 11 nadie gana', () => {
    expect(app.setWinner([10, 8])).toBe(null);
    expect(app.setWinner([9, 0])).toBe(null);
  });
  it('11 a 9 o menos: gana', () => {
    expect(app.setWinner([11, 0])).toBe('a');
    expect(app.setWinner([11, 9])).toBe('a');
    expect(app.setWinner([9, 11])).toBe('b');
  });
  it('11 a 10 no alcanza (hay que sacar 2)', () => {
    expect(app.setWinner([11, 10])).toBe(null);
    expect(app.setWinner([10, 11])).toBe(null);
  });
  it('pasado el 11 hay que ganar por exactamente 2', () => {
    expect(app.setWinner([13, 11])).toBe('a');
    expect(app.setWinner([11, 13])).toBe('b');
    expect(app.setWinner([14, 11])).toBe(null); // diferencia de 3
    expect(app.setWinner([15, 13])).toBe('a');
  });
});

describe('matchResult', () => {
  it('cuenta sets ganados por cada lado', () => {
    const m = { sets: [[11, 5], [8, 11], [11, 9]] };
    expect(app.matchResult(m)).toEqual({ wa: 2, wb: 1 });
  });
  it('ignora sets no decididos', () => {
    const m = { sets: [[11, 5], [5, 5], [3, 0]] };
    expect(app.matchResult(m)).toEqual({ wa: 1, wb: 0 });
  });
  it('match vacío o sin sets => 0-0', () => {
    expect(app.matchResult({})).toEqual({ wa: 0, wb: 0 });
    expect(app.matchResult(null)).toEqual({ wa: 0, wb: 0 });
  });
});

describe('bestOfOf', () => {
  it('usa m.bestOf si está', () => {
    expect(app.bestOfOf({ bestOf: 7 }, { rules: { sets: 3 } })).toBe(7);
  });
  it('cae a rules.sets de la categoría', () => {
    expect(app.bestOfOf({}, { rules: { sets: 3 } })).toBe(3);
  });
  it('default 5', () => {
    expect(app.bestOfOf({}, {})).toBe(5);
    expect(app.bestOfOf(null, null)).toBe(5);
  });
});

describe('matchWinnerSide / matchDone', () => {
  it('a 5 sets gana quien llega a 3', () => {
    const cat = { rules: { sets: 5 } };
    const m = { sets: [[11, 0], [11, 0], [11, 0]] };
    expect(app.matchWinnerSide(m, cat)).toBe('a');
    expect(app.matchDone(m, cat)).toBe(true);
  });
  it('a 3 sets gana quien llega a 2', () => {
    const m = { bestOf: 3, sets: [[5, 11], [9, 11]] };
    expect(app.matchWinnerSide(m, {})).toBe('b');
  });
  it('sin ganador definido => null / no done', () => {
    const m = { bestOf: 5, sets: [[11, 0], [0, 11]] };
    expect(app.matchWinnerSide(m, {})).toBe(null);
    expect(app.matchDone(m, {})).toBe(false);
  });
});
