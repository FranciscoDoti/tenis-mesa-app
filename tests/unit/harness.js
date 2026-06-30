// Carga app.js (vía el plugin que lo convierte en módulo) + store.js, prepara el DOM base que
// render() necesita, y devuelve el objeto de exports (__APP) junto con un helper para resetear estado.
import '../../store.js';            // IIFE: setea window.STORE (en local => enabled:false)
import { __APP } from '../../app.js';
import { BODY } from './dom-template.js';

export const app = __APP;

// Prepara el DOM base y limpia el estado mutable a una base conocida.
export function reset() {
  document.documentElement.removeAttribute('style');
  document.body.innerHTML = BODY;
  try { localStorage.clear(); } catch (e) {}
  try { sessionStorage.clear(); } catch (e) {}
  app.__setSession(null);
  app.__setCtx(null, null);
  app.__setView('ranking');
  app.__setAuthReady(true);
}

// Carga un DB "sembrado" limpio (datos de ejemplo) y lo deja como estado activo.
// seed() no trae `settings` (en la app real lo completa applyMigrations); acá lo agregamos con los
// defaults para que las funciones que leen ajustes tengan una base coherente.
export function seedDB() {
  const db = app.seed();
  if (!db.settings) db.settings = JSON.parse(JSON.stringify(app.DEFAULT_SETTINGS));
  app.__setDB(db);
  return db;
}

// Inicia sesión (modo local: persiste en sessionStorage 'ttuser').
export function login(user) {
  app.setUser(user);
}

// Atajos a usuarios típicos del seed.
export const USERS = {
  superadmin: { username: 'admin', role: 'superadmin', name: 'Super Admin' },
  adminBari: { username: 'adminBari', role: 'admin', name: 'Admin Bariloche', orgId: 'org_byd', schoolId: 'sch_bari' },
  adminDina: { username: 'adminDina', role: 'admin', name: 'Admin Dina', orgId: 'org_byd', schoolId: 'sch_dina' },
  player: { username: 'jugador', role: 'player', name: 'Jugador', orgId: 'org_byd', schoolId: 'sch_bari' },
};
