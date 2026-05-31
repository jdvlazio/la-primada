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

  const ui = { tab: 'primadas', overlay: null };

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

    const b = ev.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    const pid = b.dataset.pid;          // personaId
    const id  = b.dataset.id;           // primadaId
    const prm = activeId();
    const A = Store.actions;

    switch (act) {
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
      case 'remove-asistencia': A.removeAsistencia(prm, pid); break;
      case 'toggle-exonerado':  A.toggleCoverExonerado(prm, pid); break;
      case 'item-plus':         A.changeItem(prm, pid, b.dataset.prod, +1); break;
      case 'item-minus':        A.changeItem(prm, pid, b.dataset.prod, -1); break;

      // ----- overlays (engranaje) -----
      case 'open-personas':  ui.overlay = 'personas'; rerender(); return;
      case 'open-ajustes':   ui.overlay = 'ajustes';  rerender(); return;
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
      case 'toggle-estado-persona': {
        const per = Store.select.persona(pid);
        if (per) A.setEstadoPersona(pid, per.estado === 'ahorrador' ? 'invitado' : 'ahorrador');
        break;
      }
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
      default: break;
    }
  }

  function init() {
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
  }

  // Bootstrap único: evento → acción → commit → notifica → render
  function start() {
    View.cache();
    Store.subscribe(rerender);   // la Vista se re-renderiza completa en cada commit del Store
    init();
    Store.load();                // migra lo que haya en localStorage → v4
    rerender();
  }

  root.Controller = { init, start, _ui: ui };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { Controller: root.Controller };
})(typeof window !== 'undefined' ? window : globalThis);
