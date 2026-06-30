import { describe, it, expect, beforeEach } from 'vitest';
import { app, reset, login, USERS } from './harness.js';
import { dbWithPlayers, addTournament } from './fixtures.js';

beforeEach(reset);

describe('currentUser / setUser (modo local)', () => {
  it('sin login => null', () => {
    expect(app.currentUser()).toBe(null);
  });
  it('setUser persiste y currentUser lo lee', () => {
    app.setUser(USERS.adminBari);
    expect(app.currentUser()).toMatchObject({ username: 'adminBari', role: 'admin' });
    app.setUser(null);
    expect(app.currentUser()).toBe(null);
  });
});

describe('isAdmin / isSuperadmin / isSchoolAdmin', () => {
  it('player', () => {
    login(USERS.player);
    expect(app.isAdmin()).toBe(false);
    expect(app.isSuperadmin()).toBe(false);
    expect(app.isSchoolAdmin()).toBe(false);
  });
  it('admin de escuela', () => {
    login(USERS.adminBari);
    expect(app.isAdmin()).toBe(true);
    expect(app.isSchoolAdmin()).toBe(true);
    expect(app.isSuperadmin()).toBe(false);
  });
  it('superadmin', () => {
    login(USERS.superadmin);
    expect(app.isAdmin()).toBe(true);
    expect(app.isSuperadmin()).toBe(true);
  });
});

describe('canManagePlayer', () => {
  beforeEach(() => dbWithPlayers([100, 100]));
  it('sin sesión => false', () => {
    expect(app.canManagePlayer(app.playerById('p0'))).toBe(false);
  });
  it('superadmin gestiona cualquiera', () => {
    login(USERS.superadmin);
    expect(app.canManagePlayer(app.playerById('p0'))).toBe(true);
  });
  it('admin gestiona solo su escuela', () => {
    login(USERS.adminBari); // sch_bari
    expect(app.canManagePlayer(app.playerById('p0'))).toBe(true);
    const db = app.__getDB();
    db.players[0].schoolId = 'sch_dina';
    expect(app.canManagePlayer(db.players[0])).toBe(false);
  });
  it('invitado de la org lo gestiona cualquier admin de la org', () => {
    login(USERS.adminBari);
    const db = app.__getDB();
    db.players[0].schoolId = app.GUEST_SCHOOL;
    expect(app.canManagePlayer(db.players[0])).toBe(true);
  });
});

describe('canManageGym', () => {
  beforeEach(() => dbWithPlayers([100]));
  it('admin gestiona gym de su escuela; gym sin org => libre', () => {
    login(USERS.adminBari);
    expect(app.canManageGym({ orgId: 'org_byd', schoolId: 'sch_bari' })).toBe(true);
    expect(app.canManageGym({ orgId: 'org_byd', schoolId: 'sch_dina' })).toBe(false);
    expect(app.canManageGym({})).toBe(true); // sin org asignada
  });
  it('superadmin todo, sin sesión nada', () => {
    expect(app.canManageGym({ orgId: 'x' })).toBe(false);
    login(USERS.superadmin);
    expect(app.canManageGym({ orgId: 'x', schoolId: 'y' })).toBe(true);
  });
});

describe('ownsTournament / canAwardPoints', () => {
  it('admin de la escuela del torneo (legado sin dueño) puede otorgar', () => {
    const db = dbWithPlayers([100]);
    const { t } = addTournament(db);
    login(USERS.adminBari);
    expect(app.ownsTournament(t)).toBe(true);
    expect(app.canAwardPoints(t)).toBe(true);
  });
  it('admin de otra escuela no', () => {
    const db = dbWithPlayers([100]);
    const { t } = addTournament(db);
    login(USERS.adminDina);
    expect(app.canAwardPoints(t)).toBe(false);
  });
  it('torneo con dueño explícito: solo el dueño', () => {
    const db = dbWithPlayers([100]);
    const { t } = addTournament(db);
    t.ownerUsername = 'adminBari';
    login(USERS.adminBari);
    expect(app.ownsTournament(t)).toBe(true);
    login(USERS.adminDina);
    expect(app.ownsTournament(t)).toBe(false);
  });
  it('superadmin siempre puede otorgar', () => {
    const db = dbWithPlayers([100]);
    const { t } = addTournament(db);
    login(USERS.superadmin);
    expect(app.canAwardPoints(t)).toBe(true);
  });
});

describe('inTournamentScope / tournamentPool', () => {
  it('torneo abierto admite a toda la org', () => {
    const db = dbWithPlayers([100, 100]);
    const { t } = addTournament(db, { open: true });
    expect(app.inTournamentScope(t, app.playerById('p0'))).toBe(true);
    expect(app.tournamentPool(t).length).toBe(2);
  });
  it('torneo cerrado: solo la escuela dueña', () => {
    const db = dbWithPlayers([100, 100]);
    db.players[1].schoolId = 'sch_dina';
    const { t } = addTournament(db, { open: false });
    expect(app.inTournamentScope(t, app.playerById('p0'))).toBe(true);
    expect(app.inTournamentScope(t, app.playerById('p1'))).toBe(false);
    expect(app.tournamentPool(t).length).toBe(1);
  });
});

describe('ctxOrgId / ctxSchoolId / paymentsScope', () => {
  it('admin usa su org/escuela', () => {
    dbWithPlayers([100]);
    login(USERS.adminBari);
    expect(app.ctxOrgId()).toBe('org_byd');
    expect(app.ctxSchoolId()).toBe('sch_bari');
    expect(app.paymentsScope()).toEqual({ role: 'admin', schoolId: 'sch_bari' });
  });
  it('jugador => scope por playerId', () => {
    dbWithPlayers([100]);
    login({ ...USERS.player, playerId: 'p0' });
    expect(app.paymentsScope()).toEqual({ role: 'player', playerId: 'p0' });
  });
  it('superadmin => scope superadmin', () => {
    dbWithPlayers([100]);
    login(USERS.superadmin);
    expect(app.paymentsScope()).toEqual({ role: 'superadmin' });
  });
  it('sin sesión => null', () => {
    expect(app.paymentsScope()).toBe(null);
    expect(app.ctxOrgId()).toBe(null);
  });
});

describe('scopedPending', () => {
  it('lista los pendientes de la escuela del admin', () => {
    const db = dbWithPlayers([100, 100, 100]);
    db.players[0].pending = true;
    db.players[1].pending = true; db.players[1].schoolId = 'sch_dina';
    login(USERS.adminBari);
    const pend = app.scopedPending();
    expect(pend.map(p => p.id)).toEqual(['p0']);
  });
});
