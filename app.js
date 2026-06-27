/* 🏓 Tenis de Mesa — Dina Huapi & Bariloche — MVP v3 (vanilla JS + localStorage) */
'use strict';

const CATS = ['1ra', '2da', '3ra', '4ta'];
const CITIES = ['Dina Huapi', 'Bariloche'];
const KEY = 'ttdb.v3';
// Cache del tema publicado, para pintar el encabezado al instante (incluso en el login,
// antes de autenticar y de poder leer los ajustes desde Firestore).
const THEME_KEY = 'tt.theme.v1';

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
/* Formatos de sets: además de "todo a N", se admiten combinaciones por fase
   (grupos / llave / final). El número guardado por partido es m.bestOf. */
const SETS_FORMATS = [
  { id: 'all3', label: 'A 3 sets (todo)', groups: 3, bracket: 3, final: 3 },
  { id: 'all5', label: 'A 5 sets (todo)', groups: 5, bracket: 5, final: 5 },
  { id: 'all7', label: 'A 7 sets (todo)', groups: 7, bracket: 7, final: 7 },
  { id: 'g3b5', label: 'Grupos a 3 · Llave a 5', groups: 3, bracket: 5, final: 5 },
  { id: 'g3b5f7', label: 'Grupos a 3 · Llave a 5 · Final a 7', groups: 3, bracket: 5, final: 7 },
  { id: 'g5b5f7', label: 'Grupos a 5 · Llave a 5 · Final a 7', groups: 5, bracket: 5, final: 7 },
  { id: 'g3b7', label: 'Grupos a 3 · Llave a 7', groups: 3, bracket: 7, final: 7 },
  { id: 'g5b7', label: 'Grupos a 5 · Llave a 7', groups: 5, bracket: 7, final: 7 },
];
const setsFmtById = id => SETS_FORMATS.find(f => f.id === id) || SETS_FORMATS[1]; // default: a 5 sets
// Formato de sets efectivo de una categoría (cae al legacy rules.sets si no tiene setsFormat).
function catSetsFmt(cat) {
  if (cat && cat.setsFormat) return setsFmtById(cat.setsFormat);
  const n = (cat && cat.rules && cat.rules.sets) || 5;
  return { id: 'all' + n, label: `A ${n} sets`, groups: n, bracket: n, final: n };
}
// Catálogo global de categorías (lo administra el admin; se guarda en app/settings → solo admin escribe).
// Si todavía no se sembró, devuelve uno derivado del CATALOG fijo para que la app siempre funcione.
// Catálogo de categorías EFECTIVO de la escuela del contexto: su propio override → el global heredado → defaults.
function catCatalog() {
  const b = settingsBag('school', ctxSchoolId());
  const c = (b && b.categoryCatalog) || (DB.settings && DB.settings.categoryCatalog);
  if (Array.isArray(c) && c.length) return c;
  return CATALOG.map(x => ({ id: 'cc_' + x.name, name: x.name, rule: x.rule, format: 'single', setsFormat: 'all5', groupMin: 3, groupMax: 4, championPoints: 20, cost: 0 }));
}
// Lista de catálogo PROPIA de la escuela del contexto (copy-on-write desde el efectivo). null si no hay escuela.
function schoolCatalog() {
  const bag = settingsBag('school', ctxSchoolId(), true); if (!bag) return null;
  if (!Array.isArray(bag.categoryCatalog) || !bag.categoryCatalog.length) bag.categoryCatalog = catCatalog().map(x => Object.assign({}, x));
  return bag.categoryCatalog;
}
const catEntryByName = name => catCatalog().find(c => c.name === name) || null;
const catalogRule = name => (catEntryByName(name) || CATALOG.find(c => c.name === name) || {}).rule || { type: 'open' };
// Crea una categoría de torneo heredando las reglas del catálogo global.
function newCategoryFromCatalog(nm) {
  const cc = catEntryByName(nm) || {};
  const setsFormat = cc.setsFormat || 'all5';
  return {
    id: uid('c_'), name: nm, format: cc.format || 'single', gender: cc.gender || 'any', rule: cc.rule || catalogRule(nm),
    setsFormat, rules: { sets: setsFmtById(setsFormat).bracket, groupMin: cc.groupMin || 3, groupMax: cc.groupMax || 4 },
    championPoints: cc.championPoints != null ? cc.championPoints : 20,
    cost: cc.cost != null ? cc.cost : 0,
    entrants: [], groups: null, matches: null, bracket: null, thirdPlace: null, closed: false, enrollOverride: null,
  };
}
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
  // Regla de género (singles y dobles femenino/masculino; "mixto" se valida a nivel pareja).
  if (cat.gender === 'female' && genderOf(p) !== 'F') return { ok: false, reason: `${cat.name}: es solo para mujeres (${fullName(p)} figura como varón).` };
  if (cat.gender === 'male' && genderOf(p) !== 'M') return { ok: false, reason: `${cat.name}: es solo para varones (${fullName(p)} figura como mujer).` };
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
/* ---------------- género (para dobles femenino / mixto) ---------------- */
const FEMALE_NAMES = ['sabrina', 'victoria', 'paulina', 'aldana', 'maria', 'ana', 'lucia', 'sofia', 'martina', 'valentina', 'camila', 'julieta', 'florencia', 'agustina', 'carla', 'carolina', 'daniela', 'gabriela', 'rocio', 'belen', 'micaela', 'antonella', 'jimena', 'romina', 'natalia', 'noelia', 'vanesa', 'melina', 'abril', 'catalina', 'renata', 'emma', 'mia', 'laura', 'paula', 'sandra', 'silvia', 'andrea', 'cecilia', 'veronica', 'patricia', 'guadalupe', 'milagros', 'ailen', 'malena', 'pilar', 'delfina', 'morena', 'zoe', 'isabella', 'luciana', 'agostina', 'brenda', 'tamara', 'yamila', 'macarena', 'priscila', 'nayla', 'ivana', 'estefania', 'fernanda'];
const norm1 = s => (s || '').trim().toLowerCase().split(/\s+/)[0].normalize('NFD').replace(/[̀-ͯ]/g, '');
// Adivina el género por el nombre de pila (lista de nombres + heurística "termina en a"). El admin lo puede corregir.
function guessGender(firstName) {
  const n = norm1(firstName); if (!n) return 'M';
  if (FEMALE_NAMES.includes(n)) return 'F';
  if (/a$/.test(n)) return 'F';   // heurística (la mayoría de nombres femeninos terminan en a)
  return 'M';
}
const genderOf = p => (p && p.gender) || (p ? guessGender(p.firstName) : 'M');
// ¿La pareja cumple la regla de género de la categoría de dobles? (any / female / male / mixed)
function pairGenderOk(cat, pidA, pidB) {
  const g = cat.gender || 'any'; if (g === 'any') return { ok: true };
  const a = genderOf(playerById(pidA)), b = genderOf(playerById(pidB));
  if (g === 'female') return (a === 'F' && b === 'F') ? { ok: true } : { ok: false, reason: 'Dobles femenino: las dos integrantes deben ser mujeres.' };
  if (g === 'male') return (a === 'M' && b === 'M') ? { ok: true } : { ok: false, reason: 'Dobles masculino: los dos integrantes deben ser varones.' };
  if (g === 'mixed') return (a !== b) ? { ok: true } : { ok: false, reason: 'Dobles mixto: la pareja debe ser un varón y una mujer.' };
  return { ok: true };
}
const GENDER_RULE_LABEL = { female: '♀ Femenino', male: '♂ Masculino', mixed: '⚥ Mixto' };
const genderField = (id, cur) => `<select id="${id}"><option value="M" ${cur === 'M' ? 'selected' : ''}>Varón</option><option value="F" ${cur === 'F' ? 'selected' : ''}>Mujer</option></select>`;

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
    let base = (p.username || usernameFor(p) || 'jugador'), un = base, i = 2;
    while (taken.has(un)) { un = base + i; i++; }
    taken.add(un);
    if (!p.username) p.username = un;   // username canónico, también en el jugador
    DB.users.push({ username: un, password: un, role: 'player', name: fullName(p), playerId: p.id });
    added++;
  });
  return added;
}
// ¿El username ya lo tiene otro jugador o cuenta? (case-insensitive; excluye al propio jugador al editar)
function usernameTaken(uname, exceptPlayerId) {
  uname = (uname || '').toLowerCase();
  return (DB.players || []).some(p => p.id !== exceptPlayerId && (p.username || '').toLowerCase() === uname)
    || (DB.users || []).some(u => u.playerId !== exceptPlayerId && (u.username || '').toLowerCase() === uname);
}
// Garantiza que TODO jugador tenga username (de su cuenta si la hay; si no, inicial+apellido deduplicado).
// Devuelve la lista de los que se completaron (para avisar). Corre en cada carga (idempotente).
function backfillUsernames() {
  const players = DB.players || [], taken = new Set();
  players.forEach(p => p.username && taken.add(p.username.toLowerCase()));
  (DB.users || []).forEach(u => u.username && taken.add(u.username.toLowerCase()));
  const filled = [];
  players.forEach(p => {
    if (p.username) return;
    const acc = (DB.users || []).find(u => u.playerId === p.id);
    if (acc && acc.username) { p.username = acc.username; taken.add(acc.username.toLowerCase()); filled.push(`${fullName(p)} → ${acc.username} (de su cuenta)`); return; }
    let base = (usernameFor(p) || 'jugador').toLowerCase(), un = base, i = 2;
    while (taken.has(un)) { un = base + i; i++; }
    p.username = un; taken.add(un); filled.push(`${fullName(p)} → ${un} (auto)`);
  });
  return filled;
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
// Organizaciones y escuelas por defecto (ids estables para referenciarlos desde users/players/torneos).
function defaultOrgs() {
  return [
    { id: 'org_byd', name: 'Bariloche&DinaHuapi', schools: [{ id: 'sch_bari', name: 'Bariloche', logo: '🏔️' }, { id: 'sch_dina', name: 'Dina', logo: '🌊' }] },
    { id: 'org_otra', name: 'Otra', schools: [{ id: 'sch_otra', name: 'General', logo: '🏓' }] },
  ];
}
const DEFAULT_SCHOOL_LOGO = '🏫';
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
    id: uid('p_'), firstName, lastName, dob, city, category, points: 0, openPoints: 0, photo: null,
    orgId: 'org_byd', schoolId: city === 'Dina Huapi' ? 'sch_dina' : 'sch_bari', // escuela por localidad
  }));
  const mkCat = (name, format, extra = {}) => ({
    id: uid('c_'), name, format, rule: catalogRule(name), rules: { sets: 5, groupMin: 3, groupMax: 4 },
    championPoints: 20, entrants: [], groups: null, matches: null, bracket: null, thirdPlace: null, closed: false, ...extra,
  });
  const mayores = mkCat('Mayores', 'single');
  mayores.entrants = players.slice(0, 8).map(p => ({ id: uid('e_'), players: [p.id] })); // listo para correr la demo
  const gyms = defaultGyms();
  const db = {
    orgs: defaultOrgs(),
    players, gyms,
    tournaments: [{
      id: uid('t_'), name: 'Apertura Patagónico 2026', date: '2026-07-11', dateEnd: '2026-07-12', gymId: gyms[0].id,
      orgId: 'org_byd', schoolId: 'sch_bari', open: true, // abierto a toda la organización
      categorias: [mayores, mkCat('Tercera', 'single'), mkCat('Sub 15', 'single'), mkCat('Maxi 40', 'single')],
    }],
    users: [
      { username: 'admin', password: 'admin', role: 'superadmin', name: 'Super Admin', phone: ADMIN_PHONE },
      { username: 'adminBari', password: 'adminBari', role: 'admin', name: 'Admin Bariloche', orgId: 'org_byd', schoolId: 'sch_bari', phone: ADMIN_PHONE },
      { username: 'adminDina', password: 'adminDina', role: 'admin', name: 'Admin Dina', orgId: 'org_byd', schoolId: 'sch_dina', phone: ADMIN_PHONE },
      { username: 'jugador', password: 'jugador', role: 'player', name: 'Jugador', orgId: 'org_byd', schoolId: 'sch_bari' },
    ],
  };
  save(db); return db;
}
function load() { try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch (e) {} return seed(); }
const FB = () => window.STORE && window.STORE.enabled;        // ¿estamos usando Firebase?
// save(): guarda en localStorage (cache) y, si hay Firebase, sincroniza a Firestore en segundo plano.
function save(db) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} if (FB()) window.STORE.sync(db); }

/* ---------------- apariencia / tema ---------------- */
// Tema editable por el admin. Los colores se aplican como variables CSS en :root;
// la fuente y el emoji principal se reflejan en vivo. Todo se guarda en DB.settings.theme.
const DEFAULT_THEME = { bg: '#f4f6f8', card: '#ffffff', table: '#1e6b3a', ball: '#ff7a1a', paddle: '#c1121f', ink: '#1d2433', muted: '#6b7280', line: '#e6e9ee', ok: '#16a34a', font: 'system', emoji: '🏓' };
// Fuentes disponibles. Son stacks con fuentes de sistema (Windows/macOS/Android/Linux) y un genérico
// al final, así que en cada dispositivo se usa la que esté presente (sin descargas externas).
const FONTS = {
  system: { label: 'Sistema (predeterminada)', stack: '"Segoe UI",system-ui,-apple-system,Roboto,sans-serif' },
  // —— Sans serif ——
  arial: { label: 'Arial', stack: 'Arial,Helvetica,sans-serif' },
  helvetica: { label: 'Helvetica Neue', stack: '"Helvetica Neue",Helvetica,Arial,sans-serif' },
  verdana: { label: 'Verdana', stack: 'Verdana,Geneva,sans-serif' },
  tahoma: { label: 'Tahoma', stack: 'Tahoma,Geneva,Verdana,sans-serif' },
  trebuchet: { label: 'Trebuchet MS', stack: '"Trebuchet MS",Helvetica,sans-serif' },
  segoe: { label: 'Segoe UI', stack: '"Segoe UI",Tahoma,sans-serif' },
  calibri: { label: 'Calibri', stack: 'Calibri,"Segoe UI",sans-serif' },
  candara: { label: 'Candara', stack: 'Candara,"Segoe UI",sans-serif' },
  corbel: { label: 'Corbel', stack: 'Corbel,"Segoe UI",sans-serif' },
  gillsans: { label: 'Gill Sans', stack: '"Gill Sans","Gill Sans MT",Calibri,sans-serif' },
  franklin: { label: 'Franklin Gothic', stack: '"Franklin Gothic Medium","Arial Narrow",Arial,sans-serif' },
  centurygothic: { label: 'Century Gothic', stack: '"Century Gothic","Apple Gothic",sans-serif' },
  optima: { label: 'Optima', stack: 'Optima,Segoe,"Segoe UI",Candara,sans-serif' },
  futura: { label: 'Futura', stack: 'Futura,"Trebuchet MS",Arial,sans-serif' },
  avantgarde: { label: 'Avant Garde', stack: '"Century Gothic","URW Gothic L",sans-serif' },
  lucidasans: { label: 'Lucida Sans', stack: '"Lucida Sans Unicode","Lucida Grande",sans-serif' },
  geneva: { label: 'Geneva', stack: 'Geneva,Tahoma,Verdana,sans-serif' },
  dejavusans: { label: 'DejaVu Sans', stack: '"DejaVu Sans",Verdana,sans-serif' },
  roboto: { label: 'Roboto', stack: 'Roboto,"Segoe UI",sans-serif' },
  opensans: { label: 'Open Sans', stack: '"Open Sans","Segoe UI",sans-serif' },
  notosans: { label: 'Noto Sans', stack: '"Noto Sans","Segoe UI",sans-serif' },
  ubuntu: { label: 'Ubuntu', stack: 'Ubuntu,"Segoe UI",sans-serif' },
  cantarell: { label: 'Cantarell', stack: 'Cantarell,"Segoe UI",sans-serif' },
  segoeprint: { label: 'Segoe Print', stack: '"Segoe Print","Segoe UI",sans-serif' },
  sansgeneric: { label: 'Sans serif (genérica)', stack: 'sans-serif' },
  // —— Serif ——
  georgia: { label: 'Georgia', stack: 'Georgia,"Times New Roman",serif' },
  times: { label: 'Times New Roman', stack: '"Times New Roman",Times,serif' },
  garamond: { label: 'Garamond', stack: 'Garamond,Baskerville,"Baskerville Old Face",serif' },
  baskerville: { label: 'Baskerville', stack: 'Baskerville,"Baskerville Old Face",Georgia,serif' },
  palatino: { label: 'Palatino', stack: '"Palatino Linotype","Book Antiqua",Palatino,serif' },
  bookantiqua: { label: 'Book Antiqua', stack: '"Book Antiqua",Palatino,serif' },
  cambria: { label: 'Cambria', stack: 'Cambria,Georgia,serif' },
  constantia: { label: 'Constantia', stack: 'Constantia,Georgia,serif' },
  didot: { label: 'Didot', stack: 'Didot,"Bodoni MT",Georgia,serif' },
  bodoni: { label: 'Bodoni MT', stack: '"Bodoni MT",Didot,serif' },
  rockwell: { label: 'Rockwell', stack: 'Rockwell,"Courier Bold",Georgia,serif' },
  hoefler: { label: 'Hoefler Text', stack: '"Hoefler Text",Georgia,serif' },
  perpetua: { label: 'Perpetua', stack: 'Perpetua,Baskerville,serif' },
  goudy: { label: 'Goudy Old Style', stack: '"Goudy Old Style",Garamond,serif' },
  bigcaslon: { label: 'Big Caslon', stack: '"Big Caslon","Book Antiqua",serif' },
  lucidabright: { label: 'Lucida Bright', stack: '"Lucida Bright",Georgia,serif' },
  merriweather: { label: 'Merriweather', stack: 'Merriweather,Georgia,serif' },
  playfair: { label: 'Playfair Display', stack: '"Playfair Display",Georgia,serif' },
  serifgeneric: { label: 'Serif (genérica)', stack: 'serif' },
  // —— Monoespaciadas ——
  courier: { label: 'Courier New', stack: '"Courier New",Courier,monospace' },
  consolas: { label: 'Consolas', stack: 'Consolas,"Lucida Console",monospace' },
  lucidaconsole: { label: 'Lucida Console', stack: '"Lucida Console",Monaco,monospace' },
  monaco: { label: 'Monaco', stack: 'Monaco,Consolas,monospace' },
  menlo: { label: 'Menlo', stack: 'Menlo,Monaco,"Courier New",monospace' },
  cascadia: { label: 'Cascadia Code', stack: '"Cascadia Code",Consolas,monospace' },
  dejavumono: { label: 'DejaVu Sans Mono', stack: '"DejaVu Sans Mono","Courier New",monospace' },
  sourcecode: { label: 'Source Code Pro', stack: '"Source Code Pro",Consolas,monospace' },
  firacode: { label: 'Fira Code', stack: '"Fira Code",Consolas,monospace' },
  monogeneric: { label: 'Monoespaciada (genérica)', stack: 'monospace' },
  // —— Decorativas / manuscritas ——
  comicsans: { label: 'Comic Sans MS', stack: '"Comic Sans MS","Comic Sans",cursive' },
  impact: { label: 'Impact', stack: 'Impact,Haettenschweiler,"Arial Narrow Bold",sans-serif' },
  copperplate: { label: 'Copperplate', stack: 'Copperplate,"Copperplate Gothic Light",fantasy' },
  papyrus: { label: 'Papyrus', stack: 'Papyrus,fantasy' },
  brushscript: { label: 'Brush Script', stack: '"Brush Script MT",cursive' },
  luminari: { label: 'Luminari', stack: 'Luminari,fantasy' },
  chalkduster: { label: 'Chalkduster', stack: 'Chalkduster,fantasy' },
  bradley: { label: 'Bradley Hand', stack: '"Bradley Hand",cursive' },
  snell: { label: 'Snell Roundhand', stack: '"Snell Roundhand",cursive' },
  segoescript: { label: 'Segoe Script', stack: '"Segoe Script",cursive' },
  inkfree: { label: 'Ink Free', stack: '"Ink Free",cursive' },
  cursivegeneric: { label: 'Manuscrita (genérica)', stack: 'cursive' },
};
// Ajustes por defecto del sitio (se completan los que falten en applyMigrations).
const DEFAULT_SETTINGS = { tableSuggestion: false, paymentsAllowed: true, paymentsEnabled: false, mpWorkerUrl: '', matchTimeEstimates: false, news: true, reglamento: false, reglamentoText: '', reglamentoPublished: false, doublesRanking: false, schoolRanking: true, playerCard: true, gymViewAllowed: false, gymViewEnabled: false, theme: DEFAULT_THEME };
// Ajustes con alcance por ESCUELA (los controla el admin de la escuela, afectan solo a sus miembros)
// y por ORGANIZACIÓN (los controla el superadmin, afectan a todos los miembros de la organización).
const SCHOOL_SETTING_KEYS = ['tableSuggestion', 'paymentsEnabled', 'matchTimeEstimates', 'news', 'reglamento', 'reglamentoText', 'reglamentoPublished', 'playerCard', 'gymViewEnabled'];
const ORG_SETTING_KEYS = ['doublesRanking', 'schoolRanking', 'paymentsAllowed', 'gymViewAllowed'];
// Valor heredado (top-level de DB.settings) cuando una escuela/org no tiene override propio.
function defaultSetting(key) { const s = DB.settings || {}; return key in s ? s[key] : DEFAULT_SETTINGS[key]; }
// Bolsa de ajustes de una escuela/org. Viven DENTRO de DB.settings para que sincronicen con app/settings.
function settingsBag(scope, id, create) {
  if (!DB.settings) DB.settings = Object.assign({}, DEFAULT_SETTINGS);
  const rootKey = scope === 'org' ? 'orgs' : 'schools';
  const root = DB.settings[rootKey] || (create ? (DB.settings[rootKey] = {}) : null);
  if (!root || !id) return null;
  if (!root[id] && create) root[id] = {};
  return root[id] || null;
}
// Lectura EFECTIVA de un ajuste para quien está mirando: su escuela/org (el superadmin usa el contexto elegido).
function setting(key) {
  if (ORG_SETTING_KEYS.includes(key)) { const b = settingsBag('org', ctxOrgId()); return b && key in b ? b[key] : defaultSetting(key); }
  if (SCHOOL_SETTING_KEYS.includes(key)) { const b = settingsBag('school', ctxSchoolId()); return b && key in b ? b[key] : defaultSetting(key); }
  return defaultSetting(key);
}
// Alterna un ajuste con alcance de escuela u organización (según la clave) y re-renderiza.
function toggleScopedSetting(key) {
  const org = ORG_SETTING_KEYS.includes(key);
  const id = org ? ctxOrgId() : ctxSchoolId(); if (!id) return;
  const bag = settingsBag(org ? 'org' : 'school', id, true);
  const cur = key in bag ? bag[key] : defaultSetting(key);
  bag[key] = !cur; save(DB); render();
}
// La carta tipo FUT del perfil está activa salvo que el admin de la escuela la apague (default: encendida).
const cardEnabled = () => setting('playerCard') !== false;
// Borrador de tema mientras el admin edita Apariencia (null = sin cambios pendientes).
// La vista previa usa el borrador; el sitio recién cambia para todos al "Publicar".
let themeDraft = null;
let schoolDraft = null; // edits pendientes de escuelas (nombre/logo) en Apariencia: { [schoolId]: {orgId, name, logo} }
// Aclara/oscurece un color hex (amt en [-1,1]) — usado para derivar --table-dark.
function shadeHex(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim()); if (!m) return hex;
  const n = parseInt(m[1], 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = v => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt);
  r = f(r); g = f(g); b = f(b);
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}
// Tema guardado de la escuela del que mira (su override propio → el global heredado → defaults)
// y tema "en edición" (borrador o guardado). El admin lo edita por escuela; el superadmin, la del contexto.
function schoolThemeRaw() { const b = settingsBag('school', ctxSchoolId()); return (b && b.theme) || (DB.settings && DB.settings.theme) || {}; }
const savedThemeOf = () => Object.assign({}, DEFAULT_THEME, schoolThemeRaw());
const themeOf = () => Object.assign({}, DEFAULT_THEME, themeDraft || schoolThemeRaw());
const themeDirty = () => JSON.stringify(themeOf()) !== JSON.stringify(savedThemeOf());
// Aplica un tema concreto a las variables CSS, el color de la barra, el emoji y el logo.
function setThemeVars(t) {
  const r = document.documentElement.style;
  r.setProperty('--bg', t.bg);
  r.setProperty('--card', t.card);
  r.setProperty('--table', t.table);
  r.setProperty('--table-dark', shadeHex(t.table, -0.22));
  r.setProperty('--ball', t.ball);
  r.setProperty('--paddle', t.paddle);
  r.setProperty('--ink', t.ink);
  r.setProperty('--muted', t.muted);
  r.setProperty('--line', t.line);
  r.setProperty('--ok', t.ok);
  r.setProperty('--app-font', (FONTS[t.font] || FONTS.system).stack);
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', t.table);
  document.querySelectorAll('.app-emoji').forEach(el => { el.textContent = t.emoji; });
  // En la barra superior: si el emoji es el de fábrica se conserva el logo SVG; si se personaliza, se muestra el emoji.
  const custom = t.emoji !== DEFAULT_THEME.emoji;
  document.querySelectorAll('.logo-svg').forEach(el => { el.style.display = custom ? 'none' : ''; });
  document.querySelectorAll('.logo-emoji').forEach(el => { el.style.display = custom ? '' : 'none'; });
}
function cacheTheme(t) { try { localStorage.setItem(THEME_KEY, JSON.stringify(t)); } catch (e) {} }
// Tema cacheado (última publicación vista en este dispositivo) o null si no hay.
const cachedTheme = () => { try { const r = localStorage.getItem(THEME_KEY); return r ? Object.assign({}, DEFAULT_THEME, JSON.parse(r)) : null; } catch (e) { return null; } };
// Pinta el tema cacheado lo antes posible (en el login, antes de autenticar). Si no hay cache, no hace nada.
function applyCachedTheme() { const c = cachedTheme(); if (c) setThemeVars(c); }
// Tema que se debe MOSTRAR ahora mismo (única fuente de verdad para colores, fuente y emoji):
//  - en Apariencia, el borrador en edición;
//  - si ya cargaron los datos reales, el guardado;
//  - pre-login en modo Firebase (datos aún no cargados), el cacheado (o el guardado/defaults).
function effectiveTheme() {
  if (view === 'apariencia' && themeDraft) return themeOf();
  if (!FB() || _loaded) return savedThemeOf();
  return cachedTheme() || savedThemeOf();
}
function applyTheme() {
  const loaded = (!FB() || _loaded);
  const draftPreview = (view === 'apariencia' && themeDraft);
  setThemeVars(effectiveTheme());
  // Cacheamos solo el tema real ya cargado (no el borrador, ni los defaults previos al login en modo Firebase).
  if (!draftPreview && loaded) cacheTheme(savedThemeOf());
}

// orgs se inicializa ya (no se persiste en Firestore; siempre son las por defecto). Es clave que exista
// ANTES de loguear: la pantalla de registro usa DB.orgs en el login, cuando applyMigrations() aún no corrió.
let DB = { players: [], gyms: [], tournaments: [], users: [], news: [], payAccounts: [], payments: [], orgs: defaultOrgs(), settings: Object.assign({}, DEFAULT_SETTINGS) };
// Migraciones aditivas (no destructivas) sobre el DB ya cargado en memoria.
function applyMigrations() {
  if (!DB.gyms) DB.gyms = defaultGyms();
  if (!DB.news) DB.news = [];
  if (!Array.isArray(DB.payAccounts)) DB.payAccounts = []; // cuentas de cobro (MercadoPago) por admin
  if (!Array.isArray(DB.payments)) DB.payments = [];       // historial de pagos (lo escribe el Worker)
  // Organizaciones / escuelas (sistema multi-org). Datos viejos → Bariloche&DinaHuapi / escuela por localidad.
  if (!Array.isArray(DB.orgs) || !DB.orgs.length) DB.orgs = defaultOrgs();
  // logo por escuela (emoji por defecto si falta) + acumulador de puntos en torneos abiertos
  DB.orgs.forEach(o => (o.schools || []).forEach(s => { if (!s.logo) s.logo = DEFAULT_SCHOOL_LOGO; }));
  (DB.players || []).forEach(p => { if (!p.orgId) p.orgId = 'org_byd'; if (!p.schoolId) p.schoolId = (p.city === 'Dina Huapi' ? 'sch_dina' : 'sch_bari'); if (typeof p.openPoints !== 'number') p.openPoints = 0; });
  (DB.tournaments || []).forEach(t => { if (!t.orgId) t.orgId = 'org_byd'; if (!t.schoolId) t.schoolId = 'sch_bari'; if (typeof t.open !== 'boolean') t.open = true; });
  (DB.users || []).forEach(u => { if (u.role === 'admin' && !u.orgId && !u.schoolId) u.role = 'superadmin'; }); // admin viejo (global) → superadmin
  if (!FB()) { // en modo local, asegurar los admins de escuela
    const ensureAdmin = (username, name, schoolId) => { if (!(DB.users || []).some(u => u.username === username)) (DB.users = DB.users || []).push({ username, password: username, role: 'admin', name, orgId: 'org_byd', schoolId }); };
    ensureAdmin('adminBari', 'Admin Bariloche', 'sch_bari');
    ensureAdmin('adminDina', 'Admin Dina', 'sch_dina');
  }
  if (!DB.settings) DB.settings = {};
  // completa ajustes faltantes sin pisar los ya configurados
  Object.keys(DEFAULT_SETTINGS).forEach(k => { if (DB.settings[k] === undefined) DB.settings[k] = DEFAULT_SETTINGS[k]; });
  DB.settings.theme = Object.assign({}, DEFAULT_THEME, DB.settings.theme || {});
  // Nombre/logo de escuela editados en Apariencia: DB.orgs NO se sincroniza, así que el override
  // editable se guarda en settings (sí sincronizado) y se reaplica sobre las escuelas al cargar.
  if (DB.settings.schoolMeta) DB.orgs.forEach(o => (o.schools || []).forEach(s => { const ov = DB.settings.schoolMeta[s.id]; if (ov) { if (ov.name) s.name = ov.name; if (ov.logo) s.logo = ov.logo; } }));
  if (!Array.isArray(DB.settings.pairs)) DB.settings.pairs = []; // ranking de dobles (por pareja)
  DB.settings.pairs.forEach(pr => { if (!pr.catName) pr.catName = 'Dobles'; }); // parejas viejas → bucket genérico
  (DB.players || []).forEach(p => { if (!p.gender) p.gender = guessGender(p.firstName); }); // género (mujer/varón) por nombre
  backfillUsernames(); // todo jugador debe tener username (canónico en el jugador)
  // Catálogo global de categorías: se siembra una vez desde el CATALOG fijo (luego lo edita el admin).
  if (!Array.isArray(DB.settings.categoryCatalog) || !DB.settings.categoryCatalog.length) {
    DB.settings.categoryCatalog = CATALOG.map(c => ({ id: uid('cc_'), name: c.name, rule: c.rule, format: 'single', setsFormat: 'all5', groupMin: 3, groupMax: 4, championPoints: 20, cost: 0 }));
  }
  DB.settings.categoryCatalog.forEach(c => { if (c.cost == null) c.cost = 0; }); // costo de inscripción por defecto
  if (!DB.users) DB.users = [];
  (DB.tournaments || []).forEach(t => {
    if (t.tableCount == null) t.tableCount = 4;
    if (!Array.isArray(t.collaborators)) t.collaborators = [];
    if (typeof t.enrollClosed !== 'boolean') t.enrollClosed = false;
    if (typeof t.published !== 'boolean') t.published = true; // torneos existentes ya estaban "publicados"
    if (typeof t.finished !== 'boolean') t.finished = false;
    if (typeof t.started !== 'boolean') t.started = true; // torneos previos a esta feature: ya en curso (no los bloqueamos)
    t.categorias.forEach(c => {
      if (c.enrollOverride === undefined) c.enrollOverride = (c.enrollClosed === true) ? 'closed' : null;
      delete c.enrollClosed; // reemplazado por enrollOverride ('open' | 'closed' | null = hereda del torneo)
      if (c.championPoints == null) c.championPoints = 20;
      else if (c.championPoints > 20) c.championPoints = 20; // tope del valor de torneo
      if (c.cost == null) c.cost = 0; // costo de inscripción de la categoría en este torneo
    });
  });
}
const gymById = id => (DB.gyms || []).find(g => g.id === id);
const tableCountOf = t => (t && t.tableCount != null) ? t.tableCount : 4;

/* ---------------- session ---------------- */
let _session = null; // sesión en memoria (modo Firebase)
let _liveOn = false, _livePending = false; // sincronización en vivo (listeners de Firestore)
const currentUser = () => { if (FB()) return _session; try { return JSON.parse(sessionStorage.getItem('ttuser')); } catch (e) { return null; } };
const setUser = u => { if (FB()) { _session = u; } else if (u) sessionStorage.setItem('ttuser', JSON.stringify(u)); else sessionStorage.removeItem('ttuser'); };
// Modo local: la sesión guarda rol/escuela al ingresar; si la BD cambió (ej. migración admin→superadmin),
// refrescamos esos datos para que no quede una sesión "vieja" con permisos desactualizados.
function reconcileLocalSession() {
  if (FB()) return;
  const u = currentUser(); if (!u || !u.username) return;
  const rec = (DB.users || []).find(x => x.username === u.username); if (!rec) return;
  const fresh = { username: rec.username, role: rec.role, name: rec.name, playerId: rec.playerId || null, orgId: rec.orgId || null, schoolId: rec.schoolId || null };
  if (JSON.stringify(fresh) !== JSON.stringify({ username: u.username, role: u.role, name: u.name, playerId: u.playerId || null, orgId: u.orgId || null, schoolId: u.schoolId || null })) setUser(fresh);
}
// Modo Firebase: cuentas creadas antes del sistema multi-escuela no tienen org/escuela en su user doc,
// y el admin global viejo sigue con rol 'admin'. Los reparamos al iniciar sesión (y lo persistimos).
async function reconcileFbSession() {
  if (!FB() || !_session || !_session.uid) return;
  let { role, orgId, schoolId, playerId } = _session, changed = false;
  // admin global viejo (sin org/escuela) → superadmin. Endurecido: solo si AÚN no existe ningún
  // superadmin (evita que un doc admin malformado escale una vez que ya hay un superadmin establecido).
  if (role === 'admin' && !orgId && !schoolId && !(DB.users || []).some(u => u.role === 'superadmin')) { role = 'superadmin'; changed = true; }
  if (role === 'player' && playerId) { // jugador sin escuela → tomar la de su ficha (ya migrada)
    const p = (DB.players || []).find(x => x.id === playerId);
    if (p) { if (!orgId && p.orgId) { orgId = p.orgId; changed = true; } if (!schoolId && p.schoolId) { schoolId = p.schoolId; changed = true; } }
  }
  if (changed) {
    _session = Object.assign({}, _session, { role, orgId, schoolId });
    try { await window.STORE.setUserDoc(_session.uid, { role, orgId: orgId || null, schoolId: schoolId || null }); } catch (e) {}
  }
}
// Roles: superadmin (edita todo), admin (de una escuela), player.
const isSuperadmin = () => { const u = currentUser(); return !!(u && u.role === 'superadmin'); };
const isSchoolAdmin = () => { const u = currentUser(); return !!(u && u.role === 'admin'); };
const isAdmin = () => { const u = currentUser(); return !!(u && (u.role === 'admin' || u.role === 'superadmin')); }; // "puede administrar"
// ---- organizaciones / escuelas ----
const orgById = id => (DB.orgs || []).find(o => o.id === id) || null;
const schoolById = (orgId, schoolId) => { const o = orgById(orgId); return o ? (o.schools || []).find(s => s.id === schoolId) || null : null; };
const orgName = id => { const o = orgById(id); return o ? o.name : '—'; };
// "Invitado": jugador de la organización SIN escuela (schoolId = GUEST_SCHOOL). Figura como "Invitados",
// no suma a ningún ranking y solo puede anotarse a torneos ABIERTOS de su organización.
const GUEST_SCHOOL = 'guest';
const isGuest = p => !!p && p.schoolId === GUEST_SCHOOL;
const schoolName = (orgId, schoolId) => { if (schoolId === GUEST_SCHOOL) return 'Invitados'; const s = schoolById(orgId, schoolId); return s ? s.name : '—'; };
const schoolLogo = (orgId, schoolId) => { if (schoolId === GUEST_SCHOOL) return '🎟️'; const s = schoolById(orgId, schoolId); return (s && s.logo) || DEFAULT_SCHOOL_LOGO; };
// Marca visual del logo (emoji o imagen) — círculo chiquito bajo la foto del jugador.
function schoolBadgeHtml(p) {
  if (!p || !p.schoolId) return '';
  const logo = schoolLogo(p.orgId, p.schoolId), title = esc(schoolName(p.orgId, p.schoolId));
  const inner = /^(data:|https?:)/.test(logo) ? `<img src="${logo}" alt=""/>` : esc(logo);
  return `<span class="school-badge" title="${title}">${inner}</span>`;
}
// Jugadores del contexto: de una escuela / de toda la organización (sin pendientes salvo que se pida).
const playersOfSchool = (schoolId, orgId) => (DB.players || []).filter(p => !p.pending && p.schoolId === schoolId && (!orgId || p.orgId === orgId));
const playersOfOrg = orgId => (DB.players || []).filter(p => !p.pending && p.orgId === orgId);
// ¿Este admin puede gestionar (editar/borrar/aprobar) a este jugador? Superadmin → cualquiera;
// admin de escuela → solo los de SU misma org+escuela.
function canManagePlayer(p) { const u = currentUser(); if (!u || !p) return false; if (isSuperadmin()) return true; if (!isSchoolAdmin() || !u.orgId) return false; if (isGuest(p)) return p.orgId === u.orgId; return p.orgId === u.orgId && p.schoolId === u.schoolId; }
// ¿Este admin puede editar/borrar este gimnasio? Solo los de su escuela (los viejos sin escuela se
// "grandfatherean": editables por cualquier admin hasta que se vuelvan a guardar y queden scopeados).
function canManageGym(g) { const u = currentUser(); if (!u || !g) return false; if (isSuperadmin()) return true; if (!isSchoolAdmin() || !u.orgId) return false; if (!g.orgId) return true; return g.orgId === u.orgId && g.schoolId === u.schoolId; }
// ¿El jugador puede inscribirse en este torneo? Abierto → toda la org; cerrado → solo su escuela.
function inTournamentScope(t, p) { if (!t || !p) return true; if (t.orgId && p.orgId !== t.orgId) return false; return t.open ? true : p.schoolId === t.schoolId; }
function tournamentPool(t) { return t ? (t.open ? playersOfOrg(t.orgId) : playersOfSchool(t.schoolId, t.orgId)) : (DB.players || []).filter(p => !p.pending); }
// Contexto activo (org/escuela que se está viendo/administrando). El superadmin lo elige; admin/player = el suyo.
let _ctxOrg = null, _ctxSchool = null;
function ctxOrgId() { const u = currentUser(); if (!u) return null; if (u.role === 'superadmin') return _ctxOrg || ((DB.orgs[0] || {}).id || null); return u.orgId || null; }
function ctxSchoolId() { const u = currentUser(); if (!u) return null; if (u.role === 'superadmin') { const o = orgById(ctxOrgId()); return _ctxSchool || (o && o.schools[0] ? o.schools[0].id : null); } return u.schoolId || null; }
function setCtx(orgId, schoolId) { _ctxOrg = orgId || null; const o = orgById(_ctxOrg); _ctxSchool = (schoolId && schoolById(_ctxOrg, schoolId)) ? schoolId : (o && o.schools[0] ? o.schools[0].id : null); render(); }
// Selectores org/escuela reutilizables (la escuela se actualiza al cambiar la org).
const orgSelectHtml = (id, sel, onchange) => `<select id="${id}"${onchange ? ` onchange="${onchange}"` : ''}>${(DB.orgs || []).map(o => `<option value="${o.id}" ${o.id === sel ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>`;
function schoolOptionsHtml(orgId, schoolId, withGuest) { const o = orgById(orgId) || (DB.orgs || [])[0]; const opts = (o ? o.schools : []).map(s => `<option value="${s.id}" ${s.id === schoolId ? 'selected' : ''}>${esc(s.name)}</option>`).join(''); return opts + (withGuest ? `<option value="${GUEST_SCHOOL}" ${schoolId === GUEST_SCHOOL ? 'selected' : ''}>🎟️ Invitado (sin escuela)</option>` : ''); }
function syncSchoolOptions(orgSel, schoolSel) { const sel = $('#' + schoolSel); if (sel) sel.innerHTML = schoolOptionsHtml($('#' + orgSel).value, null, true); }
// Colaborador de un torneo: jugador designado por el admin con permisos de edición sobre ese torneo.
const isCollaboratorOf = t => { const u = currentUser(); return !!(u && u.playerId && t && (t.collaborators || []).includes(u.playerId)); };
// Dueño del torneo = el admin que lo creó. Los torneos viejos sin dueño los gestiona un admin de su misma escuela/org (para no bloquearlos).
function ownsTournament(t) {
  const u = currentUser(); if (!u || !t) return false;
  if (t.ownerUid || t.ownerUsername) return !!((u.uid && t.ownerUid === u.uid) || (u.username && t.ownerUsername === u.username));
  return isSchoolAdmin() && !!u.orgId && t.orgId === u.orgId && t.schoolId === u.schoolId; // legado: sin dueño registrado
}
// Permisos operativos sobre un torneo: el superadmin todo; cada admin SOLO el torneo que armó; más sus colaboradores.
const canEditT = t => isSuperadmin() || ownsTournament(t) || isCollaboratorOf(t);
// Cerrar categoría y otorgar puntos al ranking: solo superadmin o un admin de la escuela del torneo
// (NO colaboradores, porque escribe fichas de jugadores y el ranking de dobles).
function canAwardPoints(t) { const u = currentUser(); if (!u || !t) return false; if (isSuperadmin()) return true; return isSchoolAdmin() && !!u.orgId && u.orgId === t.orgId && u.schoolId === t.schoolId; }
const canEditCat = cat => canEditT(tById(cat && cat._tid));      // idem, a partir de una categoría (usa cat._tid)
const tournStarted = t => !!(t && t.started);                    // ¿ya se inició el torneo? (habilita largar zonas / cargar / sugerencias)
const catTournStarted = cat => tournStarted(tById(cat && cat._tid)); // ¿el torneo de esta categoría está iniciado?

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
// ---- pagos / inscripción ----
const money = n => '$' + (Number(n) || 0).toLocaleString('es-AR');
const catCost = cat => Number(cat && cat.cost) || 0;            // costo de inscripción de la categoría en este torneo
const entrantOfPlayer = (cat, pid) => cat.entrants.find(e => e.players.includes(pid)); // el entrante (jugador o pareja) de un jugador
// ¿al jugador logueado le falta pagar esta categoría? (inscripto, con costo, sin marcar pagado)
function myPaymentStatus(cat) {
  const u = currentUser(), myId = u && u.playerId; if (!myId) return null;
  const e = entrantOfPlayer(cat, myId); if (!e) return null;
  if (catCost(cat) <= 0) return null;          // sin costo → nada que pagar
  return { paid: !!e.paid, cost: catCost(cat) };
}
const hasPayWorker = () => !!(((DB.settings && DB.settings.mpWorkerUrl) || '').trim());
// ¿Se puede pagar ONLINE (MercadoPago) esta categoría? Dos niveles de habilitación:
//   1) el superadmin habilita la funcionalidad para la organización (paymentsAllowed = interruptor maestro);
//   2) el admin de la ESCUELA del que mira la activa para su escuela (paymentsEnabled).
// Además: costo > 0, el torneo con cuenta de cobro y la URL del worker configurada. Si no, solo mesa de control.
function onlinePayReady(t, cat) { return paymentsOn() && setting('paymentsEnabled') && catCost(cat) > 0 && !!(t && t.payAccountId) && hasPayWorker(); }
// ¿La categoría ya arrancó? (se largó al menos una mesa: zona, llave, 3er puesto o partido individual)
function catStarted(cat) {
  if (cat.zoneTable && Object.keys(cat.zoneTable).some(k => cat.zoneTable[k] != null)) return true;
  if (cat.bracket && cat.bracket.some(round => round.some(m => m && m.table != null))) return true;
  if (cat.thirdPlace && cat.thirdPlace.table != null) return true;
  // Cuenta como "empezada" si hay mesa asignada O si ya se jugó algún partido: liberar una mesa no
  // "des-juega" un resultado, así que no deben reaparecer "Anotar"/"Armar grupos" (borrarían resultados).
  if ((cat.matches || []).some(m => m.table != null || matchDone(m, cat))) return true;
  return false;
}
// Popup de recordatorio de pago: se muestra una vez al iniciar sesión o recargar, si el jugador
// tiene inscripciones impagas. Marca las categorías que ya empezaron (primera mesa largada).
let _payReminderDone = false;
function maybePaymentReminder() { if (_payReminderDone) return; _payReminderDone = true; paymentReminder(); }
let _reminderItems = []; // inscripciones impagas pagables ONLINE del recordatorio actual (con índice para los checkboxes)
function paymentReminder() {
  const u = currentUser(), myId = u && u.playerId; if (!myId) return;
  const owed = [];
  (DB.tournaments || []).forEach(t => (t.categorias || []).forEach(c => {
    if (catCost(c) <= 0) return;
    const e = entrantOfPlayer(c, myId); if (!e || e.paid) return;
    owed.push({ tid: t.id, cid: c.id, eid: e.id, payAcct: t.payAccountId || null, tour: t.name, cat: c.name, cost: catCost(c), started: catStarted(c), online: onlinePayReady(t, c) });
  }));
  if (!owed.length) return;
  owed.sort((a, b) => (b.started ? 1 : 0) - (a.started ? 1 : 0)); // primero las que ya empezaron
  const total = owed.reduce((s, o) => s + o.cost, 0);
  const anyStarted = owed.some(o => o.started), anyOnline = owed.some(o => o.online);
  _reminderItems = owed.filter(o => o.online);
  const rows = owed.map(o => {
    const oi = _reminderItems.indexOf(o);
    const chk = o.online
      ? `<input type="checkbox" class="pr-chk" data-i="${oi}" checked onchange="prUpdateTotal()">`
      : `<span class="pr-nochk" title="Solo en mesa de control">·</span>`;
    return `<label class="report-row pr-row">
      <span class="pr-cell">${chk}</span>
      <span class="pr-main">${esc(o.cat)} <span class="muted">· ${esc(o.tour)}</span>${o.started ? ' <span class="wo-tag">ya empezó</span>' : ''}${o.online ? '' : ' <span class="muted" style="font-size:11px">· mesa de control</span>'}</span>
      <span class="pay-tag no">${money(o.cost)}</span></label>`;
  }).join('');
  const onlineTotal = _reminderItems.reduce((s, o) => s + o.cost, 0);
  const footer = anyOnline
    ? `<div class="row spread" style="margin-top:16px"><button class="btn btn-ghost" onclick="closeModal()">Después</button>
        <button class="btn btn-primary" id="prPayBtn" onclick="payReminderSelected()">💳 Pagar seleccionadas (<span id="prTotal">${money(onlineTotal)}</span>)</button></div>
       ${owed.some(o => !o.online) ? `<p class="muted" style="font-size:12px;margin:10px 0 0">Las marcadas como “mesa de control” se abonan en persona (un admin las marca pagadas).</p>` : ''}`
    : `<div class="banner" style="margin-top:12px">💲 Acercate a <b>mesa de control</b> cuando puedas para abonar ${owed.length === 1 ? 'la inscripción' : 'las inscripciones'}. Un admin o colaborador las marca como pagadas.</div>
       <div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn btn-primary" onclick="closeModal()">Entendido</button></div>`;
  openModal(`<h3>💲 Tenés inscripciones sin pagar</h3>
    <p class="muted" style="margin:0 0 12px">${anyStarted ? '⚠️ Algunas categorías <b>ya empezaron</b>. ' : ''}${anyOnline ? 'Elegí cuáles pagar ahora:' : ''}</p>
    <div>${rows}</div>
    <div class="report-row" style="border-top:2px solid var(--line);font-weight:800;margin-top:4px"><span>Total</span><span>${money(total)}</span></div>
    ${footer}`);
  if (anyOnline) prUpdateTotal();
}
function prUpdateTotal() {
  let total = 0, n = 0;
  document.querySelectorAll('.pr-chk:checked').forEach(ch => { const it = _reminderItems[+ch.dataset.i]; if (it) { total += it.cost; n++; } });
  const el = $('#prTotal'); if (el) el.textContent = money(total);
  const btn = $('#prPayBtn'); if (btn) { btn.disabled = n === 0; }
}
async function payReminderSelected() {
  const sel = [];
  document.querySelectorAll('.pr-chk:checked').forEach(ch => { const it = _reminderItems[+ch.dataset.i]; if (it) sel.push(it); });
  if (!sel.length) return;
  const byAcct = {}; sel.forEach(it => { (byAcct[it.payAcct] = byAcct[it.payAcct] || []).push(it); });
  const groups = Object.values(byAcct);
  if (groups.length > 1) alert('Las inscripciones elegidas son de torneos con cuentas de cobro distintas, así que se pagan por separado. Empezamos por el primer torneo; después volvé a entrar para pagar el resto.');
  await startPaymentMulti(groups[0]);
}
function entName(cat, id) {
  if (id === 'BYE') return 'BYE'; if (!id) return '—';
  const e = entById(cat, id); if (!e) return '—';
  const ns = e.players.map(pid => { const p = playerById(pid); return p ? fullName(p) : '?'; });
  return cat.format === 'double' ? ns.join(' / ') : ns[0];
}
// Nombre de un jugador como link a su perfil (para listas y tablas). '—' si no hay jugador.
function nameLink(p) { return p ? `<a class="plink" tabindex="0" role="link" onclick="event.stopPropagation();go('perfil:${p.id}')">${esc(fullName(p))}</a>` : '—'; }
// Posición en el ranking: medalla 🥇🥈🥉 para el podio (top 3), número para el resto.
function rankPos(i) { return i < 3 ? `<span class="pos medal">${['🥇', '🥈', '🥉'][i]}</span>` : `<span class="pos">${i + 1}</span>`; }
// Como entName pero clickeable: cada jugador (o ambos en dobles) enlaza a su perfil. BYE/vacío en texto plano.
function entLink(cat, id) {
  if (id === 'BYE') return 'BYE'; if (!id) return '—';
  const e = entById(cat, id); if (!e) return '—';
  return e.players.map(pid => nameLink(playerById(pid))).join(' / ');
}
function avatar(p, cls = 'avatar') {
  const badge = schoolBadgeHtml(p);
  if (p && p.photo) {
    const clk = p.id ? ` avatar-clk" onclick="event.stopPropagation(); openPhoto('${p.id}')" title="Ver foto` : '';
    return `<span class="${cls}${clk}"><img src="${p.photo}" alt=""/>${badge}</span>`;
  }
  return `<span class="${cls}">${esc(initials(p || { firstName: '?', lastName: '' })).toUpperCase()}${badge}</span>`;
}
// Lightbox: muestra la foto del jugador un poco más grande.
function openPhoto(id) {
  const p = playerById(id); if (!p || !p.photo) return;
  openModal(`<div class="photo-zoom"><img src="${p.photo}" alt="${esc(fullName(p))}"/><div class="photo-zoom-name">${esc(fullName(p))}</div></div>`);
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
const bestOfOf = (m, cat) => (m && m.bestOf) || (cat && cat.rules && cat.rules.sets) || 5; // sets de ESTE partido (según su fase)
function matchWinnerSide(m, cat) { const { wa, wb } = matchResult(m); const n = Math.ceil(bestOfOf(m, cat) / 2); return wa >= n ? 'a' : wb >= n ? 'b' : null; }
const matchDone = (m, cat) => !!matchWinnerSide(m, cat);

/* ---------------- modal ---------------- */
function openModal(html) { $('#modalCard').innerHTML = `<button class="close-x" onclick="closeModal()">✕</button>` + html; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; $('#modalCard').innerHTML = ''; if (_livePending) { _livePending = false; render(); } }
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
// Campo de foto con dos opciones: cámara (capture) y galería. En la compu ambos abren el explorador.
function photoButtonsHtml(id) {
  return `<div class="photo-pick">
    <label class="btn btn-ghost btn-sm photo-btn">📷 Sacar foto<input id="${id}_cam" type="file" accept="image/*" capture="environment"></label>
    <label class="btn btn-ghost btn-sm photo-btn">🖼️ Galería<input id="${id}" type="file" accept="image/*"></label>
    <span id="${id}_note" class="muted" style="font-size:12px"></span>
  </div>`;
}
// Conecta ambos inputs (cámara + galería) al mismo setter; muestra "foto cargada".
function wirePhoto(id, set) {
  const onPick = e => readPhoto(e.target.files[0], d => { if (d) { set(d); const n = $('#' + id + '_note'); if (n) n.textContent = '✓ Foto lista'; } });
  const a = $('#' + id), b = $('#' + id + '_cam');
  if (a) a.addEventListener('change', onPick);
  if (b) b.addEventListener('change', onPick);
}

/* ================= VIEWS ================= */
let view = 'ranking';
let histA = null, histB = null, histOpen = null; // historial head-to-head
let reportTid = '', reportMode = 'cat', reportCat = '', reportPerson = '', reportStatus = 'all'; // estado del historial de pagos
let profileNote = ''; // aviso transitorio en Perfil
let rankOpen = new Set(); // categorías del ranking desplegadas (todas colapsadas por defecto; se ve el líder en el encabezado)
let catTab = null, catTabFor = null; // pestaña activa del detalle de categoría (Inscriptos/Grupos/Llave) y para qué categoría
let tournSearch = ''; // texto del buscador de torneos antiguos
let authMode = 'login'; // 'login' | 'register' en la pantalla inicial
let loginNote = '';     // aviso a mostrar en el login (ej. tras registrarse)
let _authReady = false; // (Firebase) si ya resolvió el primer onAuthStateChanged

function renderChrome() {
  const u = currentUser();
  $('#nav').hidden = !u;
  const mb = $('#menuBtn'); if (mb) mb.hidden = !u;   // hamburguesa solo logueado
  if (!u) closeDrawer();                               // sin sesión, drawer cerrado
  document.querySelectorAll('.admin-only').forEach(el => el.hidden = !isAdmin());
  document.querySelectorAll('.superadmin-only').forEach(el => el.hidden = !isSuperadmin());
  document.querySelectorAll('.profile-only').forEach(el => el.hidden = !(u && u.playerId)); // Perfil solo para cuentas de jugador
  document.querySelectorAll('.news-only').forEach(el => el.hidden = !(u && setting('news'))); // Noticias solo si la escuela la activó
  document.querySelectorAll('.doubles-only').forEach(el => el.hidden = !(u && setting('doublesRanking'))); // Ranking de dobles según la organización
  document.querySelectorAll('.schoolrank-only').forEach(el => el.hidden = !(u && setting('schoolRanking'))); // Ranking de escuelas: según la organización
  document.querySelectorAll('.reglamento-link').forEach(el => el.hidden = !(u && canSeeReglamento())); // Reglamento: admin siempre; jugador si está activo y publicado
  document.querySelectorAll('.payments-only').forEach(el => el.hidden = !(u && isAdmin() && setting('paymentsAllowed'))); // Cuentas de cobro: admin y si la organización habilitó pagos
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', view.startsWith(b.dataset.view)));
  const altas = document.querySelector('.nav-btn[data-view="aprobaciones"]'); // badge con cantidad de solicitudes
  if (altas) { const n = scopedPending().length; altas.innerHTML = `🙋 Altas${n ? ` <span class="navcount">${n}</span>` : ''}`; }
  renderCtxBar();
  const chip = u ? (isSuperadmin() ? '👑 ' : u.role === 'admin' ? '🛠️ ' : '🎾 ') : '';
  $('#userArea').innerHTML = u ? `<span class="chip ${isAdmin() ? 'admin' : ''}">${chip}${esc(u.name)}</span>
     <button class="btn btn-ghost btn-sm" onclick="logout()">Salir</button>` : '';
  const approved = DB.players.filter(p => !p.pending).length;
  $('#storeInfo').textContent = `${approved} jugadores · ${DB.tournaments.length} torneos`;
}
// Barra de contexto: solo el superadmin elige qué org/escuela administra.
function renderCtxBar() {
  const el = $('#ctxBar'); if (!el) return;
  if (!isSuperadmin()) { el.innerHTML = ''; return; }
  const oid = ctxOrgId(), sid = ctxSchoolId();
  el.innerHTML = `<div class="ctx-bar">
    <div class="ctx-title">👑 Administrando</div>
    ${orgSelectHtml('ctxOrg', oid, 'ctxPickOrg(this.value)')}
    <select id="ctxSchool" onchange="ctxPickSchool(this.value)">${schoolOptionsHtml(oid, sid)}</select>
  </div>`;
}
function ctxPickOrg(oid) { setCtx(oid); }
function ctxPickSchool(sid) { setCtx(ctxOrgId(), sid); }
// Solicitudes de alta (pendientes) del contexto actual (escuela del admin / seleccionada por superadmin).
function scopedPending() { const sid = ctxSchoolId(), oid = ctxOrgId(); return (DB.players || []).filter(p => p.pending && p.orgId === oid && (!sid || p.schoolId === sid || isGuest(p))); } // invitados pendientes los aprueba cualquier admin de la org
function render() {
  renderChrome();
  applyTheme();
  const app = $('#app');
  // En modo Firebase, mientras no resolvió el estado de sesión, mostrar "cargando" (evita el flash al login).
  if (FB() && !_authReady) return renderSplash(app);
  if (!currentUser()) return renderLogin(app);
  if (view === 'ranking') return renderRanking(app);
  if (view === 'orgrank') return renderOrgRanking(app);
  if (view === 'schools') return setting('schoolRanking') ? renderSchoolRanking(app) : renderRanking(app);
  if (view === 'jugadores') return isAdmin() ? renderPlayers(app) : renderRanking(app);
  if (view === 'gimnasios') return isAdmin() ? renderGyms(app) : renderRanking(app);
  if (view === 'settings') return isAdmin() ? renderSettings(app) : renderRanking(app);
  if (view === 'apariencia') return isAdmin() ? renderAppearance(app) : renderRanking(app);
  if (view === 'categorias') return isAdmin() ? renderCatalog(app) : renderRanking(app);
  if (view === 'reportes') return renderReportes(app); // estado de pagos: admin/colaborador con filtros, jugador solo su historial
  if (view === 'cuentas') return (isAdmin() && setting('paymentsAllowed')) ? renderPayAccounts(app) : renderRanking(app);
  if (view === 'pagos') return (isAdmin() && setting('paymentsAllowed')) ? renderPayHistory(app) : renderRanking(app);
  if (view === 'aprobaciones') return isAdmin() ? renderApprovals(app) : renderRanking(app);
  if (view === 'noticias') return setting('news') ? renderNoticias(app) : renderRanking(app);
  if (view === 'dobles') return renderDoublesRanking(app); // el menú ya se oculta si la feature está apagada
  if (view === 'reglamento') return canSeeReglamento() ? renderReglamento(app) : renderRanking(app);
  if (view === 'historial') return renderHistory(app);
  if (view === 'perfil') return (currentUser().playerId ? renderProfile(app) : renderRanking(app));
  if (view.startsWith('perfil:')) return renderProfile(app, view.split(':')[1]);
  if (view === 'torneos') return renderTournaments(app);
  if (view.startsWith('gym:') || view.startsWith('gymedit:')) return renderGymView(app, view);
  if (view.startsWith('torneo:')) return renderTournament(app, view.split(':')[1]);
  if (view.startsWith('cat:')) { const [, tid, cid] = view.split(':'); return renderCategoria(app, tid, cid); }
}

/* ---------- campo de localidad (con opción "Otra" de texto libre) ---------- */
function cityFieldHtml(sel, current) {
  const known = CITIES.includes(current), other = (!known && current) ? current : '';
  const opts = CITIES.map(c => `<option ${c === current ? 'selected' : ''}>${c}</option>`).join('')
    + `<option value="Otra" ${other ? 'selected' : ''}>Otra…</option>`;
  return `<select id="${sel}" onchange="toggleCityOther('${sel}')">${opts}</select>
    <div id="${sel}_otherwrap" ${other ? '' : 'hidden'} style="margin-top:6px">
      <input id="${sel}_other" maxlength="100" placeholder="Escribí tu localidad (máx. 100)" value="${esc(other)}"/></div>`;
}
function toggleCityOther(sel) { const w = $('#' + sel + '_otherwrap'); if (w) w.hidden = ($('#' + sel).value !== 'Otra'); }
function readCityField(sel) { const v = $('#' + sel).value; return v === 'Otra' ? (($('#' + sel + '_other').value || '').trim().slice(0, 100)) : v; }

/* ---------- teléfono / WhatsApp ----------
   Campo partido en: país (con banderita y prefijo) + código de área + resto del número.
   `nsn` = cantidad de dígitos del número nacional (área + resto) que admite el país.
   `mob` = prefijo de móvil que WhatsApp exige y que NO escribe el usuario (Argentina: el 9). */
const PHONE_COUNTRIES = [
  { code: 'AR', name: 'Argentina',     dial: '54',  flag: '🇦🇷', mob: '9', nsn: [10],     ex: '11 6485 3799' },
  { code: 'UY', name: 'Uruguay',       dial: '598', flag: '🇺🇾', nsn: [8],      ex: '9 123 456' },
  { code: 'CL', name: 'Chile',         dial: '56',  flag: '🇨🇱', nsn: [9],      ex: '9 6123 4567' },
  { code: 'BR', name: 'Brasil',        dial: '55',  flag: '🇧🇷', nsn: [10, 11], ex: '11 91234 5678' },
  { code: 'PY', name: 'Paraguay',      dial: '595', flag: '🇵🇾', nsn: [9],      ex: '961 456 789' },
  { code: 'BO', name: 'Bolivia',       dial: '591', flag: '🇧🇴', nsn: [8],      ex: '7 123 4567' },
  { code: 'PE', name: 'Perú',          dial: '51',  flag: '🇵🇪', nsn: [9],      ex: '9 1234 5678' },
  { code: 'EC', name: 'Ecuador',       dial: '593', flag: '🇪🇨', nsn: [9],      ex: '9 1234 5678' },
  { code: 'CO', name: 'Colombia',      dial: '57',  flag: '🇨🇴', nsn: [10],     ex: '301 234 5678' },
  { code: 'VE', name: 'Venezuela',     dial: '58',  flag: '🇻🇪', nsn: [10],     ex: '412 123 4567' },
  { code: 'MX', name: 'México',        dial: '52',  flag: '🇲🇽', nsn: [10],     ex: '55 1234 5678' },
  { code: 'ES', name: 'España',        dial: '34',  flag: '🇪🇸', nsn: [9],      ex: '612 345 678' },
  { code: 'US', name: 'EE.UU./Canadá', dial: '1',   flag: '🇺🇸', nsn: [10],     ex: '305 123 4567' },
];
const PHONE_DEFAULT = 'AR';
const phoneCountry = code => PHONE_COUNTRIES.find(c => c.code === code) || PHONE_COUNTRIES[0];
// WhatsApp del administrador: destino de los reportes. Por ahora el mismo para todos los admins/superadmin.
const ADMIN_WHATSAPP = '5491164853799';
const ADMIN_PHONE = { country: 'AR', area: '11', rest: '64853799', e164: '5491164853799', intl: '+5491164853799', display: '+54 9 11 6485-3799' };
// Link de WhatsApp con mensaje prellenado: abre el chat al número con el texto listo (el destinatario solo aprieta enviar).
const waLink = (e164, txt) => `https://wa.me/${String(e164).replace(/\D/g, '')}${txt ? '?text=' + encodeURIComponent(txt) : ''}`;

// Texto de ayuda debajo del campo, según el país elegido.
function phoneHintText(code) {
  const c = phoneCountry(code);
  const tot = c.nsn.length > 1 ? `${Math.min(...c.nsn)} o ${Math.max(...c.nsn)}` : `${c.nsn[0]}`;
  const noCero = `Escribí el <b>área</b> y el <b>número</b> sin el +${c.dial} y sin el 0 inicial`;
  const arNote = c.code === 'AR' ? ' (tampoco el 15). El <b>9</b> de WhatsApp lo agregamos nosotros.' : '.';
  return `📱 ${c.flag} <b>${c.name}</b>: ${noCero}${arNote} En total deben ser <b>${tot} dígitos</b> (área + número).<br>Ej: ${c.ex} → quedaría <b>+${c.dial}${c.mob ? ' ' + c.mob : ''} ${c.ex}</b>.`;
}
// Campo de teléfono. `val` es el objeto guardado { country, area, rest } o null.
function phoneFieldHtml(sel, val) {
  val = val || {};
  const cur = val.country || PHONE_DEFAULT;
  const opts = PHONE_COUNTRIES.map(c => `<option value="${c.code}" ${c.code === cur ? 'selected' : ''}>${c.flag} ${c.name} (+${c.dial})</option>`).join('');
  return `<div class="phone-field">
    <div class="phone-row">
      <select id="${sel}_cc" class="phone-cc" onchange="onPhoneCountryChange('${sel}')" autocomplete="tel-country-code">${opts}</select>
      <input id="${sel}_area" class="phone-area" inputmode="numeric" maxlength="5" autocomplete="tel-area-code" placeholder="área" value="${esc(val.area || '')}" oninput="this.value=this.value.replace(/[^0-9]/g,'')"/>
      <input id="${sel}_num" class="phone-num" inputmode="numeric" maxlength="12" autocomplete="tel-local" placeholder="número" value="${esc(val.rest || '')}" oninput="this.value=this.value.replace(/[^0-9]/g,'')"/>
    </div>
    <p class="hint phone-hint" id="${sel}_hint">${phoneHintText(cur)}</p>
  </div>`;
}
function onPhoneCountryChange(sel) { const h = $('#' + sel + '_hint'); if (h) h.innerHTML = phoneHintText($('#' + sel + '_cc').value); }
// Lee y valida el campo. Devuelve { empty } | { error } | { country, area, rest, e164, intl, display }.
function readPhoneField(sel) {
  const ccEl = $('#' + sel + '_cc'); if (!ccEl) return { empty: true };
  const c = phoneCountry(ccEl.value);
  const area = ($('#' + sel + '_area').value || '').replace(/\D/g, '');
  const rest = ($('#' + sel + '_num').value || '').replace(/\D/g, '');
  const nsn = area + rest;
  if (!nsn) return { empty: true };
  if (!area) return { error: 'Indicá el código de área.' };
  if (!rest) return { error: 'Escribí el número.' };
  if (!c.nsn.includes(nsn.length)) {
    const tot = c.nsn.length > 1 ? `${Math.min(...c.nsn)} o ${Math.max(...c.nsn)}` : `${c.nsn[0]}`;
    return { error: `El teléfono de ${c.name} debe tener ${tot} dígitos en total (área + número). Pusiste ${nsn.length}.` };
  }
  const e164 = c.dial + (c.mob || '') + nsn; // solo dígitos, listo para wa.me
  return { country: c.code, area, rest, e164, intl: '+' + e164, display: `+${c.dial}${c.mob ? ' ' + c.mob : ''} ${area} ${rest}` };
}

/* ---------- login / registro ---------- */
function renderSplash(app) {
  app.innerHTML = `<div class="login-wrap"><div class="big-logo">🏓</div><p class="page-sub" style="margin-top:10px">Cargando…</p></div>`;
}
// Campo de contraseña con ojito para mostrar/ocultar.
function pwFieldHtml(id, autocomplete, placeholder) {
  return `<div class="pw-field"><input id="${id}" type="password" autocomplete="${autocomplete || 'current-password'}"${placeholder ? ` placeholder="${esc(placeholder)}"` : ''}/>
    <button type="button" class="pw-eye" tabindex="-1" aria-label="Mostrar u ocultar contraseña" onclick="togglePw('${id}', this)">👁️</button></div>`;
}
function togglePw(id, btn) { const i = $('#' + id); if (!i) return; const show = i.type === 'password'; i.type = show ? 'text' : 'password'; if (btn) btn.textContent = show ? '🙈' : '👁️'; }
function renderLogin(app) {
  if (authMode === 'register') return renderRegister(app);
  if (authMode === 'forgot') return renderForgot(app);
  const fb = FB(), note = loginNote; loginNote = '';
  app.innerHTML = `<div class="login-wrap"><div class="big-logo app-emoji">${esc(effectiveTheme().emoji)}</div><h1>Tenis de Mesa</h1>
    <p class="page-sub">Dina Huapi &amp; Bariloche</p>
    <div class="card" style="text-align:left">
      ${note ? `<div class="banner ok">${esc(note)}</div>` : ''}
      <label>${fb ? 'Email o usuario' : 'Usuario'}</label><input id="lu" type="text" autocomplete="username" placeholder="${fb ? 'tu@email.com o tu usuario' : ''}"/>
      <label>Contraseña</label>${pwFieldHtml('lp', 'current-password')}
      <div id="lerr" class="banner" hidden></div>
      <button class="btn btn-primary" style="width:100%;margin-top:16px" onclick="doLogin()">Ingresar</button>
      ${fb ? `<button class="btn btn-ghost btn-sm" style="width:100%;margin-top:8px" onclick="setAuthMode('forgot')">¿Olvidaste tu contraseña?</button>` : ''}
      <div class="auth-sep"><span>¿Sos nuevo en el club?</span></div>
      <button class="btn btn-accent" style="width:100%" onclick="setAuthMode('register')">🆕 Crear mi cuenta de jugador</button>
      ${fb ? '' : `<p class="hint">👑 <b>admin</b>/<b>admin</b> · 🎾 <b>jugador</b>/<b>jugador</b></p>`}
    </div></div>`;
  $('#lp').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}
async function doLogin() {
  const e = $('#lerr');
  if (FB()) {
    let id = $('#lu').value.trim();
    if (!id) { e.hidden = false; e.textContent = 'Escribí tu email o usuario.'; return; }
    try {
      if (!id.includes('@')) { // es un nombre de usuario → resolver a email
        const map = await window.STORE.lookupUsername(id);
        if (!map || !map.email) { e.hidden = false; e.textContent = 'No existe ese usuario.'; return; }
        id = map.email;
      }
      await window.STORE.signIn(id, $('#lp').value); view = 'ranking';
    } catch (err) { e.hidden = false; e.textContent = window.STORE.authMsg(err.code); }
    return;
  }
  const f = DB.users.find(x => x.username === $('#lu').value.trim() && x.password === $('#lp').value);
  if (!f) { e.hidden = false; e.textContent = 'Usuario o contraseña incorrectos.'; return; }
  _ctxOrg = null; _ctxSchool = null;
  setUser({ username: f.username, role: f.role, name: f.name, playerId: f.playerId || null, orgId: f.orgId || null, schoolId: f.schoolId || null }); view = 'ranking'; render(); maybePaymentReminder();
}
function setAuthMode(m) { authMode = m; render(); }
function renderForgot(app) {
  app.innerHTML = `<div class="login-wrap"><div class="big-logo">🏓</div><h1>Recuperar contraseña</h1>
    <p class="page-sub">Te enviamos un email con un link para crear una nueva contraseña</p>
    <div class="card" style="text-align:left">
      <label>Email o usuario</label><input id="fp_id" type="text" placeholder="tu@email.com o tu usuario"/>
      <div id="fp_err" class="banner" hidden></div>
      <button class="btn btn-primary" style="width:100%;margin-top:16px" onclick="doForgot()">Enviarme el email</button>
      <button class="btn btn-ghost" style="width:100%;margin-top:10px" onclick="setAuthMode('login')">← Volver al ingreso</button>
    </div></div>`;
  const i = $('#fp_id'); if (i) { i.focus(); i.addEventListener('keydown', e => { if (e.key === 'Enter') doForgot(); }); }
}
async function doForgot() {
  const e = $('#fp_err');
  let id = $('#fp_id').value.trim();
  if (!id) { e.hidden = false; e.textContent = 'Escribí tu email o usuario.'; return; }
  try {
    if (!id.includes('@')) { const m = await window.STORE.lookupUsername(id); id = (m && m.email) ? m.email : null; }
    if (id) await window.STORE.resetPassword(id);
  } catch (err) {}
  // mensaje genérico (no revela si la cuenta existe) y vuelve al login mostrándolo
  loginNote = '📧 Si la cuenta existe, te enviamos un email para restablecer tu contraseña. Revisá tu casilla (y la carpeta de spam).';
  authMode = 'login'; render();
}
function renderRegister(app) {
  const fb = FB();
  app.innerHTML = `<div class="login-wrap register-wrap"><div class="big-logo">🏓</div><h1>Crear cuenta</h1>
    <p class="page-sub">Registrate como jugador y empezá a anotarte a los torneos</p>
    <div class="card" style="text-align:left">
      <div class="grid2">
        <div><label>Nombre</label><input id="r_first"/></div>
        <div><label>Apellido</label><input id="r_last"/></div>
        <div><label>Localidad</label>${cityFieldHtml('r_city', '')}</div>
        <div><label>Fecha de nacimiento</label><input id="r_dob" type="date"/></div>
        <div><label>Género</label>${genderField('r_gender', 'M')}</div>
        <div><label>Organización</label>${orgSelectHtml('r_org', ((DB.orgs || [])[0] || {}).id, "syncSchoolOptions('r_org','r_school')")}</div>
        <div><label>Escuela</label><select id="r_school">${schoolOptionsHtml(((DB.orgs || [])[0] || {}).id, null, true)}</select>
          <p class="hint" style="margin-top:4px">Elegí <b>🎟️ Invitado</b> si no pertenecés a ninguna escuela: vas a poder anotarte a torneos abiertos, pero no sumás puntos al ranking.</p></div>
      </div>
      <label>Teléfono / WhatsApp</label>${phoneFieldHtml('r_phone', null)}
      <label>${fb ? 'Email' : 'Usuario'}</label><input id="r_user" type="${fb ? 'email' : 'text'}" placeholder="${fb ? 'tu@email.com' : 'con el que vas a ingresar'}"/>
      ${fb ? `<label>Usuario</label><input id="r_username" placeholder="ej: juanperez" autocomplete="off"/><p class="hint" style="margin-top:4px">Obligatorio. 3 a 20 caracteres (letras, números, . _ -). Sirve para ingresar además del email.</p>` : ''}
      <div class="grid2">
        <div><label>Contraseña</label>${pwFieldHtml('r_pw1', 'new-password')}</div>
        <div><label>Repetir contraseña</label>${pwFieldHtml('r_pw2', 'new-password')}</div>
      </div>
      <label>Foto <span class="muted">(opcional)</span></label>${photoButtonsHtml('r_photo')}
      <div id="r_err" class="banner" hidden></div>
      <p class="hint" style="margin-top:10px">Arrancás en 4ta con ${NEW_PLAYER_POINTS} puntos. Te vamos a mandar un email para verificar tu cuenta, y queda pendiente de aprobación del admin.</p>
      <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="doRegister()">Crear cuenta</button>
      <button class="btn btn-ghost" style="width:100%;margin-top:10px" onclick="setAuthMode('login')">← Volver al ingreso</button>
    </div></div>`;
  if (!fb) { // modo local: sugerir usuario desde el nombre
    const suggest = () => { const u = $('#r_user'); if (!u.dataset.touched) u.value = usernameFor({ firstName: $('#r_first').value, lastName: $('#r_last').value }); };
    $('#r_first').addEventListener('input', suggest);
    $('#r_last').addEventListener('input', suggest);
    $('#r_user').addEventListener('input', e => { e.target.dataset.touched = '1'; });
  }
  $('#r_pw2').addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });
  let photo = null; wirePhoto('r_photo', d => { photo = d; }); window.__rphoto = () => photo;
}
async function doRegister() {
  const e = $('#r_err'), fail = msg => { e.hidden = false; e.textContent = msg; try { e.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {} };
  const first = $('#r_first').value.trim(), last = $('#r_last').value.trim();
  const cred = $('#r_user').value.trim(), pw1 = $('#r_pw1').value, pw2 = $('#r_pw2').value;
  if (!first || !last) return fail('Nombre y apellido son obligatorios.');
  if (!cred) return fail(FB() ? 'Escribí tu email.' : 'Elegí un nombre de usuario.');
  if (!pw1) return fail('Escribí una contraseña.');
  if (pw1 !== pw2) return fail('Las contraseñas no coinciden.');
  const city = readCityField('r_city');
  if (!city) return fail('Indicá tu localidad.');
  const orgId = ($('#r_org') && $('#r_org').value) || ((DB.orgs || [])[0] || {}).id;
  const schoolId = ($('#r_school') && $('#r_school').value) || ((orgById(orgId) || {}).schools || [{}])[0].id;
  if (!orgId || !schoolId) return fail('Elegí organización y escuela.');
  const phone = readPhoneField('r_phone');
  if (phone.empty) return fail('Cargá tu número de teléfono / WhatsApp.');
  if (phone.error) return fail(phone.error);
  const photo = window.__rphoto ? window.__rphoto() : null;
  const player = { id: uid('p_'), firstName: first, lastName: last, dob: $('#r_dob').value || null, city, gender: ($('#r_gender') && $('#r_gender').value) || guessGender(first), phone, orgId, schoolId, points: NEW_PLAYER_POINTS, category: levelFromPoints(NEW_PLAYER_POINTS), photo, pending: true };
  if (FB()) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cred)) return fail('Escribí un email válido (ej: nombre@gmail.com).');
    const uname = ($('#r_username') && $('#r_username').value.trim().toLowerCase()) || '';
    if (!uname) return fail('Elegí un nombre de usuario.');
    if (!/^[a-z0-9._-]{3,20}$/.test(uname)) return fail('El usuario: 3 a 20 caracteres (letras, números, . _ -).');
    const taken = await window.STORE.lookupUsername(uname); if (taken) return fail('Ese usuario ya está en uso, probá otro.');
    player.username = uname;
    window.__registering = true;
    try {
      const c = await window.STORE.signUp(cred, pw1);
      const uidv = c.user.uid;
      await window.STORE.setUserDoc(uidv, { role: 'player', name: fullName(player), playerId: player.id, email: cred, emailVerified: false, username: uname, orgId, schoolId });
      await window.STORE.setPlayer(player);
      try { await window.STORE.setUsername(uname, { uid: uidv, email: cred }); } catch (e) {}
      try { await window.STORE.sendVerification(); } catch (e) {}   // mail de verificación nativo
      await window.STORE.signOut();                                  // NO queda logueado: vuelve al login
      _session = null; authMode = 'login'; view = 'ranking';
      loginNote = `✅ ¡Cuenta creada! Te enviamos un email a ${cred} para verificarla (revisá spam). Después de verificar, ingresá.`;
      render();
    } catch (err) { fail(window.STORE.authMsg(err.code)); }
    finally { window.__registering = false; }
    return;
  }
  const user = cred.toLowerCase();
  if (usernameTaken(user, null)) return fail('Ese usuario ya existe, probá con otro.');
  player.username = user;
  DB.players.push(player);
  DB.users.push({ username: user, password: pw1, role: 'player', name: fullName(player), playerId: player.id });
  save(DB);
  setUser({ username: user, role: 'player', name: fullName(player), playerId: player.id });
  authMode = 'login'; view = 'perfil'; render();
}
function logout() { _payReminderDone = false; authMode = 'login'; view = 'ranking'; if (FB()) { window.STORE.signOut(); } else { setUser(null); render(); } }

/* ---------- ranking ---------- */
// Tiles de ranking por categoría a partir de un conjunto de jugadores dado.
function rankingTilesHtml(basePlayers) {
  let html = `<div class="rank-tiles">`;
  CATS.forEach(cat => {
    const open = rankOpen.has(cat);
    const list = basePlayers.filter(p => p.category === cat).sort((a, b) => b.points - a.points);
    const leader = (!open && list.length) ? `<span class="rt-leader">🥇 ${esc(fullName(list[0]))}</span>` : '';
    html += `<div class="rank-tile${open ? ' open' : ''}">
      <button class="rank-tilehdr" onclick="rankToggle('${cat}')">
        <span class="cat-badge ${catClass(cat)}">${cat}</span>
        <span class="rt-name">Categoría ${cat}${leader}</span>
        <span class="rt-count">${list.length}</span>
        <span class="rt-caret">${open ? '▾' : '▸'}</span></button>`;
    if (open) {
      html += `<div class="rank-body">`;
      if (!list.length) html += `<div class="empty">Sin jugadores.</div>`;
      list.forEach((p, i) => { html += `<div class="player-row">${rankPos(i)}${avatar(p)}
        <div class="meta"><div class="name"><a class="plink" onclick="go('perfil:${p.id}')">${esc(fullName(p))}</a></div><div class="sub">📍 ${esc(p.city)}${ageFromDob(p.dob) != null ? ` · ${ageFromDob(p.dob)} años` : ''}</div></div>
        <div class="pts">${p.points}<small> pts</small></div></div>`; });
      html += `</div>`;
    }
    html += `</div>`;
  });
  return html + `</div>`;
}
// Ranking intraescuela: solo los jugadores de la escuela del contexto. Cada escuela ve solo el suyo.
function renderRanking(app) {
  const oid = ctxOrgId(), sid = ctxSchoolId();
  const list = playersOfSchool(sid, oid);
  const logo = schoolLogo(oid, sid);
  const logoEl = /^(data:|https?:)/.test(logo) ? `<span class="title-logo"><img src="${logo}" alt=""/></span>` : `<span class="title-logo">${esc(logo)}</span>`;
  app.innerHTML = `<div class="page-title" style="display:flex;align-items:center;gap:10px">${logoEl}<h1 style="margin:0">${esc(schoolName(oid, sid))}</h1></div>
    <p class="page-sub">Ranking de tu escuela (${esc(orgName(oid))}). Tocá una categoría para ver u ocultar su ranking.</p>
    ${rankingTilesHtml(list)}`;
}
// Ranking general de la organización: todos los jugadores de la org.
function renderOrgRanking(app) {
  const oid = ctxOrgId();
  const list = playersOfOrg(oid).filter(p => !isGuest(p)); // los invitados no figuran en ningún ranking
  app.innerHTML = `<div class="page-title"><h1>🌐 Ranking general · ${esc(orgName(oid))}</h1></div>
    <p class="page-sub">Todos los jugadores de la organización, sin importar la escuela. Tocá una categoría para verla.</p>
    ${rankingTilesHtml(list)}`;
}
// Ranking de escuelas (solo superadmin): suma de los puntos ganados en torneos ABIERTOS por los jugadores de cada escuela.
function renderSchoolRanking(app) {
  const oid = ctxOrgId(), o = orgById(oid);
  const rows = (o ? o.schools : []).map(s => {
    const players = playersOfSchool(s.id, oid);
    const total = players.reduce((acc, p) => acc + (p.openPoints || 0), 0);
    return { s, total, count: players.length };
  }).sort((a, b) => b.total - a.total);
  const maxTotal = rows.reduce((m, r) => Math.max(m, r.total), 0) || 1;
  const medals = ['🥇', '🥈', '🥉'];
  let html = `<div class="page-title"><h1>🏫 Ranking de escuelas · ${esc(orgName(oid))}</h1></div>
    <p class="page-sub">Suma de los puntos que los jugadores de cada escuela ganaron en <b>torneos abiertos</b> (podio: semifinal o mejor).</p>
    <div class="school-rank">`;
  if (!rows.length) html += `<div class="empty">Esta organización no tiene escuelas.</div>`;
  rows.forEach((r, i) => {
    const logo = schoolLogo(oid, r.s.id);
    const badge = /^(data:|https?:)/.test(logo) ? `<span class="avatar"><img src="${logo}" alt=""/></span>` : `<span class="avatar">${esc(logo)}</span>`;
    const pct = Math.round((r.total / maxTotal) * 100);
    html += `<div class="school-row">
      <span class="school-pos">${medals[i] || (i + 1)}</span>${badge}
      <div class="school-info">
        <div class="school-name">${esc(r.s.name)} <span class="muted school-count">· ${r.count} jugador${r.count === 1 ? '' : 'es'}</span></div>
        <div class="school-bar"><span style="width:${pct}%"></span></div>
      </div>
      <div class="pts">${r.total}<small> pts</small></div></div>`;
  });
  app.innerHTML = html + `</div>`;
}
function rankToggle(cat) { if (rankOpen.has(cat)) rankOpen.delete(cat); else rankOpen.add(cat); render(); }
function setCatTab(tab) { catTab = tab; render(); }
function renderDoublesRanking(app) {
  const byCat = {};
  (DB.settings.pairs || []).forEach(pr => { const cn = pr.catName || 'Dobles'; (byCat[cn] = byCat[cn] || []).push(pr); });
  // Categorías de dobles existentes: del catálogo + las usadas en torneos + las que ya tienen parejas.
  const names = new Set();
  catCatalog().forEach(c => { if (c.format === 'double') names.add(c.name); });
  (DB.tournaments || []).forEach(t => (t.categorias || []).forEach(c => { if (c.format === 'double') names.add(c.name); }));
  Object.keys(byCat).forEach(n => names.add(n));
  const cats = [...names].sort();
  let html = `<div class="page-title"><h1>👥 Ranking de dobles</h1></div>
    <p class="page-sub">Un ranking por cada categoría de dobles. Las parejas entran desde el primer torneo que juegan; el puntaje usa el promedio del ranking individual de cada integrante.</p>`;
  if (!setting('doublesRanking')) html += `<div class="banner">ℹ️ El ranking de dobles está <b>desactivado</b>. Activalo en ⚙️ Ajustes para que los torneos de dobles sumen puntos.</div>`;
  if (!cats.length) { app.innerHTML = html + `<div class="empty">Todavía no hay categorías de dobles. Creá una en 🗂️ Categorías marcándola como <b>Dobles</b> (y, si querés, su género).</div>`; return; }
  html += `<div class="rank-tiles">`;
  cats.forEach(cn => {
    const cc = catEntryByName(cn);
    const gtag = (cc && cc.gender && cc.gender !== 'any') ? ` · ${GENDER_RULE_LABEL[cc.gender]}` : '';
    const key = 'dbl:' + cn, open = rankOpen.has(key);
    const list = (byCat[cn] || []).slice().sort((a, b) => b.points - a.points);
    html += `<div class="rank-tile${open ? ' open' : ''}">
      <button class="rank-tilehdr" onclick="rankToggle('${esc(key)}')">
        <span class="cat-badge cat-4">👥</span><span class="rt-name">${esc(cn)}${gtag}</span>
        <span class="rt-count">${list.length}</span><span class="rt-caret">${open ? '▾' : '▸'}</span></button>`;
    if (open) {
      html += `<div class="rank-body">`;
      if (!list.length) html += `<div class="empty">Todavía no hay parejas con puntaje en esta categoría. Aparecen al cerrar un torneo de dobles de <b>${esc(cn)}</b>.</div>`;
      list.forEach((pr, i) => {
        const avg = Math.round(pr.players.reduce((s, pid) => s + ((playerById(pid) || {}).points || NEW_PLAYER_POINTS), 0) / (pr.players.length || 1));
        html += `<div class="player-row">${rankPos(i)}
          <div class="meta"><div class="name">${esc(pairName(pr))}</div><div class="sub">Promedio individual: ${avg} pts</div></div>
          <div class="pts">${pr.points}<small> pts</small></div></div>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
  });
  app.innerHTML = html + `</div>`;
}

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
      res.push({ tournament: t.name, date: t.date, cat: cat.name, fmt: cat.format, phase, wo: !!m.walkover,
        teamA: sideA === 'a' ? entName(cat, a) : entName(cat, b), teamB: sideA === 'a' ? entName(cat, b) : entName(cat, a),
        aWon, scoreA: sideA === 'a' ? `${r.wa}-${r.wb}` : `${r.wb}-${r.wa}`, sets: (m.sets || []).map(s => s.join('-')).join(', ') });
    });
  }));
  return res.sort((x, y) => (y.date || '').localeCompare(x.date || ''));
}
function histPickerHtml(side, sel) {
  const p = sel ? playerById(sel) : null, open = histOpen === side;
  const list = DB.players.filter(p => !p.pending).sort((a, b) => fullName(a).localeCompare(fullName(b)))
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
      ? `<div class="hist-summary"><b>${nameLink(a)}</b> ${aw} — ${bw} <b>${nameLink(b)}</b> <span class="muted">(${rows.length} partido${rows.length > 1 ? 's' : ''})</span></div>` +
        rows.map(r => `<div class="hist-row">
          <div class="hist-meta"><div class="name">${esc(r.tournament)} · ${esc(r.cat)}</div>
            <div class="sub">${r.date ? fmtDate(r.date) : ''} · ${r.phase}${r.fmt === 'double' ? ' · dobles' : ''}${r.wo ? ' · 🚷 no se presentó' : ''}</div></div>
          <div class="hist-score"><span class="${r.aWon ? 'win' : ''}">${esc(r.teamA)}</span> <b>${r.scoreA}</b> <span class="${r.aWon ? '' : 'win'}">${esc(r.teamB)}</span>
            <div class="sub">${r.wo ? 'ganó por no presentación' : esc(r.sets)}</div></div></div>`).join('')
      : `<div class="empty">No hay partidos jugados entre ${esc(fullName(a))} y ${esc(fullName(b))}.</div>`;
  }
  app.innerHTML = `<div class="page-title"><h1>📊 Historial entre jugadores</h1></div>
    <p class="page-sub">Elegí dos jugadores y mirá todos los partidos que jugaron entre sí.</p>
    <div class="grid2 hist-pickers"><div><label>Jugador 1</label>${histPickerHtml('A', histA)}</div>
      <div><label>Jugador 2</label>${histPickerHtml('B', histB)}</div></div>
    <div style="margin-top:18px">${body}</div>`;
  const s = $('.hist-search'); if (s) s.focus();
}
// Abre el historial head-to-head con el jugador actual vs otro jugador ya seleccionados.
function histVs(otherId) { const me = currentUser() && currentUser().playerId; if (!me) return; histA = me; histB = otherId; histOpen = null; go('historial'); }
function histToggle(side) { histOpen = histOpen === side ? null : side; render(); }
function histPick(side, pid) { if (side === 'A') histA = pid; else histB = pid; histOpen = null; render(); }
function histFilter(inp) { const q = inp.value.toLowerCase(); inp.closest('.hist-panel').querySelectorAll('.hist-opt').forEach(li => { li.style.display = li.dataset.name.includes(q) ? '' : 'none'; }); }

/* ---------- carta de jugador (estilo FUT) + estadísticas ---------- */
// Recorre todos los torneos y arma las estadísticas de un jugador (para la carta y el perfil).
function playerStats(pid) {
  let wins = 0, losses = 0, setsW = 0, setsL = 0, titles = 0, finals = 0, podiums = 0;
  const tourneys = new Set(), results = [], matches = [];
  DB.tournaments.forEach(t => t.categorias.forEach(cat => {
    const myEnt = entrantOfPlayer(cat, pid);
    if (!myEnt) return;
    tourneys.add(t.id);
    const hasChamp = cat.bracket && brWinner(cat, cat.bracket.length - 1, 0);
    const div = hasChamp ? placements(cat)[myEnt.id] : null;
    if (div === 1) titles++; else if (div === 2) finals++;
    if (div && div <= 3) podiums++;
    if (hasChamp) results.push({ tournament: t.name, date: t.date, cat: cat.name, fmt: cat.format, div: div || null });
    catMatchList(cat).forEach(({ a, b, m, phase }) => {
      if (!matchDone(m, cat)) return;
      const ea = entById(cat, a), eb = entById(cat, b); if (!ea || !eb) return;
      let side = null;
      if (ea.players.includes(pid)) side = 'a'; else if (eb.players.includes(pid)) side = 'b'; else return;
      const r = matchResult(m), w = matchWinnerSide(m, cat), won = side === w;
      const oppId = side === 'a' ? b : a, oppEnt = side === 'a' ? eb : ea;
      const mySets = side === 'a' ? r.wa : r.wb, oppSets = side === 'a' ? r.wb : r.wa;
      if (won) wins++; else losses++;
      setsW += mySets; setsL += oppSets;
      const oppPts = oppEnt.players.reduce((s, id) => { const op = playerById(id); return s + (op ? op.points : 0); }, 0) / Math.max(1, oppEnt.players.length);
      matches.push({ date: t.date || '', tournament: t.name, cat: cat.name, phase, won, wo: !!m.walkover,
        oppName: entName(cat, oppId), oppPts, score: `${mySets}-${oppSets}`, margin: mySets - oppSets });
    });
  }));
  const played = wins + losses;
  const winRate = played ? wins / played : 0;
  const setRate = (setsW + setsL) ? setsW / (setsW + setsL) : 0;
  const chrono = matches.slice().sort((x, y) => (x.date || '').localeCompare(y.date || ''));
  let best = 0, run = 0, curr = 0;
  chrono.forEach(mm => { if (mm.won) { run++; best = Math.max(best, run); } else run = 0; });
  for (let i = chrono.length - 1; i >= 0; i--) { if (chrono[i].won) curr++; else break; }
  const phaseW = ph => /Final/.test(ph) ? 60 : /Semi/.test(ph) ? 40 : /Cuartos/.test(ph) ? 25 : /Octavos/.test(ph) ? 15 : 0;
  const highlights = matches.filter(m => m.won && !m.wo)
    .map(m => ({ ...m, _score: m.oppPts + phaseW(m.phase) + m.margin * 8 }))
    .sort((a, b) => b._score - a._score).slice(0, 3);
  return { wins, losses, played, winRate, setsW, setsL, setRate, titles, finals, podiums,
    tourneys: tourneys.size, bestStreak: best, currStreak: curr,
    results: results.sort((a, b) => (b.date || '').localeCompare(a.date || '')), highlights };
}
// Atributos 1-99 de la carta, derivados SOLO de datos reales.
const clamp99 = n => Math.max(1, Math.min(99, Math.round(n)));
function cardAttrs(p, s) {
  const RAN = clamp99(45 + (p.points || 0) / 20);
  const VIC = s.played ? clamp99(s.winRate * 99) : 50;
  const SET = (s.setsW + s.setsL) ? clamp99(s.setRate * 99) : 50;
  const EXP = clamp99(38 + s.played * 3 + s.tourneys * 2);
  const TIT = clamp99(48 + s.titles * 16 + s.finals * 7 + s.podiums * 4);
  const RAC = clamp99(48 + s.bestStreak * 7);
  const overall = clamp99(RAN * 0.30 + VIC * 0.25 + TIT * 0.15 + SET * 0.12 + EXP * 0.10 + RAC * 0.08);
  return { RAN, VIC, SET, EXP, TIT, RAC, overall };
}
const CARD_THEMES = { auto: 'Automática', oro: 'Oro', plata: 'Plata', bronce: 'Bronce', rubi: 'Rubí', zafiro: 'Zafiro', esmeralda: 'Esmeralda', onix: 'Ónix' };
const autoTheme = ovr => ovr >= 90 ? 'onix' : ovr >= 84 ? 'oro' : ovr >= 74 ? 'plata' : 'bronce';
function cardThemeOf(p, ovr) { const t = p.card && p.card.theme; return (!t || t === 'auto') ? autoTheme(ovr) : t; }
// La carta tipo FUT.
function futCardHtml(p, s, attrs) {
  const ovr = attrs.overall, theme = cardThemeOf(p, ovr);
  const nick = p.card && p.card.nickname && p.card.nickname.trim();
  const name = nick ? esc(nick) : esc((p.lastName || fullName(p)).toUpperCase());
  const photo = p.photo ? `<img src="${p.photo}" alt=""/>` : `<span class="fut-initials">${esc(initials(p)).toUpperCase()}</span>`;
  const st = (k, v) => `<div class="fut-stat"><b>${v}</b><span>${k}</span></div>`;
  return `<div class="fut-card fut-${theme}">
    <div class="fut-shine"></div>
    <div class="fut-head">
      <div class="fut-rate"><span class="fut-ovr">${ovr}</span><span class="fut-cat">${esc(p.category)}</span><span class="fut-emoji">🏓</span></div>
      <div class="fut-photo">${photo}</div>
    </div>
    <div class="fut-name">${name}</div>
    <div class="fut-stats">
      <div class="fut-col">${st('RAN', attrs.RAN)}${st('VIC', attrs.VIC)}${st('TIT', attrs.TIT)}</div>
      <div class="fut-div"></div>
      <div class="fut-col">${st('SET', attrs.SET)}${st('EXP', attrs.EXP)}${st('RAC', attrs.RAC)}</div>
    </div>
  </div>`;
}
const statBox = (label, val) => `<div class="stat-box"><b>${val}</b><span>${esc(label)}</span></div>`;
const placeLabel = d => d === 1 ? '🥇 Campeón' : d === 2 ? '🥈 Finalista' : d === 3 ? '🥉 3er puesto' : d === 4 ? '4º puesto' : d ? 'Top ' + d : 'Participó';
// La card grande con TODA la info del jugador (datos + estadísticas + títulos + resultados + destacados).
function statsCardHtml(p, s, opts = {}) {
  const age = ageFromDob(p.dob);
  const meta = [`${p.category} · ${p.points} pts`, `📍 ${esc(p.city || '—')}`, age != null ? `🎂 ${age} años` : null].filter(Boolean).join(' · ');
  const trophies = `<div class="pf-trophies">
    <span class="tro">🏆 ${s.titles}<small>título${s.titles === 1 ? '' : 's'}</small></span>
    <span class="tro">🥈 ${s.finals}<small>final${s.finals === 1 ? '' : 'es'}</small></span>
    <span class="tro">🏅 ${s.podiums}<small>podio${s.podiums === 1 ? '' : 's'}</small></span></div>`;
  const grid = `<div class="stat-grid">
    ${statBox('Partidos', s.played)}${statBox('Victorias', s.wins)}${statBox('Derrotas', s.losses)}
    ${statBox('Efectividad', s.played ? Math.round(s.winRate * 100) + '%' : '—')}
    ${statBox('Sets G-P', s.setsW + '-' + s.setsL)}${statBox('Torneos', s.tourneys)}
    ${statBox('Mejor racha', s.bestStreak)}${statBox('Racha actual', s.currStreak)}</div>`;
  const results = s.results.length ? `<h4 class="pf-h">📋 Resultados en torneos</h4>
    <div class="pf-list">${s.results.slice(0, 8).map(r => `<div class="pf-res">
      <div><div class="pf-res-t">${esc(r.cat)} <span class="muted">· ${esc(r.tournament)}</span></div>
      <div class="pf-res-d">${r.date ? fmtDate(r.date) : ''}${r.fmt === 'double' ? ' · dobles' : ''}</div></div>
      <span class="pf-badge pf-d${r.div || 0}">${placeLabel(r.div)}</span></div>`).join('')}</div>` : '';
  const hl = s.highlights.length ? `<h4 class="pf-h">⭐ Partidos destacados</h4>
    <div class="pf-list">${s.highlights.map(h => `<div class="pf-hl">
      <span class="pf-hl-ico">${/Final/.test(h.phase) ? '🏆' : '🔥'}</span>
      <div><div>Le ganó a <b>${esc(h.oppName)}</b> <b class="win">${esc(h.score)}</b></div>
      <div class="pf-res-d">${esc(h.cat)} · ${esc(h.phase)} · ${esc(h.tournament)}</div></div></div>`).join('')}</div>` : '';
  const empty = (!s.played && !s.results.length) ? `<div class="pf-empty">Todavía no jugó partidos. ¡Su carta crece a medida que compite! 🏓</div>` : '';
  return `<div class="card pf-card">
    <div class="pf-top">${avatar(p, 'avatar pf-av')}
      <div><div class="pf-name">${esc(fullName(p))}</div><div class="muted">${meta}</div></div></div>
    ${trophies}${grid}${empty}${results}${hl}
    ${opts.extra || ''}</div>`;
}
// Envoltorio responsive: en web la carta FUT va a la derecha; en mobile arriba.
function profileShell(asideHtml, mainHtml) {
  return `<div class="profile-grid"><div class="profile-main">${mainHtml}</div><aside class="profile-aside">${asideHtml}</aside></div>`;
}

/* ---------- personalizador de carta (perfil propio) ---------- */
let cardDraft = null;
function cardCustomizer() {
  if (!cardEnabled()) return;
  const u = currentUser(), p = u && playerById(u.playerId); if (!p) return;
  cardDraft = { theme: (p.card && p.card.theme) || 'auto', nickname: (p.card && p.card.nickname) || '' };
  renderCardCustomizer();
}
function renderCardCustomizer() {
  const u = currentUser(), p = playerById(u.playerId);
  const s = playerStats(p.id), attrs = cardAttrs(p, s);
  const tmp = { ...p, card: { ...cardDraft } };
  const swatches = Object.entries(CARD_THEMES).map(([k, label]) =>
    `<button class="cc-swatch cc-${k} ${cardDraft.theme === k ? 'sel' : ''}" title="${label}" onclick="setCardTheme('${k}')">${cardDraft.theme === k ? '✓' : ''}</button>`).join('');
  openModal(`<h3 style="margin:0 0 4px">🎨 Diseñá tu carta</h3>
    <p class="hint" style="margin-top:0">Elegí el estilo y un apodo. Los números salen de tus resultados reales — esos no se tocan. 😉</p>
    <div class="cc-preview">${futCardHtml(tmp, s, attrs)}</div>
    <label>Apodo / lema <span class="muted">(opcional, máx 18)</span></label>
    <input id="cc_nick" maxlength="18" value="${esc(cardDraft.nickname)}" placeholder="${esc((p.lastName || '').toUpperCase())}" oninput="ccNick(this.value)"/>
    <label style="margin-top:12px">Estilo de carta</label>
    <div class="cc-swatches">${swatches}</div>
    <div class="row spread" style="margin-top:18px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveCardDesign()">Guardar carta</button></div>`);
}
function setCardTheme(t) { cardDraft.theme = t; renderCardCustomizer(); }
function ccNick(v) { cardDraft.nickname = v; const el = document.querySelector('.cc-preview .fut-name'); if (el) { const u = currentUser(), p = playerById(u.playerId); el.textContent = v.trim() ? v.trim() : (p.lastName || fullName(p)).toUpperCase(); } }
function saveCardDesign() {
  const u = currentUser(), p = playerById(u.playerId); if (!p) return;
  p.card = { theme: cardDraft.theme || 'auto', nickname: (cardDraft.nickname || '').trim() };
  save(DB); closeModal(); profileNote = '✓ Carta actualizada.'; render();
}

/* ---------- perfil (jugador) ---------- */
// Vista de solo lectura del perfil de OTRO jugador (cualquiera puede verla).
function renderPlayerProfileView(app, p) {
  const me = currentUser() && currentUser().playerId;
  const canHist = me && me !== p.id; // si sos jugador y no es tu propio perfil
  const s = playerStats(p.id), attrs = cardAttrs(p, s);
  const histBtn = canHist ? `<button class="btn btn-primary pf-action" onclick="histVs('${p.id}')">📊 Historial contra ${esc(p.firstName)}</button>` : '';
  const adminBtn = canManagePlayer(p) ? `<button class="btn btn-ghost pf-action" onclick="playerForm('${p.id}')">✏️ Editar</button>` : '';
  const actions = (histBtn || adminBtn) ? `<div class="pf-actions">${histBtn}${adminBtn}</div>` : '';
  const main = statsCardHtml(p, s, { extra: actions });
  const body = cardEnabled() ? profileShell(futCardHtml(p, s, attrs), main) : main;
  app.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="go('ranking')">← Volver</button>
    <div class="page-title" style="margin-top:12px"><h1>👤 Perfil</h1></div>
    ${body}`;
}
function renderProfile(app, viewId) {
  const u = currentUser();
  const ownId = u && u.playerId;
  const pid = viewId || ownId;
  const p = pid ? playerById(pid) : null;
  if (!p) { app.innerHTML = '<div class="empty">Perfil no disponible.</div>'; return; }
  if (pid !== ownId) return renderPlayerProfileView(app, p); // perfil de otro → solo lectura (admin edita con ✏️)
  const note = profileNote; profileNote = '';
  const s = playerStats(p.id), attrs = cardAttrs(p, s);
  const banners = `
    ${p.pending ? `<div class="banner">⏳ <b>Tu cuenta está pendiente de aprobación.</b> Cuando el admin te apruebe vas a aparecer en el ranking y vas a poder anotarte a los torneos.</div>` : ''}
    ${(FB() && u.emailVerified === false) ? `<div class="banner">📧 <b>Verificá tu email.</b> Te mandamos un link a ${esc(u.email)} (revisá spam).
      <div class="row" style="margin-top:8px"><button class="btn btn-ghost btn-sm" onclick="resendVerification()">Reenviar email</button>
      <button class="btn btn-ghost btn-sm" onclick="recheckVerification()">Ya verifiqué ✓</button></div></div>` : ''}
    ${note ? `<div class="banner ok">${esc(note)}</div>` : ''}`;
  const aside = `${futCardHtml(p, s, attrs)}
    <button class="btn btn-accent pf-design-btn" onclick="cardCustomizer()">🎨 Personalizar carta</button>`;
  const editForms = `
    <div class="card" style="margin-top:16px">
      <h3 style="margin:0 0 12px">✏️ Editar mis datos</h3>
      <div class="grid2">
        <div><label>Nombre</label><input id="pf_first" value="${esc(p.firstName)}"/></div>
        <div><label>Apellido</label><input id="pf_last" value="${esc(p.lastName)}"/></div>
        <div><label>Localidad</label>${cityFieldHtml('pf_city', p.city)}</div>
        <div><label>Fecha de nacimiento</label><input id="pf_dob" type="date" value="${p.dob || ''}"/></div>
        <div><label>Género</label>${genderField('pf_gender', genderOf(p))}</div>
      </div>
      <label>Teléfono / WhatsApp</label>${phoneFieldHtml('pf_phone', p.phone)}
      <label>Foto</label>${photoButtonsHtml('pf_photo')}
      <div id="pf_err" class="banner" hidden></div>
      <div class="row" style="margin-top:14px"><button class="btn btn-primary" onclick="saveProfile()">Guardar cambios</button></div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3 style="margin:0 0 6px">🔒 Cambiar contraseña</h3>
      ${FB()
        ? `<p class="hint" style="margin-top:0">Te enviamos un email a <b>${esc(u.email)}</b> con un link seguro para cambiarla. Cuando la cambies, ese mismo mail te queda como comprobante.</p>
           <div id="pf_pwerr" class="banner" hidden></div>
           <div class="row" style="margin-top:6px"><button class="btn btn-primary" onclick="requestPasswordChange()">📧 Enviar email para cambiar contraseña</button></div>`
        : `<p class="hint" style="margin-top:0">Escribí la nueva contraseña dos veces (sin requisitos).</p>
           <label>Nueva contraseña</label>${pwFieldHtml('pf_pw1', 'new-password')}
           <label>Repetir contraseña</label>${pwFieldHtml('pf_pw2', 'new-password')}
           <div id="pf_pwerr" class="banner" hidden></div>
           <div class="row" style="margin-top:14px"><button class="btn btn-primary" onclick="changePassword()">Cambiar contraseña</button></div>`}
    </div>`;
  const main = statsCardHtml(p, s) + editForms;
  const on = cardEnabled();
  app.innerHTML = `<div class="page-title"><h1>👤 Mi perfil</h1></div>
    <p class="page-sub">${on ? 'Esta es tu carta y tus estadísticas. Más abajo podés editar tus datos.' : 'Tus estadísticas y datos. Más abajo podés editarlos.'}</p>
    ${banners}
    ${on ? profileShell(aside, main) : main}`;
  let photo = p.photo; wirePhoto('pf_photo', d => { photo = d; });
  window.__pfphoto = () => photo;
}
function saveProfile() {
  const u = currentUser(), p = playerById(u.playerId), e = $('#pf_err');
  const first = $('#pf_first').value.trim(), last = $('#pf_last').value.trim();
  if (!first || !last) { e.hidden = false; e.textContent = 'Nombre y apellido obligatorios.'; return; }
  const phone = readPhoneField('pf_phone');
  if (phone.empty) { e.hidden = false; e.textContent = 'Cargá tu número de teléfono / WhatsApp.'; return; }
  if (phone.error) { e.hidden = false; e.textContent = phone.error; return; }
  p.phone = phone;
  p.firstName = first; p.lastName = last; p.city = readCityField('pf_city') || p.city; p.dob = $('#pf_dob').value || null;
  if ($('#pf_gender')) p.gender = $('#pf_gender').value;
  p.photo = window.__pfphoto ? window.__pfphoto() : p.photo;
  const acc = DB.users.find(x => x.playerId === p.id); if (acc) acc.name = fullName(p);
  setUser({ ...u, name: fullName(p) });
  if (FB() && u.uid) window.STORE.setUserDoc(u.uid, { name: fullName(p) });
  save(DB); profileNote = '✓ Datos guardados.'; render();
}
async function changePassword() {
  const u = currentUser(), e = $('#pf_pwerr');
  const a = $('#pf_pw1').value, b = $('#pf_pw2').value;
  if (!a) { e.hidden = false; e.textContent = 'Escribí una contraseña.'; return; }
  if (a !== b) { e.hidden = false; e.textContent = 'Las contraseñas no coinciden.'; return; }
  if (FB()) {
    try { await window.STORE.updatePassword(a); profileNote = '✓ Contraseña actualizada.'; render(); }
    catch (err) { e.hidden = false; e.textContent = err.code === 'auth/requires-recent-login' ? 'Por seguridad, cerrá sesión y volvé a entrar antes de cambiar la contraseña.' : window.STORE.authMsg(err.code); }
    return;
  }
  const acc = DB.users.find(x => x.playerId === u.playerId);
  if (!acc) { e.hidden = false; e.textContent = 'Cuenta no encontrada.'; return; }
  acc.password = a; save(DB); profileNote = '✓ Contraseña actualizada.'; render();
}
// Opción nativa: cambiar contraseña por email (te llega el link y queda como comprobante).
async function requestPasswordChange() {
  const u = currentUser();
  try { await window.STORE.resetPassword(u.email); profileNote = `📧 Te enviamos un email a ${u.email} con el link para cambiar tu contraseña (revisá spam).`; }
  catch (e) { profileNote = 'No se pudo enviar el email. Probá de nuevo en un rato.'; }
  render();
}
async function resendVerification() {
  try { await window.STORE.sendVerification(); profileNote = '📧 Te reenviamos el email de verificación. Revisá tu casilla (y spam).'; }
  catch (e) { profileNote = 'No se pudo reenviar. Probá de nuevo en un rato.'; }
  render();
}
async function recheckVerification() {
  try {
    await window.STORE.reloadUser();
    const verified = window.STORE.isEmailVerified();
    _session.emailVerified = verified;
    if (verified && _session.uid) { window.STORE.setUserDoc(_session.uid, { emailVerified: true }); const me = (DB.users || []).find(x => x.uid === _session.uid); if (me) me.emailVerified = true; }
    profileNote = verified ? '✅ ¡Email verificado! Gracias.' : 'Todavía no figura verificado. Abrí el link del email y volvé a tocar “Ya verifiqué”.';
  } catch (e) { profileNote = 'No se pudo comprobar. Probá de nuevo.'; }
  render();
}

/* ---------- jugadores (admin) ---------- */
function renderPlayers(app) {
  const oid = ctxOrgId(), sid = ctxSchoolId();
  const byName = (a, b) => fullName(a).localeCompare(fullName(b));
  const rowOf = p => { const u = (DB.users || []).find(x => x.playerId === p.id); return `<div class="player-row">${avatar(p)}
    <div class="meta"><div class="name">${nameLink(p)}</div><div class="sub">📍 ${esc(p.city)}${ageFromDob(p.dob) != null ? ` · ${ageFromDob(p.dob)} años` : ''}${(p.username || (u && u.username)) ? ` · 👤 ${esc(p.username || u.username)}` : ''}${(u && u.email) ? ` · 📧 ${esc(u.email)}` : (p.email ? ` · 📧 ${esc(p.email)}` : '')}</div></div>
    <span class="cat-badge ${catClass(p.category)}" style="height:28px;min-width:28px">${p.category}</span>
    <div class="pts">${p.points}<small> pts</small></div>
    <button class="btn btn-ghost btn-sm" onclick="playerForm('${p.id}')">✏️</button>
    <button class="btn btn-ghost btn-sm" onclick="delPlayer('${p.id}')">🗑️</button></div>`; };
  const active = playersOfSchool(sid, oid).slice().sort(byName);
  const rows = active.map(rowOf).join('');
  // Invitados de la organización (sin escuela): los gestiona cualquier admin de la org.
  const guests = (DB.players || []).filter(p => !p.pending && isGuest(p) && p.orgId === oid).slice().sort(byName);
  const guestSection = guests.length ? `<h2 class="players-subhead">🎟️ Invitados <span class="muted">(${guests.length})</span></h2>
    <p class="page-sub" style="margin-top:0">Jugadores sin escuela. Pueden anotarse a torneos abiertos, pero no suman puntos al ranking.</p>${guests.map(rowOf).join('')}` : '';
  const pend = scopedPending().length;
  app.innerHTML = `<div class="section-head"><div class="page-title"><h1>👥 Jugadores · ${esc(schoolName(oid, sid))}</h1></div>
    <button class="btn btn-primary" onclick="playerForm()">➕ Agregar jugador</button></div>
    <p class="page-sub">${active.length} jugadores de ${esc(schoolName(oid, sid))} (${esc(orgName(oid))}).${pend ? ` · <a class="maplink" onclick="go('aprobaciones')">🙋 ${pend} solicitud${pend > 1 ? 'es' : ''} de alta pendiente${pend > 1 ? 's' : ''}</a>` : ''}</p>${rows || '<div class="empty">Sin jugadores en esta escuela.</div>'}${guestSection}`;
}
function playerForm(id) {
  const p = id ? playerById(id) : { firstName: '', lastName: '', dob: '', city: CITIES[0], category: '4ta', points: NEW_PLAYER_POINTS, photo: null };
  const acc = id ? (DB.users || []).find(x => x.playerId === id) : null;
  const curEmail = (acc && acc.email) || p.email || '';
  const hasLogin = !!(acc && acc.uid);   // tiene cuenta de acceso (Firebase): el email se gestiona desde su cuenta
  // Escuela del jugador: superadmin elige cualquiera de la org (+ Invitado); admin de escuela, la suya (+ Invitado).
  const selSchool = id ? (p.schoolId || ctxSchoolId()) : ctxSchoolId();
  const schoolSel = isSuperadmin()
    ? schoolOptionsHtml(ctxOrgId(), selSchool, true)
    : `<option value="${ctxSchoolId()}" ${selSchool === ctxSchoolId() ? 'selected' : ''}>${esc(schoolName(ctxOrgId(), ctxSchoolId()))}</option><option value="${GUEST_SCHOOL}" ${selSchool === GUEST_SCHOOL ? 'selected' : ''}>🎟️ Invitado (sin escuela)</option>`;
  openModal(`<h3>${id ? 'Editar' : 'Agregar'} jugador</h3>
    <div class="row" style="margin:12px 0">${avatar(p)}<span class="muted">${id ? esc(fullName(p)) : 'Nuevo'}</span></div>
    <div class="grid2">
      <div><label>Nombre</label><input id="f_first" value="${esc(p.firstName)}"/></div>
      <div><label>Apellido</label><input id="f_last" value="${esc(p.lastName)}"/></div>
      <div><label>Localidad</label>${cityFieldHtml('f_city', p.city)}</div>
      <div><label>Puntos</label><input id="f_pts" type="number" min="0" value="${p.points}"/></div>
      <div><label>Fecha de nacimiento</label><input id="f_dob" type="date" value="${p.dob || ''}"/></div>
      <div><label>Género</label>${genderField('f_gender', genderOf(p))}</div>
      <div><label>Escuela</label><select id="f_school">${schoolSel}</select></div>
    </div>
    <label>Usuario</label>
    <input id="f_username" value="${esc(p.username || (acc && acc.username) || '')}" placeholder="con el que ingresa el jugador" autocomplete="off"/>
    <p class="hint" style="margin-top:4px">Obligatorio. 3 a 20 caracteres (letras, números, . _ -). Es el usuario con el que el jugador inicia sesión.</p>
    <label>Email <span class="muted">(opcional)</span></label>
    <input id="f_email" type="email" value="${esc(curEmail)}" placeholder="tu@email.com" ${hasLogin ? 'disabled' : ''}/>
    ${hasLogin ? `<p class="hint" style="margin-top:4px">El email de acceso lo cambia el jugador desde su cuenta.</p>` : ''}
    <label>Teléfono / WhatsApp <span class="muted">(opcional)</span></label>${phoneFieldHtml('f_phone', p.phone)}
    <p class="hint">Categoría: <b>${levelFromPoints(p.points)}</b> — se calcula por puntos (>800 1ra · >600 2da · >300 3ra · resto 4ta). Nuevos arrancan con ${NEW_PLAYER_POINTS}.${id && ageFromDob(p.dob) != null ? ` · Edad: <b>${ageFromDob(p.dob)} años</b>` : ''}</p>
    <label>Foto</label>${photoButtonsHtml('f_photo')}
    <div id="ferr" class="banner" hidden></div>
    <div class="row spread" style="margin-top:18px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="savePlayer('${id || ''}')">Guardar</button></div>`);
  let photo = p.photo; wirePhoto('f_photo', d => { photo = d; });
  window.__photo = () => photo;
  if (!id) { // alta nueva: sugerir el usuario desde el nombre mientras no lo toquen a mano
    const un = $('#f_username');
    const suggest = () => { if (!un.dataset.touched) un.value = usernameFor({ firstName: $('#f_first').value, lastName: $('#f_last').value }); };
    $('#f_first').addEventListener('input', suggest);
    $('#f_last').addEventListener('input', suggest);
    un.addEventListener('input', () => { un.dataset.touched = '1'; });
  }
}
function savePlayer(id) {
  if (id && !canManagePlayer(playerById(id))) return; // un admin solo edita jugadores de su escuela
  const err = m => { const e = $('#ferr'); e.hidden = false; e.textContent = m; };
  const first = $('#f_first').value.trim(), last = $('#f_last').value.trim();
  if (!first || !last) { err('Nombre y apellido obligatorios.'); return; }
  const uname = ($('#f_username') ? $('#f_username').value : '').trim().toLowerCase();
  if (!uname) { err('Elegí un usuario para el jugador (obligatorio).'); return; }
  if (!/^[a-z0-9._-]{3,20}$/.test(uname)) { err('El usuario: 3 a 20 caracteres (letras, números, . _ -).'); return; }
  if (usernameTaken(uname, id || null)) { err('Ese usuario ya está en uso, probá otro.'); return; }
  const emailInp = $('#f_email'), emailEditable = emailInp && !emailInp.disabled;
  const data = { firstName: first, lastName: last, username: uname, dob: $('#f_dob').value || null, city: readCityField('f_city'), gender: ($('#f_gender') && $('#f_gender').value) || 'M', points: parseInt($('#f_pts').value, 10) || 0, photo: window.__photo ? window.__photo() : null };
  // Escuela elegida (puede ser "Invitado"). Un admin de escuela solo puede asignar su propia escuela o Invitado.
  data.schoolId = ($('#f_school') && $('#f_school').value) || ctxSchoolId();
  if (!isSuperadmin() && data.schoolId !== ctxSchoolId() && data.schoolId !== GUEST_SCHOOL) { err('Solo podés asignar tu escuela o "Invitado".'); return; }
  if (emailEditable) data.email = (emailInp.value || '').trim() || null; // email editable solo si no tiene cuenta de acceso
  if (FB() && emailEditable && !data.email) { err('El email es obligatorio: con él se crea la cuenta de acceso del jugador.'); return; }
  if (emailEditable && data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) { err('El email no es válido (ej: nombre@gmail.com).'); return; }
  const phone = readPhoneField('f_phone'); // obligatorio (igual que en el registro de jugadores)
  if (phone.empty) { err('Cargá el teléfono / WhatsApp del jugador.'); return; }
  if (phone.error) { err(phone.error); return; }
  data.phone = phone;
  let target;
  if (id) { target = Object.assign(playerById(id), data); } else { target = { id: uid('p_'), orgId: ctxOrgId(), schoolId: ctxSchoolId(), openPoints: 0, ...data }; DB.players.push(target); } // el admin solo da de alta en su escuela (contexto)
  syncCategory(target);  // categoría derivada de los puntos
  if (!FB()) {
    ensurePlayerUsers();   // modo local: crea la cuenta del jugador nuevo (con el usuario elegido)
    const acc = DB.users.find(u => u.playerId === target.id); if (acc && acc.username !== uname) acc.username = uname; // al editar, mantener la cuenta en sync
    save(DB); closeModal(); render(); return;
  }
  // ----- Firebase -----
  const acc = DB.users.find(u => u.playerId === target.id && u.uid);
  if (id) { // editar: si ya tiene cuenta, reflejar el usuario en su doc y en el índice de login
    if (acc && (acc.username || '').toLowerCase() !== uname) {
      const prev = acc.username; acc.username = uname;
      try { window.STORE.setUserDoc(acc.uid, { username: uname }); } catch (e) {}
      try { window.STORE.setUsername(uname, { uid: acc.uid, email: acc.email || null }); } catch (e) {}
      if (prev) { try { window.STORE.delUsername(prev); } catch (e) {} }
    }
    save(DB); closeModal(); render(); return;
  }
  // alta NUEVA: reservar el username (que nadie más lo elija) y crear la cuenta + invitación por email.
  try { window.STORE.setUsername(uname, { playerId: target.id, email: data.email || null }); } catch (e) {}
  save(DB); closeModal(); render();
  invitePlayerAccount(target); // async: crea la cuenta de acceso y manda el email para fijar contraseña
}
// Crea la cuenta de acceso del jugador y le manda un email para poner su contraseña (vía worker).
// Completar ese reset también verifica el email (cubre la verificación). Si no hay worker, avisa.
async function invitePlayerAccount(p) {
  const wurl = ((DB.settings && DB.settings.mpWorkerUrl) || '').trim().replace(/\/+$/, '');
  if (!p.email) { alert(`Jugador creado. Sin email no se puede crear la cuenta de acceso (cargá un email para invitarlo).`); return; }
  if (!wurl) { alert(`Jugador creado. Para enviarle la invitación de acceso por email, configurá la URL del worker en Ajustes y volvé a guardar el jugador.`); return; }
  try {
    const idToken = await window.STORE.idToken();
    const r = await fetch(wurl + '/create-account', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, email: p.email, name: fullName(p), playerId: p.id, username: p.username, orgId: p.orgId, schoolId: p.schoolId }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { alert('Jugador creado, pero no se pudo crear la cuenta de acceso: ' + (d.error || r.status) + '. Podés reintentarlo editando y guardando.'); return; }
    if (d.emailSent === false) { alert(`Cuenta lista para ${p.email}, pero el envío del email falló: ${d.emailError || 'desconocido'}. La persona igual puede entrar usando "¿Olvidaste tu contraseña?" con ese email.`); return; }
    if (d.existed) { alert(`ℹ️ Ese email (${p.email}) ya tenía una cuenta de acceso (de un alta anterior). Le reenviamos el email para poner contraseña y, al iniciar sesión, se vincula sola a esta ficha. No hace falta nada más.`); return; }
    alert(`✅ Cuenta creada. Le enviamos un email a ${p.email} para que ponga su contraseña (al hacerlo también queda verificado). Si no llega, que use "¿Olvidaste tu contraseña?" con ese email.`);
  } catch (e) {
    alert('Jugador creado, pero falló el envío de la invitación: ' + (e && e.message || e) + '.');
  }
}
// Borra el doc de cuenta (users) + el índice de username y, en Firebase, también la cuenta de Auth
// (vía worker, por uid si lo hay o por email). Así no quedan cuentas huérfanas al eliminar un jugador.
function dropUserDoc(playerId, email) {
  const acc = (DB.users || []).find(u => u.playerId === playerId);
  DB.users = (DB.users || []).filter(u => u.playerId !== playerId);
  if (FB()) {
    if (acc && acc.uid) window.STORE.delUserDoc(acc.uid);
    if (acc && acc.username) window.STORE.delUsername(acc.username);
    const uid = acc && acc.uid, em = email || (acc && acc.email);
    if (uid || em) deleteAuthAccount(uid, em);
  }
}
// Borra la cuenta de Firebase Auth de un jugador eliminado (vía worker). Best-effort: si no hay worker
// o falla, no rompe el borrado (la cuenta queda huérfana como antes, pero la auto-reparación la maneja).
async function deleteAuthAccount(uid, email) {
  const wurl = ((DB.settings && DB.settings.mpWorkerUrl) || '').trim().replace(/\/+$/, '');
  if (!wurl) return;
  try {
    const idToken = await window.STORE.idToken();
    await fetch(wurl + '/delete-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken, uid: uid || null, email: email || null }) });
  } catch (e) {}
}
function delPlayer(id) {
  const p = playerById(id); if (!p || !canManagePlayer(p)) return;
  if (!confirm(`¿Eliminar a ${fullName(p)}?`)) return;
  const em = p.email || null;
  DB.players = DB.players.filter(x => x.id !== id);
  dropUserDoc(id, em);
  DB.tournaments.forEach(t => t.categorias.forEach(c => { c.entrants = c.entrants.filter(e => !e.players.includes(id)); c.groups = null; c.matches = null; c.bracket = null; c.thirdPlace = null; }));
  save(DB); render();
}

/* ---------- altas / aprobaciones (admin) ---------- */
// Jugadores que se autorregistraron y esperan aprobación del admin.
function renderApprovals(app) {
  const pend = scopedPending().sort((a, b) => fullName(a).localeCompare(fullName(b)));
  const rows = pend.map(p => { const u = (DB.users || []).find(x => x.playerId === p.id); return `<div class="player-row">${avatar(p)}
    <div class="meta"><div class="name">${nameLink(p)}</div><div class="sub">📍 ${esc(p.city)}${ageFromDob(p.dob) != null ? ` · ${ageFromDob(p.dob)} años` : ''}${u ? ` · 👤 ${esc(u.username || u.email || '')}` : ''}${u && FB() ? (u.emailVerified ? ' · ✅ email verificado' : ' · ✉️ sin verificar') : ''}</div></div>
    <label class="ap-pts">Puntaje inicial<input id="ap_${p.id}" type="number" min="0" value="${p.points}"/></label>
    <button class="btn btn-primary btn-sm" onclick="approvePlayer('${p.id}')">✅ Aprobar</button>
    <button class="btn btn-ghost btn-sm" onclick="rejectPlayer('${p.id}')">🗑️ Rechazar</button></div>`; }).join('');
  app.innerHTML = `<div class="page-title"><h1>🙋 Altas · ${esc(schoolName(ctxOrgId(), ctxSchoolId()))}</h1></div>
    <p class="page-sub">Jugadores de tu escuela que se registraron por su cuenta y esperan tu aprobación. Ajustá el <b>puntaje inicial</b> según su nivel antes de aprobar (la categoría se calcula sola).</p>
    ${rows || '<div class="empty">No hay solicitudes pendientes. 🎉</div>'}`;
}
function approvePlayer(id) {
  const p = playerById(id); if (!p || !canManagePlayer(p)) return;
  const inp = document.querySelector('#ap_' + id);
  if (inp) { const v = parseInt(inp.value, 10); if (!isNaN(v) && v >= 0) p.points = v; }
  delete p.pending; syncCategory(p); save(DB); render();
}
function rejectPlayer(id) {
  const p = playerById(id); if (!p || !canManagePlayer(p)) return;
  if (!confirm(`¿Rechazar la solicitud de ${fullName(p)}? Se elimina el jugador y su cuenta.`)) return;
  const em = p.email || null;
  DB.players = DB.players.filter(x => x.id !== id);
  dropUserDoc(id, em);
  save(DB); render();
}

/* ---------- gimnasios (admin) ---------- */
// Link de "cómo llegar" (direcciones hacia la dirección). En el celular abre la navegación de Maps.
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
      ${g.address ? `<a class="btn btn-accent btn-sm" href="${mapsDirUrl(g.address)}" target="_blank" rel="noopener">🧭 Cómo llegar</a>` : ''}
      ${(setting('gymViewAllowed') && canManageGym(g)) ? `<button class="btn btn-ghost btn-sm" onclick="openGymEdit('${g.id}')">🏟️ Vista</button>` : ''}
      ${canManageGym(g) ? `<button class="btn btn-ghost btn-sm" onclick="gymForm('${g.id}')">✏️ Editar</button>
      <button class="btn btn-ghost btn-sm" onclick="delGym('${g.id}')">🗑️</button>` : ''}
    </div></div>`).join('');
  app.innerHTML = `<div class="section-head"><div class="page-title"><h1>🏟️ Gimnasios</h1></div>
    <button class="btn btn-primary" onclick="gymForm()">➕ Agregar gimnasio</button></div>
    <p class="page-sub">Lugares disponibles para los torneos. Tocá <b>Cómo llegar</b> para abrir Google Maps con la dirección.</p>
    <div class="banner" style="max-width:680px">🏟️ Podés <b>ver</b> todos los gimnasios cargados, pero solo <b>editás o borrás los de tu escuela</b>.</div>
    <div class="cards gym-cards">${cards || '<div class="empty">Sin gimnasios.</div>'}</div>`;
}
function gymForm(id) {
  const g = id ? gymById(id) : { name: '', address: '' };
  openModal(`<h3>${id ? 'Editar' : 'Agregar'} gimnasio</h3>
    <div class="banner" style="margin-top:0">🏟️ Todas las escuelas <b>ven</b> este gimnasio, pero solo tu escuela puede editarlo o borrarlo.</div>
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
  if (id) { const g = gymById(id); if (!g || !canManageGym(g)) { closeModal(); return; } Object.assign(g, { name, address }); }
  else DB.gyms.push({ id: uid('g_'), name, address, orgId: ctxOrgId(), schoolId: ctxSchoolId() }); // nuevo gimnasio: queda de la escuela del admin
  save(DB); closeModal(); render();
}
function delGym(id) {
  const g = gymById(id); if (!g || !canManageGym(g)) return;
  const used = DB.tournaments.filter(t => t.gymId === id).length;
  if (!confirm(`¿Eliminar "${g.name}"?` + (used ? ` ${used} torneo(s) quedarán sin lugar asignado.` : ''))) return;
  DB.gyms = DB.gyms.filter(x => x.id !== id);
  DB.tournaments.forEach(t => { if (t.gymId === id) t.gymId = null; });
  save(DB); render();
}

/* ---------- catálogo global de categorías (admin) ----------
   Define qué categorías existen y sus reglas por defecto (inscripción, formato, sets por fase,
   grupos, valor 🏆). Cuando se arma un torneo, las categorías heredan estas reglas. Solo admin. */
function renderCatalog(app) {
  const cards = catCatalog().map(c => {
    const meta = [c.format === 'double' ? '👥 Dobles' : '👤 Singles', c.gender && c.gender !== 'any' ? GENDER_RULE_LABEL[c.gender] : null,
      ruleLabel(c.rule), setsFmtById(c.setsFormat).label, `Grupos ${c.groupMin}–${c.groupMax}`, `🥇 ${c.championPoints}`,
      c.cost ? `💲 ${money(c.cost)}` : 'sin costo'].filter(Boolean).join(' · ');
    return `<div class="cat-card"><div class="cat-card-head">
      <span class="cat-ico">🗂️</span>
      <div class="cat-card-info"><div class="cat-card-name">${esc(c.name)}</div><div class="cat-card-meta">${esc(meta)}</div></div>
      <div class="cat-card-actions">
        <button class="btn btn-ghost btn-sm icon-btn" title="Editar" onclick="catalogEntryForm('${c.id}')">✏️</button>
        <button class="btn btn-ghost btn-sm icon-btn" title="Eliminar" onclick="delCatalogEntry('${c.id}')">🗑️</button>
      </div></div></div>`;
  }).join('');
  const sName = schoolName(ctxOrgId(), ctxSchoolId());
  app.innerHTML = `<div class="section-head"><div class="page-title"><h1>🗂️ Categorías</h1></div>
    <button class="btn btn-primary" onclick="catalogEntryForm()">➕ Nueva categoría</button></div>
    <p class="page-sub">Catálogo de <b>${esc(sName)}</b> <span class="scope-tag scope-school">🏫 ${esc(sName)}</span> y sus reglas por defecto. Al crear un torneo, las categorías que marques <b>heredan</b> estas reglas (después podés ajustarlas dentro de cada torneo).${isSuperadmin() ? ' Cambiá de escuela desde la barra de contexto de arriba.' : ''}</p>
    <div class="cat-list">${cards || '<div class="empty">Sin categorías en el catálogo.</div>'}</div>`;
}
function catalogEntryForm(id) {
  const c = id ? catCatalog().find(x => x.id === id) : null;
  const rule = (c && c.rule) || { type: 'open' };
  const sel = (v, o) => v === o ? 'selected' : '';
  const types = [['open', 'Libre (cualquiera)'], ['level', 'Por nivel (Nª o superior)'], ['maxAge', 'Hasta cierta edad (Sub)'], ['minAge', 'Desde cierta edad (Maxi)'], ['range', 'Rango de edad']];
  const typeOpts = types.map(([v, l]) => `<option value="${v}" ${sel(rule.type, v)}>${l}</option>`).join('');
  const setsOpts = SETS_FORMATS.map(f => `<option value="${f.id}" ${sel((c && c.setsFormat) || 'all5', f.id)}>${f.label}</option>`).join('');
  const show = t => rule.type === t ? '' : 'hidden';
  openModal(`<h3>${id ? 'Editar' : 'Nueva'} categoría</h3>
    <label>Nombre</label><input id="cc_name" value="${esc(c ? c.name : '')}" placeholder="Ej: Primera, Sub 13, Maxi 40"/>
    <label>Regla de inscripción</label>
    <select id="cc_ruletype" onchange="catRuleTypeChange()">${typeOpts}</select>
    <div class="cc-param" data-for="level" ${show('level')}><label>Nivel mínimo (1 = Primera)</label><input id="cc_level" type="number" min="1" max="4" value="${rule.type === 'level' ? rule.level : 1}"/></div>
    <div class="cc-param" data-for="maxAge minAge" ${rule.type === 'maxAge' || rule.type === 'minAge' ? '' : 'hidden'}><label>Edad</label><input id="cc_age" type="number" min="1" max="120" value="${rule.age != null ? rule.age : 13}"/></div>
    <div class="cc-param" data-for="range" ${show('range')}><div class="grid2">
      <div><label>Edad mínima</label><input id="cc_rmin" type="number" min="1" max="120" value="${rule.type === 'range' ? rule.min : 30}"/></div>
      <div><label>Edad máxima</label><input id="cc_rmax" type="number" min="1" max="120" value="${rule.type === 'range' ? rule.max : 39}"/></div>
    </div></div>
    <div class="grid2">
      <div><label>Formato</label><select id="cc_fmt" onchange="catFmtChange('cc')"><option value="single" ${sel((c && c.format) || 'single', 'single')}>Singles 👤</option><option value="double" ${sel((c && c.format), 'double')}>Dobles 👥</option></select></div>
      <div class="cc-gender"><label>Género</label><select id="cc_gender">
        <option value="any" ${sel((c && c.gender) || 'any', 'any')}>Indistinto</option>
        <option value="female" ${sel(c && c.gender, 'female')}>Femenino</option>
        <option value="male" ${sel(c && c.gender, 'male')}>Masculino</option>
        <option value="mixed" ${sel(c && c.gender, 'mixed')} ${(c && c.format === 'double') ? '' : 'hidden'}>Mixto (solo dobles)</option></select></div>
      <div><label>Sets por fase</label><select id="cc_setsfmt">${setsOpts}</select></div>
      <div><label>Mín por grupo</label><input id="cc_min" type="number" min="2" value="${c ? c.groupMin : 3}"/></div>
      <div><label>Máx por grupo</label><input id="cc_max" type="number" min="2" value="${c ? c.groupMax : 4}"/></div>
      <div><label>Puntos al campeón 🏆 (máx 20)</label><input id="cc_pts" type="number" min="0" max="20" value="${c ? c.championPoints : 20}"/></div>
      <div><label>Costo de inscripción 💲</label><input id="cc_cost" type="number" min="0" step="100" value="${c && c.cost != null ? c.cost : 0}"/></div>
    </div>
    <p class="hint">Estas reglas son los <b>valores por defecto</b>: cada torneo que use esta categoría arranca con ellas y se pueden ajustar puntualmente dentro del torneo (incluido el costo de inscripción). Cambiar el catálogo no modifica torneos ya creados.</p>
    <div id="ccerr" class="banner" hidden></div>
    <div class="row spread" style="margin-top:16px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveCatalogEntry('${id || ''}')">${id ? 'Guardar' : 'Crear'}</button></div>`);
}
function catRuleTypeChange() {
  const t = $('#cc_ruletype').value;
  document.querySelectorAll('#modalCard .cc-param').forEach(el => { el.hidden = !el.dataset.for.split(' ').includes(t); });
}
// El género aplica a singles y dobles; "Mixto" es solo para dobles. prefix: 'cc' (catálogo) o 'c' (categoría de torneo).
function catFmtChange(prefix) {
  const isDouble = $('#' + prefix + '_fmt').value === 'double', g = $('#' + prefix + '_gender');
  if (!g) return;
  const mixed = g.querySelector('option[value="mixed"]'); if (mixed) mixed.hidden = !isDouble;
  if (!isDouble && g.value === 'mixed') g.value = 'any'; // singles no puede ser mixto
}
function saveCatalogEntry(id) {
  const e = $('#ccerr'), name = $('#cc_name').value.trim();
  if (!name) { e.hidden = false; e.textContent = 'El nombre es obligatorio.'; return; }
  const list = schoolCatalog(); if (!list) { e.hidden = false; e.textContent = 'Elegí una escuela para gestionar su catálogo.'; return; }
  if (list.some(x => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) { e.hidden = false; e.textContent = 'Ya existe una categoría con ese nombre.'; return; }
  const type = $('#cc_ruletype').value;
  let rule = { type: 'open' };
  if (type === 'level') rule = { type, level: Math.min(4, Math.max(1, parseInt($('#cc_level').value, 10) || 1)) };
  else if (type === 'maxAge') rule = { type, age: Math.max(1, parseInt($('#cc_age').value, 10) || 0) };
  else if (type === 'minAge') rule = { type, age: Math.max(1, parseInt($('#cc_age').value, 10) || 0) };
  else if (type === 'range') {
    const min = Math.max(1, parseInt($('#cc_rmin').value, 10) || 0), max = Math.max(1, parseInt($('#cc_rmax').value, 10) || 0);
    if (min > max) { e.hidden = false; e.textContent = 'La edad mínima no puede ser mayor que la máxima.'; return; }
    rule = { type, min, max };
  }
  const min = Math.max(2, parseInt($('#cc_min').value, 10) || 3); // mín 2 por grupo: un grupo de 1 no tiene 2°
  const max = Math.max(min, parseInt($('#cc_max').value, 10) || 4);
  const fmt = $('#cc_fmt').value;
  let gender = $('#cc_gender') ? $('#cc_gender').value : 'any'; if (fmt !== 'double' && gender === 'mixed') gender = 'any';
  const entry = { name, rule, format: fmt, gender, setsFormat: $('#cc_setsfmt').value, groupMin: min, groupMax: max, championPoints: Math.min(20, Math.max(0, parseInt($('#cc_pts').value, 10) || 0)), cost: Math.max(0, parseInt($('#cc_cost').value, 10) || 0) };
  if (id) { const cur = list.find(x => x.id === id); if (cur) Object.assign(cur, entry); }
  else list.push(Object.assign({ id: uid('cc_') }, entry));
  save(DB); closeModal(); render();
}
function delCatalogEntry(id) {
  const list = schoolCatalog(); if (!list) return;
  const c = list.find(x => x.id === id); if (!c) return;
  if (!confirm(`¿Quitar "${c.name}" del catálogo? Los torneos ya creados no se modifican.`)) return;
  const bag = settingsBag('school', ctxSchoolId(), true);
  bag.categoryCatalog = list.filter(x => x.id !== id);
  save(DB); render();
}

/* ---------- reportes (admin): pagos de inscripción pendientes ---------- */
function setReport(field, val) { if (field === 'tid') { reportTid = val; reportCat = ''; } else if (field === 'mode') reportMode = val; else if (field === 'cat') reportCat = val; else if (field === 'status') reportStatus = val; render(); }
function reportFilterPerson(inp) { const q = inp.value.toLowerCase(); document.querySelectorAll('.report-row[data-name], .report-person[data-name]').forEach(el => { el.style.display = el.dataset.name.includes(q) ? '' : 'none'; }); }
// Historial de pagos de un jugador (todas sus inscripciones con costo, pagadas o no).
function myPaymentsViewHtml(pid) {
  let html = `<div class="page-title"><h1>💲 Mis pagos</h1></div>
    <p class="page-sub">Tu historial de inscripciones con costo.</p>`;
  if (!pid) return html + `<div class="empty">Tu cuenta no está vinculada a un jugador.</div>`;
  const rows = [];
  DB.tournaments.forEach(t => (t.categorias || []).forEach(c => {
    if (catCost(c) <= 0) return;
    const e = c.entrants.find(en => en.players.includes(pid)); if (!e) return;
    rows.push({ tour: t.name, date: t.date, cat: c.name + (c.format === 'double' ? ' (dobles)' : ''), cost: catCost(c), paid: !!e.paid });
  }));
  if (!rows.length) return html + `<div class="empty">No tenés inscripciones con costo. 🎉</div>`;
  rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const pend = rows.filter(r => !r.paid).reduce((s, r) => s + r.cost, 0);
  html += `<div class="report-total">Pendiente total: <b>${money(pend)}</b></div>`;
  html += rows.map(r => `<div class="player-row"><div class="meta"><div class="name">${esc(r.cat)}</div><div class="sub">🏆 ${esc(r.tour)}${r.date ? ' · ' + esc(r.date) : ''}</div></div>
    <span class="pay-tag ${r.paid ? 'ok' : 'no'}">${r.paid ? '✅ Pagado' : '💲 ' + money(r.cost)}</span></div>`).join('');
  return html;
}
function renderReportes(app) {
  const adm = isAdmin(), me = currentUser(), myPid = me && me.playerId;
  // Torneos que puede ver: superadmin → toda su organización; admin de escuela → SOLO los de su
  // escuela (+ los abiertos de la org); colaborador → los que gestiona; jugador común → ninguno.
  const inReportScope = t => isSuperadmin() ? t.orgId === ctxOrgId() : (t.orgId === ctxOrgId() && (t.schoolId === ctxSchoolId() || t.open));
  const accessible = (adm ? DB.tournaments.filter(inReportScope) : DB.tournaments.filter(t => isCollaboratorOf(t)))
    .slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  // Jugador sin torneos a cargo → solo su propio historial.
  if (!accessible.length) { app.innerHTML = myPaymentsViewHtml(myPid); return; }
  if (reportTid && !accessible.some(t => t.id === reportTid)) reportTid = ''; // por las dudas, no dejar un torneo fuera de alcance
  const single = reportTid ? tById(reportTid) : null;
  const tList = single ? [single] : accessible;
  const tOpts = `<option value="">Todos los torneos</option>` + accessible.map(t => `<option value="${t.id}" ${reportTid === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  const stOpts = [['all', 'Todos'], ['pending', 'Pendientes'], ['paid', 'Pagados']].map(([v, l]) => `<option value="${v}" ${reportStatus === v ? 'selected' : ''}>${l}</option>`).join('');
  let html = `<div class="page-title"><h1>💲 Estado de pagos</h1></div>
    <p class="page-sub">Quién pagó la inscripción${adm ? '' : ' en tus torneos'}. Filtrá por torneo, categoría, estado o persona.</p>
    <div class="card" style="max-width:680px">
      <div class="grid2">
        <div><label>Torneo</label><select onchange="setReport('tid', this.value)">${tOpts}</select></div>
        <div><label>Estado</label><select onchange="setReport('status', this.value)">${stOpts}</select></div>
      </div>
      ${single ? `<div style="margin-top:6px"><label>Categoría</label><select onchange="setReport('cat', this.value)"><option value="">Todas las categorías</option>${single.categorias.filter(c => catCost(c) > 0).map(c => `<option value="${c.id}" ${reportCat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>` : ''}
      <label>Buscar persona</label>${reportPersonPickerHtml()}
    </div>`;
  // Entradas (una por inscripción a categoría con costo), aplicando TODOS los filtros (torneo/categoría/estado/persona).
  const entries = [];
  tList.forEach(t => (t.categorias || []).forEach(c => {
    if (catCost(c) <= 0) return;
    if (single && reportCat && c.id !== reportCat) return;
    c.entrants.forEach(e => {
      if (reportPerson && !e.players.includes(reportPerson)) return; // filtro REAL por jugador (no solo visual)
      if (reportStatus === 'paid' && !e.paid) return;
      if (reportStatus === 'pending' && e.paid) return;
      entries.push({ tId: t.id, tour: t.name, date: t.date, cId: c.id, cat: c.name + (c.format === 'double' ? ' (dobles)' : ''), cost: catCost(c), paid: !!e.paid, name: entName(c, e.id), pids: e.players.slice() });
    });
  }));
  const pendTotal = entries.filter(e => !e.paid).reduce((s, e) => s + e.cost, 0);
  const paidTotal = entries.filter(e => e.paid).reduce((s, e) => s + e.cost, 0);
  html += `<div class="report-total"><span class="pay-tag ok">✅ Pagado ${money(paidTotal)}</span><span class="pay-tag no">💲 Pendiente ${money(pendTotal)}</span></div>`;
  if (single && canEditT(single)) html += `<div class="row" style="margin:12px 0 4px">
      <button class="btn btn-accent" onclick="reportWhatsApp()">📲 Enviar pendientes por WhatsApp</button>
      <button class="btn btn-ghost" onclick="reportPDF()">📄 Exportar PDF</button></div>`;
  const tag = e => `<span class="pay-tag ${e.paid ? 'ok' : 'no'}">${e.paid ? '✅ Pagado' : '💲 ' + money(e.cost)}</span>`;
  if (!entries.length) { app.innerHTML = html + `<div class="empty" style="margin-top:16px">No hay inscripciones con costo para esos filtros.</div>`; return; }
  // Agrupar por torneo + categoría. Tarjeta colapsable con el TORNEO destacado y totales en el resumen.
  const groups = {};
  entries.forEach(e => { const k = e.tId + '|' + e.cId; (groups[k] = groups[k] || { tour: e.tour, cat: e.cat, cost: e.cost, items: [] }).items.push(e); });
  html += Object.values(groups).map(g => {
    const pendN = g.items.filter(i => !i.paid).length, paidN = g.items.length - pendN;
    const rows = g.items.slice().sort((a, b) => a.name.localeCompare(b.name))
      .map(e => `<div class="report-row"><span>${esc(e.name)}</span>${tag(e)}</div>`).join('');
    return `<details class="card rep-card" open><summary class="rep-sum">
        <div class="rep-info"><div class="rep-tour">🏆 ${esc(g.tour)}</div><div class="rep-cat">${esc(g.cat)} · ${money(g.cost)} c/u · ${g.items.length} inscriptos</div></div>
        <span class="rep-tot">${paidN ? `<span class="pay-tag ok">✅ Pagado ${money(paidN * g.cost)}</span>` : ''}${pendN ? `<span class="pay-tag no">💲 Pendiente ${money(pendN * g.cost)}</span>` : ''}</span>
        <span class="cat-caret">▸</span></summary>
      <div class="rep-body">${rows}</div></details>`;
  }).join('');
  app.innerHTML = html;
}
// Buscador de persona con SELECCIÓN (no filtra solo visualmente: al elegir, recalcula los totales para esa persona).
function reportPersonPickerHtml() {
  if (reportPerson) { const p = playerById(reportPerson); return `<div class="rp-sel">👤 <b>${esc(p ? fullName(p) : 'Jugador')}</b><button type="button" class="chip-x" onclick="setReportPerson('')" title="Quitar filtro">✕</button></div>`; }
  // Jugadores en alcance: superadmin → toda la org; admin de escuela → solo su escuela. (Sin filtrar por
  // los filtros actuales, para que el buscador no sea confuso y componga bien con el filtro de torneo.)
  const cands = (isSuperadmin() ? playersOfOrg(ctxOrgId()) : isAdmin() ? playersOfSchool(ctxSchoolId(), ctxOrgId()) : (DB.players || []).filter(p => !p.pending))
    .slice().sort((a, b) => fullName(a).localeCompare(fullName(b)));
  const opts = cands.map(p => `<li class="rp-opt" data-name="${esc(fullName(p)).toLowerCase()}" onclick="setReportPerson('${p.id}')">${esc(fullName(p))} <span class="muted">· ${p.category}</span></li>`).join('');
  return `<div class="rp-picker"><input class="rp-search" placeholder="🔍 Escribí un nombre y elegilo de la lista…" autocomplete="off" oninput="rpFilter(this)"/>
    <ul class="rp-results" id="rp-results" hidden>${opts || '<li class="muted" style="padding:8px 10px">No hay jugadores.</li>'}</ul></div>`;
}
function setReportPerson(pid) { reportPerson = pid || ''; render(); }
function rpFilter(inp) {
  const q = (inp.value || '').trim().toLowerCase(), box = $('#rp-results'); if (!box) return;
  let any = false;
  box.querySelectorAll('.rp-opt').forEach(li => { const show = !!q && li.dataset.name.includes(q); li.style.display = show ? '' : 'none'; if (show) any = true; });
  box.hidden = !any;
}
// Teléfono (solo dígitos, formato wa.me) del usuario logueado. Lo busca en la sesión, en su registro
// de `users` (la sesión no arrastra el phone) o en su ficha de jugador. Devuelve null si no tiene.
function currentUserWhatsapp() {
  const u = currentUser(); if (!u) return null;
  let ph = u.phone;
  if (!ph) { const rec = (DB.users || []).find(x => (u.uid && x.uid === u.uid) || (u.username && x.username === u.username)); if (rec) ph = rec.phone; }
  if (!ph && u.playerId) { const p = playerById(u.playerId); if (p) ph = p.phone; }
  if (!ph) return null;
  const digits = (typeof ph === 'string' ? ph : (ph.e164 || ph.intl || '')).replace(/\D/g, '');
  return digits || null;
}
// Arma el reporte como texto y abre WhatsApp al teléfono del admin logueado, respetando los filtros actuales.
// Filtros compartidos por los exportadores (WhatsApp/PDF): respetan los MISMOS filtros que la pantalla
// (persona + estado), además del de categoría que ya se aplica al armar `cats`.
function reportMatchE(e) {
  if (reportPerson && !e.players.includes(reportPerson)) return false;
  if (reportStatus === 'paid' && !e.paid) return false;
  if (reportStatus === 'pending' && e.paid) return false;
  return true;
}
const REPORT_TITLE = () => reportStatus === 'paid' ? 'Pagos de inscripción registrados' : reportStatus === 'all' ? 'Estado de pagos de inscripción' : 'Pagos de inscripción pendientes';
const REPORT_TOTAL_LABEL = () => reportStatus === 'paid' ? 'Total pagado' : reportStatus === 'all' ? 'Total' : 'Pendiente total';
const reportTag = e => reportStatus === 'all' ? (e.paid ? ' ✅' : ' ⏳') : ''; // marca pagado/pendiente solo cuando se listan ambos
function reportWhatsApp() {
  const t = reportTid ? tById(reportTid) : null;
  if (!t) { alert('Elegí un torneo primero.'); return; }
  const cats = t.categorias.filter(c => catCost(c) > 0 && (!reportCat || c.id === reportCat));
  if (!cats.length) { alert('No hay categorías con costo de inscripción para reportar.'); return; }
  let grand = 0; cats.forEach(c => { grand += c.entrants.filter(reportMatchE).length * catCost(c); });
  const L = ['📋 *' + REPORT_TITLE() + '*', '🏆 ' + t.name + (t.date ? ' · ' + t.date : '')];
  if (reportCat) L.push('🗂️ Categoría: ' + cats[0].name);
  if (reportPerson) { const p = playerById(reportPerson); L.push('👤 ' + (p ? fullName(p) : 'Jugador')); }
  L.push('');
  if (reportMode === 'cat') {
    cats.forEach(c => {
      const rows = c.entrants.filter(reportMatchE).slice().sort((a, b) => entName(c, a.id).localeCompare(entName(c, b.id)));
      L.push(`*${c.name}* — ${money(catCost(c))} c/u · ${money(rows.length * catCost(c))}`);
      if (rows.length) rows.forEach(e => L.push('• ' + entName(c, e.id) + reportTag(e))); else L.push('• Sin resultados');
      L.push('');
    });
  } else {
    const map = {};
    cats.forEach(c => c.entrants.filter(reportMatchE).forEach(e => e.players.forEach(pid => {
      const p = playerById(pid); if (!p) return;
      (map[pid] = map[pid] || { name: fullName(p), items: [], total: 0 });
      map[pid].items.push({ cat: c.name + (c.format === 'double' ? ' (dobles)' : '') + reportTag(e), cost: catCost(c) });
      map[pid].total += catCost(c);
    })));
    const people = Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
    if (!people.length) L.push('Sin resultados para el filtro elegido.');
    people.forEach(pe => {
      L.push(`*${pe.name}* — ${money(pe.total)}`);
      pe.items.forEach(it => L.push('• ' + it.cat + ': ' + money(it.cost)));
      L.push('');
    });
  }
  L.push('💰 *' + REPORT_TOTAL_LABEL() + ': ' + money(grand) + '*');
  const to = currentUserWhatsapp() || ADMIN_WHATSAPP; // teléfono del admin logueado; si no cargó uno, cae al número por defecto
  window.open(waLink(to, L.join('\n')), '_blank');
}
// Exporta el reporte (con los filtros actuales) a PDF vía el diálogo de impresión del navegador.
function reportPDF() {
  const t = reportTid ? tById(reportTid) : null;
  if (!t) { alert('Elegí un torneo primero.'); return; }
  const cats = t.categorias.filter(c => catCost(c) > 0 && (!reportCat || c.id === reportCat));
  if (!cats.length) { alert('No hay categorías con costo de inscripción para reportar.'); return; }
  let grand = 0; cats.forEach(c => { grand += c.entrants.filter(reportMatchE).length * catCost(c); });
  let body = '';
  if (reportMode === 'cat') {
    cats.forEach(c => {
      const rows = c.entrants.filter(reportMatchE).slice().sort((a, b) => entName(c, a.id).localeCompare(entName(c, b.id)));
      body += `<h2>${esc(c.name)} <span class="sub">— ${esc(money(catCost(c)))} c/u · ${esc(money(rows.length * catCost(c)))}</span></h2>`;
      body += rows.length
        ? `<table><tbody>${rows.map(e => `<tr><td>${esc(entName(c, e.id))}${reportTag(e)}</td><td class="r">${esc(money(catCost(c)))}</td></tr>`).join('')}</tbody></table>`
        : `<p class="ok">Sin resultados</p>`;
    });
  } else {
    const map = {};
    cats.forEach(c => c.entrants.filter(reportMatchE).forEach(e => e.players.forEach(pid => {
      const p = playerById(pid); if (!p) return;
      (map[pid] = map[pid] || { name: fullName(p), items: [], total: 0 });
      map[pid].items.push({ cat: c.name + (c.format === 'double' ? ' (dobles)' : '') + reportTag(e), cost: catCost(c) });
      map[pid].total += catCost(c);
    })));
    const people = Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
    if (!people.length) body += `<p class="ok">Sin resultados para el filtro elegido.</p>`;
    people.forEach(pe => {
      body += `<h2>${esc(pe.name)} <span class="sub">— ${esc(money(pe.total))}</span></h2>`;
      body += `<table><tbody>${pe.items.map(it => `<tr><td>${esc(it.cat)}</td><td class="r">${esc(money(it.cost))}</td></tr>`).join('')}</tbody></table>`;
    });
  }
  const who = reportPerson ? (pp => pp ? ' · 👤 ' + esc(fullName(pp)) : '')(playerById(reportPerson)) : '';
  const head = `<h1>${esc(REPORT_TITLE())}</h1>
    <p class="meta">🏆 ${esc(t.name)}${t.date ? ' · ' + esc(t.date) : ''}${reportCat ? ' · Categoría: ' + esc(cats[0].name) : ''}${who}</p>
    <p class="total">${esc(REPORT_TOTAL_LABEL())}: <b>${esc(money(grand))}</b></p>`;
  const css = `body{font-family:Arial,Helvetica,sans-serif;color:#1d2433;margin:32px;font-size:13px}
    h1{font-size:20px;margin:0 0 4px} .meta{color:#555;margin:0 0 2px}
    .total{margin:6px 0 18px;font-size:15px}
    h2{font-size:14px;margin:16px 0 6px;border-bottom:2px solid #1e6b3a;padding-bottom:3px}
    h2 .sub{font-weight:400;color:#666;font-size:12px}
    table{width:100%;border-collapse:collapse;margin-bottom:6px}
    td{padding:5px 8px;border-bottom:1px solid #e6e9ee} td.r{text-align:right;white-space:nowrap;color:#c1121f;font-weight:700}
    .ok{color:#16a34a;margin:4px 0 10px} .foot{margin-top:24px;color:#999;font-size:11px}
    @media print{body{margin:14mm} h2{break-after:avoid} tr{break-inside:avoid}}`;
  const w = window.open('', '_blank');
  if (!w) { alert('El navegador bloqueó la ventana. Permití las ventanas emergentes para exportar el PDF.'); return; }
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte — ${esc(t.name)}</title><style>${css}</style></head>
    <body>${head}${body}<p class="foot">Generado desde la app de Tenis de Mesa.</p>
    <script>window.onload=function(){window.focus();window.print();}<\/script></body></html>`);
  w.document.close();
}

/* ---------- ajustes (admin) ---------- */
// Fila de ajuste con interruptor. `fn` es el nombre de la función global que alterna el valor.
function settingRow(name, desc, on, fn) {
  return `<div class="setting-row">
      <div class="setting-text">
        <div class="setting-name">${name}</div>
        <div class="setting-desc">${desc}</div>
      </div>
      <button class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${on}" onclick="${fn}()"><span class="knob"></span></button>
    </div>`;
}
// Ícono ℹ️ con tooltip (se muestra al pasar el mouse o al tocarlo; el contenido es HTML).
function infoTip(html) {
  return `<span class="info-tip" tabindex="0" role="button" aria-label="Cómo funciona">ℹ️<span class="info-bubble">${html}</span></span>`;
}
// Explicación completa de la sugerencia de mesas (reglas de prioridad).
const TABLE_SUGGEST_HELP = `<b>Sugerencia de largado de mesas</b><br>
  Con esto activado, en la pantalla de cada torneo aparece — para <b>admin y colaboradores</b> — un panel que sugiere qué <b>zona o llave</b> largar en cada <b>mesa libre</b>. Se actualiza a medida que se liberan mesas (al terminar un partido o toda una zona).
  <br><b>Prioridad</b> (de mayor a menor):
  <ol><li>Sub</li><li>Maxi</li><li>Primera</li><li>Segunda</li><li>Tercera</li><li>Cuarta</li><li>Mayores</li><li>Todo competidor</li><li>Dobles</li></ol>
  Además:
  <ul><li>Los <b>grupos (zonas) van antes que las llaves</b>: se intenta terminar las zonas el mismo día (la llave puede jugarse al día siguiente).</li>
  <li>Respeta el <b>horario de inicio</b> programado de cada categoría.</li>
  <li>Nunca propone largar a un jugador que <b>ya está jugando en otra mesa</b> (un jugador puede estar en varias categorías a la vez).</li>
  <li>Muestra la mejor opción para cada mesa libre + hasta <b>2 alternativas</b>; tocás un botón para largar.</li></ul>`;
function renderSettings(app) {
  if (!DB.settings) DB.settings = Object.assign({}, DEFAULT_SETTINGS);
  const sName = schoolName(ctxOrgId(), ctxSchoolId()), oName = orgName(ctxOrgId());
  const schoolScope = `<span class="scope-tag scope-school">🏫 ${esc(sName)}</span>`;
  const orgScope = `<span class="scope-tag scope-org">🏢 ${esc(oName)}</span>`;
  app.innerHTML = `<div class="page-title"><h1>⚙️ Ajustes</h1></div>
    <p class="page-sub">Las opciones de escuela 🏫 afectan solo a los miembros de <b>${esc(sName)}</b>${isSuperadmin() ? `; las de organización 🏢 afectan a toda <b>${esc(oName)}</b>. Cambiá de escuela/organización desde la barra de contexto de arriba.` : '.'}</p>
    <div class="card" style="max-width:620px">
      ${settingRow('🏓 Sugerencia de mesas ' + schoolScope + ' ' + infoTip(TABLE_SUGGEST_HELP),
        'Sugiere a admin y colaboradores qué zona o llave largar en cada mesa libre del torneo, por orden de prioridad. Tocá la ℹ️ para ver todas las reglas.',
        setting('tableSuggestion'), 'toggleTableSuggestion')}
      ${isSuperadmin() ? settingRow('💳 Pagos online (habilitar para la organización) ' + orgScope,
        'Permite que los admins de esta organización puedan cobrar inscripciones online con MercadoPago. Si lo apagás, los admins <b>ni ven</b> la opción de pagos ni la sección de cuentas de cobro.',
        setting('paymentsAllowed'), 'togglePaymentsAllowed') : ''}
      ${setting('paymentsAllowed') ? settingRow('💳 Pagos para inscripciones ' + schoolScope,
        'Cobrar la inscripción <b>online al anotarse</b> (con MercadoPago). La cuenta donde recibís la plata se configura en <b>💳 Cuentas de cobro</b> y se elige al crear cada torneo.<br>⚠️ <b>MercadoPago cobra una comisión (~3,7%) por cada pago recibido</b> — la podés trasladar al jugador. No hay cuotas ni costos fijos.',
        setting('paymentsEnabled'), 'togglePayments') : ''}
      ${isSuperadmin() ? settingRow('🏟️ Vista del gimnasio (habilitar para la organización) ' + orgScope,
        'Permite que los admins de esta organización activen la <b>vista de gimnasio en pixel art</b> (mapa con las mesas, quién juega en cada una, en vivo). Si lo apagás, los admins no la ven.',
        setting('gymViewAllowed'), 'toggleGymViewAllowed') : ''}
      ${setting('gymViewAllowed') ? settingRow('🏟️ Vista del gimnasio ' + schoolScope,
        'Activa un botón <b>🏟️ Vista del gimnasio</b> en los torneos de esta escuela: un mapa en pixel art del gimnasio con las mesas, quién está jugando en cada una (en vivo), el buffet, el baño y la tribuna. La distribución de cada gimnasio se arma en <b>🏟️ Gimnasios</b>. Los jugadores la ven; admin y colaboradores pueden moverla.',
        setting('gymViewEnabled'), 'toggleGymView') : ''}
      ${isSuperadmin() ? `<div class="setting-row"><div class="setting-text" style="width:100%">
        <div class="setting-name">🔗 URL del servidor (backend) ${orgScope}</div>
        <div class="setting-desc">Pegá la URL del Worker de Cloudflare (la da <code>wrangler deploy</code>), ej: <code>https://tenis-mesa-pagos.tu-usuario.workers.dev</code>. <b>Es necesaria para la auto-inscripción de los jugadores</b> y para los pagos online. Sin esto, los jugadores no pueden anotarse solos ni aparece el botón “Pagar ahora”.</div>
        <div class="row" style="margin-top:8px"><input id="set_wurl" value="${esc(DB.settings.mpWorkerUrl || '')}" placeholder="https://...workers.dev"/>
          <button class="btn btn-primary btn-sm" onclick="saveMpWorkerUrl()">Guardar</button></div>
      </div></div>` : ''}
      ${settingRow('🕒 Horarios estimados de partidos ' + schoolScope,
        'Muestra una hora aproximada de comienzo de cada partido, estimada según la hora actual, el horario de cada categoría, la duración por cantidad de sets, las mesas disponibles y cómo vienen los partidos (con un margen de seguridad). Es una estimación.',
        setting('matchTimeEstimates'), 'toggleMatchTimes')}
      ${settingRow('📰 Noticias ' + schoolScope,
        'Habilitar la sección de Noticias para los miembros de esta escuela. Si la apagás, desaparece del menú de esta escuela.',
        setting('news'), 'toggleNews')}
      ${settingRow('📜 Reglamento ' + schoolScope,
        'Habilitar el Reglamento para los jugadores de esta escuela. Si lo apagás, no lo ven (vos podés editarlo siempre). Además tiene que estar publicado.',
        setting('reglamento'), 'toggleReglamento')}
      ${settingRow('🃏 Carta de jugador ' + schoolScope,
        'Mostrar la carta tipo FUT en los perfiles (overall y atributos calculados con las estadísticas reales). Cada jugador puede personalizar el estilo y el apodo de la suya. Si la apagás, los perfiles de esta escuela muestran solo los datos y estadísticas.',
        setting('playerCard') !== false, 'togglePlayerCard')}
      ${isSuperadmin() ? settingRow('👥 Ranking de dobles ' + orgScope,
        'Habilitar el ranking de dobles (por pareja) y que los torneos de dobles sumen puntos. El puntaje de la pareja para el cálculo es el promedio del ranking individual de sus integrantes. Solo el superadmin lo controla (a nivel organización).',
        setting('doublesRanking'), 'toggleDoublesRanking') : ''}
      ${isSuperadmin() ? settingRow('🏫 Ranking de escuelas ' + orgScope,
        'Habilitar el ranking de escuelas (suma de los puntos ganados en torneos abiertos por los jugadores de cada escuela). Solo el superadmin lo activa o desactiva (a nivel organización); una vez activo, lo ven <b>todos los miembros</b> de la organización en el menú de Rankings.',
        setting('schoolRanking'), 'toggleSchoolRanking') : ''}
    </div>`;
}
// Alterna un ajuste booleano de DB.settings y vuelve a renderizar.
function toggleSetting(key) {
  if (!DB.settings) DB.settings = Object.assign({}, DEFAULT_SETTINGS);
  DB.settings[key] = !DB.settings[key];
  save(DB); render();
}
function toggleTableSuggestion() { toggleScopedSetting('tableSuggestion'); }
function togglePayments() { toggleScopedSetting('paymentsEnabled'); }
function togglePaymentsAllowed() { if (!isSuperadmin()) return; toggleScopedSetting('paymentsAllowed'); }
function toggleGymView() { toggleScopedSetting('gymViewEnabled'); }
function toggleGymViewAllowed() { if (!isSuperadmin()) return; toggleScopedSetting('gymViewAllowed'); }
function saveMpWorkerUrl() { if (!isSuperadmin()) return; if (!DB.settings) DB.settings = Object.assign({}, DEFAULT_SETTINGS); DB.settings.mpWorkerUrl = ($('#set_wurl').value || '').trim(); save(DB); render(); }
function toggleMatchTimes() { toggleScopedSetting('matchTimeEstimates'); }
function toggleNews() { toggleScopedSetting('news'); }
function toggleReglamento() { toggleScopedSetting('reglamento'); }
function togglePlayerCard() { toggleScopedSetting('playerCard'); }
function toggleDoublesRanking() { if (!isSuperadmin()) return; toggleScopedSetting('doublesRanking'); }
function toggleSchoolRanking() { if (!isSuperadmin()) return; toggleScopedSetting('schoolRanking'); }

/* ---------- cuentas de cobro (MercadoPago) ---------- */
// ¿La feature de pagos está habilitada por el superadmin para la org del que mira?
const paymentsOn = () => !!setting('paymentsAllowed');
// ¿La cuenta es del usuario actual? El token es secreto: cada admin (incluido el superadmin) ve solo las
// suyas. Empareja por uid (Firebase) o username (local).
function ownsPayAccount(a) { const u = currentUser(); if (!u) return false; return !!((u.uid && a.ownerUid === u.uid) || (u.username && a.ownerUsername === u.username)); }
// Cuentas de cobro visibles/usables por el usuario actual (las suyas; el superadmin, todas).
const myPayAccounts = () => (DB.payAccounts || []).filter(ownsPayAccount);
const payAccountById = id => (DB.payAccounts || []).find(a => a.id === id) || null;
// <option>s de cuentas para el dropdown de torneo (con la opción "sin cobro online").
function payAccountOptions(selId) {
  const opts = myPayAccounts().map(a => `<option value="${a.id}" ${a.id === selId ? 'selected' : ''}>${esc(a.name)}${a.test ? ' (prueba)' : ''}</option>`).join('');
  return `<option value="" ${!selId ? 'selected' : ''}>— Sin cobro online (se paga aparte) —</option>` + opts;
}
// Bloque de ayuda con los pasos para sacar el Access Token de MercadoPago.
function mpHelpHtml() {
  return `<details class="card" style="max-width:680px;margin-bottom:16px">
    <summary style="cursor:pointer;font-weight:700">❓ ¿Cómo obtengo el “Access Token” de MercadoPago? (se hace una sola vez)</summary>
    <div style="margin-top:10px;font-size:14px;line-height:1.7">
      <p style="margin:0 0 8px">El <b>Access Token</b> es la “llave” que permite que la app cobre y que la plata vaya <b>directo a tu cuenta de MercadoPago</b>. Se carga una vez y queda. Es <b>secreto</b>: no lo compartas con nadie.</p>
      <ol style="margin:0;padding-left:20px">
        <li>Entrá a <b>mercadopago.com.ar</b> e iniciá sesión con la cuenta donde querés <b>recibir la plata</b>.</li>
        <li>Abrí el <b>Panel de desarrolladores</b>: <code>mercadopago.com.ar/developers/panel</code> (o desde el menú: <i>Tu negocio → Configuración → Credenciales</i>).</li>
        <li>Tocá <b>“Crear aplicación”</b>, ponele un nombre cualquiera (ej. “Tenis de Mesa”) y elegí el tipo <b>Pagos online / Checkout Pro</b>. Si ya tenés una creada, usala.</li>
        <li>Entrá a esa aplicación → sección <b>“Credenciales de producción”</b>.</li>
        <li>Copiá el valor de <b>“Access Token”</b> (empieza con <code>APP_USR-</code>).</li>
        <li>Volvé acá, tocá <b>“Agregar cuenta”</b> y pegalo. ¡Listo!</li>
      </ol>
      <p style="margin:8px 0 0" class="muted">💡 Si querés <b>probar sin cobrar de verdad</b>, usá las “Credenciales de prueba” (el token empieza con <code>TEST-</code>).</p>
      <p style="margin:8px 0 0" class="muted">⚠️ MercadoPago descuenta una <b>comisión (~3,7%)</b> de cada pago recibido. No hay cuotas ni costos fijos.</p>
    </div>
  </details>`;
}
function renderPayAccounts(app) {
  const list = myPayAccounts();
  const rows = list.length ? list.map(a => `<div class="player-row">
    <div class="meta"><div class="name">💳 ${esc(a.name)}${a.test ? ' <span class="wo-tag">prueba</span>' : ''}</div>
      <div class="sub">${a.holder ? '👤 ' + esc(a.holder) + ' · ' : ''}token ••••${esc(String(a.token || '').slice(-4))}${isSuperadmin() && a.ownerUsername ? ' · 👮 ' + esc(a.ownerUsername) : ''}</div></div>
    <button class="btn btn-ghost btn-sm" onclick="payAccountForm('${a.id}')">✏️</button>
    <button class="btn btn-ghost btn-sm" onclick="delPayAccount('${a.id}')">🗑️</button></div>`).join('') : '<div class="empty">Todavía no cargaste ninguna cuenta de cobro.</div>';
  app.innerHTML = `<div class="section-head"><div class="page-title"><h1>💳 Cuentas de cobro</h1></div>
    <button class="btn btn-primary" onclick="payAccountForm()">➕ Agregar cuenta</button></div>
    <p class="page-sub">Cuentas de MercadoPago donde recibís la plata de las inscripciones. Al crear un torneo elegís cuál usar. <b>Solo vos ves las tuyas.</b></p>
    ${mpHelpHtml()}
    ${rows}`;
}
function payAccountForm(id) {
  const a = id ? payAccountById(id) : { name: '', holder: '', token: '' };
  if (id && !ownsPayAccount(a)) return;
  openModal(`<h3>${id ? 'Editar' : 'Agregar'} cuenta de cobro</h3>
    <label>Nombre <span class="muted">(para identificarla)</span></label><input id="pa_name" value="${esc(a.name || '')}" placeholder="Ej: Cuenta del club"/>
    <label>Titular <span class="muted">(opcional)</span></label><input id="pa_holder" value="${esc(a.holder || '')}" placeholder="Nombre del titular de la cuenta"/>
    <label>Access Token de MercadoPago</label>
    <input id="pa_token" value="${esc(a.token || '')}" placeholder="APP_USR-..." autocomplete="off" spellcheck="false"/>
    <p class="hint" style="margin-top:6px">¿No sabés de dónde sacarlo? Cerrá esto y mirá <b>“¿Cómo obtengo el Access Token?”</b> en la sección. Es secreto: solo lo ves vos.</p>
    <div id="pa_err" class="banner" hidden></div>
    <div class="row spread" style="margin-top:16px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="savePayAccount('${id || ''}')">Guardar</button></div>`);
}
function savePayAccount(id) {
  const e = $('#pa_err'), fail = m => { e.hidden = false; e.textContent = m; };
  const name = $('#pa_name').value.trim(), holder = $('#pa_holder').value.trim(), token = $('#pa_token').value.trim();
  if (!name) return fail('Ponele un nombre a la cuenta.');
  if (!token) return fail('Pegá el Access Token de MercadoPago.');
  if (!/^(APP_USR-|TEST-)/.test(token)) return fail('El Access Token no parece válido (debe empezar con APP_USR- o TEST-).');
  const test = /^TEST-/.test(token);
  if (id) {
    const a = payAccountById(id); if (!a || !ownsPayAccount(a)) return;
    Object.assign(a, { name, holder: holder || null, token, test });
  } else {
    const u = currentUser() || {};
    DB.payAccounts.push({ id: uid('pa_'), name, holder: holder || null, token, test, ownerUid: u.uid || null, ownerUsername: u.username || null, orgId: ctxOrgId(), schoolId: ctxSchoolId() });
  }
  save(DB); closeModal(); render();
}
function delPayAccount(id) {
  const a = payAccountById(id); if (!a || !ownsPayAccount(a)) return;
  const used = (DB.tournaments || []).filter(t => t.payAccountId === id).map(t => t.name);
  const msg = used.length
    ? `Esta cuenta la usan ${used.length} torneo(s): ${used.join(', ')}. Si la borrás, esos torneos quedan sin cobro online. ¿Borrar igual?`
    : `¿Borrar la cuenta de cobro “${a.name}”?`;
  if (!confirm(msg)) return;
  DB.payAccounts = (DB.payAccounts || []).filter(x => x.id !== id);
  save(DB); render();
}
// Inicia el pago online: pide la preferencia al Worker y redirige a MercadoPago.
async function startPayment(tid, cid, entId) {
  const wurl = ((DB.settings && DB.settings.mpWorkerUrl) || '').trim().replace(/\/+$/, '');
  if (!wurl) { alert('Los pagos online todavía no están configurados. Avisале al organizador.'); return; }
  try {
    // CLAVE: asegurar que la inscripción esté guardada en la nube ANTES de ir a MercadoPago,
    // si no, el redirect corta el guardado y la inscripción se pierde.
    if (FB() && window.STORE && window.STORE.sync) { try { await window.STORE.sync(DB); } catch (e) {} }
    const r = await fetch(wurl + '/create-preference', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournamentId: tid, categoryId: cid, entrantId: entId }),
    });
    const d = await r.json();
    if (d && d.init_point) { location.href = d.init_point; return; }
    alert('No se pudo iniciar el pago: ' + ((d && d.error) || 'error desconocido') + '. Probá de nuevo o avisале al organizador.');
  } catch (e) { alert('No se pudo conectar con el servicio de pagos. Probá de nuevo en un rato.'); }
}
// Pago de VARIAS inscripciones en un solo checkout (todas de la misma cuenta de cobro).
async function startPaymentMulti(items) {
  if (!items || !items.length) return;
  if (items.length === 1) return startPayment(items[0].tid, items[0].cid, items[0].eid);
  const wurl = ((DB.settings && DB.settings.mpWorkerUrl) || '').trim().replace(/\/+$/, '');
  if (!wurl) { alert('Los pagos online todavía no están configurados. Avisале al organizador.'); return; }
  try {
    if (FB() && window.STORE && window.STORE.sync) { try { await window.STORE.sync(DB); } catch (e) {} }
    const r = await fetch(wurl + '/create-preference', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items.map(it => ({ tournamentId: it.tid, categoryId: it.cid, entrantId: it.eid })) }),
    });
    const d = await r.json();
    if (d && d.init_point) { location.href = d.init_point; return; }
    alert('No se pudo iniciar el pago: ' + ((d && d.error) || 'error desconocido') + '.');
  } catch (e) { alert('No se pudo conectar con el servicio de pagos. Probá de nuevo en un rato.'); }
}

// Marca como pagados (en memoria) los inscriptos que tienen un pago aprobado. El "pagado" online se
// DEDUCE de la colección payments — el Worker nunca toca el torneo, así no puede borrar inscriptos.
function mergePaymentsIntoEntrants() {
  if (!(DB.payments || []).length) return;
  const ok = {};
  DB.payments.forEach(p => { if (p && p.status === 'approved') ok[`${p.tournamentId}|${p.categoryId}|${p.entrantId}`] = true; });
  (DB.tournaments || []).forEach(t => (t.categorias || []).forEach(c => (c.entrants || []).forEach(e => {
    if (ok[`${t.id}|${c.id}|${e.id}`]) e.paid = true;
  })));
}
// ¿El pago de esta inscripción vino de un pago ONLINE aprobado (MercadoPago)? Si es así, el estado
// se deduce de la colección `payments` y no se puede des-marcar a mano (se revertiría solo).
function paidOnline(cat, entId) {
  return (DB.payments || []).some(p => p && p.status === 'approved' && p.tournamentId === cat._tid && p.categoryId === cat.id && p.entrantId === entId);
}

/* ---------- historial de pagos (admin / superadmin) ---------- */
function renderPayHistory(app) {
  const oid = ctxOrgId(), sid = ctxSchoolId();
  // El admin ve los pagos de su escuela; el superadmin, los de la organización del contexto.
  const list = (DB.payments || [])
    .filter(p => isSuperadmin() ? p.orgId === oid : p.schoolId === sid)
    .slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const total = list.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const fmtDate = s => { if (!s) return '—'; const d = String(s).split('T')[0].split('-'); return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : String(s); };
  const rows = list.map(p => `<div class="player-row">
    <div class="meta"><div class="name">${esc(p.payerName || p.playerName || p.payerEmail || 'Pago')}</div>
      <div class="sub">${esc(p.tournamentName || '')}${p.categoryName ? ' · ' + esc(p.categoryName) : ''} · ${fmtDate(p.createdAt)}</div></div>
    <span class="pay-tag ok">${money(p.amount)}</span></div>`).join('');
  app.innerHTML = `<div class="page-title"><h1>🧾 Historial de pagos</h1></div>
    <p class="page-sub">Pagos online aprobados${isSuperadmin() ? ` de ${esc(orgName(oid))}` : ` de ${esc(schoolName(oid, sid))}`}. ${list.length} pago(s) · total <b>${money(total)}</b>.</p>
    ${list.length ? rows : '<div class="empty">Todavía no hay pagos registrados.</div>'}`;
}

/* ---------- noticias ---------- */
const newsBodyHtml = body => esc(body || '').replace(/\n/g, '<br>');
function renderNoticias(app) {
  const admin = isAdmin();
  const all = (DB.news || []).slice().sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  const list = admin ? all : all.filter(n => n.published);   // jugadores: solo publicadas
  let html = `<div class="section-head"><div class="page-title"><h1>📰 Noticias</h1></div>
    ${admin ? `<button class="btn btn-primary" onclick="noticiaForm()">➕ Nueva noticia</button>` : ''}</div>
    <p class="page-sub">${admin ? 'Publicá novedades del club. Los jugadores ven solo las publicadas.' : 'Novedades del club.'}</p>`;
  if (!list.length) {
    html += `<div class="empty">${admin ? 'Todavía no hay noticias. Creá la primera.' : 'No hay noticias por ahora.'}</div>`;
    app.innerHTML = html; return;
  }
  html += `<div class="news-list">` + list.map(n => `<div class="card news-card${n.published ? '' : ' news-draft'}">
    <div class="news-head"><h3 style="margin:0">${esc(n.title)}</h3>${admin && !n.published ? '<span class="t-badge draft">📝 Borrador</span>' : ''}</div>
    <div class="news-date">📅 ${n.created ? fmtDate(n.created.slice(0, 10)) : ''}</div>
    ${n.body ? `<div class="news-body">${newsBodyHtml(n.body)}</div>` : ''}
    ${admin ? `<div class="row" style="margin-top:12px">
      <button class="btn btn-ghost btn-sm" onclick="toggleNoticiaPublish('${n.id}')">${n.published ? '🙈 Despublicar' : '🚀 Publicar'}</button>
      <button class="btn btn-ghost btn-sm" onclick="noticiaForm('${n.id}')">✏️ Editar</button>
      <button class="btn btn-ghost btn-sm" onclick="delNoticia('${n.id}')">🗑️</button></div>` : ''}
  </div>`).join('') + `</div>`;
  app.innerHTML = html;
}
function noticiaForm(id) {
  const n = id ? (DB.news || []).find(x => x.id === id) : { title: '', body: '', published: false };
  if (!n) return;
  openModal(`<h3>${id ? 'Editar' : 'Nueva'} noticia</h3>
    <label>Título</label><input id="n_title" value="${esc(n.title)}" placeholder="Ej: Inscripciones abiertas"/>
    <label>Contenido</label><textarea id="n_body" rows="6" placeholder="Escribí la noticia…">${esc(n.body)}</textarea>
    <label class="chkline"><input type="checkbox" id="n_pub" ${n.published ? 'checked' : ''}/> Publicada (visible para los jugadores)</label>
    <div id="nerr" class="banner" hidden></div>
    <div class="row spread" style="margin-top:16px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveNoticia('${id || ''}')">Guardar</button></div>`);
}
function saveNoticia(id) {
  const title = $('#n_title').value.trim(), body = $('#n_body').value.trim(), published = $('#n_pub').checked, e = $('#nerr');
  if (!title) { e.hidden = false; e.textContent = 'Poné un título.'; return; }
  if (id) { const n = (DB.news || []).find(x => x.id === id); if (n) { n.title = title; n.body = body; n.published = published; } }
  else { (DB.news || (DB.news = [])).push({ id: uid('n_'), title, body, published, created: new Date().toISOString() }); }
  save(DB); closeModal(); render();
}
function toggleNoticiaPublish(id) { const n = (DB.news || []).find(x => x.id === id); if (n) { n.published = !n.published; save(DB); render(); } }
function delNoticia(id) { const n = (DB.news || []).find(x => x.id === id); if (n && confirm(`¿Eliminar la noticia "${n.title}"?`)) { DB.news = DB.news.filter(x => x.id !== id); save(DB); render(); } }

/* ---------- reglamento (documento único, editable y publicable) ---------- */
// El admin siempre puede verlo/editarlo; los jugadores solo si la feature está activa Y está publicado.
function canSeeReglamento() { return isAdmin() || (!!setting('reglamento') && !!setting('reglamentoPublished')); }
function renderReglamento(app) {
  const admin = isAdmin();
  const text = (setting('reglamentoText') || '').trim(), pub = !!setting('reglamentoPublished');
  const head = `<div class="section-head"><div class="page-title"><h1>📜 Reglamento</h1></div>
    ${admin ? `<button class="btn btn-primary" onclick="reglamentoForm()">✏️ Editar</button>` : ''}</div>`;
  let adminBar = '';
  if (admin) {
    const visible = setting('reglamento') && pub;
    adminBar = `<div class="card" style="margin-bottom:14px">
      <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center">
        <span class="t-badge ${pub ? 'live' : 'draft'}">${pub ? '🟢 Publicado' : '📝 Borrador'}</span>
        <button class="btn btn-ghost btn-sm" onclick="toggleReglamentoPublish()">${pub ? '🙈 Despublicar' : '🚀 Publicar'}</button>
      </div>
      <p class="page-sub" style="margin:10px 0 0">${visible
        ? '✅ Los jugadores pueden verlo.'
        : `⚠️ Los jugadores <b>no</b> lo ven: ${!setting('reglamento') ? 'activá “Reglamento” en Ajustes' : 'está sin publicar'}.`}</p>
    </div>`;
  }
  const content = text
    ? `<div class="card"><div class="news-body">${newsBodyHtml(text)}</div></div>`
    : `<div class="empty">${admin ? 'Todavía no cargaste el reglamento. Tocá «Editar» para escribirlo.' : 'El reglamento todavía no está disponible.'}</div>`;
  app.innerHTML = head + adminBar + content;
}
function reglamentoForm() {
  openModal(`<h3>Editar reglamento</h3>
    <label>Texto del reglamento</label>
    <textarea id="rg_body" rows="14" placeholder="Escribí el reglamento del club…">${esc(setting('reglamentoText') || '')}</textarea>
    <label class="chkline"><input type="checkbox" id="rg_pub" ${setting('reglamentoPublished') ? 'checked' : ''}/> Publicado (visible para los jugadores)</label>
    <div class="row spread" style="margin-top:16px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveReglamento()">Guardar</button></div>`);
}
function saveReglamento() {
  const bag = settingsBag('school', ctxSchoolId(), true); if (!bag) return;
  bag.reglamentoText = $('#rg_body').value;
  bag.reglamentoPublished = $('#rg_pub').checked;
  save(DB); closeModal(); render();
}
function toggleReglamentoPublish() {
  const bag = settingsBag('school', ctxSchoolId(), true); if (!bag) return;
  bag.reglamentoPublished = !(('reglamentoPublished' in bag) ? bag.reglamentoPublished : defaultSetting('reglamentoPublished'));
  save(DB); render();
}

/* ---------- apariencia (admin) ---------- */
// Emojis sugeridos para el ícono del club (se pueden elegir desde el selector).
const EMOJIS = ('🏓 🎾 ⚽ 🏀 🏐 🏏 🏸 🥎 ⚾ 🏑 🏒 🥍 🥅 🎯 🎱 🥊 🥋 🤺 🏆 🥇 🥈 🥉 🏅 🎖 👑 ' +
  '🔥 ⭐ 🌟 ✨ ⚡ 💥 🎉 🎊 🎈 🎁 🚀 💪 🤜 🤛 👊 ✊ 👍 👏 🙌 🙏 🤝 ' +
  '😀 😃 😄 😁 😆 😅 😂 🙂 😉 😊 😎 🤩 🥳 😇 🤓 🧐 🤖 👻 👽 🦾 ' +
  '🐯 🦁 🐶 🐱 🐺 🦊 🐼 🐨 🐵 🦍 🐲 🐉 🦅 🦉 🐢 🐍 🦈 🐬 🦄 🐝 ' +
  '🍕 🍔 🍟 🌮 🌭 🍦 🍩 🍪 🍺 🍻 🥤 ☕ 🧉 🏝 🏔 🌋 🌈 🌙 ⛰ 🎪 ' +
  '💯 ✅ ❎ ⚙ 🔧 🔨 🛠 🎮 🕹 🎲 🃏 🎬 🎵 🎸 🥁 📣 📢 🔔 💎 🏵 ' +
  '🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟤 🔶 🔷 🟧 🟩 🟦 🟪 ⬛ ⬜').split(/\s+/).filter(Boolean);
function renderAppearance(app) {
  if (!themeDraft) themeDraft = Object.assign({}, savedThemeOf()); // arranca el borrador desde lo guardado
  const t = themeOf();
  const msg = themeMsg; themeMsg = '';
  const colorRow = (key, name, desc) => `<div class="setting-row">
      <div class="setting-text"><div class="setting-name">${name}</div><div class="setting-desc">${desc}</div></div>
      <input class="color-input" type="color" value="${esc(t[key])}" aria-label="${esc(name)}" oninput="setThemeField('${key}', this.value)"/>
    </div>`;
  const fontOpts = Object.entries(FONTS).map(([k, f]) => `<option value="${k}" ${t.font === k ? 'selected' : ''} style="font-family:${esc(f.stack)}">${esc(f.label)}</option>`).join('');
  const sName = schoolName(ctxOrgId(), ctxSchoolId());
  app.innerHTML = `<div class="page-title"><h1>🎨 Apariencia</h1></div>
    <p class="page-sub">El tema y el ícono se aplican a los miembros de <b>${esc(sName)}</b> <span class="scope-tag scope-school">🏫 ${esc(sName)}</span>. Previsualizá acá; recién cambia al tocar <b>Publicar cambios</b>.${isSuperadmin() ? ' Cambiá de escuela desde la barra de contexto de arriba.' : ''}</p>
    ${msg ? `<div class="banner ok">${esc(msg)}</div>` : ''}
    <div class="appearance-grid">
      <div class="card">
        <h3 style="margin:0 0 12px">🎨 Colores</h3>
        ${colorRow('table', 'Color principal', 'Encabezado, barra superior y acentos del club.')}
        ${colorRow('ball', 'Color de resaltado', 'Botones activos y elementos destacados (naranja por defecto).')}
        ${colorRow('paddle', 'Color de acción', 'Botones principales (rojo por defecto).')}
        ${colorRow('ok', 'Color de éxito', 'Confirmaciones e interruptores activados (verde por defecto).')}
        ${colorRow('bg', 'Fondo', 'Color de fondo general de las páginas.')}
        ${colorRow('card', 'Tarjetas', 'Fondo de las tarjetas y paneles.')}
        ${colorRow('ink', 'Texto', 'Color del texto principal.')}
        ${colorRow('muted', 'Texto secundario', 'Subtítulos, descripciones y notas.')}
        ${colorRow('line', 'Bordes', 'Líneas y bordes de tarjetas y campos.')}
      </div>
      <div class="card">
        <h3 style="margin:0 0 12px">🔤 Fuente e ícono</h3>
        <div class="setting-text" style="margin-bottom:16px">
          <div class="setting-name">Tipografía</div>
          <div class="setting-desc">Fuente usada en todo el sitio (${Object.keys(FONTS).length} opciones).</div>
          <select id="themeFont" style="margin-top:8px; font-family:${esc((FONTS[t.font] || FONTS.system).stack)}" onchange="setThemeField('font', this.value)">${fontOpts}</select>
        </div>
        <div class="setting-text">
          <div class="setting-name">Ícono principal</div>
          <div class="setting-desc">Emoji que representa al club (barra superior y pantalla de inicio). Escribí/pegá uno o tocá 😀 para elegirlo.</div>
          <div class="emoji-field" style="margin-top:8px">
            <input id="themeEmoji" maxlength="8" value="${esc(t.emoji)}" oninput="setThemeField('emoji', this.value)"/>
            <button type="button" class="emoji-pick-btn" onclick="openEmojiPicker(event)" title="Elegir emoji">😀</button>
          </div>
        </div>
        <div class="theme-preview">
          <div class="tp-label">Vista previa</div>
          <div class="tp-bar"><span class="app-emoji">${esc(t.emoji)}</span> <strong>Tenis de Mesa</strong></div>
          <div class="row" style="margin-top:10px"><button class="btn btn-primary btn-sm" type="button">Acción</button>
            <button class="btn btn-accent btn-sm" type="button">Resaltado</button></div>
        </div>
      </div>
      ${schoolLogoCardHtml()}
    </div>
    <div class="theme-actions">
      <span id="themeDirtyNote" class="dirty-note"></span>
      <button class="btn btn-ghost" onclick="resetTheme()">↩️ Restaurar por defecto</button>
      <button id="btnDiscardTheme" class="btn btn-ghost" onclick="discardTheme()">✖️ Descartar cambios</button>
      <button id="btnPublishTheme" class="btn btn-primary" onclick="publishTheme()">✅ Publicar cambios</button>
    </div>`;
  applyTheme();             // refleja el borrador en la barra/botones/vista previa
  updateThemeDirtyUI();     // estado de los botones y la nota de "cambios sin publicar"
}
// Escuelas que el usuario puede personalizar: superadmin → las de la org del contexto; admin → solo la suya.
function editableSchools() {
  const oid = ctxOrgId(), o = orgById(oid); if (!o) return [];
  if (isSuperadmin()) return o.schools.map(s => ({ orgId: oid, school: s }));
  const sid = ctxSchoolId(), s = schoolById(oid, sid); return s ? [{ orgId: oid, school: s }] : [];
}
// Estado de las escuelas editables: lo guardado en DB vs. el borrador en edición (igual lógica que el tema).
function savedSchools() { const m = {}; editableSchools().forEach(({ orgId, school }) => { m[school.id] = { orgId, name: school.name, logo: school.logo || DEFAULT_SCHOOL_LOGO }; }); return m; }
const schoolsOf = () => schoolDraft || savedSchools();
const schoolsDirty = () => JSON.stringify(schoolsOf()) !== JSON.stringify(savedSchools());
function ensureSchoolDraft() { if (!schoolDraft) schoolDraft = JSON.parse(JSON.stringify(savedSchools())); return schoolDraft; }
// Tarjeta de Apariencia: nombre + logo (imagen) por escuela. Se aplican al tocar “Publicar cambios”.
function schoolLogoCardHtml() {
  const draft = schoolsOf();
  const rows = editableSchools().map(({ orgId, school }) => {
    const d = draft[school.id] || { name: school.name, logo: school.logo || DEFAULT_SCHOOL_LOGO };
    const isImg = /^(data:|https?:)/.test(d.logo);
    const preview = isImg ? `<span class="school-logo-prev"><img src="${d.logo}" alt=""/></span>` : `<span class="school-logo-prev">${esc(d.logo)}</span>`;
    return `<div class="setting-row" style="flex-direction:column;align-items:stretch;gap:10px">
      <div class="setting-name" style="display:flex;align-items:center;gap:8px">${preview} <span class="muted">${esc(orgName(orgId))}</span></div>
      <div>
        <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px">Nombre de la escuela</label>
        <input id="sname_${school.id}" value="${esc(d.name)}" maxlength="40" oninput="setSchoolName('${school.id}', this.value)"/>
      </div>
      <div>
        <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px">Logo (imagen)</label>
        <label class="btn btn-ghost btn-sm">🖼️ ${isImg ? 'Cambiar imagen' : 'Subir imagen'}<input type="file" accept="image/*" hidden onchange="uploadSchoolLogo('${orgId}','${school.id}', this)"></label>
        <div class="setting-desc" style="margin-top:6px">Se muestra como círculo abajo a la derecha de la foto de cada jugador de esta escuela.</div>
      </div>
    </div>`;
  }).join('');
  return `<div class="card">
    <h3 style="margin:0 0 12px">🏫 Escuelas</h3>
    <p class="setting-desc" style="margin:-6px 0 10px">Cambiá el nombre y el logo. Los cambios recién se aplican cuando tocás <b>Publicar cambios</b>.</p>
    ${rows || '<div class="empty">No hay escuelas para configurar.</div>'}
  </div>`;
}
function setSchoolName(schoolId, val) {
  const d = ensureSchoolDraft(); if (!d[schoolId]) return;
  d[schoolId].name = String(val || '').slice(0, 40);
  updateThemeDirtyUI(); // sin re-render: no interrumpe lo que está escribiendo
}
function uploadSchoolLogo(orgId, schoolId, input) {
  const f = input && input.files && input.files[0]; if (!f) return;
  readPhoto(f, data => { if (!data) return; const d = ensureSchoolDraft(); if (d[schoolId]) { d[schoolId].logo = data; render(); } }); // re-render para ver el preview nuevo
}
let themeMsg = ''; // aviso transitorio en Apariencia (ej. tras publicar)
function ensureTheme() { if (!DB.settings) DB.settings = Object.assign({}, DEFAULT_SETTINGS); if (!DB.settings.theme) DB.settings.theme = Object.assign({}, DEFAULT_THEME); }
// Actualiza la nota de cambios y habilita/inhabilita Publicar/Descartar sin re-renderizar todo.
function updateThemeDirtyUI() {
  const dirty = themeDirty() || schoolsDirty(), note = $('#themeDirtyNote');
  if (note) { note.textContent = dirty ? '● Cambios sin publicar' : 'Sin cambios pendientes'; note.classList.toggle('on', dirty); }
  ['#btnPublishTheme', '#btnDiscardTheme'].forEach(s => { const b = $(s); if (b) b.disabled = !dirty; });
}
function setThemeField(key, val) {
  if (!themeDraft) themeDraft = Object.assign({}, savedThemeOf());
  themeDraft[key] = (key === 'emoji') ? (String(val || '').trim().slice(0, 8) || DEFAULT_THEME.emoji) : val;
  applyTheme(); updateThemeDirtyUI();
}
function resetTheme() { themeDraft = Object.assign({}, DEFAULT_THEME); render(); } // carga los valores de fábrica en el borrador
function discardTheme() { themeDraft = null; schoolDraft = null; render(); }       // descarta el borrador (tema + escuelas) y vuelve a lo guardado
function publishTheme() {
  if (!themeDirty() && !schoolsDirty()) return;
  if (themeDraft) { const bag = settingsBag('school', ctxSchoolId(), true); if (bag) bag.theme = Object.assign({}, themeOf()); else { ensureTheme(); DB.settings.theme = Object.assign({}, themeOf()); } }
  if (schoolDraft) { DB.settings.schoolMeta = DB.settings.schoolMeta || {}; Object.entries(schoolDraft).forEach(([sid, d]) => { const s = schoolById(d.orgId, sid); if (s) { s.name = (d.name || '').trim() || s.name; s.logo = d.logo || DEFAULT_SCHOOL_LOGO; DB.settings.schoolMeta[sid] = { name: s.name, logo: s.logo }; } }); }
  themeDraft = null; schoolDraft = null; save(DB);
  themeMsg = '✅ Cambios publicados. Ya los ven los miembros de la escuela.';
  render();
}
// Selector de emojis anclado al botón (reutiliza el popover de mesas).
function openEmojiPicker(ev, target) {
  ev.stopPropagation();
  window.__emojiTarget = target || 'themeEmoji';
  const cells = EMOJIS.map(e => `<button type="button" class="emoji-opt" onclick="pickEmoji('${e}')">${e}</button>`).join('');
  showPopover(ev.currentTarget, `<h4>Elegí un emoji</h4><div class="emoji-grid">${cells}</div>`);
}
function pickEmoji(e) {
  const tgt = window.__emojiTarget || 'themeEmoji', inp = $('#' + tgt); if (inp) inp.value = e;
  if (tgt === 'themeEmoji') setThemeField('emoji', e);
  else if (inp) inp.dispatchEvent(new Event('input')); // dispara el oninput (ej. logo de escuela)
  closePopover();
}

/* ---------- torneos ---------- */
// Fecha de hoy (YYYY-MM-DD) siempre en horario de Argentina, sin importar el dispositivo.
const todayAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
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
// "En vivo" = mesas en uso. Una zona largada con partidos pendientes ocupa una sola fila;
// la llave / 3er puesto / aplazados aparecen como partidos individuales.
function liveMatchesOf(t) {
  const out = [];
  t.categorias.forEach(cat => {
    cat._tid = t.id;
    (cat.groups || []).forEach((g, gi) => {
      const tbl = cat.zoneTable && cat.zoneTable[gi];
      if (tbl == null) return;
      const pendMatches = (cat.matches || []).filter(m => m.g === gi && !m.postponed && !matchDone(m, cat));
      if (pendMatches.length) out.push({ kind: 'zone', table: tbl, catName: cat.name, label: 'Zona ' + String.fromCharCode(65 + gi), sub: `${pendMatches.length} partido${pendMatches.length === 1 ? '' : 's'} pendiente${pendMatches.length === 1 ? '' : 's'}`, pending: pendMatches.map(m => `${entName(cat, m.a)} vs ${entName(cat, m.b)}`) });
    });
    catMatchList(cat).forEach(({ a, b, m, phase }) => {
      if (isZoneMatch(m)) return; // ya contabilizado por su zona
      if (m.table == null || matchDone(m, cat)) return;
      out.push({ kind: 'match', table: m.table, catName: cat.name, label: `${entName(cat, a)} vs ${entName(cat, b)}`, sub: m.postponed ? phase + ' (aplazado)' : phase });
    });
  });
  return out.sort((x, y) => x.table - y.table);
}
const isLiveTournament = t => liveMatchesOf(t).length > 0;
// Orden por fecha: del más reciente al menos reciente (desempata por fecha de fin).
const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.dateEnd || '').localeCompare(a.dateEnd || '');
// Un torneo es "antiguo" si ya terminó (fecha de fin pasada) y no tiene partidos en vivo.
function isPastTournament(t) {
  if (t.finished) return true;            // finalizado explícitamente → antiguo
  if (isLiveTournament(t)) return false;
  const end = t.dateEnd || t.date; if (!end) return false;
  return end < todayAR(); // comparación de strings YYYY-MM-DD en horario de Argentina
}
// Podio de una categoría: nombres de 1º/2º/3º (o null si no hay campeón todavía).
function podiumOf(cat) {
  if (!cat.bracket) return null;
  const champ = brWinner(cat, cat.bracket.length - 1, 0);
  if (!champ || champ === 'BYE') return null;
  const map = placements(cat);
  const nameAt = n => { const hit = Object.entries(map).find(([, pl]) => pl === n); return hit ? entName(cat, hit[0]) : null; };
  return { first: nameAt(1), second: nameAt(2), third: nameAt(3) };
}
// Bloque de podios del torneo (una línea por categoría que ya tiene campeón). Vacío si no hay resultados.
function podiumHtml(t) {
  return t.categorias.map(c => {
    const p = podiumOf(c); if (!p) return '';
    return `<div class="podium"><span class="podium-cat">${esc(c.name)}</span>
      <span class="podium-pos">🏆 ${esc(p.first)}</span>
      ${p.second ? `<span class="podium-pos">🥈 ${esc(p.second)}</span>` : ''}
      ${p.third ? `<span class="podium-pos">🥉 ${esc(p.third)}</span>` : ''}</div>`;
  }).filter(Boolean).join('');
}
// Podios plegables: por defecto ocultos detrás de "🏅 Ver resultados" para no recargar la tarjeta.
function podiumBlockHtml(t) {
  const pod = podiumHtml(t); if (!pod) return '';
  const n = t.categorias.filter(c => podiumOf(c)).length;
  return `<details class="podium-collapse"><summary>🏅 Ver resultados (${n})</summary>${pod}</details>`;
}
function upcomingCardHtml(t) {
  const live = isLiveTournament(t), gym = gymById(t.gymId), draft = !t.published;
  const actions = `${draft && canEditT(t) ? `<button class="btn btn-primary btn-sm" onclick="publishTournament('${t.id}')">🚀 Publicar</button>` : ''}${canEditT(t) ? `<button class="btn btn-ghost btn-sm" onclick="delTournament('${t.id}')">🗑️</button>` : ''}`;
  return `<div class="card tourn-card clickable${draft ? ' tourn-draft' : live ? ' tourn-live' : ''}" onclick="go('torneo:${t.id}')" title="${draft ? 'Editar torneo' : 'Ver torneo'}">
    ${(draft || live) ? `<div class="t-badges">${draft ? '<span class="t-badge draft">📝 Borrador</span>' : ''}${live ? '<span class="t-badge live">🔴 En vivo</span>' : ''}</div>` : ''}
    <h3 style="margin:0">${esc(t.name)}</h3>
    <div class="when">📅 ${dateRangeLabel(t)}</div>
    ${gym ? `<div class="when">📍 ${esc(gym.name)}</div>` : ''}
    <div class="tags"><span class="tag">${t.categorias.length} categoría(s)</span>${live ? `<span class="tag tag-live">${liveMatchesOf(t).length} en juego</span>` : ''}</div>
    ${podiumBlockHtml(t)}
    ${actions ? `<div class="row" style="margin-top:14px" onclick="event.stopPropagation()">${actions}</div>` : ''}</div>`;
}
function pastCardHtml(t) {
  const gym = gymById(t.gymId), pod = podiumBlockHtml(t);
  const search = esc(`${t.name} ${gym ? gym.name : ''} ${dateRangeLabel(t)}`.toLowerCase());
  return `<div class="card tourn-card-h tourn-old-card clickable" data-search="${search}" onclick="go('torneo:${t.id}')" title="Ver torneo">
    <div class="th-main"><h3 style="margin:0">${esc(t.name)}</h3>
      <div class="when">📅 ${dateRangeLabel(t)}${gym ? ` · 📍 ${esc(gym.name)}` : ''}</div>
      <div class="tags"><span class="tag">${t.categorias.length} categoría(s)</span></div></div>
    <div class="th-podium">${pod || '<span class="muted">Sin resultados cargados</span>'}</div>
    ${canEditT(t) ? `<div class="th-actions" onclick="event.stopPropagation()"><button class="btn btn-ghost btn-sm" onclick="delTournament('${t.id}')">🗑️</button></div>` : ''}</div>`;
}
function renderTournaments(app) {
  const oid = ctxOrgId(), sid = ctxSchoolId();
  // visibles del contexto: misma org y (abierto a la org · de mi escuela · soy superadmin)
  const inScope = t => t.orgId === oid && (isSuperadmin() || t.open || t.schoolId === sid);
  // los borradores (no publicados) solo los ve quien puede editarlos (su dueño / superadmin / colaborador)
  const all = DB.tournaments.filter(t => inScope(t) && (t.published || canEditT(t))).slice().sort(byDateDesc);
  const upcoming = all.filter(t => !isPastTournament(t));
  const past = all.filter(t => isPastTournament(t));
  const upCards = upcoming.map(upcomingCardHtml).join('');
  const pastCards = past.map(pastCardHtml).join('');
  app.innerHTML = `<div class="section-head"><div class="page-title"><h1>📅 Torneos</h1></div>
    ${isAdmin() ? `<button class="btn btn-primary" onclick="tournamentForm()">➕ Crear torneo</button>` : ''}</div>
    <p class="page-sub">Cada torneo agrupa varias categorías (sub-torneos).</p>
    <div class="section-head"><h2>🔜 Torneos próximos</h2></div>
    <div class="cards">${upCards || '<div class="empty">No hay torneos próximos.</div>'}</div>
    <div class="section-head"><h2>📚 Torneos antiguos</h2></div>
    ${past.length ? `<input class="tourn-search" placeholder="🔍 Buscar torneo por nombre, lugar o fecha…" oninput="tournFilter(this)" value="${esc(tournSearch)}"/>` : ''}
    <div class="cards-h">${pastCards || '<div class="empty">No hay torneos antiguos todavía.</div>'}</div>`;
  if (tournSearch) { const inp = $('.tourn-search'); if (inp) tournFilter(inp); }
}
function tournFilter(inp) {
  tournSearch = inp.value;
  const q = inp.value.toLowerCase();
  document.querySelectorAll('.tourn-old-card').forEach(c => { c.style.display = c.dataset.search.includes(q) ? '' : 'none'; });
}
// Selector de colaboradores con buscador + chips. El estado vive en window.__collabSel.
function collabPickerHtml(initial) {
  window.__collabSel = [...(initial || [])];
  const list = DB.players.filter(p => !p.pending).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  const results = list.length
    ? list.map(p => `<li class="collab-opt" data-id="${p.id}" data-name="${esc(fullName(p)).toLowerCase()}" onclick="collabAdd('${p.id}')">${esc(fullName(p))} <span class="muted">· ${p.category}</span></li>`).join('')
    : '<li class="muted" style="padding:8px 10px">No hay jugadores.</li>';
  // onmousedown preventDefault en la lista: al tocar una opción no se pierde el foco del input (sigue abierto)
  // La lista se muestra/oculta según el TEXTO escrito (no según focus/blur), para que ande bien en celular.
  return `<div class="collab-picker">
    <input class="collab-search" placeholder="🔍 Escribí un nombre para buscar…" autocomplete="off" oninput="collabFilter(this)"/>
    <ul class="collab-results" id="collab-results" hidden>${results}</ul>
    <div class="collab-chips" id="collab-chips"></div>
  </div>`;
}
function collabOpen() { collabFilter(document.querySelector('.collab-search')); }   // compat
function collabClose() { const r = document.querySelector('#collab-results'); if (r) r.hidden = true; }
function collabFilter(inp) {
  const q = (inp && inp.value || '').trim().toLowerCase();
  const results = document.querySelector('#collab-results');
  let anyVisible = false;
  document.querySelectorAll('#collab-results .collab-opt').forEach(li => {
    const selected = window.__collabSel.includes(li.dataset.id);
    const show = !!q && !selected && li.dataset.name.includes(q);  // solo con texto y no ya elegido
    li.style.display = show ? '' : 'none';
    if (show) anyVisible = true;
  });
  if (results) results.hidden = !anyVisible;   // sin resultados visibles → ocultar la caja
}
function renderCollabChips() {
  const box = document.querySelector('#collab-chips'); if (!box) return;
  box.innerHTML = window.__collabSel.length
    ? window.__collabSel.map(id => { const p = playerById(id); return `<span class="collab-chip">${esc(p ? fullName(p) : '?')}<button type="button" class="chip-x" onclick="collabRemove('${id}')" title="Quitar">✕</button></span>`; }).join('')
    : '<span class="muted" style="font-size:13px">Todavía no agregaste colaboradores.</span>';
}
function refreshCollab() { renderCollabChips(); }
function collabAdd(id) {
  if (!window.__collabSel.includes(id)) window.__collabSel.push(id);
  const s = document.querySelector('.collab-search');
  if (s) { s.value = ''; s.focus(); }          // limpio el texto para seguir buscando otro jugador
  renderCollabChips(); collabFilter(s);        // al quedar sin texto, la lista se oculta
}
function collabRemove(id) { window.__collabSel = window.__collabSel.filter(x => x !== id); renderCollabChips(); collabFilter(document.querySelector('.collab-search')); }
function tournamentForm() {
  const checks = catCatalog().map(c => `<label class="catchk"><input type="checkbox" class="cat-chk" value="${esc(c.name)}"/>
    <span>${esc(c.name)}</span><small class="muted">${ruleLabel(c.rule)} · ${setsFmtById(c.setsFormat).label}</small></label>`).join('');
  openModal(`<h3>Crear torneo</h3>
    <label>Nombre</label><input id="t_name" placeholder="Ej: Apertura 2026"/>
    <div class="grid2">
      <div><label>Fecha inicio</label><input id="t_date" type="date" min="${todayAR()}"/></div>
      <div><label>Fecha fin <span class="muted">(opcional)</span></label><input id="t_dateEnd" type="date" min="${todayAR()}"/></div>
    </div>
    <p class="hint" style="margin-top:0">Para torneos de varios días (ej. sábado y domingo) poné inicio y fin. La fecha de inicio no puede ser anterior a hoy.</p>
    <label>Cantidad de mesas disponibles</label>
    <input id="t_tables" type="number" min="1" value="4"/>
    <p class="hint" style="margin-top:4px">Mesas físicas del torneo. Después podés cambiarla, incluso con el torneo en juego.</p>
    ${isSuperadmin() ? `<div class="grid2">
      <div><label>Organización</label>${orgSelectHtml('t_org', ctxOrgId(), "syncSchoolOptions('t_org','t_school')")}</div>
      <div><label>Escuela</label><select id="t_school">${schoolOptionsHtml(ctxOrgId(), ctxSchoolId())}</select></div>
    </div>` : `<input type="hidden" id="t_org" value="${ctxOrgId()}"/><input type="hidden" id="t_school" value="${ctxSchoolId()}"/>`}
    <label>Tipo de torneo</label>
    <select id="t_open">
      <option value="open">Abierto — se puede inscribir cualquier jugador de la organización</option>
      <option value="closed">Cerrado — solo jugadores de la escuela (${esc(schoolName(ctxOrgId(), ctxSchoolId()))})</option>
    </select>
    <p class="hint" style="margin-top:4px">Los torneos <b>abiertos</b> suman puntos al ranking de escuelas; los <b>cerrados</b> son internos de la escuela.</p>
    <label>Lugar (gimnasio)</label>
    <select id="t_gym">${(DB.gyms || []).length ? (DB.gyms || []).map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('') : '<option value="">— sin gimnasios cargados —</option>'}</select>
    <p class="hint" style="margin-top:4px">¿Falta un gimnasio? Agregalo en la sección <b>🏟️ Gimnasios</b>.</p>
    ${(setting('paymentsAllowed') && setting('paymentsEnabled')) ? `<label>Cuenta de cobro <span class="muted">(MercadoPago)</span></label>
    <select id="t_payacct">${payAccountOptions((myPayAccounts()[0] || {}).id)}</select>
    <p class="hint" style="margin-top:4px">${myPayAccounts().length ? 'A esta cuenta entra la plata de las inscripciones de este torneo. La gestionás en <b>💳 Cuentas de cobro</b>.' : '⚠️ No tenés cuentas cargadas. Agregá una en <b>💳 Cuentas de cobro</b> para poder cobrar online.'}</p>` : ''}
    <label>Categorías del torneo</label>
    <p class="hint" style="margin-top:0">Marcá las que se jueguen. Heredan las reglas del catálogo global (formato, sets, grupos, puntos) — las gestiona el admin en <b>🗂️ Categorías</b> y podés ajustarlas por torneo después.</p>
    <div class="catgrid">${checks}</div>
    <label>Colaboradores <span class="muted">(opcional)</span></label>
    <p class="hint" style="margin-top:0">Buscá y agregá jugadores que van a poder ayudar a gestionar este torneo (inscribir, cargar resultados, abrir/cerrar inscripciones).</p>
    ${collabPickerHtml([])}
    <div id="terr" class="banner" hidden></div>
    <p class="hint" style="margin-top:0">El torneo se crea como <b>borrador</b> (solo lo ves vos) hasta que lo publiques.</p>
    <div class="row spread" style="margin-top:12px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveTournament()">Crear borrador</button></div>`);
  refreshCollab();
}
function saveTournament() {
  const name = $('#t_name').value.trim(), date = $('#t_date').value, dateEnd = $('#t_dateEnd').value || date, e = $('#terr');
  if (!name || !date) { e.hidden = false; e.textContent = 'Nombre y fecha de inicio obligatorios.'; return; }
  if (date < todayAR()) { e.hidden = false; e.textContent = 'La fecha de inicio no puede ser anterior a hoy.'; return; }
  if (dateEnd < date) { e.hidden = false; e.textContent = 'La fecha de fin no puede ser anterior al inicio.'; return; }
  const picked = [...$('#modalCard').querySelectorAll('.cat-chk:checked')].map(c => c.value);
  if (!picked.length) { e.hidden = false; e.textContent = 'Elegí al menos una categoría.'; return; }
  const categorias = picked.map(nm => newCategoryFromCatalog(nm)); // heredan reglas del catálogo global
  const tableCount = Math.max(1, parseInt($('#t_tables').value, 10) || 1);
  const collaborators = [...(window.__collabSel || [])];
  const orgId = ($('#t_org') && $('#t_org').value) || ctxOrgId();
  let schoolId = ($('#t_school') && $('#t_school').value) || ctxSchoolId();
  if (!schoolById(orgId, schoolId)) schoolId = ((orgById(orgId) || {}).schools || [{}])[0].id; // coherencia org/escuela
  const open = (($('#t_open') && $('#t_open').value) || 'open') === 'open';
  const payAccountId = ($('#t_payacct') && $('#t_payacct').value) || null;
  const data = { name, date, dateEnd, gymId: ($('#t_gym').value || null), tableCount, collaborators, orgId, schoolId, open, payAccountId, categorias };
  // Advertencia si ya hay un torneo de la misma org/escuela en esas fechas.
  const conflicts = tournamentDateConflicts(data);
  if (conflicts.length) {
    window.__pendingTournament = data;
    const list = conflicts.map(c => `<li><b>${esc(c.name)}</b> — ${esc(dateRangeLabel(c))} <span class="muted">(${c.schoolId === data.schoolId ? 'misma escuela' : 'misma organización'})</span></li>`).join('');
    openModal(`<h3>⚠️ Ya hay un torneo en esas fechas</h3>
      <p>El torneo que estás creando se superpone con:</p>
      <ul style="margin:8px 0 0;padding-left:20px">${list}</ul>
      <p style="margin-top:12px">¿Querés crearlo igual?</p>
      <div class="row spread" style="margin-top:16px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmCreateTournament()">Crear igual</button></div>`);
    return;
  }
  createTournament(data);
}
// Torneos de la MISMA organización cuyo rango de fechas se solapa con el nuevo.
function tournamentDateConflicts(data) {
  const aS = data.date, aE = data.dateEnd || data.date;
  return (DB.tournaments || []).filter(t => {
    if (t.orgId !== data.orgId) return false;
    const bS = t.date, bE = t.dateEnd || t.date;
    return aS <= bE && bS <= aE; // solapamiento de rangos (fechas YYYY-MM-DD comparables como strings)
  });
}
function confirmCreateTournament() { const d = window.__pendingTournament; window.__pendingTournament = null; if (d) createTournament(d); }
function createTournament(data) {
  const u = currentUser() || {};
  const tnew = Object.assign({ id: uid('t_'), enrollClosed: false, published: false, started: false, ownerUid: u.uid || null, ownerUsername: u.username || null }, data);
  DB.tournaments.push(tnew);
  save(DB); closeModal(); view = 'torneo:' + tnew.id; render(); // abre el borrador para seguir editándolo
}
function delTournament(id) { if (!canEditT(tById(id))) return; if (confirm('¿Eliminar torneo?')) { DB.tournaments = DB.tournaments.filter(t => t.id !== id); save(DB); render(); } }

/* ----- colaboradores del torneo (admin) ----- */
function collaboratorsModal(tid) {
  const t = tById(tid); if (!t || !(ownsTournament(t) || isSuperadmin())) return; // solo el dueño/superadmin gestiona colaboradores
  openModal(`<h3>Colaboradores — ${esc(t.name)}</h3>
    <p class="hint" style="margin-top:0">Pueden editar este torneo: inscribir jugadores, cargar resultados, abrir/cerrar inscripciones, armar grupos y la llave.</p>
    ${collabPickerHtml(t.collaborators)}
    <div class="row spread" style="margin-top:16px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveCollaborators('${tid}')">Guardar</button></div>`);
  refreshCollab();
}
function saveCollaborators(tid) {
  const t = tById(tid); if (!t || !(ownsTournament(t) || isSuperadmin())) return; // solo el dueño/superadmin
  t.collaborators = [...(window.__collabSel || [])];
  save(DB); closeModal(); render();
}

/* ----- inscripción a nivel torneo ----- */
function toggleTournamentEnroll(tid) {
  const t = tById(tid); if (!t || !canEditT(t)) return;
  t.enrollClosed = !t.enrollClosed;
  // Al cerrar a nivel torneo, limpiamos los overrides por categoría que la dejaban abierta, para que el
  // cierre realmente cierre todo (antes una categoría forzada "abierta" seguía aceptando inscripciones).
  if (t.enrollClosed) (t.categorias || []).forEach(c => { if (c.enrollOverride === 'open') c.enrollOverride = null; });
  save(DB); render();
}

/* ----- publicar torneo (borrador → visible para todos) ----- */
function publishTournament(tid) {
  const t = tById(tid); if (!t || !canEditT(t)) return;
  if (!confirm('¿Publicar este torneo? Una vez publicado, todos los jugadores van a poder verlo y no se puede volver a borrador.')) return;
  t.published = true; save(DB); render();
}

/* ----- iniciar torneo (habilita largar zonas / cargar resultados / sugerencias) ----- */
function startTournament(tid) {
  const t = tById(tid); if (!t || !canEditT(t)) return;
  if (!confirm('¿Iniciar el torneo? A partir de ahí vas a poder largar zonas, cargar resultados y ver las sugerencias de mesas. (Inscribí y armá los grupos antes de iniciar.)')) return;
  t.started = true; save(DB); render();
}
/* ----- finalizar / reabrir torneo (admin o colaborador) ----- */
function finalizeTournament(tid) {
  const t = tById(tid); if (!t || !canEditT(t)) return;
  if (!confirm('¿Dar por finalizado el torneo? Los jugadores lo verán en modo lectura y pasará a “Torneos antiguos”. Podés reabrirlo después.')) return;
  t.finished = true; save(DB); render();
}
function reopenTournament(tid) {
  const t = tById(tid); if (!t || !canEditT(t)) return;
  if (!confirm('¿Reabrir el torneo? Vuelve a estar activo y editable para todos los que corresponda.')) return;
  t.finished = false; save(DB); render();
}

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

/* ----- editar datos del torneo (nombre, fechas, lugar) ----- */
function editTournamentModal(tid) {
  const t = tById(tid); if (!t || !canEditT(t)) return;
  openModal(`<h3>Editar datos del torneo</h3>
    <label>Nombre</label><input id="et_name" value="${esc(t.name)}"/>
    <div class="grid2">
      <div><label>Fecha inicio</label><input id="et_date" type="date" value="${t.date || ''}"/></div>
      <div><label>Fecha fin <span class="muted">(opcional)</span></label><input id="et_dateEnd" type="date" value="${t.dateEnd || ''}"/></div>
    </div>
    <label>Lugar (gimnasio)</label>
    <select id="et_gym"><option value="">— sin gimnasio —</option>${(DB.gyms || []).map(g => `<option value="${g.id}" ${g.id === t.gymId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>
    <div id="eterr" class="banner" hidden></div>
    <div class="row spread" style="margin-top:18px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveTournamentEdit('${tid}')">Guardar</button></div>`);
}
function saveTournamentEdit(tid) {
  const t = tById(tid), e = $('#eterr');
  const name = $('#et_name').value.trim(), date = $('#et_date').value, dateEnd = $('#et_dateEnd').value || date;
  if (!name || !date) { e.hidden = false; e.textContent = 'Nombre y fecha de inicio obligatorios.'; return; }
  if (dateEnd < date) { e.hidden = false; e.textContent = 'La fecha de fin no puede ser anterior al inicio.'; return; }
  t.name = name; t.date = date; t.dateEnd = dateEnd; t.gymId = $('#et_gym').value || null;
  save(DB); closeModal(); render();
}
// ¿Es un partido de zona (grupo) que se juega en la mesa de la zona? (los aplazados pasan a individual)
const isZoneMatch = m => !!(m && m.g != null && !m.postponed);
// Mesa efectiva de un partido: la de su zona si es de grupo (no aplazado); si no, la individual (m.table).
function matchTableOf(cat, m) {
  if (!m) return null;
  if (isZoneMatch(m)) { const zt = cat.zoneTable; return zt && zt[m.g] != null ? zt[m.g] : null; }
  return m.table != null ? m.table : null;
}
// Partidos con mesa individual: llave, 3er puesto y partidos de grupo aplazados.
function catIndividualMatches(cat) {
  const out = [];
  (cat.matches || []).forEach(m => { if (m.postponed) out.push(m); });
  if (cat.bracket) cat.bracket.forEach(round => round.forEach(mm => out.push(mm)));
  if (cat.thirdPlace) out.push(cat.thirdPlace);
  return out;
}
// Mesas ocupadas del torneo (de cualquier categoría). exceptMm excluye el propio partido al re-asignar.
// Una mesa de zona queda ocupada mientras la zona tenga partidos no aplazados y sin terminar.
function occupiedTablesOf(t, exceptMm) {
  const set = new Set();
  t.categorias.forEach(cat => {
    cat._tid = t.id;
    (cat.groups || []).forEach((g, gi) => {
      const tbl = cat.zoneTable && cat.zoneTable[gi];
      if (tbl == null) return;
      const pending = (cat.matches || []).some(m => m.g === gi && !m.postponed && m !== exceptMm && !matchDone(m, cat));
      if (pending) set.add(tbl);
    });
    catIndividualMatches(cat).forEach(m => { if (m && m !== exceptMm && m.table != null && !matchDone(m, cat)) set.add(m.table); });
  });
  return set;
}
// Control de inicio de un partido. Sin empezar: botón "Iniciar" (abre el popover de mesas).
// En curso: insignia de la mesa (al tocarla, el editor puede mover/liberar). Jugador: solo insignia.
function startControl(cat, kind, gidx, r, m, mm) {
  const cur = mm && mm.table != null ? mm.table : null;
  const args = `event,'${cat._tid}','${cat.id}','${kind}',${gidx ?? 'null'},${r ?? 'null'},${m ?? 'null'}`;
  if (!canEditCat(cat) || !catTournStarted(cat)) return cur != null ? `<span class="mesa-badge">🏓 Mesa ${cur}</span>` : '';
  if (cur == null) return `<button class="btn btn-primary btn-sm start-btn" onclick="openTablePopover(${args})">▶️ Iniciar</button>`;
  return `<button class="mesa-badge mesa-badge-btn" onclick="openTablePopover(${args})" title="Mover el partido a otra mesa o liberarla">🏓 Mesa ${cur} ⚙️</button>`;
}
// Botón de carga de resultado. Deshabilitado hasta que el partido se inicie (tenga mesa asignada).
function resultBtn(cat, kind, gidx, r, m, mm, done, cls, editLabel) {
  const args = `'${cat._tid}','${cat.id}','${kind}',${gidx ?? 'null'},${r ?? 'null'},${m ?? 'null'}`;
  if (done) return `<button class="${cls}" onclick="resultModal(${args})">${editLabel}</button>`;
  if (matchTableOf(cat, mm) == null) {
    // Mostramos el motivo EN PANTALLA (no solo en title=, invisible en celular).
    const tip = !catTournStarted(cat) ? 'Iniciá el torneo para cargar resultados.' : isZoneMatch(mm) ? 'Largá la zona primero (botón «Largar zona»).' : 'Iniciá el partido: tocá «Iniciar» y elegí una mesa.';
    const short = !catTournStarted(cat) ? '🔒 Iniciá el torneo' : isZoneMatch(mm) ? '🔒 Largá la zona' : '🔒 Iniciá el partido';
    return `<button class="${cls}" disabled title="${tip}">${short}</button>`;
  }
  return `<button class="${cls}" onclick="resultModal(${args})">Cargar</button>`;
}
// Popover anclado al botón para elegir/mover la mesa (entre TODAS las mesas del torneo).
function openTablePopover(ev, tid, cid, kind, gidx, r, m) {
  ev.stopPropagation();
  const cat = getCat(tid, cid); cat._tid = tid;
  const { mm } = locateMatch(cat, kind, gidx, r, m);
  const t = tById(tid), max = tableCountOf(t);
  const occ = occupiedTablesOf(t, mm);               // mesas tomadas por otros partidos en curso (de cualquier categoría)
  const cur = mm && mm.table != null ? mm.table : null;
  const top = Math.max(max, cur || 0);
  let cells = '';
  for (let i = 1; i <= top; i++) {
    const busy = occ.has(i), isCur = cur === i;
    const tag = busy ? '<small>ocupada</small>' : isCur ? '<small>actual</small>' : '';
    const args = `'${tid}','${cid}','${kind}',${gidx ?? 'null'},${r ?? 'null'},${m ?? 'null'},${i}`;
    cells += `<button class="table-opt${isCur ? ' current' : ''}${busy ? ' busy' : ''}" ${busy ? 'disabled' : ''} onclick="assignTableFromPopover(${args})">🏓<span>Mesa ${i}</span>${tag}</button>`;
  }
  const liberar = cur != null
    ? `<button class="btn btn-ghost btn-sm pop-free" onclick="assignTableFromPopover('${tid}','${cid}','${kind}',${gidx ?? 'null'},${r ?? 'null'},${m ?? 'null'},0)">⏹️ Liberar mesa (detener partido)</button>`
    : '';
  const html = `<h4>${cur != null ? 'Mover de mesa' : 'Iniciar partido'}</h4>
    <div class="pop-sub">Elegí una de las ${max} mesa${max === 1 ? '' : 's'} del torneo. Las ocupadas por otro partido en curso no se pueden elegir.</div>
    <div class="table-grid">${cells}</div>${liberar}`;
  showPopover(ev.currentTarget, html);
}
function assignTableFromPopover(tid, cid, kind, gidx, r, m, tableNum) {
  closePopover();
  setMatchTable(tid, cid, kind, gidx, r, m, tableNum > 0 ? String(tableNum) : '');
}
function setMatchTable(tid, cid, kind, gidx, r, m, val) {
  const cat = getCat(tid, cid); cat._tid = tid;
  const { mm } = locateMatch(cat, kind, gidx, r, m);
  const num = val ? parseInt(val, 10) : null;
  if (num != null && occupiedTablesOf(tById(tid), mm).has(num)) { alert(`La mesa ${num} ya está ocupada por otro partido en curso. Esperá a que se libere.`); render(); return; }
  mm.table = num;
  save(DB); render();
}

/* ---- largado de ZONA (grupo): toda la zona se juega en la misma mesa ---- */
function zoneControl(cat, gi) {
  const zt = cat.zoneTable && cat.zoneTable[gi] != null ? cat.zoneTable[gi] : null;
  if (!canEditCat(cat) || !catTournStarted(cat)) return zt != null ? `<span class="mesa-badge">🏓 Mesa ${zt}</span>` : '';
  const args = `event,'${cat._tid}','${cat.id}',${gi}`;
  if (zt == null) return `<button class="btn btn-primary btn-sm start-btn" onclick="openZonePopover(${args})">▶️ Largar zona</button>`;
  return `<button class="mesa-badge mesa-badge-btn" onclick="openZonePopover(${args})" title="Mover la zona de mesa o liberarla">🏓 Mesa ${zt} ⚙️</button>`;
}
function openZonePopover(ev, tid, cid, gi) {
  ev.stopPropagation();
  const cat = getCat(tid, cid); cat._tid = tid;
  const t = tById(tid), max = tableCountOf(t);
  const occ = occupiedTablesOf(t);
  const cur = cat.zoneTable && cat.zoneTable[gi] != null ? cat.zoneTable[gi] : null;
  if (cur != null) occ.delete(cur); // la mesa actual de la zona es seleccionable (no "ocupada" para sí misma)
  const top = Math.max(max, cur || 0);
  let cells = '';
  for (let i = 1; i <= top; i++) {
    const busy = occ.has(i), isCur = cur === i, tag = busy ? '<small>ocupada</small>' : isCur ? '<small>actual</small>' : '';
    cells += `<button class="table-opt${isCur ? ' current' : ''}${busy ? ' busy' : ''}" ${busy ? 'disabled' : ''} onclick="assignZoneTable('${tid}','${cid}',${gi},${i})">🏓<span>Mesa ${i}</span>${tag}</button>`;
  }
  const liberar = cur != null ? `<button class="btn btn-ghost btn-sm pop-free" onclick="assignZoneTable('${tid}','${cid}',${gi},0)">⏹️ Liberar mesa de la zona</button>` : '';
  showPopover(ev.currentTarget, `<h4>${cur != null ? 'Mover zona de mesa' : 'Largar zona ' + String.fromCharCode(65 + gi)}</h4>
    <div class="pop-sub">Todos los partidos de la zona se juegan en esta mesa hasta terminar.</div>
    <div class="table-grid">${cells}</div>${liberar}`);
}
// Jugadores de esta zona que YA están jugando activamente en otra zona/partido (con mesa asignada y
// partido pendiente). Devuelve, por jugador, dónde está jugando y en qué mesa.
function zoneLaunchConflicts(t, cat, gi) {
  const zonePlys = zonePlayers(cat, gi);
  const out = [];
  tournamentUnits(t).forEach(u => {
    if (u.table == null || u.pending <= 0) return;
    if (u.kind === 'zone' && u.cat.id === cat.id && u.gi === gi) return; // la misma zona no cuenta
    const occ = u.kind === 'zone' ? zonePendingPlayers(u.cat, u.gi) : u.players; // en una zona, solo los que aún juegan
    occ.forEach(pid => { if (zonePlys.has(pid)) out.push({ pid, label: `${u.cat.name} · ${u.label}`, table: u.table }); });
  });
  return out;
}
function showZoneConflictModal(tid, cid, gi, num, conflicts) {
  const seen = new Set();
  const rows = conflicts.filter(c => !seen.has(c.pid) && seen.add(c.pid)).map(c => {
    const p = playerById(c.pid);
    return `<li>👤 <b>${esc(p ? fullName(p) : '?')}</b> — está jugando en <b>${esc(c.label)}</b> · 🏓 Mesa ${c.table}</li>`;
  }).join('');
  openModal(`<h3>⚠️ Jugadores ocupados</h3>
    <p class="muted" style="margin-top:0">Estos jugadores de la <b>Zona ${String.fromCharCode(65 + gi)}</b> están jugando ahora en otra mesa. Si la largás igual, sus partidos de esta zona van a tener que esperar a que se liberen.</p>
    <ul class="conflict-list">${rows}</ul>
    <div class="row spread" style="margin-top:16px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="closeModal();assignZoneTable('${tid}','${cid}',${gi},${num},true)">Largar igual</button></div>`);
}
function assignZoneTable(tid, cid, gi, tableNum, force) {
  closePopover();
  const cat = getCat(tid, cid); cat._tid = tid;
  if (!cat.zoneTable) cat.zoneTable = {};
  const num = tableNum > 0 ? tableNum : null;
  if (num == null) { delete cat.zoneTable[gi]; save(DB); render(); return; }
  const t = tById(tid);
  const occ = occupiedTablesOf(t); if (cat.zoneTable[gi] != null) occ.delete(cat.zoneTable[gi]);
  if (occ.has(num)) { alert(`La mesa ${num} ya está ocupada. Esperá a que se libere.`); render(); return; }
  // Aviso: ¿hay jugadores de esta zona jugando activamente en otra mesa? Damos la opción de largar igual.
  if (!force) { const conflicts = zoneLaunchConflicts(t, cat, gi); if (conflicts.length) { showZoneConflictModal(tid, cid, gi, num, conflicts); return; } }
  cat.zoneTable[gi] = num; save(DB); render();
}
// Aplazar un partido de grupo: lo saca de la mesa de la zona (libera la mesa para ese partido) y pasa a largado individual.
function postponeMatch(tid, cid, idx) { const cat = getCat(tid, cid); const m = cat.matches && cat.matches[idx]; if (!m) return; m.postponed = true; m.table = null; save(DB); render(); }
function resumeMatch(tid, cid, idx) { const cat = getCat(tid, cid); const m = cat.matches && cat.matches[idx]; if (!m) return; m.postponed = false; m.table = null; save(DB); render(); }

/* ---- no se presentó (walkover): el rival gana need(cat)-0 ---- */
function noShowBtn(cat, kind, gidx, r, m) {
  const args = `'${cat._tid}','${cat.id}','${kind}',${gidx ?? 'null'},${r ?? 'null'},${m ?? 'null'}`;
  return `<button class="btn btn-ghost btn-sm" onclick="noShowModal(${args})" title="Cargar como no presentado (pierde por no presentación)">🚷</button>`;
}
function noShowModal(tid, cid, kind, gidx, r, m) {
  const cat = getCat(tid, cid); cat._tid = tid;
  const { mm, a, b } = locateMatch(cat, kind, gidx, r, m);
  if (!a || !b || a === 'BYE' || b === 'BYE') { alert('Faltan definir los dos participantes.'); return; }
  const args = `'${tid}','${cid}','${kind}',${gidx ?? 'null'},${r ?? 'null'},${m ?? 'null'}`;
  openModal(`<h3>No se presentó</h3>
    <p class="muted" style="margin:0 0 12px">Elegí quién <b>no se presentó</b>. El rival gana ${Math.ceil(bestOfOf(mm, cat) / 2)}-0.</p>
    <div class="row" style="gap:10px;flex-wrap:wrap">
      <button class="btn btn-ghost" onclick="applyWalkover(${args},'a')">🚷 ${esc(entName(cat, a))}</button>
      <button class="btn btn-ghost" onclick="applyWalkover(${args},'b')">🚷 ${esc(entName(cat, b))}</button>
    </div>
    <div class="row" style="margin-top:16px"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancelar</button></div>`);
}
function applyWalkover(tid, cid, kind, gidx, r, m, absentSide) {
  const cat = getCat(tid, cid); cat._tid = tid;
  const { mm } = locateMatch(cat, kind, gidx, r, m);
  const n = Math.ceil(bestOfOf(mm, cat) / 2), winSide = absentSide === 'a' ? 'b' : 'a';
  mm.sets = Array.from({ length: n }, () => winSide === 'a' ? [11, 0] : [0, 11]);
  mm.walkover = winSide; if (mm.postponed) mm.postponed = false;
  save(DB); closeModal(); render();
}
// ---- popover genérico (no es modal: anclado, sin oscurecer la pantalla) ----
function closePopover() { const h = $('#popHost'); if (h) h.remove(); }
function showPopover(anchor, html) {
  closePopover();
  const host = document.createElement('div'); host.className = 'popover-host'; host.id = 'popHost';
  host.addEventListener('click', e => { if (e.target === host) closePopover(); });
  const pop = document.createElement('div'); pop.className = 'popover'; pop.innerHTML = html;
  host.appendChild(pop); document.body.appendChild(host);
  const ar = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight, pad = 8;
  let left = ar.left, top = ar.bottom + 6;
  if (left + pw > window.innerWidth - pad) left = window.innerWidth - pad - pw;
  if (left < pad) left = pad;
  if (top + ph > window.innerHeight - pad) top = Math.max(pad, ar.top - 6 - ph); // si no entra abajo, lo pongo arriba
  pop.style.left = left + 'px'; pop.style.top = top + 'px';
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePopover(); });

/* ---------- torneo: lista de categorías ---------- */
/* ---------- sugerencias de largado de mesas (si la setting está activa) ---------- */
// Prioridad por clase de categoría (menor = se larga antes).
const CLASS_LABELS = ['', 'Sub', 'Maxi', 'Primera', 'Segunda', 'Tercera', 'Cuarta', 'Mayores', 'Todo competidor', 'Dobles'];
function catClassPriority(cat) {
  if (cat.format === 'double') return 9;                 // dobles, último
  const n = (cat.name || '').toLowerCase(), rt = cat.rule && cat.rule.type;
  if (rt === 'maxAge' || n.startsWith('sub')) return 1;  // Sub
  if (n.startsWith('maxi') || rt === 'minAge') return 2;  // Maxi
  if (n === 'primera') return 3;
  if (n === 'segunda') return 4;
  if (n === 'tercera') return 5;
  if (n === 'cuarta') return 6;
  if (n === 'mayores') return 7;
  return 8;                                               // todo competidor / libre / otros
}
const startAtMs = cat => (cat.startAt ? (new Date(cat.startAt).getTime() || 9e15) : 9e15);
function freeTables(t) { const occ = occupiedTablesOf(t), out = []; for (let i = 1; i <= tableCountOf(t); i++) if (!occ.has(i)) out.push(i); return out; }
function zonePlayers(cat, gi) { const s = new Set(); (cat.groups[gi] || []).forEach(eid => { const e = entById(cat, eid); if (e) e.players.forEach(p => s.add(p)); }); return s; }
// Jugadores que TODAVÍA tienen partidos por jugar en esta zona (no terminados, no aplazados). Un jugador
// que ya terminó todos sus partidos de la zona queda libre para jugar otra categoría, aunque la zona siga.
function zonePendingPlayers(cat, gi) {
  const s = new Set();
  (cat.matches || []).filter(m => m.g === gi && !m.postponed && !matchDone(m, cat)).forEach(m => {
    [m.a, m.b].forEach(eid => { const e = entById(cat, eid); if (e) e.players.forEach(p => s.add(p)); });
  });
  return s;
}
const matchPlayers = (cat, a, b) => { const s = new Set(); [a, b].forEach(id => { const e = entById(cat, id); if (e) e.players.forEach(p => s.add(p)); }); return s; };
function brRoundName(cat, r) { const T = cat.bracket.length, fe = T - 1 - r; return fe === 0 ? 'Final' : fe === 1 ? 'Semifinal' : fe === 2 ? 'Cuartos' : fe === 3 ? 'Octavos' : 'Ronda ' + (r + 1); }
// Todas las "unidades" largables/en curso del torneo (zonas de grupo y partidos individuales de llave).
function tournamentUnits(t) {
  const units = [];
  t.categorias.forEach(cat => {
    cat._tid = t.id;
    const prio = catClassPriority(cat), startMs = startAtMs(cat);
    (cat.groups || []).forEach((g, gi) => {
      const ms = (cat.matches || []).filter(m => m.g === gi && !m.postponed);
      if (!ms.length) return;
      const pending = ms.filter(m => !matchDone(m, cat)).length;
      const tbl = cat.zoneTable && cat.zoneTable[gi] != null ? cat.zoneTable[gi] : null;
      units.push({ kind: 'zone', cat, gi, table: tbl, pending, players: zonePlayers(cat, gi), who: g.map(eid => entName(cat, eid)).join(', '), prio, startMs, label: 'Zona ' + String.fromCharCode(65 + gi), action: `assignZoneTable('${t.id}','${cat.id}',${gi},__T__)` });
    });
    if (cat.bracket) cat.bracket.forEach((round, r) => round.forEach((mm, mi) => {
      const a = brContender(cat, r, mi, 'a'), b = brContender(cat, r, mi, 'b');
      if (!(a && b && a !== 'BYE' && b !== 'BYE')) return;
      units.push({ kind: 'bracket', cat, table: mm.table != null ? mm.table : null, pending: matchDone(mm, cat) ? 0 : 1, players: matchPlayers(cat, a, b), who: `${entName(cat, a)} vs ${entName(cat, b)}`, prio, startMs, label: brRoundName(cat, r), action: `setMatchTable('${t.id}','${cat.id}','bracket',null,${r},${mi},'__T__')` });
    }));
    if (cat.thirdPlace) { const a = semiLoser(cat, 0), b = semiLoser(cat, 1); if (a && b && a !== 'BYE' && b !== 'BYE') units.push({ kind: 'bracket', cat, table: cat.thirdPlace.table != null ? cat.thirdPlace.table : null, pending: matchDone(cat.thirdPlace, cat) ? 0 : 1, players: matchPlayers(cat, a, b), who: `${entName(cat, a)} vs ${entName(cat, b)}`, prio, startMs, label: '3er puesto', action: `setMatchTable('${t.id}','${cat.id}','third',null,null,null,'__T__')` }); }
    (cat.matches || []).forEach((m, idx) => { if (!m.postponed || matchDone(m, cat)) return; units.push({ kind: 'bracket', cat, table: m.table != null ? m.table : null, pending: 1, players: matchPlayers(cat, m.a, m.b), who: `${entName(cat, m.a)} vs ${entName(cat, m.b)}`, prio, startMs, label: 'Grupo ' + String.fromCharCode(65 + m.g) + ' (aplazado)', action: `setMatchTable('${t.id}','${cat.id}','group',${idx},null,null,'__T__')` }); });
  });
  return units;
}
// Calcula el plan de largado: una unidad por mesa libre (sin repetir jugadores) + alternativas.
function suggestLaunch(t) {
  const free = freeTables(t);
  if (!free.length) return { free, plan: [], alts: [] };
  const units = tournamentUnits(t);
  const busy = new Set(); // jugadores ocupados en unidades en curso (con mesa y partidos pendientes)
  // Para una zona en curso, solo ocupa a quienes AÚN tienen partidos pendientes en ella (el que ya
  // terminó sus partidos queda libre para que se le sugiera otra categoría). Llaves/partidos: ambos.
  units.forEach(u => { if (u.table != null && u.pending > 0) (u.kind === 'zone' ? zonePendingPlayers(u.cat, u.gi) : u.players).forEach(p => busy.add(p)); });
  const now = Date.now();
  let cands = units.filter(u => u.table == null && u.pending > 0 && ![...u.players].some(p => busy.has(p)));
  cands.forEach(u => { u.notReady = (u.cat.startAt && new Date(u.cat.startAt).getTime() > now) ? 1 : 0; });
  // grupos antes que llaves (terminar zonas el mismo día); luego clase; luego horario
  cands.sort((a, b) => a.notReady - b.notReady || (a.kind === 'zone' ? 0 : 1) - (b.kind === 'zone' ? 0 : 1) || a.prio - b.prio || a.startMs - b.startMs);
  const plan = [], usedPlayers = new Set(), used = new Set();
  for (const tbl of free) {
    const pick = cands.find(u => !used.has(u) && ![...u.players].some(p => usedPlayers.has(p)));
    if (!pick) break;
    used.add(pick); pick.players.forEach(p => usedPlayers.add(p));
    plan.push({ table: tbl, unit: pick });
  }
  const alts = cands.filter(u => !used.has(u)).slice(0, 2);
  return { free, plan, alts };
}
function suggestPanelHtml(t) {
  if (!setting('tableSuggestion') || !canEditT(t) || t.finished || !tournStarted(t)) return ''; // recién con el torneo iniciado
  const { free, plan, alts } = suggestLaunch(t);
  if (!free.length) return '';
  if (!plan.length) return `<div class="card suggest-card"><h3 style="margin:0 0 4px">💡 Sugerencias de largado</h3>
    <p class="muted" style="margin:0">Hay ${free.length} mesa${free.length === 1 ? '' : 's'} libre${free.length === 1 ? '' : 's'}, pero no hay zonas o llaves listas para largar (o sus jugadores ya están jugando en otra mesa).</p></div>`;
  const row = (table, u) => `<div class="suggest-row">
      <div class="suggest-info"><b>Mesa ${table}</b> → ${esc(u.cat.name)} · ${esc(u.label)}
        <span class="muted">(${CLASS_LABELS[u.prio]}${u.cat.startAt ? ` · 🕒 ${fmtStartAt(u.cat.startAt)}` : ''})</span>
        ${u.who ? `<div class="suggest-who">👥 ${esc(u.who)}</div>` : ''}</div>
      <button class="btn btn-primary btn-sm" onclick="${u.action.replace('__T__', table)}">▶️ Largar en Mesa ${table}</button></div>`;
  let html = `<div class="card suggest-card"><h3 style="margin:0 0 4px">💡 Sugerencias de largado</h3>
    <p class="muted" style="margin:0 0 10px">${free.length} mesa${free.length === 1 ? '' : 's'} libre${free.length === 1 ? '' : 's'}. Sugerencias por prioridad (Sub, Maxi, niveles…), horario y sin superponer jugadores. Tocá para largar.</p>`;
  html += plan.map(p => row(p.table, p.unit)).join('');
  if (alts.length) html += `<div class="suggest-alts"><div class="muted" style="margin:12px 0 6px">Otras opciones para la Mesa ${free[0]}:</div>` + alts.map(u => row(free[0], u)).join('') + `</div>`;
  return html + `</div>`;
}

/* ---------- horario estimado de comienzo de cada partido (si la setting está activa) ---------- */
// Parámetros (se pueden afinar a medida que aprendemos): minutos por set, recambio entre partidos y buffer mostrado.
const EST_SET_MIN = 7, EST_TURNAROUND_MIN = 4, EST_BUFFER_MIN = 5;
// Sets esperados según "al mejor de N": llegar a N/2+1, más algo de los sets parejos extra.
function expectedSets(bestOf) { const need = Math.ceil(bestOf / 2); return need + (need - 1) * 0.5; }
const matchMinutes = (cat, m) => Math.round(expectedSets(bestOfOf(m, cat)) * EST_SET_MIN) + EST_TURNAROUND_MIN;
// Unidades para simular el cronograma (zonas y partidos), con sus partidos pendientes en orden.
function scheduleUnits(t) {
  const units = [];
  t.categorias.forEach(cat => {
    cat._tid = t.id;
    const prio = catClassPriority(cat), startMs = startAtMs(cat);
    (cat.groups || []).forEach((g, gi) => {
      const ms = (cat.matches || []).filter(m => m.g === gi && !m.postponed && !matchDone(m, cat));
      if (!ms.length) return;
      const tbl = cat.zoneTable && cat.zoneTable[gi] != null ? cat.zoneTable[gi] : null;
      units.push({ kind: 'zone', cat, table: tbl, matches: ms, players: zonePlayers(cat, gi), prio, startMs });
    });
    if (cat.bracket) cat.bracket.forEach((round, r) => round.forEach((mm, mi) => {
      if (matchDone(mm, cat)) return;
      const a = brContender(cat, r, mi, 'a'), b = brContender(cat, r, mi, 'b');
      if (!(a && b && a !== 'BYE' && b !== 'BYE')) return; // contendientes sin definir → no estimamos
      units.push({ kind: 'match', cat, table: mm.table != null ? mm.table : null, matches: [mm], players: matchPlayers(cat, a, b), prio, startMs });
    }));
    if (cat.thirdPlace && !matchDone(cat.thirdPlace, cat)) { const a = semiLoser(cat, 0), b = semiLoser(cat, 1); if (a && b && a !== 'BYE' && b !== 'BYE') units.push({ kind: 'match', cat, table: cat.thirdPlace.table != null ? cat.thirdPlace.table : null, matches: [cat.thirdPlace], players: matchPlayers(cat, a, b), prio, startMs }); }
    (cat.matches || []).forEach(m => { if (!m.postponed || matchDone(m, cat)) return; units.push({ kind: 'match', cat, table: m.table != null ? m.table : null, matches: [m], players: matchPlayers(cat, m.a, m.b), prio, startMs }); });
  });
  return units;
}
// Simula el cronograma y devuelve un Map(partido → hora estimada de comienzo en ms).
function estimateSchedule(t) {
  const map = new Map(), now = Date.now(), n = tableCountOf(t);
  const tableFree = {}; for (let i = 1; i <= n; i++) tableFree[i] = now;
  const playerFree = {};
  const playersReadyAt = set => { let mx = now; set.forEach(p => { if ((playerFree[p] || now) > mx) mx = playerFree[p] || now; }); return mx; };
  const busyUntil = (set, until) => set.forEach(p => { if (until > (playerFree[p] || 0)) playerFree[p] = until; });
  const dur = (cat, m) => matchMinutes(cat, m) * 60000;
  const earliest = cat => { const s = cat.startAt ? (new Date(cat.startAt).getTime() || 0) : 0; return Math.max(now, s); }; // respeta el horario (si pasó, es "ahora")
  const place = (u, table) => {
    let clock = Math.max(tableFree[table] || now, earliest(u.cat), playersReadyAt(u.players));
    u.matches.forEach(m => { map.set(m, clock); const end = clock + dur(u.cat, m); busyUntil(u.players, end); clock = end; });
    tableFree[table] = Math.max(tableFree[table] || now, clock);
  };
  const units = scheduleUnits(t);
  units.filter(u => u.table != null).forEach(u => place(u, u.table)); // zonas/partidos ya largados (ocupan su mesa)
  const waiting = units.filter(u => u.table == null)
    .sort((a, b) => (a.kind === 'zone' ? 0 : 1) - (b.kind === 'zone' ? 0 : 1) || a.prio - b.prio || a.startMs - b.startMs);
  waiting.forEach(u => { let bt = 1; for (let i = 2; i <= n; i++) if ((tableFree[i] || now) < (tableFree[bt] || now)) bt = i; place(u, bt); });
  return map;
}
let _est = null; // Map de horarios estimados, calculado al renderizar la categoría/torneo
function estStartLabel(m) {
  if (!_est || !setting('matchTimeEstimates')) return '';
  const ms = _est.get(m); if (ms == null) return '';
  const t = ms + EST_BUFFER_MIN * 60000;
  if (t <= Date.now() + 90000) return `<span class="est-time" title="Horario estimado (aprox.)">🕒 ~ahora</span>`;
  const d = new Date(Math.ceil(t / 300000) * 300000); // redondeo hacia arriba a 5 min (buffer extra)
  return `<span class="est-time" title="Horario estimado de comienzo (aprox.)">🕒 ~${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>`;
}

/* ====================== Vista de gimnasio (pixel art) ======================
   Vista a pantalla completa del gimnasio: tribuna, mesa de control, buffet, baño y las mesas de
   juego (con quién está jugando, en vivo). Configurable (mover/rotar) por admin (layout base del
   gimnasio, en Gimnasios) y por admin/colaborador (override del torneo). Gating en 3 niveles:
   superadmin habilita para la org (gymViewAllowed); el admin lo prende en su escuela (gymViewEnabled);
   y entonces sus torneos tienen el botón. Los jugadores la ven sin poder editar. */
const GYM_COLS = 12, GYM_ROWS = 8;
const GYM_DEF = { table: [2, 1], control: [2, 1.05], buffet: [2, 1.1], bathroom: [1, 1.2], stands: [3, 2], barrier: [4, 0.5], court: [5, 3.4] }; // tamaño por defecto (celdas)
const GYM_CAP = { control: 'Mesa de control', buffet: 'Buffet', bathroom: 'Baño', stands: 'Tribuna', barrier: 'Valla', court: 'Piso' };
const GYM_MAT = { wood: 'Madera', rubber: 'Goma', cement: 'Cemento' };
function gymTableSVG() { return `<svg viewBox="0 0 48 24" preserveAspectRatio="none"><ellipse cx="24" cy="23" rx="22" ry="1.5" fill="#000" fill-opacity=".22"/><rect x="6" y="18.5" width="2.6" height="5" rx="0.6" fill="#11212c"/><rect x="39.4" y="18.5" width="2.6" height="5" rx="0.6" fill="#11212c"/><rect x="8.5" y="2.5" width="1.8" height="3" fill="#0c1922"/><rect x="37.7" y="2.5" width="1.8" height="3" fill="#0c1922"/><rect x="3" y="2" width="42" height="18" rx="1.5" fill="#0b3350"/><rect x="4" y="3" width="40" height="16" fill="#2079bf"/><rect x="4" y="3" width="40" height="2.4" fill="#2f8fd6"/><rect x="4" y="3" width="40" height="16" fill="none" stroke="#f3f8fc" stroke-width="0.7"/><rect x="4" y="10.65" width="40" height="0.7" fill="#f3f8fc"/><rect x="22.4" y="2.2" width="3.2" height="0.9" fill="#fff"/><rect x="22.9" y="3" width="2.2" height="16" fill="#0e2a3d" fill-opacity=".5"/><rect x="23.2" y="3" width="0.3" height="16" fill="#cfe0ee" fill-opacity=".5"/><rect x="24" y="3" width="0.3" height="16" fill="#cfe0ee" fill-opacity=".5"/><rect x="24.7" y="3" width="0.3" height="16" fill="#cfe0ee" fill-opacity=".5"/><rect x="22.2" y="2.6" width="0.7" height="16.8" fill="#e8eef3"/><rect x="25.1" y="2.6" width="0.7" height="16.8" fill="#e8eef3"/><circle cx="33" cy="8" r="1.1" fill="#fff"/><g opacity="0.55"><circle cx="8.4" cy="16.3" r="1.5" fill="#cf3a3a"/><rect x="8.1" y="17.4" width="0.6" height="1.4" fill="#caa472"/><text x="11" y="17.5" font-size="2.3" fill="#dff0fb" font-family="Arial" font-weight="bold">ALMAR</text></g></svg>`; }
function gymBarrierSVG() { const b = ['JOOLA', 'BUTTERFLY', 'STIGA', 'DONIC', 'ANDRO']; let p = ''; const n = 5, pw = 60 / n; for (let i = 0; i < n; i++) { const x = i * pw; p += `<rect x="${x + 0.3}" y="2.4" width="${pw - 0.6}" height="7" fill="${i % 2 ? '#0a2643' : '#123a5c'}"/><text x="${x + pw / 2}" y="7.5" font-size="2.7" fill="#dfeaf5" font-family="Arial" font-weight="bold" text-anchor="middle">${b[i]}</text>`; } return `<svg viewBox="0 0 60 12" preserveAspectRatio="none"><rect width="60" height="12" fill="#071a30"/><rect y="1.2" width="60" height="1.3" fill="#2a5a8c"/><rect y="9.6" width="60" height="2.4" fill="#04101c"/>${p}</svg>`; }
function gymControlSVG() { return `<svg viewBox="0 0 40 20" preserveAspectRatio="none"><ellipse cx="20" cy="19" rx="18" ry="1.4" fill="#000" fill-opacity=".2"/><rect x="14" y="0.5" width="3" height="2.6" rx="1" fill="#d9b382"/><rect x="13.4" y="0.3" width="4.2" height="1.4" rx="0.6" fill="#3a2a1a"/><rect x="12.6" y="3" width="5.6" height="4" rx="1" fill="#c1121f"/><rect x="2" y="8" width="36" height="10" rx="1" fill="#6b4a2a"/><rect x="2" y="8" width="36" height="2" fill="#8a6238"/><rect x="22" y="3.5" width="11" height="6.5" rx="0.6" fill="#2b3440"/><rect x="23" y="4.3" width="9" height="4.6" fill="#36c5d6"/><rect x="22" y="10" width="13" height="1.4" fill="#1c2530"/><rect x="5" y="12" width="8" height="5" fill="#eef1f4"/><rect x="6" y="13" width="6" height="0.7" fill="#b9c2cb"/><rect x="6" y="14.4" width="6" height="0.7" fill="#b9c2cb"/></svg>`; }
function gymBuffetSVG() { return `<svg viewBox="0 0 40 20" preserveAspectRatio="none"><ellipse cx="20" cy="19" rx="18" ry="1.4" fill="#000" fill-opacity=".2"/><rect x="13" y="0.5" width="3" height="2.6" rx="1" fill="#e0a878"/><rect x="12.4" y="3" width="5.2" height="4" rx="1" fill="#fff"/><rect x="2" y="9" width="36" height="9" fill="#b5341f"/><rect x="2" y="9" width="36" height="2" fill="#d6442b"/><rect x="2" y="6.5" width="36" height="2.6" fill="#f3f3f3"/><rect x="5" y="2.6" width="8" height="4.2" rx="0.6" fill="#9aa6b0"/><rect x="6" y="3.4" width="6" height="2.6" fill="#cfd8df"/><rect x="9" y="6.8" width="3" height="0.8" fill="#6b4a2a"/><rect x="22" y="3.6" width="3" height="3.2" fill="#e8b04b"/><rect x="25.2" y="3.6" width="3" height="3.2" fill="#c1121f"/><rect x="28.4" y="3.6" width="3" height="3.2" fill="#16a34a"/><rect x="33" y="2.4" width="4.5" height="4.4" rx="0.4" fill="#fff"/><rect x="33.6" y="3" width="3.3" height="0.7" fill="#c1121f"/><rect x="33.6" y="4" width="3.3" height="0.6" fill="#888"/><rect x="33.6" y="5" width="3.3" height="0.6" fill="#888"/></svg>`; }
function gymBathroomSVG() { return `<svg viewBox="0 0 20 20" preserveAspectRatio="none"><rect x="3" y="1.5" width="14" height="17.5" rx="1" fill="#6a7480"/><rect x="4.5" y="3" width="11" height="14.5" rx="0.6" fill="#48525c"/><rect x="5.5" y="0.4" width="9" height="2.4" rx="0.6" fill="#2f6f3f"/><rect x="6.6" y="5" width="2.4" height="5" fill="#5ec0e8"/><rect x="11" y="5" width="2.4" height="5" fill="#ef9ac2"/><circle cx="7.8" cy="4.2" r="0.8" fill="#5ec0e8"/><circle cx="12.2" cy="4.2" r="0.8" fill="#ef9ac2"/><rect x="13" y="11" width="1.4" height="1.4" rx="0.7" fill="#ffd24a"/></svg>`; }
function gymStandsSVG() {
  const shirts = ['#ff7a1a', '#c1121f', '#1f6fb2', '#16a34a', '#e8b04b', '#7a3ea6', '#e84393', '#3ac0c9'], hairs = ['#3a2a1a', '#15110d', '#6b4423', '#d9b382', '#7a7a7a'], skin = ['#f1c9a5', '#e0a878', '#c98b56'];
  let s = '', idx = 0; const cols = 6, rows = 3;
  for (let r = 0; r < rows; r++) s += `<rect x="0" y="${3.5 + r * 6.6}" width="36" height="5.4" fill="#566069"/><rect x="0" y="${3.5 + r * 6.6}" width="36" height="1" fill="#454e57"/>`;
  for (let r = rows - 1; r >= 0; r--) for (let c = 0; c < cols; c++) { const x = 2.2 + c * 5.5, y = 1.6 + r * 6.6, sh = shirts[(idx * 5 + r) % shirts.length], ha = hairs[idx % hairs.length], sk = skin[(idx + r) % skin.length], d = ((idx * 0.41) % 2.4).toFixed(2);
    s += `<g class="gspec" style="animation-delay:${d}s"><rect x="${x - 0.3}" y="${y + 5.2}" width="4" height="1" fill="#000" fill-opacity=".15"/><rect x="${x}" y="${y + 2.9}" width="3.4" height="3.4" rx="0.7" fill="${sh}"/><rect x="${x - 0.2}" y="${y + 3.1}" width="0.9" height="2.4" rx="0.4" fill="${sh}"/><rect x="${x + 2.7}" y="${y + 3.1}" width="0.9" height="2.4" rx="0.4" fill="${sh}"/><rect x="${x + 0.6}" y="${y + 0.7}" width="2.2" height="2.4" rx="0.5" fill="${sk}"/><rect x="${x + 0.6}" y="${y + 0.5}" width="2.2" height="1" rx="0.4" fill="${ha}"/></g>`; idx++; }
  return `<svg viewBox="0 0 36 24" preserveAspectRatio="none"><rect width="36" height="24" fill="#3a434e"/><rect width="36" height="3.2" fill="#2c343c"/>${s}</svg>`;
}
const GYM_SPRITE = { table: gymTableSVG, control: gymControlSVG, buffet: gymBuffetSVG, bathroom: gymBathroomSVG, stands: gymStandsSVG, barrier: gymBarrierSVG };
function defaultGymLayout(n) {
  n = Math.max(1, Math.min(12, n || 4)); const tables = []; const per = Math.min(n, 4);
  for (let i = 0; i < n; i++) { const col = i % per, row = Math.floor(i / per); tables.push({ x: 3 + col * 2.3, y: 3 + row * 1.9, w: 2, h: 1, rot: 0 }); }
  const props = [
    { type: 'court', x: 2.2, y: 2.2, w: 7.6, h: 5, rot: 0, material: 'wood', color: '#b9854e' },
    { type: 'barrier', x: 2.2, y: 1.7, w: 7.6, h: 0.5, rot: 0 },
    { type: 'control', x: 4.6, y: 0.4, w: 2, h: 1.05, rot: 0 },
    { type: 'stands', x: 0.1, y: 2.4, w: 3, h: 2, rot: 0 },
    { type: 'buffet', x: 9.7, y: 0.4, w: 2, h: 1.1, rot: 0 },
    { type: 'bathroom', x: 10.8, y: 6.2, w: 1, h: 1.2, rot: 0 },
  ];
  return { tables, props };
}
// Resolución de un ajuste contra la org/escuela del TORNEO (no del que mira) → vale para jugadores de otra escuela.
function tournamentSetting(t, key) { if (!t) return defaultSetting(key); if (ORG_SETTING_KEYS.includes(key)) { const b = settingsBag('org', t.orgId); return b && key in b ? b[key] : defaultSetting(key); } const b = settingsBag('school', t.schoolId); return b && key in b ? b[key] : defaultSetting(key); }
function gymViewOn(t) { return !!t && !!tournamentSetting(t, 'gymViewAllowed') && !!tournamentSetting(t, 'gymViewEnabled'); }
// Ocupación por número de mesa (qué se está jugando ahí ahora).
function gymOccupancy(t) { const occ = {}; if (!t) return occ; tournamentUnits(t).forEach(u => { if (u.table == null || u.pending <= 0) return; occ[u.table] = { title: u.cat.name + ' · ' + (u.kind === 'zone' ? u.label : u.who) }; }); return occ; }
let _gymPrevOcc = new Set(), _gymEditMode = false, _gymDrag = null;
function gymBurstHtml() { const c = ['#ff7a1a', '#ffd24a', '#16a34a', '#1f6fb2', '#fff', '#c1121f']; let s = ''; for (let k = 0; k < 14; k++) { const a = k / 14 * 6.283; s += `<i style="--c:${c[k % c.length]};--dx:${Math.round(Math.cos(a) * 26)}px;--dy:${Math.round(Math.sin(a) * 26)}px"></i>`; } return `<div class="burst">${s}</div>`; }
// Layout que se MUESTRA (torneo: override del torneo o base del gimnasio; Gimnasios: base del gimnasio).
function gymRenderLayout(t, gym) { if (view.startsWith('gym:')) return (t && t.gymLayout) || (gym && gym.layout) || defaultGymLayout(t ? tableCountOf(t) : 4); return (gym && gym.layout) || defaultGymLayout(4); }
// Layout EDITABLE según la vista: Gimnasios → gym.layout (lo escribe el admin de la escuela del gym);
// torneo → t.gymLayout (override que también puede escribir un colaborador, porque puede escribir el torneo).
function gymTargetLayout(ensure) {
  if (view.startsWith('gymedit:')) { const g = gymById(view.slice(8)); if (!g || !canManageGym(g)) return null; if (ensure && !g.layout) g.layout = defaultGymLayout(4); return g.layout; }
  if (view.startsWith('gym:')) { const t = tById(view.slice(4)); if (!t || !canEditT(t)) return null; if (ensure && !t.gymLayout) { const base = gymById(t.gymId); t.gymLayout = JSON.parse(JSON.stringify((base && base.layout) || defaultGymLayout(tableCountOf(t)))); } return t.gymLayout; }
  return null;
}
// Normaliza un item con sus defaults (x,y,w,h,rot) según el tipo.
function gymItem(item, type) { const d = GYM_DEF[type] || [2, 1]; return { x: item.x || 0, y: item.y || 0, w: item.w || d[0], h: item.h || d[1], rot: item.rot || 0 }; }
// Mesa i: usa la posición guardada o, si el torneo tiene más mesas que el layout, una posición por defecto.
function gymTableSlot(layout, i, n) { const tb = (layout.tables || [])[i]; if (tb) return gymItem(tb, 'table'); const per = Math.min(n, 4), col = i % per, row = Math.floor(i / per); return { x: 3 + col * 2.3, y: 3 + row * 1.9, w: 2, h: 1, rot: 0 }; }
// Caja en el escenario: con rot 90/270 se intercambian ancho/alto (footprint), así rotar NO distorsiona ni achica.
function gymBoxWH(it) { return it.rot % 180 === 90 ? [it.h, it.w] : [it.w, it.h]; }
function gymPosStyle(it) { const [bw, bh] = gymBoxWH(it); return `left:${(it.x / GYM_COLS * 100).toFixed(2)}%;top:${(it.y / GYM_ROWS * 100).toFixed(2)}%;width:${(bw / GYM_COLS * 100).toFixed(2)}%;height:${(bh / GYM_ROWS * 100).toFixed(2)}%`; }
function gymTrotHtml(it, svg) { const [bw, bh] = gymBoxWH(it); return `<div class="g-trot" style="width:${(it.w / bw * 100).toFixed(1)}%;height:${(it.h / bh * 100).toFixed(1)}%;transform:translate(-50%,-50%) rotate(${it.rot}deg)">${svg}</div>`; }
function gymHandles(kind, i, allowDel) { return `<button class="g-rot" onclick="gymRotate('${kind}',${i})" title="Rotar 90°">↻</button>${allowDel ? `<button class="g-del" onclick="gymDel('${kind}',${i})" title="Quitar">✕</button>` : ''}<span class="g-rs" data-rs title="Redimensionar"></span>`; }
function gymStageHtml(layout, t, editable) {
  const isTour = !!t, occ = gymOccupancy(t), cur = new Set(Object.keys(occ).map(Number));
  const freed = [..._gymPrevOcc].filter(n => !cur.has(n)); _gymPrevOcc = cur;
  let floors = '', els = '';
  (layout.props || []).forEach((p, i) => {
    if (p.type === 'court') { const it = gymItem(p, 'court'), mat = p.material || 'wood', col = p.color || '#b9854e';
      floors += `<div class="gym-el g-floor mat-${mat}" ${editable ? `data-kind="prop" data-idx="${i}"` : ''} style="${gymPosStyle(it)};--fc:${col}">${editable ? `<div class="g-floorctl"><select onchange="gymFloorMat(${i},this.value)">${Object.keys(GYM_MAT).map(m => `<option value="${m}" ${m === mat ? 'selected' : ''}>${GYM_MAT[m]}</option>`).join('')}</select><input type="color" value="${col}" oninput="gymFloorColor(${i},this.value)"></div>${gymHandles('prop', i, true)}` : ''}</div>`; return; }
    const it = gymItem(p, p.type), sprite = (GYM_SPRITE[p.type] || (() => ''))();
    els += `<div class="gym-el g-prop g-${p.type}" ${editable ? `data-kind="prop" data-idx="${i}"` : ''} style="${gymPosStyle(it)}"><div class="g-cap">${GYM_CAP[p.type] || ''}</div>${gymTrotHtml(it, sprite)}${p.type === 'buffet' ? '<div class="smoke"><span></span><span></span><span></span></div>' : ''}${(!editable && p.type === 'stands') ? '<div class="cheer c1">¡Vamos! 🏓</div><div class="cheer c2">¡Dale campeón!</div><div class="cheer c3">Apurá 😤</div>' : ''}${editable ? gymHandles('prop', i, true) : ''}</div>`;
  });
  const nTables = isTour ? tableCountOf(t) : (layout.tables || []).length;
  for (let i = 0; i < nTables; i++) { const it = gymTableSlot(layout, i, nTables), num = i + 1, o = occ[num];
    els += `<div class="gym-el g-table ${o ? 'busy' : 'free'}" ${editable ? `data-kind="table" data-idx="${i}"` : ''} style="${gymPosStyle(it)}">${gymTrotHtml(it, gymTableSVG())}<div class="tnum">${num}</div>${o ? `<div class="g-occ"><span class="g-live-dot"></span>${esc(o.title)}</div>` : (editable ? '' : `<div class="g-occ dim">libre</div>`)}${editable ? gymHandles('table', i, !isTour) : ''}${(!editable && freed.includes(num)) ? gymBurstHtml() : ''}</div>`; }
  return `<div class="gym-stage ${editable ? 'editing' : ''} ${(!editable && freed.length) ? 'celebrate' : ''}" id="gymStage">${floors}${els}</div>`;
}
function gymEditToolbarHtml(isTour) { const l = gymTargetLayout(false) || {}; const present = new Set((l.props || []).map(p => p.type)); const singles = ['control', 'buffet', 'bathroom', 'stands'].filter(tp => !present.has(tp)).map(tp => `<button class="btn btn-ghost btn-sm" onclick="gymAddProp('${tp}')">➕ ${GYM_CAP[tp]}</button>`).join(''); return `<div class="gym-toolbar">${!isTour ? `<button class="btn btn-accent btn-sm" onclick="gymAddTable()">➕ Mesa</button>` : ''}<button class="btn btn-ghost btn-sm" onclick="gymAddProp('court')">➕ Piso</button><button class="btn btn-ghost btn-sm" onclick="gymAddProp('barrier')">➕ Valla</button>${singles}</div>`; }
function renderGymView(app, ref) {
  const isTour = ref.startsWith('gym:'); let t = null, gym = null, back = 'torneos';
  if (isTour) { t = tById(ref.slice(4)); if (!t) { app.innerHTML = `<div class="empty" style="margin:16px">Torneo no encontrado.</div>`; return; } back = 'torneo:' + t.id; if (!gymViewOn(t)) { app.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="go('${back}')">← Volver</button><div class="empty" style="margin:16px">La vista del gimnasio no está habilitada para este torneo.</div>`; return; } gym = gymById(t.gymId); }
  else { if (!isAdmin()) { go('ranking'); return; } gym = gymById(ref.slice(8)); back = 'gimnasios'; }
  if (!gym) { app.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="go('${back}')">← Volver</button><div class="empty" style="margin:16px">${isTour ? 'Este torneo no tiene un gimnasio asignado (asignale uno desde ✏️ Datos).' : 'Gimnasio no encontrado.'}</div>`; return; }
  const canEdit = isTour ? canEditT(t) : canManageGym(gym), editing = canEdit && _gymEditMode;
  const layout = gymRenderLayout(t, gym);
  app.innerHTML = `<div class="gym-overlay">
      <div class="gym-bar"><button class="btn btn-ghost btn-sm" onclick="go('${back}')">← Volver</button>
        <div class="gym-title">🏟️ ${esc(gym.name)}${isTour ? ' · ' + esc(t.name) : ''}</div>
        ${canEdit ? `<button class="btn ${editing ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="gymEditToggle()">${editing ? '✓ Listo' : '✏️ Editar'}</button>` : '<span style="width:60px"></span>'}</div>
      ${editing ? `<div class="gym-edithint">✏️ Arrastrá para mover · esquina ⤡ para redimensionar · ↻ rotar · ✕ quitar${isTour ? ' · la cantidad de mesas la fija el torneo' : ''}.</div>${gymEditToolbarHtml(isTour)}` : ''}
      ${gymStageHtml(layout, t, editing)}
      <div class="gym-foot muted">${isTour ? (editing ? 'Estás editando la vista de ESTE torneo (no cambia el resto).' : '🔴 Quién está jugando en cada mesa, en tiempo real.') : 'Vista base del gimnasio: la heredan los torneos que se jueguen acá.'}</div>
    </div>`;
  if (editing) wireGymEditor();
}
function gymEditToggle() { _gymEditMode = !_gymEditMode; render(); }
// Asegura que la mesa i exista en el layout (al editar una mesa autoposicionada de un torneo con más
// mesas que el layout base, la materializamos para poder guardarle posición/tamaño/rotación).
function gymEnsureTable(l, i, n) { l.tables = l.tables || []; while (l.tables.length <= i) { const s = gymTableSlot(l, l.tables.length, Math.max(n, l.tables.length + 1)); l.tables.push({ x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot }); } }
function gymArr(l, kind) { return kind === 'table' ? (l.tables = l.tables || []) : (l.props = l.props || []); }
function gymRotate(kind, i) { const l = gymTargetLayout(true); if (!l) return; if (kind === 'table') gymEnsureTable(l, i, i + 1); const it = gymArr(l, kind)[i]; if (it) { it.rot = ((it.rot || 0) + 90) % 360; save(DB); render(); } }
function gymDel(kind, i) { const l = gymTargetLayout(true); if (!l) return; const arr = gymArr(l, kind); if (arr[i]) { arr.splice(i, 1); save(DB); render(); } }
function gymAddTable() { const l = gymTargetLayout(true); if (!l) return; (l.tables = l.tables || []).push({ x: 5, y: 3.5, w: 2, h: 1, rot: 0 }); save(DB); render(); }
function gymAddProp(tp) { const l = gymTargetLayout(true); if (!l) return; const d = GYM_DEF[tp] || [2, 1]; (l.props = l.props || []).push(tp === 'court' ? { type: tp, x: 2, y: 2, w: 6, h: 3.4, rot: 0, material: 'wood', color: '#b9854e' } : { type: tp, x: 4.5, y: 0.6, w: d[0], h: d[1], rot: 0 }); save(DB); render(); }
function gymFloorMat(i, m) { const l = gymTargetLayout(true); if (!l || !l.props || !l.props[i]) return; l.props[i].material = m; save(DB); render(); }
function gymFloorColor(i, c) { const l = gymTargetLayout(true); if (!l || !l.props || !l.props[i]) return; l.props[i].color = c; save(DB); render(); }
function openGymView(tid) { _gymEditMode = false; _gymPrevOcc = new Set(); go('gym:' + tid); }
function openGymEdit(gid) { const g = gymById(gid); if (!g || !canManageGym(g)) return; if (!g.layout) { g.layout = defaultGymLayout(4); save(DB); } _gymEditMode = true; _gymPrevOcc = new Set(); go('gymedit:' + gid); }
function wireGymEditor() {
  const stage = document.getElementById('gymStage'); if (!stage) return;
  stage.querySelectorAll('.gym-el[data-kind]').forEach(el => {
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('button') || e.target.closest('select') || e.target.closest('input')) return;
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      const elx = parseFloat(el.style.left) / 100 * GYM_COLS, ely = parseFloat(el.style.top) / 100 * GYM_ROWS;
      const cx = (e.clientX - rect.left) / rect.width * GYM_COLS, cy = (e.clientY - rect.top) / rect.height * GYM_ROWS;
      _gymDrag = { el, kind: el.dataset.kind, idx: +el.dataset.idx, resize: !!e.target.closest('[data-rs]'), moved: false, downX: e.clientX, downY: e.clientY, rect, offX: cx - elx, offY: cy - ely };
      try { el.setPointerCapture(e.pointerId); } catch (_) {} el.classList.add('dragging');
    });
    el.addEventListener('pointermove', e => {
      const d = _gymDrag; if (!d || d.el !== el) return;
      if (Math.abs(e.clientX - d.downX) + Math.abs(e.clientY - d.downY) > 5) d.moved = true;
      const cx = (e.clientX - d.rect.left) / d.rect.width * GYM_COLS, cy = (e.clientY - d.rect.top) / d.rect.height * GYM_ROWS;
      if (d.resize) { const elx = parseFloat(el.style.left) / 100 * GYM_COLS, ely = parseFloat(el.style.top) / 100 * GYM_ROWS; d.bw = Math.max(0.5, Math.min(GYM_COLS, cx - elx)); d.bh = Math.max(0.5, Math.min(GYM_ROWS, cy - ely)); el.style.width = (d.bw / GYM_COLS * 100) + '%'; el.style.height = (d.bh / GYM_ROWS * 100) + '%'; }
      else { d.x = Math.max(0, Math.min(GYM_COLS - 0.5, cx - d.offX)); d.y = Math.max(0, Math.min(GYM_ROWS - 0.5, cy - d.offY)); el.style.left = (d.x / GYM_COLS * 100) + '%'; el.style.top = (d.y / GYM_ROWS * 100) + '%'; }
    });
    const end = () => {
      const d = _gymDrag; if (!d || d.el !== el) return; _gymDrag = null; el.classList.remove('dragging');
      const l = gymTargetLayout(true); if (!l) return;
      if (d.kind === 'table') gymEnsureTable(l, d.idx, d.idx + 1);
      const it = gymArr(l, d.kind)[d.idx]; if (!it) return;
      if (d.resize && d.moved) { const sw = (it.rot || 0) % 180 === 90, bw = Math.round(d.bw * 4) / 4, bh = Math.round(d.bh * 4) / 4; if (sw) { it.w = bh; it.h = bw; } else { it.w = bw; it.h = bh; } save(DB); render(); }
      else if (d.moved) { it.x = Math.round(d.x * 4) / 4; it.y = Math.round(d.y * 4) / 4; save(DB); render(); }
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  });
}
function renderTournament(app, tid) {
  const t = tById(tid); if (!t) { app.innerHTML = '<div class="empty">No encontrado.</div>'; return; }
  if (!t.published && !canEditT(t)) { app.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="go('torneos')">← Volver</button><div class="empty" style="margin-top:16px">Este torneo todavía no está disponible.</div>`; return; }
  const cards = t.categorias.map(c => {
    c._tid = t.id;
    const champ = c.bracket ? brWinner(c, c.bracket.length - 1, 0) : null;
    const st = c.closed ? '✅ Finalizada' : c.bracket ? '🏆 En llave' : c.groups ? '🎲 Grupos' : enrollmentStatus(c).label;
    const stCls = c.closed ? 'done' : (c.bracket || c.groups) ? 'live' : (enrollmentStatus(c).open ? 'open' : 'closed');
    const meta = [ruleLabel(c.rule), catSetsFmt(c).label, `🥇 ${c.championPoints}`,
      `${c.entrants.length} ${c.format === 'double' ? 'parejas' : 'jug.'}`,
      c.gender && c.gender !== 'any' ? GENDER_RULE_LABEL[c.gender] : null,
      catCost(c) > 0 ? `💲 ${money(catCost(c))}` : null,
      c.startAt ? `🕒 ${fmtStartAt(c.startAt)}` : null].filter(Boolean).join(' · ');
    const pay = (() => { const m = myPaymentStatus(c); return m ? `<div class="pay-line ${m.paid ? 'ok' : 'no'}">${m.paid ? '✅ Inscripción pagada' : `💲 Te falta pagar ${money(m.cost)}`}</div>` : ''; })();
    // Resumen visible SIN expandir: inscriptos y (si la categoría tiene costo) cuántos pagaron / faltan.
    const nEnr = c.entrants.length, nPaid = c.entrants.filter(e => e.paid).length;
    const counts = catCost(c) > 0
      ? `<span class="cc-chip">👥 ${nEnr}</span><span class="cc-chip ok">✅ ${nPaid} pagaron</span><span class="cc-chip no">💲 ${nEnr - nPaid} faltan</span>`
      : `<span class="cc-chip">👥 ${nEnr} ${c.format === 'double' ? 'parejas' : 'inscriptos'}</span>`;
    return `<details class="cat-card">
      <summary class="cat-card-head">
        <span class="cat-ico">${c.format === 'double' ? '👥' : '👤'}</span>
        <div class="cat-card-info">
          <div class="cat-card-name">${esc(c.name)} <span class="t-badge ${stCls}">${st}</span></div>
          <div class="cat-card-counts">${counts}</div>
        </div>
        <span class="cat-caret">▸</span>
      </summary>
      <div class="cat-card-body">
        <div class="cat-card-meta">${esc(meta)}</div>
        ${champ && champ !== 'BYE' ? `<div class="champ">🏆 ${entLink(c, champ)}</div>` : ''}
        ${pay}
        <div class="cat-card-actions">
          <button class="btn btn-accent btn-sm" onclick="go('cat:${t.id}:${c.id}')">👁️ Ver</button>
          ${canEditT(t) && !c.groups ? `<button class="btn btn-ghost btn-sm" onclick="categoriaForm('${t.id}','${c.id}')">✏️ Reglas</button>` : ''}
          ${canEditT(t) ? `<button class="btn btn-ghost btn-sm icon-btn" title="Eliminar" onclick="delCategoria('${t.id}','${c.id}')">🗑️</button>` : ''}
        </div>
      </div>
    </details>`;
  }).join('');
  const gym = gymById(t.gymId);
  const live = liveMatchesOf(t);
  const liveHtml = `<div class="section-head"><h2>🔴 Partidos en vivo</h2>${live.length ? `<span class="t-badge live">${live.length} en juego</span>` : ''}</div>`
    + (live.length
      ? `<div class="live-list">` + live.map(L => {
          const isZone = L.kind === 'zone';
          return `<div class="live-row${isZone ? ' zone' : ''}"${isZone ? ' onclick="toggleLiveZone(this)"' : ''}>
          <span class="live-mesa">🏓 Mesa ${L.table}</span>
          <span class="live-players">${esc(L.label)}${isZone ? ' <span class="live-caret">▸</span>' : ''}</span>
          <span class="live-cat">${esc(L.catName)} · ${esc(L.sub)}</span>
          ${isZone ? `<div class="live-pending">${L.pending.map(p => `<div class="live-pending-row">🏓 ${esc(p)}</div>`).join('')}</div>` : ''}</div>`;
        }).join('') + `</div>`
      : `<p class="muted slim-empty">Sin partidos en juego. Asigná una mesa a un partido para verlo acá.</p>`);
  const tEnrollOpen = tournamentEnrollOpen(t);
  const collabNames = (t.collaborators || []).map(id => { const p = playerById(id); return p ? fullName(p) : null; }).filter(Boolean);
  const collabBanner = (!isAdmin() && isCollaboratorOf(t)) ? `<div class="banner ok" style="margin:8px 0 0">🤝 Sos colaborador: podés gestionar todo el torneo (inscribir, resultados, mesas, categorías, abrir/cerrar y finalizar). Otorgar puntos al ranking lo hace el admin.</div>` : '';
  const draftBanner = !t.published ? `<div class="banner" style="margin:8px 0 0;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span>📝 <b>Borrador</b> — solo vos lo ves. Configurá las reglas y, cuando esté listo, publicalo.</span>
      ${canEditT(t) ? `<button class="btn btn-primary btn-sm" onclick="publishTournament('${t.id}')">🚀 Publicar torneo</button>` : ''}</div>` : '';
  const finishedBanner = t.finished ? `<div class="banner" style="margin:8px 0 0;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span>🏁 <b>Torneo finalizado.</b> Los jugadores lo ven en modo lectura.</span>
      ${canEditT(t) ? `<button class="btn btn-ghost btn-sm" onclick="reopenTournament('${t.id}')">♻️ Reabrir torneo</button>` : ''}</div>` : '';
  // Antes de iniciar: se inscribe y se arman los grupos; recién al iniciar se largan zonas y se cargan resultados.
  const startBanner = (!t.started && !t.finished && t.published && canEditT(t)) ? `<div class="banner" style="margin:8px 0 0;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span>🟡 <b>Torneo no iniciado.</b> Inscribí jugadores y armá los grupos; al iniciarlo vas a poder largar zonas, cargar resultados y ver las sugerencias de mesas.</span>
      <button class="btn btn-primary btn-sm" onclick="startTournament('${t.id}')">▶️ Iniciar torneo</button></div>` : '';
  const adminTools = canEditT(t) ? `<details class="admin-tools" ${_openDetails.has('at:' + t.id) ? 'open' : ''} ontoggle="detToggle('at:${t.id}',this)">
      <summary>⋯ Acciones</summary>
      <div class="admin-toolbar">
        <button class="btn btn-ghost btn-sm" onclick="editTournamentModal('${t.id}')">✏️ Datos</button>
        <button class="btn btn-ghost btn-sm" onclick="editTablesModal('${t.id}')">🏓 Mesas</button>
        ${!t.finished ? `<button class="btn btn-ghost btn-sm" onclick="toggleTournamentEnroll('${t.id}')">${tEnrollOpen ? '🔒 Cerrar inscripción' : '🔓 Abrir inscripción'}</button>` : ''}
        ${(ownsTournament(t) || isSuperadmin()) ? `<button class="btn btn-ghost btn-sm" onclick="collaboratorsModal('${t.id}')">🤝 Colaboradores</button>` : ''}
        ${!t.finished ? `<button class="btn btn-ghost btn-sm danger" onclick="finalizeTournament('${t.id}')">🏁 Finalizar</button>` : ''}
      </div>
    </details>` : '';
  app.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="go('torneos')">← Volver</button>
    <div class="page-title" style="margin-top:12px"><h1>${esc(t.name)}</h1></div>
    ${draftBanner}${startBanner}${finishedBanner}
    <div class="tags info-tags" style="margin-top:8px">
      <span class="tag">📅 ${dateRangeLabel(t)}</span>${gym ? `<span class="tag">🏟️ ${esc(gym.name)}</span>` : ''}
      <span class="tag">🏓 ${tableCountOf(t)} mesa${tableCountOf(t) === 1 ? '' : 's'}</span>
      <span class="t-badge ${t.open ? 'open' : 'closed'}">${t.open ? '🌐 Abierto' : '🔒 Cerrado'} · ${esc(schoolName(t.orgId, t.schoolId))}</span>
      <span class="t-badge ${tEnrollOpen ? 'open' : 'closed'}">${tEnrollOpen ? '🟢 Inscripción abierta' : '🔴 Inscripción cerrada'}</span>
      ${!t.finished ? `<span class="t-badge ${t.started ? 'live' : 'draft'}">${t.started ? '🟢 En curso' : '🟡 No iniciado'}</span>` : ''}
    </div>
    ${gym && gym.address ? `<p class="page-sub" style="margin:8px 0 0">📍 ${esc(gym.address)} <a class="maplink" href="${mapsDirUrl(gym.address)}" target="_blank" rel="noopener">🧭 Cómo llegar</a></p>` : ''}
    ${(gymViewOn(t) && gym) ? `<button class="btn btn-accent" style="margin-top:10px" onclick="openGymView('${t.id}')">🏟️ Vista del gimnasio</button>` : ''}
    ${adminTools}
    ${collabBanner}
    ${(collabNames.length || isAdmin()) ? `<p class="page-sub" style="margin:10px 0 0">🤝 Colaboradores: ${collabNames.length ? collabNames.map(esc).join(', ') : '<span class="muted">ninguno</span>'}</p>` : ''}
    ${suggestPanelHtml(t)}
    ${tournStarted(t) ? liveHtml : ''}
    <div class="section-head"><h2>Categorías (sub-torneos)</h2>${canEditT(t) ? `<button class="btn btn-primary" onclick="categoriaForm('${t.id}')">➕ Crear categoría</button>` : ''}</div>
    <div class="cat-list">${cards || '<div class="empty">Sin categorías. Creá una.</div>'}</div>`;
}
function categoriaForm(tid, cid) {
  const cat = cid ? getCat(tid, cid) : null; // editar reglas de una categoría existente
  const sel = (v, opt) => v === opt ? 'selected' : '';
  const names = catCatalog().map(c => `<option value="${esc(c.name)}" ${cat && cat.name === c.name ? 'selected' : ''}>${esc(c.name)} — ${ruleLabel(c.rule)}</option>`).join('');
  const r = cat ? cat.rules : { sets: 5, groupMin: 3, groupMax: 4 };
  const curFmt = cat ? catSetsFmt(cat).id : 'all5';
  const setsOpts = SETS_FORMATS.map(f => `<option value="${f.id}" ${sel(curFmt, f.id)}>${f.label}</option>`).join('');
  const cc0 = catEntryByName(catCatalog()[0] && catCatalog()[0].name) || {};
  const defCost = cat ? (cat.cost != null ? cat.cost : 0) : (cc0.cost || 0);
  const curFmtD = cat ? cat.format : (cc0.format || 'single');
  const curGender = cat ? (cat.gender || 'any') : (cc0.gender || 'any');
  openModal(`<h3>${cat ? 'Editar' : 'Crear'} categoría (sub-torneo)</h3>
    <label>Categoría</label><select id="c_name" onchange="catCostSuggest()">${names}</select>
    <div class="grid2">
      <div><label>Formato</label><select id="c_fmt" onchange="catFmtChange('c')"><option value="single" ${sel(curFmtD, 'single')}>Singles 👤</option><option value="double" ${sel(curFmtD, 'double')}>Dobles 👥</option></select></div>
      <div class="c-gender"><label>Género</label><select id="c_gender">
        <option value="any" ${sel(curGender, 'any')}>Indistinto</option>
        <option value="female" ${sel(curGender, 'female')}>Femenino</option>
        <option value="male" ${sel(curGender, 'male')}>Masculino</option>
        <option value="mixed" ${sel(curGender, 'mixed')} ${curFmtD === 'double' ? '' : 'hidden'}>Mixto (solo dobles)</option></select></div>
      <div><label>Sets por fase</label><select id="c_setsfmt">${setsOpts}</select></div>
      <div><label>Mín por grupo</label><input id="c_min" type="number" min="2" value="${r.groupMin}"/></div>
      <div><label>Máx por grupo</label><input id="c_max" type="number" min="2" value="${r.groupMax}"/></div>
      <div><label>Puntos al campeón 🏆 (máx 20)</label><input id="c_pts" type="number" min="0" max="20" value="${cat ? cat.championPoints : 20}"/></div>
      <div><label>Costo de inscripción 💲</label><input id="c_cost" type="number" min="0" step="100" value="${defCost}"/></div>
    </div>
    <p class="hint">Solo cobran el <b>podio</b>: 🥇 valor · 🥈 ½ · 🥉 ⅓ · 4º ¼. Además cada partido suma/resta puntos por nivel (Elo). <b>Solo puntúan singles de Primera/Segunda/Tercera/Cuarta</b> — dobles y categorías por edad no mueven el ranking.${cat && cat.entrants.length ? ' <br>⚠️ Si cambiás el formato (singles/dobles) se borran los inscriptos actuales.' : ''}</p>
    <div id="cerr" class="banner" hidden></div>
    <div class="row spread" style="margin-top:16px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveCategoria('${tid}','${cid || ''}')">${cat ? 'Guardar' : 'Crear'}</button></div>`);
}
// Al cambiar la categoría en el form, hereda costo/formato/género por defecto del catálogo.
function catCostSuggest() {
  const cc = catEntryByName($('#c_name').value); if (!cc) return;
  if ($('#c_cost')) $('#c_cost').value = cc.cost || 0;
  if ($('#c_fmt')) $('#c_fmt').value = cc.format || 'single';
  if ($('#c_gender')) $('#c_gender').value = cc.gender || 'any';
  catFmtChange('c');
}
function saveCategoria(tid, cid) {
  const t = tById(tid), name = $('#c_name').value;
  const min = Math.max(2, parseInt($('#c_min').value, 10) || 3); // mín 2 por grupo: un grupo de 1 no tiene 2°
  const max = Math.max(min, parseInt($('#c_max').value, 10) || min);
  const e = $('#cerr');
  const format = $('#c_fmt').value, setsFormat = $('#c_setsfmt').value;
  let gender = $('#c_gender') ? $('#c_gender').value : 'any'; if (format !== 'double' && gender === 'mixed') gender = 'any';
  const rules = { sets: setsFmtById(setsFormat).bracket, groupMin: min, groupMax: max }, championPoints = Math.min(20, Math.max(0, parseInt($('#c_pts').value, 10) || 0));
  const cost = Math.max(0, parseInt($('#c_cost').value, 10) || 0);
  if (cid) {
    const cat = getCat(tid, cid); if (!cat) return;
    if (cat.groups) { e.hidden = false; e.textContent = 'No se pueden editar las reglas: los partidos ya empezaron.'; return; }
    if (cat.format !== format) cat.entrants = []; // cambia singles/dobles → se limpian inscriptos
    cat.name = name; cat.format = format; cat.gender = gender; cat.rule = catalogRule(name); cat.rules = rules; cat.setsFormat = setsFormat; cat.championPoints = championPoints; cat.cost = cost;
  } else {
    t.categorias.push({ id: uid('c_'), name, format, gender, rule: catalogRule(name), setsFormat, rules, championPoints, cost, entrants: [], groups: null, matches: null, bracket: null, thirdPlace: null, closed: false, enrollOverride: null });
  }
  save(DB); closeModal(); render();
}
function delCategoria(tid, cid) { const t = tById(tid); if (confirm('¿Eliminar categoría?')) { t.categorias = t.categorias.filter(c => c.id !== cid); save(DB); render(); } }
// Marca/desmarca el pago de un entrante (solo admin/colaborador).
function togglePaid(tid, cid, entId) {
  const cat = getCat(tid, cid); if (!cat) return; cat._tid = tid;
  if (!canEditCat(cat)) return;
  const e = entById(cat, entId); if (!e) return;
  // Des-marcar un pago es la acción riesgosa (toque accidental en mesa de control) → pedimos confirmación.
  // Marcar como pagado queda en un solo toque. (Online no llega acá: muestra cartel fijo.)
  if (e.paid && !confirm(`¿Marcar como NO pagado a ${entName(cat, entId)}?`)) return;
  e.paid = !e.paid; save(DB); render();
}

/* ----- horario de comienzo de la categoría (lo setean admin/colaboradores) ----- */
function fmtStartAt(s) {
  if (!s) return '';
  const [d, t] = String(s).split('T');
  const p = (d || '').split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}${t ? ' ' + t : ''}` : String(s);
}
function categoryTimeModal(tid, cid) {
  const cat = getCat(tid, cid); if (!cat) return;
  const t = tById(tid);
  const def = cat.startAt || ((t && t.date ? t.date : '') + 'T10:00');
  openModal(`<h3>Hora de comienzo — ${esc(cat.name)}</h3>
    <p class="hint" style="margin-top:0">Cuándo arranca esta categoría. La ven todos; la editan admin y colaboradores.</p>
    <label>Fecha y hora</label><input id="ct_start" type="datetime-local" value="${esc(def)}"/>
    <div class="row spread" style="margin-top:16px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <div class="row" style="gap:8px">${cat.startAt ? `<button class="btn btn-ghost" onclick="saveCategoryTime('${tid}','${cid}',true)">Quitar</button>` : ''}
        <button class="btn btn-primary" onclick="saveCategoryTime('${tid}','${cid}')">Guardar</button></div></div>`);
}
function saveCategoryTime(tid, cid, clear) {
  const cat = getCat(tid, cid); if (!cat || !canEditCat(Object.assign(cat, { _tid: tid }))) return;
  cat.startAt = clear ? null : ($('#ct_start').value || null);
  save(DB); closeModal(); render();
}

/* ---------- categoría: inscripción, grupos, resultados, llave ---------- */
// Lista de inscriptos de la categoría (visible para admin y jugadores).
function entrantsListHtml(cat) {
  if (!cat.entrants.length) return `<div class="empty">Todavía no hay ${cat.format === 'double' ? 'parejas' : 'jugadores'} inscriptos.</div>`;
  const u = currentUser(), myId = u && u.playerId;
  const cost = catCost(cat), canPay = canEditCat(cat);
  const t = tById(cat._tid), online = onlinePayReady(t, cat); // ¿el jugador puede pagar online desde acá?
  const byName = (a, b) => entName(cat, a.id).localeCompare(entName(cat, b.id));
  const row = (e, n) => {
    const mine = myId && e.players.includes(myId);
    const p = playerById(e.players[0]);
    const sub = cat.format === 'double'
      ? e.players.map(pid => { const pp = playerById(pid); return pp ? `${esc(fullName(pp))} (${pp.category})` : '?'; }).join(' + ')
      : (p ? `${p.category} · 📍 ${esc(p.city)}${ageFromDob(p.dob) != null ? ` · ${ageFromDob(p.dob)} años` : ''}` : '');
    let pay = '';
    if (cost > 0) {
      if (canPay && e.paid && paidOnline(cat, e.id)) pay = `<span class="pay-tag ok" title="Pago online confirmado por MercadoPago. No se puede des-marcar a mano.">✅ Pagó (online)</span>`;
      else if (canPay) pay = `<button class="btn btn-ghost btn-sm pay-btn ${e.paid ? 'paid' : ''}" onclick="togglePaid('${cat._tid}','${cat.id}','${e.id}')">${e.paid ? '✅ Pagó' : '💲 Marcar pagado'}</button>`;
      else if (mine && e.paid) pay = `<span class="pay-tag ok">✅ Pagaste</span>`;
      else if (mine && online) pay = `<button class="btn btn-accent btn-sm" onclick="startPayment('${cat._tid}','${cat.id}','${e.id}')">💳 Pagar ${money(cost)}</button>`;
      else if (mine) pay = `<span class="pay-tag no">💲 Falta pagar ${money(cost)}</span>`;
    }
    return `<div class="player-row${mine ? ' mine-row' : ''}"><span class="pos">${n}</span>${cat.format === 'double' ? '' : (p ? avatar(p) : '')}
      <div class="meta"><div class="name">${entLink(cat, e.id)}${mine ? ' <span class="you-tag">vos</span>' : ''}</div>
      <div class="sub">${sub}</div></div>${pay}</div>`;
  };
  // Sin costo → una sola lista. Con costo → arriba los que NO pagaron, abajo los que pagaron.
  if (cost <= 0) { let n = 0; return cat.entrants.slice().sort(byName).map(e => row(e, ++n)).join(''); }
  const unpaid = cat.entrants.filter(e => !e.paid).sort(byName), paid = cat.entrants.filter(e => e.paid).sort(byName);
  let n = 0;
  const sec = (title, arr, cls) => arr.length ? `<div class="enr-sec ${cls}"><div class="enr-sec-h">${title} <span class="muted">(${arr.length})</span></div>${arr.map(e => row(e, ++n)).join('')}</div>` : '';
  return sec('💲 Falta pagar', unpaid, 'unpaid') + sec('✅ Pagaron', paid, 'paid');
}
function renderCategoria(app, tid, cid) {
  const t = tById(tid), cat = getCat(tid, cid);
  if (!cat) { app.innerHTML = '<div class="empty">No encontrada.</div>'; return; }
  cat._tid = tid; // para los onclick de grupos/llave
  _est = (setting('matchTimeEstimates') && t) ? estimateSchedule(t) : null; // horarios estimados (todo el torneo)
  let html = `<button class="btn btn-ghost btn-sm" onclick="go('torneo:${tid}')">← Volver</button>
    <div class="page-title" style="margin-top:12px"><h1>${esc(cat.name)}</h1></div>`;
  if (catTabFor !== cid) { catTabFor = cid; catTab = null; } // resetear la pestaña activa al cambiar de categoría
  const enr = enrollmentStatus(cat);
  // Reglas: una línea resumen + estado, con el detalle completo detrás de ℹ️.
  const summaryBits = [cat.format === 'double' ? '👥 Dobles' : '👤 Singles', ruleLabel(cat.rule), catSetsFmt(cat).label, `${cat.entrants.length} inscriptos`].join(' · ');
  html += `<div class="cat-rules">
      <span class="cat-rules-sum">${esc(summaryBits)}</span>
      <span class="t-badge ${enr.open ? 'open' : 'closed'}">${esc(enr.label)}</span>
      <details class="rules-more"><summary>ℹ️</summary>
        <div class="tags" style="margin-top:8px">
          ${cat.gender && cat.gender !== 'any' ? `<span class="tag">${GENDER_RULE_LABEL[cat.gender]}</span>` : ''}
          <span class="tag">📋 Inscripción: ${ruleLabel(cat.rule)}</span>
          <span class="tag">🎾 ${catSetsFmt(cat).label}</span><span class="tag">Grupos ${cat.rules.groupMin}–${cat.rules.groupMax}</span>
          <span class="tag">🥇 ${cat.championPoints} pts</span>
          ${catCost(cat) > 0 ? `<span class="tag">💲 ${money(catCost(cat))}</span>` : ''}
          ${cat.startAt ? `<span class="tag">🕒 ${fmtStartAt(cat.startAt)}</span>` : ''}
        </div>
      </details>
    </div>`;
  // Estado de pago del jugador logueado (si está inscripto y la categoría tiene costo)
  const mps = myPaymentStatus(cat);
  if (mps) {
    let payBtn = '';
    if (!mps.paid) {
      const tt = tById(tid), myEnt = entrantOfPlayer(cat, (currentUser() || {}).playerId);
      if (onlinePayReady(tt, cat) && myEnt) payBtn = ` <button class="btn btn-accent btn-sm" style="margin-left:8px" onclick="startPayment('${tid}','${cat.id}','${myEnt.id}')">💳 Pagar ahora</button>`;
    }
    html += `<div class="banner ${mps.paid ? 'ok' : ''}" style="margin:12px 0">${mps.paid ? '✅ Ya pagaste tu inscripción a esta categoría.' : `💲 Te falta pagar la inscripción de esta categoría: <b>${money(mps.cost)}</b>.${payBtn}`}</div>`;
  }
  // Resumen de pagos para admin/colaborador
  if (canEditCat(cat) && catCost(cat) > 0) {
    const paid = cat.entrants.filter(e => e.paid).length, pend = cat.entrants.length - paid;
    html += `<p class="page-sub" style="margin:8px 0 0">💲 Pagaron <b>${paid}</b> de ${cat.entrants.length} · pendiente <b>${money(pend * catCost(cat))}</b></p>`;
  }

  if (canEditCat(cat)) {
    const finalDone = cat.bracket && brWinner(cat, cat.bracket.length - 1, 0);
    const thirdReady = !thirdPlayable(cat) || matchDone(cat.thirdPlace, cat);
    const started = catStarted(cat);            // ya se largó/jugó algún partido
    const canToggle = !cat.groups && !cat.closed;
    const preStart = !started && !cat.closed;   // anotar / armar grupos: solo antes de empezar
    html += `<details class="cat-actions" ${_openDetails.has('ca:' + cid) ? 'open' : ''} ontoggle="detToggle('ca:${cid}',this)"><summary>⋯ Acciones</summary><div class="cat-actions-body">
      ${preStart ? `<button class="btn btn-accent" onclick="enrollModal('${tid}','${cid}')">📝 Anotar ${cat.format === 'double' ? 'parejas' : 'jugadores'}</button>` : ''}
      <button class="btn btn-ghost" onclick="categoryTimeModal('${tid}','${cid}')">🕒 ${cat.startAt ? 'Horario' : 'Poner horario'}</button>
      ${canToggle ? `<button class="btn btn-ghost" onclick="toggleEnroll('${tid}','${cid}')">${enr.open ? '🔒 Cerrar inscripción' : '🔓 Abrir inscripción'} (esta categoría)</button>` : ''}
      ${canToggle && cat.enrollOverride ? `<button class="btn btn-ghost" onclick="resetEnrollOverride('${tid}','${cid}')">↩️ Seguir al torneo</button>` : ''}
      ${preStart ? `<button class="btn btn-primary" onclick="makeGroups('${tid}','${cid}')">🎲 Armar grupos</button>` : ''}
      ${cat.groups && !cat.bracket && !cat.closed ? `<button class="btn btn-accent" onclick="generateBracket('${tid}','${cid}')">🏆 Generar llave</button>` : ''}
      ${finalDone && thirdReady && !cat.closed && canAwardPoints(t) ? `<button class="btn btn-primary" onclick="awardPoints('${tid}','${cid}')">✅ Cerrar y otorgar puntos</button>` : ''}
    </div></details>`;
    if (cat.closed) html += `<div class="banner" style="margin-top:12px">✅ Categoría cerrada — puntos otorgados al ranking.</div>`;
  } else {
    // jugadores: autoinscripción si la inscripción está abierta y el jugador pertenece al alcance del torneo
    const meP = (currentUser() && currentUser().playerId) ? playerById(currentUser().playerId) : null;
    const inScope = !meP || inTournamentScope(tById(tid), meP); // jugador de otra escuela en torneo cerrado → no
    html += !inScope
      ? `<div class="banner" style="margin:16px 0">🔒 Este torneo es de otra escuela: no podés anotarte.</div>`
      : enr.open
        ? `<div class="row" style="margin:16px 0"><button class="btn btn-primary" onclick="selfEnrollModal('${tid}','${cid}')">📝 Anotarme</button></div>`
        : `<div class="banner" style="margin:16px 0">${enr.label}. No te podés anotar en este momento.</div>`;
  }

  // Pestañas: muestran de a una sección para no saturar la pantalla.
  const defaultTab = cat.bracket ? 'llave' : (cat.groups ? 'grupos' : 'inscriptos');
  const tab = catTab || defaultTab;
  const tb = (id, label) => `<button class="cat-tab${tab === id ? ' active' : ''}" onclick="setCatTab('${id}')">${label}</button>`;
  html += `<div class="cat-tabs">${tb('inscriptos', `📋 Inscriptos${cat.entrants.length ? ` (${cat.entrants.length})` : ''}`)}${tb('grupos', '🎲 Grupos')}${tb('llave', '🏆 Llave')}</div>`;
  if (tab === 'inscriptos') html += entrantsListHtml(cat);
  else if (tab === 'grupos') {
    if (cat.groups && cat.groups.length) html += `<div class="groups">` + cat.groups.map((g, i) => groupCardHtml(cat, i)).join('') + `</div>`;
    else html += `<div class="empty">Grupos sin armar.${canEditCat(cat) ? ' Anotá jugadores y usá “⋯ Acciones → Armar grupos”.' : ''}</div>`;
  } else if (tab === 'llave') {
    if (cat.bracket) html += bracketHtml(cat);
    else if (cat.groups && cat.groups.length) html += `<div class="empty">Clasifican los 2 primeros de cada grupo.${groupStageComplete(cat) ? (canEditCat(cat) ? ' Usá “⋯ Acciones → Generar llave”.' : '') : ' Cargá todos los resultados de grupos.'}</div>`;
    else html += `<div class="empty">Primero armá los grupos.</div>`;
  }
  app.innerHTML = html;
}

/* ----- estado de inscripción (torneo + override por categoría) ----- */
const tournamentEnrollOpen = t => !!t && !t.enrollClosed && !t.finished;
// La inscripción de una categoría depende del torneo, salvo que la categoría tenga un override propio.
function enrollmentStatus(cat) {
  if (cat.closed) return { open: false, label: '🏁 Categoría finalizada' };
  if (cat.groups) return { open: false, label: '🔴 Inscripción cerrada (partidos en curso)' };
  if (cat.enrollOverride === 'open') return { open: true, label: '🟢 Inscripción abierta (categoría)' };
  if (cat.enrollOverride === 'closed') return { open: false, label: '🔴 Inscripción cerrada (categoría)' };
  const t = tById(cat._tid);
  return tournamentEnrollOpen(t)
    ? { open: true, label: '🟢 Inscripción abierta' }
    : { open: false, label: '🔴 Inscripción cerrada (torneo)' };
}
const enrollmentOpen = cat => enrollmentStatus(cat).open;
// Toggle a nivel categoría: fija un override opuesto al estado efectivo actual.
function toggleEnroll(tid, cid) {
  const cat = getCat(tid, cid); cat._tid = tid;
  if (cat.groups || cat.closed) { alert('No aplica: los partidos ya empezaron o la categoría está finalizada.'); return; }
  cat.enrollOverride = enrollmentStatus(cat).open ? 'closed' : 'open'; save(DB); render();
}
// Vuelve a que la categoría herede la inscripción del torneo.
function resetEnrollOverride(tid, cid) { const cat = getCat(tid, cid); cat._tid = tid; cat.enrollOverride = null; save(DB); render(); }

/* ----- enroll ----- */
function enrollModal(tid, cid) {
  const cat = getCat(tid, cid), t = tById(tid);
  if (cat.format === 'double') return enrollDoubles(tid, cid);
  const opts = tournamentPool(t).sort((a, b) => fullName(a).localeCompare(fullName(b))).map(p => {
    const checked = cat.entrants.some(e => e.players[0] === p.id);
    const isPaid = cat.entrants.some(e => e.players[0] === p.id && e.paid); // ya pagó → no se puede desinscribir
    const el = eligible(cat, p), age = ageFromDob(p.dob);
    return `<label class="enrow ${el.ok ? '' : 'no'}" data-name="${esc(fullName(p) + ' ' + p.city).toLowerCase()}" style="display:flex;align-items:center;gap:10px;font-weight:500;margin:6px 0">
      <input type="checkbox" value="${p.id}" ${checked ? 'checked' : ''} ${(el.ok && !isPaid) ? '' : 'disabled'} style="width:auto"/>
      <span>${esc(fullName(p))} <span class="muted" style="font-size:12px">· ${p.category}${age != null ? ` · ${age}a` : ''} · ${esc(p.city)}</span>
      ${isPaid ? `<br><small style="color:#16a34a">🔒 ya pagó — no se puede desinscribir</small>` : (el.ok ? '' : `<br><small style="color:#b42318">⛔ ${esc(el.reason)}</small>`)}</span></label>`;
  }).join('');
  openModal(`<h3>Anotar jugadores — ${esc(cat.name)}</h3>
    <p class="hint" style="margin-top:0">Regla de inscripción: <b>${ruleLabel(cat.rule)}</b></p>
    <input class="enroll-search" placeholder="🔍 Buscar jugador por nombre o localidad…" oninput="enrollFilter(this)"/>
    <div id="enrollList" style="max-height:46vh;overflow:auto">${opts || '<div class="empty">No hay jugadores.</div>'}</div>
    <div class="row spread" style="margin-top:16px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveEnrollSingles('${tid}','${cid}')">Guardar</button></div>`);
  const s = $('.enroll-search'); if (s) s.focus();
}
function enrollFilter(inp) {
  const q = inp.value.toLowerCase();
  document.querySelectorAll('#enrollList .enrow').forEach(el => { el.style.display = el.dataset.name.includes(q) ? '' : 'none'; });
}
function saveEnrollSingles(tid, cid) {
  const cat = getCat(tid, cid);
  const t = tById(tid);
  const ids = [...$('#modalCard').querySelectorAll('input[type=checkbox]:checked')].map(c => c.value)
    .filter(pid => { const p = playerById(pid); return p && eligible(cat, p).ok && inTournamentScope(t, p); }); // defensivo: elegibilidad + escuela/org
  // Nunca desinscribir a quien ya pagó (aunque la UI lo bloquea, lo reforzamos acá).
  (cat.entrants || []).forEach(e => { if (e.paid && !ids.includes(e.players[0])) ids.push(e.players[0]); });
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
  const optList = tournamentPool(tById(tid)).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  const sel = id => `<select id="${id}"><option value="">— jugador —</option>${optList.map(p => `<option value="${p.id}">${esc(fullName(p))}</option>`).join('')}</select>`;
  const list = teams.map((e, i) => `<div class="bmatch"><span>${esc(playerById(e.players[0]) ? fullName(playerById(e.players[0])) : '?')} / ${esc(playerById(e.players[1]) ? fullName(playerById(e.players[1])) : '?')}</span>
    ${e.paid ? '<span class="muted" style="color:#16a34a;font-size:12px">🔒 pagó</span>' : `<button class="btn btn-ghost btn-sm" onclick="rmTeam(${i},'${tid}','${cid}')">🗑️</button>`}</div>`).join('');
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
  const t = tById(tid);
  for (const pid of [a, b]) { const p = playerById(pid); const el = eligible(cat, p); if (!el.ok) { e.hidden = false; e.textContent = '⛔ ' + el.reason; return; } if (!inTournamentScope(t, p)) { e.hidden = false; e.textContent = '⛔ Ese jugador no pertenece a la escuela de este torneo cerrado.'; return; } }
  const gk = pairGenderOk(cat, a, b); if (!gk.ok) { e.hidden = false; e.textContent = '⛔ ' + gk.reason; return; }
  window.__teams.push({ id: uid('e_'), players: [a, b] });
  renderDoublesModal(tid, cid);
}
function rmTeam(i, tid, cid) { window.__teams.splice(i, 1); renderDoublesModal(tid, cid); }
function saveEnrollDoubles(tid, cid) {
  const cat = getCat(tid, cid); const teams = window.__teams || [];
  // Nunca desinscribir parejas que ya pagaron (aunque la UI oculta el botón, lo reforzamos acá).
  (cat.entrants || []).forEach(e => { if (e.paid && !teams.some(x => x.id === e.id)) teams.push(e); });
  cat.entrants = teams; resetCat(cat); save(DB); closeModal(); render();
}
function resetCat(cat) { cat.groups = null; cat.matches = null; cat.bracket = null; cat.thirdPlace = null; cat.closed = false; cat.awarded = null; }

/* ----- autoinscripción (jugadores) ----- */
function selfEnrollModal(tid, cid) {
  const cat = getCat(tid, cid); cat._tid = tid;
  if (!enrollmentOpen(cat)) { alert('La inscripción no está abierta.'); return; }
  const u = currentUser(), me = u && u.playerId ? playerById(u.playerId) : null;
  if (me && me.pending) { openModal(`<h3>Anotarme — ${esc(cat.name)}</h3><div class="banner">⏳ Tu cuenta está pendiente de aprobación por el admin. Cuando te aprueben vas a poder anotarte.</div><div class="row spread" style="margin-top:16px"><button class="btn btn-ghost" onclick="closeModal()">Cerrar</button></div>`); return; }
  if (FB() && me && currentUser().emailVerified === false) { openModal(`<h3>Anotarme — ${esc(cat.name)}</h3><div class="banner">📧 Verificá tu email antes de anotarte. Tenés el link en tu casilla; podés reenviarlo desde 👤 Perfil.</div><div class="row spread" style="margin-top:16px"><button class="btn btn-ghost" onclick="closeModal()">Cerrar</button></div>`); return; }
  const t = tById(tid);
  const enrolledIds = new Set(cat.entrants.flatMap(e => e.players));
  const availFor = exclude => tournamentPool(t).sort((a, b) => fullName(a).localeCompare(fullName(b)))
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
  const cat = getCat(tid, cid), e = $('#seerr'); cat._tid = tid;
  if (!enrollmentOpen(cat)) { if (e) { e.hidden = false; e.textContent = 'La inscripción se cerró.'; } return; }
  const u = currentUser(), me = u && u.playerId ? u.playerId : null;
  const a = me || ($('#se_a') ? $('#se_a').value : '');
  const b = cat.format === 'double' ? ($('#se_b') ? $('#se_b').value : '') : null;
  if (!a || (cat.format === 'double' && !b)) { e.hidden = false; e.textContent = 'Elegí jugador(es).'; return; }
  if (cat.format === 'double' && a === b) { e.hidden = false; e.textContent = 'Tenés que elegir dos jugadores distintos.'; return; }
  const ids = cat.format === 'double' ? [a, b] : [a];
  const t = tById(tid);
  const enrolledIds = new Set(cat.entrants.flatMap(x => x.players));
  for (const pid of ids) {
    if (enrolledIds.has(pid)) { e.hidden = false; e.textContent = `${fullName(playerById(pid))} ya está anotado.`; return; }
    const p = playerById(pid);
    const el = eligible(cat, p); if (!el.ok) { e.hidden = false; e.textContent = '⛔ ' + el.reason; return; }
    if (!inTournamentScope(t, p)) { e.hidden = false; e.textContent = '⛔ Este torneo es cerrado: solo jugadores de la escuela pueden anotarse.'; return; }
  }
  if (cat.format === 'double') { const gk = pairGenderOk(cat, a, b); if (!gk.ok) { e.hidden = false; e.textContent = '⛔ ' + gk.reason; return; } }
  // Las reglas de Firestore solo dejan que admin/colaborador escriban el torneo. Un jugador que se
  // auto-anota NO puede → la inscripción la persiste el worker (si no, se ve un segundo y el live-sync la revierte).
  if (FB() && !(isAdmin() || isCollaboratorOf(t))) { enrollViaWorker(tid, cid, ids, e); return; }
  cat.entrants.push({ id: uid('e_'), players: ids });
  save(DB); closeModal(); render();
}
// Persiste la auto-inscripción de un jugador vía worker (el cliente ya validó elegibilidad).
async function enrollViaWorker(tid, cid, players, errEl) {
  const wurl = ((DB.settings && DB.settings.mpWorkerUrl) || '').trim().replace(/\/+$/, '');
  const fail = m => { if (errEl) { errEl.hidden = false; errEl.textContent = m; } else alert(m); };
  if (!wurl) { fail('No se puede guardar la inscripción ahora (falta configurar el servicio). Avisale al organizador.'); return; }
  const btn = $('#modalCard .btn-primary'); if (btn) { btn.disabled = true; btn.textContent = 'Anotando…'; }
  try {
    const idToken = await window.STORE.idToken();
    const r = await fetch(wurl + '/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken, tournamentId: tid, categoryId: cid, players }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { if (btn) { btn.disabled = false; btn.textContent = 'Anotarme'; } fail(d.error ? '⛔ ' + d.error : 'No se pudo anotar, probá de nuevo.'); return; }
    closeModal(); // el live-sync trae el torneo con la inscripción en ~1s
  } catch (err) { if (btn) { btn.disabled = false; btn.textContent = 'Anotarme'; } fail('No se pudo anotar: ' + (err && err.message || err)); }
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
function genMatches(groups, bestOf) { const m = []; groups.forEach((g, gi) => { for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) m.push({ g: gi, a: g[i], b: g[j], sets: [], bestOf }); }); return m; }
function makeGroups(tid, cid) {
  const cat = getCat(tid, cid);
  // Si ya hay resultados cargados (partidos jugados, llave generada o categoría cerrada),
  // rearmar grupos los borra. Pedimos confirmación explícita para evitar perder datos.
  const hasResults = (cat.matches || []).some(m => matchDone(m, cat)) || cat.bracket || cat.closed;
  if (hasResults && !confirm('⚠️ Esta categoría ya tiene resultados cargados. Si volvés a armar los grupos se borrarán todos los partidos, la llave y el cierre. ¿Continuar?')) return;
  const ids = cat.entrants.map(e => e.id);
  const res = buildGroups(ids, cat.rules.groupMin, cat.rules.groupMax);
  if (!res.ok) { alert('⚠️ ' + res.msg); return; }
  cat.groups = res.groups; cat.matches = genMatches(res.groups, catSetsFmt(cat).groups); cat.bracket = null; cat.thirdPlace = null; cat.closed = false; cat.awarded = null;
  snapshotSeed(cat); // congela los puntajes de referencia para el Elo de todos los partidos del torneo
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
// Disclosures (⋯ Acciones) cuyo estado "abierto" recordamos entre renders — si no, se re-colapsan en
// cada render() (que ocurre tras cargar cada resultado) y el admin tiene que reabrirlas todo el tiempo.
const _openDetails = new Set();
function detToggle(key, el) { if (el && el.open) _openDetails.add(key); else _openDetails.delete(key); }
const _grpCollapsed = new Set(); // grupos colapsados (clave "catId:gi")
function toggleGroup(cid, gi) { const k = cid + ':' + gi; if (_grpCollapsed.has(k)) _grpCollapsed.delete(k); else _grpCollapsed.add(k); render(); }
// Zoom de la llave (sobre todo para el celu): se aplica con CSS `zoom` al contenedor de la llave,
// así el scroll del contenedor sigue funcionando. Se guarda el nivel para sobrevivir a un re-render.
let _brZoom = 1;
function applyBrZoom() { const el = document.getElementById('brkt'); if (el) el.style.zoom = _brZoom; const l = document.getElementById('brzLvl'); if (l) l.textContent = Math.round(_brZoom * 100) + '%'; }
function brZoom(dir) { _brZoom = Math.min(1.8, Math.max(0.5, +(_brZoom + dir * 0.2).toFixed(2))); applyBrZoom(); }
function brZoomReset() { _brZoom = 1; applyBrZoom(); }
function groupCardHtml(cat, gi) {
  const st = groupStandings(cat, gi);
  const head = `<li class="grp-head"><span>Jugador</span><span class="grp-stat">Ganados · Sets</span></li>`;
  const rows = head + st.map((s, i) => `<li${i < 2 ? ' class="grp-q"' : ''}><span${i < 2 ? ' style="font-weight:700"' : ''}>${i + 1}. ${entLink(cat, s.id)}</span>
    <span class="grp-stat">${s.pg}G · ${s.sf}-${s.sc}${i < 2 ? ' ✅' : ''}</span></li>`).join('');
  const zoneStarted = cat.zoneTable && cat.zoneTable[gi] != null;
  const ms = cat.matches.filter(m => m.g === gi).map(m => {
    const idx = cat.matches.indexOf(m), r = matchResult(m), done = matchDone(m, cat), w = matchWinnerSide(m, cat);
    const wo = m.walkover ? ' <span class="wo-tag">W.O.</span>' : '';
    let ctl = '';
    if (canEditCat(cat) && !done) {
      if (m.postponed) ctl = `<span class="post-tag">⏸ Aplazado</span>${startControl(cat, 'group', idx, null, null, m)}<button class="btn btn-ghost btn-sm" onclick="resumeMatch('${cat._tid}','${cat.id}',${idx})" title="Volver a la mesa de la zona">↩️</button>`;
      else if (zoneStarted) ctl = `<button class="btn btn-ghost btn-sm" onclick="postponeMatch('${cat._tid}','${cat.id}',${idx})" title="Aplazar: saca este partido de la mesa de la zona">⏸ Aplazar</button>`;
    }
    // Todos los controles (Cargar / 🚷 / Aplazar / Iniciar) van juntos en una sola fila, así no se parten en dos líneas.
    const actions = canEditCat(cat)
      ? `<div class="bmatch-actions">${resultBtn(cat, 'group', idx, null, null, m, done, 'btn btn-ghost btn-sm', '✏️')}${!done ? noShowBtn(cat, 'group', idx, null, null) : ''}${ctl}</div>`
      : '';
    return `<div class="bmatch"><span class="${w === 'a' ? 'win' : ''}">${entLink(cat, m.a)}</span>
      <b class="score">${done ? r.wa + '-' + r.wb : '–'}</b>${wo}
      <span class="${w === 'b' ? 'win' : ''}">${entLink(cat, m.b)}</span>
      ${done ? eloLabel(cat, m, m.a, m.b) : estStartLabel(m)}
      ${actions}</div>`;
  }).join('');
  const zc = zoneControl(cat, gi);
  const key = cat.id + ':' + gi, collapsed = _grpCollapsed.has(key);
  return `<div class="group-card${collapsed ? ' collapsed' : ''}">
    <h4 onclick="toggleGroup('${cat.id}',${gi})">Grupo ${String.fromCharCode(65 + gi)} · ${cat.groups[gi].length} <span class="grp-caret">▾</span></h4>
    <div class="group-body">${zc ? `<div class="zone-bar">${zc}</div>` : ''}<ul>${rows}</ul><div class="matches">${ms}</div></div></div>`;
}

/* ----- bracket ----- */
function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }
// Orden ESTÁNDAR de posiciones de un cuadro de tamaño potencia de 2 (1-based): coloca los seeds de
// forma que el 1 y el 2 queden en mitades opuestas y cada cabeza de serie enfrente primero al seed
// más bajo. Así, al rellenar con BYE los seeds que sobran (los más bajos), el BYE le toca a los
// MEJORES seeds (los que más lo merecen por su rendimiento en la zona).
function seedOrder(size) { let order = [1]; while (order.length < size) { const sum = order.length * 2 + 1; order = order.flatMap(s => [s, sum - s]); } return order; }
function brContender(cat, r, m, side) { if (r === 0) { const mm = cat.bracket[0][m]; return side === 'a' ? mm.a : mm.b; } return brWinner(cat, r - 1, m * 2 + (side === 'a' ? 0 : 1)); }
function brWinner(cat, r, m) {
  const a = brContender(cat, r, m, 'a'), b = brContender(cat, r, m, 'b');
  if (a === 'BYE') return b; if (b === 'BYE') return a; if (a == null || b == null) return null;
  const w = matchWinnerSide(cat.bracket[r][m], cat); return w === 'a' ? a : w === 'b' ? b : null;
}
function semiLoser(cat, idx) { const T = cat.bracket.length, semR = T - 2; if (semR < 0) return null; const w = brWinner(cat, semR, idx); if (!w) return null; const a = brContender(cat, semR, idx, 'a'), b = brContender(cat, semR, idx, 'b'); return w === a ? b : a; }
// El partido por el 3er puesto solo se juega si AMBOS perdedores de semifinal son reales (no BYE).
// Con un nº de clasificados que no es potencia de 2, una semi puede ser "real vs BYE": en ese caso
// no hay partido por el 3º y el semifinalista real queda automáticamente 3º (no se puede bloquear el cierre).
function thirdPlayable(cat) { if (!cat.thirdPlace) return false; const a = semiLoser(cat, 0), b = semiLoser(cat, 1); return !!(a && b && a !== 'BYE' && b !== 'BYE'); }
function generateBracket(tid, cid) {
  const cat = getCat(tid, cid);
  if (!cat.groups) { alert('Primero armá los grupos.'); return; }
  if (!groupStageComplete(cat)) { alert('⚠️ Faltan resultados de la fase de grupos.'); return; }
  // Clasificados (1° y 2° de cada zona) ordenados POR MÉRITO en la fase de grupos: primero partidos
  // ganados, luego diferencia de sets (ganados − perdidos) y, por último, diferencia de puntos.
  // Los mejores quedan como cabezas de serie y, si el cuadro no es potencia de 2, son los que reciben BYE.
  const quals = [];
  cat.groups.forEach((g, gi) => { const s = groupStandings(cat, gi); [s[0], s[1]].forEach(row => { if (row) quals.push(row); }); });
  if (!quals.length) { alert('No hay clasificados.'); return; }
  quals.sort((a, b) => b.pg - a.pg || (b.sf - b.sc) - (a.sf - a.sc) || (b.pf - b.pc) - (a.pf - a.pc));
  const seedIds = quals.map(q => q.id), K = seedIds.length;
  const size = Math.max(2, nextPow2(K));
  const slots = seedOrder(size).map(n => n <= K ? seedIds[n - 1] : 'BYE'); // posiciones estándar; el BYE cae en los mejores seeds
  const rounds = [], r0 = []; for (let i = 0; i < slots.length; i += 2) r0.push({ a: slots[i], b: slots[i + 1], sets: [] });
  rounds.push(r0); let c = r0.length; while (c > 1) { const rr = []; for (let i = 0; i < c; i += 2) rr.push({ sets: [] }); rounds.push(rr); c = rr.length; }
  const fmt = catSetsFmt(cat); // sets por fase: la ronda final usa fmt.final, el resto de la llave fmt.bracket
  rounds.forEach((round, r) => round.forEach(mm => { mm.bestOf = r === rounds.length - 1 ? fmt.final : fmt.bracket; }));
  cat.bracket = rounds;
  cat.thirdPlace = rounds.length >= 2 ? { sets: [], bestOf: fmt.bracket } : null; // partido por 3er/4to puesto
  cat.closed = false; cat.awarded = null; snapshotSeed(cat); save(DB); render();
}
function bracketHtml(cat) {
  const T = cat.bracket.length;
  const rname = r => { const fe = T - 1 - r; return fe === 0 ? 'Final' : fe === 1 ? 'Semifinal' : fe === 2 ? 'Cuartos' : fe === 3 ? 'Octavos' : 'Ronda ' + (r + 1); };
  const myId = (currentUser() || {}).playerId;
  const isMine = id => !!(myId && id && id !== 'BYE' && ((entById(cat, id) || {}).players || []).includes(myId));
  let meInBracket = false;
  const slot = (id, w, sc) => { const mine = isMine(id); if (mine) meInBracket = true; return `<div class="br-slot ${w ? 'win' : ''} ${mine ? 'mine' : ''}">${w ? '<span class="br-trophy">🏆</span>' : ''}${id === 'BYE' ? '<i class="muted">BYE</i>' : id ? entLink(cat, id) : '<i class="muted">—</i>'}${mine ? '<span class="br-you">vos</span>' : ''}<span class="br-s">${sc}</span></div>`; };
  const matchCls = (a, b, done) => `br-match${(isMine(a) || isMine(b)) ? ' mine-match' : ''}${done ? ' done' : ''}`;
  const cols = cat.bracket.map((round, r) => `<div class="br-col"><div class="br-rtitle">${rname(r)}</div>` +
    round.map((mm, m) => { const a = brContender(cat, r, m, 'a'), b = brContender(cat, r, m, 'b'), res = matchResult(mm), w = brWinner(cat, r, m), done = matchDone(mm, cat);
      const playable = a && b && a !== 'BYE' && b !== 'BYE';
      const can = canEditCat(cat) && playable;
      const mesa = (playable && !done) ? startControl(cat, 'bracket', null, r, m, mm) : '';
      return `<div class="${matchCls(a, b, done)}">${slot(a, w && w === a, done ? res.wa : '')}${slot(b, w && w === b, done ? res.wb : '')}
        ${done && catScores(cat) ? `<div class="br-elo">${eloLabel(cat, mm, a, b)}</div>` : (playable && !done && estStartLabel(mm) ? `<div class="br-est">${estStartLabel(mm)}</div>` : '')}
        ${mesa ? `<div class="br-mesa">${mesa}</div>` : ''}
        ${can ? resultBtn(cat, 'bracket', null, r, m, mm, done, 'btn br-edit', '✏️ editar') : ''}
        ${can && !done ? `<button class="btn br-edit" onclick="noShowModal('${cat._tid}','${cat.id}','bracket',null,${r},${m})" title="Cargar como no presentado">🚷 No se presentó</button>` : ''}</div>`;
    }).join('') + `</div>`).join('');
  let extra = '';
  if (cat.thirdPlace && !thirdPlayable(cat)) {
    // Una semifinal fue "real vs BYE": no hay partido por el 3º; el semifinalista real queda 3º.
    const a = semiLoser(cat, 0), b = semiLoser(cat, 1), real = (a && a !== 'BYE') ? a : (b && b !== 'BYE') ? b : null;
    if (real) extra = `<div class="br-col br-col-3rd"><div class="br-rtitle">🥉 3er puesto</div><div class="${matchCls(real, null, true)}">${slot(real, true, '')}<div class="br-est muted">Sin partido (rival con BYE)</div></div></div>`;
  } else if (cat.thirdPlace) {
    const a = semiLoser(cat, 0), b = semiLoser(cat, 1), res = matchResult(cat.thirdPlace), w = matchWinnerSide(cat.thirdPlace, cat), done = matchDone(cat.thirdPlace, cat);
    const playable = a && b && a !== 'BYE' && b !== 'BYE';
    const can = canEditCat(cat) && playable;
    const mesa = (playable && !done) ? startControl(cat, 'third', null, null, null, cat.thirdPlace) : '';
    extra = `<div class="br-col br-col-3rd"><div class="br-rtitle">🥉 3er puesto</div><div class="${matchCls(a, b, done)}">
      ${slot(a, w === 'a', done ? res.wa : '')}${slot(b, w === 'b', done ? res.wb : '')}
      ${done && catScores(cat) ? `<div class="br-elo">${eloLabel(cat, cat.thirdPlace, a, b)}</div>` : (playable && !done && estStartLabel(cat.thirdPlace) ? `<div class="br-est">${estStartLabel(cat.thirdPlace)}</div>` : '')}
      ${mesa ? `<div class="br-mesa">${mesa}</div>` : ''}
      ${can ? resultBtn(cat, 'third', null, null, null, cat.thirdPlace, done, 'btn br-edit', '✏️ editar') : ''}
      ${can && !done ? `<button class="btn br-edit" onclick="noShowModal('${cat._tid}','${cat.id}','third',null,null,null)" title="Cargar como no presentado">🚷 No se presentó</button>` : ''}</div></div>`;
  }
  const champ = brWinner(cat, T - 1, 0);
  const champHtml = champ && champ !== 'BYE' ? `<div class="champ ${isMine(champ) ? 'champ-mine' : ''}">🏆 <span>Campeón</span> <b>${entLink(cat, champ)}</b>${isMine(champ) ? ' <span class="br-you">vos</span>' : ''}</div>` : '';
  const tools = `<div class="bracket-tools">
      <div class="brz">
        <button class="brz-btn" type="button" onclick="brZoom(-1)" aria-label="Alejar">−</button>
        <span class="brz-lvl" id="brzLvl">${Math.round(_brZoom * 100)}%</span>
        <button class="brz-btn" type="button" onclick="brZoom(1)" aria-label="Acercar">+</button>
        <button class="brz-btn brz-reset" type="button" onclick="brZoomReset()" aria-label="Restablecer zoom" title="Restablecer">⟳</button>
      </div>
      <span class="brz-hint">${meInBracket ? '⭐ Tus partidos están resaltados · ' : ''}↔ deslizá para ver toda la llave</span>
    </div>`;
  return `${tools}<div class="bracket-scroll"><div class="bracket" id="brkt" style="zoom:${_brZoom}">${cols}${extra}</div></div>${champHtml}${awardedHtml(cat)}`;
}
function awardedHtml(cat) {
  if (!cat.awarded || !Object.keys(cat.awarded).length) return '';
  const rows = Object.entries(cat.awarded).sort((a, b) => b[1] - a[1]).map(([eid, pts]) =>
    `<li><span>${entLink(cat, eid)}</span><span class="pts ${pts < 0 ? 'neg' : ''}" style="margin-left:auto">${pts >= 0 ? '+' : ''}${pts} pts</span></li>`).join('');
  return `<div class="card" style="margin-top:14px"><h3 style="margin:0 0 8px">Cambios de puntaje del torneo</h3><ul class="awarded">${rows}</ul></div>`;
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
  const N = bestOfOf(mm, cat), nWin = Math.ceil(N / 2);
  let rows = '';
  for (let i = 0; i < N; i++) { const s = (mm.sets && mm.sets[i]) || ['', '']; rows += `<div class="setrow"><span>Set ${i + 1}</span>
    <input class="set-a" type="number" min="0" value="${s[0]}"/><b>–</b><input class="set-b" type="number" min="0" value="${s[1]}"/></div>`; }
  openModal(`<h3>Cargar resultado</h3>
    <div class="row spread" style="font-weight:700;margin:6px 0"><span>${esc(entName(cat, a))}</span><span>${esc(entName(cat, b))}</span></div>
    <p class="muted" style="margin:0 0 8px">Al mejor de ${N} sets (gana quien llega a ${nWin}). Cada set a 11, diferencia de 2.</p>
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
  const { mm } = locateMatch(cat, kind, gidx, r, m);
  const n = Math.ceil(bestOfOf(mm, cat) / 2);
  // Recorre en orden: el partido termina cuando alguien llega a n sets; no se pueden cargar sets de más.
  let wa = 0, wb = 0, decided = -1;
  for (let i = 0; i < sets.length; i++) {
    setWinner(sets[i]) === 'a' ? wa++ : wb++;
    if (decided < 0 && (wa === n || wb === n)) decided = i;
  }
  if (decided < 0) { e.hidden = false; e.textContent = `Faltan sets: alguien tiene que llegar a ${n} sets ganados.`; return; }
  if (decided < sets.length - 1) { e.hidden = false; e.textContent = `Cargaste sets de más: el partido termina cuando alguien llega a ${n} sets (no puede ganar por más de ${n}).`; return; }
  mm.sets = sets; if (mm.walkover) delete mm.walkover; save(DB); closeModal(); render();
}

/* ----- puntos al ranking ----- */
/* ---------------- puntaje por partido (Elo) ---------------- */
const ELO_K = 12, ELO_D = 400;                  // suavidad del intercambio por partido
const SCORE_CAP_HI = 1100, SCORE_CAP_LO = 100;  // >1100 las sumas valen la mitad; <100 las restas valen la mitad
const TOURNEY_MAX = 20;                          // tope de puntos que otorga un torneo (campeón)
// Solo puntúan las categorías singles de nivel (Primera/Segunda/Tercera/Cuarta).
// Puntúan: singles de nivel (siempre) y dobles (si la feature "Ranking de dobles" está activa).
const catScores = cat => !cat ? false : (cat.format === 'double' ? !!setting('doublesRanking') : !!(cat.rule && cat.rule.type === 'level'));
// ---- ranking de dobles (por pareja) ----
const pairKey = ids => ids.slice().sort().join('|');
// Busca (o crea) el registro de la pareja EN UNA CATEGORÍA de dobles (cada categoría tiene su ranking).
// Al crearla, arranca con el promedio del ranking individual de sus miembros.
function pairRecord(players, catName, create) {
  if (!DB.settings.pairs) DB.settings.pairs = [];
  const key = pairKey(players), cn = catName || 'Dobles';
  let pr = DB.settings.pairs.find(p => pairKey(p.players) === key && (p.catName || 'Dobles') === cn);
  if (!pr && create) {
    const base = Math.round(players.reduce((s, pid) => s + ((playerById(pid) || {}).points || NEW_PLAYER_POINTS), 0) / (players.length || 1));
    pr = { id: 'pr_' + cn.replace(/\W+/g, '_') + '_' + key.replace(/\W+/g, '_'), players: players.slice(), catName: cn, points: base };
    DB.settings.pairs.push(pr);
  }
  return pr;
}
const pairName = pr => pr.players.map(pid => { const p = playerById(pid); return p ? fullName(p) : '?'; }).join(' / ');
// Rating de referencia de un entrante: la foto tomada al iniciar la categoría (cae al puntaje actual si falta).
function seedRatingOf(cat, entId) {
  if (cat.seedRatings && cat.seedRatings[entId] != null) return cat.seedRatings[entId];
  const e = entById(cat, entId); if (!e) return NEW_PLAYER_POINTS;
  const rs = e.players.map(pid => { const p = playerById(pid); return p ? p.points : NEW_PLAYER_POINTS; });
  return rs.length ? rs.reduce((s, x) => s + x, 0) / rs.length : NEW_PLAYER_POINTS;
}
// Congela los ratings de los inscriptos al arrancar el juego de una categoría que puntúa.
function snapshotSeed(cat) {
  if (!catScores(cat) || cat.seedRatings) return;
  cat.seedRatings = {};
  cat.entrants.forEach(e => { cat.seedRatings[e.id] = seedRatingOf(cat, e.id); });
}
// Puntos que intercambia un partido (ganador +N, perdedor −N). Suma cero. Más diferencia ⇒ más puntos al batacazo.
function matchElo(cat, winId, loseId) {
  const Rw = seedRatingOf(cat, winId), Rl = seedRatingOf(cat, loseId);
  const Ew = 1 / (1 + Math.pow(10, (Rl - Rw) / ELO_D));
  // Mínimo ±1: todo partido decidido cuenta, aunque la diferencia de puntaje sea enorme
  // (con K=12 y redondeo, un favorito muy superior sumaría 0 y el partido no contaría).
  return Math.max(1, Math.round(ELO_K * (1 - Ew)));
}
// Para un partido terminado de una categoría que puntúa: { winId, loseId, n } o null.
function matchEloOf(cat, mm, a, b) {
  if (!catScores(cat) || !mm || !a || !b || a === 'BYE' || b === 'BYE') return null;
  const w = matchWinnerSide(mm, cat); if (!w) return null;
  const winId = w === 'a' ? a : b, loseId = w === 'a' ? b : a;
  return { winId, loseId, n: matchElo(cat, winId, loseId) };
}
// Etiqueta "+N / −N" al costado del partido (verde lo que sumó el ganador, rojo lo que perdió el perdedor).
function eloLabel(cat, mm, a, b) {
  const e = matchEloOf(cat, mm, a, b); if (!e) return '';
  const w = matchWinnerSide(mm, cat); // ganador: 'a' (izq) | 'b' (der)
  const up = `<span class="elo-up">+${e.n}</span>`, down = `<span class="elo-down">−${e.n}</span>`;
  // El + (verde) va del lado del ganador: si ganó el de la derecha, queda a la derecha.
  const inner = w === 'b' ? down + up : up + down;
  return `<span class="elo-delta" title="El ganador suma +${e.n} y el perdedor pierde −${e.n} (se aplica al cerrar la categoría)">${inner}</span>`;
}
// Recorre todos los partidos de la categoría (grupos + llave + 3er puesto) con sus contendientes.
function eachMatch(cat, cb) {
  (cat.matches || []).forEach(m => cb(m, m.a, m.b));
  if (cat.bracket) cat.bracket.forEach((round, r) => round.forEach((mm, mi) => cb(mm, brContender(cat, r, mi, 'a'), brContender(cat, r, mi, 'b'))));
  if (cat.thirdPlace) cb(cat.thirdPlace, semiLoser(cat, 0), semiLoser(cat, 1));
}

function placements(cat) {
  const map = {}; if (!cat.bracket) return map;
  const T = cat.bracket.length, S = cat.bracket[0].length * 2;
  const champ = brWinner(cat, T - 1, 0), fa = brContender(cat, T - 1, 0, 'a'), fb = brContender(cat, T - 1, 0, 'b');
  if (champ) { map[champ] = 1; const lo = champ === fa ? fb : fa; if (lo && lo !== 'BYE') map[lo] = 2; }
  if (cat.thirdPlace) {
    const a = semiLoser(cat, 0), b = semiLoser(cat, 1), aR = a && a !== 'BYE', bR = b && b !== 'BYE';
    if (aR && bR) { const w = matchWinnerSide(cat.thirdPlace, cat); if (w === 'a') { map[a] = 3; map[b] = 4; } else if (w === 'b') { map[b] = 3; map[a] = 4; } }
    else if (aR) map[a] = 3; // el rival entró por BYE → el semifinalista real es 3º automáticamente
    else if (bR) map[b] = 3;
  }
  for (let r = 0; r < T - 2; r++) { const K = S / Math.pow(2, r); for (let mm = 0; mm < cat.bracket[r].length; mm++) { const w = brWinner(cat, r, mm); if (!w) continue; const a = brContender(cat, r, mm, 'a'), b = brContender(cat, r, mm, 'b'), lo = w === a ? b : a; if (lo && lo !== 'BYE' && !(lo in map)) map[lo] = K; } }
  return map;
}
function awardPoints(tid, cid) {
  const cat = getCat(tid, cid);
  const t = tById(tid), tOpen = !!(t && t.open); // torneo abierto → los puntos también cuentan para el ranking de escuelas
  if (!canAwardPoints(t)) return; // solo admin de la escuela del torneo / superadmin
  if (cat.closed) return;
  if (!cat.bracket || !brWinner(cat, cat.bracket.length - 1, 0)) { alert('La final todavía no tiene ganador.'); return; }
  if (thirdPlayable(cat) && !matchDone(cat.thirdPlace, cat)) { alert('Falta el resultado del partido por 3er puesto.'); return; }
  if (!confirm('¿Cerrar la categoría y otorgar los puntos al ranking? (no se puede deshacer)')) return;
  cat.awarded = {};
  if (catScores(cat)) {
    // 1) Elo por partido: acumular +N/−N de cada partido por entrante (suma cero).
    const delta = {}, add = (id, n) => { delta[id] = (delta[id] || 0) + n; };
    eachMatch(cat, (mm, a, b) => { const e = matchEloOf(cat, mm, a, b); if (e) { add(e.winId, e.n); add(e.loseId, -e.n); } });
    // 2) Podio (solo 1°–4°), escalado del valor del torneo (tope 20): campeón V, finalista V/2, 3° V/3, 4° V/4.
    //    `podium` guarda SOLO estos puntos (haber llegado al menos a semifinal), sin los cruces Elo:
    //    es lo que suma al ranking de escuelas en torneos abiertos.
    const V = Math.min(TOURNEY_MAX, cat.championPoints || 0), map = placements(cat), podium = {};
    Object.entries(map).forEach(([eid, div]) => { if (div <= 4) { const pp = Math.round(V / div); add(eid, pp); podium[eid] = (podium[eid] || 0) + pp; } });
    // 3) Aplicar con topes: >1100 sumas a la mitad, <100 restas a la mitad, nunca <0.
    //    Dobles → al ranking de la PAREJA; singles → al ranking individual de cada jugador.
    const cap = (cur, net) => { let d = net; if (cur > SCORE_CAP_HI && d > 0) d = Math.floor(d * 0.5); if (cur < SCORE_CAP_LO && d < 0) d = -Math.floor(Math.abs(d) * 0.5); return Math.max(0, cur + d) - cur; };
    Object.entries(delta).forEach(([eid, net]) => {
      const e = entById(cat, eid); if (!e) return;
      if (e.players.some(pid => isGuest(playerById(pid)))) return; // invitados (o parejas con un invitado) no suman a ningún ranking
      let applied = net;
      if (cat.format === 'double') {
        const pr = pairRecord(e.players, cat.name, true);  // ranking de la pareja en ESTA categoría de dobles
        applied = cap(pr.points, net); pr.points += applied;
      } else {
        e.players.forEach(pid => {
          const p = playerById(pid); if (!p) return;
          applied = cap(p.points, net); p.points += applied; syncCategory(p);
          // Ranking de escuelas: SOLO los puntos de podio (semifinal+) y solo en torneos abiertos. No suma los cruces Elo.
          if (tOpen && podium[eid]) p.openPoints = (p.openPoints || 0) + podium[eid];
        });
      }
      cat.awarded[eid] = applied;
    });
  }
  cat.closed = true;
  // Persistencia: en Firebase, escribir las fichas de jugadores (posiblemente de otras escuelas en
  // torneos abiertos) y el ranking de dobles lo hace el worker (el admin no puede por las reglas).
  if (FB()) { awardViaWorker(t, cat); return; }
  save(DB); render();
}
// Manda al worker el cierre de categoría + los puntos ya calculados, para que los persista con la
// cuenta de servicio. El cliente ya mutó el DB en memoria; el live-sync confirma esos mismos valores.
async function awardViaWorker(t, cat) {
  const wurl = ((DB.settings && DB.settings.mpWorkerUrl) || '').trim().replace(/\/+$/, '');
  if (!wurl) { alert('No se pudieron otorgar los puntos: falta configurar la URL del servicio (worker) en Ajustes.'); render(); return; }
  const ids = new Set((cat.entrants || []).flatMap(e => e.players || []));
  const players = [...ids].map(id => playerById(id)).filter(Boolean)
    .map(p => ({ id: p.id, points: p.points, openPoints: p.openPoints || 0, category: p.category }));
  try {
    const idToken = await window.STORE.idToken();
    const r = await fetch(wurl + '/award', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, tournamentId: t.id, categoryId: cat.id, awarded: cat.awarded || {}, players, pairs: cat.format === 'double' ? (DB.settings.pairs || []) : null }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { alert('No se pudieron otorgar los puntos: ' + (d.error || r.status) + '. Probá de nuevo.'); }
  } catch (e) { alert('Error otorgando puntos: ' + (e && e.message || e)); }
  render(); // el live-sync trae el estado confirmado
}

/* ---------------- nav ---------------- */
function go(v) { view = v; closeModal(); closeDrawer(); window.scrollTo(0, 0); render(); }
function toggleDrawer() { const d = $('#drawer'), o = $('#drawerOverlay'); if (!d) return; const open = d.classList.toggle('open'); if (o) o.hidden = !open; }
function closeDrawer() { const d = $('#drawer'), o = $('#drawerOverlay'); if (d) d.classList.remove('open'); if (o) o.hidden = true; }
function toggleRankGroup() { const g = $('#rankGroup'); if (g) g.classList.toggle('collapsed'); }
function toggleNavGroup(el) { const g = el && el.closest('.nav-group'); if (g) g.classList.toggle('collapsed'); }
// Expandir/colapsar una zona en "Partidos en vivo" (muestra sus partidos pendientes). Solo una abierta a la vez.
function toggleLiveZone(el) {
  const wasOpen = el.classList.contains('expanded');
  document.querySelectorAll('.live-row.expanded').forEach(x => x.classList.remove('expanded'));
  if (!wasOpen) el.classList.add('expanded');
}
// Clic fuera de una zona → colapsa la que esté abierta.
document.addEventListener('click', e => { if (!e.target.closest('.live-row.zone')) document.querySelectorAll('.live-row.expanded').forEach(x => x.classList.remove('expanded')); });
document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));
// Accesibilidad: los links de jugador (.plink) son <a> sin href → activarlos con Enter/Espacio por teclado.
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('plink')) { e.preventDefault(); e.target.click(); } });

Object.assign(window, { doLogin, logout, go, playerForm, savePlayer, delPlayer, gymForm, saveGym, delGym, tournamentForm, saveTournament, delTournament, categoriaForm, saveCategoria, delCategoria, enrollModal, saveEnrollSingles, enrollDoubles, addTeam, rmTeam, saveEnrollDoubles, toggleEnroll, selfEnrollModal, saveSelfEnroll, makeGroups, generateBracket, resultModal, saveResult, awardPoints, histToggle, histPick, histFilter, histVs, openPhoto, saveProfile, changePassword, cardCustomizer, setCardTheme, ccNick, saveCardDesign, rankToggle, closeModal, toggleDrawer, closeDrawer, toggleTableSuggestion, togglePayments, toggleMatchTimes, toggleNews, togglePlayerCard, toggleGymView, toggleGymViewAllowed, openGymView, openGymEdit, gymEditToggle, gymAddTable, gymAddProp, gymDel, gymRotate, gymFloorMat, gymFloorColor, toggleGroup, detToggle, brZoom, brZoomReset, toggleNavGroup, toggleDoublesRanking, toggleRankGroup, catFmtChange, noticiaForm, saveNoticia, toggleNoticiaPublish, delNoticia, toggleReglamento, reglamentoForm, saveReglamento, toggleReglamentoPublish, setThemeField, resetTheme, publishTheme, discardTheme, openEmojiPicker, pickEmoji, openTablePopover, assignTableFromPopover, openZonePopover, assignZoneTable, postponeMatch, resumeMatch, noShowModal, applyWalkover, editTablesModal, saveTables, setMatchTable, tournFilter, setAuthMode, doRegister, approvePlayer, rejectPlayer, collaboratorsModal, saveCollaborators, toggleTournamentEnroll, resetEnrollOverride, publishTournament, editTournamentModal, saveTournamentEdit, collabFilter, collabAdd, collabRemove, collabOpen, collabClose, doForgot, toggleCityOther, enrollFilter, resendVerification, recheckVerification, requestPasswordChange, categoryTimeModal, saveCategoryTime, finalizeTournament, reopenTournament, renderCatalog, catalogEntryForm, catRuleTypeChange, saveCatalogEntry, delCatalogEntry, togglePaid, catCostSuggest, setReport, reportFilterPerson, setReportPerson, rpFilter, prUpdateTotal, payReminderSelected, startPaymentMulti, setCtx, syncSchoolOptions, ctxPickOrg, ctxPickSchool, toggleSchoolRanking, setSchoolName, uploadSchoolLogo, toggleLiveZone, setCatTab, togglePw, confirmCreateTournament, startTournament, togglePaymentsAllowed, payAccountForm, savePayAccount, delPayAccount, startPayment, saveMpWorkerUrl });

// Migraciones de datos de ejemplo (puntos, roster, fotos). Las de username solo en modo local.
function runDataMigrations() {
  migrateInitialPoints();
  migrateSeedData();
  migratePointsRedistribute();
  if (!FB()) ensurePlayerUsers();
  DB.players.forEach(syncCategory);
  DB.tournaments.forEach(t => t.categorias.forEach(c => { if (!c.rule) c.rule = catalogRule(c.name); })); // snapshot: la regla se fija al crear, no se re-deriva del catálogo
}

/* ---------------- bootstrap ---------------- */
let _loaded = false;
// Scope para leer `payments` (PII): superadmin todo, admin su escuela, jugador sus pagos. Debe casar
// con la regla de Firestore y con las consultas scopeadas de store.js.
function paymentsScope() {
  const u = currentUser(); if (!u) return null;
  if (u.role === 'superadmin') return { role: 'superadmin' };
  if (u.role === 'admin' && u.schoolId) return { role: 'admin', schoolId: u.schoolId };
  if (u.playerId) return { role: 'player', playerId: u.playerId };
  return null;
}
async function ensureData() {
  if (_loaded || !FB()) return;
  const data = await window.STORE.loadAll(paymentsScope());
  if (data.empty) {
    if (!isAdmin()) return;                 // base vacía y no soy admin → no puedo sembrar (reglas)
    DB = seed(); DB.users = data.users;      // arma datos de ejemplo
    applyMigrations(); runDataMigrations();
    await window.STORE.sync(DB); window.STORE.primeLast(DB);
  } else {
    DB = { players: data.players, gyms: data.gyms, tournaments: data.tournaments, users: data.users, news: data.news || [], payAccounts: data.payAccounts || [], payments: data.payments || [], settings: data.settings || {} };
    // Foto de los campos que la normalización podría completar, ANTES de tocar nada (para detectar qué cambió).
    const rawById = {}; (data.players || []).forEach(p => { rawById[p.id] = { orgId: p.orgId, schoolId: p.schoolId, gender: p.gender, category: p.category, username: p.username, openPoints: p.openPoints }; });
    applyMigrations();
    DB.players.forEach(syncCategory);
    DB.tournaments.forEach(t => t.categorias.forEach(c => { if (!c.rule) c.rule = catalogRule(c.name); })); // snapshot: la regla se fija al crear, no se re-deriva del catálogo
    mergePaymentsIntoEntrants(); // deduce "pagado" de los pagos aprobados (antes de primeLast → no genera escritura)
    window.STORE.primeLast(DB);
    persistNormalization(rawById); // si la normalización completó datos faltantes, guardarlos una vez (solo admin)
  }
  _loaded = true;
}
// Guarda en Firestore las fichas que la normalización completó (orgId/escuela/género/categoría/username),
// para que el dato quede limpio y no dependa de recalcularse en cada carga. Solo escribe lo que el usuario
// actual puede (admin de su escuela / superadmin), y solo lo que realmente cambió → tras la 1ª vez, nada.
function persistNormalization(rawById) {
  if (!FB() || !isAdmin()) return;
  const FIELDS = ['orgId', 'schoolId', 'gender', 'category', 'username', 'openPoints'];
  const changed = (DB.players || []).filter(p => {
    if (!canManagePlayer(p)) return false;            // solo lo que este admin puede escribir
    const raw = rawById[p.id]; if (!raw) return false;
    return FIELDS.some(f => raw[f] !== p[f]);
  });
  if (!changed.length) return;
  changed.forEach(p => { try { window.STORE.setPlayer(p); } catch (e) {} });
  // Índice de username para los jugadores que ya tienen cuenta (login por usuario).
  changed.forEach(p => { if (!p.username) return; const acc = (DB.users || []).find(u => u.playerId === p.id && u.uid); if (acc) { try { window.STORE.setUsername(p.username, { uid: acc.uid, email: acc.email || null }); } catch (e) {} } });
  try { window.STORE.primeLast(DB); } catch (e) {} // baseline al día tras persistir
}
// Re-render por un cambio en vivo, SIN interrumpir al usuario: si hay un modal abierto o está
// escribiendo en un campo, deja el render pendiente y se aplica al cerrar el modal.
function liveRerender() {
  const modal = $('#modal'), ae = document.activeElement;
  const busy = (modal && !modal.hidden) || (ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) || !!_gymDrag;
  if (busy) { _livePending = true; return; }
  _livePending = false; render();
}
// Arranca los listeners de Firestore: cada pantalla se actualiza en vivo cuando cambian los datos
// (propios o de otros dispositivos) y mantiene la "foto" fresca para no pisar cambios ajenos al guardar.
function startLiveSync() {
  if (_liveOn || !FB() || !window.STORE.subscribe) return;
  _liveOn = true;
  window.STORE.subscribe((coll, data) => {
    if (coll === 'settings') { if (data) DB.settings = data; }
    else if (coll === 'users') { DB.users = data; }
    else { DB[coll] = data || []; }
    applyMigrations(); // re-normaliza los datos crudos del snapshot (orgId/escuela/username/ajustes faltantes)
    if (coll === 'players') (DB.players || []).forEach(syncCategory);
    if (coll === 'tournaments') (DB.tournaments || []).forEach(t => (t.categorias || []).forEach(c => { if (!c.rule) c.rule = catalogRule(c.name); }));
    if (coll === 'tournaments' || coll === 'payments') mergePaymentsIntoEntrants();
    try { window.STORE.primeLast(DB); } catch (e) {} // mantiene el baseline del diff-sync al día
    liveRerender();
  }, paymentsScope());
}
async function boot() {
  applyCachedTheme(); // pinta el tema publicado al instante (sirve para el login, antes de autenticar)
  if (!FB()) { // modo local (sin Firebase configurado): comportamiento de siempre
    DB = load(); applyMigrations(); runDataMigrations(); reconcileLocalSession(); save(DB); render(); maybePaymentReminder(); return;
  }
  render(); // login / cargando mientras resuelve la sesión
  // Traer el tema publicado SIN login para pintar la apariencia actual en la pantalla de inicio
  // (no depende del cache por-dispositivo). Requiere la regla de lectura pública de app/settings;
  // si falla o no está, se mantiene lo cacheado sin romper nada.
  if (window.STORE.loadPublicSettings) {
    window.STORE.loadPublicSettings().then(s => {
      if (s && s.theme && !_loaded) { cacheTheme(Object.assign({}, DEFAULT_THEME, s.theme)); applyTheme(); render(); }
    }).catch(() => {});
  }
  window.STORE.onAuth(async (fbUser) => {
    if (window.__registering) return; // el alta maneja su propia sesión/render
    if (fbUser) {
      let ud = await window.STORE.getUserDoc(fbUser.uid);
      _session = ud
        ? { uid: fbUser.uid, email: fbUser.email, role: ud.role || 'player', name: ud.name || fbUser.email, playerId: ud.playerId || null, orgId: ud.orgId || null, schoolId: ud.schoolId || null, emailVerified: !!fbUser.emailVerified }
        : { uid: fbUser.uid, email: fbUser.email, role: 'player', name: fbUser.email, playerId: null, orgId: null, schoolId: null, emailVerified: !!fbUser.emailVerified };
      _ctxOrg = null; _ctxSchool = null;
      // reflejar la verificación en el doc para que el admin la vea en Altas
      if (ud && fbUser.emailVerified && !ud.emailVerified) { try { await window.STORE.setUserDoc(fbUser.uid, { emailVerified: true }); } catch (e) {} }
      _loaded = false; await ensureData();
      // Auto-reparación: cuenta SIN doc users (p. ej. alta por admin que no llegó a crearlo) → la
      // vinculamos a la ficha que coincide por email y creamos el doc + el índice de usuario.
      if (!ud) {
        const em = (fbUser.email || '').toLowerCase();
        const p = em && (DB.players || []).find(x => (x.email || '').toLowerCase() === em);
        if (p) {
          const data = { role: 'player', name: fullName(p), playerId: p.id, email: fbUser.email, emailVerified: !!fbUser.emailVerified, username: p.username || null, orgId: p.orgId || null, schoolId: p.schoolId || null };
          try { await window.STORE.setUserDoc(fbUser.uid, data); } catch (e) {}
          if (p.username) { try { await window.STORE.setUsername(p.username, { uid: fbUser.uid, email: fbUser.email }); } catch (e) {} }
          ud = data;
          _session = { uid: fbUser.uid, email: fbUser.email, role: 'player', name: data.name, playerId: p.id, orgId: p.orgId || null, schoolId: p.schoolId || null, emailVerified: !!fbUser.emailVerified };
        }
      }
      await reconcileFbSession(); // datos viejos: admin global → superadmin; jugador sin escuela → la de su ficha
      // Superadmin: fijar un contexto explícito (primera org/escuela) en vez de depender del fallback
      // silencioso, así toda escritura scopeada (torneo, cuenta de cobro, ajustes) va a un lugar visible
      // en la barra de contexto y no "se cuela" en la primera escuela sin que se note.
      if (isSuperadmin() && !_ctxOrg) { const o = (DB.orgs || [])[0]; if (o) { _ctxOrg = o.id; _ctxSchool = (o.schools && o.schools[0]) ? o.schools[0].id : null; } }
      startLiveSync(); // actualización en vivo entre dispositivos (y mantiene los datos frescos)
    } else { _session = null; }
    _authReady = true;   // recién acá: ya está la sesión resuelta (evita flash de login durante los await)
    render();
    if (fbUser) maybePaymentReminder(); // recordatorio de pago al iniciar sesión / recargar
  });
}
boot();
