// @ts-check
/**
 * visual-audit.spec.js — Auditoría visual contra DESIGN.md (el contrato).
 *
 * Dos cosas:
 *  1) EVIDENCIA — screenshots de cada estado principal (test-results/visual/*.png).
 *     No es pixel-diff (frágil entre OS); es evidencia automática para revisar a ojo.
 *     Falla solo si un selector crítico no existe (la pantalla no cargó).
 *  2) CONFORMIDAD — asserts de las reglas del DESIGN.md:
 *     · Reglas que el app YA cumple (tokens, tipografía, acento) → assert en VERDE.
 *     · Reglas que el app VIOLA hoy (caja .asis, divisores dashed, badges de identidad)
 *       → marcadas `test.fail()`: son DEUDA DE DISEÑO documentada en docs/AUDITORIA-VISUAL.md.
 *       Hoy "pasan" como expected-failure (suite verde). Cuando apliquemos el rediseño y la
 *       violación desaparezca, el test pasará inesperadamente → hay que QUITAR el `test.fail()`.
 *       Así este archivo es el gate ejecutable del rediseño: rojo→verde sin tocarlo, solo
 *       borrando las anotaciones de deuda.
 *
 * Fuente de verdad: DESIGN.md §1 (tokens), §2 (componentes canónicos), §3 (jerarquía).
 */
const { test, expect } = require('@playwright/test');
const { SEL, abrirApp, sembrarPersonas, crearPrimada } = require('./helpers');

const ACCENT = 'rgb(45, 212, 191)';   // --accent #2DD4BF resuelto
const VISUAL = 'test-results/visual';

