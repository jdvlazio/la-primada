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
 *     · Reglas D1–D4 (fila liviana, principal con punto, sin dashed, sin .empty legado):
 *       tras aplicar docs/AUDITORIA-VISUAL.md, el app las CUMPLE → pasan en verde SIN test.fail().
 *       Son el gate del contrato: si una falla, el CSS/view.js se desvió del DESIGN.md.
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

  test('C4 — app shell flex: tabbar EN FLUJO anclada al borde físico (§6 safe-area)', async ({ page }) => {
    await abrirApp(page);
    const r = await page.evaluate(() => {
      const shell = document.querySelector('.app-shell');
      const tb = document.querySelector('.tabbar');
      const sc = document.querySelector('.app-scroll');
      const rect = tb.getBoundingClientRect();
      return {
        shellPosition: shell ? getComputedStyle(shell).position : null,
        scrollerFlexGrow: sc ? getComputedStyle(sc).flexGrow : null,
        scrollerOverflowY: sc ? getComputedStyle(sc).overflowY : null,
        tabbarPosition: getComputedStyle(tb).position,
        tabbarBottom: Math.round(rect.bottom),
        innerHeight: window.innerHeight,
      };
    });
    // SOLUCIÓN DE RAÍZ: el SHELL es fijo (cubre el viewport); la tabbar es un hijo EN FLUJO
    // (position:static) anclado por flexbox al fondo → no es un fixed independiente que pueda saltar.
    expect(r.shellPosition).toBe('fixed');          // el shell flex cubre el viewport
    expect(r.scrollerFlexGrow).toBe('1');           // el scroller ocupa el alto disponible (flex:1)
    expect(r.scrollerOverflowY).toBe('auto');       // y es el único que scrollea
    expect(r.tabbarPosition).toBe('static');        // tabbar EN FLUJO (no fixed) → no se reposiciona
    expect(r.tabbarBottom).toBe(r.innerHeight);     // toca el borde inferior físico (cubre el inset)
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
// 3 · CONFORMIDAD — rediseño aplicado (D1–D4). Cada uno corresponde a una entrada
//     de docs/AUDITORIA-VISUAL.md, ya corregida.
// ─────────────────────────────────────────────────────────────────────────────
// Tras la pasada de rediseño (docs/AUDITORIA-VISUAL.md aplicada), estas reglas pasan en VERDE.
// Ya NO llevan test.fail(): son el gate del contrato. Si alguna falla, el CSS/view.js se desvió.
test.describe('Conformidad DESIGN.md — rediseño aplicado', () => {
  test('D1 — fila de asistente SIN caja con borde (§2.1)', async ({ page }) => {
    await appConPrimadaAbierta(page);
    const bw = await page.evaluate(() => {
      const el = document.querySelector('.asis');
      return el ? getComputedStyle(el).borderTopWidth : '0px';
    });
    expect(bw).toBe('0px'); // canónico: sin caja
  });

  test('D2 — principal marcado con punto+texto, NO badge con borde (§2.1)', async ({ page }) => {
    await appConPrimadaAbierta(page);
    const ident = await page.evaluate(() => ({
      badges: document.querySelectorAll('.acc-id .badge').length,
      dotPrin: document.querySelectorAll('.acc-id .dot.prin').length,
    }));
    expect(ident.badges).toBe(0);     // cero badges en la identidad
    expect(ident.dotPrin).toBeGreaterThan(0); // el principal lleva punto teal
  });

  test('D3 — sin divisores punteados en el detalle de primada (§2 / Densidad)', async ({ page }) => {
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

  test('D4 — estado vacío sin caja punteada (§2.6 .empty-soft, .empty eliminado)', async ({ page }) => {
    await abrirApp(page);
    const emptyBorder = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.className = 'empty';
      document.body.appendChild(probe);
      const bs = getComputedStyle(probe).borderTopStyle;
      probe.remove();
      return bs;
    });
    expect(emptyBorder).toBe('none'); // la clase legado .empty ya no existe en el CSS
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 · AJUSTES tab Primadas / Configurar (productos movidos) + tabbar fija
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Ajustes: productos en Configurar + tabbar fija', () => {
  test('E1 — tab Primadas NO edita productos (solo asistentes)', async ({ page }) => {
    await appConPrimadaAbierta(page);
    expect(await page.locator('#screen .prodrow').count()).toBe(0);
    expect(await page.locator('[data-act="toggle-panel-productos"]').count()).toBe(0);
    expect(await page.locator('#screen .acc-head').count()).toBeGreaterThan(0); // sí hay asistentes
  });

  test('E2 — Configurar muestra productos editables (costo/venta)', async ({ page }) => {
    await abrirApp(page);
    await sembrarPersonas(page, [{ nombre: 'Ana', estado: 'ahorrador' }]);
    await crearPrimada(page, 'Ana');
    await page.click('[data-act="open-config-primada"]');
    await expect(page.locator('.overlay')).toBeVisible();
    expect(await page.locator('.overlay .prodrow').count()).toBeGreaterThan(0);
    await expect(page.locator('.overlay [data-ch="costo-producto"]').first()).toBeVisible();
    await expect(page.locator('.overlay [data-ch="venta-producto"]').first()).toBeVisible();
  });

  test('E3 — tabbar anclada por estructura: el scroll del contenido no la mueve', async ({ page }) => {
    await appConPrimadaAbierta(page);
    const r = await page.evaluate(() => {
      const tb = document.querySelector('.tabbar');
      const scroller = document.querySelector('.app-scroll');
      const top0 = Math.round(tb.getBoundingClientRect().top);
      // scrollear el contenedor interno (no el body) y el body por si acaso
      scroller.scrollTop = 400;
      window.scrollTo(0, 400);
      const top1 = Math.round(tb.getBoundingClientRect().top);
      const bottom = Math.round(tb.getBoundingClientRect().bottom);
      return { top0, top1, bottom, innerHeight: window.innerHeight, windowScrollY: window.scrollY };
    });
    expect(r.windowScrollY).toBe(0);          // el body NO scrollea
    expect(r.top0).toBe(r.top1);              // la tabbar no se mueve al scrollear el contenido
    expect(r.bottom).toBe(r.innerHeight);     // sigue tocando el borde inferior del viewport
  });

  test('E4 — los <select> usan appearance:none + chevron (no flechas nativas)', async ({ page }) => {
    await appConPrimadaAbierta(page);
    await page.click('[data-act="open-config-primada"]'); // el select de rol vive en Configurar (sección Asistentes)
    const sel = page.locator('.overlay select.sel').first();
    await expect(sel).toBeVisible();
    const css = await sel.evaluate(el => ({ ap: getComputedStyle(el).appearance, bg: getComputedStyle(el).backgroundImage }));
    expect(css.ap).toBe('none');
    expect(css.bg).toContain('svg'); // chevron-down como background data-URI
  });

  test('E5 — agregar asistente desde la hoja del directorio', async ({ page }) => {
    await abrirApp(page);
    await sembrarPersonas(page, [{ nombre: 'Ana', estado: 'ahorrador' }, { nombre: 'Beto', estado: 'ahorrador' }]);
    await crearPrimada(page, 'Ana');               // solo Ana (principal) como asistente
    expect(await page.locator('#screen .asis').count()).toBe(1);
    await page.click('[data-act="open-add-asis"]'); // hoja simple
    await expect(page.locator('.overlay .addrow').first()).toBeVisible();
    await page.locator('.overlay [data-act="add-asistencia"]').first().click(); // un toque agrega
    expect(await page.locator('#screen .asis').count()).toBe(2);
  });

  test('E6 — quitar asistente desde Configurar (con confirmación)', async ({ page }) => {
    page.on('dialog', d => d.accept());            // confirmar el "¿Quitar al asistente?"
    await appConPrimadaAbierta(page);              // Ana principal (1 asistente)
    // sumar al resto del directorio como asistentes para tener varios
    await page.evaluate(() => {
      const S = window.Store, st = S.select.state(), p = st.primadas[0];
      st.personas.forEach(per => { if (per.id !== p.organizadorPrincipalId) S.actions.addAsistencia(p.id, per.id); });
    });
    await page.click('[data-act="open-config-primada"]');
    const rows = page.locator('.overlay .cfg-asis');
    const before = await rows.count();
    expect(before).toBeGreaterThan(1);
    await page.locator('.overlay .cfg-asis [data-act="remove-asistencia"]').last().click(); // quita el último (no principal)
    await expect(rows).toHaveCount(before - 1);
  });

  test('E7 — editar persona inline en el overlay Personas', async ({ page }) => {
    await abrirApp(page);
    await sembrarPersonas(page, [{ nombre: 'Ana', estado: 'ahorrador' }]);
    await page.click('#gearBtn');                  // overlay Personas
    await expect(page.locator('.overlay .prow')).toBeVisible();
    expect(await page.locator('.overlay [data-ch="rename-persona"]').count()).toBe(0); // cerrada: sin editor
    await page.click('.overlay .prow .acc-head');  // expandir → edición inline
    const inp = page.locator('.overlay [data-ch="rename-persona"]');
    await expect(inp).toBeVisible();
    await inp.fill('Anita');
    await inp.blur();                               // el rename se aplica en 'change' (al salir del campo)
    // commitQuiet es DEBOUNCED ~500ms para localStorage; el estado EN MEMORIA muta sincrónico → se verifica ahí.
    const nombre = await page.evaluate(() => window.Store.select.state().personas[0].nombre);
    expect(nombre).toBe('Anita');
  });
});
