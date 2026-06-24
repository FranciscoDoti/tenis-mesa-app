/* 🏓 Tenis de Mesa — Dina Huapi & Bariloche — MVP v3 (vanilla JS + localStorage) */
'use strict';

const CATS = ['1ra', '2da', '3ra', '4ta'];
const CITIES = ['Dina Huapi', 'Bariloche'];
const KEY = 'ttdb.v3';

const uid = p => p + Math.random().toString(36).slice(2, 9);

/* Catálogo de categorías de torneo (sub-torneos) con sus reglas de inscripción.
   - level L: sólo jugadores de categoría L o SUPERIOR (un 1ra no puede bajar a 2da/3ra/4ta).
   - maxAge N: nadie mayor de N años (Sub).
   - minAge N: nadie menor de N años (Maxi).
   - open: cualquiera. */
const CATALOG = [
  { name: 'Primera', rule: { type: 'level', level: 1 } },
  { name: 'Segunda', rule: { type: 'level', level: 2 } },
  { name: 'Tercera', rule: { type: 'level', level: 3 } },
  { name: 'Cuarta', rule: { type: 'level', level: 4 } },
  { name: 'Sub 11', rule: { type: 'maxAge', age: 11 } },
  { name: 'Sub 13', rule: { type: 'maxAge', age: 13 } },
  { name: 'Sub 15', rule: { type: 'maxAge', age: 15 } },
  { name: 'Sub 17', rule: { type: 'maxAge', age: 17 } },
  { name: 'Sub 23', rule: { type: 'maxAge', age: 23 } },
  { name: 'Mayores', rule: { type: 'range', min: 23, max: 30 } },
  { name: 'Todo Competidor', rule: { type: 'open' } },
  { name: 'Maxi 30', rule: { type: 'range', min: 30, max: 39 } },
  { name: 'Maxi 40', rule: { type: 'range', min: 40, max: 49 } },
  { name: 'Maxi 50', rule: { type: 'range', min: 50, max: 59 } },
  { name: 'Maxi 60', rule: { type: 'range', min: 60, max: 69 } },
  { name: 'Maxi 70', rule: { type: 'minAge', age: 70 } },
];
const catalogRule = name => (CATALOG.find(c => c.name === name) || {}).rule || { type: 'open' };
const ordinal = n => ['', '1ª', '2ª', '3ª', '4ª'][n] || n + 'ª';
function ruleLabel(rule) {
  if (!rule || rule.type === 'open') return 'Libre';
  if (rule.type === 'level') return `${ordinal(rule.level)} o superior`;
  if (rule.type === 'maxAge') return `hasta ${rule.age} años`;
  if (rule.type === 'minAge') return `${rule.age}+ años`;
  if (rule.type === 'range') return `${rule.min} a ${rule.max} años`;
  return 'Libre';
}
function ageFromDob(dob) {
  if (!dob) return null;
  const b = new Date(dob + 'T00:00:00'), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  const m = n.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--;
  return a;
}
function eligible(cat, p) {
  const r = cat.rule; if (!r || r.type === 'open') return { ok: true };
  if (r.type === 'level') {
    const lvl = CATS.indexOf(p.category) + 1; if (lvl <= 0) return { ok: true };
    return lvl >= r.level ? { ok: true } : { ok: false, reason: `${cat.name} no admite categorías inferiores: ${fullName(p)} es de ${p.category}.` };
  }
  const age = ageFromDob(p.dob);
  if (age == null) return { ok: false, reason: `Falta fecha de nacimiento de ${fullName(p)}.` };
  if (r.type === 'maxAge') return age <= r.age ? { ok: true } : { ok: false, reason: `${cat.name}: ${fullName(p)} tiene ${age} años (máx ${r.age}).` };
  if (r.type === 'minAge') return age >= r.age ? { ok: true } : { ok: false, reason: `${cat.name}: ${fullName(p)} tiene ${age} años (mín ${r.age}).` };
  if (r.type === 'range') return (age >= r.min && age <= r.max) ? { ok: true } : { ok: false, reason: `${cat.name}: ${fullName(p)} tiene ${age} años (debe ser ${r.min}–${r.max}).` };
  return { ok: true };
}

/* ---------------- seed ---------------- */
function defaultGyms() {
  return [
    { id: uid('g_'), name: 'Muni 3', address: 'Santiago de Chile 499-599, R8400 San Carlos de Bariloche, Río Negro' },
    { id: uid('g_'), name: 'Poli Dina Huapi', address: 'Jamaica 245, R8402 Dina Huapi, Río Negro' },
    { id: uid('g_'), name: 'La Casa del Deporte', address: 'Av. 12 de Octubre 282-316, R8400 San Carlos de Bariloche, Río Negro' },
  ];
}
// usuario = inicial del nombre + apellido, en minúsculas y sin acentos/espacios. Ej: El Peque -> "epeque"
function usernameFor(p) {
  return (((p.firstName || '').trim()[0] || '') + (p.lastName || '').replace(/\s+/g, ''))
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
// crea una cuenta por jugador que no tenga una (rol player, password = username). Devuelve cuántas agregó.
function ensurePlayerUsers() {
  if (!DB.users) DB.users = [];
  const taken = new Set(DB.users.map(u => u.username));
  let added = 0;
  DB.players.forEach(p => {
    if (DB.users.some(u => u.playerId === p.id)) return;
    let base = usernameFor(p) || 'jugador', un = base, i = 2;
    while (taken.has(un)) { un = base + i; i++; }
    taken.add(un);
    DB.users.push({ username: un, password: un, role: 'player', name: fullName(p), playerId: p.id });
    added++;
  });
  return added;
}
// Categoría de escalafón derivada por puntos (solo 1ra/2da/3ra/4ta ascienden/descienden).
function levelFromPoints(pts) { pts = pts || 0; return pts > 800 ? '1ra' : pts > 600 ? '2da' : pts > 300 ? '3ra' : '4ta'; }
function syncCategory(p) { p.category = levelFromPoints(p.points); return p; }
const NEW_PLAYER_POINTS = 150;
// Puntos iniciales para los jugadores de ejemplo (una sola vez) — deja el ranking armado.
function migrateInitialPoints() {
  if (DB._initPointsV1) return 0;
  const map = { 'Sabrina Bodnar': 950, 'Victoria Cordoba': 860, 'Dimas Faisca': 720, 'Leonardo Fabian Mallea': 640, 'Emmanuel Paez': 520, 'El Peque': 360, 'Jose Crnak': 410, 'Jorge Gonzalez': 280, 'Paulina Gonzalez': 330, 'Victoria Martinez': 150, 'Aldana Gonzalez': 90, 'Ignacio Asenjo': 220 };
  DB.players.forEach(p => { const k = fullName(p); if (map[k] != null) p.points = map[k]; else if (!p.points) p.points = NEW_PLAYER_POINTS; });
  DB._initPointsV1 = true;
  return 1;
}
// Redistribución de puntos iniciales (una vez): Jorge 1º del ranking, Paulina a 4ta, resto variado.
function migratePointsRedistribute() {
  if (DB._pointsRedistV1) return 0;
  const map = {
    'Jorge Gonzalez': 990, 'Sabrina Bodnar': 910, 'Rodrigo Dominguez': 845, 'Matias Prada': 815,
    'Franco Miraglia': 770, 'Victoria Cordoba': 705, 'Dimas Faisca': 680, 'Mateo Espindola': 615,
    'Leonardo Fabian Mallea': 590, 'Brian Obando': 505, 'Emmanuel Paez': 460, 'Javier Gonzalez': 395,
    'Alan Saez': 345, 'El Peque': 320, 'Ignacio Asenjo': 290, 'Julio Retamales': 255,
    'Victoria Martinez': 210, 'Nicolas Treuque': 175, 'Aldana Gonzalez': 140, 'Paulina Gonzalez': 95,
  };
  DB.players.forEach(p => { const v = map[fullName(p)]; if (v != null) p.points = v; });
  DB._pointsRedistV1 = true;
  return 1;
}
function hijaDataUrl() {
  const c = document.createElement('canvas'); c.width = 240; c.height = 240; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 240, 240); g.addColorStop(0, '#c1121f'); g.addColorStop(1, '#7a0c16');
  x.fillStyle = g; x.fillRect(0, 0, 240, 240);
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '900 70px Segoe UI, sans-serif'; x.fillText('HIJA', 120, 110);
  x.font = '600 30px Segoe UI, sans-serif'; x.fillText('🏓', 120, 180);
  return c.toDataURL('image/jpeg', 0.9);
}
// Jugadores de prueba + fotos servidas (browser-agnóstico, versionado). Las fotos viven en /_seedphotos/.
function migrateSeedData() {
  const VER = 2;
  if ((DB._seedDataVer || 0) >= VER) return 0;
  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // 1) quitar jugadores de prueba que ya no van (+ José Crnak): saca jugador, su cuenta y sus inscripciones
  const removeLast = new Set(['quispe', 'maldonado', 'vera', 'ibanez', 'ledesma', 'diaz', 'ruiz', 'acuna', 'crnak']);
  const removeIds = DB.players.filter(p => removeLast.has(norm(p.lastName))).map(p => p.id);
  if (removeIds.length) {
    DB.players = DB.players.filter(p => !removeIds.includes(p.id));
    DB.users = (DB.users || []).filter(u => !removeIds.includes(u.playerId));
    DB.tournaments.forEach(t => t.categorias.forEach(c => {
      const before = c.entrants.length;
      c.entrants = c.entrants.filter(e => !e.players.some(pid => removeIds.includes(pid)));
      if (c.entrants.length !== before) { c.groups = null; c.matches = null; c.bracket = null; c.thirdPlace = null; }
    }));
  }

  // 2) alta del roster de prueba actual (si no existen)
  const roster = [
    ['Matias', 'Prada', 'Bariloche', '1992-05-10', 870], ['Mateo', 'Espindola', 'Dina Huapi', '2001-03-15', 690],
    ['Brian', 'Obando', 'Bariloche', '1998-08-22', 520], ['Franco', 'Miraglia', 'Bariloche', '1995-11-02', 760],
    ['Alan', 'Saez', 'Dina Huapi', '2003-07-19', 340], ['Rodrigo', 'Dominguez', 'Bariloche', '1990-01-30', 910],
    ['Nicolas', 'Treuque', 'Dina Huapi', '2006-09-12', 210], ['Javier', 'Gonzalez', 'Bariloche', '1987-04-05', 450],
    ['Julio', 'Retamales', 'Dina Huapi', '1979-12-20', 280],
  ];
  roster.forEach(([fn, ln, city, dob, pts]) => { if (!DB.players.some(p => p.firstName === fn && p.lastName === ln)) DB.players.push({ id: uid('p_'), firstName: fn, lastName: ln, dob, city, points: pts, category: levelFromPoints(pts), photo: null }); });

  // 3) fotos servidas (browser-agnóstico) a jugadores existentes sin foto
  [['Leonardo Fabian', 'Mallea', 'leo'], ['Victoria', 'Cordoba', 'vickyc'], ['Jorge', 'Gonzalez', 'jorge'], ['Victoria', 'Martinez', 'vickym'], ['Sabrina', 'Bodnar', 'sabri']]
    .forEach(([fn, ln, file]) => { const p = DB.players.find(x => x.firstName === fn && x.lastName === ln); if (p && !p.photo) p.photo = '_seedphotos/' + file + '.png'; });
  const pau = DB.players.find(p => p.firstName === 'Paulina' && p.lastName === 'Gonzalez');
  if (pau && !pau.photo) pau.photo = hijaDataUrl();

  DB._seedDataVer = VER;
  return 1;
}
function seed() {
  const NAMES = [
    ['Sabrina', 'Bodnar', '1ra', 'Bariloche', '2001-03-14'],
    ['Victoria', 'Cordoba', '1ra', 'Dina Huapi', '1998-07-02'],
    ['Dimas', 'Faisca', '1ra', 'Bariloche', '2004-01-20'],
    ['Leonardo Fabian', 'Mallea', '2da', 'Bariloche', '1991-05-10'],
    ['Emmanuel', 'Paez', '2da', 'Dina Huapi', '1996-09-05'],
    ['El', 'Peque', '2da', 'Bariloche', '2014-06-01'],
    ['Jose', 'Crnak', '3ra', 'Dina Huapi', '1981-11-11'],
    ['Jorge', 'Gonzalez', '3ra', 'Bariloche', '1974-04-04'],
    ['Paulina', 'Gonzalez', '3ra', 'Dina Huapi', '2007-08-08'],
    ['Victoria', 'Martinez', '4ta', 'Bariloche', '2012-03-03'],
    ['Aldana', 'Gonzalez', '4ta', 'Dina Huapi', '2010-10-10'],
    ['Ignacio', 'Asenjo', '4ta', 'Bariloche', '1966-12-12'],
  ];
  const players = NAMES.map(([firstName, lastName, category, city, dob]) => ({
    id: uid('p_'), firstName, lastName, dob, city, category, points: 0, photo: null,
  }));
  const mkCat = (name, format, extra = {}) => ({
    id: uid('c_'), name, format, rule: catalogRule(name), rules: { sets: 5, groupMin: 3, groupMax: 4 },
    championPoints: 100, entrants: [], groups: null, matches: null, bracket: null, thirdPlace: null, closed: false, ...extra,
  });
  const mayores = mkCat('Mayores', 'single');
  mayores.entrants = players.slice(0, 8).map(p => ({ id: uid('e_'), players: [p.id] })); // listo para correr la demo
  const gyms = defaultGyms();
  const db = {
    players, gyms,
    tournaments: [{
      id: uid('t_'), name: 'Apertura Patagónico 2026', date: '2026-07-11', dateEnd: '2026-07-12', gymId: gyms[0].id,
      categorias: [mayores, mkCat('Tercera', 'single'), mkCat('Sub 15', 'single'), mkCat('Maxi 40', 'single')],
    }],
    users: [
      { username: 'admin', password: 'admin', role: 'admin', name: 'Administrador' },
      { username: 'jugador', password: 'jugador', role: 'player', name: 'Jugador' },
    ],
  };
  save(db); return db;
}
function load() { try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch (e) {} return seed(); }
function save(db) { localStorage.setItem(KEY, JSON.stringify(db)); }
let DB = load();
if (!DB.gyms) { DB.gyms = defaultGyms(); save(DB); } // migración aditiva (no borra datos existentes)
// Ajustes globales del club (editables por el admin). tableSuggestion: sugerencia de mesas (aún no hace nada).
if (!DB.settings) { DB.settings = { tableSuggestion: false }; save(DB); }
// Cantidad de mesas por torneo (migración aditiva: torneos viejos arrancan con 4 mesas).
DB.tournaments.forEach(t => { if (t.tableCount == null) t.tableCount = 4; });
const gymById = id => (DB.gyms || []).find(g => g.id === id);
const tableCountOf = t => (t && t.tableCount != null) ? t.tableCount : 4;

