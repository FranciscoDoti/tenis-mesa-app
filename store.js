/* Capa de datos: Firestore + Firebase Auth.
   Si no hay config real y no estamos en localhost, STORE.enabled = false y la app
   usa el modo local (localStorage + login simple) como antes. */
(function () {
  const STORE = (window.STORE = { enabled: false });
  const cfg = window.firebaseConfig || {};
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const isPlaceholder = cfg.projectId === 'demo-tenis-mesa';
  // En la nube real necesitamos config propia; en localhost alcanza el emulador.
  const useFirebase = typeof firebase !== 'undefined' && cfg.apiKey && (local || !isPlaceholder);
  if (!useFirebase) return; // modo local

  firebase.initializeApp(cfg);
  const auth = firebase.auth();
  const db = firebase.firestore();
  STORE.enabled = true; STORE.auth = auth; STORE.db = db; STORE.emulator = local;
  if (local) {
    try { auth.useEmulator('http://127.0.0.1:9099', { disableWarnings: true }); } catch (e) {}
    try { db.useEmulator('127.0.0.1', 8080); } catch (e) {}
  }

  /* Las colecciones players/gyms/tournaments y los ajustes se guardan como
     blob JSON (Firestore no admite arrays anidados como los sets/brackets).
     Los torneos llevan además `collaborators` y `published` como campos nativos
     para que las reglas de seguridad puedan leerlos. La colección users es nativa. */
  const BLOBS = ['players', 'gyms', 'tournaments', 'news', 'payAccounts'];
  const strip = o => JSON.parse(JSON.stringify(o, (k, v) => (k.startsWith('_') ? undefined : v)));
  const docFor = (coll, o) => {
    const clean = strip(o);
    const d = { id: o.id, j: JSON.stringify(clean) };
    if (coll === 'tournaments') { d.collaborators = clean.collaborators || []; d.published = !!clean.published; }
    // Cuentas de cobro: dueño/escuela como campos nativos para que las reglas restrinjan la lectura
    // (el token de MercadoPago es secreto: solo el dueño/superadmin y el Worker deben poder leerlo).
    if (coll === 'payAccounts') { d.ownerUid = clean.ownerUid || null; d.orgId = clean.orgId || null; d.schoolId = clean.schoolId || null; }
    return d;
  };

  STORE.loadAll = async function () {
    // payAccounts: el token es secreto → cada uno lee SOLO las suyas (consulta scopeada por dueño).
    // Tolerante a fallo: un jugador no tiene permiso y debe recibir [] sin romper la carga.
    const paGet = auth.currentUser
      ? db.collection('payAccounts').where('ownerUid', '==', auth.currentUser.uid).get().catch(() => ({ docs: [] }))
      : Promise.resolve({ docs: [] });
    // payments: historial (lo escribe el Worker). Solo lo leen los admins; el jugador recibe [] sin romper.
    const payGet = db.collection('payments').get().catch(() => ({ docs: [] }));
    const [pl, gy, to, ne, us, pa, py, st] = await Promise.all([
      db.collection('players').get(), db.collection('gyms').get(), db.collection('tournaments').get(),
      db.collection('news').get(), db.collection('users').get(), paGet, payGet, db.doc('app/settings').get(),
    ]);
    const parse = snap => snap.docs.map(d => JSON.parse(d.data().j));
    return {
      players: parse(pl), gyms: parse(gy), tournaments: parse(to), news: parse(ne),
      users: us.docs.map(d => ({ uid: d.id, ...d.data() })),
      payAccounts: parse(pa), payments: parse(py),
      settings: st.exists ? JSON.parse(st.data().j) : null,
      empty: pl.empty && gy.empty && to.empty,
    };
  };

  // Lee solo los ajustes (incluye el tema) — pensado para usar SIN login, p. ej. para pintar el
  // tema publicado en la pantalla de inicio. Requiere que las reglas permitan leer app/settings
  // públicamente; si no, devuelve null sin romper nada.
  STORE.loadPublicSettings = async function () {
    try { const d = await db.doc('app/settings').get(); return d.exists ? JSON.parse(d.data().j) : null; }
    catch (e) { return null; }
  };

  // Estado base para el diff (se llama tras loadAll y tras cada sync).
  let _last = { players: {}, gyms: {}, tournaments: {}, news: {} };
  STORE.primeLast = function (data) {
    BLOBS.forEach(c => { _last[c] = {}; (data[c] || []).forEach(o => { _last[c][o.id] = JSON.stringify(strip(o)); }); });
    _last.__settings = data.settings ? JSON.stringify(strip(data.settings)) : null;
  };
  // Escribe solo lo que cambió y borra lo que ya no está.
  STORE.sync = async function (data) {
    const ops = [];
    BLOBS.forEach(c => {
      const cur = {};
      (data[c] || []).forEach(o => { const s = JSON.stringify(strip(o)); cur[o.id] = s; if (_last[c][o.id] !== s) ops.push(db.collection(c).doc(o.id).set(docFor(c, o))); });
      Object.keys(_last[c]).forEach(id => { if (!(id in cur)) ops.push(db.collection(c).doc(id).delete()); });
      _last[c] = cur;
    });
    // Ajustes: escribir SOLO si cambiaron (si no, un colaborador/jugador chocaría con la regla admin-only).
    if (data.settings) { const s = JSON.stringify(strip(data.settings)); if (s !== _last.__settings) { ops.push(db.doc('app/settings').set({ j: s })); _last.__settings = s; } }
    return Promise.all(ops).catch(e => console.error('sync', e));
  };

  // Suscripción en tiempo real: llama onChange(coll, data) cada vez que cambia una colección en la nube
  // (la propia o por otro dispositivo). Devuelve una función para desuscribirse. Tolera errores de permiso
  // (p. ej. un jugador no puede leer payAccounts/payments → ese listener simplemente no entrega datos).
  STORE.subscribe = function (onChange) {
    if (!STORE.enabled) return function () {};
    const unsubs = [];
    const parse = snap => snap.docs.map(d => { try { return JSON.parse(d.data().j); } catch (e) { return null; } }).filter(Boolean);
    const watch = (coll, ref) => unsubs.push(ref.onSnapshot(s => { try { onChange(coll, parse(s)); } catch (e) {} }, function () {}));
    ['players', 'gyms', 'tournaments', 'news', 'payments'].forEach(c => watch(c, db.collection(c)));
    if (auth.currentUser) watch('payAccounts', db.collection('payAccounts').where('ownerUid', '==', auth.currentUser.uid));
    unsubs.push(db.collection('users').onSnapshot(s => { try { onChange('users', s.docs.map(d => ({ uid: d.id, ...d.data() }))); } catch (e) {} }, function () {}));
    unsubs.push(db.doc('app/settings').onSnapshot(d => { try { onChange('settings', d.exists ? JSON.parse(d.data().j) : null); } catch (e) {} }, function () {}));
    return function () { unsubs.forEach(u => { try { u(); } catch (e) {} }); };
  };

  // ---- auth ----
  const APP_URL = location.origin + location.pathname.replace(/[^/]*$/, ''); // base de la app (para volver al login)
  STORE.onAuth = cb => auth.onAuthStateChanged(cb);
  STORE.signIn = (email, pwd) => auth.signInWithEmailAndPassword(email.trim(), pwd);
  STORE.signUp = (email, pwd) => auth.createUserWithEmailAndPassword(email.trim(), pwd);
  STORE.signOut = () => auth.signOut();
  STORE.resetPassword = async email => { email = email.trim(); try { await auth.sendPasswordResetEmail(email, { url: APP_URL }); } catch (e) { await auth.sendPasswordResetEmail(email); } };
  STORE.updatePassword = pwd => auth.currentUser.updatePassword(pwd);
  STORE.uid = () => auth.currentUser && auth.currentUser.uid;
  STORE.idToken = () => auth.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null); // para autenticar llamadas al worker
  STORE.setPlayer = p => db.collection('players').doc(p.id).set(docFor('players', p));
  STORE.getUserDoc = async uid => { const d = await db.doc('users/' + uid).get(); return d.exists ? { uid, ...d.data() } : null; };
  STORE.setUserDoc = (uid, data) => db.doc('users/' + uid).set(data, { merge: true });
  STORE.delUserDoc = uid => db.doc('users/' + uid).delete();
  // índice público usuario→email para poder loguear con nombre de usuario (estando deslogueado)
  STORE.lookupUsername = async u => { try { const d = await db.doc('usernames/' + u.trim().toLowerCase()).get(); return d.exists ? d.data() : null; } catch (e) { return null; } };
  STORE.setUsername = (u, data) => db.doc('usernames/' + u.trim().toLowerCase()).set(data);
  STORE.delUsername = u => db.doc('usernames/' + u.trim().toLowerCase()).delete();
  // verificación de email (nativa: manda el mail; al verificar redirige a la app/login)
  STORE.sendVerification = async () => { const u = auth.currentUser; if (!u) throw new Error('no-user'); try { await u.sendEmailVerification({ url: APP_URL }); } catch (e) { await u.sendEmailVerification(); } };
  STORE.reloadUser = () => { const u = auth.currentUser; return u ? u.reload() : Promise.resolve(); };
  STORE.isEmailVerified = () => !!(auth.currentUser && auth.currentUser.emailVerified);
  // Errores de auth en español
  STORE.authMsg = code => ({
    'auth/invalid-email': 'El email no es válido.',
    'auth/user-not-found': 'No existe una cuenta con ese email.',
    'auth/wrong-password': 'Contraseña incorrecta.',
    'auth/invalid-credential': 'Email o contraseña incorrectos.',
    'auth/email-already-in-use': 'Ya existe una cuenta con ese email.',
    'auth/weak-password': 'La contraseña es muy corta (mínimo 6 caracteres).',
    'auth/too-many-requests': 'Demasiados intentos. Probá más tarde.',
  }[code] || 'No se pudo completar la operación.');
})();
