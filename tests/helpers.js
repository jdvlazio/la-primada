// @ts-check
// ─────────────────────────────────────────────────────────────────────────────
// helpers.js — utilidades compartidas de la suite Playwright de La Primada.
// (Playwright ignora este archivo como test: no termina en .spec.js)
//
// La Primada bootea DIRECTO (CONFIG.backendEnabled=false → localStorage, sin auth
// gate). No hay splash ni selector de festival como en Otrofestiv: goto('/') ya
// renderiza el tab Primadas. El directorio arranca vacío (defaultState.personas=[]),
// así que para crear una primada hay que sembrar ahorradores primero.
// ─────────────────────────────────────────────────────────────────────────────

const SEL = {
  screen: '#screen',
  tabbar: '#tabbar',
  tab: (id) => `.tab[data-tab="${id}"]`,
  tabActive: '.tab.active',
  nuevaPrimada: '[data-act="new-primada"]',   // "+" chico del selector (abre el wizard)
  selector: '[data-act="open-selector"]',     // botón selector (abre la hoja agrupada)
  selMain: '.sel-main',                        // línea-guía del selector: "Mes Año" (+ punto estado)
  selSub: '.sel-sub',                          // identidad tenue: nombre corto (sin "Primada")
  selFila: '.sel-fila',                        // fila de primada dentro de la hoja del selector
  selAnio: '.sel-anio',                        // encabezado de año en la hoja
  wizard: '.wz',
  wzPrincipal: '#wz-principal',
  wzSiguiente: '[data-act="wz-siguiente"]',
  wzCrear: '[data-act="wz-crear"]',
  wzCancelar: '[data-act="wz-cancelar"]',
  accHead: '.acc-head',     // cabecera de fila de asistente (acordeón)
  prmName: '.prm-name',     // nombre de la primada activa (dashboard Resumen)
  cara: (key) => `[data-act="set-cara"][data-cara="${key}"]`,   // switch de cara (Consumos | Resumen)
};

// Arranca la app desde cero: limpia localStorage para un estado determinista.
// Bloquea el SDK de Supabase (CDN): sin `window.supabase` → Api.init cae a modo LOCAL (sin auth
// gate), que es lo que ejercitan los tests (la app sobre localStorage). Con backendEnabled=true en
// producción el CDN sí carga y aparece el login; los tests cubren la lógica de la app, no el auth.
async function abrirApp(page) {
  await page.route(/supabase/i, route => route.abort());
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto('/');
  await page.waitForSelector(SEL.screen, { timeout: 15000 });
  // El tab Primadas es el activo por defecto; espera a que la Vista pinte algo dentro.
  await page.waitForFunction(() => {
    const s = document.getElementById('screen');
    return s && s.children.length > 0;
  }, { timeout: 10000 });
}

// Siembra personas en el directorio vía el Store global (mismo camino que la UI).
// estados: array de {nombre, estado}. Devuelve nada; deja el estado persistido + re-render.
async function sembrarPersonas(page, personas) {
  await page.evaluate((lista) => {
    for (const p of lista) window.Store.actions.addPersona({ nombre: p.nombre, estado: p.estado });
  }, personas);
}

// Flujo completo del wizard: crea una primada con `principalNombre` como principal.
// Asume que ya hay al menos un ahorrador con ese nombre sembrado.
async function crearPrimada(page, principalNombre = 'Ana') {
  await page.click(SEL.nuevaPrimada);
  await page.waitForSelector(SEL.wizard, { timeout: 5000 });
  // Paso 1: elegir principal (select de ahorradores).
  await page.waitForSelector(SEL.wzPrincipal, { timeout: 5000 });
  await page.selectOption(SEL.wzPrincipal, { label: new RegExp(principalNombre) }).catch(async () => {
    // fallback: elegir por value = id de la persona cuyo nombre coincide
    await page.evaluate((nombre) => {
      const sel = document.getElementById('wz-principal');
      const opt = [...sel.options].find(o => o.textContent.includes(nombre));
      if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    }, principalNombre);
  });
  await page.click(SEL.wzSiguiente);   // paso 1 → 2 (productos)
  await page.click(SEL.wzSiguiente);   // paso 2 → 3 (fecha/mes)
  await page.click(SEL.wzCrear);       // crear
  await page.waitForSelector(SEL.wizard, { state: 'detached', timeout: 5000 });
}

// Cuenta de primadas en el estado (vía localStorage espejo).
async function contarPrimadas(page) {
  return page.evaluate(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('laPrimada'));
      return (raw && Array.isArray(raw.primadas)) ? raw.primadas.length : 0;
    } catch (e) { return 0; }
  });
}

module.exports = { SEL, abrirApp, sembrarPersonas, crearPrimada, contarPrimadas };
