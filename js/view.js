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
    els.topbar  = document.getElementById('topbar');
    els.tabbar  = document.getElementById('tabbar');   // ya no existe (IA list→detalle); guard tolera null
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

  // ¿La primada tiene algo que mostrar en el informe? (al menos un asistente con consumo o con cover).
  // Gatea la visibilidad del botón "Compartir informe" en la cabecera.
  function hayDatosInforme(p) {
    if (!p || !Array.isArray(p.asistencias)) return false;
    const sel = S();
    return p.asistencias.some(a => sel.coverDe(p, a) > 0 || sel.resumenConsumoDe(p, a).length > 0);
  }

  /* ============================================================
     INFORME COMPARTIBLE — template HTML (PURO) para capturar como PNG (html2canvas).
     Superficie CLARA (fuera del tema oscuro). Reusa selectores de Consumos (mismo orden y agregación
     v6): por persona, productos consumidos (emoji+nombre+×cant+subtotal) + "Entrada" (cover) + Total.
     Resumen final state-aware: cerrada "Ganancia"; abierta "Por cobrar". Sin roles ni jerga.
     ============================================================ */
  function informeTemplateHTML(p) {
    const sel = S();
    // Una persona por fila. COMPACTO (2 líneas): nombre (izq) + TOTAL teal (der); productos inline debajo.
    // SALDADAS (saldo 0, ya saldaron) → check "✓" delante del nombre. El PNG refleja el estado COMPLETO:
    // quién debe (arriba) y quién ya saldó (abajo) → el lector entiende por qué bajó el total.
    const filaInforme = (a) => {
      const consumos = sel.resumenConsumoDe(p, a);                 // [{prod, cantidad}]
      const cover = sel.coverDe(p, a);
      if (!consumos.length && cover <= 0) return '';               // omite quien no consumió ni paga cover
      const chips = consumos.map(({ prod, cantidad }) => `${e(prod.emoji)} ${e(prod.nombre)} ×${cantidad}`);
      if (cover > 0) chips.push('Cover');
      const detalle = chips.length ? `<div class="informe-prods">${chips.join(' · ')}</div>` : '';
      const saldada = sel.saldoDe(p, a) === 0 && sel.totalAsistencia(p, a) > 0;
      return `<div class="informe-asis informe-persona">
          <div class="informe-left">
            <div class="informe-nombre">${saldada ? '<span class="informe-check">✓</span> ' : ''}${e(nombrePersona(a.personaId))}</div>
            ${detalle}
          </div>
          <div class="informe-total">${$peso(sel.totalAsistencia(p, a))}</div>
        </div>`;
    };
    // Pendientes (saldo>0) PRIMERO, saldadas (saldo 0) al FINAL; dentro de cada grupo, orden por consumo.
    const ordenadas = sel.asistenciasPorConsumo(p);
    const lineas = ordenadas.filter(a => sel.saldoDe(p, a) > 0).map(filaInforme)
      .concat(ordenadas.filter(a => sel.saldoDe(p, a) === 0).map(filaInforme)).join('');
    const cerrada = p.estado === 'cerrada';
    const resumen = cerrada
      ? `<div class="informe-resumen gan">Ganancia ${$peso(sel.ganancia(p))}</div>`
      : `<div class="informe-resumen cobrar">Por cobrar ${$peso(sel.informePrincipal(p).saldoPendiente)}</div>`;
    // Llave Bre-B del principal: snapshot p.pago.breB con FALLBACK a la llave VIGENTE de la persona
    // principal (mismo patrón que pagoBlock) — si la Bre-B se agregó DESPUÉS de crear la primada, el
    // snapshot es null pero la persona ya la tiene. Línea destacada 🔑 bajo el título; si no hay, se omite.
    const principalId = p.organizadorPrincipalId;
    const breBRaw = (p.pago && p.pago.breB) || (principalId ? (sel.persona(principalId) || {}).breB : null) || '';
    const breB = breBRaw ? String(breBRaw).trim() : '';
    const llave = breB ? `<div class="informe-llave">🔑 Bre-B ${e(breB)}</div>` : '';
    return `<div class="informe-card">
        <div class="informe-head"><span class="informe-brand">Primadapp</span><span class="informe-period">${e(Util.monthYear(p.mesContable))}</span></div>
        <div class="informe-title">${e(p.nombre)}</div>
        ${llave}
        <hr class="informe-sep">
        ${lineas}
        <hr class="informe-sep">
        ${resumen}
        <div class="informe-foot">Generado con Primadapp</div>
      </div>`;
  }

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
    'chevron-left':'<path d="m15 18-6-6 6-6"/>',
    'chevron-right':'<path d="m9 18 6-6-6-6"/>',
    'info':       '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    'eye':        '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    'edit':       '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    'share-2':    '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
  };
  // icon(name, cls?) → <svg> inline. La clase .icon dimensiona; cls extra opcional.
  function icon(name, cls) {
    const p = ICON_PATHS[name]; if (!p) return '';
    return `<svg class="icon ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  }

  /* ============================================================
     TAB PRIMADAS (corazón)
     ============================================================ */
  // Dot de estado DERIVADO de actividad real (no de un estado de modelo): cerrada = gris (`closed`);
  // abierta SIN consumos = ámbar (`idle`, creada/organizada pero sin actividad → "pendiente", escalera §1);
  // con consumos = verde (`open`, en operación). Ver DESIGN.md §1 / ciclo de vida.
  function dotClase(p) {
    if (!p || p.estado === 'cerrada') return 'closed';
    return ((p.consumos || []).length > 0) ? 'open' : 'idle';
  }

  // BARRA SUPERIOR del tab Primadas = SELECTOR de primada (navegación PURA) + acciones de la activa.
  // El "+" de crear NO vive aquí: el ÚNICO punto de creación es el gear global › Primadas › "Nueva primada".
  // Cerrado: línea 1 = NOMBRE corto (identidad); línea 2 tenue = dot de estado + "Mes Año".
  function primadaSelectorRow(state, ui) {
    const p = S().activePrimada();
    if (!p) return '';
    const abierto = ui && ui.overlay === 'selector-primada';
    const inc = S().primadaIncompleta(p) ? ' ' + badge('sin principal', 'warn') : '';
    return `<div class="selrow">
      <button class="prm-selector" data-act="open-selector" aria-haspopup="listbox" aria-expanded="${abierto ? 'true' : 'false'}">
        <span class="sel-text">
          <span class="sel-main">${e(nombreCorto(p.nombre))}</span>
          <span class="sel-sub"><span class="dot ${dotClase(p)}"></span>${e(Util.monthYear(p.mesContable))}${inc}</span>
        </span>
        <span class="sel-caret ${abierto ? 'open' : ''}">${icon('chevron-down')}</span>
      </button>
      ${hayDatosInforme(p) ? `<button class="icon-btn" data-act="compartir-informe" title="Compartir informe" aria-label="Compartir informe">${icon('share-2')}</button>` : ''}
    </div>`;
  }

  // Hoja del selector: TODAS las primadas agrupadas por AÑO → MES (reciente arriba). Tocar una la
  // activa y cierra. La activa lleva check. El "total" de cada fila = recaudo (snapshot del evento).
  // Selector = NAVEGACIÓN PURA: elegir con cuál primada trabajar. TRES secciones, relativas a la ACTIVA:
  // Próximas (mes posterior) · Activa (la seleccionada) · Pasadas (mes anterior, por año). Una futura NO
  // cae en "Pasadas". NO crea nada (crear vive en el gear global › Calendario).
  function selectorSheet(state, ui) {
    const sel = S();
    const activeId = state.activePrimadaId;
    const activa = sel.activePrimada();
    const proximas = sel.primadasProximas(activeId);             // futuras (mes > activa), asc
    const grupos = sel.primadasPorAnio();
    // Pasadas = historial SIN la activa NI las futuras (esas van en Próximas).
    const pasadas = grupos.map(g => ({ anio: g.anio, primadas: g.primadas.filter(p => p.id !== activeId && !sel.esFutura(p, activeId)) }))
      .filter(g => g.primadas.length);
    const secProx = proximas.length
      ? `<div class="sel-anio">Próximas</div><div class="sel-list">${proximas.map(p => selectorFila(p, activeId)).join('')}</div>` : '';
    const secActiva = activa
      ? `<div class="sel-anio">Activa</div><div class="sel-list">${selectorFila(activa, activeId)}</div>` : '';
    const secPasadas = pasadas.length
      ? `<div class="sel-anio">Pasadas</div>` + pasadas.map(g =>
          `<div class="sel-subanio">${e(g.anio)}</div><div class="sel-list">${g.primadas.map(p => selectorFila(p, activeId)).join('')}</div>`).join('') : '';
    const vacio = (!secProx && !secActiva && !secPasadas) ? '<div class="empty-soft">Sin primadas</div>' : '';
    return `<div class="sheet full">
      <div class="sheet-head">
        <div class="sheet-title">Primadas</div>
        <button class="gear" data-act="close-overlay" aria-label="Cerrar">${icon('x')}</button>
      </div>
      <div class="sheet-body">${secProx}${secActiva}${secPasadas}${vacio}</div>
    </div>`;
  }
  // Fila del selector = MES (guía, en negrita) · NOMBRE corto (sin "Primada", la identidad real) +
  // total + check en la activa. El dot deriva de actividad real (dotClase). El nombre distingue varias
  // primadas del MISMO mes.
  function selectorFila(p, activeId) {
    const sel = S();
    const activa = p.id === activeId;
    const inc = sel.primadaIncompleta(p) ? ' ' + badge('incompleta', 'warn') : '';
    return `<button class="sel-fila ${activa ? 'on' : ''}" data-act="select-primada" data-id="${p.id}">
      <span class="sel-fila-main"><span class="dot ${dotClase(p)}"></span><b>${e(Util.monthName(p.mesContable))}</b> · ${e(nombreCorto(p.nombre))}${inc}</span>
      <span class="sel-fila-right">
        <span class="sel-fila-total">${$peso(sel.recaudado(p))}</span>
        ${activa ? `<span class="sel-check">${icon('check', 'sm')}</span>` : ''}
      </span>
    </button>`;
  }

  // CONFIGURACIÓN del evento activo = DOS tabs operativos (seg-nav interno): Asistentes (participación,
  // lista compacta) | Productos (precios). NADA MÁS. La identidad (nombre/fecha/mes) se fija al crear
  // (wizard). UN SOLO punto de config: el gear global › Primadas EMBEBE este cuerpo arriba del calendario
  // (se eliminó el segundo engranaje del selector). ui.configTab = pestaña activa (Asistentes/Productos).
  // CUERPO de configuración del EVENTO ACTIVO (seg-nav Asistentes | Productos + cuerpo). Ya NO es un sheet
  // propio: se EMBEBE en el gear global › Primadas (ÚNICO punto de configuración; el engranaje del selector
  // se eliminó — un solo ícono de config en pantalla). p es la primada activa (el llamador garantiza ≠ null).
  function configPrimadaBody(p, ui) {
    const tab = (ui && ui.configTab === 'productos') ? 'productos' : 'asistentes';
    const seg = (key, label, n) => `<button class="seg ${tab === key ? 'on' : ''}" data-act="config-tab" data-ctab="${key}">${label} <span class="muted">${n}</span></button>`;
    const body = tab === 'productos' ? productosConfig(p, ui) : asistentesListaCompacta(p, ui);
    return `<div class="seg-nav cfg-seg">${seg('asistentes', 'Asistentes', p.asistencias.length)}${seg('productos', 'Productos', p.productos.length)}</div>${body}`;
  }

  // Tab ASISTENTES: lista COMPACTA agrupada (Ahorradores / Invitados). PRINCIPIO "muestra la excepción,
  // no la regla": el cover común al grupo va UNA vez en el encabezado; la fila solo marca lo que DIFIERE
  // (`Sin cover` cuando el cover efectivo de la persona es 0 — exonerado o cover-free por rol). Sin
  // acordeón, sin rol por fila (el rol se fija al crear). El principal lleva su dot sutil. [✕] quita de
  // la primada (no del directorio). Cerrada: lista visible, acciones deshabilitadas. Si la primada está
  // INCOMPLETA (sin principal, p.ej. migrada) → fix mínimo: botón "Hacer principal" en cada ahorrador.
  function asistentesListaCompacta(p, ui) {
    if (!p.asistencias.length) return `<div class="empty-soft">Sin asistentes</div>${addAsisFoot(p)}`;
    const cerrada = p.estado === 'cerrada';
    const incompleta = S().primadaIncompleta(p);
    const grupo = (estado, titulo) => {
      const filas = p.asistencias.filter(a => a.estadoEnEseMomento === estado);
      if (!filas.length) return '';
      // cover del grupo: una asistencia sintética no-exonerada de ese estado → coverDe (settings si
      // abierta, snapshot si cerrada). Una sola cifra para todo el grupo.
      const coverGrupo = S().coverDe(p, { estadoEnEseMomento: estado, rol: 'asistente', coverExonerado: false });
      const head = `<div class="grp-head"><span class="grp-titulo">${titulo}</span>${coverGrupo > 0 ? `<span class="grp-cover">Cover ${$peso(coverGrupo)}</span>` : ''}</div>`;
      const items = filas.map(a => asistenteFilaCompacta(p, a, coverGrupo, cerrada, incompleta)).join('');
      return `${head}<div class="asis-compact-list">${items}</div>`;
    };
    const aviso = incompleta
      ? `<div class="cfg-aviso">${badge('falta principal', 'warn')} Asigná quién organiza para completar la primada.</div>`
      : '';
    return `${aviso}${grupo('ahorrador', 'Ahorradores')}${grupo('invitado', 'Invitados')}${addAsisFoot(p)}`;
  }
  function asistenteFilaCompacta(p, a, coverGrupo, cerrada, incompleta) {
    const esPrin = S().esPrincipal(p, a);
    // EXCEPCIÓN: el cover efectivo de la persona difiere del grupo (0 vs >0) → exonerado o cover-free por rol.
    const sinCover = coverGrupo > 0 && S().coverDe(p, a) === 0;
    // Fix mínimo: solo mientras la primada esté incompleta y la persona sea ahorrador (INVARIANTE #2).
    const puedePrincipal = incompleta && !cerrada && a.estadoEnEseMomento === 'ahorrador' && !esPrin;
    return `<div class="asis-compact">
      <span class="asis-compact-id">${esPrin ? '<span class="dot prin" title="Principal"></span>' : '<span class="dot neutral"></span>'}<b>${e(nombrePersona(a.personaId))}</b>${sinCover ? '<span class="sin-cover">Sin cover</span>' : ''}</span>
      <span class="asis-compact-acc">
        ${puedePrincipal ? `<button class="xmini hacer-prin" data-act="hacer-principal" data-pid="${a.personaId}">Hacer principal</button>` : ''}
        <button class="xmini" data-act="remove-asistencia" data-pid="${a.personaId}" ${cerrada ? 'disabled' : ''} aria-label="Quitar de la primada">${icon('x')}</button>
      </span>
    </div>`;
  }
  function addAsisFoot(p) {
    if (p.estado === 'cerrada') return '';
    return `<div class="prow-foot"><button class="add-link" data-act="open-add-asis">${icon('plus-circle')}Agregar asistente</button></div>`;
  }

  // Progressive disclosure: SOLO lo consumido (cantidad>0) con stepper. Bajar a 0 lo quita
  // (vuelve a estar disponible en el chip picker). Vacío → mensaje, no tarjeta en blanco.
  // MODELO 3 — Lista viva: los productos de la persona ACTIVA se muestran INLINE como CHIPS (no acordeón
  // + stepper). Dos tipos de chip, en una sola fila que envuelve:
  //   · CONSUMIDO (`.chip.has`): emoji + ×cantidad. El cuerpo es +1 (gesto frecuente); un `−` chico
  //     subordinado hace −1 (corrección). Solo aparece en la persona activa (es el único lugar con chips).
  //   · DISPONIBLE (`.chip`): emoji + nombre + precio; tap = +1 (0→1 → pasa a ser consumido).
  // CERRADA: chips de solo lectura (sin +/−); si no consumió, "Sin consumo".
  function chipsConsumoViva(p, a, ui) {
    const cerrada = p.estado === 'cerrada';
    const consumidos = S().consumidosDe(p, a);
    const disponibles = S().disponiblesPara(p, a);
    const chipsCons = consumidos.map(prod => {
      const q = S().cantidadDe(p, a, prod);   // v6: cantidad = Σ filas de consumo
      if (cerrada) return `<span class="chip has ro">${e(prod.emoji)} <b class="chip-q">×${q}</b></span>`;
      // Stepper compacto [− 🍺×9 +]: el + explícito a la DERECHA es el gesto universal de "agregar"
      // (en teal, resalta); el cuerpo (emoji ×N) TAMBIÉN suma (target grande, menos fricción); − corrige.
      return `<span class="chip has">
          <button class="chip-minus" data-act="item-minus" data-pid="${a.personaId}" data-prod="${prod.id}" aria-label="${e(prod.nombre)}: menos">−</button>
          <button class="chip-plus" data-act="item-plus" data-pid="${a.personaId}" data-prod="${prod.id}" aria-label="${e(prod.nombre)}: más">${e(prod.emoji)} <b class="chip-q">×${q}</b></button>
          <button class="chip-add" data-act="item-plus" data-pid="${a.personaId}" data-prod="${prod.id}" aria-label="${e(prod.nombre)}: más">+</button>
        </span>`;
    }).join('');
    const chipsDisp = cerrada ? '' : disponibles.map(prod =>
      `<button class="chip" data-act="item-plus" data-pid="${a.personaId}" data-prod="${prod.id}">${e(prod.emoji)} ${e(prod.nombre)} <i>${$peso(prod.precioVenta)}</i></button>`
    ).join('');
    const vacio = (cerrada && !consumidos.length) ? '<div class="muted small consumo-vacio">Sin consumo</div>' : '';
    // AUDITORÍA (C2): el detalle por evento (hora + quién apuntó) NO se exhibe; se pide con el ⓘ.
    const auditOpen = ui && ui.auditPid === a.personaId;
    const auditBtn = consumidos.length
      ? `<button class="xmini aud-btn ${auditOpen ? 'on' : ''}" data-act="toggle-auditoria" data-pid="${a.personaId}" aria-expanded="${auditOpen ? 'true' : 'false'}" aria-label="Detalle por evento">${icon('info', 'sm')}</button>`
      : '';
    return `<div class="chips-viva">${chipsCons}${chipsDisp}${vacio}</div>${auditBtn}${auditOpen ? auditoriaPanel(p, a, ui) : ''}`;
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

  // MODELO 3 — Lista viva: la fila del asistente está SIEMPRE visible (nombre + total), sin chevron ni
  // acordeón. Tap en la fila = ACTIVAR (única activa a la vez, `ui.activaPid`); al activarse, sus productos
  // aparecen INLINE debajo como chips (apuntar en 1 tap) + el bloque de PAGO como footer. El resto de la
  // lista sigue visible. SALDADA: check teal + NOMBRE en teal (escalera de color: teal = resuelto).
  function asistenteFilaViva(p, a, ui) {
    const total = S().totalAsistencia(p, a);
    const esPrin = S().esPrincipal(p, a);
    const activa = ui && ui.activaPid === a.personaId;
    const saldado = S().saldoDe(p, a) === 0 && total > 0;
    const fila = `<button class="asis-fila ${activa ? 'on' : ''}" data-act="activar-asis" data-pid="${a.personaId}" aria-expanded="${activa ? 'true' : 'false'}">
        <span class="asis-fila-id ${saldado ? 'saldado' : ''}"><b>${e(nombrePersona(a.personaId))}</b>${saldado ? ` <span class="asis-check" title="Saldado">${icon('check', 'sm')}</span>` : ''} ${rolTag(a.estadoEnEseMomento)}${esPrin ? ' <span class="dot prin"></span><span class="rol-tag">Principal</span>' : ''}</span>
        <span class="acc-amt">${$peso(total)}</span>
      </button>`;
    if (!activa) return `<div class="asis">${fila}</div>`;
    // REVEAL de la persona activa: chips (apuntar) ARRIBA, PAGO abajo (saldar = menos frecuente). El rol,
    // el cover y "Quitar" son CONFIGURACIÓN (overlay Configurar › Asistentes), no aquí.
    return `<div class="asis on">
      ${fila}
      <div class="asis-reveal">
        ${chipsConsumoViva(p, a, ui)}
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
    // Cada fila ofrece DOS formas de agregar: normal (cobra el cover del grupo) o "Sin cover" (cortesía:
    // niños/invitados de cortesía). La exoneración se DECIDE aquí, al agregar — la lista compacta de
    // Configurar solo la muestra, no la edita (decisión de producto). Tras agregar, la fila desaparece.
    const filas = fuera.length
      ? fuera.map(per => `<div class="addrow">
          <span class="acc-id"><b>${e(per.nombre)}</b> ${rolTag(per.estado)}</span>
          <span class="addrow-acc">
            <button class="xmini cortesia" data-act="add-asistencia-cortesia" data-pid="${per.id}">Sin cover</button>
            <button class="mini" data-act="add-asistencia" data-pid="${per.id}">${icon('plus-circle')}Agregar</button>
          </span>
        </div>`).join('')
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

  // Bloque REPARTO del Balance. El HÉROE (Ganancia, cifra grande) va SIEMPRE visible fuera del acorde;
  // el desglose (cómo se calculó) vive dentro del acc-body toggleable (ui.balance = Set de secciones
  // abiertas, 'reparto'|'informe'). State-aware: ABIERTA marca la cifra como provisional; CERRADA no.
  // Mismos selectores → cifras idénticas (no se duplica el cálculo).
  function reparto(p, ui) {
    const sel = S();
    const gan = sel.ganancia(p);
    const ahorr = sel.asistenciasAhorradoras(p);
    const pi = sel.parteIgual(p);
    const sob = sel.sobranteFondo(p);
    const abierto = ui && ui.balance && ui.balance.has('reparto');
    const cerrada = p.estado === 'cerrada';
    const teaser = ahorr.length
      ? `Entrega ${$peso(pi)} a ${ahorr.length} ${ahorr.length === 1 ? 'Ahorrador' : 'Ahorradores'}`
      : 'Sin ahorradores';
    const lista = ahorr.length
      ? ahorr.map(a => `<div class="kv"><span>${e(nombrePersona(a.personaId))}</span><b>${$peso(pi)}</b></div>`).join('')
      : `<div class="muted small">Sin ahorradores</div>`;
    const hero = `<div class="bal-hero">
        <div class="bal-label"><span class="dot ${cerrada ? 'closed' : ''}"></span>Ganancia</div>
        <div class="bal-amount">${$peso(gan)}</div>
        ${cerrada ? '' : `<div class="bal-note">Provisional — se confirma al cerrar</div>`}
      </div>`;
    const toggle = `<button class="acc-head bal-toggle" data-act="toggle-balance" data-sec="reparto" aria-expanded="${abierto ? 'true' : 'false'}">
        <span class="acc-caret ${abierto ? 'open' : ''}">${icon('chevron-down')}</span>
        <span class="acc-sub">${teaser}</span>
      </button>`;
    const body = abierto ? `<div class="acc-body">
        <div class="kv"><span>Cover</span><b>${$peso(sel.coverCobrado(p))}</b></div>
        <div class="kv"><span>Margen</span><b>${$peso(sel.margenTotal(p))}</b></div>
        <div class="kv total"><span>Ganancia</span><b>${$peso(gan)}</b></div>
        <div class="kv"><span>Ahorradores</span><b>${ahorr.length}</b></div>
        <div class="kv"><span>Parte igual</span><b>${$peso(pi)}</b></div>
        <div class="kv"><span>Sobrante</span><b>${$peso(sob)}</b></div>
        <div class="sub">Por persona</div>
        ${lista}
      </div>` : '';
    return `<div class="card dark acc-card ${abierto ? 'open' : ''}">${hero}${toggle}${body}</div>`;
  }

  // Bloque RECAUDO del Balance (el proceso de cobro del evento, no una persona). HÉROE state-aware POR
  // ESTADO (no por urgencia): ABIERTA → lo que falta cobrar ("Por cobrar", tono ÁMBAR = proceso en curso,
  // NUNCA --alert: no es deuda de nadie ni alarma); CERRADA → lo entregado al Tesorero (tono TEAL/--accent =
  // definitivo). El "provisional" NO aplica aquí: el recaudo es el estado REAL del cobro. El desglose
  // (Bre-B, recaudos, deudores) va dentro del acc-body toggleable.
  function informe(p, ui) {
    const sel = S();
    const inf = sel.informePrincipal(p);
    if (inf.incompleta) {
      return `<div class="card">
        <div class="card-title">Recaudo</div>
        <div class="muted small">Sin principal</div>
      </div>`;
    }
    const prinId = p.organizadorPrincipalId;
    const abierto = ui && ui.balance && ui.balance.has('informe');
    const cerrada = p.estado === 'cerrada';
    // ABIERTA: el héroe es lo que FALTA cobrar (Por cobrar). CERRADA: lo que se entregó al Tesorero.
    const heroAmount = cerrada ? inf.entregaTesorero : inf.saldoPendiente;
    const heroTone = cerrada ? 'entregado' : 'por-cobrar';   // teal (definitivo) vs ámbar (proceso)
    const deud = sel.deudores(p).filter(d => d.personaId !== prinId);
    // SIN microcopy en el héroe del Recaudo: "menos es más". El conteo "de N personas" confundía (parecía
    // que faltaba alguien); QUIÉN debe ya vive un nivel abajo, en la lista del acordeón ("Debe"). El héroe
    // comunica el número clave; el detalle vive dentro. El concepto lo dan el tono (ámbar/teal) y el teaser.
    // El teaser NO repite el héroe: ABIERTA solo añade el OTRO número (lo que se entrega). CERRADA: pasado.
    const teaser = cerrada
      ? `Entregó ${$peso(inf.entregaTesorero)} al Tesorero`
      : `Entrega ${$peso(inf.entregaTesorero)} al Tesorero`;
    // Lista de cobro COMPLETA (nadie desaparece): PENDIENTES (saldo>0, ámbar = lo que falta) arriba; SALDADAS
    // (terceros que ya pagaron, saldo 0) abajo, con check teal + nombre gris + el MONTO que pagaron (su total,
    // en teal = saldado, NO ámbar). El valor NO desaparece: se lee cuánto aportó cada quien de un vistazo.
    const saldadas = (p.asistencias || []).filter(a => a.personaId !== prinId && a.pagado && sel.totalAsistencia(p, a) > 0);
    const pendList = deud.map(d => `<div class="kv"><span>${e(nombrePersona(d.personaId))}</span><b class="pend">${$peso(d.saldo)}</b></div>`).join('');
    const saldList = saldadas.map(a => `<div class="kv saldada"><span><span class="asis-check">${icon('check', 'sm')}</span> ${e(nombrePersona(a.personaId))}</span><b class="pagado">${$peso(sel.totalAsistencia(p, a))}</b></div>`).join('');
    const deudList = (deud.length || saldadas.length) ? (pendList + saldList) : `<div class="muted small">Nadie debe</div>`;
    const hero = `<div class="bal-hero">
        <div class="bal-label"><span class="dot ${cerrada ? 'closed' : ''}"></span>Recaudo</div>
        <div class="bal-amount ${heroTone}">${$peso(heroAmount)}</div>
      </div>`;
    const toggle = `<button class="acc-head bal-toggle" data-act="toggle-balance" data-sec="informe" aria-expanded="${abierto ? 'true' : 'false'}">
        <span class="acc-caret ${abierto ? 'open' : ''}">${icon('chevron-down')}</span>
        <span class="acc-sub">${teaser}</span>
      </button>`;
    // Llave Bre-B: snapshot p.pago.breB con FALLBACK a la llave VIGENTE del principal (mismo patrón que la
    // hoja Pagar y el PNG). Si la Bre-B se agregó DESPUÉS de crear la primada (o se asignó el principal con
    // "Hacer principal"), el snapshot puede estar vacío pero la llave existe en el directorio → la mostramos.
    const breBRecaudo = (p.pago && p.pago.breB) || (prinId ? (sel.persona(prinId) || {}).breB : null) || '';
    const body = abierto ? `<div class="acc-body">
        <div class="kv"><span>Bre-B</span><b>${breBRecaudo ? e(breBRecaudo) : '—'}</b></div>
        <div class="kv"><span>Recaudo teórico</span><b>${$peso(inf.recaudadoTeorico)}</b></div>
        <div class="kv"><span>Recupera</span><b>${$peso(inf.recuperaPrincipal)}</b></div>
        <div class="kv total"><span>Entrega al Tesorero</span><b>${$peso(inf.entregaTesorero)}</b></div>
        <div class="kv"><span>Recaudado</span><b>${$peso(inf.recaudadoReal)}</b></div>
        <div class="kv subkv"><span>· de terceros</span><b>${$peso(inf.pagadoTerceros)}</b></div>
        <div class="kv subkv"><span>· del principal</span><b>${$peso(inf.autoAbonoPrincipal)}</b></div>
        <div class="kv"><span>Por cobrar</span><b>${$peso(inf.saldoPendiente)}</b></div>
        <div class="sub">Debe</div>
        ${deudList}
      </div>` : '';
    return `<div class="card acc-card ${abierto ? 'open' : ''}">${hero}${toggle}${body}</div>`;
  }

  // Tab Primadas = solo OPERAR: asistencias (registrar consumo). La identidad (mes/nombre/estado) y
  // la navegación viven en el SELECTOR de arriba; la config tras el engranaje; la plata en BALANCE.
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
          ? S().asistenciasPorConsumo(p).map(a => asistenteFilaViva(p, a, ui)).join('')
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
  // vive dentro del selector. CREAR vive SOLO en el gear global › Primadas › "Nueva primada".
  // ── TOPBAR (dinámica por vista) ────────────────────────────────────────────
  function authIcon(estado) { return estado === 'in' ? 'log-out' : (estado === 'out' ? 'log-in' : 'user'); }

  // HOME: marca + acciones [ + Nueva primada · ⚙ Ajustes · 👤 Cuenta ]. El "+" es el ÚNICO punto de creación.
  function topbarHome(state, ui) {
    return `<div class="brand"><h1>Primad<span class="accent">app</span></h1></div>
      <div class="header-actions">
        <button class="gear" data-act="new-primada" title="Nueva primada" aria-label="Nueva primada">${icon('plus-circle')}</button>
        <button class="gear" data-act="open-ajustes" title="Ajustes" aria-label="Ajustes">${icon('settings-2')}</button>
        <button class="gear" id="authBtn" title="Cuenta" aria-label="Cuenta">${icon(authIcon(ui && ui.authEstado))}</button>
      </div>`;
  }

  // DETALLE: ← Inicio · nombre de la primada · [ 🔗 compartir · ··· configurar ].
  function topbarDetalle(state, ui) {
    const p = S().activePrimada();
    if (!p) return topbarHome(state, ui);
    const inc = S().primadaIncompleta(p) ? ' ' + badge('sin principal', 'warn') : '';
    return `<button class="topbar-back" data-act="volver-home" aria-label="Volver a inicio">${icon('chevron-left')}<span>Inicio</span></button>
      <span class="topbar-name">${e(nombreCorto(p.nombre))}${inc}</span>
      <div class="header-actions">
        ${hayDatosInforme(p) ? `<button class="gear" data-act="compartir-informe" title="Compartir informe" aria-label="Compartir informe">${icon('share-2')}</button>` : ''}
        <button class="gear" data-act="open-config-primada" title="Configurar primada" aria-label="Configurar primada">${icon('settings-2')}</button>
      </div>`;
  }

  /* ============================================================
     HOME — lista de primadas (pantalla de inicio). Reemplaza el tab bar y el selector-overlay.
     · Hero card de la ACTIVA: nombre + mes + dot (SIN monto). · Historial: filas compactas con GANANCIA.
     Tap en cualquier fila/hero = entrar a su detalle (data-act="entrar-primada"). Secciones relativas a la
     activa (Próximas/Pasadas) para no meter una primada futura en "Pasadas" (determinista, no por reloj).
     ============================================================ */
  function homeBody(state, ui) {
    const sel = S();
    if (!state.primadas.length) {
      return `<div class="empty-soft big primada-vacia">
        <div class="ph-title">Tu primera primada</div>
        <div>Tocá <b>+</b> arriba para crear la primera.</div>
      </div>`;
    }
    const activeId = state.activePrimadaId;
    const activa = sel.activePrimada();
    const proximas = sel.primadasProximas(activeId);
    const pasadas = sel.primadasPorAnio()
      .map(g => ({ anio: g.anio, primadas: g.primadas.filter(p => p.id !== activeId && !sel.esFutura(p, activeId)) }))
      .filter(g => g.primadas.length);
    const secProx = proximas.length
      ? `<div class="home-sub">Próximas</div><div class="hist-list">${proximas.map(historialFila).join('')}</div>` : '';
    const secPas = pasadas.length
      ? `<div class="home-sub">Pasadas</div>` + pasadas.map(g =>
          `<div class="home-anio">${e(g.anio)}</div><div class="hist-list">${g.primadas.map(historialFila).join('')}</div>`).join('')
      : '';
    return `<div class="home">${activa ? heroCard(activa) : ''}${secProx}${secPas}</div>`;
  }

  // Hero card de la primada activa: nombre + mes + dot de estado. SIN monto (decisión de producto).
  function heroCard(p) {
    return `<button class="hero-card" data-act="entrar-primada" data-id="${p.id}" aria-label="Abrir ${e(nombreCorto(p.nombre))}">
      <span class="hero-dot dot ${dotClase(p)}"></span>
      <span class="hero-id">
        <span class="hero-name">${e(nombreCorto(p.nombre))}</span>
        <span class="hero-mes">${e(Util.monthYear(p.mesContable))}</span>
      </span>
    </button>`;
  }

  // Fila compacta de historial: dot + nombre + mes + GANANCIA al final. Sin chevron (el tap es el affordance).
  function historialFila(p) {
    return `<button class="hist-fila" data-act="entrar-primada" data-id="${p.id}" aria-label="Abrir ${e(nombreCorto(p.nombre))}">
      <span class="hist-id"><span class="dot ${dotClase(p)}"></span><span class="hist-name">${e(nombreCorto(p.nombre))}</span> <span class="hist-mes">${e(Util.monthName(p.mesContable))}</span></span>
      <span class="hist-gan">${$peso(S().ganancia(p))}</span>
    </button>`;
  }

  /* ============================================================
     DETALLE — espacio operativo de la primada activa. La identidad (nombre/mes) vive en la topbar.
     El Balance ya NO es un seg-nav: es un PANEL inferior (mismo scroll), subordinado a la Lista viva.
     Un chip "Balance ▲/▼" lo despliega/colapsa. Default por estado: ABIERTA = colapsado (Consumos es lo
     que importa); CERRADA = desplegado (el Balance es el documento final). Reusa balancePrimada() tal cual.
     ============================================================ */
  // ¿El panel de Balance está desplegado? null = default por estado (cerrada→sí, abierta→no); bool = manual.
  function balanceAbierto(p, ui) {
    if (ui && ui.balanceOpen != null) return !!ui.balanceOpen;
    return !!(p && p.estado === 'cerrada');
  }
  function detalleBody(state, ui) {
    const activa = S().activePrimada();
    if (!activa) return homeBody(state, ui);
    const abierto = balanceAbierto(activa, ui);
    const chip = `<button class="balance-toggle ${abierto ? 'on' : ''}" data-act="toggle-balance-panel" aria-expanded="${abierto ? 'true' : 'false'}">
      <span>Balance</span>${icon(abierto ? 'chevron-down' : 'chevron-up')}</button>`;
    const panel = abierto ? `<div class="balance-panel">${balancePrimada(activa, ui)}</div>` : '';
    return `${primadaDetalle(activa, ui)}<div class="balance-dock">${chip}${panel}</div>`;
  }

  // Hoja "···" de configuración de la primada activa (re-wrap de configPrimadaBody: Asistentes | Productos).
  function configPrimadaSheet(state, ui) {
    const p = S().activePrimada();
    const head = `<div class="sheet-head"><div class="sheet-title">${p ? e(nombreCorto(p.nombre)) : 'Configurar'}</div>
      <button class="gear" data-act="close-overlay" aria-label="Cerrar">${icon('x')}</button></div>`;
    if (!p) return `<div class="sheet full">${head}<div class="empty-soft">Sin primada activa.</div></div>`;
    return `<div class="sheet full">${head}<div class="sheet-body">${configPrimadaBody(p, ui)}</div></div>`;
  }

  /* ============================================================
     BALANCE — CARA de la primada (no es destino propio): reparto del fondo + informe del principal.
     Mismos selectores que antes → ganancia/cover/saldos idénticos. La identidad (nombre/mes/estado) ya
     la muestra el selector de arriba, así que aquí no se repite cabecera. Cada bloque lleva su CIFRA
     HÉROE (grande, SIEMPRE visible) + la derivación dentro de un acorde toggleable. El render bifurca por
     p.estado: ABIERTA = provisional (en vivo); CERRADA = documento final (sin etiqueta provisional).
     ============================================================ */
  function balancePrimada(p, ui) {
    return `${reparto(p, ui)}${informe(p, ui)}`;
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
  // Directorio PERSONAS = LISTA COMPACTA agrupada (Ahorradores / Invitados), una línea por persona
  // (nombre + nº de primadas + chevron de drill-in). Tap → EDITAR ENFOCADO (personaEditView): la lista
  // queda escaneable y editar es un detalle de una sola persona, no un muro de acordeones inline.
  function personasBody(state, ui) {
    if (ui && ui.editPersonaId) {
      const per = S().persona(ui.editPersonaId);
      if (per) return personaEditView(per, ui);
    }
    const personas = S().personasOrdenadas();
    const grupo = (estado, titulo) => {
      const filas = personas.filter(p => p.estado === estado);
      if (!filas.length) return '';
      return `<div class="grp-head"><span class="grp-titulo">${titulo}</span><span class="grp-cover">${filas.length}</span></div>
        <div class="persona-list">${filas.map(personaFilaCompacta).join('')}</div>`;
    };
    const lista = personas.length
      ? `${grupo('ahorrador', 'Ahorradores')}${grupo('invitado', 'Invitados')}`
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
    return `${lista}<div class="prow-foot">${alta}</div>`;
  }
  // Fila compacta de persona (drill-in): nombre + nº primadas; tap = editar enfocado.
  function personaFilaCompacta(per) {
    const ap = S().aparicionesDe(per.id);
    const meta = ap ? (ap + ' primada' + (ap > 1 ? 's' : '')) : 'Sin primadas';
    return `<button class="persona-fila" data-act="editar-persona" data-pid="${per.id}">
      <span class="persona-fila-id"><b>${e(per.nombre)}</b> <span class="persona-fila-meta">${meta}</span></span>
      <span class="persona-fila-caret">${icon('chevron-right')}</span>
    </button>`;
  }
  // EDICIÓN ENFOCADA de UNA persona (drill-in dentro del tab Personas): back + nombre + estado + Bre-B.
  // Conserva TODO lo ajustable; solo cambia la presentación (detalle, no acordeón en una lista gigante).
  function personaEditView(per, ui) {
    const ap = S().aparicionesDe(per.id);
    const seg = est => `<button class="seg ${per.estado === est ? 'on' : ''}" data-act="set-estado-persona" data-pid="${per.id}" data-estado="${est}">${cap(est)}</button>`;
    return `<button class="back-link" data-act="cerrar-persona-edit">${icon('chevron-left')}Personas</button>
      <div class="persona-edit">
        <label class="fld"><span>Nombre</span>
          <input class="ti" data-ch="rename-persona" data-pid="${per.id}" value="${e(per.nombre)}" maxlength="40" aria-label="Nombre"></label>
        <div class="fld"><span>Estado</span>
          <div class="seg-nav sm">${seg('ahorrador')}${seg('invitado')}</div></div>
        <label class="fld"><span>Bre-B</span>
          <input class="ti breb" data-ch="breb-persona" data-pid="${per.id}" value="${per.breB ? e(per.breB) : ''}" placeholder="Bre-B" aria-label="Bre-B"></label>
        <div class="muted small mt-3">${ap ? ('Aparece en ' + ap + ' primada' + (ap > 1 ? 's' : '')) : 'Sin primadas todavía'}</div>
      </div>`;
  }

  function ajustesBody(state, ui) {
    const c = state.settings.cover;
    // Build incrustado (meta sellado) → para confirmar de un vistazo qué versión corre en el device.
    const build = (typeof document !== 'undefined' && (document.querySelector('meta[name="build"]') || {}).content) || '—';
    // "Borrar mi cuenta" (Apple 5.1.1(v)): SOLO con sesión. Revoca el acceso; el libro de las primadas se
    // conserva (es colectivo). Distinto de cerrar una primada. La acción la gatea el RPC (último admin, etc.).
    const cuenta = (ui && ui.sesion)
      ? `<div class="sub danger-sub">Cuenta</div>
         <button class="mini danger" data-act="borrar-mi-cuenta">${icon('trash-2')}Borrar mi cuenta</button>
         <div class="muted small">Se elimina tu acceso (correo). Las cuentas de las primadas se conservan.</div>`
      : '';
    return `<div class="sub">Cover</div>
      <div class="grid2">
        <label class="fld"><span>Ahorrador</span>
          <input class="ti" type="number" min="0" step="500" data-ch="cover-ahorrador" value="${c.ahorrador}"></label>
        <label class="fld"><span>Invitado</span>
          <input class="ti" type="number" min="0" step="500" data-ch="cover-invitado" value="${c.invitado}"></label>
      </div>
      <div class="sub">Versión</div>
      <div class="muted small">${e(build)}</div>
      <div class="sub">Legal</div>
      <div class="muted small"><a class="link-legal" href="privacy.html" target="_blank" rel="noopener">Política de Privacidad</a></div>
      ${cuenta}`;
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

  // GEAR GLOBAL = ÚNICA configuración, CUATRO tabs con alcances SEPARADOS (cada uno UNA intención):
  //   Primada (config del evento activo: Asistentes/Productos) · Calendario (todas las primadas: crear/
  //   eliminar/reabrir) · Personas (directorio) · Ajustes (globales). Antes "Primadas" mezclaba config +
  //   calendario en un scroll → mala IA; ahora son tabs distintos. seg-nav full-width (`.cols4`) para 4 tabs.
  function overlaySheet(active, state, ui) {
    const seg = (key, label) => `<button class="seg ${active === key ? 'on' : ''}" data-act="overlay-tab" data-overlay="${key}">${label}</button>`;
    const body = active === 'ajustes' ? ajustesBody(state, ui)
      : active === 'personas' ? personasBody(state, ui)
      : active === 'calendario' ? calendarioBody(state, ui)
      : primadaConfigTab(state, ui);                          // 'primada' (default)
    return `<div class="sheet full">
      <div class="sheet-head">
        <div class="seg-nav sm cols4">${seg('primada', 'Primada')}${seg('calendario', 'Calendario')}${seg('personas', 'Personas')}${seg('ajustes', 'Ajustes')}</div>
        <button class="gear" data-act="close-overlay" aria-label="Cerrar">${icon('x')}</button>
      </div>
      <div class="sheet-body">${body}</div>
    </div>`;
  }

  // Tab PRIMADA = config del EVENTO ACTIVO (Asistentes | Productos). Solo eso (sin calendario). Encabeza con
  // el nombre de la primada activa para dejar claro QUÉ se está configurando.
  function primadaConfigTab(state, ui) {
    const p = S().activePrimada();
    if (!p) return `<div class="empty-soft">Sin primada activa.<br>Creá una en <b>Calendario</b>.</div>`;
    return `<div class="cfg-primada-name">${e(nombreCorto(p.nombre))}</div>${configPrimadaBody(p, ui)}`;
  }

  // Tab CALENDARIO = TODAS las primadas: "Nueva primada" (ÚNICO punto de creación) + lista (Próximas · Activa ·
  // Pasadas, relativas a la activa) con acciones administrativas por fila (Eliminar / Reabrir). Dot por actividad.
  function calendarioBody(state, ui) {
    const sel = S();
    const activeId = state.activePrimadaId;
    const proximas = sel.primadasProximas(activeId);             // futuras (mes > activa), asc
    const grupos = sel.primadasPorAnio();
    const activa = sel.activePrimada();
    const pasadas = grupos.map(g => ({ anio: g.anio, primadas: g.primadas.filter(p => p.id !== activeId && !sel.esFutura(p, activeId)) }))
      .filter(g => g.primadas.length);
    const secProx = proximas.length
      ? `<div class="sub">Próximas</div>${proximas.map(p => primadaAdminFila(p, activeId)).join('')}` : '';
    const secActiva = activa
      ? `<div class="sub">Activa</div>${primadaAdminFila(activa, activeId)}` : '';
    const secPasadas = pasadas.length
      ? `<div class="sub">Pasadas</div>` + pasadas.map(g =>
          `<div class="sel-subanio">${e(g.anio)}</div>${g.primadas.map(p => primadaAdminFila(p, activeId)).join('')}`).join('') : '';
    const vacio = (!secProx && !secActiva && !secPasadas) ? '<div class="empty-soft">Sin primadas</div>' : '';
    return `<button class="add-link" data-act="new-primada">${icon('plus-circle')}Nueva primada</button>
      ${secProx}${secActiva}${secPasadas}${vacio}`;
  }
  // Fila administrativa: nombre + mes · recaudo · acciones (Reabrir si cerrada, Eliminar siempre con
  // confirmación). Eliminar la ACTIVA en operación lleva data-activa para una advertencia más fuerte.
  function primadaAdminFila(p, activeId) {
    const sel = S();
    const meta = `${e(Util.monthName(p.mesContable))} · ${$peso(sel.recaudado(p))}`;
    const esActiva = p.id === activeId;
    return `<div class="padm-fila">
      <span class="padm-id"><span class="dot ${dotClase(p)}"></span><b>${e(nombreCorto(p.nombre))}</b> <span class="padm-meta">${meta}</span></span>
      <span class="padm-acc">
        ${p.estado === 'cerrada' ? `<button class="xmini" data-act="reabrir-primada" data-id="${p.id}">Reabrir</button>` : ''}
        <button class="xmini danger" data-act="borrar-primada" data-id="${p.id}" ${esActiva ? 'data-activa="1"' : ''} aria-label="Eliminar primada">${icon('trash-2', 'sm')}</button>
      </span>
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
  let lastOverlayKey = null;   // overlay del último render (para preservar el scroll del .sheet entre re-renders)
  function render(state, ui) {
    ui = ui || { view: 'home', overlay: null, activaPid: null, editPersonaId: null };

    // IA LISTA→DETALLE (estilo Tricount): la app tiene DOS vistas, `ui.view` ∈ {'home','detalle'}.
    //  · HOME = lista de primadas (pantalla de inicio). · DETALLE = el espacio operativo de la primada activa.
    // No hay tab bar. La topbar es DINÁMICA por vista (home: marca + "+" + ajustes; detalle: ← + nombre + 🔗 + ···).
    const enDetalle = ui.view === 'detalle' && !!(state && S().activePrimada());

    // 1) Topbar dinámica.
    if (els.topbar) els.topbar.innerHTML = !state ? '' : (enDetalle ? topbarDetalle(state, ui) : topbarHome(state, ui));

    // 2) Contenido: HOME (lista) o DETALLE (operación de la activa).
    let html;
    if (!state)        html = '<div class="empty-soft">Cargando…</div>';   // primer pintado: aún hidratando (load async)
    else if (enDetalle) html = detalleBody(state, ui);
    else               html = homeBody(state, ui);
    els.screen.innerHTML = html;

    // 3) overlay: wizard (prioridad) · pantalla del engranaje (Personas / Primadas / Ajustes) · etc.
    // El re-render reescribe els.overlay.innerHTML → recrea el .sheet (el scroll vive ahí, overflow:auto) y
    // saltaría al TOPE en cada toggle interno (p.ej. desplegar una persona). PRESERVAMOS el scrollTop del
    // .sheet cuando seguimos en el MISMO overlay (mismo overlayKey); al cambiar de overlay/tab, arranca arriba.
    const overlayKey = ui.wizard ? 'wizard' : (ui.overlay || null);
    const prevSheet = els.overlay.querySelector('.sheet');
    const keepScroll = (prevSheet && overlayKey && overlayKey === lastOverlayKey) ? prevSheet.scrollTop : 0;

    if (ui.wizard)                                              els.overlay.innerHTML = wizardSheet(state, ui);
    else if (ui.overlay === 'login')                           els.overlay.innerHTML = loginSheet(state, ui);
    else if (ui.overlay === 'pagar')                           els.overlay.innerHTML = pagarSheet(state, ui);
    else if (ui.overlay === 'selector-primada')                els.overlay.innerHTML = selectorSheet(state, ui);
    else if (ui.overlay === 'config-primada')                  els.overlay.innerHTML = configPrimadaSheet(state, ui);
    else if (ui.overlay === 'add-asis')                        els.overlay.innerHTML = addAsisSheet(state, ui);
    else if (ui.overlay === 'primada' || ui.overlay === 'calendario' || ui.overlay === 'personas' || ui.overlay === 'ajustes') els.overlay.innerHTML = overlaySheet(ui.overlay, state, ui);
    else                                                        els.overlay.innerHTML = '';

    if (keepScroll) { const ns = els.overlay.querySelector('.sheet'); if (ns) ns.scrollTop = keepScroll; }
    lastOverlayKey = overlayKey;
    els.overlay.hidden = !(ui.wizard || ui.overlay);
  }

  let toastTimer;
  // toast(msg, kind?) — kind 'ok' = tono POSITIVO (confirmación de acción exitosa, p.ej. pago saldado).
  function toast(msg, kind) {
    els.toast.textContent = msg;
    els.toast.classList.toggle('ok', kind === 'ok');
    els.toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2400);
  }

  /* ============================================================
     COMPARTIR INFORME — captura el template (informeTemplateHTML) como PNG y lo comparte.
     html2canvas se carga LAZY por CDN en el primer uso (no infla el cold-start; el SW no intercepta CDN).
     Antes de capturar se espera document.fonts para rasterizar Instrument Sans (si no, html2canvas cae a
     fuente del sistema). Compartir: navigator.share({files}) en móvil; fallback = descarga del PNG.
     ============================================================ */
  let _h2cPromise;
  function loadHtml2Canvas() {
    if (typeof window !== 'undefined' && window.html2canvas) return Promise.resolve(window.html2canvas);
    if (_h2cPromise) return _h2cPromise;
    _h2cPromise = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = () => res(window.html2canvas);
      s.onerror = () => { _h2cPromise = null; rej(new Error('No se pudo cargar el generador de imagen')); };
      document.head.appendChild(s);
    });
    return _h2cPromise;
  }

  async function esperarFuentes() {
    if (typeof document === 'undefined' || !document.fonts) return;
    try { await document.fonts.load('700 16px "Instrument Sans"'); await document.fonts.load('400 16px "Instrument Sans"'); } catch (e) {}
    try { await document.fonts.ready; } catch (e) {}
  }

  // p = primada activa. Construye el template oculto, lo rasteriza y dispara el share sheet (o descarga).
  async function shareInforme(p) {
    if (!p) return;
    let host = null;
    try {
      const h2c = await loadHtml2Canvas();
      host = document.createElement('div');
      host.className = 'informe-host';
      host.innerHTML = informeTemplateHTML(p);
      document.body.appendChild(host);
      await esperarFuentes();
      const node = host.firstElementChild;
      const canvas = await h2c(node, { scale: Math.max(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1), backgroundColor: '#ffffff', useCORS: true, logging: false });
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      if (!blob) throw new Error('No se pudo generar la imagen');
      const slug = (p.nombre || 'primada').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'primada';
      const file = new File([blob], `primada-${slug}.png`, { type: 'image/png' });
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      if (nav && nav.share && nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: p.nombre });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = file.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;   // el usuario cerró el share sheet → no es error
      toast(err && err.message ? err.message : 'No se pudo compartir el informe');
    } finally {
      if (host) host.remove();
    }
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
                  pattern="[0-9]*" maxlength="10" placeholder="Código" aria-label="Código del correo">
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
        <div class="sheet-body">${cuerpo}
          <p class="login-legal muted small">Al entrar aceptas nuestra
            <a href="privacy.html" target="_blank" rel="noopener">Política de Privacidad</a>.</p>
        </div>
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
  // Indicador offline/sync: vive DENTRO del detalle (no en el home). `visible` lo gatea el controller
  // (ui.view==='detalle'); fuera del detalle se oculta aunque haya pendientes (se ven al entrar a operar).
  function renderSync(s, visible) {
    if (typeof document === 'undefined') return;
    let el = document.getElementById('syncIndicator');
    const hayError = s && s.error;
    const hayPend = s && s.pendientes > 0;
    if (visible === false || (!hayError && !hayPend)) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'syncIndicator'; el.className = 'sync-indicator'; document.body.appendChild(el); }
    el.classList.toggle('err', !!hayError);
    el.textContent = hayError ? ('⚠ ' + s.error) : '⟳ Guardando…';
    if (hayError) toast(s.error);
  }

  root.View = { cache, render, showAppChrome, renderAuthButton, renderSync, balanceAbierto, toast, shareInforme, informeTemplateHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = { View: root.View };
})(typeof window !== 'undefined' ? window : globalThis);