/* ---------------- session ---------------- */
const currentUser = () => { try { return JSON.parse(sessionStorage.getItem('ttuser')); } catch (e) { return null; } };
const setUser = u => u ? sessionStorage.setItem('ttuser', JSON.stringify(u)) : sessionStorage.removeItem('ttuser');
const isAdmin = () => { const u = currentUser(); return u && u.role === 'admin'; };

/* ---------------- helpers ---------------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const playerById = id => DB.players.find(p => p.id === id);
const initials = p => (p.firstName[0] || '') + (p.lastName[0] || '');
const catClass = c => 'cat-' + (CATS.indexOf(c) + 1);
const fullName = p => `${p.firstName} ${p.lastName}`.trim();
const tById = id => DB.tournaments.find(t => t.id === id);
const getCat = (tid, cid) => { const t = tById(tid); return t && t.categorias.find(c => c.id === cid); };
const entById = (cat, id) => cat.entrants.find(e => e.id === id);
function entName(cat, id) {
  if (id === 'BYE') return 'BYE'; if (!id) return '—';
  const e = entById(cat, id); if (!e) return '—';
  const ns = e.players.map(pid => { const p = playerById(pid); return p ? fullName(p) : '?'; });
  return cat.format === 'double' ? ns.join(' / ') : ns[0];
}
function avatar(p, cls = 'avatar') {
  return p && p.photo ? `<span class="${cls}"><img src="${p.photo}" alt=""/></span>`
    : `<span class="${cls}">${esc(initials(p || { firstName: '?', lastName: '' })).toUpperCase()}</span>`;
}
const need = cat => Math.ceil(cat.rules.sets / 2);

/* ---------------- per-set scoring ---------------- */
function setWinner(s) { // s=[a,b] -> 'a' | 'b' | null (regla a 11, diferencia de 2)
  const a = s[0], b = s[1]; if (a === b) return null;
  const w = Math.max(a, b), l = Math.min(a, b);
  if (w < 11) return null;
  if (w === 11 && l > 9) return null;     // 11 sólo si el rival <=9
  if (w > 11 && w - l !== 2) return null;  // pasado 11, gana por exactamente 2
  return a > b ? 'a' : 'b';
}
function matchResult(m) { // m.sets=[[a,b]...] -> {wa,wb,winner:'a'|'b'|null}
  let wa = 0, wb = 0;
  (m && m.sets || []).forEach(s => { const sw = setWinner(s); if (sw === 'a') wa++; else if (sw === 'b') wb++; });
  return { wa, wb };
}
function matchWinnerSide(m, cat) { const { wa, wb } = matchResult(m); const n = need(cat); return wa >= n ? 'a' : wb >= n ? 'b' : null; }
const matchDone = (m, cat) => !!matchWinnerSide(m, cat);

/* ---------------- modal ---------------- */
function openModal(html) { $('#modalCard').innerHTML = `<button class="close-x" onclick="closeModal()">✕</button>` + html; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; $('#modalCard').innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

/* ---------------- image resize ---------------- */
function readPhoto(file, cb) {
  if (!file) return cb(null);
  const r = new FileReader();
  r.onload = () => { const img = new Image(); img.onload = () => {
    const max = 240, sc = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = img.width * sc; c.height = img.height * sc;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); cb(c.toDataURL('image/jpeg', .8));
  }; img.src = r.result; };
  r.readAsDataURL(file);
}

/* ================= VIEWS ================= */
let view = 'ranking';
let histA = null, histB = null, histOpen = null; // historial head-to-head
let profileNote = ''; // aviso transitorio en Perfil
let rankOpen = new Set(['1ra']); // qué categorías del ranking están desplegadas (1ra por defecto)

function renderChrome() {
  const u = currentUser();
  $('#nav').hidden = !u;
  document.querySelectorAll('.admin-only').forEach(el => el.hidden = !isAdmin());
  document.querySelectorAll('.profile-only').forEach(el => el.hidden = !(u && u.playerId)); // Perfil solo para cuentas de jugador
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', view.startsWith(b.dataset.view)));
  $('#userArea').innerHTML = u ? `<span class="chip ${u.role === 'admin' ? 'admin' : ''}">${u.role === 'admin' ? '🛠️ ' : '🎾 '}${esc(u.name)}</span>
     <button class="btn btn-ghost btn-sm" onclick="logout()">Salir</button>` : '';
  $('#storeInfo').textContent = `${DB.players.length} jugadores · ${DB.tournaments.length} torneos`;
}
function render() {
  renderChrome();
  const app = $('#app');
  if (!currentUser()) return renderLogin(app);
  if (view === 'ranking') return renderRanking(app);
  if (view === 'jugadores') return isAdmin() ? renderPlayers(app) : renderRanking(app);
  if (view === 'gimnasios') return isAdmin() ? renderGyms(app) : renderRanking(app);
  if (view === 'settings') return isAdmin() ? renderSettings(app) : renderRanking(app);
  if (view === 'historial') return renderHistory(app);
  if (view === 'perfil') return (currentUser().playerId ? renderProfile(app) : renderRanking(app));
  if (view === 'torneos') return renderTournaments(app);
  if (view.startsWith('torneo:')) return renderTournament(app, view.split(':')[1]);
  if (view.startsWith('cat:')) { const [, tid, cid] = view.split(':'); return renderCategoria(app, tid, cid); }
}

/* ---------- login ---------- */
function renderLogin(app) {
  app.innerHTML = `<div class="login-wrap"><div class="big-logo">🏓</div><h1>Tenis de Mesa</h1>
    <p class="page-sub">Dina Huapi &amp; Bariloche</p>
    <div class="card" style="text-align:left">
      <label>Usuario</label><input id="lu"/><label>Contraseña</label><input id="lp" type="password"/>
      <div id="lerr" class="banner" hidden></div>
      <button class="btn btn-primary" style="width:100%;margin-top:16px" onclick="doLogin()">Ingresar</button>
      <p class="hint">👑 <b>admin</b>/<b>admin</b> · 🎾 <b>jugador</b>/<b>jugador</b></p>
    </div></div>`;
  $('#lp').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}
function doLogin() {
  const f = DB.users.find(x => x.username === $('#lu').value.trim() && x.password === $('#lp').value);
  if (!f) { const e = $('#lerr'); e.hidden = false; e.textContent = 'Usuario o contraseña incorrectos.'; return; }
  setUser({ username: f.username, role: f.role, name: f.name, playerId: f.playerId || null }); view = 'ranking'; render();
}
function logout() { setUser(null); render(); }

