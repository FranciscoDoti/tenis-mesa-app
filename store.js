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
  const BLOBS = ['players', 'gyms', 'tournaments'];
  const strip = o => JSON.parse(JSON.stringify(o, (k, v) => (k.startsWith('_') ? undefined : v)));
  const docFor = (coll, o) => {
    const clean = strip(o);
    const d = { id: o.id, j: JSON.stringify(clean) };
    if (coll === 'tournaments') { d.collaborators = clean.collaborators || []; d.published = !!clean.published; }
    return d;
  };

  STORE.loadAll = async function () {
    const [pl, gy, to, us, st] = await Promise.all([
      db.collection('players').get(), db.collection('gyms').get(), db.collection('tournaments').get(),
      db.collection('users').get(), db.doc('app/settings').get(),
    ]);
    const parse = snap => snap.docs.map(d => JSON.parse(d.data().j));
    return {
      players: parse(pl), gyms: parse(gy), tournaments: parse(to),
      users: us.docs.map(d => ({ uid: d.id, ...d.data() })),
      settings: st.exists ? JSON.parse(st.data().j) : null,
      empty: pl.empty && gy.empty && to.empty,
    };
  };

  // Estado base para el diff (se llama tras loadAll y tras cada sync).
  let _last = { players: {}, gyms: {}, tournaments: {} };
  STORE.primeLast = function (data) {
    BLOBS.forEach(c => { _last[c] = {}; (data[c] || []).forEach(o => { _last[c][o.id] = JSON.stringify(strip(o)); }); });
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
    if (data.settings) ops.push(db.doc('app/settings').set({ j: JSON.stringify(strip(data.settings)) }));
    return Promise.all(ops).catch(e => console.error('sync', e));
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
