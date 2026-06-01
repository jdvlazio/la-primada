/* ============================================================
   CONTROLADOR — Controller (eventos por delegación → Store.actions)
   PASO 2: cableado del tab Primadas + overlays Personas/Ajustes.
   No dibuja ni persiste; solo traduce eventos a acciones y re-renderiza.
   Flujo: evento → acción → commit (Store guarda+notifica) → render.
   ------------------------------------------------------------
   `ui` = estado EFÍMERO de navegación (tab/overlay). Vive aquí, NO en
   el Store: no es estado de dominio ni se persiste. La Vista lo recibe
   como segundo argumento y es pura sobre (estado de dominio + ui).
   ============================================================ */
(function (root) {
  'use strict';

  const Store = root.Store;
  const View  = root.View;
  const Auth  = root.Auth || null;

  // ui = estado EFÍMERO (no dominio, no se persiste):
  // - abiertos: Set de personaId con tarjeta-acordeón expandida (multiabierto)
  // - pickProd: personaId con el chip-picker "+ Agregar" abierto (uno a la vez)
  // - panelProductos: sección "Productos del evento" desplegada
  const ui = { tab: 'primadas', overlay: null, abiertos: new Set(), pickProd: null, panelProductos: false };

  function rerender() { View.render(Store.select.state(), ui); }

  // Envuelve acciones que pueden lanzar por invariante (principal ahorrador, etc.)
  function tryAction(fn) {
    try { fn(); }
    catch (err) { View.toast(err && err.message ? err.message : 'Acción no permitida'); rerender(); }
  }

  function activeId() { const p = Store.select.activePrimada(); return p ? p.id : null; }

  /* ---------- Clicks (delegados en document) ---------- */
  function onClick(ev) {
    // Navegación: tabs y engranaje
    const tab = ev.target.closest('[data-tab]');
    if (tab) { ui.tab = tab.dataset.tab; ui.overlay = null; rerender(); return; }
    if (ev.target.closest('#gearBtn')) { ui.overlay = ui.overlay ? null : 'personas'; rerender(); return; }
    // Botón de cuenta (auth). Con backend habilitado: cerrar sesión. Sin backend: placeholder informativo.
    if (ev.target.closest('#authBtn')) {
      if (Auth && Auth.enabled()) { Auth.signOut(); View.toast('Sesión cerrada'); }
      else View.toast('Cuenta: el inicio de sesión se activa con el backend en la nube');
      return;
    }

    const b = ev.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    const pid = b.dataset.pid;          // personaId
    const id  = b.dataset.id;           // primadaId
    const prm = activeId();
    const A = Store.actions;

    switch (act) {
      // ----- auth (pantalla de login) -----
      case 'login-enviar': {
        const inp = document.getElementById('login-email');
        const email = (inp && inp.value || '').trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { View.toast('Escribe un correo válido'); return; }
        b.disabled = true;
        Promise.resolve(Auth && Auth.signIn(email))
          .then(() => View.renderLogin('sent', email))
          .catch((err) => { View.toast(err && err.message ? err.message : 'No se pudo enviar el link'); View.renderLogin('form', email); });
        return;
      }
      case 'login-reset': View.renderLogin('form'); return;

      // ----- ciclo de primada -----
      case 'new-primada': {
        A.createPrimada({});            // incompleta: el principal se asigna asignando rol
        View.toast('Primada creada · asigna el principal en una asistencia ahorradora');
        break;
      }
      case 'select-primada':   A.seleccionarPrimada(id); break;
      case 'cerrar-primada':   A.cerrarPrimada(id);  View.toast('Cuenta cerrada (sigue aceptando abonos)'); break;
      case 'reabrir-primada':  A.reabrirPrimada(id); break;
      case 'borrar-primada':
        if (root.confirm ? root.confirm('¿Borrar esta primada? No se puede deshacer.') : true) A.borrarPrimada(id);
        break;

      // ----- asistencias -----
      case 'add-asistencia': {
        const seln = document.getElementById('as-pick');
        if (seln && seln.value) A.addAsistencia(prm, seln.value);
        break;
      }
      case 'remove-asistencia': A.removeAsistencia(prm, pid); ui.abiertos.delete(pid); break;
      case 'toggle-exonerado':  A.toggleCoverExonerado(prm, pid); break;
      case 'item-plus':         A.changeItem(prm, pid, b.dataset.prod, +1); break;
      case 'item-minus':        A.changeItem(prm, pid, b.dataset.prod, -1); break;

      // ----- acordeón de asistencias (estado efímero de UI) -----
      case 'toggle-asis': {
        if (ui.abiertos.has(pid)) { ui.abiertos.delete(pid); if (ui.pickProd === pid) ui.pickProd = null; }
        else ui.abiertos.add(pid);
        rerender(); return;
      }
      // ----- chip-picker "+ Agregar" producto al asistente -----
      case 'open-pickprod':  ui.pickProd = pid; rerender(); return;
      case 'close-pickprod': if (ui.pickProd === pid) ui.pickProd = null; rerender(); return;
      case 'add-item': {
        A.changeItem(prm, pid, b.dataset.prod, +1);   // 0→1: aparece con stepper
        // si ya no quedan productos por agregar, cerramos el picker
        const p = Store.select.activePrimada();
        const a = p && p.asistencias.find(x => x.personaId === pid);
        if (a && Store.select.disponiblesPara(p, a).length === 0) ui.pickProd = null;
        break;
      }

      // ----- gestión de productos del evento -----
      case 'toggle-panel-productos': ui.panelProductos = !ui.panelProductos; rerender(); return;
      case 'remove-producto': A.removeProducto(prm, id); break;
      case 'add-producto': {
        const emoji = (document.getElementById('pn-emoji') || {}).value || '';
        const nombre = ((document.getElementById('pn-nombre') || {}).value || '').trim();
        const costoNeto = Number((document.getElementById('pn-costo') || {}).value) || 0;
        const precioVenta = Number((document.getElementById('pn-venta') || {}).value) || 0;
        if (!nombre) { View.toast('Escribe el nombre del producto'); return; }
        A.addProducto(prm, { nombre, emoji: emoji || '•', costoNeto, precioVenta });
        View.toast('Producto agregado a esta primada');
        break;
      }

      // ----- abonos/pagos (válidos AUNQUE la primada esté cerrada) -----
      case 'abonar': {
        const inp = document.getElementById('abono-' + pid);
        const monto = inp ? Number(inp.value) : 0;
        if (!monto || monto <= 0) { View.toast('Escribe un monto mayor a 0'); return; }
        A.registrarAbono(prm, pid, monto);
        View.toast('Abono registrado');
        break;
      }
      case 'remove-abono': A.removerAbono(prm, pid, b.dataset.abono); break;

      // ----- pantallas del engranaje (Personas / Ajustes) -----
      case 'open-personas':  ui.overlay = 'personas'; rerender(); return;
      case 'open-ajustes':   ui.overlay = 'ajustes';  rerender(); return;
      case 'overlay-tab':    ui.overlay = b.dataset.overlay; rerender(); return;
      case 'close-overlay':  ui.overlay = null;       rerender(); return;
      case 'add-persona': {
        const n = document.getElementById('np-nombre');
        const es = document.getElementById('np-estado');
        const nombre = (n && n.value || '').trim();
        if (!nombre) { View.toast('Escribe un nombre'); return; }
        A.addPersona({ nombre, estado: es ? es.value : 'ahorrador' });
        View.toast('Persona agregada al directorio');
        break;
      }
      // INVARIANTE #1: solo cambia el estado VIGENTE; NUNCA toca estadoEnEseMomento de asistencias pasadas.
      case 'set-estado-persona': A.setEstadoPersona(pid, b.dataset.estado); break;
      default: break;
    }
  }

  /* ---------- Cambios de inputs/selects (delegados en document) ---------- */
  function onChange(ev) {
    const t = ev.target.closest('[data-ch]'); if (!t) return;
    const ch = t.dataset.ch;
    const pid = t.dataset.pid;
    const id  = t.dataset.id;
    const v   = t.value;
    const prm = activeId();
    const A = Store.actions;

    switch (ch) {
      case 'rename-primada': A.renombrarPrimada(id, v); break;
      case 'fecha-primada':  A.setFecha(id, v); break;
      case 'mes-primada':    A.setMesContable(id, v); break;
      // INVARIANTE #2: setRol('principal') lanza si el snapshot no es ahorrador → atrapamos y avisamos.
      case 'rol':            tryAction(() => A.setRol(prm, pid, v)); break;
      case 'rename-persona': A.renombrarPersona(pid, v); break;
      case 'breb-persona':   A.setBreBPersona(pid, v); break;
      case 'cover-ahorrador': A.setCover({ ahorrador: v }); break;
      case 'cover-invitado':  A.setCover({ invitado: v }); break;
      // Precios de producto de la primada → commitQuiet en el Store (sin re-render, no pierde foco).
      case 'costo-producto':  A.setPreciosProducto(prm, id, { costoNeto: v }); break;
      case 'venta-producto':  A.setPreciosProducto(prm, id, { precioVenta: v }); break;
      default: break;
    }
  }

  function init() {
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    // Al salir de un input de texto en vivo (commitQuiet debounced), forzar el envío pendiente.
    document.addEventListener('blur', (ev) => {
      if (ev.target && ev.target.matches && ev.target.matches('[data-ch]') && Store.flushQuiet) Store.flushQuiet();
    }, true);
  }

  let appIniciada = false;

  // Hidrata y muestra la app autenticada (una sola vez).
  async function iniciarApp() {
    if (appIniciada) { rerender(); return; }
    appIniciada = true;
    if (View.showAppChrome) View.showAppChrome();
    // Ícono del botón de cuenta: 'in' si hay sesión real; 'user' (placeholder) si el backend está off.
    if (View.renderAuthButton) View.renderAuthButton(Auth && Auth.enabled() ? 'in' : 'placeholder');
    rerender();                                // "Cargando…" mientras hidrata
    await Store.load();                        // hidrata el AppState desde Api (async)
    rerender();
  }

  // Auth gate: con auth habilitada (modo supabase), exige sesión antes de mostrar datos.
  // Sin auth (tests/offline, modo local) → entra directo (los 216 tests no tienen gate).
  async function gate() {
    if (!Auth || !Auth.enabled()) { await iniciarApp(); return; }
    Auth.cleanUrl();                           // limpia el token del magic link de la URL
    Auth.onChange((session) => { if (session) iniciarApp(); else { appIniciada = false; View.renderLogin('form'); } });
    const session = await Auth.getSession();
    if (session) await iniciarApp();
    else View.renderLogin('form');
  }

  // Bootstrap único (async). evento → acción → commit (render optimista + upsert async) → notifica → render.
  async function start() {
    View.cache();
    // Inicializa el adaptador con las credenciales públicas SOLO si el backend está habilitado
    // (CONFIG.backendEnabled). Con backend → modo 'supabase' + auth gate. Sin backend (flag false, o
    // sin SDK en tests/offline) → modo 'local': la app corre sobre localStorage, sin login, usable ya.
    if (root.CONFIG && root.CONFIG.backendEnabled && root.Api && root.CONFIG.supabase) {
      root.Api.init({ url: root.CONFIG.supabase.url, anonKey: root.CONFIG.supabase.anonKey });
    }
    Store.subscribe(rerender);                 // re-render completo en cada commit del Store
    if (Store.subscribeSync) Store.subscribeSync(s => View.renderSync && View.renderSync(s));
    init();
    await gate();                              // auth gate: login o app
  }

  root.Controller = { init, start, _ui: ui };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { Controller: root.Controller };
})(typeof window !== 'undefined' ? window : globalThis);
