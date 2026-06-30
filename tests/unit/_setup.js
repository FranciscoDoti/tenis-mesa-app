// Setup global de los tests unitarios. Corre ANTES de los archivos de test (y por lo tanto antes de
// que se importe app.js), así el DOM base ya existe cuando app.js corre sus statements de top-level
// (p. ej. `$('#modal').addEventListener(...)`).
import { beforeEach, vi } from 'vitest';
import { BODY } from './dom-template.js';

document.body.innerHTML = BODY;

// jsdom no implementa alert/confirm/print: los stubbeamos para que las acciones que los usan no rompan.
globalThis.alert = vi.fn();
globalThis.confirm = vi.fn(() => true); // por defecto el usuario "acepta" los confirm()
globalThis.print = vi.fn();
globalThis.scrollTo = () => {};       // jsdom no lo implementa (go() lo usa)
if (window) window.scrollTo = () => {};
if (!globalThis.matchMedia) {
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
}

beforeEach(() => {
  globalThis.alert.mockClear();
  globalThis.confirm.mockClear();
  globalThis.confirm.mockReturnValue(true);
  globalThis.print.mockClear();
});
