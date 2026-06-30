import { describe, it, expect, beforeEach } from 'vitest';
import { app, reset, login, USERS } from './harness.js';
import { dbWithPlayers, addTournament } from './fixtures.js';

beforeEach(reset);

describe('shadeHex', () => {
  it('aclara hacia blanco con amt positivo', () => {
    expect(app.shadeHex('#000000', 1)).toBe('#ffffff');
    expect(app.shadeHex('#000000', 0.5)).toBe('#808080');
  });
  it('oscurece hacia negro con amt negativo', () => {
    expect(app.shadeHex('#ffffff', -1)).toBe('#000000');
  });
  it('hex inválido => devuelve la entrada', () => {
    expect(app.shadeHex('rojo', 0.5)).toBe('rojo');
    expect(app.shadeHex(null, 0.5)).toBe(null);
  });
});

describe('autoTheme', () => {
  it('mapea overall a la rareza de la carta', () => {
    expect(app.autoTheme(95)).toBe('onix');
    expect(app.autoTheme(86)).toBe('oro');
    expect(app.autoTheme(78)).toBe('plata');
    expect(app.autoTheme(50)).toBe('bronce');
  });
});

describe('defaultSetting / setting', () => {
  beforeEach(() => { dbWithPlayers([100]); });
  it('defaultSetting cae a DEFAULT_SETTINGS si no está en DB', () => {
    const db = app.__getDB();
    delete db.settings.news;
    expect(app.defaultSetting('news')).toBe(app.DEFAULT_SETTINGS.news);
    db.settings.news = false;
    expect(app.defaultSetting('news')).toBe(false);
  });
  it('setting de clave de organización usa la bolsa de org', () => {
    login(USERS.adminBari);
    const db = app.__getDB();
    db.settings.orgs = { org_byd: { doublesRanking: true } };
    expect(app.setting('doublesRanking')).toBe(true);
  });
  it('setting de clave de escuela usa la bolsa de escuela', () => {
    login(USERS.adminBari);
    const db = app.__getDB();
    db.settings.schools = { sch_bari: { news: false } };
    expect(app.setting('news')).toBe(false);
  });
  it('setting sin override cae al default heredado', () => {
    login(USERS.adminBari);
    expect(app.setting('playerCard')).toBe(app.DEFAULT_SETTINGS.playerCard);
  });
});

describe('settingsBag', () => {
  it('sin create devuelve null cuando no existe', () => {
    dbWithPlayers([100]);
    expect(app.settingsBag('school', 'sch_bari')).toBe(null);
  });
  it('con create inicializa la bolsa', () => {
    dbWithPlayers([100]);
    const bag = app.settingsBag('school', 'sch_bari', true);
    expect(bag).toEqual({});
    expect(app.__getDB().settings.schools.sch_bari).toBe(bag);
  });
  it('id nulo => null', () => {
    dbWithPlayers([100]);
    expect(app.settingsBag('school', null, true)).toBe(null);
  });
});

describe('tournamentSetting', () => {
  it('resuelve contra la org/escuela del torneo', () => {
    const db = dbWithPlayers([100]);
    const { t } = addTournament(db);
    db.settings.schools = { sch_bari: { paymentsEnabled: true } };
    db.settings.orgs = { org_byd: { paymentsAllowed: false } };
    expect(app.tournamentSetting(t, 'paymentsEnabled')).toBe(true);
    expect(app.tournamentSetting(t, 'paymentsAllowed')).toBe(false);
  });
  it('sin torneo => default', () => {
    dbWithPlayers([100]);
    expect(app.tournamentSetting(null, 'news')).toBe(app.DEFAULT_SETTINGS.news);
  });
});

describe('hasPayWorker', () => {
  it('true solo si hay URL de worker configurada', () => {
    dbWithPlayers([100]);
    expect(app.hasPayWorker()).toBe(false);
    app.__getDB().settings.mpWorkerUrl = 'https://w.example.com';
    expect(app.hasPayWorker()).toBe(true);
  });
});