/* ---------- ranking ---------- */
function renderRanking(app) {
  let html = `<div class="page-title"><h1>🏆 Ranking</h1></div><p class="page-sub">Tocá una categoría para ver u ocultar su ranking.</p><div class="rank-tiles">`;
  CATS.forEach(cat => {
    const open = rankOpen.has(cat);
    const list = DB.players.filter(p => p.category === cat).sort((a, b) => b.points - a.points);
    html += `<div class="rank-tile${open ? ' open' : ''}">
      <button class="rank-tilehdr" onclick="rankToggle('${cat}')">
        <span class="cat-badge ${catClass(cat)}">${cat}</span>
        <span class="rt-name">Categoría ${cat}</span>
        <span class="rt-count">${list.length}</span>
        <span class="rt-caret">${open ? '▾' : '▸'}</span></button>`;
    if (open) {
      html += `<div class="rank-body">`;
      if (!list.length) html += `<div class="empty">Sin jugadores.</div>`;
      list.forEach((p, i) => { html += `<div class="player-row"><span class="pos">${i + 1}</span>${avatar(p)}
        <div class="meta"><div class="name">${esc(fullName(p))}</div><div class="sub">📍 ${esc(p.city)}${ageFromDob(p.dob) != null ? ` · ${ageFromDob(p.dob)} años` : ''}</div></div>
        <div class="pts">${p.points}<small> pts</small></div></div>`; });
      html += `</div>`;
    }
    html += `</div>`;
  });
  html += `</div>`;
  app.innerHTML = html;
}
function rankToggle(cat) { if (rankOpen.has(cat)) rankOpen.delete(cat); else rankOpen.add(cat); render(); }

/* ---------- historial head-to-head ---------- */
function catMatchList(cat) {
  const out = [];
  (cat.matches || []).forEach(m => out.push({ a: m.a, b: m.b, m, phase: 'Grupo ' + String.fromCharCode(65 + m.g) }));
  if (cat.bracket) {
    const T = cat.bracket.length;
    const rname = r => { const fe = T - 1 - r; return fe === 0 ? 'Final' : fe === 1 ? 'Semifinal' : fe === 2 ? 'Cuartos' : fe === 3 ? 'Octavos' : 'Ronda ' + (r + 1); };
    cat.bracket.forEach((round, r) => round.forEach((mm, mi) => { const a = brContender(cat, r, mi, 'a'), b = brContender(cat, r, mi, 'b'); if (a && b && a !== 'BYE' && b !== 'BYE') out.push({ a, b, m: mm, phase: rname(r) }); }));
    if (cat.thirdPlace) { const a = semiLoser(cat, 0), b = semiLoser(cat, 1); if (a && b && a !== 'BYE' && b !== 'BYE') out.push({ a, b, m: cat.thirdPlace, phase: '3er puesto' }); }
  }
  return out;
}
function headToHead(aId, bId) {
  const res = [];
  DB.tournaments.forEach(t => t.categorias.forEach(cat => {
    catMatchList(cat).forEach(({ a, b, m, phase }) => {
      if (!matchDone(m, cat)) return;
      const ea = entById(cat, a), eb = entById(cat, b); if (!ea || !eb) return;
      let sideA = null;
      if (ea.players.includes(aId) && eb.players.includes(bId)) sideA = 'a';
      else if (ea.players.includes(bId) && eb.players.includes(aId)) sideA = 'b';
      else return;
      const w = matchWinnerSide(m, cat), r = matchResult(m);
      const aWon = (sideA === 'a' && w === 'a') || (sideA === 'b' && w === 'b');
      res.push({ tournament: t.name, date: t.date, cat: cat.name, fmt: cat.format, phase,
        teamA: sideA === 'a' ? entName(cat, a) : entName(cat, b), teamB: sideA === 'a' ? entName(cat, b) : entName(cat, a),
        aWon, scoreA: sideA === 'a' ? `${r.wa}-${r.wb}` : `${r.wb}-${r.wa}`, sets: (m.sets || []).map(s => s.join('-')).join(', ') });
    });
  }));
  return res.sort((x, y) => (y.date || '').localeCompare(x.date || ''));
}
function histPickerHtml(side, sel) {
  const p = sel ? playerById(sel) : null, open = histOpen === side;
  const list = DB.players.slice().sort((a, b) => fullName(a).localeCompare(fullName(b)))
    .map(pl => `<li class="hist-opt" data-name="${esc(fullName(pl)).toLowerCase()}" onclick="histPick('${side}','${pl.id}')">${esc(fullName(pl))} <span class="muted">· ${pl.category} · ${pl.points} pts</span></li>`).join('');
  return `<div class="hist-picker">
    <button class="hist-box ${p ? 'sel' : ''}" onclick="histToggle('${side}')"><span>${p ? esc(fullName(p)) : 'Elegí jugador'}</span><span>▾</span></button>
    ${open ? `<div class="hist-panel"><input class="hist-search" placeholder="🔍 Buscar jugador…" oninput="histFilter(this)"/><ul class="hist-list">${list}</ul></div>` : ''}
  </div>`;
}
function renderHistory(app) {
  const a = histA ? playerById(histA) : null, b = histB ? playerById(histB) : null;
  let body;
  if (!a || !b) body = `<div class="empty">Elegí dos jugadores para ver su historial.</div>`;
  else if (histA === histB) body = `<div class="empty">Elegí dos jugadores distintos.</div>`;
  else {
    const rows = headToHead(histA, histB), aw = rows.filter(r => r.aWon).length, bw = rows.length - aw;
    body = rows.length
      ? `<div class="hist-summary"><b>${esc(fullName(a))}</b> ${aw} — ${bw} <b>${esc(fullName(b))}</b> <span class="muted">(${rows.length} partido${rows.length > 1 ? 's' : ''})</span></div>` +
        rows.map(r => `<div class="hist-row">
          <div class="hist-meta"><div class="name">${esc(r.tournament)} · ${esc(r.cat)}</div>
            <div class="sub">${r.date ? fmtDate(r.date) : ''} · ${r.phase}${r.fmt === 'double' ? ' · dobles' : ''}</div></div>
          <div class="hist-score"><span class="${r.aWon ? 'win' : ''}">${esc(r.teamA)}</span> <b>${r.scoreA}</b> <span class="${r.aWon ? '' : 'win'}">${esc(r.teamB)}</span>
            ${r.sets ? `<div class="sub">${esc(r.sets)}</div>` : ''}</div></div>`).join('')
      : `<div class="empty">No hay partidos jugados entre ${esc(fullName(a))} y ${esc(fullName(b))}.</div>`;
  }
  app.innerHTML = `<div class="page-title"><h1>📊 Historial entre jugadores</h1></div>
    <p class="page-sub">Elegí dos jugadores y mirá todos los partidos que jugaron entre sí.</p>
    <div class="grid2 hist-pickers"><div><label>Jugador 1</label>${histPickerHtml('A', histA)}</div>
      <div><label>Jugador 2</label>${histPickerHtml('B', histB)}</div></div>
    <div style="margin-top:18px">${body}</div>`;
  const s = $('.hist-search'); if (s) s.focus();
}
function histToggle(side) { histOpen = histOpen === side ? null : side; render(); }
function histPick(side, pid) { if (side === 'A') histA = pid; else histB = pid; histOpen = null; render(); }
function histFilter(inp) { const q = inp.value.toLowerCase(); inp.closest('.hist-panel').querySelectorAll('.hist-opt').forEach(li => { li.style.display = li.dataset.name.includes(q) ? '' : 'none'; }); }

