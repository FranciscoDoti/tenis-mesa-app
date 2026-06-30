import { describe, it, expect, beforeEach } from 'vitest';
import { app, reset } from './harness.js';
import { dbWithPlayers } from './fixtures.js';

beforeEach(reset);

describe('fullName / playerById / isActivePlayer / isGuest', () => {
  beforeEach(() => dbWithPlayers([100, 100]));
  it('fullName concatena', () => {
    expect(app.fullName({ firstName: 'Ana', lastName: 'Gómez' })).toBe('Ana Gómez');
  });
  it('playerById', () => {
    expect(app.playerById('p0').firstName).toBe('Jug0');
    expect(app.playerById('zzz')).toBeUndefined();
  });
  it('isActivePlayer excluye pendientes y borrados', () => {
    expect(app.isActivePlayer({})).toBe(true);
    expect(app.isActivePlayer({ pending: true })).toBe(false);
    expect(app.isActivePlayer({ deleted: true })).toBe(false);
    expect(app.isActivePlayer(null)).toBe(false);
  });
  it('isGuest', () => {
    expect(app.isGuest({ schoolId: app.GUEST_SCHOOL })).toBe(true);
    expect(app.isGuest({ schoolId: 'sch_bari' })).toBe(false);
  });
});

describe('levelFromPoints / syncCategory', () => {
  it('escalafón por puntos', () => {
    expect(app.levelFromPoints(900)).toBe('1ra');
    expect(app.levelFromPoints(700)).toBe('2da');
    expect(app.levelFromPoints(400)).toBe('3ra');
    expect(app.levelFromPoints(100)).toBe('4ta');
    expect(app.levelFromPoints(0)).toBe('4ta');
    expect(app.levelFromPoints()).toBe('4ta');
  });
  it('bordes exactos (estrictamente mayor)', () => {
    expect(app.levelFromPoints(800)).toBe('2da');
    expect(app.levelFromPoints(801)).toBe('1ra');
    expect(app.levelFromPoints(600)).toBe('3ra');
    expect(app.levelFromPoints(300)).toBe('4ta');
  });
  it('syncCategory fija la categoría según puntos', () => {
    const p = { points: 900 };
    expect(app.syncCategory(p).category).toBe('1ra');
  });
});

describe('usernameFor', () => {
  it('inicial del nombre + apellido, sin acentos ni espacios', () => {
    expect(app.usernameFor({ firstName: 'El', lastName: 'Peque' })).toBe('epeque');
    expect(app.usernameFor({ firstName: 'José', lastName: 'De la Cruz' })).toBe('jdelacruz');
  });
});

describe('usernameTaken', () => {
  beforeEach(() => {
    app.__setDB({
      players: [{ id: 'p0', username: 'jperez' }, { id: 'p1', username: 'agomez' }],
      users: [{ playerId: 'p2', username: 'tercero' }],
      orgs: [], tournaments: [], gyms: [], settings: {},
    });
  });
  it('detecta usernames usados (case-insensitive)', () => {
    expect(app.usernameTaken('JPEREZ')).toBe(true);
    expect(app.usernameTaken('tercero')).toBe(true);
    expect(app.usernameTaken('nuevo')).toBe(false);
  });
  it('excluye al propio jugador al editar', () => {
    expect(app.usernameTaken('jperez', 'p0')).toBe(false);
  });
});

describe('ensurePlayerUsers', () => {
  it('crea una cuenta por jugador sin cuenta y deduplica', () => {
    app.__setDB({
      players: [
        { id: 'p0', firstName: 'Juan', lastName: 'Perez' },
        { id: 'p1', firstName: 'Jose', lastName: 'Perez' }, // colisiona => jperez2
      ],
      users: [], orgs: [], tournaments: [], gyms: [], settings: {},
    });
    const added = app.ensurePlayerUsers();
    expect(added).toBe(2);
    const db = app.__getDB();
    const unames = db.users.map(u => u.username).sort();
    expect(unames).toEqual(['jperez', 'jperez2']);
    expect(db.players[0].username).toBe('jperez');
    expect(db.players[1].username).toBe('jperez2');
  });
  it('no duplica si el jugador ya tiene cuenta', () => {
    app.__setDB({
      players: [{ id: 'p0', firstName: 'Juan', lastName: 'Perez' }],
      users: [{ playerId: 'p0', username: 'jperez' }],
      orgs: [], tournaments: [], gyms: [], settings: {},
    });
    expect(app.ensurePlayerUsers()).toBe(0);
  });
});

describe('backfillUsernames', () => {
  it('completa username faltante (de su cuenta o auto)', () => {
    app.__setDB({
      players: [
        { id: 'p0', firstName: 'Juan', lastName: 'Perez' },               // auto
        { id: 'p1', firstName: 'Ana', lastName: 'Gomez', username: 'ya' }, // ya tiene
        { id: 'p2', firstName: 'Luis', lastName: 'Diaz' },                 // de su cuenta
      ],
      users: [{ playerId: 'p2', username: 'cuentaluis' }],
      orgs: [], tournaments: [], gyms: [], settings: {},
    });
    const filled = app.backfillUsernames();
    const db = app.__getDB();
    expect(db.players[0].username).toBe('jperez');
    expect(db.players[2].username).toBe('cuentaluis');
    expect(filled.length).toBe(2); // p0 y p2
  });
});
