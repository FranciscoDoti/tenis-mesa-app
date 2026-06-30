import { describe, it, expect, beforeEach } from 'vitest';
import { app, reset, seedDB } from './harness.js';

beforeEach(() => { reset(); seedDB(); });

describe('setsFmtById', () => {
  it('devuelve el formato por id', () => {
    expect(app.setsFmtById('all3')).toMatchObject({ id: 'all3', groups: 3, bracket: 3, final: 3 });
    expect(app.setsFmtById('g3b5f7')).toMatchObject({ groups: 3, bracket: 5, final: 7 });
  });
  it('id desconocido => default a 5 sets', () => {
    expect(app.setsFmtById('xxx')).toMatchObject({ id: 'all5' });
  });
});

describe('catSetsFmt', () => {
  it('usa setsFormat si la categoría lo define', () => {
    expect(app.catSetsFmt({ setsFormat: 'g3b7' })).toMatchObject({ groups: 3, bracket: 7, final: 7 });
  });
  it('cae al legacy rules.sets', () => {
    expect(app.catSetsFmt({ rules: { sets: 3 } })).toMatchObject({ groups: 3, bracket: 3, final: 3 });
  });
  it('sin nada => 5', () => {
    expect(app.catSetsFmt({})).toMatchObject({ groups: 5 });
    expect(app.catSetsFmt(null)).toMatchObject({ groups: 5 });
  });
});

describe('catCatalog / catEntryByName / catalogRule', () => {
  it('sin override de escuela, deriva del CATALOG fijo', () => {
    const cc = app.catCatalog();
    expect(cc.find(c => c.name === 'Primera')).toBeTruthy();
    expect(cc.length).toBe(app.CATALOG.length);
  });
  it('catEntryByName encuentra por nombre', () => {
    expect(app.catEntryByName('Sub 15')).toMatchObject({ name: 'Sub 15' });
    expect(app.catEntryByName('NoExiste')).toBe(null);
  });
  it('catalogRule devuelve la regla del catálogo', () => {
    expect(app.catalogRule('Primera')).toEqual({ type: 'level', level: 1 });
    expect(app.catalogRule('Sub 13')).toEqual({ type: 'maxAge', age: 13 });
    expect(app.catalogRule('Inexistente')).toEqual({ type: 'open' });
  });
  it('respeta un categoryCatalog custom de DB.settings', () => {
    const db = app.__getDB();
    db.settings.categoryCatalog = [{ id: 'x', name: 'Mi Cat', rule: { type: 'open' } }];
    expect(app.catCatalog()).toHaveLength(1);
    expect(app.catEntryByName('Mi Cat')).toMatchObject({ name: 'Mi Cat' });
  });
});

describe('newCategoryFromCatalog', () => {
  it('hereda format/rule/sets del catálogo', () => {
    const c = app.newCategoryFromCatalog('Primera');
    expect(c.name).toBe('Primera');
    expect(c.format).toBe('single');
    expect(c.rule).toEqual({ type: 'level', level: 1 });
    expect(c.championPoints).toBe(20);
    expect(c.entrants).toEqual([]);
    expect(c.rules.sets).toBe(app.setsFmtById(c.setsFormat).bracket);
  });
  it('nombre desconocido => defaults (open / single / all5)', () => {
    const c = app.newCategoryFromCatalog('Loquesea');
    expect(c.format).toBe('single');
    expect(c.setsFormat).toBe('all5');
    expect(c.rule).toEqual({ type: 'open' });
    expect(c.cost).toBe(0);
  });
});
