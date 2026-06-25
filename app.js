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
function catCatalog() {
  const c = DB.settings && DB.settings.categoryCatalog;
  if (Array.isArray(c) && c.length) return c;
  return CATALOG.map(x => ({ id: 'cc_' + x.name, name: x.name, rule: x.rule, format: 'single', setsFormat: 'all5', groupMin: 3, groupMax: 4, championPoints: 20, cost: 0 }));
}
const catEntryByName = name => catCatalog().find(c => c.name === name) || null;
const catalogRule = name => (catEntryByName(name) || CATALOG.find(c => c.name === name) || {}).rule || { type: 'open' };
// Crea una categoría de torneo heredando las reglas del catálogo global.
function newCategoryFromCatalog(nm) {
  const cc = catEntryByName(nm) || {};
  const setsFormat = cc.setsFormat || 'all5';
  return {
    id: uid('c_'), name: nm, format: cc.format || 'single', rule: cc.rule || catalogRule(nm),
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
    championPoints: 20, entrants: [], groups: null, matches: null, bracket: null, thirdPlace: null, closed: false, ...extra,
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
const DEFAULT_SETTINGS = { tableSuggestion: false, paymentsEnabled: false, matchTimeEstimates: false, news: true, reglamento: false, reglamentoText: '', reglamentoPublished: false, theme: DEFAULT_THEME };
// Borrador de tema mientras el admin edita Apariencia (null = sin cambios pendientes).
// La vista previa usa el borrador; el sitio recién cambia para todos al "Publicar".
let themeDraft = null;
// Aclara/oscurece un color hex (amt en [-1,1]) — usado para derivar --table-dark.
function shadeHex(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim()); if (!m) return hex;
  const n = parseInt(m[1], 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = v => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt);
  r = f(r); g = f(g); b = f(b);
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}
// Tema guardado (el que ve todo el mundo) y tema "en edición" (borrador o guardado).
const savedThemeOf = () => Object.assign({}, DEFAULT_THEME, (DB.settings && DB.settings.theme) || {});
const themeOf = () => Object.assign({}, DEFAULT_THEME, themeDraft || (DB.settings && DB.settings.theme) || {});
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

let DB = { players: [], gyms: [], tournaments: [], users: [], news: [], settings: Object.assign({}, DEFAULT_SETTINGS) };
// Migraciones aditivas (no destructivas) sobre el DB ya cargado en memoria.
function applyMigrations() {
  if (!DB.gyms) DB.gyms = defaultGyms();
  if (!DB.news) DB.news = [];
  if (!DB.settings) DB.settings = {};
  // completa ajustes faltantes sin pisar los ya configurados
  Object.keys(DEFAULT_SETTINGS).forEach(k => { if (DB.settings[k] === undefined) DB.settings[k] = DEFAULT_SETTINGS[k]; });
  DB.settings.theme = Object.assign({}, DEFAULT_THEME, DB.settings.theme || {});
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
const currentUser = () => { if (FB()) return _session; try { return JSON.parse(sessionStorage.getItem('ttuser')); } catch (e) { return null; } };
const setUser = u => { if (FB()) { _session = u; } else if (u) sessionStorage.setItem('ttuser', JSON.stringify(u)); else sessionStorage.removeItem('ttuser'); };
const isAdmin = () => { const u = currentUser(); return u && u.role === 'admin'; };
// Colaborador de un torneo: jugador designado por el admin con permisos de edición sobre ese torneo.
const isCollaboratorOf = t => { const u = currentUser(); return !!(u && u.playerId && t && (t.collaborators || []).includes(u.playerId)); };
const canEditT = t => isAdmin() || isCollaboratorOf(t);          // permisos operativos sobre un torneo
const canEditCat = cat => canEditT(tById(cat && cat._tid));      // idem, a partir de una categoría (usa cat._tid)

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
// ¿La categoría ya arrancó? (se largó al menos una mesa: zona, llave, 3er puesto o partido individual)
function catStarted(cat) {
  if (cat.zoneTable && Object.keys(cat.zoneTable).some(k => cat.zoneTable[k] != null)) return true;
  if (cat.bracket && cat.bracket.some(round => round.some(m => m && m.table != null))) return true;
  if (cat.thirdPlace && cat.thirdPlace.table != null) return true;
  if ((cat.matches || []).some(m => m.table != null)) return true;
  return false;
}
// Popup de recordatorio de pago: se muestra una vez al iniciar sesión o recargar, si el jugador
// tiene inscripciones impagas. Marca las categorías que ya empezaron (primera mesa largada).
let _payReminderDone = false;
function maybePaymentReminder() { if (_payReminderDone) return; _payReminderDone = true; paymentReminder(); }
function paymentReminder() {
  const u = currentUser(), myId = u && u.playerId; if (!myId) return;
  const owed = [];
  (DB.tournaments || []).forEach(t => (t.categorias || []).forEach(c => {
    if (catCost(c) <= 0) return;
    const e = entrantOfPlayer(c, myId); if (!e || e.paid) return;
    owed.push({ tour: t.name, cat: c.name, cost: catCost(c), started: catStarted(c) });
  }));
  if (!owed.length) return;
  owed.sort((a, b) => (b.started ? 1 : 0) - (a.started ? 1 : 0)); // primero las que ya empezaron
  const total = owed.reduce((s, o) => s + o.cost, 0);
  const rows = owed.map(o => `<div class="report-row"><span>${esc(o.cat)} <span class="muted">· ${esc(o.tour)}</span>${o.started ? ' <span class="wo-tag">ya empezó</span>' : ''}</span><span class="pay-tag no">${money(o.cost)}</span></div>`).join('');
  const anyStarted = owed.some(o => o.started);
  openModal(`<h3>💲 Tenés inscripciones sin pagar</h3>
    <p class="muted" style="margin:0 0 12px">Acercate a pagar ${owed.length === 1 ? 'esta inscripción' : 'estas inscripciones'}${anyStarted ? ' — ⚠️ algunas categorías <b>ya empezaron</b>' : ''}:</p>
    <div>${rows}</div>
    <div class="report-row" style="border-top:2px solid var(--line);font-weight:800;margin-top:4px"><span>Total</span><span>${money(total)}</span></div>
    <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn btn-primary" onclick="closeModal()">Entendido</button></div>`);
}
function entName(cat, id) {
  if (id === 'BYE') return 'BYE'; if (!id) return '—';
  const e = entById(cat, id); if (!e) return '—';
  const ns = e.players.map(pid => { const p = playerById(pid); return p ? fullName(p) : '?'; });
  return cat.format === 'double' ? ns.join(' / ') : ns[0];
}
function avatar(p, cls = 'avatar') {
  if (p && p.photo) {
    const clk = p.id ? ` avatar-clk" onclick="event.stopPropagation(); openPhoto('${p.id}')" title="Ver foto` : '';
    return `<span class="${cls}${clk}"><img src="${p.photo}" alt=""/></span>`;
  }
  return `<span class="${cls}">${esc(initials(p || { firstName: '?', lastName: '' })).toUpperCase()}</span>`;
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
let reportTid = '', reportMode = 'cat', reportCat = '', reportPerson = ''; // estado de la sección Reportes
let profileNote = ''; // aviso transitorio en Perfil
let rankOpen = new Set(['1ra']); // qué categorías del ranking están desplegadas (1ra por defecto)
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
  document.querySelectorAll('.profile-only').forEach(el => el.hidden = !(u && u.playerId)); // Perfil solo para cuentas de jugador
  document.querySelectorAll('.news-only').forEach(el => el.hidden = !(u && DB.settings && DB.settings.news)); // Noticias solo si la feature está activa
  document.querySelectorAll('.reglamento-link').forEach(el => el.hidden = !(u && canSeeReglamento())); // Reglamento: admin siempre; jugador si está activo y publicado
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', view.startsWith(b.dataset.view)));
  const altas = document.querySelector('.nav-btn[data-view="aprobaciones"]'); // badge con cantidad de solicitudes
  if (altas) { const n = DB.players.filter(p => p.pending).length; altas.innerHTML = `🙋 Altas${n ? ` <span class="navcount">${n}</span>` : ''}`; }
  $('#userArea').innerHTML = u ? `<span class="chip ${u.role === 'admin' ? 'admin' : ''}">${u.role === 'admin' ? '🛠️ ' : '🎾 '}${esc(u.name)}</span>
     <button class="btn btn-ghost btn-sm" onclick="logout()">Salir</button>` : '';
  const approved = DB.players.filter(p => !p.pending).length;
  $('#storeInfo').textContent = `${approved} jugadores · ${DB.tournaments.length} torneos`;
}
function render() {
  renderChrome();
  applyTheme();
  const app = $('#app');
  // En modo Firebase, mientras no resolvió el estado de sesión, mostrar "cargando" (evita el flash al login).
  if (FB() && !_authReady) return renderSplash(app);
  if (!currentUser()) return renderLogin(app);
  if (view === 'ranking') return renderRanking(app);
  if (view === 'jugadores') return isAdmin() ? renderPlayers(app) : renderRanking(app);
  if (view === 'gimnasios') return isAdmin() ? renderGyms(app) : renderRanking(app);
  if (view === 'settings') return isAdmin() ? renderSettings(app) : renderRanking(app);
  if (view === 'apariencia') return isAdmin() ? renderAppearance(app) : renderRanking(app);
  if (view === 'categorias') return isAdmin() ? renderCatalog(app) : renderRanking(app);
  if (view === 'reportes') return isAdmin() ? renderReportes(app) : renderRanking(app);
  if (view === 'aprobaciones') return isAdmin() ? renderApprovals(app) : renderRanking(app);
  if (view === 'noticias') return DB.settings.news ? renderNoticias(app) : renderRanking(app);
  if (view === 'reglamento') return canSeeReglamento() ? renderReglamento(app) : renderRanking(app);
  if (view === 'historial') return renderHistory(app);
  if (view === 'perfil') return (currentUser().playerId ? renderProfile(app) : renderRanking(app));
  if (view.startsWith('perfil:')) return renderProfile(app, view.split(':')[1]);
  if (view === 'torneos') return renderTournaments(app);
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

/* ---------- login / registro ---------- */
function renderSplash(app) {
  app.innerHTML = `<div class="login-wrap"><div class="big-logo">🏓</div><p class="page-sub" style="margin-top:10px">Cargando…</p></div>`;
}
function renderLogin(app) {
  if (authMode === 'register') return renderRegister(app);
  if (authMode === 'forgot') return renderForgot(app);
  const fb = FB(), note = loginNote; loginNote = '';
  app.innerHTML = `<div class="login-wrap"><div class="big-logo app-emoji">${esc(effectiveTheme().emoji)}</div><h1>Tenis de Mesa</h1>
    <p class="page-sub">Dina Huapi &amp; Bariloche</p>
    <div class="card" style="text-align:left">
      ${note ? `<div class="banner ok">${esc(note)}</div>` : ''}
      <label>${fb ? 'Email o usuario' : 'Usuario'}</label><input id="lu" type="text" autocomplete="username" placeholder="${fb ? 'tu@email.com o tu usuario' : ''}"/>
      <label>Contraseña</label><input id="lp" type="password" autocomplete="current-password"/>
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
  setUser({ username: f.username, role: f.role, name: f.name, playerId: f.playerId || null }); view = 'ranking'; render(); maybePaymentReminder();
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
      </div>
      <label>${fb ? 'Email' : 'Usuario'}</label><input id="r_user" type="${fb ? 'email' : 'text'}" placeholder="${fb ? 'tu@email.com' : 'con el que vas a ingresar'}"/>
      ${fb ? `<label>Usuario <span class="muted">(opcional, para ingresar sin el email)</span></label><input id="r_username" placeholder="ej: juanperez"/>` : ''}
      <div class="grid2">
        <div><label>Contraseña</label><input id="r_pw1" type="password"/></div>
        <div><label>Repetir contraseña</label><input id="r_pw2" type="password"/></div>
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
  const e = $('#r_err'), fail = msg => { e.hidden = false; e.textContent = msg; };
  const first = $('#r_first').value.trim(), last = $('#r_last').value.trim();
  const cred = $('#r_user').value.trim(), pw1 = $('#r_pw1').value, pw2 = $('#r_pw2').value;
  if (!first || !last) return fail('Nombre y apellido son obligatorios.');
  if (!cred) return fail(FB() ? 'Escribí tu email.' : 'Elegí un nombre de usuario.');
  if (!pw1) return fail('Escribí una contraseña.');
  if (pw1 !== pw2) return fail('Las contraseñas no coinciden.');
  const city = readCityField('r_city');
  if (!city) return fail('Indicá tu localidad.');
  const photo = window.__rphoto ? window.__rphoto() : null;
  const player = { id: uid('p_'), firstName: first, lastName: last, dob: $('#r_dob').value || null, city, points: NEW_PLAYER_POINTS, category: levelFromPoints(NEW_PLAYER_POINTS), photo, pending: true };
  if (FB()) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cred)) return fail('Escribí un email válido (ej: nombre@gmail.com).');
    const uname = ($('#r_username') && $('#r_username').value.trim().toLowerCase()) || '';
    if (uname && !/^[a-z0-9._-]{3,20}$/.test(uname)) return fail('El usuario: 3 a 20 caracteres (letras, números, . _ -).');
    if (uname) { const taken = await window.STORE.lookupUsername(uname); if (taken) return fail('Ese usuario ya está en uso, probá otro.'); }
    window.__registering = true;
    try {
      const c = await window.STORE.signUp(cred, pw1);
      const uidv = c.user.uid;
      await window.STORE.setUserDoc(uidv, { role: 'player', name: fullName(player), playerId: player.id, email: cred, emailVerified: false, username: uname || null });
      await window.STORE.setPlayer(player);
      if (uname) { try { await window.STORE.setUsername(uname, { uid: uidv, email: cred }); } catch (e) {} }
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
  if ((DB.users || []).some(u => (u.username || '').toLowerCase() === user)) return fail('Ese usuario ya existe, probá con otro.');
  DB.players.push(player);
  DB.users.push({ username: user, password: pw1, role: 'player', name: fullName(player), playerId: player.id });
  save(DB);
  setUser({ username: user, role: 'player', name: fullName(player), playerId: player.id });
  authMode = 'login'; view = 'perfil'; render();
}
function logout() { _payReminderDone = false; authMode = 'login'; view = 'ranking'; if (FB()) { window.STORE.signOut(); } else { setUser(null); render(); } }

/* ---------- ranking ---------- */
function renderRanking(app) {
  let html = `<div class="page-title"><h1>🏆 Ranking</h1></div><p class="page-sub">Tocá una categoría para ver u ocultar su ranking.</p><div class="rank-tiles">`;
  CATS.forEach(cat => {
    const open = rankOpen.has(cat);
    const list = DB.players.filter(p => p.category === cat && !p.pending).sort((a, b) => b.points - a.points);
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
        <div class="meta"><div class="name"><a class="plink" onclick="go('perfil:${p.id}')">${esc(fullName(p))}</a></div><div class="sub">📍 ${esc(p.city)}${ageFromDob(p.dob) != null ? ` · ${ageFromDob(p.dob)} años` : ''}</div></div>
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
      ? `<div class="hist-summary"><b>${esc(fullName(a))}</b> ${aw} — ${bw} <b>${esc(fullName(b))}</b> <span class="muted">(${rows.length} partido${rows.length > 1 ? 's' : ''})</span></div>` +
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

/* ---------- perfil (jugador) ---------- */
// Vista de solo lectura del perfil de OTRO jugador (cualquiera puede verla).
function renderPlayerProfileView(app, p) {
  const me = currentUser() && currentUser().playerId;
  const canHist = me && me !== p.id; // si sos jugador y no es tu propio perfil
  app.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="go('ranking')">← Volver</button>
    <div class="page-title" style="margin-top:12px"><h1>👤 Perfil</h1></div>
    <div class="card" style="max-width:560px">
      <div class="row" style="gap:16px;align-items:center">${avatar(p, 'avatar')}
        <div><div style="font-weight:800;font-size:18px">${esc(fullName(p))}</div>
        <div class="muted">${p.category} · ${p.points} pts · 📍 ${esc(p.city)}${ageFromDob(p.dob) != null ? ` · ${ageFromDob(p.dob)} años` : ''}</div></div></div>
      <div class="row" style="margin-top:16px;gap:10px;flex-wrap:wrap">
        ${canHist ? `<button class="btn btn-primary" onclick="histVs('${p.id}')">📊 Ver historial contra este jugador</button>` : ''}
        ${isAdmin() ? `<button class="btn btn-ghost" onclick="playerForm('${p.id}')">✏️ Editar</button>` : ''}
      </div>
    </div>`;
}
function renderProfile(app, viewId) {
  const u = currentUser();
  const ownId = u && u.playerId;
  const pid = viewId || ownId;
  const p = pid ? playerById(pid) : null;
  if (!p) { app.innerHTML = '<div class="empty">Perfil no disponible.</div>'; return; }
  if (pid !== ownId) return renderPlayerProfileView(app, p); // perfil de otro → solo lectura (admin edita con ✏️)
  const note = profileNote; profileNote = '';
  app.innerHTML = `<div class="page-title"><h1>👤 Mi perfil</h1></div>
    <p class="page-sub">Editá tus datos personales, tu foto y tu contraseña.</p>
    ${p.pending ? `<div class="banner" style="max-width:560px">⏳ <b>Tu cuenta está pendiente de aprobación.</b> Cuando el admin te apruebe vas a aparecer en el ranking y vas a poder anotarte a los torneos.</div>` : ''}
    ${(FB() && u.emailVerified === false) ? `<div class="banner" style="max-width:560px">📧 <b>Verificá tu email.</b> Te mandamos un link a ${esc(u.email)} (revisá spam).
      <div class="row" style="margin-top:8px"><button class="btn btn-ghost btn-sm" onclick="resendVerification()">Reenviar email</button>
      <button class="btn btn-ghost btn-sm" onclick="recheckVerification()">Ya verifiqué ✓</button></div></div>` : ''}
    ${note ? `<div class="banner ok" style="max-width:560px">${esc(note)}</div>` : ''}
    <div class="card" style="max-width:560px">
      <div class="row" style="gap:16px;margin-bottom:8px">${avatar(p, 'avatar')}
        <div><div style="font-weight:800;font-size:18px">${esc(fullName(p))}</div>
        <div class="muted">${p.category} · ${p.points} pts · 👤 ${esc(u.email || u.username || '')}</div></div></div>
      <div class="grid2">
        <div><label>Nombre</label><input id="pf_first" value="${esc(p.firstName)}"/></div>
        <div><label>Apellido</label><input id="pf_last" value="${esc(p.lastName)}"/></div>
        <div><label>Localidad</label>${cityFieldHtml('pf_city', p.city)}</div>
        <div><label>Fecha de nacimiento</label><input id="pf_dob" type="date" value="${p.dob || ''}"/></div>
      </div>
      <label>Foto</label>${photoButtonsHtml('pf_photo')}
      <div id="pf_err" class="banner" hidden></div>
      <div class="row" style="margin-top:14px"><button class="btn btn-primary" onclick="saveProfile()">Guardar cambios</button></div>
    </div>
    <div class="card" style="max-width:560px;margin-top:16px">
      <h3 style="margin:0 0 6px">🔒 Cambiar contraseña</h3>
      ${FB()
        ? `<p class="hint" style="margin-top:0">Te enviamos un email a <b>${esc(u.email)}</b> con un link seguro para cambiarla. Cuando la cambies, ese mismo mail te queda como comprobante.</p>
           <div id="pf_pwerr" class="banner" hidden></div>
           <div class="row" style="margin-top:6px"><button class="btn btn-primary" onclick="requestPasswordChange()">📧 Enviar email para cambiar contraseña</button></div>`
        : `<p class="hint" style="margin-top:0">Escribí la nueva contraseña dos veces (sin requisitos).</p>
           <label>Nueva contraseña</label><input id="pf_pw1" type="password"/>
           <label>Repetir contraseña</label><input id="pf_pw2" type="password"/>
           <div id="pf_pwerr" class="banner" hidden></div>
           <div class="row" style="margin-top:14px"><button class="btn btn-primary" onclick="changePassword()">Cambiar contraseña</button></div>`}
    </div>`;
  let photo = p.photo; wirePhoto('pf_photo', d => { photo = d; });
  window.__pfphoto = () => photo;
}
function saveProfile() {
  const u = currentUser(), p = playerById(u.playerId), e = $('#pf_err');
  const first = $('#pf_first').value.trim(), last = $('#pf_last').value.trim();
  if (!first || !last) { e.hidden = false; e.textContent = 'Nombre y apellido obligatorios.'; return; }
  p.firstName = first; p.lastName = last; p.city = readCityField('pf_city') || p.city; p.dob = $('#pf_dob').value || null;
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
  const active = DB.players.filter(p => !p.pending);
  const rows = active.slice().sort((a, b) => fullName(a).localeCompare(fullName(b))).map(p => { const u = (DB.users || []).find(x => x.playerId === p.id); return `<div class="player-row">${avatar(p)}
    <div class="meta"><div class="name">${esc(fullName(p))}</div><div class="sub">📍 ${esc(p.city)}${ageFromDob(p.dob) != null ? ` · ${ageFromDob(p.dob)} años` : ''}${(u && (u.username || u.email)) ? ` · 👤 ${esc(u.username || u.email)}` : (p.email ? ` · 📧 ${esc(p.email)}` : '')}</div></div>
    <span class="cat-badge ${catClass(p.category)}" style="height:28px;min-width:28px">${p.category}</span>
    <div class="pts">${p.points}<small> pts</small></div>
    <button class="btn btn-ghost btn-sm" onclick="playerForm('${p.id}')">✏️</button>
    <button class="btn btn-ghost btn-sm" onclick="delPlayer('${p.id}')">🗑️</button></div>`; }).join('');
  const pend = DB.players.filter(p => p.pending).length;
  app.innerHTML = `<div class="section-head"><div class="page-title"><h1>👥 Jugadores</h1></div>
    <button class="btn btn-primary" onclick="playerForm()">➕ Inscribir jugador</button></div>
    <p class="page-sub">${active.length} jugadores.${pend ? ` · <a class="maplink" onclick="go('aprobaciones')">🙋 ${pend} solicitud${pend > 1 ? 'es' : ''} de alta pendiente${pend > 1 ? 's' : ''}</a>` : ''}</p>${rows || '<div class="empty">Sin jugadores.</div>'}`;
}
function playerForm(id) {
  const p = id ? playerById(id) : { firstName: '', lastName: '', dob: '', city: CITIES[0], category: '4ta', points: NEW_PLAYER_POINTS, photo: null };
  const acc = id ? (DB.users || []).find(x => x.playerId === id) : null;
  const curEmail = (acc && acc.email) || p.email || '';
  const hasLogin = !!(acc && acc.uid);   // tiene cuenta de acceso (Firebase): el email se gestiona desde su cuenta
  openModal(`<h3>${id ? 'Editar' : 'Inscribir'} jugador</h3>
    <div class="row" style="margin:12px 0">${avatar(p)}<span class="muted">${id ? esc(fullName(p)) : 'Nuevo'}</span></div>
    <div class="grid2">
      <div><label>Nombre</label><input id="f_first" value="${esc(p.firstName)}"/></div>
      <div><label>Apellido</label><input id="f_last" value="${esc(p.lastName)}"/></div>
      <div><label>Localidad</label>${cityFieldHtml('f_city', p.city)}</div>
      <div><label>Puntos</label><input id="f_pts" type="number" min="0" value="${p.points}"/></div>
      <div><label>Fecha de nacimiento</label><input id="f_dob" type="date" value="${p.dob || ''}"/></div>
    </div>
    <label>Email <span class="muted">(opcional)</span></label>
    <input id="f_email" type="email" value="${esc(curEmail)}" placeholder="tu@email.com" ${hasLogin ? 'disabled' : ''}/>
    ${hasLogin ? `<p class="hint" style="margin-top:4px">El email de acceso lo cambia el jugador desde su cuenta.</p>` : ''}
    <p class="hint">Categoría: <b>${levelFromPoints(p.points)}</b> — se calcula por puntos (>800 1ra · >600 2da · >300 3ra · resto 4ta). Nuevos arrancan con ${NEW_PLAYER_POINTS}.${id && ageFromDob(p.dob) != null ? ` · Edad: <b>${ageFromDob(p.dob)} años</b>` : ''}</p>
    <label>Foto</label>${photoButtonsHtml('f_photo')}
    <div id="ferr" class="banner" hidden></div>
    <div class="row spread" style="margin-top:18px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="savePlayer('${id || ''}')">Guardar</button></div>`);
  let photo = p.photo; wirePhoto('f_photo', d => { photo = d; });
  window.__photo = () => photo;
}
function savePlayer(id) {
  const first = $('#f_first').value.trim(), last = $('#f_last').value.trim();
  if (!first || !last) { const e = $('#ferr'); e.hidden = false; e.textContent = 'Nombre y apellido obligatorios.'; return; }
  const emailInp = $('#f_email');
  const data = { firstName: first, lastName: last, dob: $('#f_dob').value || null, city: readCityField('f_city'), points: parseInt($('#f_pts').value, 10) || 0, photo: window.__photo ? window.__photo() : null };
  if (emailInp && !emailInp.disabled) data.email = (emailInp.value || '').trim() || null; // email editable solo si no tiene cuenta de acceso
  if (emailInp && !emailInp.disabled && data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) { const e = $('#ferr'); e.hidden = false; e.textContent = 'El email no es válido (ej: nombre@gmail.com).'; return; }
  let target;
  if (id) { target = Object.assign(playerById(id), data); } else { target = { id: uid('p_'), ...data }; DB.players.push(target); }
  syncCategory(target);  // categoría derivada de los puntos
  if (!FB()) ensurePlayerUsers();   // en modo local: crea la cuenta del nuevo jugador (user = inicial+apellido)
  save(DB); closeModal(); render();
}
// Borra el doc de cuenta (users) en Firestore. La cuenta de Auth queda huérfana (se borra desde la consola).
function dropUserDoc(playerId) {
  const acc = (DB.users || []).find(u => u.playerId === playerId);
  DB.users = (DB.users || []).filter(u => u.playerId !== playerId);
  if (FB() && acc) { if (acc.uid) window.STORE.delUserDoc(acc.uid); if (acc.username) window.STORE.delUsername(acc.username); }
}
function delPlayer(id) {
  const p = playerById(id); if (!p || !confirm(`¿Eliminar a ${fullName(p)}?`)) return;
  DB.players = DB.players.filter(x => x.id !== id);
  dropUserDoc(id);
  DB.tournaments.forEach(t => t.categorias.forEach(c => { c.entrants = c.entrants.filter(e => !e.players.includes(id)); c.groups = null; c.matches = null; c.bracket = null; c.thirdPlace = null; }));
  save(DB); render();
}

/* ---------- altas / aprobaciones (admin) ---------- */
// Jugadores que se autorregistraron y esperan aprobación del admin.
function renderApprovals(app) {
  const pend = DB.players.filter(p => p.pending).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  const rows = pend.map(p => { const u = (DB.users || []).find(x => x.playerId === p.id); return `<div class="player-row">${avatar(p)}
    <div class="meta"><div class="name">${esc(fullName(p))}</div><div class="sub">📍 ${esc(p.city)}${ageFromDob(p.dob) != null ? ` · ${ageFromDob(p.dob)} años` : ''}${u ? ` · 👤 ${esc(u.username || u.email || '')}` : ''}${u && FB() ? (u.emailVerified ? ' · ✅ email verificado' : ' · ✉️ sin verificar') : ''}</div></div>
    <label class="ap-pts">Puntaje inicial<input id="ap_${p.id}" type="number" min="0" value="${p.points}"/></label>
    <button class="btn btn-primary btn-sm" onclick="approvePlayer('${p.id}')">✅ Aprobar</button>
    <button class="btn btn-ghost btn-sm" onclick="rejectPlayer('${p.id}')">🗑️ Rechazar</button></div>`; }).join('');
  app.innerHTML = `<div class="page-title"><h1>🙋 Altas de jugadores</h1></div>
    <p class="page-sub">Jugadores que se registraron por su cuenta y esperan tu aprobación. Ajustá el <b>puntaje inicial</b> según su nivel antes de aprobar (la categoría se calcula sola).</p>
    ${rows || '<div class="empty">No hay solicitudes pendientes. 🎉</div>'}`;
}
function approvePlayer(id) {
  const p = playerById(id); if (!p) return;
  const inp = document.querySelector('#ap_' + id);
  if (inp) { const v = parseInt(inp.value, 10); if (!isNaN(v) && v >= 0) p.points = v; }
  delete p.pending; syncCategory(p); save(DB); render();
}
function rejectPlayer(id) {
  const p = playerById(id); if (!p || !confirm(`¿Rechazar la solicitud de ${fullName(p)}? Se elimina el jugador y su cuenta.`)) return;
  DB.players = DB.players.filter(x => x.id !== id);
  dropUserDoc(id);
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

/* ---------- catálogo global de categorías (admin) ----------
   Define qué categorías existen y sus reglas por defecto (inscripción, formato, sets por fase,
   grupos, valor 🏆). Cuando se arma un torneo, las categorías heredan estas reglas. Solo admin. */
function renderCatalog(app) {
  const cards = catCatalog().map(c => `<div class="card">
    <div class="gym-head"><span class="gym-ico">🗂️</span>
      <div class="meta"><div class="name">${esc(c.name)}</div>
        <div class="sub">${c.format === 'double' ? '👥 Dobles' : '👤 Singles'} · 📋 ${ruleLabel(c.rule)}</div></div></div>
    <div class="tags" style="margin-top:10px">
      <span class="tag">🎾 ${setsFmtById(c.setsFormat).label}</span>
      <span class="tag">Grupos ${c.groupMin}–${c.groupMax}</span>
      <span class="tag">🥇 ${c.championPoints} pts</span>
      <span class="tag">💲 ${c.cost ? money(c.cost) : 'sin costo'}</span></div>
    <div class="row" style="margin-top:12px">
      <button class="btn btn-ghost btn-sm" onclick="catalogEntryForm('${c.id}')">✏️ Editar</button>
      <button class="btn btn-ghost btn-sm" onclick="delCatalogEntry('${c.id}')">🗑️</button>
    </div></div>`).join('');
  app.innerHTML = `<div class="section-head"><div class="page-title"><h1>🗂️ Categorías</h1></div>
    <button class="btn btn-primary" onclick="catalogEntryForm()">➕ Nueva categoría</button></div>
    <p class="page-sub">Catálogo de categorías del club y sus reglas por defecto. Al crear un torneo, las categorías que marques <b>heredan</b> estas reglas (después podés ajustarlas dentro de cada torneo). Solo el administrador puede gestionarlo.</p>
    <div class="cards gym-cards">${cards || '<div class="empty">Sin categorías en el catálogo.</div>'}</div>`;
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
      <div><label>Formato</label><select id="cc_fmt"><option value="single" ${sel((c && c.format) || 'single', 'single')}>Singles 👤</option><option value="double" ${sel((c && c.format), 'double')}>Dobles 👥</option></select></div>
      <div><label>Sets por fase</label><select id="cc_setsfmt">${setsOpts}</select></div>
      <div><label>Mín por grupo</label><input id="cc_min" type="number" min="2" value="${c ? c.groupMin : 3}"/></div>
      <div><label>Máx por grupo</label><input id="cc_max" type="number" min="2" value="${c ? c.groupMax : 4}"/></div>
      <div><label>Valor del torneo 🏆 (máx 20)</label><input id="cc_pts" type="number" min="0" max="20" value="${c ? c.championPoints : 20}"/></div>
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
function saveCatalogEntry(id) {
  const e = $('#ccerr'), name = $('#cc_name').value.trim();
  if (!name) { e.hidden = false; e.textContent = 'El nombre es obligatorio.'; return; }
  const list = (DB.settings.categoryCatalog && DB.settings.categoryCatalog.length) ? DB.settings.categoryCatalog : (DB.settings.categoryCatalog = catCatalog().map(x => Object.assign({}, x)));
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
  const min = parseInt($('#cc_min').value, 10) || 3, max = parseInt($('#cc_max').value, 10) || 4;
  if (min > max) { e.hidden = false; e.textContent = 'Mín por grupo no puede ser mayor que máx.'; return; }
  const entry = { name, rule, format: $('#cc_fmt').value, setsFormat: $('#cc_setsfmt').value, groupMin: min, groupMax: max, championPoints: Math.min(20, Math.max(0, parseInt($('#cc_pts').value, 10) || 0)), cost: Math.max(0, parseInt($('#cc_cost').value, 10) || 0) };
  if (id) { const cur = list.find(x => x.id === id); if (cur) Object.assign(cur, entry); }
  else list.push(Object.assign({ id: uid('cc_') }, entry));
  save(DB); closeModal(); render();
}
function delCatalogEntry(id) {
  const list = (DB.settings.categoryCatalog && DB.settings.categoryCatalog.length) ? DB.settings.categoryCatalog : (DB.settings.categoryCatalog = catCatalog().map(x => Object.assign({}, x)));
  const c = list.find(x => x.id === id); if (!c) return;
  if (!confirm(`¿Quitar "${c.name}" del catálogo? Los torneos ya creados no se modifican.`)) return;
  DB.settings.categoryCatalog = list.filter(x => x.id !== id);
  save(DB); render();
}

/* ---------- reportes (admin): pagos de inscripción pendientes ---------- */
function setReport(field, val) { if (field === 'tid') { reportTid = val; reportCat = ''; } else if (field === 'mode') reportMode = val; else if (field === 'cat') reportCat = val; render(); }
function reportFilterPerson(inp) { const q = inp.value.toLowerCase(); document.querySelectorAll('.report-row[data-name], .report-person[data-name]').forEach(el => { el.style.display = el.dataset.name.includes(q) ? '' : 'none'; }); }
function renderReportes(app) {
  const tours = DB.tournaments.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const tOpts = `<option value="">— Elegí un torneo —</option>` + tours.map(t => `<option value="${t.id}" ${reportTid === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  let html = `<div class="page-title"><h1>📋 Reportes</h1></div>
    <p class="page-sub">Pagos de inscripción pendientes por torneo. Agrupá por categoría o por persona y filtrá.</p>
    <div class="card" style="max-width:680px">
      <label>Torneo</label><select onchange="setReport('tid', this.value)">${tOpts}</select>`;
  const t = reportTid ? tById(reportTid) : null;
  if (t) {
    const allCats = t.categorias.filter(c => catCost(c) > 0);
    const catOpts = `<option value="">Todas las categorías</option>` + allCats.map(c => `<option value="${c.id}" ${reportCat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    html += `<div class="grid2" style="margin-top:10px">
        <div><label>Agrupar por</label><select onchange="setReport('mode', this.value)"><option value="cat" ${reportMode === 'cat' ? 'selected' : ''}>Categoría</option><option value="persona" ${reportMode === 'persona' ? 'selected' : ''}>Persona</option></select></div>
        <div><label>Categoría</label><select onchange="setReport('cat', this.value)">${catOpts}</select></div>
      </div>
      <label>Buscar persona</label><input class="report-search" placeholder="🔍 Filtrar por nombre…" oninput="reportFilterPerson(this)"/>`;
  }
  html += `</div>`;
  if (!t) { app.innerHTML = html + `<div class="empty" style="margin-top:16px">Elegí un torneo para ver el reporte.</div>`; return; }

  const cats = t.categorias.filter(c => catCost(c) > 0 && (!reportCat || c.id === reportCat));
  if (!cats.length) { app.innerHTML = html + `<div class="empty" style="margin-top:16px">No hay categorías con costo de inscripción${reportCat ? ' para ese filtro' : ' en este torneo'}.</div>`; return; }

  let grand = 0; cats.forEach(c => { grand += c.entrants.filter(e => !e.paid).length * catCost(c); });
  html += `<div class="report-total">Pendiente total del torneo: <b>${money(grand)}</b></div>`;

  if (reportMode === 'cat') {
    html += cats.map(c => {
      const unpaid = c.entrants.filter(e => !e.paid).slice().sort((a, b) => entName(c, a.id).localeCompare(entName(c, b.id)));
      const rows = unpaid.length
        ? unpaid.map(e => `<div class="report-row" data-name="${esc(entName(c, e.id)).toLowerCase()}"><span>${esc(entName(c, e.id))}</span><span class="pay-tag no">${money(catCost(c))}</span></div>`).join('')
        : `<div class="report-row"><span class="muted">Todos pagaron ✅</span></div>`;
      return `<div class="card" style="margin-top:14px"><div class="row spread"><h3 style="margin:0">${esc(c.name)}</h3>
        <span class="muted">${money(catCost(c))} c/u · pendiente ${money(unpaid.length * catCost(c))}</span></div>
        <div style="margin-top:10px">${rows}</div></div>`;
    }).join('');
  } else {
    const map = {};
    cats.forEach(c => c.entrants.filter(e => !e.paid).forEach(e => e.players.forEach(pid => {
      const p = playerById(pid); if (!p) return;
      (map[pid] = map[pid] || { name: fullName(p), items: [], total: 0 });
      map[pid].items.push({ cat: c.name + (c.format === 'double' ? ' (dobles)' : ''), cost: catCost(c) });
      map[pid].total += catCost(c);
    })));
    const people = Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
    html += people.length
      ? people.map(pe => `<div class="card report-person" data-name="${esc(pe.name).toLowerCase()}" style="margin-top:14px">
          <div class="row spread"><h3 style="margin:0">${esc(pe.name)}</h3><span class="pay-tag no">${money(pe.total)}</span></div>
          <div style="margin-top:8px">${pe.items.map(it => `<div class="report-row"><span>${esc(it.cat)}</span><span class="muted">${money(it.cost)}</span></div>`).join('')}</div></div>`).join('')
      : `<div class="empty" style="margin-top:14px">Nadie tiene pagos pendientes 🎉</div>`;
  }
  app.innerHTML = html;
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
function renderSettings(app) {
  const s = DB.settings || (DB.settings = Object.assign({}, DEFAULT_SETTINGS));
  app.innerHTML = `<div class="page-title"><h1>⚙️ Ajustes</h1></div>
    <p class="page-sub">Configuración general del club. Solo el administrador puede verla y cambiarla.</p>
    <div class="card" style="max-width:620px">
      ${settingRow('🏓 Sugerencia de mesas',
        'Sugerir automáticamente en qué mesa se debería jugar cada partido. <b>Próximamente</b> — por ahora solo se puede activar o desactivar.',
        s.tableSuggestion, 'toggleTableSuggestion')}
      ${settingRow('💳 Pagos para inscripciones',
        'Permitir cobrar la inscripción a los torneos al anotarse. <b>Próximamente</b> — el interruptor todavía no tiene efecto.',
        s.paymentsEnabled, 'togglePayments')}
      ${settingRow('🕒 Horarios estimados de partidos',
        'Calcular y mostrar un horario aproximado para cada partido del torneo. <b>Próximamente</b> — el interruptor todavía no tiene efecto.',
        s.matchTimeEstimates, 'toggleMatchTimes')}
      ${settingRow('📰 Noticias',
        'Habilitar la sección de Noticias del club. Si la apagás, desaparece del menú para todos.',
        s.news, 'toggleNews')}
      ${settingRow('📜 Reglamento',
        'Habilitar el Reglamento del club para los jugadores. Si lo apagás, no lo ven (vos podés editarlo siempre). Además tiene que estar publicado.',
        s.reglamento, 'toggleReglamento')}
    </div>`;
}
// Alterna un ajuste booleano de DB.settings y vuelve a renderizar.
function toggleSetting(key) {
  if (!DB.settings) DB.settings = Object.assign({}, DEFAULT_SETTINGS);
  DB.settings[key] = !DB.settings[key];
  save(DB); render();
}
function toggleTableSuggestion() { toggleSetting('tableSuggestion'); }
function togglePayments() { toggleSetting('paymentsEnabled'); }
function toggleMatchTimes() { toggleSetting('matchTimeEstimates'); }
function toggleNews() { toggleSetting('news'); }
function toggleReglamento() { toggleSetting('reglamento'); }

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
function canSeeReglamento() { const s = DB.settings || {}; return isAdmin() || (!!s.reglamento && !!s.reglamentoPublished); }
function renderReglamento(app) {
  const admin = isAdmin(), s = DB.settings || (DB.settings = Object.assign({}, DEFAULT_SETTINGS));
  const text = (s.reglamentoText || '').trim(), pub = !!s.reglamentoPublished;
  const head = `<div class="section-head"><div class="page-title"><h1>📜 Reglamento</h1></div>
    ${admin ? `<button class="btn btn-primary" onclick="reglamentoForm()">✏️ Editar</button>` : ''}</div>`;
  let adminBar = '';
  if (admin) {
    const visible = s.reglamento && pub;
    adminBar = `<div class="card" style="margin-bottom:14px">
      <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center">
        <span class="t-badge ${pub ? 'live' : 'draft'}">${pub ? '🟢 Publicado' : '📝 Borrador'}</span>
        <button class="btn btn-ghost btn-sm" onclick="toggleReglamentoPublish()">${pub ? '🙈 Despublicar' : '🚀 Publicar'}</button>
      </div>
      <p class="page-sub" style="margin:10px 0 0">${visible
        ? '✅ Los jugadores pueden verlo.'
        : `⚠️ Los jugadores <b>no</b> lo ven: ${!s.reglamento ? 'activá “Reglamento” en Ajustes' : 'está sin publicar'}.`}</p>
    </div>`;
  }
  const content = text
    ? `<div class="card"><div class="news-body">${newsBodyHtml(text)}</div></div>`
    : `<div class="empty">${admin ? 'Todavía no cargaste el reglamento. Tocá «Editar» para escribirlo.' : 'El reglamento todavía no está disponible.'}</div>`;
  app.innerHTML = head + adminBar + content;
}
function reglamentoForm() {
  const s = DB.settings || (DB.settings = Object.assign({}, DEFAULT_SETTINGS));
  openModal(`<h3>Editar reglamento</h3>
    <label>Texto del reglamento</label>
    <textarea id="rg_body" rows="14" placeholder="Escribí el reglamento del club…">${esc(s.reglamentoText || '')}</textarea>
    <label class="chkline"><input type="checkbox" id="rg_pub" ${s.reglamentoPublished ? 'checked' : ''}/> Publicado (visible para los jugadores)</label>
    <div class="row spread" style="margin-top:16px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveReglamento()">Guardar</button></div>`);
}
function saveReglamento() {
  if (!DB.settings) DB.settings = Object.assign({}, DEFAULT_SETTINGS);
  DB.settings.reglamentoText = $('#rg_body').value;
  DB.settings.reglamentoPublished = $('#rg_pub').checked;
  save(DB); closeModal(); render();
}
function toggleReglamentoPublish() {
  if (!DB.settings) DB.settings = Object.assign({}, DEFAULT_SETTINGS);
  DB.settings.reglamentoPublished = !DB.settings.reglamentoPublished;
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
  app.innerHTML = `<div class="page-title"><h1>🎨 Apariencia</h1></div>
    <p class="page-sub">Previsualizá los cambios acá. El sitio recién cambia para todos cuando tocás <b>Publicar cambios</b>.</p>
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
let themeMsg = ''; // aviso transitorio en Apariencia (ej. tras publicar)
function ensureTheme() { if (!DB.settings) DB.settings = Object.assign({}, DEFAULT_SETTINGS); if (!DB.settings.theme) DB.settings.theme = Object.assign({}, DEFAULT_THEME); }
// Actualiza la nota de cambios y habilita/inhabilita Publicar/Descartar sin re-renderizar todo.
function updateThemeDirtyUI() {
  const dirty = themeDirty(), note = $('#themeDirtyNote');
  if (note) { note.textContent = dirty ? '● Cambios sin publicar' : 'Sin cambios pendientes'; note.classList.toggle('on', dirty); }
  ['#btnPublishTheme', '#btnDiscardTheme'].forEach(s => { const b = $(s); if (b) b.disabled = !dirty; });
}
function setThemeField(key, val) {
  if (!themeDraft) themeDraft = Object.assign({}, savedThemeOf());
  themeDraft[key] = (key === 'emoji') ? (String(val || '').trim().slice(0, 8) || DEFAULT_THEME.emoji) : val;
  applyTheme(); updateThemeDirtyUI();
}
function resetTheme() { themeDraft = Object.assign({}, DEFAULT_THEME); render(); } // carga los valores de fábrica en el borrador
function discardTheme() { themeDraft = null; render(); }                          // descarta el borrador y vuelve a lo guardado
function publishTheme() {
  if (!themeDirty()) return;
  ensureTheme();
  DB.settings.theme = Object.assign({}, themeOf());
  themeDraft = null; save(DB);
  themeMsg = '✅ Cambios publicados. Ya los ve todo el club.';
  render();
}
// Selector de emojis anclado al botón (reutiliza el popover de mesas).
function openEmojiPicker(ev) {
  ev.stopPropagation();
  const cells = EMOJIS.map(e => `<button type="button" class="emoji-opt" onclick="pickEmoji('${e}')">${e}</button>`).join('');
  showPopover(ev.currentTarget, `<h4>Elegí un emoji</h4><div class="emoji-grid">${cells}</div>`);
}
function pickEmoji(e) {
  const inp = $('#themeEmoji'); if (inp) inp.value = e;
  setThemeField('emoji', e);
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
      const pend = (cat.matches || []).filter(m => m.g === gi && !m.postponed && !matchDone(m, cat)).length;
      if (pend) out.push({ table: tbl, catName: cat.name, label: 'Zona ' + String.fromCharCode(65 + gi), sub: `${pend} partido${pend === 1 ? '' : 's'} pendiente${pend === 1 ? '' : 's'}` });
    });
    catMatchList(cat).forEach(({ a, b, m, phase }) => {
      if (isZoneMatch(m)) return; // ya contabilizado por su zona
      if (m.table == null || matchDone(m, cat)) return;
      out.push({ table: m.table, catName: cat.name, label: `${entName(cat, a)} vs ${entName(cat, b)}`, sub: m.postponed ? phase + ' (aplazado)' : phase });
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
function upcomingCardHtml(t) {
  const live = isLiveTournament(t), gym = gymById(t.gymId), pod = podiumHtml(t), draft = !t.published;
  return `<div class="card tourn-card${draft ? ' tourn-draft' : live ? ' tourn-live' : ''}">
    ${(draft || live) ? `<div class="t-badges">${draft ? '<span class="t-badge draft">📝 Borrador</span>' : ''}${live ? '<span class="t-badge live">🔴 En vivo</span>' : ''}</div>` : ''}
    <h3 style="margin:0">${esc(t.name)}</h3>
    <div class="when">📅 ${dateRangeLabel(t)}</div>
    ${gym ? `<div class="when">📍 ${esc(gym.name)}</div>` : ''}
    <div class="tags"><span class="tag">${t.categorias.length} categoría(s)</span>${live ? `<span class="tag tag-live">${liveMatchesOf(t).length} en juego</span>` : ''}</div>
    ${pod}
    <div class="row" style="margin-top:14px"><button class="btn btn-accent btn-sm" onclick="go('torneo:${t.id}')">👁️ ${draft ? 'Editar' : 'Ver'}</button>
      ${draft && isAdmin() ? `<button class="btn btn-primary btn-sm" onclick="publishTournament('${t.id}')">🚀 Publicar</button>` : ''}
      ${isAdmin() ? `<button class="btn btn-ghost btn-sm" onclick="delTournament('${t.id}')">🗑️</button>` : ''}</div></div>`;
}
function pastCardHtml(t) {
  const gym = gymById(t.gymId), pod = podiumHtml(t);
  const search = esc(`${t.name} ${gym ? gym.name : ''} ${dateRangeLabel(t)}`.toLowerCase());
  return `<div class="card tourn-card-h tourn-old-card" data-search="${search}">
    <div class="th-main"><h3 style="margin:0">${esc(t.name)}</h3>
      <div class="when">📅 ${dateRangeLabel(t)}${gym ? ` · 📍 ${esc(gym.name)}` : ''}</div>
      <div class="tags"><span class="tag">${t.categorias.length} categoría(s)</span></div></div>
    <div class="th-podium">${pod || '<span class="muted">Sin resultados cargados</span>'}</div>
    <div class="th-actions"><button class="btn btn-accent btn-sm" onclick="go('torneo:${t.id}')">👁️ Ver</button>
      ${isAdmin() ? `<button class="btn btn-ghost btn-sm" onclick="delTournament('${t.id}')">🗑️</button>` : ''}</div></div>`;
}
function renderTournaments(app) {
  // los borradores (no publicados) solo los ve el admin
  const all = DB.tournaments.filter(t => t.published || isAdmin()).slice().sort(byDateDesc);
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
    <label>Lugar (gimnasio)</label>
    <select id="t_gym">${(DB.gyms || []).length ? (DB.gyms || []).map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('') : '<option value="">— sin gimnasios cargados —</option>'}</select>
    <p class="hint" style="margin-top:4px">¿Falta un gimnasio? Agregalo en la sección <b>🏟️ Gimnasios</b>.</p>
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
  const tnew = { id: uid('t_'), name, date, dateEnd, gymId: ($('#t_gym').value || null), tableCount, collaborators, enrollClosed: false, published: false, categorias };
  DB.tournaments.push(tnew);
  save(DB); closeModal(); view = 'torneo:' + tnew.id; render(); // abre el borrador para seguir editándolo
}
function delTournament(id) { if (confirm('¿Eliminar torneo?')) { DB.tournaments = DB.tournaments.filter(t => t.id !== id); save(DB); render(); } }

/* ----- colaboradores del torneo (admin) ----- */
function collaboratorsModal(tid) {
  const t = tById(tid); if (!t) return;
  openModal(`<h3>Colaboradores — ${esc(t.name)}</h3>
    <p class="hint" style="margin-top:0">Pueden editar este torneo: inscribir jugadores, cargar resultados, abrir/cerrar inscripciones, armar grupos y la llave.</p>
    ${collabPickerHtml(t.collaborators)}
    <div class="row spread" style="margin-top:16px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveCollaborators('${tid}')">Guardar</button></div>`);
  refreshCollab();
}
function saveCollaborators(tid) {
  const t = tById(tid); if (!t) return;
  t.collaborators = [...(window.__collabSel || [])];
  save(DB); closeModal(); render();
}

/* ----- inscripción a nivel torneo ----- */
function toggleTournamentEnroll(tid) {
  const t = tById(tid); if (!t || !canEditT(t)) return;
  t.enrollClosed = !t.enrollClosed; save(DB); render();
}

/* ----- publicar torneo (borrador → visible para todos) ----- */
function publishTournament(tid) {
  const t = tById(tid); if (!t || !isAdmin()) return;
  if (!confirm('¿Publicar este torneo? Una vez publicado, todos los jugadores van a poder verlo y no se puede volver a borrador.')) return;
  t.published = true; save(DB); render();
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
  if (!canEditCat(cat)) return cur != null ? `<span class="mesa-badge">🏓 Mesa ${cur}</span>` : '';
  if (cur == null) return `<button class="btn btn-primary btn-sm start-btn" onclick="openTablePopover(${args})">▶️ Iniciar</button>`;
  return `<button class="mesa-badge mesa-badge-btn" onclick="openTablePopover(${args})" title="Mover el partido a otra mesa o liberarla">🏓 Mesa ${cur} ⚙️</button>`;
}
// Botón de carga de resultado. Deshabilitado hasta que el partido se inicie (tenga mesa asignada).
function resultBtn(cat, kind, gidx, r, m, mm, done, cls, editLabel) {
  const args = `'${cat._tid}','${cat.id}','${kind}',${gidx ?? 'null'},${r ?? 'null'},${m ?? 'null'}`;
  if (done) return `<button class="${cls}" onclick="resultModal(${args})">${editLabel}</button>`;
  if (matchTableOf(cat, mm) == null) {
    const tip = isZoneMatch(mm) ? 'Largá la zona primero (botón «Largar zona»).' : 'Iniciá el partido: tocá «Iniciar» y elegí una mesa.';
    return `<button class="${cls}" disabled title="${tip}">Cargar</button>`;
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
  if (!canEditCat(cat)) return zt != null ? `<span class="mesa-badge">🏓 Mesa ${zt}</span>` : '';
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
function assignZoneTable(tid, cid, gi, tableNum) {
  closePopover();
  const cat = getCat(tid, cid); cat._tid = tid;
  if (!cat.zoneTable) cat.zoneTable = {};
  const num = tableNum > 0 ? tableNum : null;
  if (num == null) { delete cat.zoneTable[gi]; save(DB); render(); return; }
  const occ = occupiedTablesOf(tById(tid)); if (cat.zoneTable[gi] != null) occ.delete(cat.zoneTable[gi]);
  if (occ.has(num)) { alert(`La mesa ${num} ya está ocupada. Esperá a que se libere.`); render(); return; }
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
function renderTournament(app, tid) {
  const t = tById(tid); if (!t) { app.innerHTML = '<div class="empty">No encontrado.</div>'; return; }
  if (!t.published && !isAdmin()) { app.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="go('torneos')">← Volver</button><div class="empty" style="margin-top:16px">Este torneo todavía no está disponible.</div>`; return; }
  const cards = t.categorias.map(c => {
    c._tid = t.id;
    const champ = c.bracket ? brWinner(c, c.bracket.length - 1, 0) : null;
    const st = c.closed ? '✅ Finalizada' : c.bracket ? '🏆 En llave' : c.groups ? '🎲 Grupos' : enrollmentStatus(c).label;
    return `<div class="card"><div class="row spread"><h3 style="margin:0">${esc(c.name)}</h3></div>
      <div class="tags"><span class="tag">${c.format === 'double' ? '👥 Dobles' : '👤 Singles'}</span>
        <span class="tag">📋 ${ruleLabel(c.rule)}</span>
        <span class="tag">${catSetsFmt(c).label}</span><span class="tag">🥇 ${c.championPoints} pts</span>
        <span class="tag">${c.entrants.length} ${c.format === 'double' ? 'parejas' : 'jugadores'}</span>
        ${catCost(c) > 0 ? `<span class="tag">💲 ${money(catCost(c))}</span>` : ''}
        ${c.startAt ? `<span class="tag">🕒 ${fmtStartAt(c.startAt)}</span>` : ''}
        <span class="tag">${st}</span></div>
      ${(() => { const m = myPaymentStatus(c); return m ? `<div class="pay-line ${m.paid ? 'ok' : 'no'}">${m.paid ? '✅ Inscripción pagada' : `💲 Te falta pagar ${money(m.cost)}`}</div>` : ''; })()}
      ${champ && champ !== 'BYE' ? `<div class="champ" style="margin-top:10px">🏆 ${esc(entName(c, champ))}</div>` : ''}
      <div class="row" style="margin-top:12px"><button class="btn btn-accent btn-sm" onclick="go('cat:${t.id}:${c.id}')">👁️ Ver</button>
        ${canEditT(t) && !c.groups ? `<button class="btn btn-ghost btn-sm" onclick="categoriaForm('${t.id}','${c.id}')">✏️ Reglas</button>` : ''}
        ${canEditT(t) ? `<button class="btn btn-ghost btn-sm" onclick="delCategoria('${t.id}','${c.id}')">🗑️</button>` : ''}</div></div>`;
  }).join('');
  const gym = gymById(t.gymId);
  const live = liveMatchesOf(t);
  const liveHtml = `<div class="section-head"><h2>🔴 Partidos en vivo</h2>${live.length ? `<span class="t-badge live">${live.length} en juego</span>` : ''}</div>`
    + (live.length
      ? `<div class="live-list">` + live.map(L => `<div class="live-row">
          <span class="live-mesa">🏓 Mesa ${L.table}</span>
          <span class="live-players">${esc(L.label)}</span>
          <span class="live-cat">${esc(L.catName)} · ${esc(L.sub)}</span></div>`).join('') + `</div>`
      : `<div class="empty">No hay partidos en juego ahora. Cuando le asignes una mesa a un partido, aparece acá como “en vivo”.</div>`);
  const tEnrollOpen = tournamentEnrollOpen(t);
  const collabNames = (t.collaborators || []).map(id => { const p = playerById(id); return p ? fullName(p) : null; }).filter(Boolean);
  const collabBanner = (!isAdmin() && isCollaboratorOf(t)) ? `<div class="banner ok" style="margin:8px 0 0">🤝 Sos colaborador: podés gestionar todo el torneo (inscribir, resultados, mesas, categorías, abrir/cerrar y finalizar). Otorgar puntos al ranking lo hace el admin.</div>` : '';
  const draftBanner = !t.published ? `<div class="banner" style="margin:8px 0 0;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span>📝 <b>Borrador</b> — solo vos lo ves. Configurá las reglas y, cuando esté listo, publicalo.</span>
      ${isAdmin() ? `<button class="btn btn-primary btn-sm" onclick="publishTournament('${t.id}')">🚀 Publicar torneo</button>` : ''}</div>` : '';
  const finishedBanner = t.finished ? `<div class="banner" style="margin:8px 0 0;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span>🏁 <b>Torneo finalizado.</b> Los jugadores lo ven en modo lectura.</span>
      ${canEditT(t) ? `<button class="btn btn-ghost btn-sm" onclick="reopenTournament('${t.id}')">♻️ Reabrir torneo</button>` : ''}</div>` : '';
  app.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="go('torneos')">← Volver</button>
    <div class="page-title" style="margin-top:12px"><h1>${esc(t.name)}</h1></div>
    ${draftBanner}${finishedBanner}
    <div class="tags" style="margin-top:8px"><span class="tag">📅 ${dateRangeLabel(t)}</span>${gym ? `<span class="tag">🏟️ ${esc(gym.name)}</span>` : ''}
      <span class="tag">🏓 ${tableCountOf(t)} mesa${tableCountOf(t) === 1 ? '' : 's'}</span>
      ${canEditT(t) ? `<button class="btn btn-ghost btn-sm" onclick="editTournamentModal('${t.id}')">✏️ Editar datos</button>
      <button class="btn btn-ghost btn-sm" onclick="editTablesModal('${t.id}')">✏️ Editar mesas</button>` : ''}</div>
    ${gym ? `<p class="page-sub" style="margin:8px 0 0">📍 ${esc(gym.address)} ${gym.address ? `<a class="maplink" href="${mapsDirUrl(gym.address)}" target="_blank" rel="noopener">🧭 Cómo llegar</a>` : ''}</p>` : ''}
    ${collabBanner}
    <div class="tags" style="margin-top:12px"><span class="tag ${tEnrollOpen ? 'tag-open' : 'tag-closed'}">${tEnrollOpen ? '🟢 Inscripción del torneo abierta' : '🔴 Inscripción del torneo cerrada'}</span>
      ${canEditT(t) && !t.finished ? `<button class="btn btn-ghost btn-sm" onclick="toggleTournamentEnroll('${t.id}')">${tEnrollOpen ? '🔒 Cerrar inscripción del torneo' : '🔓 Abrir inscripción del torneo'}</button>` : ''}
      ${canEditT(t) && !t.finished ? `<button class="btn btn-ghost btn-sm" onclick="finalizeTournament('${t.id}')">🏁 Finalizar torneo</button>` : ''}</div>
    ${(collabNames.length || isAdmin()) ? `<p class="page-sub" style="margin:10px 0 0">🤝 Colaboradores: ${collabNames.length ? collabNames.map(esc).join(', ') : '<span class="muted">ninguno</span>'} ${isAdmin() ? `<a class="maplink" onclick="collaboratorsModal('${t.id}')">✏️ Editar</a>` : ''}</p>` : ''}
    ${liveHtml}
    <div class="section-head"><h2>Categorías (sub-torneos)</h2>${canEditT(t) ? `<button class="btn btn-primary" onclick="categoriaForm('${t.id}')">➕ Crear categoría</button>` : ''}</div>
    <div class="cards">${cards || '<div class="empty">Sin categorías. Creá una.</div>'}</div>`;
}
function categoriaForm(tid, cid) {
  const cat = cid ? getCat(tid, cid) : null; // editar reglas de una categoría existente
  const sel = (v, opt) => v === opt ? 'selected' : '';
  const names = catCatalog().map(c => `<option value="${esc(c.name)}" ${cat && cat.name === c.name ? 'selected' : ''}>${esc(c.name)} — ${ruleLabel(c.rule)}</option>`).join('');
  const r = cat ? cat.rules : { sets: 5, groupMin: 3, groupMax: 4 };
  const curFmt = cat ? catSetsFmt(cat).id : 'all5';
  const setsOpts = SETS_FORMATS.map(f => `<option value="${f.id}" ${sel(curFmt, f.id)}>${f.label}</option>`).join('');
  const defCost = cat ? (cat.cost != null ? cat.cost : 0) : ((catEntryByName(catCatalog()[0] && catCatalog()[0].name) || {}).cost || 0);
  openModal(`<h3>${cat ? 'Editar' : 'Crear'} categoría (sub-torneo)</h3>
    <label>Categoría</label><select id="c_name" onchange="catCostSuggest()">${names}</select>
    <div class="grid2">
      <div><label>Formato</label><select id="c_fmt"><option value="single" ${cat ? sel(cat.format, 'single') : 'selected'}>Singles 👤</option><option value="double" ${cat ? sel(cat.format, 'double') : ''}>Dobles 👥</option></select></div>
      <div><label>Sets por fase</label><select id="c_setsfmt">${setsOpts}</select></div>
      <div><label>Mín por grupo</label><input id="c_min" type="number" min="2" value="${r.groupMin}"/></div>
      <div><label>Máx por grupo</label><input id="c_max" type="number" min="2" value="${r.groupMax}"/></div>
      <div><label>Valor del torneo 🏆 (máx 20)</label><input id="c_pts" type="number" min="0" max="20" value="${cat ? cat.championPoints : 20}"/></div>
      <div><label>Costo de inscripción 💲</label><input id="c_cost" type="number" min="0" step="100" value="${defCost}"/></div>
    </div>
    <p class="hint">Solo cobran el <b>podio</b>: 🥇 valor · 🥈 ½ · 🥉 ⅓ · 4º ¼. Además cada partido suma/resta puntos por nivel (Elo). <b>Solo puntúan singles de Primera/Segunda/Tercera/Cuarta</b> — dobles y categorías por edad no mueven el ranking.${cat && cat.entrants.length ? ' <br>⚠️ Si cambiás el formato (singles/dobles) se borran los inscriptos actuales.' : ''}</p>
    <div id="cerr" class="banner" hidden></div>
    <div class="row spread" style="margin-top:16px"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveCategoria('${tid}','${cid || ''}')">${cat ? 'Guardar' : 'Crear'}</button></div>`);
}
// Al cambiar la categoría en el form, sugiere el costo por defecto del catálogo.
function catCostSuggest() { const cc = catEntryByName($('#c_name').value), inp = $('#c_cost'); if (cc && inp) inp.value = cc.cost || 0; }
function saveCategoria(tid, cid) {
  const t = tById(tid), name = $('#c_name').value;
  const min = parseInt($('#c_min').value, 10), max = parseInt($('#c_max').value, 10);
  const e = $('#cerr');
  if (min > max) { e.hidden = false; e.textContent = 'Mín no puede ser mayor que máx.'; return; }
  const format = $('#c_fmt').value, setsFormat = $('#c_setsfmt').value;
  const rules = { sets: setsFmtById(setsFormat).bracket, groupMin: min, groupMax: max }, championPoints = Math.min(20, Math.max(0, parseInt($('#c_pts').value, 10) || 0));
  const cost = Math.max(0, parseInt($('#c_cost').value, 10) || 0);
  if (cid) {
    const cat = getCat(tid, cid); if (!cat) return;
    if (cat.groups) { e.hidden = false; e.textContent = 'No se pueden editar las reglas: los partidos ya empezaron.'; return; }
    if (cat.format !== format) cat.entrants = []; // cambia singles/dobles → se limpian inscriptos
    cat.name = name; cat.format = format; cat.rule = catalogRule(name); cat.rules = rules; cat.setsFormat = setsFormat; cat.championPoints = championPoints; cat.cost = cost;
  } else {
    t.categorias.push({ id: uid('c_'), name, format, rule: catalogRule(name), setsFormat, rules, championPoints, cost, entrants: [], groups: null, matches: null, bracket: null, thirdPlace: null, closed: false, enrollOverride: null });
  }
  save(DB); closeModal(); render();
}
function delCategoria(tid, cid) { const t = tById(tid); if (confirm('¿Eliminar categoría?')) { t.categorias = t.categorias.filter(c => c.id !== cid); save(DB); render(); } }
// Marca/desmarca el pago de un entrante (solo admin/colaborador).
function togglePaid(tid, cid, entId) {
  const cat = getCat(tid, cid); if (!cat) return; cat._tid = tid;
  if (!canEditCat(cat)) return;
  const e = entById(cat, entId); if (!e) return;
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
  const list = cat.entrants.slice().sort((a, b) => entName(cat, a.id).localeCompare(entName(cat, b.id)));
  const cost = catCost(cat), canPay = canEditCat(cat);
  return list.map((e, i) => {
    const mine = myId && e.players.includes(myId);
    const p = playerById(e.players[0]);
    const sub = cat.format === 'double'
      ? e.players.map(pid => { const pp = playerById(pid); return pp ? `${esc(fullName(pp))} (${pp.category})` : '?'; }).join(' + ')
      : (p ? `${p.category} · 📍 ${esc(p.city)}${ageFromDob(p.dob) != null ? ` · ${ageFromDob(p.dob)} años` : ''}` : '');
    let pay = '';
    if (cost > 0) {
      if (canPay) pay = `<button class="btn btn-ghost btn-sm pay-btn ${e.paid ? 'paid' : ''}" onclick="togglePaid('${cat._tid}','${cat.id}','${e.id}')">${e.paid ? '✅ Pagó' : '💲 Marcar pagado'}</button>`;
      else if (mine) pay = `<span class="pay-tag ${e.paid ? 'ok' : 'no'}">${e.paid ? '✅ Pagaste' : `💲 Falta pagar ${money(cost)}`}</span>`;
    }
    return `<div class="player-row"><span class="pos">${i + 1}</span>${cat.format === 'double' ? '' : (p ? avatar(p) : '')}
      <div class="meta"><div class="name">${esc(entName(cat, e.id))}${mine ? ' <span class="you-tag">vos</span>' : ''}</div>
      <div class="sub">${sub}</div></div>${pay}</div>`;
  }).join('');
}
function renderCategoria(app, tid, cid) {
  const t = tById(tid), cat = getCat(tid, cid);
  if (!cat) { app.innerHTML = '<div class="empty">No encontrada.</div>'; return; }
  cat._tid = tid; // para los onclick de grupos/llave
  let html = `<button class="btn btn-ghost btn-sm" onclick="go('torneo:${tid}')">← Volver</button>
    <div class="page-title" style="margin-top:12px"><h1>${esc(cat.name)}</h1></div>`;
  const enr = enrollmentStatus(cat);
  html += `<div class="tags"><span class="tag">${cat.format === 'double' ? '👥 Dobles' : '👤 Singles'}</span>
      <span class="tag">📋 Inscripción: ${ruleLabel(cat.rule)}</span>
      <span class="tag">🎾 ${catSetsFmt(cat).label}</span><span class="tag">Grupos ${cat.rules.groupMin}–${cat.rules.groupMax}</span>
      <span class="tag">🥇 ${cat.championPoints} pts</span><span class="tag">${cat.entrants.length} inscriptos</span>
      ${catCost(cat) > 0 ? `<span class="tag">💲 ${money(catCost(cat))}</span>` : ''}
      ${cat.startAt ? `<span class="tag">🕒 ${fmtStartAt(cat.startAt)}</span>` : ''}
      <span class="tag ${enr.open ? 'tag-open' : 'tag-closed'}">${enr.label}</span></div>`;
  // Estado de pago del jugador logueado (si está inscripto y la categoría tiene costo)
  const mps = myPaymentStatus(cat);
  if (mps) html += `<div class="banner ${mps.paid ? 'ok' : ''}" style="margin:12px 0">${mps.paid ? '✅ Ya pagaste tu inscripción a esta categoría.' : `💲 Te falta pagar la inscripción de esta categoría: <b>${money(mps.cost)}</b>.`}</div>`;
  // Resumen de pagos para admin/colaborador
  if (canEditCat(cat) && catCost(cat) > 0) {
    const paid = cat.entrants.filter(e => e.paid).length, pend = cat.entrants.length - paid;
    html += `<p class="page-sub" style="margin:8px 0 0">💲 Pagaron <b>${paid}</b> de ${cat.entrants.length} · pendiente <b>${money(pend * catCost(cat))}</b></p>`;
  }

  if (canEditCat(cat)) {
    const finalDone = cat.bracket && brWinner(cat, cat.bracket.length - 1, 0);
    const thirdReady = !cat.thirdPlace || matchDone(cat.thirdPlace, cat);
    const canToggle = !cat.groups && !cat.closed;
    html += `<div class="row" style="margin:16px 0">
      <button class="btn btn-accent" onclick="enrollModal('${tid}','${cid}')">📝 Anotar ${cat.format === 'double' ? 'parejas' : 'jugadores'}</button>
      <button class="btn btn-ghost" onclick="categoryTimeModal('${tid}','${cid}')">🕒 ${cat.startAt ? 'Horario' : 'Poner horario'}</button>
      ${canToggle ? `<button class="btn btn-ghost" onclick="toggleEnroll('${tid}','${cid}')">${enr.open ? '🔒 Cerrar inscripción' : '🔓 Abrir inscripción'} (esta categoría)</button>` : ''}
      ${canToggle && cat.enrollOverride ? `<button class="btn btn-ghost" onclick="resetEnrollOverride('${tid}','${cid}')">↩️ Seguir al torneo</button>` : ''}
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

  html += `<div class="section-head"><h2>📋 Inscriptos (${cat.entrants.length})</h2></div>` + entrantsListHtml(cat);

  html += `<div class="section-head"><h2>Fase de grupos</h2></div>`;
  if (cat.groups && cat.groups.length) {
    html += `<div class="groups">` + cat.groups.map((g, i) => groupCardHtml(cat, i)).join('') + `</div>`;
    html += `<div class="section-head"><h2>🏆 Llave final</h2></div>`;
    if (cat.bracket) html += bracketHtml(cat);
    else html += `<div class="empty">Clasifican los 2 primeros de cada grupo.${groupStageComplete(cat) ? (canEditCat(cat) ? ' Tocá “Generar llave”.' : '') : ' Cargá todos los resultados de grupos.'}</div>`;
  } else {
    html += `<div class="empty">Grupos sin armar.${canEditCat(cat) ? ' Anotá y tocá “Armar grupos”.' : ''}</div>`;
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
  const cat = getCat(tid, cid);
  if (cat.format === 'double') return enrollDoubles(tid, cid);
  const opts = DB.players.filter(p => !p.pending).sort((a, b) => fullName(a).localeCompare(fullName(b))).map(p => {
    const checked = cat.entrants.some(e => e.players[0] === p.id);
    const el = eligible(cat, p), age = ageFromDob(p.dob);
    return `<label class="enrow ${el.ok ? '' : 'no'}" data-name="${esc(fullName(p) + ' ' + p.city).toLowerCase()}" style="display:flex;align-items:center;gap:10px;font-weight:500;margin:6px 0">
      <input type="checkbox" value="${p.id}" ${checked ? 'checked' : ''} ${el.ok ? '' : 'disabled'} style="width:auto"/>
      <span>${esc(fullName(p))} <span class="muted" style="font-size:12px">· ${p.category}${age != null ? ` · ${age}a` : ''} · ${esc(p.city)}</span>
      ${el.ok ? '' : `<br><small style="color:#b42318">⛔ ${esc(el.reason)}</small>`}</span></label>`;
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
  const optList = DB.players.filter(p => !p.pending).sort((a, b) => fullName(a).localeCompare(fullName(b)));
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
  const cat = getCat(tid, cid); cat._tid = tid;
  if (!enrollmentOpen(cat)) { alert('La inscripción no está abierta.'); return; }
  const u = currentUser(), me = u && u.playerId ? playerById(u.playerId) : null;
  if (me && me.pending) { openModal(`<h3>Anotarme — ${esc(cat.name)}</h3><div class="banner">⏳ Tu cuenta está pendiente de aprobación por el admin. Cuando te aprueben vas a poder anotarte.</div><div class="row spread" style="margin-top:16px"><button class="btn btn-ghost" onclick="closeModal()">Cerrar</button></div>`); return; }
  if (FB() && me && currentUser().emailVerified === false) { openModal(`<h3>Anotarme — ${esc(cat.name)}</h3><div class="banner">📧 Verificá tu email antes de anotarte. Tenés el link en tu casilla; podés reenviarlo desde 👤 Perfil.</div><div class="row spread" style="margin-top:16px"><button class="btn btn-ghost" onclick="closeModal()">Cerrar</button></div>`); return; }
  const enrolledIds = new Set(cat.entrants.flatMap(e => e.players));
  const availFor = exclude => DB.players.filter(p => !p.pending).sort((a, b) => fullName(a).localeCompare(fullName(b)))
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
function genMatches(groups, bestOf) { const m = []; groups.forEach((g, gi) => { for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) m.push({ g: gi, a: g[i], b: g[j], sets: [], bestOf }); }); return m; }
function makeGroups(tid, cid) {
  const cat = getCat(tid, cid);
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
function groupCardHtml(cat, gi) {
  const st = groupStandings(cat, gi);
  const rows = st.map((s, i) => `<li><span${i < 2 ? ' style="font-weight:700"' : ''}>${esc(entName(cat, s.id))}</span>
    <span class="muted" style="margin-left:auto;font-size:12px">${s.pg}G · ${s.sf}-${s.sc}${i < 2 ? ' ✅' : ''}</span></li>`).join('');
  const zoneStarted = cat.zoneTable && cat.zoneTable[gi] != null;
  const ms = cat.matches.filter(m => m.g === gi).map(m => {
    const idx = cat.matches.indexOf(m), r = matchResult(m), done = matchDone(m, cat), w = matchWinnerSide(m, cat);
    const wo = m.walkover ? ' <span class="wo-tag">W.O.</span>' : '';
    let ctl = '';
    if (canEditCat(cat) && !done) {
      if (m.postponed) ctl = `<span class="post-tag">⏸ Aplazado</span>${startControl(cat, 'group', idx, null, null, m)}<button class="btn btn-ghost btn-sm" onclick="resumeMatch('${cat._tid}','${cat.id}',${idx})" title="Volver a la mesa de la zona">↩️</button>`;
      else if (zoneStarted) ctl = `<button class="btn btn-ghost btn-sm" onclick="postponeMatch('${cat._tid}','${cat.id}',${idx})" title="Aplazar: saca este partido de la mesa de la zona">⏸ Aplazar</button>`;
    }
    return `<div class="bmatch"><span class="${w === 'a' ? 'win' : ''}">${esc(entName(cat, m.a))}</span>
      <b class="score">${done ? r.wa + '-' + r.wb : '–'}</b>${wo}
      <span class="${w === 'b' ? 'win' : ''}">${esc(entName(cat, m.b))}</span>
      ${canEditCat(cat) ? resultBtn(cat, 'group', idx, null, null, m, done, 'btn btn-ghost btn-sm', '✏️') : ''}
      ${canEditCat(cat) && !done ? noShowBtn(cat, 'group', idx, null, null) : ''}
      ${done ? eloLabel(cat, m, m.a, m.b) : ''}
      ${ctl ? `<div class="bmatch-mesa">${ctl}</div>` : ''}</div>`;
  }).join('');
  const zc = zoneControl(cat, gi);
  return `<div class="group-card"><h4>Grupo ${String.fromCharCode(65 + gi)} · ${cat.groups[gi].length}</h4>
    ${zc ? `<div class="zone-bar">${zc}</div>` : ''}<ul>${rows}</ul><div class="matches">${ms}</div></div>`;
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
  const fmt = catSetsFmt(cat); // sets por fase: la ronda final usa fmt.final, el resto de la llave fmt.bracket
  rounds.forEach((round, r) => round.forEach(mm => { mm.bestOf = r === rounds.length - 1 ? fmt.final : fmt.bracket; }));
  cat.bracket = rounds;
  cat.thirdPlace = rounds.length >= 2 ? { sets: [], bestOf: fmt.bracket } : null; // partido por 3er/4to puesto
  cat.closed = false; cat.awarded = null; snapshotSeed(cat); save(DB); render();
}
function bracketHtml(cat) {
  const T = cat.bracket.length;
  const rname = r => { const fe = T - 1 - r; return fe === 0 ? 'Final' : fe === 1 ? 'Semifinal' : fe === 2 ? 'Cuartos' : fe === 3 ? 'Octavos' : 'Ronda ' + (r + 1); };
  const slot = (id, w, sc) => `<div class="br-slot ${w ? 'win' : ''}">${id === 'BYE' ? '<i class="muted">BYE</i>' : id ? esc(entName(cat, id)) : '<i class="muted">—</i>'}<span class="br-s">${sc}</span></div>`;
  const cols = cat.bracket.map((round, r) => `<div class="br-col"><div class="br-rtitle">${rname(r)}</div>` +
    round.map((mm, m) => { const a = brContender(cat, r, m, 'a'), b = brContender(cat, r, m, 'b'), res = matchResult(mm), w = brWinner(cat, r, m), done = matchDone(mm, cat);
      const playable = a && b && a !== 'BYE' && b !== 'BYE';
      const can = canEditCat(cat) && playable;
      const mesa = (playable && !done) ? startControl(cat, 'bracket', null, r, m, mm) : '';
      return `<div class="br-match">${slot(a, w && w === a, done ? res.wa : '')}${slot(b, w && w === b, done ? res.wb : '')}
        ${done && catScores(cat) ? `<div class="br-elo">${eloLabel(cat, mm, a, b)}</div>` : ''}
        ${mesa ? `<div class="br-mesa">${mesa}</div>` : ''}
        ${can ? resultBtn(cat, 'bracket', null, r, m, mm, done, 'btn br-edit', '✏️ editar') : ''}
        ${can && !done ? `<button class="btn br-edit" onclick="noShowModal('${cat._tid}','${cat.id}','bracket',null,${r},${m})" title="Cargar como no presentado">🚷 No se presentó</button>` : ''}</div>`;
    }).join('') + `</div>`).join('');
  let extra = '';
  if (cat.thirdPlace) {
    const a = semiLoser(cat, 0), b = semiLoser(cat, 1), res = matchResult(cat.thirdPlace), w = matchWinnerSide(cat.thirdPlace, cat), done = matchDone(cat.thirdPlace, cat);
    const playable = a && b && a !== 'BYE' && b !== 'BYE';
    const can = canEditCat(cat) && playable;
    const mesa = (playable && !done) ? startControl(cat, 'third', null, null, null, cat.thirdPlace) : '';
    extra = `<div class="br-col"><div class="br-rtitle">3er puesto</div><div class="br-match">
      ${slot(a, w === 'a', done ? res.wa : '')}${slot(b, w === 'b', done ? res.wb : '')}
      ${done && catScores(cat) ? `<div class="br-elo">${eloLabel(cat, cat.thirdPlace, a, b)}</div>` : ''}
      ${mesa ? `<div class="br-mesa">${mesa}</div>` : ''}
      ${can ? resultBtn(cat, 'third', null, null, null, cat.thirdPlace, done, 'btn br-edit', '✏️ editar') : ''}
      ${can && !done ? `<button class="btn br-edit" onclick="noShowModal('${cat._tid}','${cat.id}','third',null,null,null)" title="Cargar como no presentado">🚷 No se presentó</button>` : ''}</div></div>`;
  }
  const champ = brWinner(cat, T - 1, 0);
  const champHtml = champ && champ !== 'BYE' ? `<div class="champ">🏆 Campeón: <b>${esc(entName(cat, champ))}</b></div>` : '';
  return `<div class="bracket">${cols}${extra}</div>${champHtml}${awardedHtml(cat)}`;
}
function awardedHtml(cat) {
  if (!cat.awarded || !Object.keys(cat.awarded).length) return '';
  const rows = Object.entries(cat.awarded).sort((a, b) => b[1] - a[1]).map(([eid, pts]) =>
    `<li><span>${esc(entName(cat, eid))}</span><span class="pts ${pts < 0 ? 'neg' : ''}" style="margin-left:auto">${pts >= 0 ? '+' : ''}${pts} pts</span></li>`).join('');
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
const catScores = cat => !!(cat && cat.format !== 'double' && cat.rule && cat.rule.type === 'level');
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
  return `<span class="elo-delta" title="El ganador suma +${e.n} y el perdedor pierde −${e.n} (se aplica al cerrar la categoría)"><span class="elo-up">+${e.n}</span><span class="elo-down">−${e.n}</span></span>`;
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
  cat.awarded = {};
  if (catScores(cat)) {
    // 1) Elo por partido: acumular +N/−N de cada partido por entrante (suma cero).
    const delta = {}, add = (id, n) => { delta[id] = (delta[id] || 0) + n; };
    eachMatch(cat, (mm, a, b) => { const e = matchEloOf(cat, mm, a, b); if (e) { add(e.winId, e.n); add(e.loseId, -e.n); } });
    // 2) Podio (solo 1°–4°), escalado del valor del torneo (tope 20): campeón V, finalista V/2, 3° V/3, 4° V/4.
    const V = Math.min(TOURNEY_MAX, cat.championPoints || 0), map = placements(cat);
    Object.entries(map).forEach(([eid, div]) => { if (div <= 4) add(eid, Math.round(V / div)); });
    // 3) Aplicar a cada jugador con topes: >1100 sumas a la mitad, <100 restas a la mitad, nunca <0.
    Object.entries(delta).forEach(([eid, net]) => {
      const e = entById(cat, eid); if (!e) return;
      let applied = net;
      e.players.forEach(pid => {
        const p = playerById(pid); if (!p) return;
        let d = net;
        if (p.points > SCORE_CAP_HI && d > 0) d = Math.floor(d * 0.5);
        if (p.points < SCORE_CAP_LO && d < 0) d = -Math.floor(Math.abs(d) * 0.5);
        const before = p.points;
        p.points = Math.max(0, before + d);
        applied = p.points - before;   // cambio real (contempla el tope y el piso en 0)
        syncCategory(p);
      });
      cat.awarded[eid] = applied;
    });
  }
  cat.closed = true; save(DB); render();
}

/* ---------------- nav ---------------- */
function go(v) { view = v; closeModal(); closeDrawer(); window.scrollTo(0, 0); render(); }
function toggleDrawer() { const d = $('#drawer'), o = $('#drawerOverlay'); if (!d) return; const open = d.classList.toggle('open'); if (o) o.hidden = !open; }
function closeDrawer() { const d = $('#drawer'), o = $('#drawerOverlay'); if (d) d.classList.remove('open'); if (o) o.hidden = true; }
document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));

Object.assign(window, { doLogin, logout, go, playerForm, savePlayer, delPlayer, gymForm, saveGym, delGym, tournamentForm, saveTournament, delTournament, categoriaForm, saveCategoria, delCategoria, enrollModal, saveEnrollSingles, enrollDoubles, addTeam, rmTeam, saveEnrollDoubles, toggleEnroll, selfEnrollModal, saveSelfEnroll, makeGroups, generateBracket, resultModal, saveResult, awardPoints, histToggle, histPick, histFilter, histVs, openPhoto, saveProfile, changePassword, rankToggle, closeModal, toggleDrawer, closeDrawer, toggleTableSuggestion, togglePayments, toggleMatchTimes, toggleNews, noticiaForm, saveNoticia, toggleNoticiaPublish, delNoticia, toggleReglamento, reglamentoForm, saveReglamento, toggleReglamentoPublish, setThemeField, resetTheme, publishTheme, discardTheme, openEmojiPicker, pickEmoji, openTablePopover, assignTableFromPopover, openZonePopover, assignZoneTable, postponeMatch, resumeMatch, noShowModal, applyWalkover, editTablesModal, saveTables, setMatchTable, tournFilter, setAuthMode, doRegister, approvePlayer, rejectPlayer, collaboratorsModal, saveCollaborators, toggleTournamentEnroll, resetEnrollOverride, publishTournament, editTournamentModal, saveTournamentEdit, collabFilter, collabAdd, collabRemove, collabOpen, collabClose, doForgot, toggleCityOther, enrollFilter, resendVerification, recheckVerification, requestPasswordChange, categoryTimeModal, saveCategoryTime, finalizeTournament, reopenTournament, renderCatalog, catalogEntryForm, catRuleTypeChange, saveCatalogEntry, delCatalogEntry, togglePaid, catCostSuggest, setReport, reportFilterPerson });

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
async function ensureData() {
  if (_loaded || !FB()) return;
  const data = await window.STORE.loadAll();
  if (data.empty) {
    if (!isAdmin()) return;                 // base vacía y no soy admin → no puedo sembrar (reglas)
    DB = seed(); DB.users = data.users;      // arma datos de ejemplo
    applyMigrations(); runDataMigrations();
    await window.STORE.sync(DB); window.STORE.primeLast(DB);
  } else {
    DB = { players: data.players, gyms: data.gyms, tournaments: data.tournaments, users: data.users, news: data.news || [], settings: data.settings || {} };
    applyMigrations();
    DB.players.forEach(syncCategory);
    DB.tournaments.forEach(t => t.categorias.forEach(c => { if (!c.rule) c.rule = catalogRule(c.name); })); // snapshot: la regla se fija al crear, no se re-deriva del catálogo
    window.STORE.primeLast(DB);
  }
  _loaded = true;
}
async function boot() {
  applyCachedTheme(); // pinta el tema publicado al instante (sirve para el login, antes de autenticar)
  if (!FB()) { // modo local (sin Firebase configurado): comportamiento de siempre
    DB = load(); applyMigrations(); runDataMigrations(); save(DB); render(); maybePaymentReminder(); return;
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
      const ud = await window.STORE.getUserDoc(fbUser.uid);
      _session = ud
        ? { uid: fbUser.uid, email: fbUser.email, role: ud.role || 'player', name: ud.name || fbUser.email, playerId: ud.playerId || null, emailVerified: !!fbUser.emailVerified }
        : { uid: fbUser.uid, email: fbUser.email, role: 'player', name: fbUser.email, playerId: null, emailVerified: !!fbUser.emailVerified };
      // reflejar la verificación en el doc para que el admin la vea en Altas
      if (ud && fbUser.emailVerified && !ud.emailVerified) { try { await window.STORE.setUserDoc(fbUser.uid, { emailVerified: true }); } catch (e) {} }
      _loaded = false; await ensureData();
    } else { _session = null; }
    _authReady = true;   // recién acá: ya está la sesión resuelta (evita flash de login durante los await)
    render();
    if (fbUser) maybePaymentReminder(); // recordatorio de pago al iniciar sesión / recargar
  });
}
boot();
