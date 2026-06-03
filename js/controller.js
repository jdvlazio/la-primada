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
      });
    }
    if (w.paso === 3) { const f = val('wz-fecha'), m = val('wz-mes'); if (f !== undefined) w.fecha = f; if (m !== undefined) w.mesContable = m; }
  }

  // ui = estado EFÍMERO (no dominio, no se persiste):
  // - abiertos: Set de personaId con tarjeta-acordeón de asistente expandida (multiabierto)
  // - pickProd: personaId con el chip-picker "+ Agregar" abierto (uno a la vez)
  // - personasAbiertas: Set de personaId con la fila de persona expandida (edición inline)
  // - nuevaPersona: form "Agregar persona" desplegado al pie del overlay Personas
  // - overlay 'add-asis': hoja simple para agregar asistentes del directorio
  // - configAsis / configProd: Sets de filas-acordeón expandidas en el overlay Configurar
  //   (mismo patrón que personasAbiertas; clon del componente de Personas)
  const ui = { tab: 'primadas', overlay: null, abiertos: new Set(), pickProd: null, wizard: null,
               personasAbiertas: new Set(), nuevaPersona: false,
               configAsis: new Set(), configProd: new Set(), pagarPid: null,
               resumen: new Set(),
               loginEstado: 'form', loginEmail: '' };
  let sesionActiva = false;   // hay sesión Supabase (el login es opt-in: no bloquea al entrar)

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
        if (!/^\d{4,8}$/.test(code)) { View.toast('Código no válido'); return; }
        b.disabled = true;
        Promise.resolve(Auth && Auth.verifyOtp(ui.loginEmail, code))
          .then(() => { View.toast('Sesión iniciada'); /* onChange cierra y recarga */ })
          .catch((err) => { b.disabled = false; View.toast(err && err.message ? err.message : 'Código inválido o vencido'); });
        return;
      }
      case 'login-reset': ui.loginEstado = 'form'; rerender(); return;

      // ----- selector de primada (navegación: abre la hoja agrupada por año→mes) -----
      case 'open-selector': ui.overlay = 'selector-primada'; rerender(); return;

      // ----- wizard "Nueva primada" (3 pasos, estado efímero en ui.wizard) -----
      case 'new-primada':   ui.wizard = nuevoWizard(); rerender(); return;
      case 'wz-cancelar':   ui.wizard = null; rerender(); return;
      case 'wz-atras':      if (ui.wizard && ui.wizard.paso > 1) ui.wizard.paso--; rerender(); return;
      case 'wz-toggle-coorg': {
        const w = ui.wizard; if (!w) return;
        const i = w.coorg.indexOf(pid);
        if (i >= 0) w.coorg.splice(i, 1); else w.coorg.push(pid);
        rerender(); return;
      }
      case 'wz-prod-add':    if (ui.wizard) ui.wizard.productos.push({ emoji: '', nombre: '', costoNeto: 0, precioVenta: 0 }); rerender(); return;
      case 'wz-prod-remove': if (ui.wizard) ui.wizard.productos.splice(Number(b.dataset.i), 1); rerender(); return;
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
          ui.wizard = null;
          A.seleccionarPrimada(id);
          View.toast('Primada creada');
        } catch (err) { View.toast(err && err.message ? err.message : 'No se pudo crear'); }
        return;
      }
      // Elegir una primada desde la hoja del selector: activa y cierra la hoja.
      case 'select-primada':   A.seleccionarPrimada(id); ui.overlay = null; rerender(); return;
      // Config de la primada (escondida tras el engranaje de la cabecera).
      case 'open-config-primada': ui.overlay = 'config-primada'; rerender(); return;
      // Acciones destructivas: con confirmación (la cuenta cerrada congela consumos).
      case 'cerrar-primada':
        if (!root.confirm || root.confirm('¿Cerrar la cuenta?')) {
          A.cerrarPrimada(id); View.toast('Cuenta cerrada');
        }
        break;
      case 'reabrir-primada':  A.reabrirPrimada(id); View.toast('Cuenta reabierta'); break;
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
      // "Quitar" vive en Configurar (no en operación) y pide confirmación.
      case 'remove-asistencia':
        if (!root.confirm || root.confirm('¿Quitar al asistente?')) { A.removeAsistencia(prm, pid); ui.abiertos.delete(pid); }
        break;
      case 'toggle-exonerado':  A.toggleCoverExonerado(prm, pid); break;
      case 'item-plus':         A.changeItem(prm, pid, b.dataset.prod, +1); break;
      case 'item-minus':        A.changeItem(prm, pid, b.dataset.prod, -1); break;

      // ----- acordeón de asistencias (estado efímero de UI) -----
      case 'toggle-asis': {
        if (ui.abiertos.has(pid)) { ui.abiertos.delete(pid); if (ui.pickProd === pid) ui.pickProd = null; }
        else ui.abiertos.add(pid);
        rerender(); return;
      }
      // ----- Resumen: cards-acordeón colapsadas por defecto -----
      case 'toggle-resumen': {
        const sec = b.dataset.sec;
        if (ui.resumen.has(sec)) ui.resumen.delete(sec); else ui.resumen.add(sec);
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
      case 'marcar-pagado': A.setPagado(prm, pid, true); ui.overlay = null; ui.pagarPid = null; View.toast('Marcado como pagado'); rerender(); return;
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
      // Configurar: fila-acordeón de asistente / producto (clon de la fila de Persona, multiabierto).
      case 'toggle-cfg-asis': {
        if (ui.configAsis.has(pid)) ui.configAsis.delete(pid); else ui.configAsis.add(pid);
        rerender(); return;
      }
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
    if (t.id === 'pn-emoji' || t.dataset.wz === 'emoji') { t.dataset.auto = '0'; }
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
    rerender();
  }

  // Auth OPT-IN (no gate): la app SIEMPRE entra; el login se abre desde el ícono de perfil.
  // Con sesión, los datos vienen de Supabase; sin sesión, lo que el backend permita (RLS). Al cambiar
  // la sesión (login/logout, o al volver del magic link) se recargan los datos y se actualiza el ícono.
  async function gate() {
    if (Auth && Auth.enabled()) {
      Auth.cleanUrl();                         // limpia el token del magic link de la URL
      Auth.onChange((session) => {
        sesionActiva = !!session;
        if (root.Api && root.Api.setMode) root.Api.setMode(sesionActiva ? 'supabase' : 'local');
        if (View.renderAuthButton) View.renderAuthButton(sesionActiva ? 'in' : 'out');
        if (ui.overlay === 'login' && sesionActiva) ui.overlay = null;   // cerrar la hoja al iniciar sesión
        appIniciada = false; iniciarApp();     // recargar datos de la fuente correcta
      });
      const session = await Auth.getSession();
      sesionActiva = !!session;
      // Datos LOCALES hasta que haya sesión (el client sigue vivo para el login opt-in).
      if (root.Api && root.Api.setMode) root.Api.setMode(sesionActiva ? 'supabase' : 'local');
    }
    await iniciarApp();                         // entra directo (login opt-in, no bloquea)
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