/* ---------- perfil (jugador) ---------- */
function renderProfile(app) {
  const u = currentUser();
  const p = u && u.playerId ? playerById(u.playerId) : null;
  if (!p) { app.innerHTML = '<div class="empty">Perfil no disponible.</div>'; return; }
  const note = profileNote; profileNote = '';
  app.innerHTML = `<div class="page-title"><h1>👤 Mi perfil</h1></div>
    <p class="page-sub">Editá tus datos personales, tu foto y tu contraseña.</p>
    ${note ? `<div class="banner ok" style="max-width:560px">${esc(note)}</div>` : ''}
    <div class="card" style="max-width:560px">
      <div class="row" style="gap:16px;margin-bottom:8px">${avatar(p, 'avatar')}
        <div><div style="font-weight:800;font-size:18px">${esc(fullName(p))}</div>
        <div class="muted">${p.category} · ${p.points} pts · 👤 ${esc(u.username)}</div></div></div>
      <div class="grid2">
        <div><label>Nombre</label><input id="pf_first" value="${esc(p.firstName)}"/></div>
        <div><label>Apellido</label><input id="pf_last" value="${esc(p.lastName)}"/></div>
        <div><label>Localidad</label><select id="pf_city">${CITIES.map(c => `<option ${c === p.city ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div><label>Fecha de nacimiento</label><input id="pf_dob" type="date" value="${p.dob || ''}"/></div>
      </div>
      <label>Foto</label><input id="pf_photo" type="file" accept="image/*"/>
      <div id="pf_err" class="banner" hidden></div>
      <div class="row" style="margin-top:14px"><button class="btn btn-primary" onclick="saveProfile()">Guardar cambios</button></div>
    </div>
    <div class="card" style="max-width:560px;margin-top:16px">
      <h3 style="margin:0 0 6px">🔒 Cambiar contraseña</h3>
      <p class="hint" style="margin-top:0">Escribí la nueva contraseña dos veces (sin requisitos).</p>
      <label>Nueva contraseña</label><input id="pf_pw1" type="password"/>
      <label>Repetir contraseña</label><input id="pf_pw2" type="password"/>
      <div id="pf_pwerr" class="banner" hidden></div>
      <div class="row" style="margin-top:14px"><button class="btn btn-primary" onclick="changePassword()">Cambiar contraseña</button></div>
    </div>`;
  let photo = p.photo; $('#pf_photo').addEventListener('change', e => readPhoto(e.target.files[0], d => { photo = d || photo; }));
  window.__pfphoto = () => photo;
}
function saveProfile() {
  const u = currentUser(), p = playerById(u.playerId), e = $('#pf_err');
  const first = $('#pf_first').value.trim(), last = $('#pf_last').value.trim();
  if (!first || !last) { e.hidden = false; e.textContent = 'Nombre y apellido obligatorios.'; return; }
  p.firstName = first; p.lastName = last; p.city = $('#pf_city').value; p.dob = $('#pf_dob').value || null;
  p.photo = window.__pfphoto ? window.__pfphoto() : p.photo;
  const acc = DB.users.find(x => x.playerId === p.id); if (acc) acc.name = fullName(p);
  setUser({ ...u, name: fullName(p) });
  save(DB); profileNote = '✓ Datos guardados.'; render();
}
function changePassword() {
  const u = currentUser(), e = $('#pf_pwerr');
  const a = $('#pf_pw1').value, b = $('#pf_pw2').value;
  if (!a) { e.hidden = false; e.textContent = 'Escribí una contraseña.'; return; }
  if (a !== b) { e.hidden = false; e.textContent = 'Las contraseñas no coinciden.'; return; }
  const acc = DB.users.find(x => x.playerId === u.playerId);
  if (!acc) { e.hidden = false; e.textContent = 'Cuenta no encontrada.'; return; }
  acc.password = a; save(DB); profileNote = '✓ Contraseña actualizada.'; render();
}

/* ---------- jugadores (admin) ---------- */
function renderPlayers(app) {
  const rows = DB.players.slice().sort((a, b) => fullName(a).localeCompare(fullName(b))).map(p => { const u = (DB.users || []).find(x => x.playerId === p.id); return `<div class="player-row">${avatar(p)}
    <div class="meta"><div class="name">${esc(fullName(p))}</div><div class="sub">📍 ${esc(p.city)}${ageFromDob(p.dob) != null ? ` · ${ageFromDob(p.dob)} años` : ''}${u ? ` · 👤 ${esc(u.username)}` : ''}</div></div>
    <span class="cat-badge ${catClass(p.category)}" style="height:28px;min-width:28px">${p.category}</span>
    <div class="pts">${p.points}<small> pts</small></div>
    <button class="btn btn-ghost btn-sm" onclick="playerForm('${p.id}')">✏️</button>
    <button class="btn btn-ghost btn-sm" onclick="delPlayer('${p.id}')">🗑️</button></div>`; }).join('');
  app.innerHTML = `<div class="section-head"><div class="page-title"><h1>👥 Jugadores</h1></div>
    <button class="btn btn-primary" onclick="playerForm()">➕ Inscribir jugador</button></div>
    <p class="page-sub">${DB.players.length} jugadores.</p>${rows || '<div class="empty">Sin jugadores.</div>'}`;
}
function playerForm(id) {
  const p = id ? playerById(id) : { firstName: '', lastName: '', dob: '', city: CITIES[0], category: '4ta', points: NEW_PLAYER_POINTS, photo: null };
  openModal(`<h3>${id ? 'Editar' : 'Inscribir'} jugador</h3>
    <div class="row" style="margin:12px 0">${avatar(p)}<span class="muted">${id ? esc(fullName(p)) : 'Nuevo'}</span></div>
    <div class="grid2">
      <div><label>Nombre</label><input id="f_first" value="${esc(p.firstName)}"/></div>
      <div><label>Apellido</label><input id="f_last" value="${esc(p.lastName)}"/></div>
      <div><label>Localidad</label><select id="f_city">${CITIES.map(c => `<option ${c === p.city ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div><label>Puntos</label><input id="f_pts" type="number" min="0" value="${p.points}"/></div>
      <div><label>Fecha de nacimiento</label><input id="f_dob" type="date" value="${p.dob || ''}"/></div>
    </div>
    <p class="hint">Categoría: <b>${levelFromPoints(p.points)}</b> — se calcula por puntos (>800 1ra · >600 2da · >300 3ra · resto 4ta). Nuevos arrancan con ${NEW_PLAYER_POINTS}.${id && ageFromDob(p.dob) != null ? ` · Edad: <b>${ageFromDob(p.dob)} años</b>` : ''}</p>
    <label>Foto</label><input id="f_photo" type="file" accept="image/*"/>
    <div id="ferr" class="banner" hidden></div>
    <div class="row spread" style="margin-top:18px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="savePlayer('${id || ''}')">Guardar</button></div>`);
  let photo = p.photo; $('#f_photo').addEventListener('change', e => readPhoto(e.target.files[0], d => { photo = d || photo; }));
  window.__photo = () => photo;
}
function savePlayer(id) {
  const first = $('#f_first').value.trim(), last = $('#f_last').value.trim();
  if (!first || !last) { const e = $('#ferr'); e.hidden = false; e.textContent = 'Nombre y apellido obligatorios.'; return; }
  const data = { firstName: first, lastName: last, dob: $('#f_dob').value || null, city: $('#f_city').value, points: parseInt($('#f_pts').value, 10) || 0, photo: window.__photo ? window.__photo() : null };
  let target;
  if (id) { target = Object.assign(playerById(id), data); } else { target = { id: uid('p_'), ...data }; DB.players.push(target); }
  syncCategory(target);  // categoría derivada de los puntos
  ensurePlayerUsers();   // crea la cuenta del nuevo jugador (user = inicial+apellido)
  save(DB); closeModal(); render();
}
function delPlayer(id) {
  const p = playerById(id); if (!p || !confirm(`¿Eliminar a ${fullName(p)}?`)) return;
  DB.players = DB.players.filter(x => x.id !== id);
  DB.users = (DB.users || []).filter(u => u.playerId !== id); // borrar su cuenta
  DB.tournaments.forEach(t => t.categorias.forEach(c => { c.entrants = c.entrants.filter(e => !e.players.includes(id)); c.groups = null; c.matches = null; c.bracket = null; c.thirdPlace = null; }));
  save(DB); render();
}

/* ---------- gimnasios (admin) ---------- */
// Link a Google Maps (busca la dirección). En el celular abre la app de Maps.
const mapsSearchUrl = q => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
// Link de "cómo llegar" (direcciones hacia la dirección). En el celular abre la navegación.
const mapsDirUrl = q => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
// Mapa embebido sin API key (q = dirección). Devuelve el iframe o un placeholder si no hay dirección.
function mapEmbed(address) {
  if (!address) return `<div class="gym-map gym-map-empty">Sin dirección cargada — agregá un domicilio para ver el mapa.</div>`;
  return `<iframe class="gym-map" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
    src="https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=15&output=embed" title="Mapa"></iframe>`;
}
function renderGyms(app) {
  const cards = (DB.gyms || []).slice().sort((a, b) => a.name.localeCompare(b.name)).map(g => `<div class="card gym-card">
    <div class="gym-head"><span class="gym-ico">🏟️</span>
      <div class="meta"><div class="name">${esc(g.name)}</div><div class="sub">📍 ${esc(g.address || '—')}</div></div></div>
    ${mapEmbed(g.address)}
    <div class="row" style="margin-top:12px">
      ${g.address ? `<a class="btn btn-accent btn-sm" href="${mapsDirUrl(g.address)}" target="_blank" rel="noopener">🧭 Cómo llegar</a>
      <a class="btn btn-ghost btn-sm" href="${mapsSearchUrl(g.address)}" target="_blank" rel="noopener">🗺️ Ver en Maps</a>` : ''}
      ${isAdmin() ? `<button class="btn btn-ghost btn-sm" onclick="gymForm('${g.id}')">✏️ Editar</button>
      <button class="btn btn-ghost btn-sm" onclick="delGym('${g.id}')">🗑️</button>` : ''}
    </div></div>`).join('');
  app.innerHTML = `<div class="section-head"><div class="page-title"><h1>🏟️ Gimnasios</h1></div>
    <button class="btn btn-primary" onclick="gymForm()">➕ Agregar gimnasio</button></div>
    <p class="page-sub">Lugares disponibles para los torneos. Tocá <b>Cómo llegar</b> para abrir Google Maps con la dirección.</p>
    <div class="cards gym-cards">${cards || '<div class="empty">Sin gimnasios.</div>'}</div>`;
}
function gymForm(id) {
  const g = id ? gymById(id) : { name: '', address: '' };
  openModal(`<h3>${id ? 'Editar' : 'Agregar'} gimnasio</h3>
    <label>Nombre</label><input id="g_name" value="${esc(g.name)}" placeholder="Ej: Muni 3"/>
    <label>Domicilio</label><input id="g_addr" value="${esc(g.address)}" placeholder="Calle, ciudad, provincia"/>
    <div id="gerr" class="banner" hidden></div>
    <div class="row spread" style="margin-top:18px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveGym('${id || ''}')">Guardar</button></div>`);
}
function saveGym(id) {
  const name = $('#g_name').value.trim(), address = $('#g_addr').value.trim(), e = $('#gerr');
  if (!name) { e.hidden = false; e.textContent = 'El nombre es obligatorio.'; return; }
  if (!DB.gyms) DB.gyms = [];
  if (id) Object.assign(gymById(id), { name, address }); else DB.gyms.push({ id: uid('g_'), name, address });
  save(DB); closeModal(); render();
}
function delGym(id) {
  const g = gymById(id); if (!g) return;
  const used = DB.tournaments.filter(t => t.gymId === id).length;
  if (!confirm(`¿Eliminar "${g.name}"?` + (used ? ` ${used} torneo(s) quedarán sin lugar asignado.` : ''))) return;
  DB.gyms = DB.gyms.filter(x => x.id !== id);
  DB.tournaments.forEach(t => { if (t.gymId === id) t.gymId = null; });
  save(DB); render();
}

/* ---------- ajustes (admin) ---------- */
function renderSettings(app) {
  const s = DB.settings || (DB.settings = { tableSuggestion: false });
  app.innerHTML = `<div class="page-title"><h1>⚙️ Ajustes</h1></div>
    <p class="page-sub">Configuración general del club. Solo el administrador puede verla y cambiarla.</p>
    <div class="card" style="max-width:620px">
      <div class="setting-row">
        <div class="setting-text">
          <div class="setting-name">🏓 Sugerencia de mesas</div>
          <div class="setting-desc">Sugerir automáticamente en qué mesa se debería jugar cada partido. <b>Próximamente</b> — por ahora solo se puede activar o desactivar.</div>
        </div>
        <button class="switch ${s.tableSuggestion ? 'on' : ''}" role="switch" aria-checked="${s.tableSuggestion}" onclick="toggleTableSuggestion()"><span class="knob"></span></button>
      </div>
    </div>`;
}
function toggleTableSuggestion() {
  if (!DB.settings) DB.settings = { tableSuggestion: false };
  DB.settings.tableSuggestion = !DB.settings.tableSuggestion;
  save(DB); render();
}

/* ---------- torneos ---------- */
const fmtDate = s => new Date(s + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
function dateRangeLabel(t) {
  if (t.dateEnd && t.dateEnd !== t.date) {
    const a = new Date(t.date + 'T00:00:00'), b = new Date(t.dateEnd + 'T00:00:00');
    if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear())
      return `${a.getDate()} al ${b.getDate()} de ${a.toLocaleDateString('es-AR', { month: 'long' })} de ${a.getFullYear()}`;
    return `${fmtDate(t.date)} al ${fmtDate(t.dateEnd)}`;
  }
  return fmtDate(t.date);
}
// Partidos "en vivo" de un torneo = ya tienen mesa asignada y todavía no terminaron.
function liveMatchesOf(t) {
  const out = [];
  t.categorias.forEach(cat => {
    cat._tid = t.id;
    catMatchList(cat).forEach(({ a, b, m, phase }) => {
      if (m && m.table != null && !matchDone(m, cat)) out.push({ catName: cat.name, table: m.table, phase, a: entName(cat, a), b: entName(cat, b) });
    });
  });
  return out.sort((x, y) => x.table - y.table);
}
const isLiveTournament = t => liveMatchesOf(t).length > 0;
// Torneo "más reciente" = el de fecha de inicio más nueva (desempata por fecha de fin).
function mostRecentTournamentId() {
  if (!DB.tournaments.length) return null;
  return DB.tournaments.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.dateEnd || '').localeCompare(a.dateEnd || ''))[0].id;
}
function renderTournaments(app) {
  const recentId = mostRecentTournamentId();
  const cards = DB.tournaments.map(t => {
    const live = isLiveTournament(t), recent = t.id === recentId;
    const cls = live ? ' tourn-live' : recent ? ' tourn-recent' : '';
    const badges = `${live ? '<span class="t-badge live">🔴 En vivo</span>' : ''}${recent ? '<span class="t-badge recent">🆕 Más reciente</span>' : ''}`;
    return `<div class="card tourn-card${cls}">${badges ? `<div class="t-badges">${badges}</div>` : ''}
      <h3 style="margin:0">${esc(t.name)}</h3>
      <div class="when">📅 ${dateRangeLabel(t)}</div>
      ${gymById(t.gymId) ? `<div class="when">📍 ${esc(gymById(t.gymId).name)}</div>` : ''}
      <div class="tags"><span class="tag">${t.categorias.length} categoría(s)</span>${live ? `<span class="tag tag-live">${liveMatchesOf(t).length} en juego</span>` : ''}</div>
      <div class="row" style="margin-top:14px"><button class="btn btn-accent btn-sm" onclick="go('torneo:${t.id}')">👁️ Ver</button>
        ${isAdmin() ? `<button class="btn btn-ghost btn-sm" onclick="delTournament('${t.id}')">🗑️</button>` : ''}</div></div>`;
  }).join('');
  app.innerHTML = `<div class="section-head"><div class="page-title"><h1>📅 Torneos</h1></div>
    ${isAdmin() ? `<button class="btn btn-primary" onclick="tournamentForm()">➕ Crear torneo</button>` : ''}</div>
    <p class="page-sub">Cada torneo agrupa varias categorías (sub-torneos).</p>
    <div class="cards">${cards || '<div class="empty">No hay torneos.</div>'}</div>`;
}
function tournamentForm() {
  const checks = CATALOG.map(c => `<label class="catchk"><input type="checkbox" value="${c.name}"/>
    <span>${c.name}</span><small class="muted">${ruleLabel(c.rule)}</small></label>`).join('');
  openModal(`<h3>Crear torneo</h3>
    <label>Nombre</label><input id="t_name" placeholder="Ej: Apertura 2026"/>
    <div class="grid2">
      <div><label>Fecha inicio</label><input id="t_date" type="date"/></div>
      <div><label>Fecha fin <span class="muted">(opcional)</span></label><input id="t_dateEnd" type="date"/></div>
    </div>
    <p class="hint" style="margin-top:0">Para torneos de varios días (ej. sábado y domingo) poné inicio y fin.</p>
    <label>Cantidad de mesas disponibles</label>
    <input id="t_tables" type="number" min="1" value="4"/>
    <p class="hint" style="margin-top:4px">Mesas físicas del torneo. Después podés cambiarla, incluso con el torneo en juego.</p>
    <label>Lugar (gimnasio)</label>
    <select id="t_gym">${(DB.gyms || []).length ? (DB.gyms || []).map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('') : '<option value="">— sin gimnasios cargados —</option>'}</select>
    <p class="hint" style="margin-top:4px">¿Falta un gimnasio? Agregalo en la sección <b>🏟️ Gimnasios</b>.</p>
    <label>Categorías del torneo</label>
    <p class="hint" style="margin-top:0">Marcá las que se jueguen. Por defecto se crean en singles, al mejor de 5, 100 pts — editás formato/puntos por categoría después.</p>
    <div class="catgrid">${checks}</div>
    <div id="terr" class="banner" hidden></div>
    <div class="row spread" style="margin-top:18px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveTournament()">Crear</button></div>`);
}
function saveTournament() {
  const name = $('#t_name').value.trim(), date = $('#t_date').value, dateEnd = $('#t_dateEnd').value || date, e = $('#terr');
  if (!name || !date) { e.hidden = false; e.textContent = 'Nombre y fecha de inicio obligatorios.'; return; }
  if (dateEnd < date) { e.hidden = false; e.textContent = 'La fecha de fin no puede ser anterior al inicio.'; return; }
  const picked = [...$('#modalCard').querySelectorAll('input[type=checkbox]:checked')].map(c => c.value);
  if (!picked.length) { e.hidden = false; e.textContent = 'Elegí al menos una categoría.'; return; }
  const categorias = picked.map(nm => ({ id: uid('c_'), name: nm, format: 'single', rule: catalogRule(nm), rules: { sets: 5, groupMin: 3, groupMax: 4 }, championPoints: 100, entrants: [], groups: null, matches: null, bracket: null, thirdPlace: null, closed: false }));
  const tableCount = Math.max(1, parseInt($('#t_tables').value, 10) || 1);
  DB.tournaments.push({ id: uid('t_'), name, date, dateEnd, gymId: ($('#t_gym').value || null), tableCount, categorias });
  save(DB); closeModal(); view = 'torneos'; render();
}
function delTournament(id) { if (confirm('¿Eliminar torneo?')) { DB.tournaments = DB.tournaments.filter(t => t.id !== id); save(DB); render(); } }

