import { defineConfig } from 'vitest/config';

// Nombres internos de app.js que exponemos a los tests (ver tests/unit/_setup.js para el porqué).
const EXPORT_NAMES = [
  'catSetsFmt', 'setsFmtById', 'catCatalog', 'schoolCatalog', 'newCategoryFromCatalog',
  'catEntryByName', 'catalogRule', 'ruleLabel', 'ordinal',
  'ageFromDob', 'eligible', 'guessGender', 'genderOf', 'pairGenderOk', 'norm1',
  'usernameFor', 'ensurePlayerUsers', 'usernameTaken', 'backfillUsernames',
  'levelFromPoints', 'syncCategory', 'fullName', 'playerById', 'isActivePlayer', 'isGuest', 'restorePlayer',
  'seed', 'defaultGyms', 'defaultOrgs', 'load', 'save',
  'currentUser', 'setUser', 'isAdmin', 'isSuperadmin', 'isSchoolAdmin',
  'canManagePlayer', 'canManageGym', 'inTournamentScope', 'tournamentPool',
  'ownsTournament', 'canAwardPoints', 'ctxOrgId', 'ctxSchoolId', 'paymentsScope',
  'orgById', 'schoolById', 'schoolName', 'playersOfSchool', 'playersOfOrg', 'scopedPending',
  'defaultSetting', 'settingsBag', 'setting', 'shadeHex', 'effectiveTheme',
  'tournamentSetting', 'hasPayWorker',
  'setWinner', 'matchResult', 'bestOfOf', 'matchWinnerSide', 'matchDone',
  'entSeedPoints', 'buildGroups', 'genMatches', 'groupStandings', 'groupStageComplete', 'groupComplete',
  'getCat', 'entById', 'tById', 'gymById',
  'nextPow2', 'seedOrder', 'seededQualSlots', 'brContender', 'brWinner', 'semiLoser',
  'thirdPlayable', 'buildBracketStructure', 'resolveBracketSlots', 'syncBracket', 'isQ', 'qLabel', 'isRealEnt',
  'placements', 'eachMatch',
  'pairKey', 'pairRecord', 'pairName', 'seedRatingOf', 'snapshotSeed', 'matchElo',
  'entHasGuest', 'matchEloOf', 'eloLabel',
  'money', 'esc', 'waLink', 'autoTheme', 'phoneHintText', 'payFmtDate', 'fmtStartAt',
  'enrollmentStatus', 'myPaymentStatus', 'onlinePayReady', 'catCost', 'catScores',
  'paidOnline', 'onlinePaidKeys', 'mergePaymentsIntoEntrants', 'headToHead', 'playerStats',
  'ytId', 'mapEmbed', 'resetCat', 'catStarted', 'groupsStarted', 'bracketStarted',
  'awardPoints', 'makeGroups', 'go', 'render', 'commitResult', 'locateMatch',
  // constantes
  'CATS', 'CITIES', 'CATALOG', 'SETS_FORMATS', 'DEFAULT_SETTINGS', 'DEFAULT_THEME',
  'GUEST_SCHOOL', 'NEW_PLAYER_POINTS', 'ELO_K', 'ELO_D', 'TOURNEY_MAX',
];

// Transforma el app.js clásico (sin módulos) en un módulo ESM importable:
//  - quita la llamada `boot()` (arrancaría la app contra Firebase/DOM real)
//  - le agrega un footer que exporta __APP (funciones + setters de estado) usando los identificadores
//    internos, que son visibles al final del módulo.
// Como solo agregamos líneas al final (y quitamos una), la numeración de líneas para la cobertura
// sigue mapeando a app.js.
// Helpers internos puros del worker que exponemos para testear (no son parte del export default).
const WORKER_NAMES = [
  'wSetWinner', 'wMatchResult', 'wBestOf', 'wMatchWinnerSide', 'wMatchDone',
  'wGroupComplete', 'wGroupStandings', 'wResolveBracketSlots', 'randomPassword', 'b64url',
];

function legacyAppPlugin() {
  return {
    name: 'legacy-app-module',
    enforce: 'pre',
    transform(code, id) {
      const norm = id.replace(/\\/g, '/');
      if (norm.endsWith('/worker/worker.js')) {
        const entries = WORKER_NAMES.map(n => `  ${n}: (typeof ${n} !== 'undefined' ? ${n} : undefined)`).join(',\n');
        return { code: code + `\nexport const __WK = {\n${entries}\n};\n`, map: null };
      }
      if (!norm.endsWith('/app.js')) return null;
      let src = code.replace(/\nboot\(\);\s*$/, '\n/* boot() neutralizado en tests */\n');
      const entries = EXPORT_NAMES.map(n => `  ${n}: (typeof ${n} !== 'undefined' ? ${n} : undefined)`).join(',\n');
      const footer = `
export const __APP = {
${entries},
  __getDB: () => DB, __setDB: (v) => { DB = v; },
  __getView: () => view, __setView: (v) => { view = v; },
  __setSession: (v) => { _session = v; },
  __setCtx: (o, s) => { _ctxOrg = o; _ctxSchool = s; },
  __setRender: (f) => { render = f; },
  __setAuthReady: (v) => { _authReady = v; },
};
`;
      return { code: src + footer, map: null };
    },
  };
}

export default defineConfig({
  plugins: [legacyAppPlugin()],
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost/' } },
    include: ['tests/unit/**/*.test.js'],
    setupFiles: ['tests/unit/_setup.js'],
    coverage: {
      provider: 'v8',
      include: ['app.js', 'store.js', 'worker/worker.js'],
      all: true,
      reporter: ['text', 'text-summary', 'html'],
      reportsDirectory: 'coverage',
    },
  },
});
