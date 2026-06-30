import { describe, it, expect, beforeEach } from 'vitest';
import { app, reset, login, USERS } from './harness.js';
import { dbWithPlayers, addTournament, winMatch, stubRender } from './fixtures.js';

const $ = s => document.querySelector(s);
const setVal = (id, v) => { document.getElementById(id).value = v; };

beforeEach(() => { reset(); login(USERS.adminBari); });

describe('inscripción de singles', () => {
  it('enrollModal + saveEnrollSingles inscribe a los elegibles marcados', () => {
    const db = dbWithPlayers([800, 600, 400]);
    const { t, cat } = addTournament(db, { rule: { type: 'open' }, teams: [] }); // sin entrantes
    cat.entrants = [];
    window.enrollModal(t.id, cat.id);
    // marcar los dos primeros checkboxes
    const boxes = [...document.querySelectorAll('#modalCard input[type=checkbox]')];
    boxes[0].checked = true; boxes[1].checked = true;
    window.saveEnrollSingles(t.id, cat.id);
    expect(cat.entrants.length).toBe(2);
  });
});

describe('inscripción de dobles', () => {
  it('addTeam valida y agrega una pareja', () => {
    const db = dbWithPlayers([800, 600, 400, 200]);
    const { t, cat } = addTournament(db, { format: 'double', rule: { type: 'open' }, teams: [] });
    cat.entrants = [];
    window.enrollDoubles(t.id, cat.id);
    setVal('d_a', 'p0'); setVal('d_b', 'p1');
    window.addTeam(t.id, cat.id);
    expect(window.__teams.length).toBe(1);
    // misma persona dos veces => error
    setVal('d_a', 'p0'); setVal('d_b', 'p0');
    window.addTeam(t.id, cat.id);
    expect($('#derr').hidden).toBe(false);
    window.saveEnrollDoubles(t.id, cat.id);
    expect(cat.entrants.length).toBe(1);
  });
});

describe('carga de resultados', () => {
  function setupGroups() {
    const db = dbWithPlayers([800, 600, 400]);
    const { t, cat } = addTournament(db, { rule: { type: 'level', level: 4 } });
    stubRender(); // para makeGroups
    app.makeGroups(t.id, cat.id);
    app.__setRender(() => {}); // mantener render mudo
    return { t, cat };
  }

  it('resultModal + saveResultA guarda un resultado de grupo válido', () => {
    const { t, cat } = setupGroups();
    window.resultModal(t.id, cat.id, 'group', 0, null, null);
    // tres sets 11-0 => gana A
    document.querySelector('.set-a[data-i="0"]').value = '11';
    document.querySelector('.set-b[data-i="0"]').value = '0';
    document.querySelector('.set-a[data-i="1"]').value = '11';
    document.querySelector('.set-b[data-i="1"]').value = '0';
    document.querySelector('.set-a[data-i="2"]').value = '11';
    document.querySelector('.set-b[data-i="2"]').value = '0';
    window.saveResultA();
    expect(cat.matches[0].sets.length).toBe(3);
    expect(app.matchWinnerSide(cat.matches[0], cat)).toBe('a');
  });

  it('commitResult rechaza un set inválido', () => {
    const { t, cat } = setupGroups();
    window.resultModal(t.id, cat.id, 'group', 0, null, null);
    // 11-10 no es válido (hay que sacar 2)
    app.commitResult(t.id, cat.id, 'group', 0, null, null, [[11, 10]]);
    expect($('#rerr').hidden).toBe(false);
    expect(cat.matches[0].sets.length).toBe(0);
  });

  it('commitResult rechaza sets de más después de definido', () => {
    const { t, cat } = setupGroups();
    window.resultModal(t.id, cat.id, 'group', 0, null, null);
    // a 5 sets gana con 3; cargar 4 ganados es "de más"
    app.commitResult(t.id, cat.id, 'group', 0, null, null, [[11, 0], [11, 0], [11, 0], [11, 0]]);
    expect($('#rerr').hidden).toBe(false);
  });

  it('resultModal avisa si faltan participantes (BYE)', () => {
    const db = dbWithPlayers([800, 600, 400]);
    const { t, cat } = addTournament(db, { rule: { type: 'level', level: 4 } });
    cat.bracket = [[{ a: 'e0', b: 'BYE', sets: [] }]];
    window.resultModal(t.id, cat.id, 'bracket', null, 0, 0);
    expect(globalThis.alert).toHaveBeenCalled();
  });
});

describe('inscripción: toggle y horario', () => {
  it('toggleEnroll alterna el override de la categoría', () => {
    const db = dbWithPlayers([100]);
    const { t, cat } = addTournament(db);
    cat.groups = null; cat.closed = false;
    const open0 = app.enrollmentStatus(cat).open;
    window.toggleEnroll(t.id, cat.id);
    expect(app.enrollmentStatus(cat).open).toBe(!open0);
  });
  it('saveCategoryTime fija y limpia el horario', () => {
    const db = dbWithPlayers([100]);
    const { t, cat } = addTournament(db);
    window.categoryTimeModal(t.id, cat.id);
    setVal('ct_start', '2030-01-01T18:30');
    window.saveCategoryTime(t.id, cat.id);
    expect(cat.startAt).toBe('2030-01-01T18:30');
    window.saveCategoryTime(t.id, cat.id, true); // clear
    expect(cat.startAt).toBe(null);
  });
});

describe('ciclo de vida del torneo', () => {
  it('publish / start / finalize / reopen', () => {
    const db = dbWithPlayers([100]);
    const { t } = addTournament(db);
    t.published = false; t.started = false; t.finished = false;
    window.publishTournament(t.id);
    expect(t.published).toBe(true);
    window.startTournament(t.id);
    expect(t.started).toBe(true);
    window.finalizeTournament(t.id);
    expect(t.finished).toBe(true);
    window.reopenTournament(t.id);
    expect(t.finished).toBe(false);
  });
  it('respeta el confirm (si cancela, no cambia)', () => {
    const db = dbWithPlayers([100]);
    const { t } = addTournament(db);
    t.published = false;
    globalThis.confirm.mockReturnValue(false);
    window.publishTournament(t.id);
    expect(t.published).toBe(false);
  });
});
