// @ts-check
// smoke.spec.js — Checks críticos: si alguno falla, nada más importa.
// Criterio: ¿la app carga sin errores? ¿los 3 tabs responden? ¿el wizard abre
// y se crea una primada? Réplica del smoke de Otrofestiv, adaptado al dominio.
const { test, expect } = require('@playwright/test');
const { SEL, abrirApp, sembrarPersonas, crearPrimada, contarPrimadas, entrarDetalle } = require('./helpers');

// Filtra ruido de extensiones del navegador / telemetría — solo errores reales de la app.
function erroresReales(errs) {
  return errs.filter(e => !/extension|chrome-extension|sentry|favicon/i.test(e));
}

test('S1 — carga inicial sin errores JS', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await abrirApp(page);
  expect(erroresReales(errors)).toHaveLength(0);
});

test('S2 — el shell está presente (screen + topbar del home, sin tab bar)', async ({ page }) => {
  // IA list→detalle: NO hay tab bar. El home arranca con el "+" en la topbar.
  await abrirApp(page);
  await expect(page.locator(SEL.screen)).toBeVisible();
  await expect(page.locator(SEL.topbar)).toBeVisible();
  await expect(page.locator('#tabbar')).toHaveCount(0);          // tab bar eliminado
  await expect(page.locator(SEL.nuevaPrimada)).toBeVisible();    // "+" en la topbar del home
});

test('S3 — navegar home↔detalle (back stack) no lanza errores', async ({ page }) => {
  await abrirApp(page);
  await sembrarPersonas(page, [{ nombre: 'Ana', estado: 'ahorrador' }]);
  await crearPrimada(page, 'Ana');   // tras crear, aterriza en el DETALLE
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.click(SEL.volverHome);                              // ← Inicio
  await expect(page.locator(SEL.hero)).toBeVisible();
  await entrarDetalle(page);                                     // volver a entrar
  await expect(page.locator(SEL.volverHome)).toBeVisible();
  expect(erroresReales(errors)).toHaveLength(0);
});

test('S4 — el wizard "Nueva primada" abre (desde el "+" del home) y se puede cancelar', async ({ page }) => {
  await abrirApp(page);
  await page.click(SEL.nuevaPrimada);
  await expect(page.locator(SEL.wizard)).toBeVisible();
  await page.click(SEL.wzCancelar);
  await expect(page.locator(SEL.wizard)).toHaveCount(0);
});

test('S5 — se crea una primada (wizard completo) y aparece su detalle', async ({ page }) => {
  await abrirApp(page);
  await sembrarPersonas(page, [
    { nombre: 'Ana', estado: 'ahorrador' },
    { nombre: 'Beto', estado: 'ahorrador' },
  ]);
  expect(await contarPrimadas(page)).toBe(0);

  await crearPrimada(page, 'Ana');

  // Se creó 1 primada; tras crear se entra al DETALLE (← Inicio + lista de asistentes).
  expect(await contarPrimadas(page)).toBe(1);
  await expect(page.locator(SEL.volverHome)).toBeVisible();
  await expect(page.locator(SEL.asisFila).first()).toBeVisible();
});

test('S6 — el panel de Balance (chip) despliega/colapsa bajo la Lista viva', async ({ page }) => {
  await abrirApp(page);
  await sembrarPersonas(page, [{ nombre: 'Ana', estado: 'ahorrador' }]);
  await crearPrimada(page, 'Ana');
  // Abierta → panel colapsado por defecto: se ven los Asistentes, no el reparto. El chip está presente.
  await expect(page.locator(SEL.asisFila).first()).toBeVisible();
  await expect(page.locator(SEL.balanceToggle)).toBeVisible();
  await expect(page.locator(SEL.balancePanel)).toHaveCount(0);
  // Desplegar → aparece el reparto del fondo (mismo scroll, la Lista viva sigue arriba).
  await page.click(SEL.balanceToggle);
  await expect(page.locator(SEL.balancePanel)).toBeVisible();
  await expect(page.locator(SEL.screen)).toContainText('Ganancia');
  await expect(page.locator(SEL.asisFila).first()).toBeVisible();   // coexisten
  // Colapsar de nuevo.
  await page.click(SEL.balanceToggle);
  await expect(page.locator(SEL.balancePanel)).toHaveCount(0);
});
