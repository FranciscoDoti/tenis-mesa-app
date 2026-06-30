import { describe, it, expect, beforeEach } from 'vitest';
import { app, reset } from './harness.js';

beforeEach(reset);

describe('money', () => {
  it('formatea pesos AR', () => {
    expect(app.money(0)).toBe('$0');
    expect(app.money(1500)).toMatch(/^\$1[.,]?500$/);
    expect(app.money('nan')).toBe('$0');
    expect(app.money(null)).toBe('$0');
  });
});

describe('esc', () => {
  it('escapa HTML peligroso', () => {
    expect(app.esc('<script>&"')).toBe('&lt;script&gt;&amp;&quot;');
  });
  it('null/undefined => string vacío', () => {
    expect(app.esc(null)).toBe('');
    expect(app.esc(undefined)).toBe('');
    expect(app.esc(42)).toBe('42');
  });
});

describe('waLink', () => {
  it('arma link de wa.me con solo dígitos y texto encodeado', () => {
    expect(app.waLink('+54 9 11 1234', 'hola mundo')).toBe('https://wa.me/549111234?text=hola%20mundo');
  });
  it('sin texto', () => {
    expect(app.waLink('549111234')).toBe('https://wa.me/549111234');
  });
});

describe('payFmtDate', () => {
  it('convierte ISO a dd/mm/yyyy', () => {
    expect(app.payFmtDate('2026-07-11T10:00:00')).toBe('11/07/2026');
    expect(app.payFmtDate('2026-07-11')).toBe('11/07/2026');
  });
  it('vacío => vacío; formato raro => tal cual', () => {
    expect(app.payFmtDate('')).toBe('');
    expect(app.payFmtDate(null)).toBe('');
    expect(app.payFmtDate('hoy')).toBe('hoy');
  });
});

describe('fmtStartAt', () => {
  it('formatea fecha-hora', () => {
    expect(app.fmtStartAt('2026-07-11T18:30')).toBe('11/07 18:30');
    expect(app.fmtStartAt('2026-07-11')).toBe('11/07');
    expect(app.fmtStartAt('')).toBe('');
    expect(app.fmtStartAt('raro')).toBe('raro');
  });
});

describe('ytId', () => {
  it('extrae el id de varias formas de URL de YouTube', () => {
    expect(app.ytId('https://www.youtube.com/watch?v=abcdef123')).toBe('abcdef123');
    expect(app.ytId('https://youtu.be/abcdef123')).toBe('abcdef123');
    expect(app.ytId('https://youtube.com/live/abcdef123')).toBe('abcdef123');
    expect(app.ytId('https://youtube.com/shorts/abcdef123')).toBe('abcdef123');
  });
  it('url inválida o vacía => null', () => {
    expect(app.ytId('')).toBe(null);
    expect(app.ytId(null)).toBe(null);
    expect(app.ytId('https://example.com')).toBe(null);
  });
});

describe('mapEmbed', () => {
  it('sin dirección muestra placeholder', () => {
    expect(app.mapEmbed('')).toContain('Sin dirección');
  });
  it('con dirección arma iframe de google maps', () => {
    const html = app.mapEmbed('Av Siempre Viva 123');
    expect(html).toContain('maps.google.com');
    expect(html).toContain(encodeURIComponent('Av Siempre Viva 123'));
  });
});

describe('phoneHintText', () => {
  it('para AR menciona el 9 de WhatsApp', () => {
    const t = app.phoneHintText('AR');
    expect(t).toContain('WhatsApp');
    expect(t).toContain('Argentina');
  });
  it('código desconocido cae al primer país', () => {
    expect(typeof app.phoneHintText('ZZ')).toBe('string');
  });
});