/* ----- mesas del torneo (editable incluso en juego) ----- */
function editTablesModal(tid) {
  const t = tById(tid); if (!t) return;
  openModal(`<h3>Mesas del torneo</h3>
    <p class="hint" style="margin-top:0">Cantidad de mesas físicas disponibles en <b>${esc(t.name)}</b>. Podés cambiarla en cualquier momento, incluso con partidos en juego.</p>
    <label>Cantidad de mesas</label><input id="tt_count" type="number" min="1" value="${tableCountOf(t)}"/>
    <div id="tterr" class="banner" hidden></div>
    <div class="row spread" style="margin-top:18px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveTables('${tid}')">Guardar</button></div>`);
}
function saveTables(tid) {
  const t = tById(tid), e = $('#tterr');
  const n = parseInt($('#tt_count').value, 10);
  if (!n || n < 1) { e.hidden = false; e.textContent = 'Tiene que haber al menos 1 mesa.'; return; }
  t.tableCount = n; save(DB); closeModal(); render();
}
// Selector/insignia de mesa para un partido. Admin: <select>; jugador: insignia si hay mesa asignada.
function tableControl(cat, kind, gidx, r, m, mm) {
  const t = tById(cat._tid), max = tableCountOf(t);
  const cur = mm && mm.table != null ? mm.table : '';
  if (!isAdmin()) return cur ? `<span class="mesa-badge">🏓 Mesa ${cur}</span>` : '';
  const top = Math.max(max, cur || 0);
  let opts = `<option value="">🏓 Mesa…</option>`;
  for (let i = 1; i <= top; i++) opts += `<option value="${i}" ${cur === i ? 'selected' : ''}>Mesa ${i}</option>`;
  const args = `'${cat._tid}','${cat.id}','${kind}',${gidx ?? 'null'},${r ?? 'null'},${m ?? 'null'}`;
  return `<select class="mesa-sel" onchange="setMatchTable(${args},this.value)" onclick="event.stopPropagation()">${opts}</select>`;
}
function setMatchTable(tid, cid, kind, gidx, r, m, val) {
  const cat = getCat(tid, cid); cat._tid = tid;
  const { mm } = locateMatch(cat, kind, gidx, r, m);
  mm.table = val ? parseInt(val, 10) : null;
  save(DB); render();
}