// Deja la app con una primada creada y la fila del principal EXPANDIDA (cuerpo visible).
async function appConPrimadaAbierta(page) {
  await abrirApp(page);
  await sembrarPersonas(page, [
    { nombre: 'Ana', estado: 'ahorrador' },
    { nombre: 'Beto', estado: 'ahorrador' },
    { nombre: 'Caro', estado: 'invitado' },
  ]);
  await crearPrimada(page, 'Ana');
  await page.locator(SEL.accHead).first().click();   // expande el acordeón del principal
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · EVIDENCIA VISUAL — screenshots de los estados principales
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Evidencia visual', () => {
  test('V1 — tab Primadas (vacío)', async ({ page }) => {
    await abrirApp(page);
    await page.screenshot({ path: `${VISUAL}/primadas-vacio.png`, fullPage: false });
    await expect(page.locator(SEL.nuevaPrimada)).toBeVisible();
  });

  test('V2 — tab Resumen', async ({ page }) => {
    await abrirApp(page);
    await page.click(SEL.tab('resumen'));
    await page.screenshot({ path: `${VISUAL}/resumen.png`, fullPage: false });
    await expect(page.locator(`${SEL.tab('resumen')}.active`)).toBeVisible();
  });

  test('V3 — tab Fondo (placeholder)', async ({ page }) => {
    await abrirApp(page);
    await page.click(SEL.tab('fondo'));
    await page.screenshot({ path: `${VISUAL}/fondo.png`, fullPage: false });
    await expect(page.locator(`${SEL.tab('fondo')}.active`)).toBeVisible();
  });

  test('V4 — wizard Nueva primada', async ({ page }) => {
    await abrirApp(page);
    await page.click(SEL.nuevaPrimada);
    await expect(page.locator(SEL.wizard)).toBeVisible();
    await page.screenshot({ path: `${VISUAL}/wizard.png`, fullPage: false });
  });

  test('V5 — detalle de primada con asistente expandido', async ({ page }) => {
    await appConPrimadaAbierta(page);
    await page.screenshot({ path: `${VISUAL}/primada-detalle.png`, fullPage: false });
    await expect(page.locator(SEL.accHead).first()).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · CONFORMIDAD — reglas del DESIGN.md que el app YA cumple (VERDE)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Conformidad DESIGN.md — verde', () => {
  test('C1 — tipografía Instrument Sans en el body (§1)', async ({ page }) => {
    await abrirApp(page);
    const ff = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(ff).toContain('Instrument Sans');
  });

  test('C2 — tokens de color en :root (§1)', async ({ page }) => {
    await abrirApp(page);
    const tok = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        accent: cs.getPropertyValue('--accent').trim(),
        paper: cs.getPropertyValue('--paper').trim(),
        ink: cs.getPropertyValue('--ink').trim(),
        space4: cs.getPropertyValue('--space-4').trim(),
      };
    });
    expect(tok.accent.toLowerCase()).toBe('#2dd4bf');
    expect(tok.paper.toLowerCase()).toBe('#0d1716');
    expect(tok.ink.toLowerCase()).toBe('#e2eeec');
    expect(tok.space4).toBe('20px');
  });

  test('C3 — tab activo diferenciado en acento (§2 tabbar / DESIGN.md §2.7)', async ({ page }) => {
    await abrirApp(page);
    const color = await page.evaluate(() => getComputedStyle(document.querySelector('.tab.active')).color);
    expect(color).toBe(ACCENT);
  });

  test('C4 — tabbar anclada (position:fixed; bottom:0) (§6 safe areas)', async ({ page }) => {
    await abrirApp(page);
    const tb = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('.tabbar'));
      return { position: cs.position, bottom: cs.bottom };
    });
    expect(tb.position).toBe('fixed');
    expect(tb.bottom).toBe('0px');
  });

  test('C5 — saldo en deuda usa color en el NÚMERO, no borde de fila (§2.1 / §3)', async ({ page }) => {
    // El selector .owe (saldo deudor) debe colorear el texto con --alert, nunca un borde.
    await abrirApp(page);
    const owe = await page.evaluate(() => {
      // crea regla efímera para leer el color canónico de .owe sin depender de datos
      const probe = document.createElement('b');
      probe.className = 'owe';
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    });
    expect(owe).toBe('rgb(240, 140, 140)'); // --alert #F08C8C
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · CONFORMIDAD — DEUDA DE DISEÑO (test.fail hasta aplicar el rediseño)
//     Cada uno corresponde a una entrada de docs/AUDITORIA-VISUAL.md.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Conformidad DESIGN.md — deuda (expected-fail)', () => {
  test('D1 — fila de asistente SIN caja con borde (§2.1 vs .asis legado)', async ({ page }) => {
    test.fail(true, 'Hoy .asis es caja border:2px. Canónico §2.1 = fila liviana. Ver AUDITORIA-VISUAL §1.');
    await appConPrimadaAbierta(page);
    const bw = await page.evaluate(() => {
      const el = document.querySelector('.asis');
      return el ? getComputedStyle(el).borderTopWidth : '0px';
    });
    expect(bw).toBe('0px'); // canónico: sin caja
  });

  test('D2 — principal marcado con punto+texto, NO badge con borde (§2.1)', async ({ page }) => {
    test.fail(true, 'Hoy el principal usa badge("principal","red"). Canónico §2.1 = .dot teal + "Principal". Ver AUDITORIA-VISUAL §3.');
    await appConPrimadaAbierta(page);
    const badgesEnIdentidad = await page.evaluate(() =>
      document.querySelectorAll('.acc-id .badge').length
    );
    expect(badgesEnIdentidad).toBe(0); // canónico: cero badges en la identidad
  });

  test('D3 — sin divisores punteados en el detalle de primada (§2 / Densidad)', async ({ page }) => {
    test.fail(true, 'Hoy .asis-foot/.kv/.pay usan border dashed. Canónico = espacio o línea tenue sólida. Ver AUDITORIA-VISUAL §2.');
    await appConPrimadaAbierta(page);
    const dashed = await page.evaluate(() => {
      const dentro = document.querySelectorAll('#screen *');
      let n = 0;
      for (const el of dentro) {
        const cs = getComputedStyle(el);
        if ([cs.borderTopStyle, cs.borderBottomStyle].includes('dashed')) n++;
      }
      return n;
    });
    expect(dashed).toBe(0); // canónico: ningún divisor dashed
  });

  test('D4 — estado vacío sin caja punteada (§2.6 .empty-soft vs .empty legado)', async ({ page }) => {
    test.fail(true, 'La clase legado .empty usa border:2px dashed. Canónico §2.6 = .empty-soft sin caja. Ver AUDITORIA-VISUAL §4.');
    await abrirApp(page);
    const emptyBorder = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.className = 'empty';
      document.body.appendChild(probe);
      const bs = getComputedStyle(probe).borderTopStyle;
      probe.remove();
      return bs;
    });
    expect(emptyBorder).toBe('none'); // canónico: la clase no debería existir / sin borde
  });
});
