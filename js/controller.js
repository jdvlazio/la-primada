/* ============================================================
   CONTROLADOR — Controller (eventos por delegación → Store.actions)
   PASO 1: wiring MÍNIMO. No dibuja ni persiste.
   Incluye el bootstrap (solo en navegador).
   Flujo: evento → acción → commit → notifica → render.
   ============================================================ */
(function (root) {
  'use strict';

  const Store = root.Store;
  const View  = root.View;

  // Eventos de la pantalla (delegación sobre #screen)
  function onScreenClick(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const { act, id } = b.dataset;
    if (act === 'new-primada') {
      const n = Store.select.state().primadas.length + 1;
      Store.actions.createPrimada({ nombre: 'Primada de prueba ' + n });   // sin principal → queda incompleta
      View.toast('Primada creada (incompleta: el principal se asigna en el PASO 2)');
    } else if (act === 'new-persona') {
      const n = Store.select.state().personas.length + 1;
      Store.actions.addPersona({ nombre: 'Persona ' + n, estado: 'ahorrador' });
      View.toast('Persona agregada al directorio');
    } else if (act === 'select-primada') {
      Store.actions.seleccionarPrimada(id);
    }
  }

  // Placeholders de navegación (se cablean en PASO 2)
  function onTabClick(e) { const b = e.target.closest('[data-tab]'); if (!b) return; View.toast('Tab “' + b.dataset.tab + '” se construye en el PASO 2'); }
  function onGear() { View.toast('Personas y Ajustes: detrás del engranaje (PASO 2)'); }

  function init() {
    document.getElementById('screen').addEventListener('click', onScreenClick);
    document.getElementById('tabbar').addEventListener('click', onTabClick);
    document.getElementById('gearBtn').addEventListener('click', onGear);
  }

  // Bootstrap único: evento → acción → commit → notifica → render
  function start() {
    View.cache();
    Store.subscribe(View.render);   // la Vista se re-renderiza completa en cada commit
    init();
    Store.load();                   // migra lo que haya en localStorage → v4
    View.render(Store.select.state());
  }

  root.Controller = { init, start };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { Controller: root.Controller };
})(typeof window !== 'undefined' ? window : globalThis);
