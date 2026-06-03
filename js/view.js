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
  // Capitaliza una palabra de rol/estado para mostrarla (DESIGN.md §4: Title Case). El dato crudo
  // (data-*, modelo) sigue en minúscula; esto es SOLO presentación.
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  // Etiqueta de rol/estado en texto tenue (reemplaza los badges con borde en la identidad).
  function rolTag(estado) { return `<span class="rol-tag">${e(cap(estado))}</span>`; }
  function nombrePersona(id) { const p = S().persona(id); return p ? p.nombre : '—'; }
  // Nombre CORTO para el selector: quita el prefijo "Primada " (el período ya es la guía; el resto
  // —los organizadores— es la identidad real). Si el nombre no empieza con "Primada", se muestra tal cual.
  function nombreCorto(nombre) { const n = String(nombre || '').trim(); return n.replace(/^primada\s+/i, '') || n; }

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
    'copy':       '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    'x':          '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    'chevron-down':'<path d="m6 9 6 6 6-6"/>',
    'info':       '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    'eye':        '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    'edit':       '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  };
  // icon(name, cls?) → <svg> inline. La clase .icon dimensiona; cls extra opcional.
  function icon(name, cls) {
    const p = ICON_PATHS[name]; if (!p) return '';
    return `<svg class="icon ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  }

  /* ============================================================
     TAB PRIMADAS (corazón)
     ============================================================ */
  // BARRA SUPERIOR del tab Primadas = SELECTOR de primada (navegación principal) + acciones.
  // Jerarquía por frecuencia: operar (diario) manda → el selector muestra la activa y abre la lista;
  // "Configurar" (engranaje) y "Nueva primada" (+ chico) son secundarios a la derecha.
  // Cerrado: línea 1 = "Mes Año" (lo que importa de un vistazo); línea 2 tenue = estado + nombre.
  function primadaSelectorRow(state, ui) {
    const p = S().activePrimada();
    const masNueva = `<button class="icon-btn nueva" data-act="new-primada" title="Nueva primada" aria-label="Nueva primada">${icon('plus-circle')}</button>`;
    if (!p) {
      return `<div class="selrow">
        <div class="prm-selector empty"><span class="sel-main muted">Sin primadas</span></div>
        ${masNueva}
      </div>`;
    }
    const cerrada = p.estado === 'cerrada';
    const abierto = ui && ui.overlay === 'selector-primada';
    const inc = S().primadaIncompleta(p) ? ' ' + badge('sin principal', 'warn') : '';
    // Jerarquía: el NOMBRE corto (sin "Primada") es la IDENTIDAD → primario, grande. El período
    // (Mes Año) es la GUÍA → secundario, tenue, debajo. (La primada no se llama como el mes.)
    return `<div class="selrow">
      <button class="prm-selector" data-act="open-selector" aria-haspopup="listbox" aria-expanded="${abierto ? 'true' : 'false'}">
        <span class="sel-text">
          <span class="sel-main">${e(nombreCorto(p.nombre))}</span>
          <span class="sel-sub"><span class="dot ${cerrada ? 'closed' : 'open'}"></span>${e(Util.monthYear(p.mesContable))}${inc}</span>
        </span>
        <span class="sel-caret ${abierto ? 'open' : ''}">${icon('chevron-down')}</span>
      </button>
      <button class="icon-btn" data-act="open-config-primada" data-id="${p.id}" title="Configurar" aria-label="Configurar">${icon('settings-2')}</button>
      ${masNueva}
    </div>`;
  }

  // Hoja del selector: TODAS las primadas agrupadas por AÑO → MES (reciente arriba). Tocar una la
  // activa y cierra. La activa lleva check. El "total" de cada fila = recaudo (snapshot del evento).
  function selectorSheet(state, ui) {
    const activeId = state.activePrimadaId;
    const grupos = S().primadasPorAnio();
    const cuerpo = grupos.length
      ? grupos.map(g => `<div class="sel-anio">${e(g.anio)}</div>
          <div class="sel-list">${g.primadas.map(p => selectorFila(p, activeId)).join('')}</div>`).join('')
      : '<div class="empty-soft">Sin primadas</div>';
    return `<div class="sheet full">
      <div class="sheet-head">
        <div class="sheet-title">Primadas</div>
        <button class="gear" data-act="close-overlay" aria-label="Cerrar">${icon('x')}</button>
      </div>
      <div class="sheet-body">${cuerpo}</div>
    </div>`;
  }
  // Fila del selector = MES (guía, en negrita) · NOMBRE corto (sin "Primada", la identidad real) +
  // total + check en la activa. El nombre distingue varias primadas del MISMO mes.
  function selectorFila(p, activeId) {
    const sel = S();
    const activa = p.id === activeId;
    const cerrada = p.estado === 'cerrada';
    const inc = sel.primadaIncompleta(p) ? ' ' + badge('incompleta', 'warn') : '';
    return `<button class="sel-fila ${activa ? 'on' : ''}" data-act="select-primada" data-id="${p.id}">
      <span class="sel-fila-main"><span class="dot ${cerrada ? 'closed' : 'open'}"></span><b>${e(Util.monthName(p.mesContable))}</b> · ${e(nombreCorto(p.nombre))}${inc}</span>
      <span class="sel-fila-right">
        <span class="sel-fila-total">${$peso(sel.recaudado(p))}</span>
        ${activa ? `<span class="sel-check">${icon('check', 'sm')}</span>` : ''}
      </span>
    </button>`;
  }

  // Overlay de CONFIGURACIÓN de la primada (escondido tras el engranaje de la cabecera).
  // Edición de una sola vez + acciones destructivas (cerrar/reabrir, borrar) con confirmación.
  function configPrimadaSheet(state, ui) {
    const p = S().activePrimada();
    if (!p) return `<div class="sheet full"><div class="sheet-head"><div class="sheet-title">Configurar</div>
      <button class="gear" data-act="close-overlay" aria-label="Cerrar">${icon('x')}</button></div>
      <div class="empty-soft">Sin primada</div></div>`;
    const cerrada = p.estado === 'cerrada';
    const ro = cerrada ? 'disabled' : '';
    // Hogar ordenado de TODA la configuración de una vez. Secciones separadas por AIRE (.sub),
    // sin divisores. Identidad → Productos (edición de precios) → Cuenta → Eliminar (destructivo).
    return `<div class="sheet full">
      <div class="sheet-head">
        <div class="sheet-title">Configurar primada</div>
        <button class="gear" data-act="close-overlay" aria-label="Cerrar">${icon('x')}</button>
      </div>
      <div class="sheet-body">
        <section class="cfg-sec">
          <label class="fld"><span>Nombre</span>
            <input class="ti name" data-ch="rename-primada" data-id="${p.id}" value="${e(p.nombre)}" ${ro} maxlength="40" aria-label="Nombre de la primada"></label>
          <div class="grid2">
            <label class="fld"><span>Fecha</span>
              <input class="ti" type="date" data-ch="fecha-primada" data-id="${p.id}" value="${e(p.fecha)}" ${ro}></label>
            <label class="fld"><span>Mes contable</span>
              <input class="ti" type="month" data-ch="mes-primada" data-id="${p.id}" value="${e(p.mesContable)}" ${ro}></label>
          </div>
        </section>

        <section class="cfg-sec">
          <div class="sub">Asistentes <span class="muted">(${p.asistencias.length})</span></div>
          ${asistentesConfig(p, ui)}
        </section>

        <section class="cfg-sec">
          <div class="sub">Productos <span class="muted">(${p.productos.length})</span></div>
          ${productosConfig(p, ui)}
        </section>

        ${cerrada ? `<section class="cfg-sec">
          <div class="sub">Cuenta</div>
          <button class="mini" data-act="reabrir-primada" data-id="${p.id}">Reabrir</button>
        </section>` : ''}

        <section class="cfg-sec">
          <div class="sub danger-sub">Eliminar</div>
          <button class="mini danger" data-act="borrar-primada" data-id="${p.id}">${icon('trash-2')}Borrar</button>
        </section>
      </div>
    </div>`;
  }

  // Sección "Asistentes" del overlay Configurar: CLON del componente de Personas (mismas clases).
  // Cada asistente es una FILA ACORDEÓN (.prow + .acc-head + .acc-id-stack); colapsada = línea liviana
  // sin caja; abierta = .acc-body con rol, cover y quitar. Indistinguible de la fila de Personas.
  function asistentesConfig(p, ui) {
    if (!p.asistencias.length) return '<div class="empty-soft">Sin asistentes</div>';
    return `<div class="prow-list">${p.asistencias.map(a => asistenteConfigRow(p, a, ui)).join('')}</div>`;
  }
  function asistenteConfigRow(p, a, ui) {
    const cerrada = p.estado === 'cerrada';
    const esPrin = S().esPrincipal(p, a);
    const abierto = ui && ui.configAsis && ui.configAsis.has(a.personaId);
    // línea 2 (tenue): rol + resumen de cover, igual que el dato secundario de la fila de Persona.
    const sub = a.rol === 'asistente'
      ? (a.coverExonerado ? 'Cover exonerado' : 'Cover ' + $peso(S().coverDe(p, a)))
      : 'Sin cover';
    const cabecera = `<button class="acc-head" data-act="toggle-cfg-asis" data-pid="${a.personaId}" aria-expanded="${abierto ? 'true' : 'false'}">
        <span class="acc-caret ${abierto ? 'open' : ''}">${icon('chevron-down')}</span>
        <span class="acc-id-stack">
          <span class="acc-id"><b>${e(nombrePersona(a.personaId))}</b> ${rolTag(a.estadoEnEseMomento)}${esPrin ? ' <span class="dot prin"></span><span class="rol-tag">Principal</span>' : ''}</span>
          <span class="acc-sub">${cap(a.rol)} · ${sub}</span>
        </span>
      </button>`;
    if (!abierto) return `<div class="prow">${cabecera}</div>`;
    return `<div class="prow open">
      ${cabecera}
      <div class="acc-body">
        <div class="fld"><span>Rol</span>${rolSelect(p, a)}</div>
        ${a.rol === 'asistente' ? coverLinea(p, a) : ''}
        <button class="mini danger" data-act="remove-asistencia" data-pid="${a.personaId}" ${cerrada ? 'disabled' : ''}>${icon('trash-2', 'sm')}Quitar</button>
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
      const q = S().cantidadDe(p, a, prod);   // v6: cantidad = Σ filas de consumo
      return `<div class="prod has">
        <span class="prod-name">${e(prod.emoji)} ${e(prod.nombre)} <i>${$peso(prod.precioVenta)}</i></span>
        <span class="stepper">
          <button class="step" data-act="item-minus" data-pid="${a.personaId}" data-prod="${prod.id}" ${dis} aria-label="menos">−</button>
          <b class="qty">${q}</b>
          <button class="step" data-act="item-plus" data-pid="${a.personaId}" data-prod="${prod.id}" ${dis} aria-label="más">+</button>
        </span>
      </div>`;
    }).join('');
    // Estado vacío sin etiqueta: si está abierta, el botón "+ Agregar" ya comunica el estado;
    // solo cuando está CERRADA (sin botón) se muestra "Sin consumo" como estado mínimo.
    const cuerpo = consumidos.length ? `<div class="prods">${filas}</div>`
      : (cerrada ? `<div class="muted small consumo-vacio">Sin consumo</div>` : '');
    // AUDITORÍA (C2): el detalle por evento (hora + quién apuntó) NO se exhibe; se pide con el ⓘ.
    const auditOpen = ui && ui.auditPid === a.personaId;
    const auditBtn = consumidos.length
      ? `<button class="xmini aud-btn ${auditOpen ? 'on' : ''}" data-act="toggle-auditoria" data-pid="${a.personaId}" aria-expanded="${auditOpen ? 'true' : 'false'}" aria-label="Detalle por evento">${icon('info', 'sm')}</button>`
      : '';
    return `${cuerpo}${pickProductos(p, a, ui)}${auditBtn}${auditOpen ? auditoriaPanel(p, a, ui) : ''}`;
  }

  // Panel de AUDITORÍA (colapsado tras el ⓘ): cada consumo con su HORA + producto + QUIÉN lo apuntó
  // (email resuelto desde ui.apuntadores; '—' si no se pudo, p.ej. anon sin acceso a profiles).
  function auditoriaPanel(p, a, ui) {
    const eventos = S().detalleConsumoDe(p, a);
    if (!eventos.length) return '<div class="aud-panel"><div class="muted small">Sin eventos</div></div>';
    const map = (ui && ui.apuntadores) || {};
    const filas = eventos.map(ev => {
      const quien = ev.apuntadoPor ? (map[ev.apuntadoPor] || 'otro') : '—';
      const prod = ev.prod ? `${e(ev.prod.emoji)} ${e(ev.prod.nombre)}` : '—';
      return `<div class="aud-row"><span class="aud-hora">${Util.horaCorta(ev.createdAt)}</span><span class="aud-prod">${prod}</span><span class="aud-quien">${e(quien)}</span></div>`;
    }).join('');
    return `<div class="aud-panel"><div class="aud-head">Detalle · hora · quién apuntó</div>${filas}</div>`;
  }

  // "+ Agregar": chips del catálogo de ESA primada que aún no consume. Tap = changeItem(+1) → pasa a stepper.
  // Sin "+ Agregar" si la primada está cerrada (solo-lectura) o si ya agregó todo.
  function pickProductos(p, a, ui) {
    if (p.estado === 'cerrada') return '';
    const disponibles = S().disponiblesPara(p, a);
    if (!disponibles.length) return '';
    const abierto = ui && ui.pickProd === a.personaId;
    if (!abierto) {
      return `<button class="mini ghost addprod" data-act="open-pickprod" data-pid="${a.personaId}">${icon('plus-circle')}Consumo</button>`;
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
      // El rol ya lo muestra el selector de arriba → aquí solo lo que aporta (sin repetir el rol, sin itálica).
      return `<div class="cover">Sin cover</div>`;
    }
    const cv = S().coverDe(p, a);
    if (a.coverExonerado) {
      return `<div class="cover">Cover <b>exonerado</b>
        <button class="link-inline" data-act="toggle-exonerado" data-pid="${a.personaId}" ${dis}>Cobrar</button></div>`;
    }
    return `<div class="cover">Cover <b>${$peso(cv)}</b>
      <button class="link-inline" data-act="toggle-exonerado" data-pid="${a.personaId}" ${dis}>Exonerar</button></div>`;
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
    const abierto = ui && ui.abiertos && ui.abiertos.has(a.personaId);

    // Cabecera-resumen (operar): el total visible es SOLO consumo + cover (el dato de un vistazo).
    // El saldo/deuda es "ver la plata" → vive en el tab Resumen, no aquí.
    const cabecera = `<button class="acc-head" data-act="toggle-asis" data-pid="${a.personaId}" aria-expanded="${abierto ? 'true' : 'false'}">
        <span class="acc-caret ${abierto ? 'open' : ''}">${icon('chevron-down')}</span>
        <span class="acc-id"><b>${e(nombrePersona(a.personaId))}</b> ${rolTag(a.estadoEnEseMomento)}${esPrin ? ' <span class="dot prin"></span><span class="rol-tag">Principal</span>' : ''}</span>
        <span class="acc-amt">${$peso(total)}</span>
      </button>`;

    if (!abierto) return `<div class="asis">${cabecera}</div>`;

    // OPERACIÓN = mínima: SOLO consumo + PAGO. El rol, el cover y "Quitar" son CONFIGURACIÓN
    // y viven en el overlay "Configurar primada" (sección Asistentes), no aquí.
    return `<div class="asis open">
      ${cabecera}
      <div class="acc-body">
        ${consumoBloque(p, a, ui)}
        ${pagoBlock(p, a)}
      </div>
    </div>`;
  }

  // Bloque de PAGO por asistencia (binario). El que paga se autosirve: "Pagar" abre una hoja con la
  // llave Bre-B del principal + el monto. SIGUE activo aunque la primada esté cerrada (INVARIANTE #4:
  // la cuenta se cierra, los pagos llegan después). El principal está auto-saldado → sin pago.
  function pagoBlock(p, a) {
    if (S().esPrincipal(p, a)) return '';
    const total = S().totalAsistencia(p, a);
    if (total <= 0) return '';
    if (a.pagado) {
      return `<div class="pay paid">
        <span class="pay-state">${icon('check', 'sm')}Pagado</span>
        <button class="mini ghost" data-act="set-no-pagado" data-pid="${a.personaId}">Deshacer</button>
      </div>`;
    }
    return `<div class="pay">
      <button class="mini" data-act="open-pagar" data-pid="${a.personaId}">${icon('log-in')}Pagar ${$peso(total)}</button>
    </div>`;
  }

  // Hoja "Pagar": muestra la llave Bre-B del PRINCIPAL de esta primada (snapshot pago.breB, fallback
  // a la llave vigente del principal) + el monto que debe la persona + "Copiar" + "Ya pagué" (el que
  // paga se autosirve y marca su propio pago). Sin comprobante en la app (se comparte por fuera).
  function pagarSheet(state, ui) {
    const p = S().activePrimada();
    const a = p && (p.asistencias || []).find(x => x.personaId === (ui && ui.pagarPid));
    const head = (titulo) => `<div class="sheet-head"><div class="sheet-title">${titulo}</div>
      <button class="gear" data-act="close-overlay" aria-label="Cerrar">${icon('x')}</button></div>`;
    if (!p || !a) return `<div class="sheet">${head('Pagar')}<div class="empty-soft">Sin datos</div></div>`;
    const total = S().totalAsistencia(p, a);
    const principalId = p.organizadorPrincipalId;
    const llave = (p.pago && p.pago.breB) || (principalId ? (S().persona(principalId) || {}).breB : null) || '';
    const nombrePrin = principalId ? nombrePersona(principalId) : '—';
    const llaveBlock = llave
      ? `<div class="pagar-llave">
           <span class="pagar-llave-val">${e(llave)}</span>
           <button class="mini ghost" data-act="copiar-llave" data-llave="${e(llave)}">${icon('copy')}Copiar</button>
         </div>`
      : `<div class="muted small">El principal aún no tiene una llave Bre-B.
           <button class="link-inline" data-act="open-personas">Agregar en Personas</button></div>`;
    const cuerpo = `
      <div class="pagar-amount">${$peso(total)}</div>
      <div class="pagar-to">Transfiere por Bre-B a <b>${e(nombrePrin)}</b></div>
      ${llaveBlock}
      <button class="btn" data-act="marcar-pagado" data-pid="${a.personaId}">${icon('check')}Ya pagué</button>`;
    return `<div class="sheet">${head('Pagar a ' + e(nombrePrin))}<div class="sheet-body pagar">${cuerpo}</div></div>`;
  }

  // "+ Agregar" en operación = acción simple: abre una HOJA con el directorio (addAsisSheet).
  // Nada de selector inline ni "Nueva persona" desparramados aquí.
  function pickerAsistentes(p, ui) {
    if (p.estado === 'cerrada') return '';
    return `<button class="add-link" data-act="open-add-asis">${icon('plus-circle')}Agregar</button>`;
  }

  // Hoja simple "Agregar asistente": lista del directorio (los que NO están aún). Tocar uno lo
  // agrega y queda abierta para sumar varios. "Nueva persona" NO vive aquí: enlace a Personas.
  function addAsisSheet(state, ui) {
    const p = S().activePrimada();
    if (!p) return `<div class="sheet full"><div class="sheet-head"><div class="sheet-title">Agregar asistente</div>
      <button class="gear" data-act="close-overlay" aria-label="Cerrar">${icon('x')}</button></div>
      <div class="empty-soft">Sin primada</div></div>`;
    const dentro = new Set(p.asistencias.map(a => a.personaId));
    const fuera = S().personasOrdenadas().filter(per => !dentro.has(per.id));
    const filas = fuera.length
      ? fuera.map(per => `<button class="addrow" data-act="add-asistencia" data-pid="${per.id}">
          <span class="acc-id"><b>${e(per.nombre)}</b> ${rolTag(per.estado)}</span>
          <span class="addrow-plus">${icon('plus-circle')}</span>
        </button>`).join('')
      : '<div class="empty-soft">Ya están todos</div>';
    return `<div class="sheet full">
      <div class="sheet-head">
        <div class="sheet-title">Agregar asistente</div>
        <button class="gear" data-act="close-overlay" aria-label="Cerrar">${icon('x')}</button>
      </div>
      <div class="sheet-body">
        <div class="addrow-list">${filas}</div>
        <div class="note">¿Falta alguien? <button class="link-inline" data-act="open-personas">Agregar en Personas</button></div>
      </div>
    </div>`;
  }

  // Card-acordeón de Resumen: COLAPSADA por defecto (titular de un vistazo) + se expande al tocar.
  // El detalle es denso ("ver la plata"); el titular basta para el día a día. ui.resumen = Set de
  // secciones abiertas ('reparto'|'informe').
  function reparto(p, ui) {
    const sel = S();
    const gan = sel.ganancia(p);
    const ahorr = sel.asistenciasAhorradoras(p);
    const abierto = ui && ui.resumen && ui.resumen.has('reparto');
    const subTeaser = ahorr.length
      ? `${$peso(gan)} · parte igual ${$peso(sel.parteIgual(p))}`
      : `${$peso(gan)}`;
    const head = `<button class="acc-head" data-act="toggle-resumen" data-sec="reparto" aria-expanded="${abierto ? 'true' : 'false'}">
        <span class="acc-caret ${abierto ? 'open' : ''}">${icon('chevron-down')}</span>
        <span class="acc-id-stack">
          <span class="acc-id"><b>Ganancia</b></span>
          <span class="acc-sub">${subTeaser}</span>
        </span>
      </button>`;
    if (!abierto) return `<div class="card dark acc-card">${head}</div>`;
    const pi = sel.parteIgual(p);
    const sob = sel.sobranteFondo(p);
    const lista = ahorr.length
      ? ahorr.map(a => `<div class="kv"><span>${e(nombrePersona(a.personaId))}</span><b>${$peso(pi)}</b></div>`).join('')
      : `<div class="muted small">Sin ahorradores</div>`;
    return `<div class="card dark acc-card open">${head}
      <div class="acc-body">
        <div class="kv"><span>Cover</span><b>${$peso(sel.coverCobrado(p))}</b></div>
        <div class="kv"><span>Margen</span><b>${$peso(sel.margenTotal(p))}</b></div>
        <div class="kv total"><span>Ganancia</span><b>${$peso(gan)}</b></div>
        <div class="kv"><span>Ahorradores</span><b>${ahorr.length}</b></div>
        <div class="kv"><span>Parte igual</span><b>${$peso(pi)}</b></div>
        <div class="kv"><span>Sobrante</span><b>${$peso(sob)}</b></div>
        <div class="sub">Por persona</div>
        ${lista}
      </div>
    </div>`;
  }

  function informe(p, ui) {
    const sel = S();
    const inf = sel.informePrincipal(p);
    if (inf.incompleta) {
      return `<div class="card">
        <div class="card-title">Principal</div>
        <div class="muted small">Sin principal</div>
      </div>`;
    }
    const prinId = p.organizadorPrincipalId;
    const abierto = ui && ui.resumen && ui.resumen.has('informe');
    const head = `<button class="acc-head" data-act="toggle-resumen" data-sec="informe" aria-expanded="${abierto ? 'true' : 'false'}">
        <span class="acc-caret ${abierto ? 'open' : ''}">${icon('chevron-down')}</span>
        <span class="acc-id-stack">
          <span class="acc-id"><b>Principal — ${e(nombrePersona(prinId))}</b></span>
          <span class="acc-sub">Entrega ${$peso(inf.entregaTesorero)} · Pendiente ${$peso(inf.saldoPendiente)}</span>
        </span>
      </button>`;
    if (!abierto) return `<div class="card acc-card">${head}</div>`;
    const deud = sel.deudores(p).filter(d => d.personaId !== prinId);
    const deudList = deud.length
      ? deud.map(d => `<div class="kv"><span>${e(nombrePersona(d.personaId))}</span><b class="owe">${$peso(d.saldo)}</b></div>`).join('')
      : `<div class="muted small">Nadie debe</div>`;
    return `<div class="card acc-card open">${head}
      <div class="acc-body">
        <div class="kv"><span>Bre-B</span><b>${p.pago.breB ? e(p.pago.breB) : '—'}</b></div>
        <div class="kv"><span>Recaudo teórico</span><b>${$peso(inf.recaudadoTeorico)}</b></div>
        <div class="kv"><span>Recupera</span><b>${$peso(inf.recuperaPrincipal)}</b></div>
        <div class="kv total"><span>Entrega al Tesorero</span><b>${$peso(inf.entregaTesorero)}</b></div>
        <div class="kv"><span>Recaudado</span><b>${$peso(inf.recaudadoReal)}</b></div>
        <div class="kv subkv"><span>· de terceros</span><b>${$peso(inf.pagadoTerceros)}</b></div>
        <div class="kv subkv"><span>· del principal</span><b>${$peso(inf.autoAbonoPrincipal)}</b></div>
        <div class="kv"><span>Pendiente</span><b class="${inf.saldoPendiente > 0 ? 'owe' : ''}">${$peso(inf.saldoPendiente)}</b></div>
        <div class="sub">Debe</div>
        ${deudList}
      </div>
    </div>`;
  }

  // Tab Primadas = solo OPERAR: asistencias (registrar consumo). La identidad (mes/nombre/estado) y
  // la navegación viven en el SELECTOR de arriba; la config tras el engranaje; la plata en RESUMEN.
  function primadaDetalle(p, ui) {
    // CTA contextual para CERRAR (P5 lote visual): NO vive en Configuración. Aparece como banner arriba
    // de la operación SOLO cuando ya hubo plata y TODOS saldaron (saldoPendiente 0 = nadie debe; el
    // principal está auto-saldado). Es el momento natural de cerrar la cuenta del evento.
    const inf = S().informePrincipal(p);
    const cerrarCTA = (p.estado === 'abierta' && !inf.incompleta && inf.recaudadoTeorico > 0 && inf.saldoPendiente === 0)
      ? `<button class="cerrar-cta" data-act="cerrar-primada" data-id="${p.id}">${icon('check')}Todos pagaron · Cerrar primada</button>`
      : '';
    return `${cerrarCTA}${presenciaLinea(ui)}<div class="sec-head">
        <h2 class="h2">Asistentes <span class="muted">${p.asistencias.length}</span></h2>
        ${pickerAsistentes(p, ui)}
      </div>
      <div class="asis-list">
        ${p.asistencias.length
          ? p.asistencias.map(a => asistenciaCard(p, a, ui)).join('')
          : '<div class="empty-soft">Sin asistentes</div>'}
      </div>`;
  }

  // PRESENCE (Fase C): línea DISCRETA con quién más está en la primada; si alguien apuntó hace poco
  // (<4s) lo marca "apuntando…". Auto-coordinación, NO bloqueo. ui.presentes = los OTROS (sin mí).
  function presenciaLinea(ui) {
    const otros = (ui && ui.presentes) || [];
    if (!otros.length) return '';
    let ahora = 0; try { ahora = Date.now(); } catch (e) {}
    const apuntando = otros.filter(o => o.apuntando && (ahora - o.apuntando < 4000)).map(o => o.nombre);
    const nombres = otros.map(o => o.nombre);
    const txt = apuntando.length
      ? `${apuntando.join(', ')} apuntando…`
      : `${nombres.join(', ')} ${nombres.length > 1 ? 'están' : 'está'} aquí`;
    return `<div class="presencia ${apuntando.length ? 'apuntando' : ''}">${icon(apuntando.length ? 'edit' : 'eye', 'sm')}<span>${e(txt)}</span></div>`;
  }

  // Gestión de productos PROPIOS de la primada (overlay Configurar). CLON del componente de Personas:
  // cada producto es una FILA ACORDEÓN (.prow + .acc-head + .acc-id-stack). Colapsada = línea liviana
  // (emoji+nombre arriba, venta·margen tenue abajo); abierta = .acc-body con costo/venta (.fld+.ti) y
  // quitar. El alta vive en .prow-foot/.prow-new, igual que "Agregar persona". Precio en vivo →
  // setPreciosProducto usa commitQuiet (sin re-render, no pierde foco).
  // ANATOMÍA CANÓNICA del input de producto (DESIGN.md › "Input de producto"): caja de emoji CHICA
  // (fija) + campo de NOMBRE dominante (ancho). Idéntica en Configurar›Productos (alta) y Wizard Paso 2.
  // El emoji lleva data-auto: '1' = sigue autosugiriéndose al teclear el nombre (vía Util.emojiSugerido
  // en el controller); '0' = el usuario lo fijó A MANO (no se sobreescribe). `manual` es EXPLÍCITO (NO se
  // deriva de si hay emoji): un emoji de catálogo o ya sugerido sigue siendo auto, así la sugerencia
  // sigue al nombre cada vez. Solo tocar el campo de emoji lo pasa a manual. Tocar el emoji abre el teclado.
  function prodIdInput(emojiVal, nombreVal, emojiAttrs, nombreAttrs, manual) {
    const auto = manual ? '0' : '1';
    return `<div class="prod-id">
        <input class="ti emoji" maxlength="2" value="${e(emojiVal || '')}" data-auto="${auto}" ${emojiAttrs} placeholder="🙂" aria-label="Emoji" inputmode="text">
        <input class="ti prod-name" value="${e(nombreVal || '')}" maxlength="40" placeholder="Nombre del producto" ${nombreAttrs} aria-label="Nombre del producto">
      </div>`;
  }

  function productosConfig(p, ui) {
    const cerrada = p.estado === 'cerrada';
    const filas = p.productos.map(prod => productoConfigRow(p, prod, ui)).join('');
    const alta = cerrada ? '' : `<div class="prod-new">
      ${prodIdInput('', '', 'id="pn-emoji"', 'id="pn-nombre"', false)}
      <div class="prod-new-bot">
        <label class="prodrow-f"><span>costo</span><input class="ti num" id="pn-costo" type="number" min="0" step="500" inputmode="numeric" aria-label="Costo neto"></label>
        <label class="prodrow-f"><span>venta</span><input class="ti num" id="pn-venta" type="number" min="0" step="500" inputmode="numeric" aria-label="Precio de venta"></label>
        <button class="mini" data-act="add-producto">${icon('plus-circle')}Agregar</button>
      </div>
    </div>`;
    return `${p.productos.length ? `<div class="prow-list">${filas}</div>` : '<div class="empty-soft">Sin productos</div>'}
      <div class="prow-foot">${alta}</div>`;
  }
  function productoConfigRow(p, prod, ui) {
    const cerrada = p.estado === 'cerrada';
    const ro = cerrada ? 'disabled' : '';
    const abierto = ui && ui.configProd && ui.configProd.has(prod.id);
    const margen = (Number(prod.precioVenta) || 0) - (Number(prod.costoNeto) || 0);
    const cabecera = `<button class="acc-head" data-act="toggle-cfg-prod" data-id="${prod.id}" aria-expanded="${abierto ? 'true' : 'false'}">
        <span class="acc-caret ${abierto ? 'open' : ''}">${icon('chevron-down')}</span>
        <span class="acc-id-stack">
          <span class="acc-id"><b>${e(prod.emoji)} ${e(prod.nombre)}</b></span>
          <span class="acc-sub">Venta ${$peso(prod.precioVenta)} · margen ${$peso(margen)}</span>
        </span>
      </button>`;
    if (!abierto) return `<div class="prow">${cabecera}</div>`;
    return `<div class="prow open">
      ${cabecera}
      <div class="acc-body">
        <div class="grid2">
          <label class="fld"><span>Costo</span>
            <input class="ti" type="number" min="0" step="500" inputmode="numeric" value="${prod.costoNeto}" data-ch="costo-producto" data-id="${prod.id}" ${ro}></label>
          <label class="fld"><span>Venta</span>
            <input class="ti" type="number" min="0" step="500" inputmode="numeric" value="${prod.precioVenta}" data-ch="venta-producto" data-id="${prod.id}" ${ro}></label>
        </div>
        <button class="mini danger" data-act="remove-producto" data-id="${prod.id}" ${ro}>${icon('trash-2', 'sm')}Quitar</button>
      </div>
    </div>`;
  }

  // Tab Primadas: SELECTOR de primada arriba (navegación: activa + acceso a todas, agrupadas por
  // año→mes, vía la hoja) + la OPERACIÓN de la activa debajo. El historial ya NO es una lista aparte:
  // vive dentro del selector. "Nueva primada" es el "+" chico del selector (crear es ~mensual).
  function tabPrimadas(state, ui) {
    const activa = S().activePrimada();
    return `${primadaSelectorRow(state, ui)}
      ${activa ? primadaDetalle(activa, ui)
               : '<div class="empty-soft big">Sin primada<br>Crea la primera con el +</div>'}`;
  }

  /* ============================================================
     TAB RESUMEN — dashboard de la plata de la primada activa
     (reparto del fondo + informe del principal + quién debe).
     Separar "ver la plata" de "operar" (patrón Tricount).
     ============================================================ */
  function tabResumen(state, ui) {
    const p = S().activePrimada();
    if (!p) return `<div class="empty-soft big"><div class="ph-title">Resumen</div>
      <div>Sin primada</div></div>`;
    return `<div class="resumen-head">
        <div class="prm-name">${e(p.nombre)}</div>
        <div class="muted small">${e(Util.monthLabel(p.mesContable))} · ${cap(p.estado)}</div>
      </div>
      ${reparto(p, ui)}
      ${informe(p, ui)}`;
  }

  /* ============================================================
     TAB Fondo (placeholder — tesorería futura)
     ============================================================ */
  function placeholder(titulo, txt) {
    return `<div class="empty-soft big"><div class="ph-title">${e(titulo)}</div><div>${txt}</div>
      <div class="badge warn mt-3">Próximamente</div></div>`;
  }

  /* ============================================================
     PANTALLAS detrás del engranaje: Personas (directorio) y Ajustes
     ============================================================ */
  // Fila liviana de persona (DESIGN.md §2.9): dos líneas, expandible inline para editar.
  // Cerrada: línea 1 = nombre + rol (etiqueta tenue, igual que la fila de asistente);
  //          línea 2 tenue = nº de primadas. Abierta: edición en contexto (nombre, rol, Bre-B).
  // Su historia se conserva al cambiar de estado (INVARIANTE #1).
  function personaRow(per, ui) {
    const ap = S().aparicionesDe(per.id);
    const meta = ap ? (ap + ' primada' + (ap > 1 ? 's' : '')) : 'Sin primadas';
    const abierto = ui && ui.personasAbiertas && ui.personasAbiertas.has(per.id);
    const cabecera = `<button class="acc-head" data-act="toggle-persona" data-pid="${per.id}" aria-expanded="${abierto ? 'true' : 'false'}">
        <span class="acc-caret ${abierto ? 'open' : ''}">${icon('chevron-down')}</span>
        <span class="acc-id-stack">
          <span class="acc-id"><b>${e(per.nombre)}</b> ${rolTag(per.estado)}</span>
          <span class="acc-sub">${meta}</span>
        </span>
      </button>`;
    if (!abierto) return `<div class="prow">${cabecera}</div>`;
    const seg = est => `<button class="seg ${per.estado === est ? 'on' : ''}" data-act="set-estado-persona" data-pid="${per.id}" data-estado="${est}">${cap(est)}</button>`;
    return `<div class="prow open">
      ${cabecera}
      <div class="acc-body">
        <label class="fld"><span>Nombre</span>
          <input class="ti" data-ch="rename-persona" data-pid="${per.id}" value="${e(per.nombre)}" maxlength="40" aria-label="Nombre"></label>
        <div class="fld"><span>Rol</span>
          <div class="seg-nav sm">${seg('ahorrador')}${seg('invitado')}</div></div>
        <label class="fld"><span>Bre-B</span>
          <input class="ti breb" data-ch="breb-persona" data-pid="${per.id}" value="${per.breB ? e(per.breB) : ''}" placeholder="Bre-B" aria-label="Bre-B"></label>
      </div>
    </div>`;
  }

  function personasBody(state, ui) {
    const personas = S().personasOrdenadas();
    const filas = personas.length
      ? `<div class="prow-list">${personas.map(per => personaRow(per, ui)).join('')}</div>`
      : '<div class="empty-soft">Sin personas</div>';
    const nueva = ui && ui.nuevaPersona;
    const alta = nueva
      ? `<div class="prow-new">
          <input class="ti" id="np-nombre" placeholder="Nombre" maxlength="40">
          <select class="sel" id="np-estado">
            <option value="ahorrador">Ahorrador</option>
            <option value="invitado">Invitado</option>
          </select>
          <button class="mini" data-act="add-persona">${icon('plus-circle')}Agregar</button>
        </div>`
      : `<button class="add-link" data-act="open-nueva-persona">${icon('plus-circle')}Agregar persona</button>`;
    return `${filas}<div class="prow-foot">${alta}</div>`;
  }

  function ajustesBody(state) {
    const c = state.settings.cover;
    // Build incrustado (meta sellado) → para confirmar de un vistazo qué versión corre en el device.
    const build = (typeof document !== 'undefined' && (document.querySelector('meta[name="build"]') || {}).content) || '—';
    return `<div class="sub">Cover</div>
      <div class="grid2">
        <label class="fld"><span>Ahorrador</span>
          <input class="ti" type="number" min="0" step="500" data-ch="cover-ahorrador" value="${c.ahorrador}"></label>
        <label class="fld"><span>Invitado</span>
          <input class="ti" type="number" min="0" step="500" data-ch="cover-invitado" value="${c.invitado}"></label>
      </div>
      <div class="sub">Versión</div>
      <div class="muted small">${e(build)}</div>`;
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
           <option value="">—</option>
           ${ahorradores.map(p => `<option value="${p.id}" ${w.principalId === p.id ? 'selected' : ''}>${e(p.nombre)}</option>`).join('')}
         </select>`
      : `<div class="muted small">Sin ahorradores. <button class="link-inline" data-act="open-personas">Agregar en Personas</button></div>`;
    // Co-organizadores: cualquier persona distinta del principal (toggle por chip).
    const coCands = S().personasOrdenadas().filter(p => p.id !== w.principalId);
    const chips = coCands.map(p => {
      const on = w.coorg.indexOf(p.id) >= 0;
      return `<button class="chip ${on ? 'on' : ''}" data-act="wz-toggle-coorg" data-pid="${p.id}">${e(p.nombre)} <i>${cap(p.estado)}</i></button>`;
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
      ${prodIdInput(prod.emoji, prod.nombre, `data-wz="emoji" data-i="${i}"`, `data-wz="nombre" data-i="${i}"`, !!prod.emojiManual)}
      <div class="wz-prodrow-bot">
        <label class="prodrow-f"><span>costo</span><input class="ti num" type="number" min="0" step="500" inputmode="numeric" value="${prod.costoNeto}" data-wz="costoNeto" data-i="${i}"></label>
        <label class="prodrow-f"><span>venta</span><input class="ti num" type="number" min="0" step="500" inputmode="numeric" value="${prod.precioVenta}" data-wz="precioVenta" data-i="${i}"></label>
        <button class="xmini" data-act="wz-prod-remove" data-i="${i}" aria-label="quitar">${icon('trash-2', 'sm')}</button>
      </div>
    </div>`).join('');
    return `<div class="wz-step">
      <div class="prodlist">${filas || '<div class="empty-soft">Sin productos</div>'}</div>
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

  function overlaySheet(active, state, ui) {
    const seg = (key, label) => `<button class="seg ${active === key ? 'on' : ''}" data-act="overlay-tab" data-overlay="${key}">${label}</button>`;
    const body = active === 'ajustes' ? ajustesBody(state) : personasBody(state, ui);
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
    ui = ui || { tab: 'primadas', overlay: null, abiertos: new Set(), pickProd: null, personasAbiertas: new Set() };

    // 1) tabbar: marcar el activo
    if (els.tabbar) {
      els.tabbar.querySelectorAll('.tab').forEach(t =>
        t.classList.toggle('active', t.dataset.tab === ui.tab));
    }

    // 2) contenido del tab
    let html;
    if (!state)                    html = '<div class="empty-soft">Cargando…</div>';   // primer pintado: aún hidratando (load async)
    else if (ui.tab === 'resumen') html = tabResumen(state, ui);                  // dashboard de la plata
    else if (ui.tab === 'fondo')   html = placeholder('Fondo', 'Tesorería');
    else                           html = tabPrimadas(state, ui);
    els.screen.innerHTML = html;

    // 3) overlay: wizard (prioridad) · config de primada · pantalla del engranaje (Personas / Ajustes)
    if (ui.wizard)                                              els.overlay.innerHTML = wizardSheet(state, ui);
    else if (ui.overlay === 'login')                           els.overlay.innerHTML = loginSheet(state, ui);
    else if (ui.overlay === 'pagar')                           els.overlay.innerHTML = pagarSheet(state, ui);
    else if (ui.overlay === 'selector-primada')                els.overlay.innerHTML = selectorSheet(state, ui);
    else if (ui.overlay === 'config-primada')                  els.overlay.innerHTML = configPrimadaSheet(state, ui);
    else if (ui.overlay === 'add-asis')                        els.overlay.innerHTML = addAsisSheet(state, ui);
    else if (ui.overlay === 'personas' || ui.overlay === 'ajustes') els.overlay.innerHTML = overlaySheet(ui.overlay, state, ui);
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
  // Login = HOJA desde abajo (mismo lenguaje que el resto de la app: overlay + sheet), NO full-pantalla.
  // El topbar (la marca) queda visible detrás, atenuado; los botones de acción se ocultan (no hay sesión).
  // Login = HOJA OPT-IN (overlay cerrable, se abre desde el ícono de perfil), NO un gate. La app
  // sigue usable detrás; la hoja lleva su X. Estado por ui.loginEstado ('form' | 'sent').
  function loginSheet(state, ui) {
    const enviado = ui && ui.loginEstado === 'sent';
    const email = (ui && ui.loginEmail) || '';
    const cuerpo = enviado
      ? `<div class="login-sent">
           <div class="login-emoji">📧</div>
           <p>Código enviado a<br><b>${e(email || 'tu correo')}</b></p>
           <input class="ti login-code" id="login-codigo" inputmode="numeric" autocomplete="one-time-code"
                  pattern="[0-9]*" maxlength="6" placeholder="Código" aria-label="Código del correo">
           <button class="btn" data-act="login-verificar">Verificar</button>
           <button class="btn ghost" data-act="login-reset">Otro correo</button>
         </div>`
      : `<div class="login-form">
           <p class="muted small">Te enviamos un código al correo para pegarlo aquí.</p>
           <input class="ti" id="login-email" type="email" inputmode="email" autocomplete="email"
                  placeholder="tu@correo.com" value="${e(email)}" aria-label="Correo">
           <button class="btn" data-act="login-enviar">Enviar código</button>
         </div>`;
    return `<div class="sheet login-sheet">
        <div class="sheet-head"><div class="sheet-title">${enviado ? 'Escribe el código' : 'Entrar'}</div>
          <button class="gear" data-act="close-overlay" aria-label="Cerrar">${icon('x')}</button></div>
        <div class="sheet-body">${cuerpo}</div>
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
    const actions = document.querySelector('.header-actions'); if (actions) actions.style.display = '';
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

  root.View = { cache, render, showAppChrome, renderAuthButton, renderSync, toast };
  if (typeof module !== 'undefined' && module.exports) module.exports = { View: root.View };
})(typeof window !== 'undefined' ? window : globalThis);
