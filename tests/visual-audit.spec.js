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

  test('C4 — fix cold-start: .app a la altura del viewport + tabbar flex al borde (§6 safe-area)', async ({ page }) => {
    await abrirApp(page);
    const r = await page.evaluate(() => {
      const app = document.querySelector('.app');
      const sc = document.querySelector('.app-scroll');
      const tb = document.querySelector('.tabbar');
      const rect = tb.getBoundingClientRect();
      return {
        hasApp: !!app,
        appDisplay: app ? getComputedStyle(app).display : null,
        appHeight: app ? Math.round(app.getBoundingClientRect().height) : null,
        scrollerFlexGrow: sc ? getComputedStyle(sc).flexGrow : null,
        scrollerOverflowY: sc ? getComputedStyle(sc).overflowY : null,
        bodyOverflow: getComputedStyle(document.body).overflow,
        tabbarPosition: getComputedStyle(tb).position,
        tabbarBottom: Math.round(rect.bottom),
        innerHeight: window.innerHeight,
      };
    });
    // FIX del cold-start de iOS PWA: el alto lo manda .app=100vh (pantalla completa fiable en
    // standalone), NO 100dvh ni un position:fixed que iOS ancla mal al lanzar. Tabbar = hijo flex al fondo.
    expect(r.hasApp).toBe(true);
    expect(r.appDisplay).toBe('flex');              // columna flex
    expect(r.appHeight).toBe(r.innerHeight);        // .app = 100vh = alto del viewport
    expect(r.scrollerFlexGrow).toBe('1');           // .app-scroll ocupa el alto disponible
    expect(r.scrollerOverflowY).toBe('auto');       // y es el único que scrollea
    expect(r.bodyOverflow).toBe('hidden');          // el body no scrollea
    expect(r.tabbarPosition).toBe('static');        // tabbar EN FLUJO (flex), no fixed
    expect(r.tabbarBottom).toBe(r.innerHeight);     // queda pegada al borde inferior físico
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

  test('E2 — Configurar: productos como filas-acordeón (clon Personas); costo/venta al expandir', async ({ page }) => {
    await abrirApp(page);
    await sembrarPersonas(page, [{ nombre: 'Ana', estado: 'ahorrador' }]);
    await crearPrimada(page, 'Ana');
    await page.click('[data-act="open-config-primada"]');
    await expect(page.locator('.overlay')).toBeVisible();
    // Filas de producto = mismas clases que Personas (.prow + .acc-head). Colapsadas: sin inputs.
    expect(await page.locator('.overlay .prow').count()).toBeGreaterThan(0);
    expect(await page.locator('.overlay [data-ch="costo-producto"]').count()).toBe(0); // colapsado
    // Expandir la primera fila de producto → aparecen costo/venta (.fld + .ti).
    await page.locator('.overlay [data-act="toggle-cfg-prod"]').first().click();
    await expect(page.locator('.overlay [data-ch="costo-producto"]').first()).toBeVisible();
    await expect(page.locator('.overlay [data-ch="venta-producto"]').first()).toBeVisible();
  });

  test('E2b — Configurar y Personas usan las MISMAS clases de fila/campo (acc-head + .prow)', async ({ page }) => {
    await abrirApp(page);
    await sembrarPersonas(page, [{ nombre: 'Ana', estado: 'ahorrador' }]);
    await crearPrimada(page, 'Ana');
    // Configurar: asistentes y productos son filas .prow con .acc-head (idéntico a Personas).
    await page.click('[data-act="open-config-primada"]');
    expect(await page.locator('.overlay .prow .acc-head').count()).toBeGreaterThan(0);
    expect(await page.locator('.overlay [data-act="toggle-cfg-asis"]').count()).toBeGreaterThan(0);
    expect(await page.locator('.overlay [data-act="toggle-cfg-prod"]').count()).toBeGreaterThan(0);
    // ya NO existen las clases pesadas propias de Configurar
    expect(await page.locator('.overlay .cfg-asis, .overlay .prodmgmt, .overlay .prodrow').count()).toBe(0);
    await page.click('[data-act="close-overlay"]');
    // Personas: mismas clases .prow + .acc-head.
    await page.click('#gearBtn');
    await page.click('[data-act="overlay-tab"][data-overlay="personas"]');
    expect(await page.locator('.overlay .prow .acc-head').count()).toBeGreaterThan(0);
  });

  test('E3 — tabbar anclada por estructura: el scroll del CONTENIDO (.app-scroll) no la mueve', async ({ page }) => {
    await appConPrimadaAbierta(page);
    const r = await page.evaluate(() => {
      const tb = document.querySelector('.tabbar');
      const scroller = document.querySelector('.app-scroll');
      const spacer = document.createElement('div');     // forzar contenido alto en el scroller
      spacer.style.height = '3000px';
      scroller.appendChild(spacer);
      const bottom0 = Math.round(tb.getBoundingClientRect().bottom);
      scroller.scrollTop = 600;                          // scrollea el contenedor interno, no el body
      const bottom1 = Math.round(tb.getBoundingClientRect().bottom);
      const scrolled = scroller.scrollTop;
      const windowScrolled = window.scrollY;
      spacer.remove();
      return { bottom0, bottom1, scrolled, windowScrolled, innerHeight: window.innerHeight };
    });
    // La tabbar es hermana del scroller (hijo flex de .app) → el scroll interno no la mueve, y el
    // body no scrollea (overflow:hidden) → no hay scroll-away de la barra.
    expect(r.scrolled).toBeGreaterThan(0);    // el contenido interno SÍ scrollea
    expect(r.windowScrolled).toBe(0);         // el body/ventana NO scrollea
    expect(r.bottom0).toBe(r.innerHeight);    // tocaba el borde inferior...
    expect(r.bottom1).toBe(r.innerHeight);    // ...y sigue ahí tras scrollear el contenido
  });

  test('E4 — los <select> usan appearance:none + chevron (no flechas nativas)', async ({ page }) => {
    await appConPrimadaAbierta(page);
    await page.click('[data-act="open-config-primada"]'); // el select de rol vive en Configurar (sección Asistentes)
    await page.locator('.overlay [data-act="toggle-cfg-asis"]').first().click(); // expandir la fila-acordeón
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
    const rows = page.locator('.overlay [data-act="toggle-cfg-asis"]'); // filas-acordeón de asistente
    const before = await rows.count();
    expect(before).toBeGreaterThan(1);
    await rows.last().click();                                          // expandir el último (no principal)
    await page.locator('.overlay [data-act="remove-asistencia"]').last().click(); // quitar (en el .acc-body)
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

// ─────────────────────────────────────────────────────────────────────────────
// 5 · SELECTOR de primada (año→mes) + "+" chico + nombre automático
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Selector de primada + nombre automático', () => {
  test('F1 — el tab Primadas NO tiene botón grande "Nueva primada" (es el "+" chico del selector)', async ({ page }) => {
    await abrirApp(page);
    // El disparador de nueva primada existe, pero NO como .btn grande de pantalla.
    expect(await page.locator('#screen .btn[data-act="new-primada"]').count()).toBe(0);
    expect(await page.locator('#screen .icon-btn.nueva[data-act="new-primada"]').count()).toBe(1);
  });

  test('F2 — selector cerrado muestra "Mes Año" + nombre; el "+" abre el wizard', async ({ page }) => {
    await abrirApp(page);
    await sembrarPersonas(page, [{ nombre: 'Ana', estado: 'ahorrador' }]);
    await crearPrimada(page, 'Ana');
    await expect(page.locator('.sel-main').first()).toBeVisible();         // "Junio 2026" (Mes Año)
    await expect(page.locator('.sel-sub').first()).toContainText('Primada Ana'); // nombre auto
    // el "+" abre el wizard (no crea directo)
    await page.click('[data-act="new-primada"]');
    await expect(page.locator('.wz')).toBeVisible();
  });

  test('F3 — el selector abre una hoja agrupada por año→mes con check en la activa', async ({ page }) => {
    await abrirApp(page);
    await sembrarPersonas(page, [{ nombre: 'Ana', estado: 'ahorrador' }, { nombre: 'Beto', estado: 'invitado' }]);
    // dos primadas en años distintos vía Store (rápido y determinista)
    const ids = await page.evaluate(() => {
      const S = window.Store, st = S.select.state();
      const ana = st.personas.find(p => p.nombre === 'Ana').id;
      const a = S.actions.createPrimada({ principalId: ana, organizadores: [ana], mesContable: '2026-06' });
      const b = S.actions.createPrimada({ principalId: ana, organizadores: [ana], mesContable: '2025-12' });
      return { a, b, activa: S.select.state().activePrimadaId };
    });
    await page.click('[data-act="open-selector"]');
    await expect(page.locator('.overlay .sheet-title')).toHaveText('Primadas');
    // dos encabezados de año (2026, 2025), reciente primero
    await expect(page.locator('.overlay .sel-anio')).toHaveCount(2);
    await expect(page.locator('.overlay .sel-anio').first()).toHaveText('2026');
    // la activa (la última creada, 2025-12) lleva check
    const activaFila = page.locator(`.overlay [data-act="select-primada"][data-id="${ids.activa}"]`);
    await expect(activaFila.locator('.sel-check')).toHaveCount(1);
    // elegir la otra (2026-06) la activa y cierra la hoja
    await page.click(`.overlay [data-act="select-primada"][data-id="${ids.a}"]`);
    await expect(page.locator('.overlay')).toBeHidden();
    const activa = await page.evaluate(() => window.Store.select.state().activePrimadaId);
    expect(activa).toBe(ids.a);
  });

  test('F4 — nombre automático "Primada N1 + N2" con dos organizadores (vía wizard)', async ({ page }) => {
    await abrirApp(page);
    await sembrarPersonas(page, [{ nombre: 'Ana López', estado: 'ahorrador' }, { nombre: 'Beto', estado: 'invitado' }]);
    await page.click('[data-act="new-primada"]');
    await page.waitForSelector('.wz');
    await page.evaluate((n) => {
      const sel = document.getElementById('wz-principal');
      const opt = [...sel.options].find(o => o.textContent.includes(n));
      sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, 'Ana');
    await page.click(`[data-act="wz-toggle-coorg"][data-pid="${await page.evaluate(() => window.Store.select.state().personas.find(p => p.nombre === 'Beto').id)}"]`);
    await page.click('[data-act="wz-siguiente"]');   // 1→2
    await page.click('[data-act="wz-siguiente"]');   // 2→3
    await page.click('[data-act="wz-crear"]');
    await page.waitForSelector('.wz', { state: 'detached' });
    const nombre = await page.evaluate(() => window.Store.select.activePrimada().nombre);
    expect(nombre).toBe('Primada Ana + Beto');       // primer token de cada uno
  });
});
