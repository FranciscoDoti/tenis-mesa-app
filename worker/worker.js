/*
 * Cloudflare Worker — pasarela de pagos MercadoPago para la app de Tenis de Mesa.
 *
 * Qué hace (Opción 2, cobro online seguro y gratis, sin Blaze):
 *  1) POST /create-preference  → crea una preferencia de pago de MercadoPago y devuelve el link.
 *  2) POST /webhook            → MercadoPago avisa cuando un pago se aprueba; acá marcamos la
 *                                inscripción como pagada en Firestore y guardamos el registro
 *                                para el historial. ESTE es el paso que hace que se marque "solo".
 *  3) GET  /                   → healthcheck.
 *
 * No usa firebase-admin (no corre en Workers): habla con Firestore por su API REST, autenticándose
 * con una cuenta de servicio (JWT RS256 firmado con Web Crypto).
 *
 * Secrets que necesita (wrangler secret put NOMBRE):
 *   FIREBASE_PROJECT_ID     - id del proyecto Firebase
 *   FIREBASE_CLIENT_EMAIL   - client_email del JSON de la cuenta de servicio
 *   FIREBASE_PRIVATE_KEY    - private_key del JSON (con los \n; pegalo tal cual)
 * Var pública (wrangler.toml [vars]):
 *   APP_URL                 - URL de la app (para volver tras pagar). Ej: https://tu-usuario.github.io/tenis-mesa-app/
 *
 * Los datos viven en Firestore como documentos { id, j: "<JSON>" } (igual que la app).
 */

const FS_BASE = pid => `https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents`;
const MP_API = 'https://api.mercadopago.com';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    try {
      if (req.method === 'GET' && url.pathname === '/') return json({ ok: true, service: 'tenis-mesa pagos' });
      if (req.method === 'POST' && url.pathname === '/create-preference') return await createPreference(req, env, url);
      if (req.method === 'POST' && url.pathname === '/create-account') return await createAccount(req, env);
      if (req.method === 'POST' && url.pathname === '/delete-account') return await deleteAccount(req, env);
      if (req.method === 'POST' && url.pathname === '/webhook') return await handleWebhook(req, env, url);
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500);
    }
  },
};

