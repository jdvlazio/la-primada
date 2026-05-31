/* ============================================================
   VISTA — View (funciones puras estado → DOM)
   PASO 2: tab Primadas (corazón) + overlays Personas/Ajustes.
   Render puro: recibe (state, ui) y dibuja. NO muta estado ni persiste.
   `ui` es estado EFÍMERO de navegación (tab/overlay) que vive en el
   Controller — NO es estado de dominio, por eso no entra al Store v4.
   ============================================================ */
(function (root) {
  'use strict';

  const Util  = root.Util;
  const Store = root.Store;
  const S     = () => Store.select;
  const els = {};

  function cache() {
    els.screen  = document.getElementById('screen');
    els.overlay = document.getElementById('overlay');
    els.toast   = document.getElementById('toast');
    els.tabbar  = document.getElementById('tabbar');
  }

  /* ---------- helpers de marcado ---------- */
  const e = Util.esc;
  const $peso = Util.peso;
  function badge(text, cls) { return `<span class="badge ${cls || ''}">${e(text)}</span>`; }
  function nombrePersona(id) { const p = S().persona(id); return p ? p.nombre : '—'; }

  /* ============================================================
     TAB PRIMADAS (corazón)
     ============================================================ */
  function primadaCabecera(p) {
    const cerrada = p.estado === 'cerrada';
    const inc = S().primadaIncompleta(p) ? ' ' + badge('sin principal', 'warn') : '';
    const ro = cerrada ? 'disabled' : '';
    return `<div class="card">
      <div class="card-head">
        <input class="ti name" data-ch="rename-primada" data-id="${p.id}" value="${e(p.nombre)}" ${ro} maxlength="40" aria-label="Nombre de la primada">
        ${inc}
      </div>
      <div class="grid2">
        <label class="fld"><span>Fecha</span>
          <input class="ti" type="date" data-ch="fecha-primada" data-id="${p.id}" value="${e(p.fecha)}" ${ro}></label>
        <label class="fld"><span>Mes contable</span>
          <input class="ti" type="month" data-ch="mes-primada" data-id="${p.id}" value="${e(p.mesContable)}" ${ro}></label>
      </div>
      <div class="row gap end">
        <span class="state ${cerrada ? 'closed' : 'open'}">${cerrada ? '🔒 Cerrada' : '🟢 Abierta'}</span>
        ${cerrada
          ? `<button class="mini" data-act="reabrir-primada" data-id="${p.id}">Reabrir</button>`
          : `<button class="mini" data-act="cerrar-primada" data-id="${p.id}">Cerrar cuenta</button>`}
        <button class="mini danger" data-act="borrar-primada" data-id="${p.id}">Borrar</button>
      </div>
    </div>`;
  }

  function productosStepper(p, a) {
    const cerrada = p.estado === 'cerrada';
    return p.productos.map(prod => {
      const q = a.items[prod.id] || 0;
      const dis = cerrada ? 'disabled' : '';
      return `<div class="prod ${q ? 'has' : ''}">
        <span class="prod-name">${e(prod.emoji)} ${e(prod.nombre)} <i>${$peso(prod.precioVenta)}</i></span>
        <span class="stepper">
          <button class="step" data-act="item-minus" data-pid="${a.personaId}" data-prod="${prod.id}" ${dis} aria-label="menos">−</button>
          <b class="qty">${q}</b>
          <button class="step" data-act="item-plus" data-pid="${a.personaId}" data-prod="${prod.id}" ${dis} aria-label="más">+</button>
        </span>
      </div>`;
    }).join('');
  }

  function coverLinea(p, a) {
    const cerrada = p.estado === 'cerrada';
    const dis = cerrada ? 'disabled' : '';
    if (a.rol !== 'asistente') {
      return `<div class="cover org">Sin cover · organizador (su margen sí entra al fondo)</div>`;
    }
    const cv = S().coverDe(p, a);
    if (a.coverExonerado) {
      return `<div class="cover">Cover <b>exonerado</b> ($0)
        <button class="mini" data-act="toggle-exonerado" data-pid="${a.personaId}" ${dis}>Cobrar cover</button></div>`;
    }
    return `<div class="cover">Cover <b>${$peso(cv)}</b> <i>(${a.estadoEnEseMomento})</i>
      <button class="mini" data-act="toggle-exonerado" data-pid="${a.personaId}" ${dis}>Exonerar</button></div>`;
  }

  function rolSelect(p, a) {
    const cerrada = p.estado === 'cerrada';
    const esAhorrador = a.estadoEnEseMomento === 'ahorrador';
    // INVARIANTE #2: solo un snapshot 'ahorrador' puede ser principal → la opción se deshabilita si no.
    const opt = (val, label) => {
      const disabled = (val === 'principal' && !esAhorrador) ? 'disabled' : '';
      const sel = a.rol === val ? 'selected' : '';
      return `<option value="${val}" ${sel} ${disabled}>${label}</option>`;
    };
    return `<select class="sel rol" data-ch="rol" data-pid="${a.personaId}" data-id="${p.id}" ${cerrada ? 'disabled' : ''}>
      ${opt('asistente', 'Asistente')}
      ${opt('organizador', 'Organizador')}
      ${opt('principal', 'Principal' + (esAhorrador ? '' : ' (solo ahorrador)'))}
    </select>`;
  }

  function asistenciaCard(p, a) {
    const cerrada = p.estado === 'cerrada';
    const total = S().totalAsistencia(p, a);
    const esPrin = S().esPrincipal(p, a);
    const saldo = S().saldoDe(p, a);
    const snapBadge = badge(a.estadoEnEseMomento, a.estadoEnEseMomento === 'ahorrador' ? 'good' : '');
    return `<div class="asis ${esPrin ? 'is-principal' : ''}">
      <div class="asis-head">
        <div class="asis-id">
          <b>${e(nombrePersona(a.personaId))}</b> ${snapBadge}
          ${esPrin ? badge('principal', 'red') : ''}
        </div>
        <div class="asis-ctl">
          ${rolSelect(p, a)}
          <button class="mini danger" data-act="remove-asistencia" data-pid="${a.personaId}" ${cerrada ? 'disabled' : ''} aria-label="quitar">✕</button>
        </div>
      </div>
      ${coverLinea(p, a)}
      <div class="prods">${productosStepper(p, a)}</div>
      <div class="asis-foot">
        <span>Total <b>${$peso(total)}</b></span>
        ${esPrin ? `<span class="muted">auto-saldado (principal)</span>`
                 : `<span>Saldo <b class="${saldo > 0 ? 'owe' : ''}">${$peso(saldo)}</b></span>`}
      </div>
      ${abonosBlock(p, a)}
    </div>`;
  }

  // Abonos/pagos por asistencia. SIGUE activo aunque la primada esté cerrada (INVARIANTE #4):
  // la cuenta se cierra, pero los pagos llegan después. El principal está auto-saldado → sin abonos.
  function abonosBlock(p, a) {
    if (S().esPrincipal(p, a)) return '';
    const total = S().totalAsistencia(p, a);
    const abonos = a.abonos || [];
    if (total <= 0 && abonos.length === 0) return '';
    const abonado = S().abonadoDe(a);
    const lista = abonos.length
      ? `<div class="abonos">${abonos.map(b =>
          `<div class="abono"><span>${e(b.fecha)}</span><b>${$peso(b.monto)}</b><button class="xmini" data-act="remove-abono" data-pid="${a.personaId}" data-abono="${b.id}" aria-label="quitar abono">✕</button></div>`).join('')}</div>`
      : '';
    return `<div class="pay">
      <div class="pay-form">
        <input class="ti" id="abono-${a.personaId}" type="number" min="0" step="1000" inputmode="numeric" placeholder="Registrar abono…" aria-label="Monto del abono">
        <button class="mini" data-act="abonar" data-pid="${a.personaId}">Abonar</button>
      </div>
      ${abonado ? `<div class="pay-sum muted small">Abonado: <b>${$peso(abonado)}</b></div>` : ''}
      ${lista}
    </div>`;
  }

  function pickerAsistentes(p) {
    if (p.estado === 'cerrada') return '';
    const dentro = new Set(p.asistencias.map(a => a.personaId));
    const fuera = S().personasOrdenadas().filter(per => !dentro.has(per.id));
    const opts = fuera.length
      ? fuera.map(per => `<option value="${per.id}">${e(per.nombre)} · ${per.estado}</option>`).join('')
      : '';
    return `<div class="addbar">
      <select class="sel" id="as-pick" ${fuera.length ? '' : 'disabled'}>
        ${fuera.length ? opts : '<option>— directorio vacío —</option>'}
      </select>
      <button class="mini" data-act="add-asistencia" ${fuera.length ? '' : 'disabled'}>+ Asistente</button>
      <button class="mini ghost" data-act="open-personas">Nueva persona</button>
    </div>`;
  }

  function reparto(p) {
    const sel = S();
    const gan = sel.ganancia(p);
    const ahorr = sel.asistenciasAhorradoras(p);
    const pi = sel.parteIgual(p);
    const sob = sel.sobranteFondo(p);
    const lista = ahorr.length
      ? ahorr.map(a => `<div class="kv"><span>${e(nombrePersona(a.personaId))}</span><b>${$peso(pi)}</b></div>`).join('')
      : `<div class="muted small">Sin asistencias ahorradoras todavía.</div>`;
    return `<div class="card dark">
      <div class="card-title">Reparto del fondo</div>
      <div class="kv"><span>Cover cobrado</span><b>${$peso(sel.coverCobrado(p))}</b></div>
      <div class="kv"><span>Margen de productos</span><b>${$peso(sel.margenTotal(p))}</b></div>
      <div class="kv total"><span>Ganancia de la primada</span><b>${$peso(gan)}</b></div>
      <div class="kv"><span>Asistencias ahorradoras</span><b>${ahorr.length}</b></div>
      <div class="kv"><span>Parte igual c/u</span><b>${$peso(pi)}</b></div>
      <div class="kv"><span>Sobrante (queda en el fondo)</span><b>${$peso(sob)}</b></div>
      <div class="sub">Reparto por persona</div>
      ${lista}
    </div>`;
  }

  function informe(p) {
    const sel = S();
    const inf = sel.informePrincipal(p);
    if (inf.incompleta) {
      return `<div class="card">
        <div class="card-title">Informe del principal</div>
        <div class="muted small">Asigna un <b>principal</b> (rol en una asistencia ahorradora) para ver cuánto recupera y entrega al Tesorero.</div>
      </div>`;
    }
    const prinId = p.organizadorPrincipalId;
    const deud = sel.deudores(p).filter(d => d.personaId !== prinId);
    const deudList = deud.length
      ? deud.map(d => `<div class="kv"><span>${e(nombrePersona(d.personaId))}</span><b class="owe">${$peso(d.saldo)}</b></div>`).join('')
      : `<div class="muted small">Nadie debe (o aún no se registran consumos).</div>`;
    return `<div class="card">
      <div class="card-title">Informe del principal — ${e(nombrePersona(prinId))}</div>
      <div class="kv"><span>Llave de pago (Bre-B)</span><b>${p.pago.breB ? e(p.pago.breB) : '— sin llave —'}</b></div>
      <div class="kv"><span>Recaudo teórico</span><b>${$peso(inf.recaudadoTeorico)}</b></div>
      <div class="kv"><span>Recupera de su bolsillo</span><b>${$peso(inf.recuperaPrincipal)}</b></div>
      <div class="kv total"><span>Entrega al Tesorero</span><b>${$peso(inf.entregaTesorero)}</b></div>
      <div class="kv"><span>Recaudado real</span><b>${$peso(inf.recaudadoReal)}</b></div>
      <div class="kv subkv"><span>· abonos de terceros</span><b>${$peso(inf.abonosTerceros)}</b></div>
      <div class="kv subkv"><span>· del principal (en mano)</span><b>${$peso(inf.autoAbonoPrincipal)}</b></div>
      <div class="kv"><span>Saldo pendiente <i>(deuda de terceros)</i></span><b class="${inf.saldoPendiente > 0 ? 'owe' : ''}">${$peso(inf.saldoPendiente)}</b></div>
      <div class="sub">Quién debe</div>
      ${deudList}
    </div>`;
  }

  function primadaDetalle(p) {
    return `${primadaCabecera(p)}
      <h2 class="h2">Asistencias <span class="muted">(${p.asistencias.length})</span></h2>
      ${pickerAsistentes(p)}
      <div class="asis-list">
        ${p.asistencias.length
          ? p.asistencias.map(a => asistenciaCard(p, a)).join('')
          : '<div class="empty">Aún no hay asistencias. Agrega personas del directorio.</div>'}
      </div>
      ${reparto(p)}
      ${informe(p)}`;
  }

  // Ítem del historial. Las cifras salen de los SNAPSHOTS de esa primada (cover y precios
  // congelados al crearla), no de los valores globales de hoy → muestra "lo que fue".
  function primadaItem(state, p) {
    const sel = S();
    const inc = sel.primadaIncompleta(p) ? ' ' + badge('incompleta', 'warn') : '';
    const estado = p.estado === 'cerrada' ? badge('cerrada', '') : badge('abierta', 'good');
    return `<button class="pitem" data-act="select-primada" data-id="${p.id}">
      <div class="pitem-main">
        <div class="pitem-name">${e(p.nombre)}${inc}</div>
        <div class="pitem-meta">${e(Util.monthLabel(p.mesContable))} · ${e(p.fecha)} · ${p.asistencias.length} asist. ${estado}</div>
      </div>
      <div class="pitem-num">
        <div><span class="muted">recaudo</span> <b>${$peso(sel.recaudado(p))}</b></div>
        <div><span class="muted">ganancia</span> <b class="g">${$peso(sel.ganancia(p))}</b></div>
      </div>
    </button>`;
  }

  function tabPrimadas(state) {
    const activa = S().activePrimada();
    // Historial: todas menos la activa, más recientes arriba (por fecha).
    const otras = state.primadas
      .filter(p => !activa || p.id !== activa.id)
      .slice()
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
    return `
      <div class="bar">
        <button class="btn" data-act="new-primada">+ Nueva primada</button>
      </div>
      ${activa ? primadaDetalle(activa)
               : '<div class="empty">No hay primada activa.<br>Crea una con “+ Nueva primada”.</div>'}
      ${otras.length ? `<h2 class="h2">Historial <span class="muted">(${otras.length})</span></h2>
        <div class="muted small" style="margin:-4px 2px 8px">Toca una para abrirla. Cada una muestra sus valores congelados (cover y precios de cuando se creó).</div>
        <div class="plist">${otras.map(p => primadaItem(state, p)).join('')}</div>` : ''}`;
  }

  /* ============================================================
     TABS Resumen / Fondo (placeholders)
     ============================================================ */
  function placeholder(titulo, txt) {
    return `<div class="empty big"><div class="ph-title">${e(titulo)}</div><div>${txt}</div>
      <div class="badge warn" style="margin-top:10px">Próximamente</div></div>`;
  }

  /* ============================================================
     PANTALLAS detrás del engranaje: Personas (directorio) y Ajustes
     ============================================================ */
  // Tarjeta de una persona: nombre editable, estado VIGENTE (segmentado), llave Bre-B,
  // y cuántas primadas la incluyen (su historia se conserva al cambiar de estado — INVARIANTE #1).
  function personaCard(per) {
    const ap = S().aparicionesDe(per.id);
    const seg = est => `<button class="seg ${per.estado === est ? 'on' : ''}" data-act="set-estado-persona" data-pid="${per.id}" data-estado="${est}">${est}</button>`;
    return `<div class="pcard">
      <input class="ti" data-ch="rename-persona" data-pid="${per.id}" value="${e(per.nombre)}" maxlength="40" aria-label="Nombre">
      <div class="pcard-row">
        <div class="seg-nav sm">${seg('ahorrador')}${seg('invitado')}</div>
        <span class="muted small">${ap ? 'en ' + ap + ' primada' + (ap > 1 ? 's' : '') : 'sin primadas aún'}</span>
      </div>
      <input class="ti breb" data-ch="breb-persona" data-pid="${per.id}" value="${per.breB ? e(per.breB) : ''}" placeholder="Llave Bre-B / QR" aria-label="Llave Bre-B / QR">
    </div>`;
  }

  function personasBody(state) {
    const personas = S().personasOrdenadas();
    const cuerpo = personas.length
      ? `<div class="people">${personas.map(personaCard).join('')}</div>`
      : '<div class="empty">Directorio vacío. Crea la primera persona abajo.</div>';
    return `${cuerpo}
      <div class="sub">Nueva persona</div>
      <div class="addbar">
        <input class="ti" id="np-nombre" placeholder="Nombre" maxlength="40">
        <select class="sel" id="np-estado">
          <option value="ahorrador">ahorrador</option>
          <option value="invitado">invitado</option>
        </select>
        <button class="mini" data-act="add-persona">+ Agregar</button>
      </div>
      <div class="muted small" style="margin-top:10px">Cambiar el estado aplica <b>de aquí en adelante</b>: las asistencias ya registradas conservan su snapshot — la historia no se reescribe.</div>`;
  }

  function ajustesBody(state) {
    const c = state.settings.cover;
    return `<div class="sub">Cover vigente (aplica a primadas NUEVAS)</div>
      <div class="grid2">
        <label class="fld"><span>Ahorrador</span>
          <input class="ti" type="number" min="0" step="500" data-ch="cover-ahorrador" value="${c.ahorrador}"></label>
        <label class="fld"><span>Invitado</span>
          <input class="ti" type="number" min="0" step="500" data-ch="cover-invitado" value="${c.invitado}"></label>
      </div>
      <div class="muted small" style="margin-top:8px">Editar el cover NO reescribe el snapshot de primadas ya creadas.</div>`;
  }

  // Sheet a pantalla completa con seg-nav Personas | Ajustes.
  function overlaySheet(active, state) {
    const seg = (key, label) => `<button class="seg ${active === key ? 'on' : ''}" data-act="overlay-tab" data-overlay="${key}">${label}</button>`;
    const body = active === 'ajustes' ? ajustesBody(state) : personasBody(state);
    return `<div class="sheet full">
      <div class="sheet-head">
        <div class="seg-nav">${seg('personas', 'Personas')}${seg('ajustes', 'Ajustes')}</div>
        <button class="gear" data-act="close-overlay" aria-label="Cerrar">✕</button>
      </div>
      <div class="sheet-body">${body}</div>
    </div>`;
  }

  /* ============================================================
     RENDER raíz: (state, ui) → DOM
     ------------------------------------------------------------
     Re-render completo de la sección (deliberado). Para que escribir
     sea fluido, las ediciones de texto persisten SIN disparar render
     (Store.commitQuiet): así no se reconstruye el campo en plena
     edición ni se pelea con el foco. Los cambios estructurales
     (consumos, roles, abonos, navegación) sí re-renderizan.
     ============================================================ */
  function render(state, ui) {
    ui = ui || { tab: 'primadas', overlay: null };

    // 1) tabbar: marcar el activo
    if (els.tabbar) {
      els.tabbar.querySelectorAll('.tab').forEach(t =>
        t.classList.toggle('active', t.dataset.tab === ui.tab));
    }

    // 2) contenido del tab
    let html;
    if (ui.tab === 'resumen')      html = placeholder('Resumen', 'El dashboard del fondo (totales y estado) se construye luego de Primadas.');
    else if (ui.tab === 'fondo')   html = placeholder('Fondo', 'Tesorería: aportes, retiros, préstamos y actividades extra.');
    else                           html = tabPrimadas(state);
    els.screen.innerHTML = html;

    // 3) overlay/pantalla detrás del engranaje (Personas / Ajustes)
    if (ui.overlay === 'personas' || ui.overlay === 'ajustes') els.overlay.innerHTML = overlaySheet(ui.overlay, state);
    else                                                        els.overlay.innerHTML = '';
    els.overlay.hidden = !ui.overlay;
  }

  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg; els.toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2400);
  }

  root.View = { cache, render, toast };
  if (typeof module !== 'undefined' && module.exports) module.exports = { View: root.View };
})(typeof window !== 'undefined' ? window : globalThis);
