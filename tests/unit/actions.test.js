import { describe, it, expect, beforeEach } from 'vitest';
import { app, reset, login, USERS, seedDB } from './harness.js';

const $ = s => document.querySelector(s);
const setVal = (id, v) => { const el = document.getElementById(id); el.value = v; return el; };

beforeEach(() => { reset(); seedDB(); });

describe('doLogin / logout (modo local)', () => {
  it('login correcto deja sesión y vista ranking', async () => {
    app.__setSession(null);
    app.__setView('ranking');
    app.render(); // pinta el login
    setVal('lu', 'adminBari'); setVal('lp', 'adminBari');
    await app.currentUser; // no-op
    // doLogin no está en exports directos pero render del login usa onclick="doLogin()"; lo invocamos por window
    window.doLogin();
    expect(app.currentUser()).toMatchObject({ username: 'adminBari', role: 'admin' });
  });

  it('login incorrecto muestra error', () => {
    app.__setSession(null);
    app.render();
    setVal('lu', 'adminBari'); setVal('lp', 'malísima');
    window.doLogin();
    expect(app.currentUser()).toBe(null);
    expect($('#lerr').hidden).toBe(false);
  });

  it('logout limpia la sesión', () => {
    login(USERS.adminBari);
    window.logout();
    expect(app.currentUser()).toBe(null);
  });
});

describe('CRUD jugadores', () => {
  beforeEach(() => login(USERS.adminBari));

  it('agrega un jugador con datos válidos', () => {
    const before = app.__getDB().players.length;
    window.playerForm(); // abre modal de alta
    setVal('f_first', 'Nuevo'); setVal('f_last', 'Jugador');
    setVal('f_username', 'njugador'); setVal('f_pts', '150');
    setVal('f_phone_area', '11'); setVal('f_phone_num', '12345678');
    window.savePlayer('');
    const db = app.__getDB();
    expect(db.players.length).toBe(before + 1);
    expect(db.players.some(p => p.username === 'njugador')).toBe(true);
    expect($('#modal').hidden).toBe(true); // modal cerrado
  });

  it('valida nombre/apellido obligatorios', () => {
    window.playerForm();
    setVal('f_first', ''); setVal('f_last', '');
    window.savePlayer('');
    expect($('#ferr').hidden).toBe(false);
  });

  it('valida usuario con formato inválido', () => {
    window.playerForm();
    setVal('f_first', 'A'); setVal('f_last', 'B'); setVal('f_username', 'x'); // muy corto
    window.savePlayer('');
    expect($('#ferr').textContent).toMatch(/usuario/i);
  });

  it('edita un jugador existente', () => {
    const p = app.__getDB().players.find(x => x.schoolId === 'sch_bari');
    window.playerForm(p.id);
    setVal('f_first', 'Renombrado');
    if (!document.getElementById('f_username').value) setVal('f_username', 'renombrado');
    setVal('f_phone_area', '11'); setVal('f_phone_num', '12345678');
    window.savePlayer(p.id);
    expect(app.playerById(p.id).firstName).toBe('Renombrado');
  });

  it('borra (soft) y restaura un jugador', () => {
    const p = app.__getDB().players.find(x => x.schoolId === 'sch_bari');
    window.delPlayer(p.id);
    expect(app.playerById(p.id).deleted).toBe(true);
    app.restorePlayer(p.id);
    expect(app.playerById(p.id).deleted).toBeFalsy();
  });
});

describe('aprobaciones', () => {
  beforeEach(() => login(USERS.adminBari));
  it('aprueba y rechaza altas pendientes', () => {
    const db = app.__getDB();
    db.players[0].pending = true;
    db.players[0].schoolId = 'sch_bari'; db.players[0].orgId = 'org_byd';
    window.approvePlayer(db.players[0].id);
    expect(db.players[0].pending).toBeFalsy();

    db.players[1].pending = true;
    db.players[1].schoolId = 'sch_bari'; db.players[1].orgId = 'org_byd';
    const id = db.players[1].id;
    window.rejectPlayer(id);
    // rechazar marca deleted o lo saca de pendientes
    const after = app.playerById(id);
    expect(!after || after.deleted || !after.pending).toBeTruthy();
  });
});

