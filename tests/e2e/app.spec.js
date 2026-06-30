import { test, expect } from '@playwright/test';

// Helpers ----------------------------------------------------------------------
async function gotoFresh(page) {
  await page.goto('/');
  // Arranca con localStorage limpio para que cada test parta del seed.
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await expect(page.locator('#lu')).toBeVisible();
}

async function login(page, user, pass) {
  await page.fill('#lu', user);
  await page.fill('#lp', pass);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.locator('#nav')).toBeVisible();
}

// Tests ------------------------------------------------------------------------
test.beforeEach(async ({ page }) => { await gotoFresh(page); });

test('muestra la pantalla de login en modo local', async ({ page }) => {
  await expect(page.locator('h1')).toHaveText('Tenis de Mesa');
  await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
  // pista de credenciales solo en modo local
  await expect(page.locator('.hint')).toContainText('admin');
});

test('login inválido muestra error', async ({ page }) => {
  await page.fill('#lu', 'admin');
  await page.fill('#lp', 'incorrecta');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.locator('#lerr')).toBeVisible();
  await expect(page.locator('#lerr')).toContainText(/incorrect/i);
});

test('superadmin entra y ve Ajustes', async ({ page }) => {
  await login(page, 'admin', 'admin');
  // el superadmin es figura de solo-ajustes
  await expect(page.locator('#app')).toContainText(/Ajustes|ajustes/i);
});

test('admin de escuela navega entre secciones', async ({ page }) => {
  await login(page, 'adminBari', 'adminBari');
  // en desktop (>=980px) el drawer está siempre visible; navegamos clickeando los botones del menú
  await page.locator('.nav-btn[data-view="jugadores"]').click();
  await expect(page.locator('#app')).toContainText(/jugador/i);

  await page.locator('.nav-btn[data-view="torneos"]').click();
  await expect(page.locator('#app')).toContainText(/torneo/i);

  await page.locator('.nav-btn[data-view="gimnasios"]').click();
  await expect(page.locator('#app')).toContainText(/Muni|gimnasio|Gimnasio/i);
});

test('admin crea un gimnasio nuevo', async ({ page }) => {
  await login(page, 'adminBari', 'adminBari');
  await page.locator('.nav-btn[data-view="gimnasios"]').click();

  // botón "agregar" abre el modal (texto puede variar; usamos el que dispare gymForm)
  await page.evaluate(() => window.gymForm());
  await page.fill('#g_name', 'Gimnasio E2E');
  await page.fill('#g_addr', 'Calle Falsa 123');
  await page.getByRole('button', { name: 'Guardar' }).click();

  await expect(page.locator('#app')).toContainText('Gimnasio E2E');
});

test('jugador inicia sesión y ve el ranking', async ({ page }) => {
  await login(page, 'jugador', 'jugador');
  await expect(page.locator('#app')).toContainText(/Ranking|ranking|🏆|puntos|Puntos/i);
});

test('logout vuelve al login', async ({ page }) => {
  await login(page, 'adminBari', 'adminBari');
  await page.evaluate(() => window.logout());
  await expect(page.locator('#lu')).toBeVisible();
});

test('en móvil el menú hamburguesa abre el drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await login(page, 'adminBari', 'adminBari');
  await expect(page.locator('#menuBtn')).toBeVisible();
  await page.locator('#menuBtn').click();
  await expect(page.locator('#drawer')).toHaveClass(/open/);
  await page.locator('.nav-btn[data-view="torneos"]').click();
  await expect(page.locator('#app')).toContainText(/torneo/i);
});

test('la sesión persiste al recargar', async ({ page }) => {
  await login(page, 'adminBari', 'adminBari');
  await page.reload();
  await expect(page.locator('#nav')).toBeVisible(); // sigue logueado
  await expect(page.locator('#lu')).toHaveCount(0);
});
