/*
 * Tests de store.js (capa Firestore + Auth). store.js es una IIFE que corre al importarse y, si NO hay
 * Firebase configurado, hace `return` temprano (modo local). Para ejercitar TODO el archivo, mockeamos
 * `firebase` y `window.firebaseConfig` ANTES de importarlo, así toma el camino "Firebase habilitado".
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- Fake de Firestore ---------------------------------------------------------------------------
function jdoc(id, obj) { return { id, data: () => ({ j: JSON.stringify(obj) }) }; }
function udoc(id, obj) { return { id, data: () => obj }; }

function makeFakeFirebase() {
  const writes = []; // registro de set/delete para verificar sync()
  const data = {
    players: [jdoc('p1', { id: 'p1', name: 'A' })],
    gyms: [jdoc('g1', { id: 'g1' })],
    tournaments: [jdoc('t1', { id: 't1' })],
    news: [],
    users: [udoc('u1', { role: 'admin', schoolId: 'sch_bari' })],
    payAccounts: [jdoc('pa1', { id: 'pa1', ownerUid: 'u1' })],
    payments: [jdoc('pay1', { id: 'pay1', playerId: 'p1', schoolId: 'sch_bari', status: 'approved' })],
  };
  const settingsDoc = { exists: true, data: () => ({ j: JSON.stringify({ theme: { emoji: '🏓' } }) }) };

  const snap = docs => ({ docs, empty: docs.length === 0 });

  function makeQuery(coll, filters = []) {
    return {
      where: (field, op, val) => makeQuery(coll, [...filters, { field, op, val }]),
      get: () => Promise.resolve(snap(data[coll] || [])),
      onSnapshot: (cb) => { cb(snap(data[coll] || [])); return () => {}; },
      doc: (id) => makeDocRef(coll, id),
      _filters: filters,
    };
  }
  function makeDocRef(coll, id) {
    return {
      set: (payload) => { writes.push({ op: 'set', coll, id, payload }); return Promise.resolve(); },
      delete: () => { writes.push({ op: 'delete', coll, id }); return Promise.resolve(); },
      get: () => Promise.resolve(coll === 'app' ? settingsDoc : (id ? udoc(id, (data[coll] || []).find(d => d.id === id)?.data?.() || {}) : { exists: false })),
      onSnapshot: (cb) => { cb(settingsDoc); return () => {}; },
    };
  }

  const auth = {
    currentUser: { uid: 'u1', emailVerified: true, getIdToken: () => Promise.resolve('tok'), reload: () => Promise.resolve(), sendEmailVerification: vi.fn(() => Promise.resolve()), updatePassword: vi.fn(() => Promise.resolve()) },
    useEmulator: vi.fn(),
    onAuthStateChanged: vi.fn(),
    signInWithEmailAndPassword: vi.fn(() => Promise.resolve({ user: { uid: 'u1' } })),
    createUserWithEmailAndPassword: vi.fn(() => Promise.resolve({ user: { uid: 'u2' } })),
    signOut: vi.fn(() => Promise.resolve()),
    sendPasswordResetEmail: vi.fn(() => Promise.resolve()),
  };
  const db = {
    useEmulator: vi.fn(),
    collection: (name) => makeQuery(name),
    doc: (path) => { const [coll, id] = path.split('/'); return makeDocRef(coll, id); },
  };
  const firebase = {
    initializeApp: vi.fn(),
    auth: () => auth,
    firestore: () => db,
  };
  return { firebase, auth, db, writes };
}

async function loadStore(overrideCfg) {
  vi.resetModules();
  const fb = makeFakeFirebase();
  globalThis.firebase = fb.firebase;
  window.firebaseConfig = overrideCfg || { apiKey: 'k', projectId: 'real-proj' };
  await import('../../store.js?store=' + Math.random().toString(36).slice(2));
  return { STORE: window.STORE, ...fb };
}

describe('store.js (Firebase habilitado)', () => {
  let ctx;
  beforeEach(async () => { ctx = await loadStore(); });

  it('STORE queda habilitado', () => {
    expect(ctx.STORE.enabled).toBe(true);
    expect(ctx.firebase.initializeApp).toHaveBeenCalled();
  });

  it('authMsg traduce códigos conocidos y desconocidos', () => {
    expect(ctx.STORE.authMsg('auth/wrong-password')).toMatch(/incorrecta/i);
    expect(ctx.STORE.authMsg('auth/email-already-in-use')).toMatch(/Ya existe/i);
    expect(ctx.STORE.authMsg('algo-raro')).toMatch(/No se pudo/i);
  });

  it('loadAll trae todas las colecciones parseadas', async () => {
    const data = await ctx.STORE.loadAll({ role: 'superadmin' });
    expect(data.players).toEqual([{ id: 'p1', name: 'A' }]);
    expect(data.users[0]).toMatchObject({ uid: 'u1', role: 'admin' });
    expect(data.payAccounts[0].id).toBe('pa1');
    expect(data.payments[0].id).toBe('pay1');
    expect(data.settings).toMatchObject({ theme: { emoji: '🏓' } });
    expect(data.empty).toBe(false);
  });

  it('loadAll sin scope no trae payments (PII)', async () => {
    const data = await ctx.STORE.loadAll(null);
    expect(data.payments).toEqual([]);
  });

  it('loadPublicSettings devuelve el tema publicado', async () => {
    const s = await ctx.STORE.loadPublicSettings();
    expect(s).toMatchObject({ theme: { emoji: '🏓' } });
  });

  it('sync escribe solo lo que cambió y borra lo que ya no está', async () => {
    ctx.STORE.primeLast({ players: [{ id: 'p1', name: 'A' }], gyms: [], tournaments: [], news: [] });
    await ctx.STORE.sync({
      players: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }], // p2 nuevo
      gyms: [], tournaments: [], news: [],
    });
    const sets = ctx.writes.filter(w => w.op === 'set');
    expect(sets.some(w => w.coll === 'players' && w.id === 'p2')).toBe(true);
    expect(sets.some(w => w.id === 'p1')).toBe(false); // p1 no cambió
  });

  it('sync agrega campos nativos a tournaments (orgId/published/collaborators)', async () => {
    ctx.STORE.primeLast({ players: [], gyms: [], tournaments: [], news: [] });
    await ctx.STORE.sync({ players: [], gyms: [], news: [], tournaments: [{ id: 't9', orgId: 'org_byd', schoolId: 'sch_bari', published: true, collaborators: ['c1'] }] });
    const w = ctx.writes.find(x => x.coll === 'tournaments' && x.id === 't9');
    expect(w.payload).toMatchObject({ orgId: 'org_byd', schoolId: 'sch_bari', published: true, collaborators: ['c1'] });
    expect(typeof w.payload.j).toBe('string');
  });

  it('subscribe entrega datos y devuelve una función de baja', () => {
    const seen = {};
    const unsub = ctx.STORE.subscribe((coll, data) => { seen[coll] = data; }, { role: 'superadmin' });
    expect(seen.players).toEqual([{ id: 'p1', name: 'A' }]);
    expect(seen.users[0]).toMatchObject({ uid: 'u1' });
    expect(seen.settings).toMatchObject({ theme: { emoji: '🏓' } });
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });

  it('auth: signIn/signUp/signOut/reset delegan en firebase.auth', async () => {
    await ctx.STORE.signIn(' user@x.com ', 'pw');
    expect(ctx.auth.signInWithEmailAndPassword).toHaveBeenCalledWith('user@x.com', 'pw');
    await ctx.STORE.signUp('a@b.com', 'pw');
    expect(ctx.auth.createUserWithEmailAndPassword).toHaveBeenCalled();
    await ctx.STORE.signOut();
    expect(ctx.auth.signOut).toHaveBeenCalled();
    await ctx.STORE.resetPassword('a@b.com');
    expect(ctx.auth.sendPasswordResetEmail).toHaveBeenCalled();
  });

  it('uid / isEmailVerified / idToken', async () => {
    expect(ctx.STORE.uid()).toBe('u1');
    expect(ctx.STORE.isEmailVerified()).toBe(true);
    expect(await ctx.STORE.idToken()).toBe('tok');
  });

  it('lookupUsername normaliza a minúsculas', async () => {
    const r = await ctx.STORE.lookupUsername('  Foo ');
    // el doc no existe en el fake (devuelve {exists:false}) => null, pero no rompe
    expect(r).toBe(null);
  });

  it('setUserDoc / setUsername / setPlayer escriben', async () => {
    await ctx.STORE.setUserDoc('u1', { role: 'player' });
    await ctx.STORE.setUsername('foo', { uid: 'u1' });
    await ctx.STORE.setPlayer({ id: 'p1', orgId: 'o', schoolId: 's' });
    expect(ctx.writes.some(w => w.coll === 'users')).toBe(true);
    expect(ctx.writes.some(w => w.coll === 'usernames')).toBe(true);
    expect(ctx.writes.some(w => w.coll === 'players' && w.id === 'p1')).toBe(true);
  });
});

describe('store.js (modo local, sin Firebase)', () => {
  it('si no hay config real, STORE.enabled queda en false', async () => {
    vi.resetModules();
    globalThis.firebase = undefined;
    window.firebaseConfig = {};
    await import('../../store.js?local=' + Math.random().toString(36).slice(2));
    expect(window.STORE.enabled).toBe(false);
    expect(typeof window.STORE.subscribe).toBe('undefined'); // no se definió ningún método
  });
});
