import { describe, it, expect, beforeEach } from 'vitest';
import { app, reset, login, USERS } from './harness.js';
import { dbWithPlayers, addTournament } from './fixtures.js';

beforeEach(reset);

describe('catCost / catScores', () => {
  it('catCost lee cat.cost numérico', () => {
    expect(app.catCost({ cost: 1500 })).toBe(1500);
    expect(app.catCost({})).toBe(0);
    expect(app.catCost(null)).toBe(0);
  });
  it('catScores: single de nivel puntúa; open no', () => {
    expect(app.catScores({ format: 'single', rule: { type: 'level', level: 1 } })).toBe(true);
    expect(app.catScores({ format: 'single', rule: { type: 'open' } })).toBe(false);
    expect(app.catScores(null)).toBe(false);
  });
  it('catScores: dobles depende del ajuste doublesRanking', () => {
    dbWithPlayers([100]);
    login(USERS.adminBari);
    expect(app.catScores({ format: 'double' })).toBe(false);
    app.__getDB().settings.orgs = { org_byd: { doublesRanking: true } };
    expect(app.catScores({ format: 'double' })).toBe(true);
  });
});

describe('myPaymentStatus', () => {
  it('null si no soy jugador inscripto', () => {
    const db = dbWithPlayers([100]);
    const { cat } = addTournament(db, { cost: 1000 });
    expect(app.myPaymentStatus(cat)).toBe(null); // sin sesión
  });
  it('devuelve {paid,cost} para el jugador inscripto', () => {
    const db = dbWithPlayers([100]);
    const { cat } = addTournament(db, { cost: 1000 });
    login({ ...USERS.player, playerId: 'p0' });
    expect(app.myPaymentStatus(cat)).toEqual({ paid: false, cost: 1000 });
    cat.entrants[0].paid = true;
    expect(app.myPaymentStatus(cat)).toEqual({ paid: true, cost: 1000 });
  });
  it('costo 0 => null', () => {
    const db = dbWithPlayers([100]);
    const { cat } = addTournament(db, { cost: 0 });
    login({ ...USERS.player, playerId: 'p0' });
    expect(app.myPaymentStatus(cat)).toBe(null);
  });
});

describe('onlinePayReady', () => {
  it('requiere los dos niveles, costo, cuenta y worker', () => {
    const db = dbWithPlayers([100]);
    const { t, cat } = addTournament(db, { cost: 1000 });
    db.settings.schools = { sch_bari: { paymentsEnabled: true } };
    db.settings.orgs = { org_byd: { paymentsAllowed: true } };
    db.settings.mpWorkerUrl = 'https://w';
    t.payAccountId = 'pa1';
    expect(app.onlinePayReady(t, cat)).toBe(true);
    t.payAccountId = null;
    expect(app.onlinePayReady(t, cat)).toBe(false);
  });
});

describe('mergePaymentsIntoEntrants / paidOnline / onlinePaidKeys', () => {
  beforeEach(() => {
    const db = dbWithPlayers([100, 100]);
    const { cat } = addTournament(db, { cost: 1000 });
    db.payments = [
      { tournamentId: 't0', categoryId: 'c0', entrantId: 'e0', status: 'approved' },
      { tournamentId: 't0', categoryId: 'c0', entrantId: 'e1', status: 'pending' },
    ];
  });
  it('marca como pagadas las inscripciones con pago aprobado', () => {
    app.mergePaymentsIntoEntrants();
    const cat = app.getCat('t0', 'c0');
    expect(app.entById(cat, 'e0').paid).toBe(true);
    expect(app.entById(cat, 'e1').paid).toBeUndefined();
  });
  it('paidOnline detecta pago online aprobado', () => {
    const cat = app.getCat('t0', 'c0'); cat._tid = 't0';
    expect(app.paidOnline(cat, 'e0')).toBe(true);
    expect(app.paidOnline(cat, 'e1')).toBe(false);
  });
  it('onlinePaidKeys junta solo los aprobados', () => {
    const keys = app.onlinePaidKeys();
    expect(keys.has('t0|c0|e0')).toBe(true);
    expect(keys.has('t0|c0|e1')).toBe(false);
  });
});

describe('enrollmentStatus', () => {
  it('finalizada / con grupos / override / heredada del torneo', () => {
    const db = dbWithPlayers([100]);
    const { t, cat } = addTournament(db);
    cat.closed = true;
    expect(app.enrollmentStatus(cat).open).toBe(false);
    cat.closed = false; cat.groups = [['e0']];
    expect(app.enrollmentStatus(cat).open).toBe(false);
    cat.groups = null; cat.enrollOverride = 'open';
    expect(app.enrollmentStatus(cat).open).toBe(true);
    cat.enrollOverride = 'closed';
    expect(app.enrollmentStatus(cat).open).toBe(false);
  });
});