/* ---------- torneo: lista de categorías ---------- */
function renderTournament(app, tid) {
  const t = tById(tid); if (!t) { app.innerHTML = '<div class="empty">No encontrado.</div>'; return; }
  const cards = t.categorias.map(c => {
    const champ = c.bracket ? brWinner(c, c.bracket.length - 1, 0) : null;
    return `<div class="card"><div class="row spread"><h3 style="margin:0">${esc(c.name)}</h3></div>
      <div class="tags"><span class="tag">${c.format === 'double' ? '👥 Dobles' : '👤 Singles'}</span>
        <span class="tag">📋 ${ruleLabel(c.rule)}</span>
        <span class="tag">Al mejor de ${c.rules.sets}</span><span class="tag">🥇 ${c.championPoints} pts</span>
        <span class="tag">${c.entrants.length} ${c.format === 'double' ? 'parejas' : 'jugadores'}</span>
        <span class="tag">${c.closed ? '✅ Finalizada' : c.bracket ? '🏆 En llave' : c.groups ? '🎲 Grupos' : c.enrollClosed ? '🔴 Inscripción cerrada' : '🟢 Inscripción abierta'}</span></div>
      ${champ && champ !== 'BYE' ? `<div class="champ" style="margin-top:10px">🏆 ${esc(entName(c, champ))}</div>` : ''}
      <div class="row" style="margin-top:12px"><button class="btn btn-accent btn-sm" onclick="go('cat:${t.id}:${c.id}')">👁️ Ver</button>
        ${isAdmin() ? `<button class="btn btn-ghost btn-sm" onclick="delCategoria('${t.id}','${c.id}')">🗑️</button>` : ''}</div></div>`;
  }).join('');
  const gym = gymById(t.gymId);
  const live = liveMatchesOf(t);
  const liveHtml = `<div class="section-head"><h2>🔴 Partidos en vivo</h2>${live.length ? `<span class="t-badge live">${live.length} en juego</span>` : ''}</div>`
    + (live.length
      ? `<div class="live-list">` + live.map(L => `<div class="live-row">
          <span class="live-mesa">🏓 Mesa ${L.table}</span>
          <span class="live-players">${esc(L.a)} <span class="muted">vs</span> ${esc(L.b)}</span>
          <span class="live-cat">${esc(L.catName)} · ${esc(L.phase)}</span></div>`).join('') + `</div>`
      : `<div class="empty">No hay partidos en juego ahora. Cuando le asignes una mesa a un partido, aparece acá como “en vivo”.</div>`);
  app.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="go('torneos')">← Volver</button>
    <div class="page-title" style="margin-top:12px"><h1>${esc(t.name)}</h1></div>
    <div class="tags"><span class="tag">📅 ${dateRangeLabel(t)}</span>${gym ? `<span class="tag">🏟️ ${esc(gym.name)}</span>` : ''}
      <span class="tag">🏓 ${tableCountOf(t)} mesa${tableCountOf(t) === 1 ? '' : 's'}</span>
      ${isAdmin() ? `<button class="btn btn-ghost btn-sm" onclick="editTablesModal('${t.id}')">✏️ Editar mesas</button>` : ''}</div>
    ${gym ? `<p class="page-sub" style="margin:8px 0 0">📍 ${esc(gym.address)} ${gym.address ? `<a class="maplink" href="${mapsDirUrl(gym.address)}" target="_blank" rel="noopener">🧭 Cómo llegar</a>` : ''}</p>` : ''}
    ${liveHtml}
    <div class="section-head"><h2>Categorías (sub-torneos)</h2>${isAdmin() ? `<button class="btn btn-primary" onclick="categoriaForm('${t.id}')">➕ Crear categoría</button>` : ''}</div>
    <div class="cards">${cards || '<div class="empty">Sin categorías. Creá una.</div>'}</div>`;
}
function categoriaForm(tid) {
  const names = CATALOG.map(c => `<option value="${c.name}">${c.name} — ${ruleLabel(c.rule)}</option>`).join('');
  openModal(`<h3>Crear categoría (sub-torneo)</h3>
    <label>Categoría</label><select id="c_name">${names}</select>
    <div class="grid2">
      <div><label>Formato</label><select id="c_fmt"><option value="single">Singles 👤</option><option value="double">Dobles 👥</option></select></div>
      <div><label>Partidos al mejor de</label><select id="c_sets"><option value="3">3 sets</option><option value="5" selected>5 sets</option></select></div>
      <div><label>Mín por grupo</label><input id="c_min" type="number" min="2" value="3"/></div>
      <div><label>Máx por grupo</label><input id="c_max" type="number" min="2" value="4"/></div>
      <div><label>Puntos al campeón 🥇</label><input id="c_pts" type="number" min="0" value="100"/></div>
    </div>
    <p class="hint">El resto se reparte: 2º=½ · 3º=⅓ · 4º=¼ · cuartofinalista=⅛ · octavofinalista=1/16 …</p>
    <div id="cerr" class="banner" hidden></div>
    <div class="row spread" style="margin-top:16px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveCategoria('${tid}')">Crear</button></div>`);
}
function saveCategoria(tid) {
  const t = tById(tid), name = $('#c_name').value;
  const min = parseInt($('#c_min').value, 10), max = parseInt($('#c_max').value, 10);
  const e = $('#cerr');
  if (min > max) { e.hidden = false; e.textContent = 'Mín no puede ser mayor que máx.'; return; }
  t.categorias.push({ id: uid('c_'), name, format: $('#c_fmt').value, rule: catalogRule(name), rules: { sets: parseInt($('#c_sets').value, 10), groupMin: min, groupMax: max }, championPoints: parseInt($('#c_pts').value, 10) || 0, entrants: [], groups: null, matches: null, bracket: null, thirdPlace: null, closed: false });
  save(DB); closeModal(); render();
}
function delCategoria(tid, cid) { const t = tById(tid); if (confirm('¿Eliminar categoría?')) { t.categorias = t.categorias.filter(c => c.id !== cid); save(DB); render(); } }

/* ---------- categoría: inscripción, grupos, resultados, llave ---------- */
function renderCategoria(app, tid, cid) {
  const t = tById(tid), cat = getCat(tid, cid);
  if (!cat) { app.innerHTML = '<div class="empty">No encontrada.</div>'; return; }
  cat._tid = tid; // para los onclick de grupos/llave
  let html = `<button class="btn btn-ghost btn-sm" onclick="go('torneo:${tid}')">← Volver</button>
    <div class="page-title" style="margin-top:12px"><h1>${esc(cat.name)}</h1></div>`;
  const enr = enrollmentStatus(cat);
  html += `<div class="tags"><span class="tag">${cat.format === 'double' ? '👥 Dobles' : '👤 Singles'}</span>
      <span class="tag">📋 Inscripción: ${ruleLabel(cat.rule)}</span>
      <span class="tag">Al mejor de ${cat.rules.sets} sets</span><span class="tag">Grupos ${cat.rules.groupMin}–${cat.rules.groupMax}</span>
      <span class="tag">🥇 ${cat.championPoints} pts</span><span class="tag">${cat.entrants.length} inscriptos</span>
      <span class="tag ${enr.open ? 'tag-open' : 'tag-closed'}">${enr.label}</span></div>`;

  if (isAdmin()) {
    const finalDone = cat.bracket && brWinner(cat, cat.bracket.length - 1, 0);
    const thirdReady = !cat.thirdPlace || matchDone(cat.thirdPlace, cat);
    const canToggle = !cat.groups && !cat.closed;
    html += `<div class="row" style="margin:16px 0">
      <button class="btn btn-accent" onclick="enrollModal('${tid}','${cid}')">📝 Anotar ${cat.format === 'double' ? 'parejas' : 'jugadores'}</button>
      ${canToggle ? `<button class="btn btn-ghost" onclick="toggleEnroll('${tid}','${cid}')">${cat.enrollClosed ? '🔓 Reabrir inscripción' : '🔒 Cerrar inscripción'}</button>` : ''}
      <button class="btn btn-primary" onclick="makeGroups('${tid}','${cid}')">🎲 Armar grupos</button>
      ${cat.groups ? `<button class="btn btn-accent" onclick="generateBracket('${tid}','${cid}')">🏆 Generar llave</button>` : ''}
      ${finalDone && thirdReady && !cat.closed ? `<button class="btn btn-primary" onclick="awardPoints('${tid}','${cid}')">✅ Cerrar y otorgar puntos</button>` : ''}
    </div>`;
    if (cat.closed) html += `<div class="banner">✅ Categoría cerrada — puntos otorgados al ranking.</div>`;
  } else {
    // jugadores: autoinscripción si la inscripción está abierta
    html += enr.open
      ? `<div class="row" style="margin:16px 0"><button class="btn btn-primary" onclick="selfEnrollModal('${tid}','${cid}')">📝 Anotarme</button></div>`
      : `<div class="banner" style="margin:16px 0">${enr.label}. No te podés anotar en este momento.</div>`;
  }

  html += `<div class="section-head"><h2>Fase de grupos</h2></div>`;
  if (cat.groups && cat.groups.length) {
    html += `<div class="groups">` + cat.groups.map((g, i) => groupCardHtml(cat, i)).join('') + `</div>`;
    html += `<div class="section-head"><h2>🏆 Llave final</h2></div>`;
    if (cat.bracket) html += bracketHtml(cat);
    else html += `<div class="empty">Clasifican los 2 primeros de cada grupo.${groupStageComplete(cat) ? (isAdmin() ? ' Tocá “Generar llave”.' : '') : ' Cargá todos los resultados de grupos.'}</div>`;
  } else {
    html += `<div class="empty">Grupos sin armar.${isAdmin() ? ' Anotá y tocá “Armar grupos”.' : ''}</div>`;
  }
  app.innerHTML = html;
}

/* ----- estado de inscripción ----- */
// Abierta mientras no haya empezado (no hay grupos armados), no esté finalizada, y el admin no la haya cerrado.
const enrollmentOpen = cat => !cat.groups && !cat.closed && !cat.enrollClosed;
function enrollmentStatus(cat) {
  if (cat.closed) return { open: false, label: '🏁 Categoría finalizada' };
  if (cat.groups) return { open: false, label: '🔴 Inscripción cerrada (partidos en curso)' };
  if (cat.enrollClosed) return { open: false, label: '🔴 Inscripción cerrada por el admin' };
  return { open: true, label: '🟢 Inscripción abierta' };
}
function toggleEnroll(tid, cid) {
  const cat = getCat(tid, cid);
  if (cat.groups || cat.closed) { alert('No aplica: los partidos ya empezaron o la categoría está finalizada.'); return; }
  cat.enrollClosed = !cat.enrollClosed; save(DB); render();
}

/* ----- enroll ----- */
function enrollModal(tid, cid) {
  const cat = getCat(tid, cid);
  if (cat.format === 'double') return enrollDoubles(tid, cid);
  const opts = DB.players.slice().sort((a, b) => fullName(a).localeCompare(fullName(b))).map(p => {
    const checked = cat.entrants.some(e => e.players[0] === p.id);
    const el = eligible(cat, p), age = ageFromDob(p.dob);
    return `<label class="enrow ${el.ok ? '' : 'no'}" style="display:flex;align-items:center;gap:10px;font-weight:500;margin:6px 0">
      <input type="checkbox" value="${p.id}" ${checked ? 'checked' : ''} ${el.ok ? '' : 'disabled'} style="width:auto"/>
      <span>${esc(fullName(p))} <span class="muted" style="font-size:12px">· ${p.category}${age != null ? ` · ${age}a` : ''} · ${esc(p.city)}</span>
      ${el.ok ? '' : `<br><small style="color:#b42318">⛔ ${esc(el.reason)}</small>`}</span></label>`;
  }).join('');
  openModal(`<h3>Anotar jugadores — ${esc(cat.name)}</h3>
    <p class="hint" style="margin-top:0">Regla de inscripción: <b>${ruleLabel(cat.rule)}</b></p>
    <div style="max-height:46vh;overflow:auto">${opts || '<div class="empty">No hay jugadores.</div>'}</div>
    <div class="row spread" style="margin-top:16px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveEnrollSingles('${tid}','${cid}')">Guardar</button></div>`);
}
function saveEnrollSingles(tid, cid) {
  const cat = getCat(tid, cid);
  const ids = [...$('#modalCard').querySelectorAll('input[type=checkbox]:checked')].map(c => c.value)
    .filter(pid => eligible(cat, playerById(pid)).ok); // defensivo
  cat.entrants = ids.map(pid => cat.entrants.find(e => e.players[0] === pid) || { id: uid('e_'), players: [pid] });
  resetCat(cat); save(DB); closeModal(); render();
}
function enrollDoubles(tid, cid) {
  const cat = getCat(tid, cid);
  window.__teams = JSON.parse(JSON.stringify(cat.entrants));
  renderDoublesModal(tid, cid);
}
function renderDoublesModal(tid, cid) {
  const teams = window.__teams || [];
  const optList = DB.players.slice().sort((a, b) => fullName(a).localeCompare(fullName(b)));
  const sel = id => `<select id="${id}"><option value="">— jugador —</option>${optList.map(p => `<option value="${p.id}">${esc(fullName(p))}</option>`).join('')}</select>`;
  const list = teams.map((e, i) => `<div class="bmatch"><span>${esc(playerById(e.players[0]) ? fullName(playerById(e.players[0])) : '?')} / ${esc(playerById(e.players[1]) ? fullName(playerById(e.players[1])) : '?')}</span>
    <button class="btn btn-ghost btn-sm" onclick="rmTeam(${i},'${tid}','${cid}')">🗑️</button></div>`).join('');
  const cat = getCat(tid, cid);
  openModal(`<h3>Anotar parejas — ${esc(cat.name)}</h3>
    <p class="hint" style="margin-top:0">Regla de inscripción: <b>${ruleLabel(cat.rule)}</b> (aplica a ambos)</p>
    <div class="grid2"><div>${sel('d_a')}</div><div>${sel('d_b')}</div></div>
    <button class="btn btn-accent btn-sm" style="margin-top:8px" onclick="addTeam('${tid}','${cid}')">➕ Agregar pareja</button>
    <div id="derr" class="banner" hidden></div>
    <div style="max-height:38vh;overflow:auto;margin-top:12px">${list || '<div class="empty">Sin parejas aún.</div>'}</div>
    <div class="row spread" style="margin-top:16px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveEnrollDoubles('${tid}','${cid}')">Guardar parejas</button></div>`);
}
function addTeam(tid, cid) {
  const cat = getCat(tid, cid), a = $('#d_a').value, b = $('#d_b').value, e = $('#derr');
  if (!a || !b || a === b) { e.hidden = false; e.textContent = 'Elegí dos jugadores distintos.'; return; }
  if (window.__teams.some(t => t.players.includes(a) || t.players.includes(b))) { e.hidden = false; e.textContent = 'Algún jugador ya está en otra pareja.'; return; }
  for (const pid of [a, b]) { const el = eligible(cat, playerById(pid)); if (!el.ok) { e.hidden = false; e.textContent = '⛔ ' + el.reason; return; } }
  window.__teams.push({ id: uid('e_'), players: [a, b] });
  renderDoublesModal(tid, cid);
}
function rmTeam(i, tid, cid) { window.__teams.splice(i, 1); renderDoublesModal(tid, cid); }
function saveEnrollDoubles(tid, cid) { const cat = getCat(tid, cid); cat.entrants = window.__teams || []; resetCat(cat); save(DB); closeModal(); render(); }
function resetCat(cat) { cat.groups = null; cat.matches = null; cat.bracket = null; cat.thirdPlace = null; cat.closed = false; cat.awarded = null; }

/* ----- autoinscripción (jugadores) ----- */
function selfEnrollModal(tid, cid) {
  const cat = getCat(tid, cid);
  if (!enrollmentOpen(cat)) { alert('La inscripción no está abierta.'); return; }
  const u = currentUser(), me = u && u.playerId ? playerById(u.playerId) : null;
  const enrolledIds = new Set(cat.entrants.flatMap(e => e.players));
  const availFor = exclude => DB.players.slice().sort((a, b) => fullName(a).localeCompare(fullName(b)))
    .filter(p => !enrolledIds.has(p.id) && p.id !== exclude && eligible(cat, p).ok);
  const sel = (id, list) => `<select id="${id}"><option value="">— elegí —</option>${list.map(p => `<option value="${p.id}">${esc(fullName(p))} · ${p.category}</option>`).join('')}</select>`;
  const close = `<button class="btn btn-ghost" onclick="closeModal()">Cerrar</button>`;
  const head = `<h3>Anotarme — ${esc(cat.name)}</h3><p class="hint" style="margin-top:0">Regla: <b>${ruleLabel(cat.rule)}</b>${cat.format === 'double' ? ' (aplica a ambos)' : ''}</p>`;

  if (me) { // logueado como jugador específico: se anota directo
    if (enrolledIds.has(me.id)) { openModal(`${head}<div class="banner">Ya estás anotado en esta categoría, ${esc(me.firstName)}.</div><div class="row spread" style="margin-top:16px">${close}</div>`); return; }
    const el = eligible(cat, me);
    if (!el.ok) { openModal(`${head}<div class="banner">⛔ No cumplís la regla de esta categoría: ${esc(el.reason)}</div><div class="row spread" style="margin-top:16px">${close}</div>`); return; }
    const body = cat.format === 'double'
      ? `<p>Te anotás como <b>${esc(fullName(me))}</b>.</p><label>Tu compañero/a</label>${sel('se_b', availFor(me.id))}`
      : `<p>Confirmás tu inscripción como <b>${esc(fullName(me))}</b>.</p>`;
    openModal(`${head}${body}<div id="seerr" class="banner" hidden></div>
      <div class="row spread" style="margin-top:16px">${close}<button class="btn btn-primary" onclick="saveSelfEnroll('${tid}','${cid}')">Anotarme</button></div>`);
    return;
  }

  // login genérico (sin jugador asociado): elegís quién sos
  const avail = availFor(null);
  if (!avail.length) { openModal(`${head}<div class="empty">No hay jugadores disponibles que cumplan la regla y no estén ya anotados.</div><div class="row spread" style="margin-top:16px">${close}</div>`); return; }
  const body = cat.format === 'double'
    ? `<label>Vos</label>${sel('se_a', avail)}<label>Tu compañero/a</label>${sel('se_b', avail)}`
    : `<label>Jugador</label>${sel('se_a', avail)}`;
  openModal(`${head}${body}<div id="seerr" class="banner" hidden></div>
    <div class="row spread" style="margin-top:16px">${close}<button class="btn btn-primary" onclick="saveSelfEnroll('${tid}','${cid}')">Anotarme</button></div>`);
}
function saveSelfEnroll(tid, cid) {
  const cat = getCat(tid, cid), e = $('#seerr');
  if (!enrollmentOpen(cat)) { if (e) { e.hidden = false; e.textContent = 'La inscripción se cerró.'; } return; }
  const u = currentUser(), me = u && u.playerId ? u.playerId : null;
  const a = me || ($('#se_a') ? $('#se_a').value : '');
  const b = cat.format === 'double' ? ($('#se_b') ? $('#se_b').value : '') : null;
  if (!a || (cat.format === 'double' && !b)) { e.hidden = false; e.textContent = 'Elegí jugador(es).'; return; }
  if (cat.format === 'double' && a === b) { e.hidden = false; e.textContent = 'Tenés que elegir dos jugadores distintos.'; return; }
  const ids = cat.format === 'double' ? [a, b] : [a];
  const enrolledIds = new Set(cat.entrants.flatMap(x => x.players));
  for (const pid of ids) {
    if (enrolledIds.has(pid)) { e.hidden = false; e.textContent = `${fullName(playerById(pid))} ya está anotado.`; return; }
    const el = eligible(cat, playerById(pid)); if (!el.ok) { e.hidden = false; e.textContent = '⛔ ' + el.reason; return; }
  }
  cat.entrants.push({ id: uid('e_'), players: ids });
  save(DB); closeModal(); render();
}

/* ----- grupos ----- */
function buildGroups(ids, min, max) {
  const n = ids.length;
  if (n < min) return { ok: false, msg: `Hacen falta al menos ${min} (hay ${n}).` };
  let g = null;
  for (let cand = Math.ceil(n / max); cand <= Math.floor(n / min); cand++) {
    const base = Math.floor(n / cand), rem = n % cand;
    if (Array.from({ length: cand }, (_, i) => base + (i < rem ? 1 : 0)).every(s => s >= min && s <= max)) { g = cand; break; }
  }
  if (!g) return { ok: false, msg: `No se pueden armar grupos de ${min} a ${max} con ${n}.` };
  const groups = Array.from({ length: g }, () => []); let i = 0, row = 0;
  while (i < n) { const order = row % 2 === 0 ? [...Array(g).keys()] : [...Array(g).keys()].reverse(); for (const gi of order) if (i < n) groups[gi].push(ids[i++]); row++; }
  return { ok: true, groups };
}
function genMatches(groups) { const m = []; groups.forEach((g, gi) => { for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) m.push({ g: gi, a: g[i], b: g[j], sets: [] }); }); return m; }
function makeGroups(tid, cid) {
  const cat = getCat(tid, cid);
  const ids = cat.entrants.map(e => e.id);
  const res = buildGroups(ids, cat.rules.groupMin, cat.rules.groupMax);
  if (!res.ok) { alert('⚠️ ' + res.msg); return; }
  cat.groups = res.groups; cat.matches = genMatches(res.groups); cat.bracket = null; cat.thirdPlace = null; cat.closed = false; cat.awarded = null;
  save(DB); render();
}
function groupStandings(cat, gi) {
  const ids = cat.groups[gi];
  const s = Object.fromEntries(ids.map(id => [id, { id, pg: 0, sf: 0, sc: 0, pf: 0, pc: 0 }]));
  (cat.matches || []).filter(m => m.g === gi && matchDone(m, cat)).forEach(m => {
    const r = matchResult(m); s[m.a].sf += r.wa; s[m.a].sc += r.wb; s[m.b].sf += r.wb; s[m.b].sc += r.wa;
    (m.sets || []).forEach(([a, b]) => { s[m.a].pf += a; s[m.a].pc += b; s[m.b].pf += b; s[m.b].pc += a; });
    const w = matchWinnerSide(m, cat); if (w === 'a') s[m.a].pg++; else if (w === 'b') s[m.b].pg++;
  });
  return ids.map(id => s[id]).sort((x, y) => y.pg - x.pg || (y.sf - y.sc) - (x.sf - x.sc) || (y.pf - y.pc) - (x.pf - x.pc));
}
const groupStageComplete = cat => cat.matches && cat.matches.length > 0 && cat.matches.every(m => matchDone(m, cat));
function groupCardHtml(cat, gi) {
  const st = groupStandings(cat, gi);
  const rows = st.map((s, i) => `<li><span${i < 2 ? ' style="font-weight:700"' : ''}>${esc(entName(cat, s.id))}</span>
    <span class="muted" style="margin-left:auto;font-size:12px">${s.pg}G · ${s.sf}-${s.sc}${i < 2 ? ' ✅' : ''}</span></li>`).join('');
  const ms = cat.matches.filter(m => m.g === gi).map(m => {
    const idx = cat.matches.indexOf(m), r = matchResult(m), done = matchDone(m, cat), w = matchWinnerSide(m, cat);
    const mesa = done ? '' : tableControl(cat, 'group', idx, null, null, m);
    return `<div class="bmatch"><span class="${w === 'a' ? 'win' : ''}">${esc(entName(cat, m.a))}</span>
      <b class="score">${done ? r.wa + '-' + r.wb : '–'}</b>
      <span class="${w === 'b' ? 'win' : ''}">${esc(entName(cat, m.b))}</span>
      ${isAdmin() ? `<button class="btn btn-ghost btn-sm" onclick="resultModal('${cat._tid}','${cat.id}','group',${idx},null,null)">${done ? '✏️' : 'Cargar'}</button>` : ''}
      ${mesa ? `<div class="bmatch-mesa">${mesa}</div>` : ''}</div>`;
  }).join('');
  return `<div class="group-card"><h4>Grupo ${String.fromCharCode(65 + gi)} · ${cat.groups[gi].length}</h4><ul>${rows}</ul><div class="matches">${ms}</div></div>`;
}

/* ----- bracket ----- */
function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }
function brContender(cat, r, m, side) { if (r === 0) { const mm = cat.bracket[0][m]; return side === 'a' ? mm.a : mm.b; } return brWinner(cat, r - 1, m * 2 + (side === 'a' ? 0 : 1)); }
function brWinner(cat, r, m) {
  const a = brContender(cat, r, m, 'a'), b = brContender(cat, r, m, 'b');
  if (a === 'BYE') return b; if (b === 'BYE') return a; if (a == null || b == null) return null;
  const w = matchWinnerSide(cat.bracket[r][m], cat); return w === 'a' ? a : w === 'b' ? b : null;
}
function semiLoser(cat, idx) { const T = cat.bracket.length, semR = T - 2; if (semR < 0) return null; const w = brWinner(cat, semR, idx); if (!w) return null; const a = brContender(cat, semR, idx, 'a'), b = brContender(cat, semR, idx, 'b'); return w === a ? b : a; }
function generateBracket(tid, cid) {
  const cat = getCat(tid, cid);
  if (!cat.groups) { alert('Primero armá los grupos.'); return; }
  if (!groupStageComplete(cat)) { alert('⚠️ Faltan resultados de la fase de grupos.'); return; }
  const winners = [], runners = [];
  cat.groups.forEach((g, gi) => { const s = groupStandings(cat, gi); if (s[0]) winners.push(s[0].id); if (s[1]) runners.push(s[1].id); });
  if (!winners.length) { alert('No hay clasificados.'); return; }
  const G = winners.length, seeds = [];
  for (let i = 0; i < G; i++) { seeds.push(winners[i]); if (runners.length) seeds.push(runners[(i + 1) % runners.length]); }
  const size = Math.max(2, nextPow2(seeds.length)); while (seeds.length < size) seeds.push('BYE');
  const rounds = [], r0 = []; for (let i = 0; i < seeds.length; i += 2) r0.push({ a: seeds[i], b: seeds[i + 1], sets: [] });
  rounds.push(r0); let c = r0.length; while (c > 1) { const rr = []; for (let i = 0; i < c; i += 2) rr.push({ sets: [] }); rounds.push(rr); c = rr.length; }
  cat.bracket = rounds;
  cat.thirdPlace = rounds.length >= 2 ? { sets: [] } : null; // partido por 3er/4to puesto
  cat.closed = false; cat.awarded = null; save(DB); render();
}
function bracketHtml(cat) {
  const T = cat.bracket.length;
  const rname = r => { const fe = T - 1 - r; return fe === 0 ? 'Final' : fe === 1 ? 'Semifinal' : fe === 2 ? 'Cuartos' : fe === 3 ? 'Octavos' : 'Ronda ' + (r + 1); };
  const slot = (id, w, sc) => `<div class="br-slot ${w ? 'win' : ''}">${id === 'BYE' ? '<i class="muted">BYE</i>' : id ? esc(entName(cat, id)) : '<i class="muted">—</i>'}<span class="br-s">${sc}</span></div>`;
  const cols = cat.bracket.map((round, r) => `<div class="br-col"><div class="br-rtitle">${rname(r)}</div>` +
    round.map((mm, m) => { const a = brContender(cat, r, m, 'a'), b = brContender(cat, r, m, 'b'), res = matchResult(mm), w = brWinner(cat, r, m), done = matchDone(mm, cat);
      const can = isAdmin() && a && b && a !== 'BYE' && b !== 'BYE';
      const mesa = (a && b && a !== 'BYE' && b !== 'BYE' && !done) ? tableControl(cat, 'bracket', null, r, m, mm) : '';
      return `<div class="br-match">${slot(a, w && w === a, done ? res.wa : '')}${slot(b, w && w === b, done ? res.wb : '')}
        ${mesa ? `<div class="br-mesa">${mesa}</div>` : ''}
        ${can ? `<button class="btn br-edit" onclick="resultModal('${cat._tid}','${cat.id}','bracket',null,${r},${m})">${done ? '✏️ editar' : 'Cargar'}</button>` : ''}</div>`;
    }).join('') + `</div>`).join('');
  let extra = '';
  if (cat.thirdPlace) {
    const a = semiLoser(cat, 0), b = semiLoser(cat, 1), res = matchResult(cat.thirdPlace), w = matchWinnerSide(cat.thirdPlace, cat), done = matchDone(cat.thirdPlace, cat);
    const can = isAdmin() && a && b && a !== 'BYE' && b !== 'BYE';
    const mesa = (a && b && a !== 'BYE' && b !== 'BYE' && !done) ? tableControl(cat, 'third', null, null, null, cat.thirdPlace) : '';
    extra = `<div class="br-col"><div class="br-rtitle">3er puesto</div><div class="br-match">
      ${slot(a, w === 'a', done ? res.wa : '')}${slot(b, w === 'b', done ? res.wb : '')}
      ${mesa ? `<div class="br-mesa">${mesa}</div>` : ''}
      ${can ? `<button class="btn br-edit" onclick="resultModal('${cat._tid}','${cat.id}','third',null,null,null)">${done ? '✏️ editar' : 'Cargar'}</button>` : ''}</div></div>`;
  }
  const champ = brWinner(cat, T - 1, 0);
  const champHtml = champ && champ !== 'BYE' ? `<div class="champ">🏆 Campeón: <b>${esc(entName(cat, champ))}</b></div>` : '';
  return `<div class="bracket">${cols}${extra}</div>${champHtml}${awardedHtml(cat)}`;
}
function awardedHtml(cat) {
  if (!cat.awarded) return '';
  const rows = Object.entries(cat.awarded).sort((a, b) => b[1] - a[1]).map(([eid, pts]) => `<li><span>${esc(entName(cat, eid))}</span><span class="pts" style="margin-left:auto">+${pts} pts</span></li>`).join('');
  return `<div class="card" style="margin-top:14px"><h3 style="margin:0 0 8px">Puntos otorgados al ranking</h3><ul class="awarded">${rows}</ul></div>`;
}

/* ----- result modal (per-set) ----- */
function locateMatch(cat, kind, gidx, r, m) {
  if (kind === 'group') { const mm = cat.matches[gidx]; return { mm, a: mm.a, b: mm.b }; }
  if (kind === 'third') { return { mm: cat.thirdPlace, a: semiLoser(cat, 0), b: semiLoser(cat, 1) }; }
  const mm = cat.bracket[r][m]; return { mm, a: brContender(cat, r, m, 'a'), b: brContender(cat, r, m, 'b') };
}
function resultModal(tid, cid, kind, gidx, r, m) {
  const cat = getCat(tid, cid); cat._tid = tid;
  const { mm, a, b } = locateMatch(cat, kind, gidx, r, m);
  if (!a || !b || a === 'BYE' || b === 'BYE') { alert('Faltan definir los dos participantes.'); return; }
  const N = cat.rules.sets;
  let rows = '';
  for (let i = 0; i < N; i++) { const s = (mm.sets && mm.sets[i]) || ['', '']; rows += `<div class="setrow"><span>Set ${i + 1}</span>
    <input class="set-a" type="number" min="0" value="${s[0]}"/><b>–</b><input class="set-b" type="number" min="0" value="${s[1]}"/></div>`; }
  openModal(`<h3>Cargar resultado</h3>
    <div class="row spread" style="font-weight:700;margin:6px 0"><span>${esc(entName(cat, a))}</span><span>${esc(entName(cat, b))}</span></div>
    <p class="muted" style="margin:0 0 8px">Al mejor de ${N} sets (gana quien llega a ${need(cat)}). Cada set a 11, diferencia de 2.</p>
    ${rows}<div id="rerr" class="banner" hidden></div>
    <div class="row spread" style="margin-top:14px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveResult('${tid}','${cid}','${kind}',${gidx ?? 'null'},${r ?? 'null'},${m ?? 'null'})">Guardar</button></div>`);
}
function saveResult(tid, cid, kind, gidx, r, m) {
  const cat = getCat(tid, cid), e = $('#rerr');
  const as = [...$('#modalCard').querySelectorAll('.set-a')], bs = [...$('#modalCard').querySelectorAll('.set-b')];
  const sets = [];
  for (let i = 0; i < as.length; i++) {
    const av = as[i].value.trim(), bv = bs[i].value.trim();
    if (av === '' && bv === '') continue;
    if (av === '' || bv === '') { e.hidden = false; e.textContent = `Set ${i + 1}: cargá ambos puntajes.`; return; }
    const a = parseInt(av, 10), b = parseInt(bv, 10);
    if (!setWinner([a, b])) { e.hidden = false; e.textContent = `Set ${i + 1} inválido (a 11, diferencia de 2). Ej: 11-9, 14-12.`; return; }
    sets.push([a, b]);
  }
  let wa = 0, wb = 0; sets.forEach(s => setWinner(s) === 'a' ? wa++ : wb++);
  const n = need(cat);
  if (wa < n && wb < n) { e.hidden = false; e.textContent = `Faltan sets: alguien tiene que llegar a ${n} sets ganados.`; return; }
  if (wa >= n && wb >= n) { e.hidden = false; e.textContent = 'Resultado inconsistente.'; return; }
  const { mm } = locateMatch(cat, kind, gidx, r, m);
  mm.sets = sets; save(DB); closeModal(); render();
}

/* ----- puntos al ranking ----- */
function placements(cat) {
  const map = {}; if (!cat.bracket) return map;
  const T = cat.bracket.length, S = cat.bracket[0].length * 2;
  const champ = brWinner(cat, T - 1, 0), fa = brContender(cat, T - 1, 0, 'a'), fb = brContender(cat, T - 1, 0, 'b');
  if (champ) { map[champ] = 1; const lo = champ === fa ? fb : fa; if (lo && lo !== 'BYE') map[lo] = 2; }
  if (cat.thirdPlace) { const w = matchWinnerSide(cat.thirdPlace, cat), a = semiLoser(cat, 0), b = semiLoser(cat, 1); if (w === 'a') { if (a) map[a] = 3; if (b) map[b] = 4; } else if (w === 'b') { if (b) map[b] = 3; if (a) map[a] = 4; } }
  for (let r = 0; r < T - 2; r++) { const K = S / Math.pow(2, r); for (let mm = 0; mm < cat.bracket[r].length; mm++) { const w = brWinner(cat, r, mm); if (!w) continue; const a = brContender(cat, r, mm, 'a'), b = brContender(cat, r, mm, 'b'), lo = w === a ? b : a; if (lo && lo !== 'BYE' && !(lo in map)) map[lo] = K; } }
  return map;
}
function awardPoints(tid, cid) {
  const cat = getCat(tid, cid);
  if (cat.closed) return;
  if (!cat.bracket || !brWinner(cat, cat.bracket.length - 1, 0)) { alert('La final todavía no tiene ganador.'); return; }
  if (cat.thirdPlace && !matchDone(cat.thirdPlace, cat)) { alert('Falta el resultado del partido por 3er puesto.'); return; }
  if (!confirm('¿Cerrar la categoría y otorgar los puntos al ranking? (no se puede deshacer)')) return;
  const map = placements(cat); cat.awarded = {};
  Object.entries(map).forEach(([eid, div]) => { const pts = Math.round(cat.championPoints / div); cat.awarded[eid] = pts; const e = entById(cat, eid); if (e) e.players.forEach(pid => { const p = playerById(pid); if (p) { p.points += pts; syncCategory(p); } }); });
  cat.closed = true; save(DB); render();
}

/* ---------------- nav ---------------- */
function go(v) { view = v; closeModal(); window.scrollTo(0, 0); render(); }
document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));

Object.assign(window, { doLogin, logout, go, playerForm, savePlayer, delPlayer, gymForm, saveGym, delGym, tournamentForm, saveTournament, delTournament, categoriaForm, saveCategoria, delCategoria, enrollModal, saveEnrollSingles, enrollDoubles, addTeam, rmTeam, saveEnrollDoubles, toggleEnroll, selfEnrollModal, saveSelfEnroll, makeGroups, generateBracket, resultModal, saveResult, awardPoints, histToggle, histPick, histFilter, saveProfile, changePassword, rankToggle, closeModal, toggleTableSuggestion, editTablesModal, saveTables, setMatchTable });

migrateInitialPoints();        // migración: puntos iniciales (una sola vez)
migrateSeedData();             // migración: jugadores de prueba + fotos servidas (una sola vez)
migratePointsRedistribute();   // migración: redistribución de puntos (Jorge 1º, Paulina 4ta)
ensurePlayerUsers();           // migración: cuenta por jugador (user = inicial+apellido)
DB.players.forEach(syncCategory); // categoría siempre derivada de los puntos
DB.tournaments.forEach(t => t.categorias.forEach(c => { c.rule = catalogRule(c.name); })); // reglas siempre al día con el catálogo
save(DB);
render();
