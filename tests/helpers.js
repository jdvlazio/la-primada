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

// IA list→detalle: HOME (lista) + DETALLE (operación). Sin tab bar, sin selector-overlay.
const SEL = {
  screen: '#screen',
  topbar: '#topbar',
  nuevaPrimada: '[data-act="new-primada"]',   // "+" en la topbar del HOME (único punto de creación → wizard)
  ajustes: '[data-act="open-ajustes"]',        // ⚙ Ajustes (gear global interim) en la topbar del HOME
  cuenta: '#authBtn',                          // 👤 Cuenta en la topbar del HOME
  hero: '.hero-card',                          // hero de la primada activa en el HOME
  histFila: '.hist-fila',                      // fila de historial en el HOME
  entrar: (id) => `[data-act="entrar-primada"][data-id="${id}"]`,
  volverHome: '[data-act="volver-home"]',      // ← Inicio en la topbar del DETALLE
  configPrimada: '[data-act="open-config-primada"]',   // ··· en la topbar del DETALLE
  wizard: '.wz',
  wzPrincipal: '#wz-principal',
  wzSiguiente: '[data-act="wz-siguiente"]',
  wzCrear: '[data-act="wz-crear"]',
  wzCancelar: '[data-act="wz-cancelar"]',
  accHead: '.acc-head',     // cabecera de fila-acordeón (Configurar Productos / Personas)
  asisFila: '.asis-fila',   // fila de asistente en la cara Consumos (Modelo 3, lista viva; tap = activar)
  balanceToggle: '[data-act="toggle-balance-panel"]',   // chip que despliega/colapsa el panel de Balance
  balancePanel: '.balance-panel',                       // panel de Balance (debajo de la Lista viva)
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
async function irHome(page) {
  if (await page.locator(SEL.volverHome).count()) await page.click(SEL.volverHome);
}

async function entrarDetalle(page, id) {
  await irHome(page);
  const sel = id ? SEL.entrar(id) : SEL.hero;
  await page.click(sel);
  await page.waitForSelector(SEL.volverHome, { timeout: 5000 });
}

async function crearPrimada(page, principalNombre = 'Ana') {
  // ÚNICO punto de creación: el "+" de la topbar del HOME (abre el wizard de 3 pasos).
  await irHome(page);
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

// ÚNICA config: el gear global › Primadas embebe la config del evento activo (Asistentes/Productos) arriba
// del calendario. Deja esa vista lista (el gear abre context-aware en Primadas si hay una activa).
// Config del EVENTO activo = "···" en la topbar del DETALLE → hoja config-primada (Asistentes | Productos).
async function abrirConfig(page) {
  if (!await page.locator(SEL.volverHome).count()) await entrarDetalle(page);
  await page.click(SEL.configPrimada);
}

// Gear global (interim Fase 1): ⚙ del HOME → overlay de 4 tabs. `tab` opcional para navegar dentro.
async function abrirGear(page, tab) {
  await irHome(page);
  await page.click(SEL.ajustes);
  if (tab) await page.click(`[data-act="overlay-tab"][data-overlay="${tab}"]`);
}

module.exports = { SEL, abrirApp, sembrarPersonas, crearPrimada, contarPrimadas, abrirConfig, abrirGear, irHome, entrarDetalle };