/* ---------- crear preferencia de pago ---------- */
async function createPreference(req, env, url) {
  const { tournamentId, categoryId, entrantId } = await req.json();
  if (!tournamentId || !categoryId || !entrantId) return json({ error: 'faltan datos' }, 400);

  const token = await getAccessToken(env);
  const tournament = await readBlob(env, token, 'tournaments', tournamentId);
  if (!tournament) return json({ error: 'torneo no encontrado' }, 404);
  const cat = (tournament.categorias || []).find(c => c.id === categoryId);
  if (!cat) return json({ error: 'categoría no encontrada' }, 404);
  const amount = Number(cat.cost) || 0;
  if (amount <= 0) return json({ error: 'la categoría no tiene costo' }, 400);
  if (!tournament.payAccountId) return json({ error: 'el torneo no tiene cuenta de cobro' }, 400);

  const acct = await readBlob(env, token, 'payAccounts', tournament.payAccountId);
  if (!acct || !acct.token) return json({ error: 'cuenta de cobro sin token' }, 400);

  const entrant = (cat.entrants || []).find(e => e.id === entrantId);
  const title = `Inscripción ${cat.name} — ${tournament.name}`;
  const self = `${url.protocol}//${url.host}`;
  const appUrl = env.APP_URL || self;

  // Llamada a MercadoPago con el token de ESA cuenta → la plata va a esa cuenta.
  const pref = {
    items: [{ title, quantity: 1, unit_price: amount, currency_id: 'ARS' }],
    external_reference: `${tournamentId}|${categoryId}|${entrantId}`,
    notification_url: `${self}/webhook?acct=${encodeURIComponent(tournament.payAccountId)}`,
    back_urls: { success: appUrl, failure: appUrl, pending: appUrl },
    auto_return: 'approved',
    metadata: { tournamentId, categoryId, entrantId },
  };
  const r = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${acct.token}` },
    body: JSON.stringify(pref),
  });
  const data = await r.json();
  if (!r.ok) return json({ error: 'mercadopago', detail: data }, 502);
  return json({ init_point: data.init_point, id: data.id });
}

/* ---------- crear cuenta de acceso de un jugador (alta por admin) ----------
   El admin no puede crear la cuenta desde el navegador (lo deslogearía). Acá:
   1) verificamos que quien llama sea admin (su idToken + su rol en Firestore),
   2) creamos la cuenta de Firebase Auth con una contraseña aleatoria,
   3) escribimos el doc users/{uid} y el índice usernames/{username},
   4) le mandamos un email de "poner contraseña" (PASSWORD_RESET). Completar ese
      reset también deja el email VERIFICADO en Firebase.
   Necesita el secret FIREBASE_API_KEY (la API key web pública del proyecto). */
async function createAccount(req, env) {
  const { idToken, email, name, playerId, username, orgId, schoolId } = await req.json();
  if (!idToken || !email || !playerId) return json({ error: 'faltan datos' }, 400);
  const apiKey = env.FIREBASE_API_KEY;
  if (!apiKey) return json({ error: 'worker sin FIREBASE_API_KEY' }, 500);
  // 1) ¿quien llama es admin? validamos su idToken y leemos su rol
  let who; try { who = await idtPost(apiKey, 'accounts:lookup', { idToken }); } catch (e) { return json({ error: 'sesión inválida' }, 401); }
  const adminUid = who.users && who.users[0] && who.users[0].localId;
  if (!adminUid) return json({ error: 'sesión inválida' }, 401);
  const token = await getAccessToken(env);
  const role = await readUserRole(env, token, adminUid);
  if (role !== 'admin' && role !== 'superadmin') return json({ error: 'no autorizado' }, 403);
  // 2) crear la cuenta con contraseña aleatoria (no la conoce nadie; el jugador la fija por email).
  //    Si el email YA existía (p. ej. un intento previo que creó la cuenta pero no mandó el mail),
  //    no es error: seguimos y le reenviamos el "poné tu contraseña" (idempotente).
  const S = v => ({ stringValue: String(v) });
  let uid = null, existed = false;
  try { const su = await idtPost(apiKey, 'accounts:signUp', { email: String(email).trim(), password: randomPassword(), returnSecureToken: false }); uid = su.localId; }
  catch (e) { if (e.message === 'EMAIL_EXISTS') existed = true; else return json({ error: 'auth: ' + e.message }, 400); }
  // 3) doc de usuario + índice de username (solo si recién la creamos; campos nativos como espera la app)
  if (uid) {
    await writeDoc(env, token, 'users/' + uid, {
      role: S('player'), name: S(name || ''), playerId: S(playerId), email: S(email),
      emailVerified: { booleanValue: false }, username: username ? S(username) : { nullValue: null },
      orgId: orgId ? S(orgId) : { nullValue: null }, schoolId: schoolId ? S(schoolId) : { nullValue: null },
    });
    if (username) await writeDoc(env, token, 'usernames/' + String(username).toLowerCase(), { uid: S(uid), email: S(email) });
  }
  // 4) email para fijar la contraseña (al completarlo, el email queda verificado).
  //    Probamos CON continueUrl (vuelve a la app); si el dominio no está autorizado, reintentamos SIN él.
  const base = { requestType: 'PASSWORD_RESET', email: String(email).trim() };
  let emailSent = false, emailError = null;
  try { await idtPost(apiKey, 'accounts:sendOobCode', env.APP_URL ? { ...base, continueUrl: env.APP_URL } : base); emailSent = true; }
  catch (e) {
    try { await idtPost(apiKey, 'accounts:sendOobCode', base); emailSent = true; emailError = 'enviado sin redirección a la app (' + e.message + ')'; }
    catch (e2) { emailError = e2.message; }
  }
  console.log('create-account', JSON.stringify({ uid, existed, email, emailSent, emailError }));
  return json({ ok: true, uid, existed, emailSent, emailError });
}
/* ---------- borrar la cuenta de acceso de un jugador (al eliminarlo) ----------
   Borra la cuenta de Firebase Auth por uid (o por email, para limpiar huérfanas).
   Requiere que la cuenta de servicio pueda administrar Auth (la del Admin SDK ya lo trae;
   si diera 403, hay que darle el rol "Firebase Authentication Admin" en Google Cloud IAM). */
async function deleteAccount(req, env) {
  const { idToken, uid, email } = await req.json();
  if (!idToken || (!uid && !email)) return json({ error: 'faltan datos' }, 400);
  const apiKey = env.FIREBASE_API_KEY;
  if (!apiKey) return json({ error: 'worker sin FIREBASE_API_KEY' }, 500);
  let who; try { who = await idtPost(apiKey, 'accounts:lookup', { idToken }); } catch (e) { return json({ error: 'sesión inválida' }, 401); }
  const adminUid = who.users && who.users[0] && who.users[0].localId;
  if (!adminUid) return json({ error: 'sesión inválida' }, 401);
  const role = await readUserRole(env, await getAccessToken(env), adminUid);
  if (role !== 'admin' && role !== 'superadmin') return json({ error: 'no autorizado' }, 403);
  const adminToken = await getAdminToken(env);
  const PROJ = `https://identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}`;
  let targetUid = uid;
  if (!targetUid && email) {
    const lr = await fetch(`${PROJ}/accounts:lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ email: [String(email).trim()] }) });
    const ld = await lr.json().catch(() => ({}));
    targetUid = ld.users && ld.users[0] && ld.users[0].localId;
  }
  if (!targetUid) return json({ ok: true, deleted: false, note: 'no había cuenta de Auth' });
  const r = await fetch(`${PROJ}/accounts:delete`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ localId: targetUid }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { console.log('delete-account', JSON.stringify({ targetUid, error: (d.error && d.error.message) })); return json({ error: (d.error && d.error.message) || ('HTTP ' + r.status) }, 502); }
  console.log('delete-account', JSON.stringify({ targetUid, deleted: true }));
  return json({ ok: true, deleted: true });
}
async function readUserRole(env, token, uid) {
  const r = await fetch(`${FS_BASE(env.FIREBASE_PROJECT_ID)}/users/${uid}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const doc = await r.json();
  return (doc.fields && doc.fields.role && doc.fields.role.stringValue) || null;
}
async function writeDoc(env, token, path, fields) {
  const r = await fetch(`${FS_BASE(env.FIREBASE_PROJECT_ID)}/${path}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fields }),
  });
  return r.ok;
}
async function idtPost(apiKey, method, body) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/${method}?key=${apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error((d.error && d.error.message) || ('HTTP ' + r.status));
  return d;
}
function randomPassword() {
  const a = new Uint8Array(18); crypto.getRandomValues(a);
  return 'Aa1!' + b64url(a); // larga y con complejidad mínima; el jugador la reemplaza
}

/* ---------- webhook: confirmar pago ---------- */
async function handleWebhook(req, env, url) {
  const acctId = url.searchParams.get('acct');
  let body = {};
  try { body = await req.json(); } catch (e) {}
  // MP manda el id del pago de varias formas según la versión del webhook
  const paymentId = (body.data && body.data.id) || url.searchParams.get('data.id') || body.id;
  const type = body.type || url.searchParams.get('type');
  if (type && type !== 'payment') return json({ ok: true, ignored: type });
  if (!paymentId || !acctId) return json({ ok: true, note: 'sin paymentId/acct' });

  const token = await getAccessToken(env);
  const acct = await readBlob(env, token, 'payAccounts', acctId);
  if (!acct || !acct.token) return json({ ok: true, note: 'cuenta no encontrada' });

  // Verificamos el pago consultándolo a MP (no confiamos en el body crudo).
  const pr = await fetch(`${MP_API}/v1/payments/${paymentId}`, { headers: { Authorization: `Bearer ${acct.token}` } });
  const pay = await pr.json();
  if (!pr.ok) return json({ ok: true, note: 'pago no consultable' });
  if (pay.status !== 'approved') return json({ ok: true, status: pay.status });

  const [tournamentId, categoryId, entrantId] = String(pay.external_reference || '').split('|');
  if (!tournamentId || !entrantId) return json({ ok: true, note: 'sin external_reference' });

  // IMPORTANTE: NO modificamos el torneo (evita pisar/borrar inscriptos por carreras con la app).
  // Solo LEEMOS para enriquecer el registro; el "pagado" lo deduce la app desde la colección payments.
  const tournament = await readBlob(env, token, 'tournaments', tournamentId);
  const cat = tournament && (tournament.categorias || []).find(c => c.id === categoryId);
  const entrant = cat && (cat.entrants || []).find(e => e.id === entrantId);
  const playerId = entrant && entrant.players ? entrant.players[0] : null;
  let playerName = '';
  if (playerId) { const pl = await readBlob(env, token, 'players', playerId); if (pl) playerName = `${pl.firstName || ''} ${pl.lastName || ''}`.trim(); }

  // Registro para el historial (idempotente: doc id = id del pago de MP).
  const record = {
    id: 'mp_' + paymentId, mpPaymentId: String(paymentId), tournamentId, tournamentName: (tournament && tournament.name) || '',
    categoryId, categoryName: (cat && cat.name) || '', entrantId, playerId, playerName,
    amount: Number(pay.transaction_amount) || 0, status: 'approved', payerEmail: (pay.payer && pay.payer.email) || '',
    createdAt: pay.date_approved || new Date().toISOString(),
    orgId: (tournament && tournament.orgId) || null, schoolId: (tournament && tournament.schoolId) || null,
  };
  await writeBlob(env, token, 'payments', record.id, record);
  return json({ ok: true, recorded: true });
}

/* ---------- Firestore REST (blobs { id, j }) ---------- */
async function readBlob(env, token, coll, id) {
  const r = await fetch(`${FS_BASE(env.FIREBASE_PROJECT_ID)}/${coll}/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const doc = await r.json();
  const j = doc.fields && doc.fields.j && doc.fields.j.stringValue;
  try { return j ? JSON.parse(j) : null; } catch (e) { return null; }
}
async function writeBlob(env, token, coll, id, obj) {
  // Conserva los campos nativos que la app/reglas esperan, además del blob `j`.
  const fields = { id: { stringValue: id }, j: { stringValue: JSON.stringify(obj) } };
  if (coll === 'tournaments') {
    fields.collaborators = { arrayValue: { values: (obj.collaborators || []).map(v => ({ stringValue: String(v) })) } };
    fields.published = { booleanValue: !!obj.published };
  }
  if (coll === 'payments') {
    if (obj.orgId) fields.orgId = { stringValue: obj.orgId };
    if (obj.schoolId) fields.schoolId = { stringValue: obj.schoolId };
  }
  const r = await fetch(`${FS_BASE(env.FIREBASE_PROJECT_ID)}/${coll}/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fields }),
  });
  return r.ok;
}

/* ---------- auth: access token de la cuenta de servicio (JWT RS256), cacheado por scope ---------- */
const _tokCache = {};
async function mintToken(env, scope) {
  const now = Math.floor(Date.now() / 1000);
  const c = _tokCache[scope];
  if (c && now < c.exp - 60) return c.tok;
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = { iss: env.FIREBASE_CLIENT_EMAIL, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 };
  const enc = o => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc(header)}.${enc(claim)}`;
  const key = await importKey(env.FIREBASE_PRIVATE_KEY);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(new Uint8Array(sig))}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await r.json();
  if (!data.access_token) throw new Error('no access_token: ' + JSON.stringify(data));
  _tokCache[scope] = { tok: data.access_token, exp: now + (data.expires_in || 3600) };
  return data.access_token;
}
// Token para Firestore (igual que antes) y token para administrar Auth (borrar cuentas).
const getAccessToken = env => mintToken(env, 'https://www.googleapis.com/auth/datastore');
const getAdminToken = env => mintToken(env, 'https://www.googleapis.com/auth/cloud-platform');
async function importKey(pem) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}
function b64url(bytes) {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
