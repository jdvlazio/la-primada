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

  /* ---------- Iconografía: Lucide, SVG inline (ver DESIGN.md › Iconografía) ----------
     Solo los <path>/<line> de cada ícono, copiados de lucide.dev (licencia ISC).
     stroke = currentColor (hereda el color del botón → teal por defecto, --alert en destructivos),
     sin fill, stroke-width 1.75, viewBox 0 0 24 24. */
  const ICON_PATHS = {
    'settings-2': '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
    'user':       '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    'log-in':     '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/>',
    'log-out':    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
    'plus-circle':'<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/>',
    'trash-2':    '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    'check':      '<polyline points="20 6 9 17 4 12"/>',
    'x':          '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    'chevron-down':'<path d="m6 9 6 6 6-6"/>',
  };
  // icon(name, cls?) → <svg> inline. La clase .icon dimensiona; cls extra opcional.
  function icon(name, cls) {
    const p = ICON_PATHS[name]; if (!p) return '';
    return `<svg class="icon ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  }

  /* ============================================================
     TAB PRIMADAS (corazón)
     ============================================================ */
  // Cabecera COMPACTA de la primada activa (operar): nombre + estado + acceso a config (engranaje).
  // La configuración (fecha, mes, cerrar, borrar) vive detrás del engranaje, NO expuesta aquí.
  function primadaCabecera(p) {
    const cerrada = p.estado === 'cerrada';
    const inc = S().primadaIncompleta(p) ? ' ' + badge('sin principal', 'warn') : '';
    return `<div class="prm-head">
      <div class="prm-head-main">
        <div class="prm-name">${e(p.nombre)}${inc}</div>
        <div class="prm-meta"><span class="state ${cerrada ? 'closed' : 'open'}">${cerrada ? '🔒 Cerrada' : '🟢 Abierta'}</span>
          <span class="muted small">${e(Util.monthLabel(p.mesContable))}</span></div>
      </div>
      <button class="gear" data-act="open-config-primada" data-id="${p.id}" title="Configurar primada" aria-label="Configurar primada">${icon('settings-2')}</button>
    </div>`;
  }

  // Overlay de CONFIGURACIÓN de la primada (escondido tras el engranaje de la cabecera).
  // Edición de una sola vez + acciones destructivas (cerrar/reabrir, borrar) con confirmación.
  function configPrimadaSheet(state) {
    const p = S().activePrimada();
    if (!p) return `<div class="sheet full"><div class="sheet-head"><div class="sheet-title">Configurar</div>
      <button class="gear" data-act="close-overlay" aria-label="Cerrar">${icon('x')}</button></div>
      <div class="empty">Sin primada</div></div>`;
    const cerrada = p.estado === 'cerrada';
    const ro = cerrada ? 'disabled' : '';
    return `<div class="sheet full">
      <div class="sheet-head">
        <div class="sheet-title">Configurar primada</div>
        <button class="gear" data-act="close-overlay" aria-label="Cerrar">${icon('x')}</button>
      </div>
      <div class="sheet-body">
        <label class="fld"><span>Nombre</span>
          <input class="ti name" data-ch="rename-primada" data-id="${p.id}" value="${e(p.nombre)}" ${ro} maxlength="40" aria-label="Nombre de la primada"></label>
        <div class="grid2">
          <label class="fld"><span>Fecha</span>
            <input class="ti" type="date" data-ch="fecha-primada" data-id="${p.id}" value="${e(p.fecha)}" ${ro}></label>
          <label class="fld"><span>Mes contable</span>
            <input class="ti" type="month" data-ch="mes-primada" data-id="${p.id}" value="${e(p.mesContable)}" ${ro}></label>
        </div>
        <div class="sub">Cuenta</div>
        ${cerrada
          ? `<button class="mini" data-act="reabrir-primada" data-id="${p.id}">Reabrir</button>`
          : `<button class="mini" data-act="cerrar-primada" data-id="${p.id}">Cerrar</button>`}
        <div class="sub danger-sub">Eliminar</div>
        <button class="mini danger" data-act="borrar-primada" data-id="${p.id}">${icon('trash-2')}Borrar</button>
      </div>
    </div>`;
  }

  // Progressive disclosure: SOLO lo consumido (cantidad>0) con stepper. Bajar a 0 lo quita
  // (vuelve a estar disponible en el chip picker). Vacío → mensaje, no tarjeta en blanco.
  function consumoBloque(p, a, ui) {
    const cerrada = p.estado === 'cerrada';
    const dis = cerrada ? 'disabled' : '';
    const consumidos = S().consumidosDe(p, a);
    const filas = consumidos.map(prod => {
      const q = a.items[prod.id] || 0;
      return `<div class="prod has">
        <span class="prod-name">${e(prod.emoji)} ${e(prod.nombre)} <i>${$peso(prod.precioVenta)}</i></span>
        <span class="stepper">
          <button class="step" data-act="item-minus" data-pid="${a.personaId}" data-prod="${prod.id}" ${dis} aria-label="menos">−</button>
          <b class="qty">${q}</b>
          <button class="step" data-act="item-plus" data-pid="${a.personaId}" data-prod="${prod.id}" ${dis} aria-label="más">+</button>
        </span>
      </div>`;
    }).join('');
    const cuerpo = consumidos.length ? `<div class="prods">${filas}</div>`
      : `<div class="muted small consumo-vacio">Sin consumo</div>`;
    return `${cuerpo}${pickProductos(p, a, ui)}`;
  }

  // "+ Agregar": chips del catálogo de ESA primada que aún no consume. Tap = changeItem(+1) → pasa a stepper.
  // Sin "+ Agregar" si la primada está cerrada (solo-lectura) o si ya agregó todo.
  function pickProductos(p, a, ui) {
    if (p.estado === 'cerrada') return '';
    const disponibles = S().disponiblesPara(p, a);
    if (!disponibles.length) return '';
    const abierto = ui && ui.pickProd === a.personaId;
    if (!abierto) {
      return `<button class="mini ghost addprod" data-act="open-pickprod" data-pid="${a.personaId}">${icon('plus-circle')}Agregar</button>`;
    }
    const chips = disponibles.map(prod =>
      `<button class="chip" data-act="add-item" data-pid="${a.personaId}" data-prod="${prod.id}">${e(prod.emoji)} ${e(prod.nombre)} <i>${$peso(prod.precioVenta)}</i></button>`
    ).join('');
    return `<div class="prodpick">
      <div class="prodpick-head"><span class="muted small">Producto</span>
        <button class="xmini" data-act="close-pickprod" data-pid="${a.personaId}" aria-label="cerrar">${icon('x')}</button></div>
      <div class="chips">${chips}</div>
    </div>`;
  }

  function coverLinea(p, a) {
    const cerrada = p.estado === 'cerrada';
    const dis = cerrada ? 'disabled' : '';
    if (a.rol !== 'asistente') {
      return `<div class="cover org">Sin cover · Organizador</div>`;
    }
    const cv = S().coverDe(p, a);
    if (a.coverExonerado) {
      return `<div class="cover">Cover <b>exonerado</b>
        <button class="mini" data-act="toggle-exonerado" data-pid="${a.personaId}" ${dis}>Cobrar</button></div>`;
    }
    return `<div class="cover">Cover <b>${$peso(cv)}</b>
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
      ${opt('principal', 'Principal')}
    </select>`;
  }

  // ACORDEÓN del asistente. Cerrado (default): una línea resumen (nombre + total, y saldo si debe).
  // Abierto (ui.abiertos tiene su id): detalle completo — rol, cover, consumo (progressive disclosure), abonos.
  function asistenciaCard(p, a, ui) {
    const total = S().totalAsistencia(p, a);
    const esPrin = S().esPrincipal(p, a);
    const saldo = S().saldoDe(p, a);
    const abierto = ui && ui.abiertos && ui.abiertos.has(a.personaId);
    const snapBadge = badge(a.estadoEnEseMomento, a.estadoEnEseMomento === 'ahorrador' ? 'good' : '');

    // Cabecera-resumen (operar): el total visible es SOLO consumo + cover (el dato de un vistazo).
    // El saldo/deuda es "ver la plata" → vive en el tab Resumen, no aquí.
    const cabecera = `<button class="acc-head" data-act="toggle-asis" data-pid="${a.personaId}" aria-expanded="${abierto ? 'true' : 'false'}">
        <span class="acc-caret ${abierto ? 'open' : ''}">${icon('chevron-down')}</span>
        <span class="acc-id"><b>${e(nombrePersona(a.personaId))}</b> ${snapBadge}${esPrin ? ' ' + badge('principal', 'red') : ''}</span>
        <span class="acc-amt">${$peso(total)}</span>
      </button>`;

    if (!abierto) return `<div class="asis ${esPrin ? 'is-principal' : ''}">${cabecera}</div>`;

    const cerrada = p.estado === 'cerrada';
    return `<div class="asis open ${esPrin ? 'is-principal' : ''}">
      ${cabecera}
      <div class="acc-body">
        <div class="asis-ctl">
          ${rolSelect(p, a)}
          <button class="mini danger" data-act="remove-asistencia" data-pid="${a.personaId}" ${cerrada ? 'disabled' : ''} aria-label="quitar">${icon('trash-2')}Quitar</button>
        </div>
        ${coverLinea(p, a)}
        <div class="sub">Consumo</div>
        ${consumoBloque(p, a, ui)}
        <div class="asis-foot">
          <span>Total <b>${$peso(total)}</b></span>
          ${esPrin ? `<span class="muted">Pagó</span>`
                   : `<span>Saldo <b class="${saldo > 0 ? 'owe' : ''}">${$peso(saldo)}</b></span>`}
        </div>
        ${abonosBlock(p, a)}
      </div>
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
          `<div class="abono">${icon('check', 'sm')}<span>${e(b.fecha)}</span><b>${$peso(b.monto)}</b><button class="xmini" data-act="remove-abono" data-pid="${a.personaId}" data-abono="${b.id}" aria-label="quitar abono">${icon('trash-2', 'sm')}</button></div>`).join('')}</div>`
      : '';
    return `<div class="pay">
      <div class="pay-form">
        <input class="ti" id="abono-${a.personaId}" type="number" min="0" step="1000" inputmode="numeric" placeholder="Abono" aria-label="Monto del abono">
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
        ${fuera.length ? opts : '<option>Sin personas</option>'}
      </select>
      <button class="mini" data-act="add-asistencia" ${fuera.length ? '' : 'disabled'}>${icon('plus-circle')}Asistente</button>
      <button class="mini ghost" data-act="open-personas">Persona</button>
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
      : `<div class="muted small">Sin ahorradores</div>`;
    return `<div class="card dark">
      <div class="card-title">Reparto</div>
      <div class="kv"><span>Cover</span><b>${$peso(sel.coverCobrado(p))}</b></div>
      <div class="kv"><span>Margen</span><b>${$peso(sel.margenTotal(p))}</b></div>
      <div class="kv total"><span>Ganancia</span><b>${$peso(gan)}</b></div>
      <div class="kv"><span>Ahorradores</span><b>${ahorr.length}</b></div>
      <div class="kv"><span>Parte igual</span><b>${$peso(pi)}</b></div>
      <div class="kv"><span>Sobrante</span><b>${$peso(sob)}</b></div>
      <div class="sub">Por persona</div>
      ${lista}
    </div>`;
  }

  function informe(p) {
    const sel = S();
    const inf = sel.informePrincipal(p);
    if (inf.incompleta) {
      return `<div class="card">
        <div class="card-title">Principal</div>
        <div class="muted small">Sin principal</div>
      </div>`;
    }
    const prinId = p.organizadorPrincipalId;
    const deud = sel.deudores(p).filter(d => d.personaId !== prinId);
    const deudList = deud.length
      ? deud.map(d => `<div class="kv"><span>${e(nombrePersona(d.personaId))}</span><b class="owe">${$peso(d.saldo)}</b></div>`).join('')
      : `<div class="muted small">Nadie debe</div>`;
    return `<div class="card">
      <div class="card-title">Principal — ${e(nombrePersona(prinId))}</div>
      <div class="kv"><span>Bre-B</span><b>${p.pago.breB ? e(p.pago.breB) : '—'}</b></div>
      <div class="kv"><span>Recaudo teórico</span><b>${$peso(inf.recaudadoTeorico)}</b></div>
      <div class="kv"><span>Recupera</span><b>${$peso(inf.recuperaPrincipal)}</b></div>
      <div class="kv total"><span>Entrega al Tesorero</span><b>${$peso(inf.entregaTesorero)}</b></div>
      <div class="kv"><span>Recaudado</span><b>${$peso(inf.recaudadoReal)}</b></div>
      <div class="kv subkv"><span>· de terceros</span><b>${$peso(inf.abonosTerceros)}</b></div>
      <div class="kv subkv"><span>· del principal</span><b>${$peso(inf.autoAbonoPrincipal)}</b></div>
      <div class="kv"><span>Pendiente</span><b class="${inf.saldoPendiente > 0 ? 'owe' : ''}">${$peso(inf.saldoPendiente)}</b></div>
      <div class="sub">Debe</div>
      ${deudList}
    </div>`;
  }

  // Tab Primadas = solo OPERAR: cabecera compacta + asistencias (registrar consumo) + productos.
  // La plata (reparto, informe, quién debe) vive en el tab RESUMEN. La config, tras el engranaje.
  function primadaDetalle(p, ui) {
    return `${primadaCabecera(p)}
      <h2 class="h2">Asistentes <span class="muted">(${p.asistencias.length})</span></h2>
      ${pickerAsistentes(p)}
      <div class="asis-list">
        ${p.asistencias.length
          ? p.asistencias.map(a => asistenciaCard(p, a, ui)).join('')
          : '<div class="empty">Sin asistentes</div>'}
      </div>
      ${productosEvento(p, ui)}`;
  }

  // Gestión de productos PROPIOS de la primada (sección plegable). Editar precio / quitar / añadir.
  // Opera sobre el snapshot de ESTA primada: no toca defaultProducts ni otras primadas.
  // Precio en vivo → setPreciosProducto usa commitQuiet (sin re-render, no pierde foco).
  function productosEvento(p, ui) {
    const cerrada = p.estado === 'cerrada';
    const abierto = ui && ui.panelProductos;
    const head = `<button class="h2 acc-h2" data-act="toggle-panel-productos" aria-expanded="${abierto ? 'true' : 'false'}">
      <span class="acc-caret ${abierto ? 'open' : ''}">${icon('chevron-down')}</span> Productos <span class="muted">(${p.productos.length})</span></button>`;
    if (!abierto) return head;
    const ro = cerrada ? 'disabled' : '';
    const filas = p.productos.map(prod => `<div class="prodrow">
      <span class="prodrow-name">${e(prod.emoji)} ${e(prod.nombre)}</span>
      <label class="prodrow-f"><span>costo</span>
        <input class="ti num" type="number" min="0" step="500" inputmode="numeric" value="${prod.costoNeto}" data-ch="costo-producto" data-id="${prod.id}" ${ro}></label>
      <label class="prodrow-f"><span>venta</span>
        <input class="ti num" type="number" min="0" step="500" inputmode="numeric" value="${prod.precioVenta}" data-ch="venta-producto" data-id="${prod.id}" ${ro}></label>
      <button class="xmini" data-act="remove-producto" data-id="${prod.id}" ${ro} aria-label="quitar producto">${icon('trash-2', 'sm')}</button>
    </div>`).join('');
    const alta = cerrada ? '' : `<div class="prodnew">
      <input class="ti emoji" id="pn-emoji" maxlength="2" placeholder="🍹" aria-label="Emoji">
      <input class="ti" id="pn-nombre" maxlength="40" placeholder="Nombre" aria-label="Nombre">
      <input class="ti num" id="pn-costo" type="number" min="0" step="500" inputmode="numeric" placeholder="costo" aria-label="Costo neto">
      <input class="ti num" id="pn-venta" type="number" min="0" step="500" inputmode="numeric" placeholder="venta" aria-label="Precio de venta">
      <button class="mini" data-act="add-producto">${icon('plus-circle')}Agregar</button>
    </div>`;
    return `${head}
      <div class="card prodmgmt">
        ${p.productos.length ? filas : '<div class="muted small">Sin productos</div>'}
        ${alta}
      </div>`;
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

  function tabPrimadas(state, ui) {
    const activa = S().activePrimada();
    // Historial: todas menos la activa, más recientes arriba (por fecha).
    const otras = state.primadas
      .filter(p => !activa || p.id !== activa.id)
      .slice()
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
    return `
      <div class="bar">
        <button class="btn" data-act="new-primada">${icon('plus-circle')}Nueva primada</button>
      </div>
      ${activa ? primadaDetalle(activa, ui)
               : '<div class="empty">Sin primada</div>'}
      ${otras.length ? `<h2 class="h2">Historial <span class="muted">(${otras.length})</span></h2>
        <div class="plist">${otras.map(p => primadaItem(state, p)).join('')}</div>` : ''}`;
  }

  /* ============================================================
     TAB RESUMEN — dashboard de la plata de la primada activa
     (reparto del fondo + informe del principal + quién debe).
     Separar "ver la plata" de "operar" (patrón Tricount).
     ============================================================ */
  function tabResumen(state, ui) {
    const p = S().activePrimada();
    if (!p) return `<div class="empty big"><div class="ph-title">Resumen</div>
      <div>Sin primada</div></div>`;
    return `<div class="resumen-head">
        <div class="prm-name">${e(p.nombre)}</div>
        <div class="muted small">${e(Util.monthLabel(p.mesContable))} · ${p.estado}</div>
      </div>
      ${reparto(p)}
      ${informe(p)}`;
  }

  /* ============================================================
     TAB Fondo (placeholder — tesorería futura)
     ============================================================ */
  function placeholder(titulo, txt) {
    return `<div class="empty big"><div class="ph-title">${e(titulo)}</div><div>${txt}</div>
      <div class="badge warn mt-3">Próximamente</div></div>`;
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
        <span class="muted small">${ap ? ap + ' primada' + (ap > 1 ? 's' : '') : 'Sin primadas'}</span>
      </div>
      <input class="ti breb" data-ch="breb-persona" data-pid="${per.id}" value="${per.breB ? e(per.breB) : ''}" placeholder="Bre-B" aria-label="Bre-B">
    </div>`;
  }

  function personasBody(state) {
    const personas = S().personasOrdenadas();
    const cuerpo = personas.length
      ? `<div class="people">${personas.map(personaCard).join('')}</div>`
      : '<div class="empty">Sin personas</div>';
    return `${cuerpo}
      <div class="sub">Nueva persona</div>
      <div class="addbar">
        <input class="ti" id="np-nombre" placeholder="Nombre" maxlength="40">
        <select class="sel" id="np-estado">
          <option value="ahorrador">ahorrador</option>
          <option value="invitado">invitado</option>
        </select>
        <button class="mini" data-act="add-persona">${icon('plus-circle')}Agregar</button>
      </div>`;
  }

  function ajustesBody(state) {
    const c = state.settings.cover;
    return `<div class="sub">Cover</div>
      <div class="grid2">
        <label class="fld"><span>Ahorrador</span>
          <input class="ti" type="number" min="0" step="500" data-ch="cover-ahorrador" value="${c.ahorrador}"></label>
        <label class="fld"><span>Invitado</span>
          <input class="ti" type="number" min="0" step="500" data-ch="cover-invitado" value="${c.invitado}"></label>
      </div>`;
  }

  // Sheet a pantalla completa con seg-nav Personas | Ajustes.
  /* ============================================================
     WIZARD "Nueva primada" — 3 pasos sobre la app (estado efímero en ui.wizard)
     ui.wizard = { paso, principalId, coorg:[ids], productos:[...], fecha, mesContable }
     1) organizadores (principal ahorrador + co-organizadores) · 2) productos del evento · 3) fecha + mes
     ============================================================ */
  function wizardPaso1(state, w) {
    const ahorradores = S().ahorradores();
    const opcionPrincipal = ahorradores.length
      ? `<select class="sel" id="wz-principal">
           <option value="">— elige al principal —</option>
           ${ahorradores.map(p => `<option value="${p.id}" ${w.principalId === p.id ? 'selected' : ''}>${e(p.nombre)}</option>`).join('')}
         </select>`
      : `<div class="muted small">Sin ahorradores. <button class="link-inline" data-act="open-personas">Agregar en Personas</button></div>`;
    // Co-organizadores: cualquier persona distinta del principal (toggle por chip).
    const coCands = S().personasOrdenadas().filter(p => p.id !== w.principalId);
    const chips = coCands.map(p => {
      const on = w.coorg.indexOf(p.id) >= 0;
      return `<button class="chip ${on ? 'on' : ''}" data-act="wz-toggle-coorg" data-pid="${p.id}">${e(p.nombre)} <i>${p.estado}</i></button>`;
    }).join('');
    return `<div class="wz-step">
      <label class="fld"><span>Principal</span>${opcionPrincipal}</label>
      <div class="sub">Co-organizadores</div>
      <div class="chips wz-chips">${chips || '<span class="muted small">Sin personas</span>'}</div>
    </div>`;
  }

  function wizardPaso2(state, w) {
    // Fila de producto del wizard: emoji + nombre (ancho completo) arriba; costo/venta/quitar abajo.
    // Evita apretar 5 controles en una sola línea en el ancho angosto del sheet.
    const filas = w.productos.map((prod, i) => `<div class="wz-prodrow">
      <div class="wz-prodrow-top">
        <input class="ti emoji" maxlength="2" value="${e(prod.emoji || '')}" data-wz="emoji" data-i="${i}" aria-label="Emoji">
        <input class="ti wz-prodname" value="${e(prod.nombre || '')}" maxlength="40" placeholder="Nombre del producto" data-wz="nombre" data-i="${i}" aria-label="Nombre">
      </div>
      <div class="wz-prodrow-bot">
        <label class="prodrow-f"><span>costo</span><input class="ti num" type="number" min="0" step="500" inputmode="numeric" value="${prod.costoNeto}" data-wz="costoNeto" data-i="${i}"></label>
        <label class="prodrow-f"><span>venta</span><input class="ti num" type="number" min="0" step="500" inputmode="numeric" value="${prod.precioVenta}" data-wz="precioVenta" data-i="${i}"></label>
        <button class="xmini" data-act="wz-prod-remove" data-i="${i}" aria-label="quitar">${icon('trash-2', 'sm')}</button>
      </div>
    </div>`).join('');
    return `<div class="wz-step">
      <div class="prodlist">${filas || '<div class="empty">Sin productos</div>'}</div>
      <button class="mini ghost mt-3" data-act="wz-prod-add">${icon('plus-circle')}Agregar</button>
    </div>`;
  }

  function wizardPaso3(state, w) {
    return `<div class="wz-step">
      <div class="grid2">
        <label class="fld"><span>Fecha</span>
          <input class="ti" type="date" id="wz-fecha" value="${e(w.fecha)}"></label>
        <label class="fld"><span>Mes contable</span>
          <input class="ti" type="month" id="wz-mes" value="${e(w.mesContable)}"></label>
      </div>
      <div class="sub">Resumen</div>
      <div class="kv"><span>Principal</span><b>${w.principalId ? e(nombrePersona(w.principalId)) : '—'}</b></div>
      <div class="kv"><span>Organizadores</span><b>${1 + w.coorg.length}</b></div>
      <div class="kv"><span>Productos</span><b>${w.productos.length}</b></div>
    </div>`;
  }

  function wizardSheet(state, ui) {
    const w = ui.wizard;
    const titulos = ['Organizadores', 'Productos', 'Fecha'];
    const cuerpo = w.paso === 1 ? wizardPaso1(state, w) : (w.paso === 2 ? wizardPaso2(state, w) : wizardPaso3(state, w));
    const stepper = [1, 2, 3].map(n => `<span class="wz-dot ${n === w.paso ? 'on' : ''} ${n < w.paso ? 'done' : ''}">${n}</span>`).join('<span class="wz-line"></span>');
    const atras = w.paso > 1 ? `<button class="mini ghost" data-act="wz-atras">Atrás</button>` : `<button class="mini ghost" data-act="wz-cancelar">Cancelar</button>`;
    const adelante = w.paso < 3
      ? `<button class="btn" data-act="wz-siguiente">Siguiente</button>`
      : `<button class="btn" data-act="wz-crear">${icon('plus-circle')}Crear primada</button>`;
    return `<div class="sheet full wz">
      <div class="sheet-head">
        <div class="wz-steps">${stepper}</div>
        <button class="gear" data-act="wz-cancelar" aria-label="Cerrar">${icon('x')}</button>
      </div>
      <div class="wz-title">${e(titulos[w.paso - 1])}</div>
      <div class="sheet-body">${cuerpo}</div>
      <div class="wz-nav">${atras}${adelante}</div>
    </div>`;
  }

  function overlaySheet(active, state) {
    const seg = (key, label) => `<button class="seg ${active === key ? 'on' : ''}" data-act="overlay-tab" data-overlay="${key}">${label}</button>`;
    const body = active === 'ajustes' ? ajustesBody(state) : personasBody(state);
    return `<div class="sheet full">
      <div class="sheet-head">
        <div class="seg-nav">${seg('personas', 'Personas')}${seg('ajustes', 'Ajustes')}</div>
        <button class="gear" data-act="close-overlay" aria-label="Cerrar">${icon('x')}</button>
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
    ui = ui || { tab: 'primadas', overlay: null, abiertos: new Set(), pickProd: null, panelProductos: false };

    // 1) tabbar: marcar el activo
    if (els.tabbar) {
      els.tabbar.querySelectorAll('.tab').forEach(t =>
        t.classList.toggle('active', t.dataset.tab === ui.tab));
    }

    // 2) contenido del tab
    let html;
    if (!state)                    html = '<div class="empty">Cargando…</div>';   // primer pintado: aún hidratando (load async)
    else if (ui.tab === 'resumen') html = tabResumen(state, ui);                  // dashboard de la plata
    else if (ui.tab === 'fondo')   html = placeholder('Fondo', 'Tesorería');
    else                           html = tabPrimadas(state, ui);
    els.screen.innerHTML = html;

    // 3) overlay: wizard (prioridad) · config de primada · pantalla del engranaje (Personas / Ajustes)
    if (ui.wizard)                                              els.overlay.innerHTML = wizardSheet(state, ui);
    else if (ui.overlay === 'config-primada')                  els.overlay.innerHTML = configPrimadaSheet(state);
    else if (ui.overlay === 'personas' || ui.overlay === 'ajustes') els.overlay.innerHTML = overlaySheet(ui.overlay, state);
    else                                                        els.overlay.innerHTML = '';
    els.overlay.hidden = !(ui.wizard || ui.overlay);
  }

  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg; els.toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2400);
  }

  // Pantalla de LOGIN (auth gate). Magic link: email + "Entrar". Estados: 'form' | 'sent' | 'error'.
  // Se renderiza en #screen; oculta tabbar/engranaje mientras no haya sesión.
  function renderLogin(estado, detalle) {
    if (els.tabbar) els.tabbar.style.display = 'none';
    const topbar = document.querySelector('.topbar'); if (topbar) topbar.style.display = 'none';  // la pantalla de login trae su propia marca
    const gear = document.getElementById('gearBtn'); if (gear) gear.style.display = 'none';
    if (els.overlay) { els.overlay.innerHTML = ''; els.overlay.hidden = true; }
    const enviado = estado === 'sent';
    const cuerpo = enviado
      ? `<div class="login-sent">
           <div class="login-emoji">📧</div>
           <p>Enlace enviado a<br><b>${e(detalle || 'tu correo')}</b></p>
           <button class="btn ghost" data-act="login-reset">Otro correo</button>
         </div>`
      : `<div class="login-form">
           <p class="muted small">Enlace por correo, sin contraseña.</p>
           <input class="ti" id="login-email" type="email" inputmode="email" autocomplete="email"
                  placeholder="tu@correo.com" value="${e(detalle || '')}" aria-label="Correo">
           <button class="btn" data-act="login-enviar">Entrar</button>
         </div>`;
    els.screen.innerHTML = `<div class="login">
        <div class="login-brand"><h1>Primad<span class="accent">app</span></h1>
          <div class="tagline">AHORRO · ENCUENTRO · BALANCE</div></div>
        ${cuerpo}
      </div>`;
  }

  // Actualiza el ícono del botón de cuenta según el estado de auth:
  // 'user' (backend off, placeholder) · 'log-in' (backend on, sin sesión) · 'log-out' (autenticado).
  function renderAuthButton(estado) {
    const btn = document.getElementById('authBtn'); if (!btn) return;
    const name = estado === 'in' ? 'log-out' : (estado === 'out' ? 'log-in' : 'user');
    btn.innerHTML = icon(name);
    btn.setAttribute('title', estado === 'in' ? 'Cerrar sesión' : (estado === 'out' ? 'Iniciar sesión' : 'Cuenta'));
  }

  // Restaura topbar/tabbar/engranaje al entrar autenticado (tras el login).
  function showAppChrome() {
    if (els.tabbar) els.tabbar.style.display = '';
    const topbar = document.querySelector('.topbar'); if (topbar) topbar.style.display = '';
    const gear = document.getElementById('gearBtn'); if (gear) gear.style.display = '';
  }

  // Indicador de sincronización con la nube. Crea/actualiza un chip flotante (no depende del
  // markup de index.html). { pendientes, error } viene del Store.subscribeSync.
  function renderSync(s) {
    if (typeof document === 'undefined') return;
    let el = document.getElementById('syncIndicator');
    const hayError = s && s.error;
    const hayPend = s && s.pendientes > 0;
    if (!hayError && !hayPend) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'syncIndicator'; el.className = 'sync-indicator'; document.body.appendChild(el); }
    el.classList.toggle('err', !!hayError);
    el.textContent = hayError ? ('⚠ ' + s.error) : '⟳ Guardando…';
    if (hayError) toast(s.error);
  }

  root.View = { cache, render, renderLogin, showAppChrome, renderAuthButton, renderSync, toast };
  if (typeof module !== 'undefined' && module.exports) module.exports = { View: root.View };
})(typeof window !== 'undefined' ? window : globalThis);
