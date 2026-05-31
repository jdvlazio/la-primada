/* ============================================================
   VISTA — View (funciones puras estado → DOM)
   PASO 1: render MÍNIMO para confirmar el flujo sobre el modelo v4.
   (Los 3 tabs reales se construyen en el PASO 2.)
   No muta estado ni toca persistencia.
   ============================================================ */
(function (root) {
  'use strict';

  const Util  = root.Util;
  const Store = root.Store;
  const els = {};

  function cache() {
    els.screen = document.getElementById('screen');
    els.toast  = document.getElementById('toast');
  }

  function badge(text, cls) { return `<span class="badge ${cls || ''}">${text}</span>`; }

  function activePanel() {
    const S = Store.select;
    const p = S.activePrimada();
    if (!p) return '<div class="empty">No hay primada activa.<br>Crea una con “+ Primada”.</div>';
    const inf = S.informePrincipal(p);
    const inc = S.primadaIncompleta(p) ? ' ' + badge('sin principal', 'warn') : '';
    return `<div class="panel">
        <div class="panel-title">${Util.esc(p.nombre)}${inc}</div>
        <div class="kv"><span>Mes contable</span><b>${Util.esc(Util.monthLabel(p.mesContable))}</b></div>
        <div class="kv"><span>Estado</span><b>${p.estado}</b></div>
        <div class="kv"><span>Asistencias</span><b>${p.asistencias.length}</b></div>
        <div class="kv"><span>Recaudado</span><b>${Util.peso(S.recaudado(p))}</b></div>
        <div class="kv"><span>Ganancia (al Tesorero)</span><b>${Util.peso(inf.entregaTesorero)}</b></div>
        <div class="kv"><span>Reparte entre</span><b>${S.asistenciasAhorradoras(p).length} ahorrador(es)</b></div>
      </div>`;
  }

  function primadaItem(state, p) {
    const S = Store.select;
    const activo = p.id === state.activePrimadaId ? 'active' : '';
    const inc = S.primadaIncompleta(p) ? ' ' + badge('incompleta', 'warn') : '';
    return `<button class="pitem ${activo}" data-act="select-primada" data-id="${p.id}">
        <div class="pitem-main">
          <div class="pitem-name">${Util.esc(p.nombre)}${inc}</div>
          <div class="pitem-meta">${Util.esc(Util.monthLabel(p.mesContable))} · ${p.asistencias.length} asist. · ${p.estado}</div>
        </div>
        <div class="pitem-num"><div class="muted">recaudo</div><b>${Util.peso(S.recaudado(p))}</b></div>
      </button>`;
  }

  function render(state) {
    const nPer = state.personas.length, nPrm = state.primadas.length;
    els.screen.innerHTML = `
      <div class="status">Modelo <b>v${state.schemaVersion}</b> cableado ✓ · ${nPer} persona(s) · ${nPrm} primada(s) en el directorio.</div>

      <div class="bar">
        <button class="btn" data-act="new-primada">+ Primada</button>
        <button class="btn ghost" data-act="new-persona">+ Persona</button>
      </div>

      ${activePanel()}

      <h2 class="h2">Primadas</h2>
      <div class="plist">
        ${nPrm ? state.primadas.map(p => primadaItem(state, p)).join('') : '<div class="empty">Aún no hay primadas.</div>'}
      </div>

      <div class="note">PASO 1 · cableado mínimo del modelo v4.<br>El tab <b>Primadas</b> completo (organizadores, consumos, cover, informe) llega en el PASO 2.</div>`;
  }

  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg; els.toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
  }

  root.View = { cache, render, toast };
  if (typeof module !== 'undefined' && module.exports) module.exports = { View: root.View };
})(typeof window !== 'undefined' ? window : globalThis);
