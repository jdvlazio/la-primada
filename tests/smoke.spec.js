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

test('S2 — el shell está presente (screen + tabbar + 2 tabs)', async ({ page }) => {
  // El Resumen dejó de ser un tab (ahora es una CARA dentro de Primadas) → la tabbar tiene 2 tabs.
  await abrirApp(page);
  await expect(page.locator(SEL.screen)).toBeVisible();
  await expect(page.locator(SEL.tabbar)).toBeVisible();
  for (const id of ['primadas', 'fondo']) {
    await expect(page.locator(SEL.tab(id))).toBeVisible();
  }
  await expect(page.locator(SEL.tab('resumen'))).toHaveCount(0);   // ya no existe como tab
  // Primadas es el tab activo por defecto.
  await expect(page.locator(SEL.tabActive)).toHaveText('Primadas');
});

test('S3 — navegar entre los 2 tabs no lanza errores', async ({ page }) => {
  await abrirApp(page);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const id of ['fondo', 'primadas']) {
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

test('S6 — el switch de cara (Consumos | Resumen) conmuta el contenido', async ({ page }) => {
  await abrirApp(page);
  await sembrarPersonas(page, [{ nombre: 'Ana', estado: 'ahorrador' }]);
  await crearPrimada(page, 'Ana');
  // Recién creada (abierta) → abre en la cara Consumos: se ven los Asistentes, no el reparto.
  await expect(page.locator(SEL.cara('operacion'))).toBeVisible();
  await expect(page.locator(SEL.accHead).first()).toBeVisible();
  // Conmutar a Resumen → aparece el reparto del fondo (no es un tab, es una cara).
  await page.click(SEL.cara('resumen'));
  await expect(page.locator(`${SEL.cara('resumen')}.on`)).toBeVisible();
  await expect(page.locator(SEL.screen)).toContainText('Ganancia');
  // Volver a Consumos.
  await page.click(SEL.cara('operacion'));
  await expect(page.locator(SEL.accHead).first()).toBeVisible();
});
