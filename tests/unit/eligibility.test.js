import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { app, reset } from './harness.js';

beforeEach(() => {
  reset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-30T12:00:00'));
});
afterEach(() => vi.useRealTimers());

describe('ageFromDob', () => {
  it('sin dob => null', () => {
    expect(app.ageFromDob(null)).toBe(null);
    expect(app.ageFromDob('')).toBe(null);
  });
  it('cumpleaños ya pasó este año', () => {
    expect(app.ageFromDob('2000-01-15')).toBe(26);
  });
  it('cumpleaños todavía no llegó este año', () => {
    expect(app.ageFromDob('2000-12-31')).toBe(25);
  });
  it('cumpleaños exactamente hoy', () => {
    expect(app.ageFromDob('2000-06-30')).toBe(26);
  });
});

describe('guessGender / genderOf / norm1', () => {
  it('norm1 toma el primer nombre sin acentos en minúscula', () => {
    expect(app.norm1('  José Luis ')).toBe('jose');
    expect(app.norm1('')).toBe('');
  });
  it('nombres de la lista => F', () => {
    expect(app.guessGender('Victoria')).toBe('F');
    expect(app.guessGender('Sabrina')).toBe('F');
  });
  it('heurística termina en "a" => F', () => {
    expect(app.guessGender('Carla')).toBe('F');
  });
  it('por defecto => M', () => {
    expect(app.guessGender('Jorge')).toBe('M');
    expect(app.guessGender('')).toBe('M');
  });
  it('genderOf respeta el campo gender si está', () => {
    expect(app.genderOf({ firstName: 'Carla', gender: 'M' })).toBe('M');
    expect(app.genderOf({ firstName: 'Carla' })).toBe('F');
    expect(app.genderOf(null)).toBe('M');
  });
});

describe('ruleLabel / ordinal', () => {
  it('etiquetas por tipo de regla', () => {
    expect(app.ruleLabel(null)).toBe('Libre');
    expect(app.ruleLabel({ type: 'open' })).toBe('Libre');
    expect(app.ruleLabel({ type: 'level', level: 2 })).toBe('2ª o superior');
    expect(app.ruleLabel({ type: 'maxAge', age: 15 })).toBe('hasta 15 años');
    expect(app.ruleLabel({ type: 'minAge', age: 70 })).toBe('70+ años');
    expect(app.ruleLabel({ type: 'range', min: 30, max: 39 })).toBe('30 a 39 años');
    expect(app.ruleLabel({ type: 'otro' })).toBe('Libre');
  });
});

describe('eligible', () => {
  const P = (over = {}) => ({ firstName: 'Juan', lastName: 'Perez', category: '3ra', dob: '2000-06-01', ...over });

  it('regla open => ok', () => {
    expect(app.eligible({ name: 'TC', rule: { type: 'open' } }, P()).ok).toBe(true);
    expect(app.eligible({ name: 'TC' }, P()).ok).toBe(true);
  });

  it('género female rechaza varones', () => {
    const r = app.eligible({ name: 'Fem', gender: 'female', rule: { type: 'open' } }, P({ gender: 'M' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('solo para mujeres');
  });
  it('género male rechaza mujeres', () => {
    const r = app.eligible({ name: 'Mas', gender: 'male', rule: { type: 'open' } }, P({ gender: 'F' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('solo para varones');
  });

  it('nivel: un 1ra no puede jugar Segunda', () => {
    const cat = { name: 'Segunda', rule: { type: 'level', level: 2 } };
    expect(app.eligible(cat, P({ category: '1ra' })).ok).toBe(false);
    expect(app.eligible(cat, P({ category: '2da' })).ok).toBe(true);
    expect(app.eligible(cat, P({ category: '4ta' })).ok).toBe(true);
  });
  it('nivel: categoría desconocida => ok (lvl<=0)', () => {
    const cat = { name: 'Primera', rule: { type: 'level', level: 1 } };
    expect(app.eligible(cat, P({ category: 'X' })).ok).toBe(true);
  });

  it('maxAge', () => {
    const cat = { name: 'Sub 15', rule: { type: 'maxAge', age: 15 } };
    expect(app.eligible(cat, P({ dob: '2012-01-01' })).ok).toBe(true);  // 14
    expect(app.eligible(cat, P({ dob: '2008-01-01' })).ok).toBe(false); // 18
  });
  it('minAge', () => {
    const cat = { name: 'Maxi 70', rule: { type: 'minAge', age: 70 } };
    expect(app.eligible(cat, P({ dob: '1950-01-01' })).ok).toBe(true);  // 76
    expect(app.eligible(cat, P({ dob: '2000-01-01' })).ok).toBe(false);
  });
  it('range', () => {
    const cat = { name: 'Maxi 40', rule: { type: 'range', min: 40, max: 49 } };
    expect(app.eligible(cat, P({ dob: '1980-01-01' })).ok).toBe(true);  // 46
    expect(app.eligible(cat, P({ dob: '1970-01-01' })).ok).toBe(false); // 56
  });
  it('regla de edad sin fecha de nacimiento => error pidiendo dob', () => {
    const cat = { name: 'Sub 15', rule: { type: 'maxAge', age: 15 } };
    const r = app.eligible(cat, P({ dob: null }));
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Falta fecha');
  });
});

describe('pairGenderOk', () => {
  beforeEach(() => {
    app.__setDB({
      players: [
        { id: 'm1', firstName: 'Juan', lastName: 'A', gender: 'M' },
        { id: 'm2', firstName: 'Luis', lastName: 'B', gender: 'M' },
        { id: 'f1', firstName: 'Ana', lastName: 'C', gender: 'F' },
        { id: 'f2', firstName: 'Eva', lastName: 'D', gender: 'F' },
      ],
      orgs: [], tournaments: [], gyms: [], users: [], settings: {},
    });
  });
  it('any => siempre ok', () => {
    expect(app.pairGenderOk({ gender: 'any' }, 'm1', 'f1').ok).toBe(true);
    expect(app.pairGenderOk({}, 'm1', 'f1').ok).toBe(true);
  });
  it('female exige dos mujeres', () => {
    expect(app.pairGenderOk({ gender: 'female' }, 'f1', 'f2').ok).toBe(true);
    expect(app.pairGenderOk({ gender: 'female' }, 'f1', 'm1').ok).toBe(false);
  });
  it('male exige dos varones', () => {
    expect(app.pairGenderOk({ gender: 'male' }, 'm1', 'm2').ok).toBe(true);
    expect(app.pairGenderOk({ gender: 'male' }, 'm1', 'f1').ok).toBe(false);
  });
  it('mixed exige uno de cada', () => {
    expect(app.pairGenderOk({ gender: 'mixed' }, 'm1', 'f1').ok).toBe(true);
    expect(app.pairGenderOk({ gender: 'mixed' }, 'm1', 'm2').ok).toBe(false);
  });
});