describe('CRUD gimnasios', () => {
  beforeEach(() => login(USERS.adminBari));
  it('agrega, edita y borra un gimnasio', () => {
    const before = app.__getDB().gyms.length;
    window.gymForm();
    setVal('g_name', 'Gimnasio Test'); setVal('g_addr', 'Calle 1');
    window.saveGym('');
    const db = app.__getDB();
    expect(db.gyms.length).toBe(before + 1);
    const g = db.gyms.find(x => x.name === 'Gimnasio Test');
    window.gymForm(g.id);
    setVal('g_name', 'Gimnasio Editado');
    window.saveGym(g.id);
    expect(app.gymById(g.id).name).toBe('Gimnasio Editado');
    window.delGym(g.id); // confirm() stub => true
    expect(app.gymById(g.id)).toBeUndefined();
  });
  it('valida nombre obligatorio', () => {
    window.gymForm();
    setVal('g_name', ''); window.saveGym('');
    expect($('#gerr').hidden).toBe(false);
  });
});

describe('catálogo de categorías', () => {
  beforeEach(() => login(USERS.adminBari));
  it('crea una categoría de catálogo y la borra', () => {
    window.catalogEntryForm();
    setVal('cc_name', 'Mi Categoria');
    setVal('cc_ruletype', 'level'); window.catRuleTypeChange();
    setVal('cc_level', '2');
    window.saveCatalogEntry('');
    const list = app.schoolCatalog();
    const created = list.find(c => c.name === 'Mi Categoria');
    expect(created).toBeTruthy();
    expect(created.rule).toEqual({ type: 'level', level: 2 });
    window.delCatalogEntry(created.id);
    expect(app.schoolCatalog().some(c => c.id === created.id)).toBe(false);
  });
  it('rechaza nombre vacío', () => {
    window.catalogEntryForm();
    setVal('cc_name', '');
    window.saveCatalogEntry('');
    expect($('#ccerr').hidden).toBe(false);
  });
  it('catFmtChange habilita "mixto" solo en dobles', () => {
    window.catalogEntryForm();
    setVal('cc_fmt', 'double'); window.catFmtChange('cc');
    const mixed = document.querySelector('#cc_gender option[value="mixed"]');
    expect(mixed.hidden).toBe(false);
    setVal('cc_fmt', 'single'); window.catFmtChange('cc');
    expect(mixed.hidden).toBe(true);
  });
});

describe('crear torneo', () => {
  beforeEach(() => login(USERS.adminBari));
  it('crea un torneo en borrador con una categoría', () => {
    const before = app.__getDB().tournaments.length;
    window.tournamentForm();
    setVal('t_name', 'Copa Test');
    setVal('t_date', '2030-01-01');
    setVal('t_dateEnd', '2030-01-02');
    setVal('t_tables', '4');
    // marcar la primera categoría
    const chk = document.querySelector('#modalCard .cat-chk');
    chk.checked = true;
    window.saveTournament();
    const db = app.__getDB();
    expect(db.tournaments.length).toBe(before + 1);
    expect(db.tournaments.some(t => t.name === 'Copa Test')).toBe(true);
  });
  it('valida nombre y fecha obligatorios', () => {
    window.tournamentForm();
    setVal('t_name', ''); setVal('t_date', '');
    window.saveTournament();
    expect($('#terr').hidden).toBe(false);
  });
});

describe('toggles de ajustes', () => {
  beforeEach(() => login(USERS.adminBari));
  it('toggle de noticias alterna el ajuste de la escuela', () => {
    const read = () => app.setting('news');
    const v0 = read();
    window.toggleNews();
    expect(read()).toBe(!v0);
  });
  it('toggle de tarjeta de jugador', () => {
    const v0 = app.setting('playerCard');
    window.togglePlayerCard();
    expect(app.setting('playerCard')).toBe(!v0);
  });
});

describe('perfil del jugador', () => {
  it('guarda cambios del perfil (incluye teléfono obligatorio)', () => {
    const db = app.__getDB();
    const p = db.players.find(x => x.schoolId === 'sch_bari');
    login({ ...USERS.player, playerId: p.id, name: app.fullName(p) });
    app.__setView('perfil');
    app.render();
    setVal('pf_first', 'PerfilNuevo');
    setVal('pf_last', 'Apellido');
    setVal('pf_phone_area', '11');
    setVal('pf_phone_num', '12345678');
    window.saveProfile();
    expect(app.playerById(p.id).firstName).toBe('PerfilNuevo');
  });
});
