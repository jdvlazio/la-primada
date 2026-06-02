// @ts-check
// smoke.spec.js — Checks críticos: si alguno falla, nada más importa.
// Criterio: ¿la app carga sin errores? ¿los 3 tabs responden? ¿el wizard abre
// y se crea una primada? Réplica del smoke de Otrofestiv, adaptado al dominio.
const { test, expect } = require('@playwright/test');
const { SEL, abrirApp, sembrarPersonas, crearPrimada, contarPrimadas } = require('./helpers');

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

test('S2 — el shell está presente (screen + tabbar + 3 tabs)', async ({ page }) => {
  await abrirApp(page);
  await expect(page.locator(SEL.screen)).toBeVisible();
  await expect(page.locator(SEL.tabbar)).toBeVisible();
  for (const id of ['resumen', 'primadas', 'fondo']) {
    await expect(page.locator(SEL.tab(id))).toBeVisible();
  }
  // Primadas es el tab activo por defecto.
  await expect(page.locator(SEL.tabActive)).toHaveText('Primadas');
});

test('S3 — navegar entre los 3 tabs no lanza errores', async ({ page }) => {
  await abrirApp(page);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const id of ['resumen', 'fondo', 'primadas']) {
    await page.click(SEL.tab(id));
    await expect(page.locator(`${SEL.tab(id)}.active`)).toBeVisible();
  }
  expect(erroresReales(errors)).toHaveLength(0);
});

test('S4 — el wizard "Nueva primada" abre y se puede cancelar', async ({ page }) => {
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

  // Se creó 1 primada; el selector (con "Mes Año") y la fila del principal están en pantalla.
  expect(await contarPrimadas(page)).toBe(1);
  await expect(page.locator(SEL.selMain).first()).toBeVisible();
  await expect(page.locator(SEL.accHead).first()).toBeVisible();
});
