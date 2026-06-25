/* Crea cuentas de Auth (email + usuario) para los jugadores que NO tienen cuenta,
   y las marca como VERIFICADAS, sin que el jugador tenga que hacer nada.

   Requiere una "service account" del proyecto:
     Firebase Console → ⚙️ Configuración del proyecto → Cuentas de servicio →
     "Generar nueva clave privada" → guardar el archivo como  serviceAccountKey.json
     en la raíz del proyecto (al lado de este package.json). ¡NO lo subas a git!

   Uso:   node scripts/seed-accounts.js
   (opcional) cambiar el dominio de los emails de prueba con la variable EMAIL_DOMAIN.
*/
const admin = require('firebase-admin');
const path = require('path');

let sa;
try { sa = require(path.join(__dirname, '..', 'serviceAccountKey.json')); }
catch (e) {
  console.error('\n❌ No encontré serviceAccountKey.json en la raíz del proyecto.');
  console.error('   Descargalo de la consola (Cuentas de servicio → Generar clave privada) y guardalo ahí.\n');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const auth = admin.auth();

const PASSWORD = process.env.SEED_PASSWORD || 'tenis1234';          // contraseña para todas las cuentas de prueba
const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN || 'tenismesa.test';   // dominio de los emails de prueba

const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function main() {
  const [pSnap, uSnap, nSnap] = await Promise.all([
    db.collection('players').get(),
    db.collection('users').get(),
    db.collection('usernames').get(),
  ]);
  const players = pSnap.docs.map(d => JSON.parse(d.data().j));
  const playersWithAccount = new Set(uSnap.docs.map(d => d.data().playerId).filter(Boolean));
  const taken = new Set(nSnap.docs.map(d => d.id));
  uSnap.docs.forEach(d => { const un = d.data().username; if (un) taken.add(un); });

  const created = [];
  for (const p of players) {
    if (playersWithAccount.has(p.id)) continue;             // ya tiene cuenta → saltar
    const full = `${p.firstName || ''} ${p.lastName || ''}`.trim();
    let base = (norm(p.firstName)[0] || '') + norm(p.lastName);
    if (base.length < 3) base = (base || 'jugador') + 'x';
    let username = base, i = 2;
    while (taken.has(username)) { username = base + i; i++; }
    taken.add(username);
    const email = `${username}@${EMAIL_DOMAIN}`;

    let uid;
    try {
      const u = await auth.createUser({ email, password: PASSWORD, emailVerified: true, displayName: full });
      uid = u.uid;
    } catch (e) {
      if (e.code === 'auth/email-already-exists') { const u = await auth.getUserByEmail(email); uid = u.uid; await auth.updateUser(uid, { emailVerified: true }); }
      else { console.error(`  ⚠️  ${full}: ${e.message}`); continue; }
    }

    await db.doc('users/' + uid).set({ role: 'player', name: full, playerId: p.id, email, emailVerified: true });
    await db.doc('usernames/' + username).set({ uid, email });
    created.push({ full, username, email });
  }

  console.log(`\n✅ Cuentas creadas/verificadas: ${created.length}\n`);
  created.forEach(c => console.log(`   ${c.full.padEnd(28)}  usuario: ${c.username.padEnd(18)}  email: ${c.email}`));
  console.log(`\n   🔑 Contraseña para todas: ${PASSWORD}\n   (cada uno puede cambiarla después con "¿Olvidaste tu contraseña?" si su email es real.)\n`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
