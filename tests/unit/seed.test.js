import { describe, it, expect, beforeEach } from 'vitest';
import { app, reset } from './harness.js';

beforeEach(reset);

describe('defaultGyms / defaultOrgs', () => {
  it('gyms con id/name/address', () => {
    const gyms = app.defaultGyms();
    expect(gyms.length).toBeGreaterThan(0);
    gyms.forEach(g => { expect(g.id).toBeTruthy(); expect(g.name).toBeTruthy(); expect(g.address).toBeTruthy(); });
  });
  it('orgs con escuelas', () => {
    const orgs = app.defaultOrgs();
    expect(orgs[0].schools.length).toBeGreaterThanOrEqual(2);
  });
});

describe('seed', () => {
  it('arma una base de ejemplo coherente', () => {
    const db = app.seed();
    expect(db.players.length).toBeGreaterThan(0);
    expect(db.tournaments.length).toBeGreaterThan(0);
    expect(db.gyms.length).toBeGreaterThan(0);
    expect(db.users.some(u => u.role === 'superadmin')).toBe(true);
    // cada jugador tiene escuela asignada por localidad
    db.players.forEach(p => expect(['sch_bari', 'sch_dina']).toContain(p.schoolId));
  });
});

describe('load / save', () => {
  it('save persiste en localStorage y load lo recupera', () => {
    const db = app.seed();
    app.save(db);
    const loaded = app.load();
    expect(loaded.players.length).toBe(db.players.length);
  });
  it('load sin datos guardados siembra una base nueva', () => {
    localStorage.clear();
    const loaded = app.load();
    expect(loaded.players.length).toBeGreaterThan(0);
  });
  it('load tolera JSON corrupto', () => {
    localStorage.setItem('ttdb.v3', '{no es json');
    const loaded = app.load();
    expect(loaded.players.length).toBeGreaterThan(0); // cae al seed
  });
});
