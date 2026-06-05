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
  const Util  = root.Util || {};
  const CONFIG = root.CONFIG || {};

  // Inicializa el estado del wizard "Nueva primada": principal vacío, sin co-organizadores,
  // productos = copia editable del catálogo por defecto, fecha = hoy, mes = mes de hoy.
  function nuevoWizard() {
    const hoy = Util.currentDate ? Util.currentDate() : '';
    const prods = (CONFIG.defaultProducts || []).map(p => ({ emoji: p.emoji, nombre: p.nombre, costoNeto: p.costoNeto, precioVenta: p.precioVenta }));
    return { paso: 1, principalId: '', coorg: [], productos: prods, fecha: hoy, mesContable: Util.mesDeFecha ? Util.mesDeFecha(hoy) : '' };
  }

  // Vuelca los inputs del paso actual del wizard al estado ui.wizard (antes de avanzar/crear).
  // El wizard es UI pura: no pasa por el Store, así que leemos el DOM directamente.
  function wzSync() {
    const w = ui.wizard; if (!w) return;
    const val = id => { const el = document.getElementById(id); return el ? el.value : undefined; };
    if (w.paso === 1) { const p = val('wz-principal'); if (p !== undefined) w.principalId = p; }
    if (w.paso === 2) {
      document.querySelectorAll('[data-wz]').forEach(el => {
        const i = Number(el.dataset.i), campo = el.dataset.wz; if (!w.productos[i]) return;
        w.productos[i][campo] = (campo === 'costoNeto' || campo === 'precioVenta') ? (Number(el.value) || 0) : el.value;
        // Captura el "manual" del emoji (data-auto '0') para que sobreviva al re-render.
        if (campo === 'emoji') w.productos[i].emojiManual = (el.dataset.auto === '0');
      });
    }
    if (w.paso === 3) { const f = val('wz-fecha'), m = val('wz-mes'); if (f !== undefined) w.fecha = f; if (m !== undefined) w.mesContable = m; }
  }

  // ui = estado EFÍMERO (no dominio, no se persiste):
  // - activaPid: personaId de la fila ACTIVA en el tab Consumos (Modelo 3, lista viva; UNA a la vez).
  //   Al activarse, sus productos salen inline como chips (apuntar en 1 tap) + el bloque de pago. null = ninguna.
  // - personasAbiertas: Set de personaId con la fila de persona expandida (edición inline)
  // - nuevaPersona: form "Agregar persona" desplegado al pie del overlay Personas
  // - overlay 'add-asis': hoja simple para agregar asistentes del directorio
  // - configTab: pestaña activa del overlay Configurar primada ('asistentes' | 'productos')
  // - configProd: Set de filas-acordeón de PRODUCTO expandidas en Configurar (clon de Personas)
  // - cara: CARA visible del tab Primadas — 'operacion' (Consumos) | 'balance' (Balance). El Balance dejó
  //   de ser un tab: es una cara de la primada activa. Default por ESTADO (cerrada → 'balance', abierta →
  //   'operacion'), fijada al seleccionar/crear/cargar/cerrar/reabrir vía fijarCaraPorEstado().
  // - balance: Set de cards-acordeón del Balance abiertas ('reparto'|'informe'); el héroe (cifra grande) va
  //   SIEMPRE visible fuera del acorde, el desglose (derivación) dentro.
  const ui = { tab: 'primadas', cara: 'operacion', overlay: null, activaPid: null, wizard: null,
               personasAbiertas: new Set(), nuevaPersona: false,
               configTab: 'asistentes', configProd: new Set(), pagarPid: null,
               balance: new Set(), auditPid: null, apuntadores: {}, presentes: [],
               loginEstado: 'form', loginEmail: '' };
  let sesionActiva = false;   // hay sesión Supabase (gate INVERTIDO: lectura sin sesión, escritura requiere login)
  let miEmail = null;         // email de la sesión (para presence "quién está apuntando")

  // Acciones que ESCRIBEN datos de dominio (gate invertido: sin sesión se abre el login en vez de mutar).
  // Lectura/navegación (tabs, selector, abrir tarjetas, colapsar Balance, Configurar, copiar llave,
  // open-pagar) NO están aquí: la app es usable en LECTURA con solo el link. seleccionar-primada es local.
  const WRITE_ACTS = new Set([
    'new-primada', 'wz-crear', 'cerrar-primada', 'reabrir-primada', 'borrar-primada',
    'add-asistencia', 'add-asistencia-cortesia', 'hacer-principal', 'remove-asistencia', 'toggle-exonerado', 'item-plus', 'item-minus',
    'remove-producto', 'add-producto', 'marcar-pagado', 'set-no-pagado', 'add-persona', 'set-estado-persona',
    'borrar-mi-cuenta',
  ]);
  function backendOn() { return !!(Auth && Auth.enabled()); }     // hay backend Supabase (RLS es la frontera real)
  function pedirLogin() { ui.overlay = 'login'; ui.loginEstado = 'form'; rerender(); }

  function rerender() { ui.sesion = sesionActiva; View.render(Store.select.state(), ui); sincronizarVivo(); sincronizarPresencia(); }

  // PRESENCE (Fase C): publica mi presencia en la primada ACTIVA y mantiene ui.presentes (los OTROS).
  // "Auto-coordinación, no bloqueo": solo informa quién está y quién apunta. Re-suscribe al cambiar de
  // primada o cuando se conoce mi nombre (tras login). Sin client (local/tests) → noop.
  let presencia = null, presenciaKey = null, apuntandoTimer = null;
  function miNombre() { return miEmail ? String(miEmail).split('@')[0] : 'alguien'; }
  function sincronizarPresencia() {
    if (!(root.Api && root.Api.subscribePresence)) return;
    const p = Store.select.activePrimada();
    const id = p ? p.id : null;
    const key = id ? (id + '|' + miNombre()) : null;
    if (key === presenciaKey) return;                 // misma primada + mismo nombre → nada que hacer
    if (presencia) { try { presencia.unsubscribe(); } catch (e) {} presencia = null; }
    presenciaKey = key;
    if (!id) { if (ui.presentes && ui.presentes.length) { ui.presentes = []; } return; }
    presencia = root.Api.subscribePresence(id, { nombre: miNombre(), apuntando: 0 }, (lista, ownKey) => {
      ui.presentes = (lista || []).filter(m => m._key !== ownKey);
      rerender();
    });
  }
  // Avisa "estoy apuntando" al registrar consumo (se apaga solo a los ~3s).
  function marcarApuntando() {
    if (!presencia) return;
    presencia.setMeta({ apuntando: Date.now() });
    if (apuntandoTimer) clearTimeout(apuntandoTimer);
    apuntandoTimer = setTimeout(() => { if (presencia) presencia.setMeta({ apuntando: 0 }); }, 3000);
  }

  // SYNC EN VIVO (Fase B): mantiene UNA suscripción a los consumos de la primada ACTIVA (Postgres
  // Changes). Al cambiar de primada → re-suscribe; al (re)conectar el canal → re-snapshota (reconcilia
  // lo perdido). applyRemoteConsumo es idempotente (ignora el eco propio). Sin client (local/tests) → noop.
  let vivoUnsub = null, vivoPrmId = null;
  function sincronizarVivo() {
    if (!(root.Api && root.Api.subscribeConsumos)) return;
    const p = Store.select.activePrimada();
    const id = p ? p.id : null;
    if (id === vivoPrmId) return;                 // misma primada activa → nada que re-suscribir
    if (vivoUnsub) { try { vivoUnsub(); } catch (e) {} vivoUnsub = null; }
    vivoPrmId = id;
    if (!id) return;
    vivoUnsub = root.Api.subscribeConsumos(id, {
      onChange: (evt) => Store.actions.applyRemoteConsumo(id, evt),
      onSubscribed: () => Promise.resolve(root.Api.fetchConsumos(id)).then(rows => { if (rows) Store.actions.replaceConsumos(id, rows); }).catch(() => {}),
    });
  }

  // Envuelve acciones que pueden lanzar por invariante (principal ahorrador, etc.)
  function tryAction(fn) {
    try { fn(); }
    catch (err) { View.toast(err && err.message ? err.message : 'Acción no permitida'); rerender(); }
  }

  function activeId() { const p = Store.select.activePrimada(); return p ? p.id : null; }

  // La CARA por defecto de Primadas sale del ESTADO de la primada activa: una cerrada abre en su
  // 'balance' (documento final, solo-lectura); una abierta abre en 'operacion' (Consumos). Se fija al
  // cambiar de primada activa (seleccionar/crear/cargar) y al cerrar/reabrir. set-cara la conmuta a mano.
  function fijarCaraPorEstado() {
    const p = Store.select.activePrimada();
    ui.cara = (p && p.estado === 'cerrada') ? 'balance' : 'operacion';
  }

  /* ---------- Clicks (delegados en document) ---------- */
  function onClick(ev) {
    // Navegación: tabs y engranaje
    const tab = ev.target.closest('[data-tab]');
    if (tab) { ui.tab = tab.dataset.tab; ui.overlay = null; rerender(); return; }
    // Gear global = ÚNICA config. Abre CONTEXT-AWARE: con primada activa → tab "Primadas" (donde vive su
    // config Asistentes/Productos + el calendario) → configurar la activa queda en ~1 tap; sin activa → Personas.
    if (ev.target.closest('#gearBtn')) {
      if (ui.overlay) { ui.overlay = null; }
      else { ui.overlay = Store.select.activePrimada() ? 'primadas' : 'personas'; ui.configTab = 'asistentes'; }
      rerender(); return;
    }
    // Botón de cuenta (auth) = OPT-IN: el login NO bloquea al entrar; se abre desde acá.
    // Con sesión → cerrar sesión. Sin sesión → abrir la hoja de login (cerrable). Sin backend → aviso.
    if (ev.target.closest('#authBtn')) {
      if (Auth && Auth.enabled()) {
        if (sesionActiva) { Auth.signOut(); View.toast('Sesión cerrada'); }
        else { ui.overlay = 'login'; ui.loginEstado = 'form'; rerender(); }
      } else { View.toast('Sesión no disponible'); }
      return;
    }

    const b = ev.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    const pid = b.dataset.pid;          // personaId
    const id  = b.dataset.id;           // primadaId
    const prm = activeId();
    const A = Store.actions;

    // GATE INVERTIDO (decisión #5): la app carga en LECTURA para cualquiera con el link; el login salta
    // SOLO al intentar ESCRIBIR. La frontera real es RLS (rechaza al anon); esto es el aviso amable.
    if (WRITE_ACTS.has(act) && backendOn() && !sesionActiva) { pedirLogin(); return; }

    switch (act) {
      // ----- auth (hoja de login, opt-in desde el ícono de perfil) -----
      case 'login-enviar': {
        const inp = document.getElementById('login-email');
        const email = (inp && inp.value || '').trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { View.toast('Correo no válido'); return; }
        b.disabled = true;
        ui.loginEmail = email;
        Promise.resolve(Auth && Auth.signIn(email))
          .then(() => { ui.loginEstado = 'sent'; rerender(); })
          .catch((err) => { View.toast(err && err.message ? err.message : 'No se pudo enviar el código'); ui.loginEstado = 'form'; rerender(); });
        return;
      }
      // Verifica el CÓDIGO pegado → sesión EN ESTE dispositivo. El onChange (gate) cierra la hoja y carga.
      case 'login-verificar': {
        const inp = document.getElementById('login-codigo');
        const code = (inp && inp.value || '').replace(/\s/g, '').trim();
        if (!/^\d{4,10}$/.test(code)) { View.toast('Código no válido'); return; }   // Supabase OTP = 6–10 dígitos
        b.disabled = true;
        Promise.resolve(Auth && Auth.verifyOtp(ui.loginEmail, code))
          .then(() => { View.toast('Sesión iniciada'); /* onChange cierra y recarga */ })
          .catch((err) => { b.disabled = false; View.toast(err && err.message ? err.message : 'Código inválido o vencido'); });
        return;
      }
      case 'login-reset': ui.loginEstado = 'form'; rerender(); return;

      // Borrar mi cuenta (Apple 5.1.1(v)): revoca el login + anonimiza la auditoría; el libro colectivo
      // (primadas/consumos) se CONSERVA. RPC delete_own_account. Tras el éxito, signOut → el onChange
      // del gate recarga en modo LECTURA. Distinto de "Cerrar primada" (saldar) y de "Cerrar cuenta".
      case 'borrar-mi-cuenta': {
        if (root.confirm && !root.confirm('¿Borrar tu cuenta? Se elimina tu acceso (correo). Las cuentas de las primadas se conservan.')) return;
        b.disabled = true;
        Promise.resolve(root.Api && root.Api.deleteOwnAccount && root.Api.deleteOwnAccount())
          .then(() => { View.toast('Cuenta borrada'); if (Auth && Auth.signOut) Auth.signOut(); })
          .catch((err) => { b.disabled = false; View.toast(err && err.message ? err.message : 'No se pudo borrar la cuenta'); });
        return;
      }

      // ----- selector de primada (navegación: abre la hoja agrupada por año→mes) -----
      case 'open-selector': ui.overlay = 'selector-primada'; rerender(); return;

      // ----- cara del tab Primadas (Consumos | Balance): navegación, NO escritura (no entra al gate) -----
      case 'set-cara': ui.cara = (b.dataset.cara === 'balance') ? 'balance' : 'operacion'; rerender(); return;

      // ----- compartir informe como imagen (PNG → share sheet / descarga): I/O de vista, NO escritura -----
      case 'compartir-informe': { const p = Store.select.activePrimada(); if (p && View.shareInforme) View.shareInforme(p); return; }

      // ----- wizard "Nueva primada" (3 pasos, estado efímero en ui.wizard) — ÚNICO punto de creación -----
      // "Nueva primada" (ÚNICO punto de creación, vive en el gear › Primadas) abre el wizard SOBRE el gear.
      case 'new-primada':   ui.wizard = nuevoWizard(); rerender(); return;
      // Cancelar/crear cierran el wizard Y el gear que lo lanzó → vuelven a la app (no quedan en el gear).
      case 'wz-cancelar':   ui.wizard = null; ui.overlay = null; rerender(); return;
      case 'wz-atras':      if (ui.wizard && ui.wizard.paso > 1) ui.wizard.paso--; rerender(); return;
      case 'wz-toggle-coorg': {
        const w = ui.wizard; if (!w) return;
        const i = w.coorg.indexOf(pid);
        if (i >= 0) w.coorg.splice(i, 1); else w.coorg.push(pid);
        rerender(); return;
      }
      // wzSync ANTES de mutar la lista: si no, el re-render reconstruye desde el modelo viejo y se
      // pierde lo tecleado (nombre + emoji) en las demás filas.
      case 'wz-prod-add':    if (ui.wizard) { wzSync(); ui.wizard.productos.push({ emoji: '', nombre: '', costoNeto: 0, precioVenta: 0, emojiManual: false }); } rerender(); return;
      case 'wz-prod-remove': if (ui.wizard) { wzSync(); ui.wizard.productos.splice(Number(b.dataset.i), 1); } rerender(); return;
      case 'wz-siguiente': {
        const w = ui.wizard; if (!w) return;
        // sincronizar inputs del paso actual antes de avanzar (los selects/date no disparan change si no se tocaron)
        wzSync();
        if (w.paso === 1) {
          if (!w.principalId) { View.toast('Falta el principal'); return; }
          const per = Store.select.persona(w.principalId);
          if (!per || per.estado !== 'ahorrador') { View.toast('El principal debe ser ahorrador'); return; }
        }
        if (w.paso === 2) {
          w.productos = w.productos.filter(p => (p.nombre || '').trim());   // descarta filas vacías
          if (!w.productos.length) { View.toast('Falta un producto'); return; }
        }
        w.paso++; rerender(); return;
      }
      case 'wz-crear': {
        const w = ui.wizard; if (!w) return;
        wzSync();
        try {
          const id = A.createPrimada({
            principalId: w.principalId,
            organizadores: [w.principalId].concat(w.coorg),
            productos: w.productos.filter(p => (p.nombre || '').trim()),
            fecha: w.fecha, mesContable: w.mesContable,
          });
          ui.wizard = null; ui.overlay = null;   // cierra wizard + gear → aterriza en la primada nueva
          A.seleccionarPrimada(id);
          fijarCaraPorEstado();            // recién creada → abierta → cara 'operacion'
          View.toast('Primada creada'); rerender();   // pintar con la cara ya fijada (el commit rindió con la vieja)
        } catch (err) { View.toast(err && err.message ? err.message : 'No se pudo crear'); }
        return;
      }
      // Elegir una primada desde la hoja del selector: activa y cierra la hoja.
      case 'select-primada':   A.seleccionarPrimada(id); fijarCaraPorEstado(); ui.overlay = null; rerender(); return;
      // Conmuta la pestaña interna de config del evento activo (Asistentes | Productos) en el gear › Primadas.
      case 'config-tab':       ui.configTab = (b.dataset.ctab === 'productos') ? 'productos' : 'asistentes'; rerender(); return;
      // Acciones destructivas: con confirmación (la cuenta cerrada congela consumos).
      // cerrar/reabrir cambian el ESTADO → la cara por defecto cambia. La acción commitea y dispara un
      // rerender por el subscribe, pero con la cara aún vieja; fijamos la cara y RE-renderizamos explícito
      // (return) para que el pintado final refleje el nuevo estado (cerrada → 'balance', abierta → 'operacion').
      case 'cerrar-primada':
        if (!root.confirm || root.confirm('¿Cerrar la cuenta?')) {
          A.cerrarPrimada(id); fijarCaraPorEstado(); View.toast('Cuenta cerrada'); rerender();
        }
        return;
      case 'reabrir-primada':  A.reabrirPrimada(id); fijarCaraPorEstado(); View.toast('Cuenta reabierta'); rerender(); return;
      case 'borrar-primada':
        if (!root.confirm || root.confirm('¿Borrar la primada?')) {
          A.borrarPrimada(id); ui.overlay = null; View.toast('Primada borrada'); rerender(); return;
        }
        break;

      // ----- asistencias -----
      // "+ Agregar" abre la hoja simple del directorio (overlay 'add-asis').
      case 'open-add-asis': ui.overlay = 'add-asis'; rerender(); return;
      // En la hoja: cada fila lleva data-pid → agregar y quedarse en la hoja para sumar varios.
      case 'add-asistencia': { if (pid) A.addAsistencia(prm, pid); break; }
      // "Sin cover" (cortesía): la exoneración se DECIDE al agregar (niños/cortesía). Agrega + exonera.
      case 'add-asistencia-cortesia': { if (pid) { A.addAsistencia(prm, pid); A.toggleCoverExonerado(prm, pid); } break; }
      // "Hacer principal" (fix mínimo de primada incompleta): asigna el rol principal a un ahorrador.
      // INVARIANTE #2: setRol('principal') lanza si el snapshot no es ahorrador → tryAction avisa.
      case 'hacer-principal':  tryAction(() => A.setRol(prm, pid, 'principal')); break;
      // "Quitar" / [✕] vive en Configurar (no en operación) y pide confirmación.
      case 'remove-asistencia':
        if (!root.confirm || root.confirm('¿Quitar al asistente?')) { A.removeAsistencia(prm, pid); if (ui.activaPid === pid) ui.activaPid = null; }
        break;
      case 'toggle-exonerado':  A.toggleCoverExonerado(prm, pid); break;
      // MODELO 3 — Lista viva: el chip (consumido o disponible) usa item-plus/minus directo (changeItem).
      // El disponible 0→1 también es item-plus (ya no hay "add-item" ni picker aparte).
      case 'item-plus':         A.changeItem(prm, pid, b.dataset.prod, +1); marcarApuntando(); break;
      case 'item-minus':        A.changeItem(prm, pid, b.dataset.prod, -1); marcarApuntando(); break;

      // ----- Lista viva: activar/colapsar la persona (UNA a la vez). Tap otra reemplaza (colapsa la anterior). -----
      case 'activar-asis': {
        ui.activaPid = (ui.activaPid === pid) ? null : pid;
        rerender(); return;
      }
      // ----- Auditoría (C2): detalle por evento bajo demanda (lectura; carga quién→email una vez) -----
      case 'toggle-auditoria': {
        ui.auditPid = (ui.auditPid === pid) ? null : pid;
        if (ui.auditPid && root.Api && root.Api.fetchApuntadores && !ui._apuntadoresCargados) {
          ui._apuntadoresCargados = true;
          Promise.resolve(root.Api.fetchApuntadores()).then(m => { ui.apuntadores = m || {}; rerender(); }).catch(() => {});
        }
        rerender(); return;
      }
      // ----- Balance: desglose (derivación) de cada card-acordeón, colapsado por defecto -----
      case 'toggle-balance': {
        const sec = b.dataset.sec;
        if (ui.balance.has(sec)) ui.balance.delete(sec); else ui.balance.add(sec);
        rerender(); return;
      }

      // ----- gestión de productos del evento (en el overlay Configurar) -----
      case 'remove-producto': A.removeProducto(prm, id); break;
      case 'add-producto': {
        const emoji = (document.getElementById('pn-emoji') || {}).value || '';
        const nombre = ((document.getElementById('pn-nombre') || {}).value || '').trim();
        const costoNeto = Number((document.getElementById('pn-costo') || {}).value) || 0;
        const precioVenta = Number((document.getElementById('pn-venta') || {}).value) || 0;
        if (!nombre) { View.toast('Falta el nombre'); return; }
        A.addProducto(prm, { nombre, emoji: emoji || '•', costoNeto, precioVenta });
        View.toast('Producto agregado');
        break;
      }

      // ----- pago BINARIO (válido AUNQUE la primada esté cerrada: los pagos llegan después) -----
      // "Pagar" abre la hoja con la llave Bre-B del principal; "Ya pagué" marca pagado; "Deshacer" revierte.
      case 'open-pagar':    ui.overlay = 'pagar'; ui.pagarPid = pid; rerender(); return;
      case 'marcar-pagado': {
        A.setPagado(prm, pid, true); ui.overlay = null; ui.pagarPid = null;
        const nom = (Store.select.persona(pid) || {}).nombre || 'Pago';   // confirmación VISIBLE: saldó su cuenta
        View.toast('✓ ' + nom + ' saldado', 'ok'); rerender(); return;
      }
      case 'set-no-pagado': A.setPagado(prm, pid, false); break;
      case 'copiar-llave': {
        const llave = b.dataset.llave || '';
        const ok = () => View.toast('Llave copiada');
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(llave).then(ok).catch(function () { View.toast(llave); });
          else View.toast(llave);
        } catch (e) { View.toast(llave); }
        return;
      }

      // ----- pantallas del engranaje (Personas / Ajustes) -----
      case 'open-personas':  ui.overlay = 'personas'; rerender(); return;
      case 'open-ajustes':   ui.overlay = 'ajustes';  rerender(); return;
      case 'overlay-tab':    ui.overlay = b.dataset.overlay; rerender(); return;
      case 'close-overlay':  ui.overlay = null;       rerender(); return;
      // Fila de persona: expandir/colapsar para editar inline (multiabierto).
      case 'toggle-persona': {
        if (ui.personasAbiertas.has(pid)) ui.personasAbiertas.delete(pid); else ui.personasAbiertas.add(pid);
        rerender(); return;
      }
      // Configurar: fila-acordeón de PRODUCTO (clon de la fila de Persona, multiabierto). Los asistentes
      // ya no son acordeón (lista compacta) → no hay toggle-cfg-asis.
      case 'toggle-cfg-prod': {
        if (ui.configProd.has(id)) ui.configProd.delete(id); else ui.configProd.add(id);
        rerender(); return;
      }
      case 'open-nueva-persona': ui.nuevaPersona = true; rerender(); return;
      case 'add-persona': {
        const n = document.getElementById('np-nombre');
        const es = document.getElementById('np-estado');
        const nombre = (n && n.value || '').trim();
        if (!nombre) { View.toast('Falta el nombre'); return; }
        A.addPersona({ nombre, estado: es ? es.value : 'ahorrador' });
        View.toast('Persona agregada');
        break;   // el form queda abierto (nuevaPersona) para sumar varias
      }
      // INVARIANTE #1: solo cambia el estado VIGENTE; NUNCA toca estadoEnEseMomento de asistencias pasadas.
      case 'set-estado-persona': A.setEstadoPersona(pid, b.dataset.estado); break;
      default: break;
    }
  }

  /* ---------- Cambios de inputs/selects (delegados en document) ---------- */
  function onChange(ev) {
    // Wizard: cambiar el principal refresca la lista de co-organizadores (excluye al elegido).
    if (ui.wizard && ev.target && ev.target.id === 'wz-principal') {
      ui.wizard.principalId = ev.target.value;
      ui.wizard.coorg = ui.wizard.coorg.filter(id => id !== ev.target.value);
      rerender(); return;
    }
    const t = ev.target.closest('[data-ch]'); if (!t) return;
    // Todo data-ch es EDICIÓN (escritura): sin sesión, abre el login en vez de aplicar (gate invertido).
    if (backendOn() && !sesionActiva) { pedirLogin(); return; }
    const ch = t.dataset.ch;
    const pid = t.dataset.pid;
    const id  = t.dataset.id;
    const v   = t.value;
    const prm = activeId();
    const A = Store.actions;

    switch (ch) {
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

  // Autosugerencia de emoji EN VIVO (Punto 1 del lote visual). Al teclear el NOMBRE de un producto,
  // rellena el emoji HERMANO si aún es "auto" (data-auto !== '0'). Si el usuario edita el emoji a mano,
  // lo marca manual. Escribe DIRECTO el value del input hermano → NO re-renderiza (no pierde foco),
  // igual de seguro que commitQuiet. wzSync/add-producto leen ese value del DOM al confirmar.
  function onInput(ev) {
    const t = ev.target; if (!t || !t.dataset) return;
    const esNombre = t.id === 'pn-nombre' || t.dataset.wz === 'nombre';
    if (esNombre) {
      const emojiEl = (t.id === 'pn-nombre')
        ? document.getElementById('pn-emoji')
        : (t.closest('.prod-id') && t.closest('.prod-id').querySelector('[data-wz="emoji"]'));
      if (emojiEl && emojiEl.dataset.auto !== '0' && Util.emojiSugerido) {
        const sug = Util.emojiSugerido(t.value, '');
        if (sug) emojiEl.value = sug;
      }
      return;
    }
    if (t.id === 'pn-emoji' || t.dataset.wz === 'emoji') {
      t.dataset.auto = '0';   // el usuario fijó el emoji a mano → deja de autosugerirse
      // Wizard: persistir el "manual" en el modelo para que SOBREVIVA al re-render (si no, al volver
      // de un paso el emoji volvería a auto y el nombre lo pisaría).
      if (t.dataset.wz === 'emoji' && ui.wizard) {
        const i = Number(t.dataset.i);
        if (ui.wizard.productos[i]) ui.wizard.productos[i].emojiManual = true;
      }
    }
  }

  function init() {
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
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
    if (View.renderAuthButton) View.renderAuthButton(Auth && Auth.enabled() ? (sesionActiva ? 'in' : 'out') : 'placeholder');
    rerender();                                // "Cargando…" mientras hidrata
    await Store.load();                        // hidrata el AppState desde Api (async)
    fijarCaraPorEstado();                      // cara inicial por estado de la primada activa cargada
    rerender();
  }

  // Auth OPT-IN (no gate): la app SIEMPRE entra; el login se abre desde el ícono de perfil.
  // Con sesión, los datos vienen de Supabase; sin sesión, lo que el backend permita (RLS). Al cambiar
  // Carga el email de la sesión (presencia). Al obtenerlo, re-render → re-suscribe la presencia con el nombre real.
  function cargarMiEmail() {
    if (!(Auth && Auth.getUser)) return;
    if (!sesionActiva) { miEmail = null; return; }
    Promise.resolve(Auth.getUser()).then(u => { const nuevo = u && u.email; if (nuevo !== miEmail) { miEmail = nuevo; rerender(); } }).catch(() => {});
  }

  // la sesión (login/logout, o al volver del magic link) se recargan los datos y se actualiza el ícono.
  async function gate() {
    if (Auth && Auth.enabled()) {
      Auth.cleanUrl();                         // limpia el token del magic link de la URL
      // GATE INVERTIDO (decisión #5): modo 'supabase' SIEMPRE que haya client → lectura anon para
      // cualquiera con el link. La sesión NO cambia la fuente de datos, solo HABILITA la escritura
      // (RLS rechaza al anon). Al iniciar/cerrar sesión recargamos (para traer/soltar lo que RLS permita).
      if (root.Api && root.Api.setMode) root.Api.setMode('supabase');
      Auth.onChange((session) => {
        sesionActiva = !!session;
        cargarMiEmail();                        // para la presencia ("quién está apuntando")
        if (View.renderAuthButton) View.renderAuthButton(sesionActiva ? 'in' : 'out');
        if (ui.overlay === 'login' && sesionActiva) ui.overlay = null;   // cerrar la hoja al iniciar sesión
        appIniciada = false; iniciarApp();     // recargar (la escritura recién habilitada puede traer más)
      });
      const session = await Auth.getSession();
      sesionActiva = !!session;
      cargarMiEmail();
    }
    await iniciarApp();                         // entra directo en LECTURA (login solo al editar)
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
