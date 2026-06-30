import { describe, it, expect, beforeEach } from 'vitest';
import { app, reset, login, USERS } from './harness.js';
import { seedDB } from './harness.js';

beforeEach(reset);

const appHtml = () => document.getElementById('app').innerHTML;

describe('render — pantalla de login (sin sesión)', () => {
  it('muestra el login', () => {
    seedDB();
    app.__setSession(null);
    app.render();
    expect(appHtml()).toMatch(/Ingresar|Entrar|usuario|Usuario|contraseña/i);
  });
});

describe('render — vistas de admin de escuela', () => {
  let db;
  beforeEach(() => { db = seedDB(); login(USERS.adminBari); });

  const VIEWS = [
    'ranking', 'orgrank', 'schools', 'dobles', 'historial',
    'jugadores', 'aprobaciones', 'gimnasios', 'categorias',
    'reportes', 'cuentas', 'pagos', 'noticias', 'reglamento',
    'apariencia', 'settings', 'torneos',
  ];

  for (const v of VIEWS) {
    it(`renderiza "${v}" sin romper`, () => {
      app.__setView(v);
      expect(() => app.render()).not.toThrow();
      expect(appHtml().length).toBeGreaterThan(0);
    });
  }

  it('renderiza el detalle de un torneo', () => {
    const t = db.tournaments[0];
    app.__setView('torneo:' + t.id);
    expect(() => app.render()).not.toThrow();
    expect(appHtml()).toContain(t.name);
  });

  it('renderiza el detalle de una categoría', () => {
    const t = db.tournaments[0], c = t.categorias[0];
    app.__setView(`cat:${t.id}:${c.id}`);
    expect(() => app.render()).not.toThrow();
    expect(appHtml().length).toBeGreaterThan(0);
  });
});

describe('render — jugador', () => {
  it('ranking y perfil del jugador', () => {
    const db = seedDB();
    const p = db.players[0];
    login({ ...USERS.player, playerId: p.id });
    app.__setView('ranking');
    expect(() => app.render()).not.toThrow();
    app.__setView('perfil');
    expect(() => app.render()).not.toThrow();
    app.__setView('perfil:' + p.id);
    expect(() => app.render()).not.toThrow();
  });
});

describe('render — superadmin', () => {
  it('siempre cae en ajustes', () => {
    seedDB();
    login(USERS.superadmin);
    app.__setSession({ ...USERS.superadmin, uid: 'x' });
    app.__setView('ranking');
    app.render();
    // el superadmin es figura de solo-ajustes => fuerza view=settings
    expect(app.__getView()).toBe('settings');
  });
});

describe('go (navegación)', () => {
  it('cambia la vista y re-renderiza', () => {
    seedDB();
    login(USERS.adminBari);
    app.go('gimnasios');
    expect(app.__getView()).toBe('gimnasios');
  });
});
