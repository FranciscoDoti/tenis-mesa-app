import { describe, it, expect } from 'vitest';
import worker, { __WK } from '../../worker/worker.js';

const req = (method, path, body) => new Request('https://w.example.com' + path, {
  method, headers: { 'Content-Type': 'application/json' },
  body: body !== undefined ? JSON.stringify(body) : undefined,
});

describe('worker — router fetch', () => {
  it('OPTIONS responde CORS', async () => {
    const r = await worker.fetch(req('OPTIONS', '/'), {});
    expect(r.status).toBe(200);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('GET / healthcheck', async () => {
    const r = await worker.fetch(req('GET', '/'), {});
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toMatchObject({ ok: true });
  });

  it('ruta desconocida => 404', async () => {
    const r = await worker.fetch(req('GET', '/no-existe'), {});
    expect(r.status).toBe(404);
  });

  it('create-preference sin datos => 400', async () => {
    const r = await worker.fetch(req('POST', '/create-preference', { items: [{}] }), {});
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/faltan datos/);
  });

  it('create-account sin campos => 400', async () => {
    const r = await worker.fetch(req('POST', '/create-account', { email: 'a@b.com' }), {});
    expect(r.status).toBe(400);
  });

  it('create-account sin FIREBASE_API_KEY => 500', async () => {
    const r = await worker.fetch(req('POST', '/create-account', { idToken: 't', email: 'a@b.com', playerId: 'p1' }), {});
    expect(r.status).toBe(500);
  });

  it('excepción interna => 500 (sin claves de servicio el token falla)', async () => {
    const body = { items: [{ tournamentId: 't1', categoryId: 'c1', entrantId: 'e1' }] };
    const r = await worker.fetch(req('POST', '/create-preference', body), {});
    expect(r.status).toBe(500);
  });
});

describe('worker — scoring (espejo del de la app)', () => {
  it('wSetWinner regla a 11 dif 2', () => {
    expect(__WK.wSetWinner([11, 5])).toBe('a');
    expect(__WK.wSetWinner([11, 10])).toBe(null);
    expect(__WK.wSetWinner([13, 11])).toBe('a');
    expect(__WK.wSetWinner([5, 5])).toBe(null);
  });
  it('wMatchResult / wMatchWinnerSide / wMatchDone', () => {
    const cat = { rules: { sets: 5 } };
    const m = { sets: [[11, 0], [11, 0], [11, 0]] };
    expect(__WK.wMatchResult(m)).toEqual({ wa: 3, wb: 0 });
    expect(__WK.wMatchWinnerSide(m, cat)).toBe('a');
    expect(__WK.wMatchDone(m, cat)).toBe(true);
    expect(__WK.wBestOf({ bestOf: 7 }, cat)).toBe(7);
    expect(__WK.wBestOf({}, cat)).toBe(5);
  });
});

describe('worker — grupos / llave', () => {
  const cat = {
    groups: [['a', 'b', 'c']],
    matches: [
      { g: 0, a: 'a', b: 'b', sets: [[11, 0], [11, 0], [11, 0]] },
      { g: 0, a: 'a', b: 'c', sets: [[11, 0], [11, 0], [11, 0]] },
      { g: 0, a: 'b', b: 'c', sets: [[11, 0], [11, 0], [11, 0]] },
    ],
    rules: { sets: 5 },
  };
  it('wGroupComplete', () => {
    expect(__WK.wGroupComplete(cat, 0)).toBe(true);
    expect(__WK.wGroupComplete({ matches: [] }, 0)).toBe(false);
  });
  it('wGroupStandings ordena por victorias', () => {
    const st = __WK.wGroupStandings(cat, 0);
    expect(st[0].id).toBe('a');
    expect(st[0].pg).toBe(2);
  });
  it('wResolveBracketSlots reemplaza marcadores Q por ids reales', () => {
    const c = { ...cat, bracket: [[{ a: 'Q:0:0', b: 'Q:0:1', sets: [] }]] };
    __WK.wResolveBracketSlots(c);
    expect(c.bracket[0][0].a).toBe('a'); // 1ro del grupo 0
    expect(c.bracket[0][0].b).toBe('b'); // 2do del grupo 0
  });
});

describe('worker — utilidades', () => {
  it('b64url genera base64url sin padding', () => {
    const s = __WK.b64url(new Uint8Array([255, 254, 253]));
    expect(s).not.toMatch(/[+/=]/);
    expect(s.length).toBeGreaterThan(0);
  });
  it('randomPassword cumple complejidad mínima', () => {
    const p = __WK.randomPassword();
    expect(p.startsWith('Aa1!')).toBe(true);
    expect(p.length).toBeGreaterThan(8);
  });
});
